import { Schema, model } from 'mongoose';
import { ORDER_STATUSES } from '../domain/orderStatus';
import { cleanJson } from './cleanJson';

// Name and price are copied into the order, so later catalogue edits never change history.
const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    unitPriceCents: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const historySchema = new Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: {
      type: [orderItemSchema],
      validate: { validator: (v: unknown[]) => v.length > 0, message: 'An order needs items' },
    },
    totalCents: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    idempotencyKey: { type: String },
    statusHistory: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });
// A client retrying the same request (same key) can never create a second order.
orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

cleanJson(orderSchema);

export const Order = model('Order', orderSchema);
