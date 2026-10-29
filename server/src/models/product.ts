import { Schema, model } from 'mongoose';
import { cleanJson } from './cleanJson';

const isInteger = {
  validator: (value: number) => Number.isInteger(value),
  message: '{PATH} must be a whole number',
};

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    category: { type: String, required: true, trim: true, index: true },
    // Money is stored in the smallest currency unit (paise/cents) to avoid float errors.
    priceCents: { type: Number, required: true, min: 0, validate: isInteger },
    stock: { type: Number, required: true, min: 0, default: 0, validate: isInteger },
    imageUrl: { type: String, default: '' },
    // Products are soft-deleted so past orders keep a valid reference.
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

productSchema.index({ name: 1 });
cleanJson(productSchema);

export const Product = model('Product', productSchema);
