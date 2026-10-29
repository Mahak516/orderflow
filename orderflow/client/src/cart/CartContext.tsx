import { ReactNode, createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { CartAction, CartItem, cartCount, cartReducer, cartTotalCents } from './cartReducer';

interface CartState {
  items: CartItem[];
  count: number;
  totalCents: number;
  dispatch: (action: CartAction) => void;
}

const STORAGE_KEY = 'orderflow.cart';
const CartContext = createContext<CartState | null>(null);

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, dispatch] = useReducer(cartReducer, undefined, loadCart);

  // The cart survives a page refresh. (The server still re-checks prices and stock at checkout.)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage can be unavailable (private mode); the cart then simply lives in memory.
    }
  }, [items]);

  const value = useMemo(
    () => ({ items, count: cartCount(items), totalCents: cartTotalCents(items), dispatch }),
    [items],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
