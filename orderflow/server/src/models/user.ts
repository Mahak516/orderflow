import { Schema, model } from 'mongoose';
import { cleanJson } from './cleanJson';

export const ROLES = ['customer', 'admin'] as const;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // `select: false` keeps the hash out of every query unless explicitly requested.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'customer' },
  },
  { timestamps: true },
);

cleanJson(userSchema);

export const User = model('User', userSchema);
