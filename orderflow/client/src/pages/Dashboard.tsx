import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { errorMessage, http } from '../api/http';
import type { Summary } from '../api/types';
import { useRealtimeEvent } from '../realtime/RealtimeContext';
import { formatMoney } from '../utils/money';

export function Dashboard() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await http.get<Summary>('/analytics/summary', { params: { days } });
      setSummary(res.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load analytics'));
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live: refresh the numbers whenever an order is created or changes.
  useRealtimeEvent('order:created', () => void load());
  useRealtimeEvent('order:updated', () => void load());

  return (
    <>
      <div className="row">
        <h1>Dashboard</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time range">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!summary ? <p className="muted">Loading…</p> : (
        <>
          <div className="stats">
            <div className="card stat"><span className="muted small">Revenue</span><strong>{formatMoney(summary.totals.revenueCents)}</strong></div>
            <div className="card stat"><span className="muted small">Orders</span><strong>{summary.totals.orders}</strong></div>
            <div className="card stat"><span className="muted small">Avg. order</span><strong>{formatMoney(summary.totals.averageOrderCents)}</strong></div>
            <div className="card stat"><span className="muted small">Customers</span><strong>{summary.totals.customers}</strong></div>
          </div>

          <div className="card">
            <h2>Revenue per day</h2>
            <div className="chart">
              <ResponsiveContainer>
                <LineChart data={summary.revenueByDay.map((d) => ({ ...d, revenue: d.revenueCents / 100 }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Revenue']} />
                  <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="two-col">
            <div className="card">
              <h2>Orders by status</h2>
              <div className="chart small-chart">
                <ResponsiveContainer>
                  <BarChart data={summary.ordersByStatus}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="status" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#4f46e5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <h2>Top products</h2>
              <table className="table">
                <thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead>
                <tbody>
                  {summary.topProducts.map((p) => (
                    <tr key={p.productId}><td>{p.name}</td><td>{p.units}</td><td>{formatMoney(p.revenueCents)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Low stock</h2>
            {summary.lowStock.length === 0 ? <p className="muted">Everything is well stocked.</p> : (
              <table className="table">
                <thead><tr><th>Product</th><th>Category</th><th>Stock</th></tr></thead>
                <tbody>
                  {summary.lowStock.map((p) => (
                    <tr key={p.id}><td>{p.name}</td><td>{p.category}</td><td className="warn">{p.stock}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
