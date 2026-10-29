import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';
import { ChatAssistant } from './ChatAssistant';

export function Layout() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <NavLink to="/" className="brand">
            Order<span>Flow</span>
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>
              Shop
            </NavLink>
            {user && <NavLink to="/orders">My orders</NavLink>}
            {user?.role === 'admin' && (
              <>
                <NavLink to="/admin/dashboard">Dashboard</NavLink>
                <NavLink to="/admin/orders">Manage orders</NavLink>
                <NavLink to="/admin/products">Manage products</NavLink>
              </>
            )}
          </nav>
          <div className="nav nav-right">
            <NavLink to="/cart">Cart{count > 0 && <span className="pill">{count}</span>}</NavLink>
            {user ? (
              <>
                <span className="muted small">{user.name}</span>
                <button className="btn btn-ghost" onClick={handleLogout}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login">Log in</NavLink>
                <NavLink to="/register" className="btn btn-primary">
                  Sign up
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
      <ChatAssistant />
    </>
  );
}
