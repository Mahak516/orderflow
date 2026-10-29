import { describe, expect, it } from 'vitest';
import { CartItem, MAX_PER_LINE, cartCount, cartReducer, cartTotalCents } from './cartReducer';

const keyboard = { id: 'p1', name: 'Keyboard', priceCents: 100000, stock: 5 };
const mouse = { id: 'p2', name: 'Mouse', priceCents: 50000, stock: 2 };

describe('cartReducer', () => {
  it('adds a new product with quantity 1', () => {
    const cart = cartReducer([], { type: 'add', product: keyboard });
    expect(cart).toEqual([{ productId: 'p1', name: 'Keyboard', priceCents: 100000, stock: 5, quantity: 1 }]);
  });

  it('increments an existing product', () => {
    let cart: CartItem[] = [];
    cart = cartReducer(cart, { type: 'add', product: keyboard });
    cart = cartReducer(cart, { type: 'add', product: keyboard });
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
  });

  it('never goes above the available stock', () => {
    let cart: CartItem[] = [];
    for (let i = 0; i < 10; i++) cart = cartReducer(cart, { type: 'add', product: mouse });
    expect(cart[0].quantity).toBe(2);
  });

  it('never goes above the per-line maximum', () => {
    const plenty = { ...keyboard, stock: 500 };
    let cart: CartItem[] = [];
    for (let i = 0; i < MAX_PER_LINE + 5; i++) cart = cartReducer(cart, { type: 'add', product: plenty });
    expect(cart[0].quantity).toBe(MAX_PER_LINE);
  });

  it('ignores out-of-stock products', () => {
    expect(cartReducer([], { type: 'add', product: { ...keyboard, stock: 0 } })).toEqual([]);
  });

  it('sets a quantity within limits and removes the line at zero', () => {
    let cart = cartReducer([], { type: 'add', product: keyboard });
    cart = cartReducer(cart, { type: 'setQuantity', productId: 'p1', quantity: 99 });
    expect(cart[0].quantity).toBe(5);
    cart = cartReducer(cart, { type: 'setQuantity', productId: 'p1', quantity: 0 });
    expect(cart).toEqual([]);
  });

  it('removes and clears', () => {
    let cart = cartReducer([], { type: 'add', product: keyboard });
    cart = cartReducer(cart, { type: 'add', product: mouse });
    expect(cartReducer(cart, { type: 'remove', productId: 'p1' }).map((i) => i.productId)).toEqual(['p2']);
    expect(cartReducer(cart, { type: 'clear' })).toEqual([]);
  });

  it('computes totals', () => {
    let cart = cartReducer([], { type: 'add', product: keyboard });
    cart = cartReducer(cart, { type: 'add', product: keyboard });
    cart = cartReducer(cart, { type: 'add', product: mouse });
    expect(cartCount(cart)).toBe(3);
    expect(cartTotalCents(cart)).toBe(250000);
  });
});
