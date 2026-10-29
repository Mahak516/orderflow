import { useCallback, useEffect, useState } from 'react';
import { errorMessage, http } from '../api/http';
import { NEXT_STATUSES, ORDER_STATUSES, type Order, type OrderStatus, type Page } from '../api/types';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toasts';
import { useRealtimeEvent } from '../realtime/RealtimeContext';
import { formatDate, formatMoney } from '../utils/money';

export function AdminOrders() {
  const { notify } = useToast();
  const [data, setData] = useState<Page<Order> | null>(null);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await http.get<Page<Order>>('/orders', { params: { all: 'true', status: status || undefined, page, limit: 10 } });
      setData(res.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load orders'));
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeEvent<Order>('order:created', () => {
    notify('New order received', 'info');
    void load();
  });
  useRealtimeEvent<Order>('order:updated', () => void load());

  async function move(order: Order, next: OrderStatus) {
    try {
      await http.patch(`/orders/${order.id}/status`, { status: next });
      await load();
    } catch (err) {
      notify(errorMessage(err), 'error');
      await load();
    }
  }

  return (
    <>
      <h1>Manage orders</h1>
      <div className="filters">
        <select value={status} onChange={(e) => { setStatus(e.target.value as OrderStatus | ''); setPage(1); }} aria-label="Filter by status">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card">
        <table className="table">
          <thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Total</th><th>Status</th><th>Move to</th></tr></thead>
          <tbody>
            {data?.items.map((order) => (
              <tr key={order.id}>
                <td>…{order.id.slice(-6)}</td>
                <td>{typeof order.user === 'string' ? order.user : order.user.name}</td>
                <td>{formatDate(order.createdAt)}</td>
                <td>{formatMoney(order.totalCents)}</td>
                <td><StatusBadge status={order.status} /></td>
                <td>
                  {NEXT_STATUSES[order.status].length === 0 ? <span className="muted small">final</span> : (
                    <div className="actions">
                      {NEXT_STATUSES[order.status].map((next) => (
                        <button key={next} className="btn" onClick={() => move(order, next)}>{next}</button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && <p className="muted">No orders.</p>}
      </div>
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </>
  );
}
