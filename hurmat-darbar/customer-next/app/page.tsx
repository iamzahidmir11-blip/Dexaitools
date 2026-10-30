import { createClient } from '@supabase/supabase-js';
import MenuClient from './menu-client';

type Category = { id: string; name: string; sort_order: number };
type MenuItem = { id: string; category_id: string; name: string; description: string | null; is_veg: boolean | null; image_url: string | null; available: boolean; needs_verification: boolean };
type Variant = { id: string; item_id: string; label: string; price: number | null };

async function getMenu() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { categories: [] as Category[], items: [] as MenuItem[], variants: [] as Variant[], configured: false };
  const supabase = createClient(url, key);
  const [c, i, v] = await Promise.all([
    supabase.from('menu_categories').select('id,name,sort_order').eq('active', true).order('sort_order'),
    supabase.from('menu_items').select('id,category_id,name,description,is_veg,image_url,available,needs_verification').eq('active', true).eq('available', true).order('sort_order'),
    supabase.from('menu_variants').select('id,item_id,label,price').eq('active', true).order('sort_order'),
  ]);
  if (c.error || i.error || v.error) return { categories: [] as Category[], items: [] as MenuItem[], variants: [] as Variant[], configured: true };
  return { categories: c.data ?? [], items: i.data ?? [], variants: v.data ?? [], configured: true };
}

export default async function Home() {
  const { categories, items, variants, configured } = await getMenu();
  return <main>
    <header className="topbar"><a className="brand" href="#home">HD<span>HURMAT DARBAR</span></a><nav><a href="#menu">Menu</a><a href="#story">Our story</a><a href="#visit">Visit</a></nav><a className="call" href="tel:+919797151590">Call to order ↗</a></header>
    <section className="hero" id="home"><p className="eyebrow">URI · JAMMU & KASHMIR</p><h1>Good food.<br/><em>Warm moments.</em></h1><p className="intro">A place to gather, share and enjoy. Discover the menu at Hurmat Darbar.</p><a className="primary" href="#menu">Explore the menu <span>↓</span></a><div className="hero-note">OPPOSITE TEHSIL, URI <span>OPEN DAILY · 9 AM – 11 PM</span></div></section>
    <section className="menu-section" id="menu"><div className="section-head"><div><p className="eyebrow">MADE TO BE SHARED</p><h2>Our menu</h2></div><p>Choose an option to add it to your bag.</p></div>
      {!configured ? <p className="notice">Menu connection is not configured yet. Add the Supabase environment variables to load the live menu.</p> : categories.length === 0 ? <p className="notice">Menu is temporarily unavailable. Please call the restaurant.</p> : <MenuClient categories={categories} items={items} variants={variants}/>}
    </section>
    <section className="story" id="story"><p className="eyebrow">A PLACE IN URI</p><h2>Made for good<br/><em>company.</em></h2><p>Visit us opposite Tehsil, Uri. For current availability and details, please call the restaurant.</p></section>
    <footer id="visit"><div><p className="eyebrow">COME BY</p><h2>Hurmat Darbar</h2><p>Opposite Tehsil, Uri, Jammu & Kashmir 193123</p></div><div><a href="tel:+919797151590">+91 97971 51590</a><p>Open daily · 9 AM – 11 PM</p><a href="https://maps.google.com/?q=Hurmat+Darbar+Uri" target="_blank" rel="noreferrer">Find us on Maps ↗</a></div></footer>
  </main>;
}
