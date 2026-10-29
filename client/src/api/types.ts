export type Role = 'customer' | 'admin';

export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Mirrors the server's state machine so the UI only offers moves the API will accept. */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  stock: number;
  imageUrl: string;
  active: boolean;
}

export interface OrderItem {
  product: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
}

export interface Order {
  id: string;
  // A plain id for the customer's own orders, or { id, name, email } when an admin lists all.
  user: string | { id: string; name: string; email: string };
  items: OrderItem[];
  totalCents: number;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuthResult {
  user: User;
  accessToken: string;
}

export interface Summary {
  days: number;
  totals: { revenueCents: number; orders: number; averageOrderCents: number; customers: number };
  revenueByDay: { date: string; revenueCents: number; orders: number }[];
  ordersByStatus: { status: OrderStatus; count: number }[];
  topProducts: { productId: string; name: string; units: number; revenueCents: number }[];
  lowStock: { id: string; name: string; stock: number; category: string }[];
}
