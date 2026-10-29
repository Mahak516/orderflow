import { OrderStatus, canTransition } from '../domain/orderStatus';
import { Order } from '../models/order';
import { Product } from '../models/product';
import { HttpError } from '../utils/httpError';

export interface OrderLine {
  productId: string;
  quantity: number;
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/** Combine repeated products into a single line so stock is reserved once per product. */
function mergeLines(lines: OrderLine[]): OrderLine[] {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  }
  return Array.from(quantities, ([productId, quantity]) => ({ productId, quantity }));
}

/** Give reserved stock back (used when an order fails part-way or is cancelled). */
export async function releaseStock(lines: OrderLine[]): Promise<void> {
  await Promise.all(
    lines.map((line) => Product.updateOne({ _id: line.productId }, { $inc: { stock: line.quantity } })),
  );
}

/**
 * Place an order without overselling.
 *
 * Stock is reserved with ONE atomic update per product: "decrement stock, but only if
 * enough is left". MongoDB guarantees this is race-free, so two shoppers can never buy
 * the last item. If any line fails, every earlier reservation is rolled back. This works
 * on a standalone MongoDB; no multi-document transaction (replica set) is required.
 *
 * Prices are read from the database at reservation time; the client never sends a price.
 * An optional idempotency key makes retries safe: the same key returns the same order.
 */
export async function placeOrder(userId: string, lines: OrderLine[], idempotencyKey?: string) {
  if (idempotencyKey) {
    const existing = await Order.findOne({ user: userId, idempotencyKey });
    if (existing) return { order: existing, created: false };
  }

  const reserved: OrderLine[] = [];
  const items: { product: unknown; name: string; unitPriceCents: number; quantity: number }[] = [];

  try {
    for (const line of mergeLines(lines)) {
      const product = await Product.findOneAndUpdate(
        { _id: line.productId, active: true, stock: { $gte: line.quantity } },
        { $inc: { stock: -line.quantity } },
        { new: true },
      );

      if (!product) {
        const current = await Product.findById(line.productId);
        if (!current || !current.active) {
          throw new HttpError(404, `Product ${line.productId} is not available`);
        }
        throw new HttpError(409, `Not enough stock for "${current.name}" (available: ${current.stock})`);
      }

      reserved.push(line);
      items.push({
        product: product._id,
        name: product.name,
        unitPriceCents: product.priceCents,
        quantity: line.quantity,
      });
    }

    const totalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    const order = await Order.create({
      user: userId,
      items,
      totalCents,
      status: 'pending',
      idempotencyKey,
      statusHistory: [{ status: 'pending', by: userId }],
    });
    return { order, created: true };
  } catch (err) {
    await releaseStock(reserved);

    // Two identical requests raced: the other one won, so return its order.
    if (idempotencyKey && isDuplicateKeyError(err)) {
      const existing = await Order.findOne({ user: userId, idempotencyKey });
      if (existing) return { order: existing, created: false };
    }
    throw err;
  }
}

/**
 * Move an order to a new status.
 * The update is conditional on the status we just read ("compare and swap"), so two
 * concurrent requests cannot both succeed, and a cancellation can only return stock once.
 */
export async function changeStatus(orderId: string, to: OrderStatus, actorId: string) {
  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, 'Order not found');

  const from = order.status as OrderStatus;
  if (!canTransition(from, to)) {
    throw new HttpError(409, `Cannot change an order from "${from}" to "${to}"`);
  }

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: from },
    { $set: { status: to }, $push: { statusHistory: { status: to, at: new Date(), by: actorId } } },
    { new: true },
  );
  if (!updated) throw new HttpError(409, 'The order was changed by someone else. Reload and try again.');

  if (to === 'cancelled') {
    await releaseStock(
      updated.items.map((item) => ({ productId: String(item.product), quantity: item.quantity })),
    );
  }
  return updated;
}
