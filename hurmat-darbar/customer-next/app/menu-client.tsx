'use client';

import { useMemo, useState } from 'react';

type Category = { id: string; name: string; sort_order: number };
type MenuItem = { id: string; category_id: string; name: string; description: string | null; is_veg: boolean | null; image_url: string | null; available: boolean; needs_verification: boolean };
type Variant = { id: string; item_id: string; label: string; price: number | null };
type CartLine = { variantId: string; itemId: string; name: string; label: string; price: number; qty: number };

export default function MenuClient({ categories, items, variants }: { categories: Category[]; items: MenuItem[]; variants: Variant[] }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const total = useMemo(() => cart.reduce((sum, line) => sum + line.price * line.qty, 0), [cart]);
  const count = cart.reduce((sum, line) => sum + line.qty, 0);

  function add(item: MenuItem, variant: Variant) {
    if (item.needs_verification || variant.price === null) return;
    setCart(current => {
      const found = current.find(line => line.variantId === variant.id);
      if (found) return current.map(line => line.variantId === variant.id ? { ...line, qty: Math.min(50, line.qty + 1) } : line);
      return [...current, { variantId: variant.id, itemId: item.id, name: item.name, label: variant.label, price: variant.price!, qty: 1 }];
    });
  }
  function change(variantId: string, delta: number) {
    setCart(current => current.map(line => line.variantId === variantId ? { ...line, qty: line.qty + delta } : line).filter(line => line.qty > 0));
  }

  return <>
    <div className="cart-bar"><span>{count} {count === 1 ? 'item' : 'items'} · ₹{total}</span><button onClick={() => setCartOpen(true)} disabled={!count}>View bag</button></div>
    {categories.map(category => <section className="category" key={category.id}><h3>{category.name}</h3><div className="menu-grid">{items.filter(item => item.category_id === category.id).map(item => {
      const options = variants.filter(v => v.item_id === item.id);
      return <article className="dish" key={item.id}>{item.image_url && <img src={item.image_url} alt="" loading="lazy"/>}<div className="dish-info"><div className="dish-title"><h4>{item.name}</h4>{item.is_veg === true && <span className="veg">VEG</span>}{item.is_veg === false && <span className="nonveg">NON-VEG</span>}</div>{item.description && <p>{item.description}</p>}{item.needs_verification && <small>Details being verified · ordering disabled</small>}<div className="variants">{options.map(v => <span className="variant-choice" key={v.id}>{v.label}{v.price !== null ? ` · ₹${v.price}` : ' · Price on request'}<button disabled={item.needs_verification || v.price === null || !item.available} onClick={() => add(item, v)}>Add</button></span>)}</div></div></article>;
    })}</div></section>)}
    {cartOpen && <div className="cart-backdrop" role="presentation" onClick={() => setCartOpen(false)}><section className="cart-panel" role="dialog" aria-modal="true" aria-label="Your bag" onClick={e => e.stopPropagation()}><div className="cart-heading"><h2>Your bag</h2><button onClick={() => setCartOpen(false)}>Close</button></div>{cart.length === 0 ? <p>Your bag is empty.</p> : cart.map(line => <div className="cart-line" key={line.variantId}><div><strong>{line.name}</strong><small>{line.label} · ₹{line.price}</small></div><div className="quantity"><button onClick={() => change(line.variantId, -1)} aria-label="Decrease quantity">−</button><b>{line.qty}</b><button onClick={() => change(line.variantId, 1)} aria-label="Increase quantity">+</button></div><b>₹{line.price * line.qty}</b></div>)}<div className="cart-total"><span>Subtotal</span><strong>₹{total}</strong></div><p className="checkout-note">Online checkout is not enabled yet. Delivery location verification, customer sign-in and payment settings must be completed before orders can be safely submitted. Your bag is only stored in this page session.</p><button className="clear-cart" onClick={() => setCart([])} disabled={!cart.length}>Clear bag</button></section></div>}
  </>;
}
