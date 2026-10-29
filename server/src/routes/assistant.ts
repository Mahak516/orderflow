import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Product } from '../models/product';
import { askAssistant } from '../services/assistantService';
import { asyncHandler } from '../utils/asyncHandler';

// Every call costs money, so limit it per client. Disabled in tests.
const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { error: 'You are asking too quickly, please wait a moment' },
});

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(700) }))
    .min(1)
    .max(10)
    .refine((messages) => messages[messages.length - 1].role === 'user', 'The last message must be from the user'),
});

export const assistantRouter = Router();

// Logged-in users only, so the endpoint cannot be used anonymously to spend the API budget.
assistantRouter.post(
  '/',
  authenticate,
  assistantLimiter,
  validate({ body: bodySchema }),
  asyncHandler(async (req, res) => {
    const { messages } = req.body as z.infer<typeof bodySchema>;
    const { reply, productIds } = await askAssistant(messages);
    const products = await Product.find({ _id: { $in: productIds }, active: true });
    // Keep the model's ordering (best match first).
    const byId = new Map(products.map((product) => [String(product._id), product]));
    res.json({ reply, products: productIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!.toJSON()] : [])) });
  }),
);

/** Lets the UI hide the chat widget when no API key is set. */
export const assistantStatusRouter = Router();
assistantStatusRouter.get('/', (_req, res) => {
  res.json({ enabled: config.assistantProvider !== null });
});
