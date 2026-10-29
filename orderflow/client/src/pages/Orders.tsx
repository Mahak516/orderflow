import { useCallback, useEffect, useState } from 'react';
import { errorMessage, http } from '../api/http';
import type { Order, Page } from '../api/types';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toasts';
import { useRealtimeEvent } from '../realtime/RealtimeContext';
import { formatDate, formatMoney } from '../utils/money';

export function Orders() {
  const { notify } = useToast();
  const [data, setData] = useState<Page<Order> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await http.get<Page<Order>>('/orders', { params: { page, limit: 10 } });
      setData(res.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load orders'));
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  // The server pushes a message when an admin ships/delivers one of my orders.
  useRealtimeEvent<Order>('order:updated', (order) => {
    setData((current) =>
      current ? { ...current, items: current.items.map((o) => (o.id === order.id ? { ...o, ...order } : o)) } : current,
    );
    notify(`Order …${order.id.slice(-6)} is now ${order.status}`, 'info');
  });

  async function act(order: Order, action: 'pay' | 'cancel') {
    try {
      await http.post(`/orders/${order.id}/${action}`);
      await load();
    } catch (err) {
      notify(errorMessage(err), 'error');
    }
  }

  return (
    <>
      <h1>My orders</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {data && data.items.length === 0 && <p className="muted">You have no orders yet.</p>}
      {data?.items.map((order) => (
        <article key={order.id} className="card order">
          <div className="row">
            <div>
              <strong>Order …{order.id.slice(-6)}</strong>
              <div className="muted small">{formatDate(order.createdAt)}</div>
            </div>
            <StatusBadge status={order.status} />
          </div>
          <ul className="lines">
            {order.items.map((item) => (
              <li key={item.product}>
                {item.quantity} × {item.name} <span className="muted">({formatMoney(item.unitPriceCents)})</span>
              </li>
            ))}
          </ul>
          <div className="row">
            <strong>{formatMoney(order.totalCents)}</strong>
            <div className="actions">
              {order.status === 'pending' && (
                <>
                  <button className="btn btn-primary" onClick={() => act(order, 'pay')}>Pay now (simulated)</button>
                  <button className="btn" onClick={() => act(order, 'cancel')}>Cancel</button>
                </>
              )}
            </div>
          </div>
        </article>
      ))}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </>
  );
}
