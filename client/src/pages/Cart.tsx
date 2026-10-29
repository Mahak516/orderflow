import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage, http } from '../api/http';
import type { Order } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';
import { useToast } from '../components/Toasts';
import { formatMoney } from '../utils/money';

export function Cart() {
  const { items, totalCents, dispatch } = useCart();
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One key per checkout attempt: if the request is retried (double click, flaky network)
  // the server returns the SAME order instead of creating a duplicate.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  async function checkout() {
    setBusy(true);
    setError('');
    try {
      await http.post<{ order: Order }>(
        '/orders',
        { items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
        { headers: { 'Idempotency-Key': idempotencyKey.current } },
      );
      dispatch({ type: 'clear' });
      idempotencyKey.current = crypto.randomUUID();
      notify('Order placed!', 'success');
      navigate('/orders');
    } catch (err) {
      setError(errorMessage(err, 'Checkout failed'));
      // A failed attempt (e.g. out of stock) is a different request once the cart changes.
      idempotencyKey.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <>
        <h1>Your cart</h1>
        <p className="muted">Your cart is empty. <Link to="/">Browse products</Link></p>
      </>
    );
  }

  return (
    <>
      <h1>Your cart</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Item</th><th>Price</th><th>Qty</th><th>Subtotal</th><th /></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.productId}>
                <td>{item.name}</td>
                <td>{formatMoney(item.priceCents)}</td>
                <td>
                  <input
                    type="number"
                    className="qty"
                    min={1}
                    max={Math.min(item.stock, 20)}
                    value={item.quantity}
                    aria-label={`Quantity for ${item.name}`}
                    onChange={(e) => dispatch({ type: 'setQuantity', productId: item.productId, quantity: Number(e.target.value) })}
                  />
                </td>
                <td>{formatMoney(item.priceCents * item.quantity)}</td>
                <td><button className="btn btn-ghost" onClick={() => dispatch({ type: 'remove', productId: item.productId })}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row total">
          <strong>Total</strong>
          <strong>{formatMoney(totalCents)}</strong>
        </div>
        {user ? (
          <button className="btn btn-primary" disabled={busy} onClick={checkout}>{busy ? 'Placing order…' : 'Place order'}</button>
        ) : (
          <p className="muted"><Link to="/login" state={{ from: '/cart' }}>Log in</Link> to place your order.</p>
        )}
        <p className="muted small">Prices and stock are re-checked by the server when you place the order.</p>
      </div>
    </>
  );
}
