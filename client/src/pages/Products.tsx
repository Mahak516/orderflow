import { useEffect, useState } from 'react';
import { errorMessage, http } from '../api/http';
import type { Page, Product } from '../api/types';
import { useCart } from '../cart/CartContext';
import { Pagination } from '../components/Pagination';
import { ProductImage } from '../components/ProductImage';
import { useToast } from '../components/Toasts';
import { formatMoney } from '../utils/money';

export function Products() {
  const { dispatch, items: cartItems } = useCart();
  const { notify } = useToast();
  const [data, setData] = useState<Page<Product> | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [inStock, setInStock] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Wait until the user stops typing before calling the API.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    http.get<{ categories: string[] }>('/products/categories').then((res) => setCategories(res.data.categories)).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    http
      .get<Page<Product>>('/products', {
        params: { q: debounced || undefined, category: category || undefined, sort, inStock: inStock ? 'true' : undefined, page, limit: 12 },
      })
      .then((res) => {
        if (!active) return;
        setData(res.data);
        setError('');
      })
      .catch((err) => active && setError(errorMessage(err, 'Could not load products')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [debounced, category, sort, inStock, page]);

  function add(product: Product) {
    dispatch({ type: 'add', product });
    notify(`${product.name} added to cart`, 'success');
  }

  return (
    <>
      <h1>Shop</h1>
      <div className="filters">
        <input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort">
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="name">Name</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={inStock} onChange={(e) => { setInStock(e.target.checked); setPage(1); }} /> In stock only
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {loading && !data && <p className="muted">Loading…</p>}
      {data && data.items.length === 0 && <p className="muted">No products match your filters.</p>}

      <div className="grid">
        {data?.items.map((product) => {
          const inCart = cartItems.find((i) => i.productId === product.id)?.quantity ?? 0;
          const soldOut = product.stock <= 0;
          return (
            <article key={product.id} className="card product">
              <ProductImage src={product.imageUrl} name={product.name} />
              <span className="muted small">{product.category}</span>
              <h3>{product.name}</h3>
              <p className="muted small clamp">{product.description}</p>
              <div className="row">
                <strong>{formatMoney(product.priceCents)}</strong>
                <span className={soldOut ? 'danger small' : product.stock <= 5 ? 'warn small' : 'muted small'}>
                  {soldOut ? 'Sold out' : product.stock <= 5 ? `Only ${product.stock} left` : `${product.stock} in stock`}
                </span>
              </div>
              <button className="btn btn-primary" disabled={soldOut || inCart >= Math.min(product.stock, 20)} onClick={() => add(product)}>
                {soldOut ? 'Sold out' : inCart ? `Add another (${inCart} in cart)` : 'Add to cart'}
              </button>
            </article>
          );
        })}
      </div>
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </>
  );
}
