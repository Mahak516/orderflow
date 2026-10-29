import { Router } from 'express';
import { z } from 'zod';
import { authenticate, optionalAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Product } from '../models/product';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../utils/httpError';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

const productBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  category: z.string().trim().min(1).max(60),
  priceCents: z.number().int().min(0),
  stock: z.number().int().min(0),
  imageUrl: z.string().trim().max(500).default(''),
  active: z.boolean().default(true),
});

const SORTS = {
  newest: { createdAt: -1 },
  price_asc: { priceCents: 1 },
  price_desc: { priceCents: -1 },
  name: { name: 1 },
} as const;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const productsRouter = Router();

productsRouter.get(
  '/',
  optionalAuth,
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listQuery>;
    const isAdmin = req.user?.role === 'admin';

    if (query.includeInactive === 'true' && !isAdmin) {
      throw new HttpError(403, 'Only admins can list inactive products');
    }

    const filter: Record<string, unknown> = {};
    if (query.includeInactive !== 'true') filter.active = true;
    if (query.category) filter.category = query.category;
    if (query.q) filter.name = { $regex: escapeRegex(query.q), $options: 'i' };
    if (query.inStock === 'true') filter.stock = { $gt: 0 };
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter.priceCents = {
        ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
      };
    }

    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort(SORTS[query.sort])
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      Product.countDocuments(filter),
    ]);

    res.json({
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    });
  }),
);

productsRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = (await Product.distinct('category', { active: true })) as string[];
    res.json({ categories: categories.sort() });
  }),
);

productsRouter.get(
  '/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product || !product.active) throw new HttpError(404, 'Product not found');
    res.json({ product });
  }),
);

productsRouter.post(
  '/',
  authenticate,
  requireRole('admin'),
  validate({ body: productBody }),
  asyncHandler(async (req, res) => {
    const product = await Product.create(req.body);
    res.status(201).json({ product });
  }),
);

productsRouter.patch(
  '/:id',
  authenticate,
  requireRole('admin'),
  validate({ params: z.object({ id: objectId }), body: productBody.partial() }),
  asyncHandler(async (req, res) => {
    const product = await Product.findByIdAndUpdate(req.params.id, { $set: req.body }, {
      new: true,
      runValidators: true,
    });
    if (!product) throw new HttpError(404, 'Product not found');
    res.json({ product });
  }),
);

// Soft delete: the product disappears from the shop but old orders still reference it.
productsRouter.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const product = await Product.findByIdAndUpdate(req.params.id, { $set: { active: false } }, { new: true });
    if (!product) throw new HttpError(404, 'Product not found');
    res.status(204).end();
  }),
);
