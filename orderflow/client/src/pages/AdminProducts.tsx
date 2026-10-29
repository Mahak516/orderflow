import { FormEvent, useCallback, useEffect, useState } from 'react';
import { errorMessage, http } from '../api/http';
import type { Page, Product } from '../api/types';
import { Pagination } from '../components/Pagination';
import { useToast } from '../components/Toasts';
import { formatMoney } from '../utils/money';

interface Draft {
  id?: string;
  name: string;
  description: string;
  category: string;
  price: string; // rupees as typed by the admin; converted to integer paise on save
  stock: string;
  imageUrl: string;
}

const EMPTY: Draft = { name: '', description: '', category: '', price: '', stock: '', imageUrl: '' };

export function AdminProducts() {
  const { notify } = useToast();
  const [data, setData] = useState<Page<Product> | null>(null);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await http.get<Page<Product>>('/products', { params: { includeInactive: 'true', sort: 'name', page, limit: 10 } });
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load products'));
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  function edit(product: Product) {
    setDraft({
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      price: (product.priceCents / 100).toFixed(2),
      stock: String(product.stock),
      imageUrl: product.imageUrl,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const body = {
      name: draft.name,
      description: draft.description,
      category: draft.category,
      priceCents: Math.round(Number(draft.price) * 100),
      stock: Number(draft.stock),
      imageUrl: draft.imageUrl,
    };
    try {
      if (draft.id) await http.patch(`/products/${draft.id}`, body);
      else await http.post('/products', body);
      notify('Product saved', 'success');
      setDraft(null);
      await load();
    } catch (err) {
      notify(errorMessage(err), 'error');
    }
  }

  async function toggle(product: Product) {
    try {
      if (product.active) await http.delete(`/products/${product.id}`);
      else await http.patch(`/products/${product.id}`, { active: true });
      await load();
    } catch (err) {
      notify(errorMessage(err), 'error');
    }
  }

  const set = (key: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d));

  return (
    <>
      <div className="row">
        <h1>Manage products</h1>
        <button className="btn btn-primary" onClick={() => setDraft(EMPTY)}>New product</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {draft && (
        <form className="card form" onSubmit={save}>
          <h2>{draft.id ? 'Edit product' : 'New product'}</h2>
          <label>Name<input value={draft.name} onChange={set('name')} required /></label>
          <label>Category<input value={draft.category} onChange={set('category')} required /></label>
          <label>Description<textarea value={draft.description} onChange={set('description')} rows={3} /></label>
          <label>Price (₹)<input type="number" min="0" step="0.01" value={draft.price} onChange={set('price')} required /></label>
          <label>Stock<input type="number" min="0" step="1" value={draft.stock} onChange={set('stock')} required /></label>
          <label>Image URL<input value={draft.imageUrl} onChange={set('imageUrl')} /></label>
          <div className="actions">
            <button className="btn btn-primary">Save</button>
            <button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card">
        <table className="table">
          <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.items.map((product) => (
              <tr key={product.id} className={product.active ? '' : 'inactive'}>
                <td>{product.name}</td>
                <td>{product.category}</td>
                <td>{formatMoney(product.priceCents)}</td>
                <td className={product.stock <= 5 ? 'warn' : ''}>{product.stock}</td>
                <td>{product.active ? 'Active' : 'Hidden'}</td>
                <td className="actions">
                  <button className="btn" onClick={() => edit(product)}>Edit</button>
                  <button className="btn btn-ghost" onClick={() => toggle(product)}>{product.active ? 'Hide' : 'Restore'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </>
  );
}
