import type { Product } from '../api/types';

export const MAX_PER_LINE = 20;

export interface CartItem {
  productId: string;
  name: string;
  priceCents: number;
  stock: number;
  quantity: number;
}

export type CartAction =
  | { type: 'add'; product: Pick<Product, 'id' | 'name' | 'priceCents' | 'stock'> }
  | { type: 'setQuantity'; productId: string; quantity: number }
  | { type: 'remove'; productId: string }
  | { type: 'clear' };

function limitFor(item: Pick<CartItem, 'stock'>): number {
  return Math.max(0, Math.min(item.stock, MAX_PER_LINE));
}

/** Pure state transitions, so the cart rules are easy to test without React. */
export function cartReducer(items: CartItem[], action: CartAction): CartItem[] {
  switch (action.type) {
    case 'add': {
      const { product } = action;
      if (product.stock <= 0) return items;
      const existing = items.find((item) => item.productId === product.id);
      if (existing) {
        return items.map((item) =>
          item.productId === product.id
            ? { ...item, stock: product.stock, quantity: Math.min(item.quantity + 1, limitFor({ stock: product.stock })) }
            : item,
        );
      }
      return [
        ...items,
        { productId: product.id, name: product.name, priceCents: product.priceCents, stock: product.stock, quantity: 1 },
      ];
    }
    case 'setQuantity': {
      return items
        .map((item) =>
          item.productId === action.productId
            ? { ...item, quantity: Math.min(Math.max(0, Math.floor(action.quantity)), limitFor(item)) }
            : item,
        )
        .filter((item) => item.quantity > 0);
    }
    case 'remove':
      return items.filter((item) => item.productId !== action.productId);
    case 'clear':
      return [];
    default:
      return items;
  }
}

export function cartTotalCents(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
