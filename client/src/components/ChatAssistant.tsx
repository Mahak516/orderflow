import { FormEvent, useEffect, useRef, useState } from 'react';
import { errorMessage, http } from '../api/http';
import type { Product } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';
import { formatMoney } from '../utils/money';
import { ProductImage } from './ProductImage';
import { useToast } from './Toasts';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  products?: Product[];
}

/** Floating shopping assistant. Only appears for logged-in users when the server has an API key. */
export function ChatAssistant() {
  const { user } = useAuth();
  const { dispatch } = useCart();
  const { notify } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    http.get<{ enabled: boolean }>('/assistant/status').then((res) => setEnabled(res.data.enabled)).catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, busy]);

  // A different person logging in must not see the previous conversation.
  useEffect(() => {
    setMessages([]);
    setOpen(false);
  }, [user?.id]);

  if (!enabled || !user) return null;

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const { data } = await http.post<{ reply: string; products: Product[] }>('/assistant', {
        messages: next.slice(-10).map(({ role, content }) => ({ role, content })),
      });
      setMessages([...next, { role: 'assistant', content: data.reply, products: data.products }]);
    } catch (err) {
      setMessages([...next, { role: 'assistant', content: errorMessage(err, 'The assistant is unavailable right now.') }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      {open && (
        <section className="chat-panel card" aria-label="Shopping assistant">
          <div className="row">
            <strong>Shopping assistant</strong>
            <button className="btn btn-ghost" onClick={() => setOpen(false)} aria-label="Close assistant">
              ✕
            </button>
          </div>
          <div className="chat-log">
            {messages.length === 0 && (
              <p className="muted small">Ask for help, for example: “a gift for a gamer under ₹5,000”.</p>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`bubble bubble-${message.role}`}>
                <p>{message.content}</p>
                {message.products?.map((product) => (
                  <div key={product.id} className="chat-product">
                    <ProductImage src={product.imageUrl} name={product.name} />
                    <div>
                      <strong className="small">{product.name}</strong>
                      <div className="small">{formatMoney(product.priceCents)}</div>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        dispatch({ type: 'add', product });
                        notify(`${product.name} added to cart`, 'success');
                      }}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {busy && <p className="muted small">Thinking…</p>}
            <div ref={bottom} />
          </div>
          <form className="chat-form" onSubmit={send}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about products…"
              maxLength={500}
              aria-label="Message"
            />
            <button className="btn btn-primary" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
          <p className="muted small">AI can make mistakes. Check the price and details before buying.</p>
        </section>
      )}
      <button className="btn btn-primary chat-toggle" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide assistant' : '✨ Ask AI'}
      </button>
    </div>
  );
}
