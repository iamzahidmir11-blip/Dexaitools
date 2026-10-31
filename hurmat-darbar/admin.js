import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://rvrboufrnkzuptfjopwd.supabase.co";
const SUPABASE_KEY = "sb_publishable_n1PWbHcomKpd63FPDdWSEw_iSo6UTi0";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const root = document.getElementById("app");
const navRoot = document.getElementById("nav");
const money = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const statusNames = {
  pending_confirmation:"Pending confirmation", confirmed:"Confirmed", preparing:"Preparing",
  ready_for_pickup:"Ready for pickup", picked_up:"Picked up", out_for_delivery:"Out for delivery",
  delivered:"Delivered", cancelled:"Cancelled", rejected:"Rejected", delivery_failed:"Delivery failed"
};
const tabs = [["home","⌂","Overview"],["orders","▤","Orders"],["menu","▦","Menu"],["inventory","▣","Inventory"],["reservations","◷","Bookings"],["riders","♧","Riders"],["reports","▥","Reports"],["settings","⚙","Store setup"],["alerts","♢","Alerts"]];
let user=null, role=null, page="home", orders=[], menuItems=[], menuCategories=[], reservations=[], riders=[], notifications=[], settings=null, channel=null, busy=false;

function toast(message, bad=false){
  let el=document.getElementById("admin-toast");
  if(!el){el=document.createElement("div");el.id="admin-toast";el.className="toast";document.body.append(el);}
  el.textContent=message;el.style.background=bad?"#8b342c":"var(--gold)";el.style.color=bad?"white":"#16281e";
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.remove(),2600);
}
async function api(view, body){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) throw new Error("Please sign in again.");
  const url=SUPABASE_URL+"/functions/v1/restaurant-api"+(body?"":"?view="+encodeURIComponent(view||"orders"));
  const res=await fetch(url,{method:body?"POST":"GET",headers:{
    "apikey":SUPABASE_KEY,"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json"
  },body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"The server could not complete this request.");
  return data;
}
async function verifyAccess(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){user=null;role=null;return false;}
  user=session.user;
  if(!user.email_confirmed_at){await supabase.auth.signOut();user=null;role=null;throw new Error("Verify your email address before signing in.");}
  const {data,error}=await supabase.from("user_roles").select("role,active").eq("user_id",user.id).eq("active",true);
  if(error) throw error;
  const match=(data||[]).find(x=>["owner","manager"].includes(x.role));
  if(!match){await supabase.auth.signOut();user=null;role=null;throw new Error("This verified account does not have an active Owner or Manager role.");}
  role=match.role;
  return true;
}
function loginView(message){
  navRoot.innerHTML="";
  root.innerHTML='<div class="auth-card card"><div class="logo">HD</div><h1>Admin sign in</h1><p>Sign in with the verified Supabase account assigned an active Owner or Manager role. New accounts do not receive admin access automatically.</p>'+
    (message?'<div class="notice">'+esc(message)+'</div>':'')+
    '<form id="login-form"><label>Email address</label><input id="login-email" type="email" autocomplete="username" required placeholder="admin@example.com"><label>Password</label><input id="login-password" type="password" autocomplete="current-password" required placeholder="Your password"><button class="btn wide" id="login-submit" type="submit">Sign in securely</button></form><p style="margin:14px 0 0">Access is checked against Supabase Auth, email verification and the database role table.</p></div>';
  document.getElementById("login-form").addEventListener("submit",async e=>{
    e.preventDefault();const button=document.getElementById("login-submit");button.disabled=true;button.textContent="Checking account…";
    try{
      const {error}=await supabase.auth.signInWithPassword({email:document.getElementById("login-email").value.trim(),password:document.getElementById("login-password").value});
      if(error) throw error;
      await verifyAccess();await startApp();
    }catch(err){await supabase.auth.signOut().catch(()=>{});loginView(err.message||"Sign-in failed.");}
  });
}
function nav(){
  navRoot.innerHTML=tabs.map(t=>'<button class="'+(page===t[0]?"on":"")+'" data-tab="'+t[0]+'"><span>'+t[1]+'</span>'+t[2]+'</button>').join("");
  navRoot.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{page=b.dataset.tab;render();});
}
function header(){
  const open=!!settings?.is_open;
  return '<header class="partner-topbar"><div class="topbar-brand"><div class="logo">HD</div><div><b>HURMAT DARBAR</b><small>RESTAURANT PARTNER CONSOLE</small></div></div><div class="topbar-actions"><button class="outlet-state '+(open?'is-open':'is-paused')+'" id="outlet-toggle" data-open="'+String(open)+'"><i></i>'+(open?'Accepting orders':'Orders paused')+'</button><span class="pill">'+esc(role||"STAFF").toUpperCase()+'</span><button class="btn ghost sm" id="signout">Sign out</button></div></header>';
}function shell(title,desc,content){
  root.innerHTML=header()+'<main class="partner-main"><div class="page-heading"><div><span class="eyebrow">RESTAURANT OPERATIONS</span><h1>'+esc(title)+'</h1><p class="sub">'+esc(desc||"Live data from the restaurant database.")+'</p></div><div class="page-updated">Live database · '+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})+'</div></div>'+content+'</main>';
  document.getElementById("signout").onclick=async()=>{if(channel)await supabase.removeChannel(channel);await supabase.auth.signOut();user=null;role=null;loginView("You have signed out.");};
}function card(title,body){return '<section class="card" style="margin:10px 0"><h2 style="margin:0 0 12px">'+title+'</h2>'+body+'</section>';}
function empty(text){return '<div class="empty">'+esc(text)+'</div>';}
function nextStatus(s){
  return ({pending_confirmation:"confirmed",confirmed:"preparing",preparing:"ready_for_pickup"})[s]||null;
}
function orderCard(o){
  const items=(o.order_items||[]).map(i=>esc(i.qty)+" × "+esc(i.item_name)+" ("+esc(i.variant_label)+")").join("<br>");
  const next=nextStatus(o.status);
  const riderOptions=riders.map(r=>'<option value="'+esc(r.user_id)+'">'+esc(r.name||"Rider")+(r.is_online?" · Online":" · Offline")+'</option>').join("");
  return '<article class="card" style="margin:10px 0"><div class="row"><b>Order #'+esc(o.order_no)+'</b><span class="tag s-'+(o.status==="delivered"?"served":o.status==="cancelled"||o.status==="rejected"?"cancelled":o.status==="preparing"?"preparing":o.status==="ready_for_pickup"?"ready":"new")+'">'+esc(statusNames[o.status]||o.status)+'</span></div>'+
    '<p class="mute" style="margin:8px 0">'+esc(o.customer_name)+' · '+esc(o.customer_phone)+'</p><p class="mute">'+esc(o.address_text)+'</p><p style="margin:10px 0;line-height:1.7">'+(items||"No item details")+'</p>'+
    '<div class="row"><span class="mute">'+new Date(o.created_at).toLocaleString()+'</span><b class="price">'+money(o.total)+'</b></div>'+
    '<p class="mute" style="margin-top:7px">Payment: '+esc(o.payment_method)+' · '+esc(o.payment_status)+'</p>'+
    (next?'<div class="actions"><button class="btn sm" data-order="'+esc(o.id)+'" data-status="'+next+'">Mark '+esc(statusNames[next])+'</button><button class="btn sm ghost" data-cancel="'+esc(o.id)+'">Cancel / reject</button></div>':'')+
    (o.status==="ready_for_pickup"&&riderOptions?'<div class="actions"><select id="rider-'+esc(o.id)+'"><option value="">Choose rider</option>'+riderOptions+'</select><button class="btn sm ghost" data-assign="'+esc(o.id)+'">Assign rider</button></div>':'')+
    '</article>';
}
function homeView(){
  const now=new Date(),today=now.toDateString();
  const todays=orders.filter(o=>new Date(o.created_at).toDateString()===today);
  const deliveredToday=todays.filter(o=>o.status==="delivered");
  const revenue=deliveredToday.reduce((a,o)=>a+Number(o.total||0),0);
  const pending=orders.filter(o=>o.status==="pending_confirmation").length;
  const active=orders.filter(o=>["confirmed","preparing","ready_for_pickup","picked_up","out_for_delivery"].includes(o.status)).length;
  const low=menuItems.filter(i=>i.track_stock&&Number(i.stock_qty||0)<=5).length;
  const stages=[["New","pending_confirmation"],["Confirmed","confirmed"],["Preparing","preparing"],["Ready","ready_for_pickup"],["On delivery","out_for_delivery"]];
  const pipeline=stages.map(([label,status])=>'<div class="pipeline-step"><b>'+orders.filter(o=>o.status===status).length+'</b><span>'+label+'</span></div>').join("");
  return '<section class="welcome-strip"><div><span class="eyebrow">TODAY AT HURMAT DARBAR</span><h2>Restaurant overview</h2><p>Orders, kitchen activity and sales — all in one place.</p></div><div class="welcome-date">'+now.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short",year:"numeric"})+'</div></section>'+
  '<div class="partner-metrics"><article class="metric-card"><span>ORDERS TODAY</span><b>'+todays.length+'</b><small>'+pending+' awaiting confirmation</small></article><article class="metric-card"><span>SALES TODAY</span><b>'+money(revenue)+'</b><small>Delivered orders only</small></article><article class="metric-card"><span>ACTIVE ORDERS</span><b>'+active+'</b><small>Across kitchen and delivery</small></article><article class="metric-card"><span>STOCK ALERTS</span><b>'+low+'</b><small>Low or out-of-stock items</small></article></div>'+
  '<div class="dashboard-columns"><section class="partner-panel"><div class="panel-heading"><div><h2>Order workflow</h2><p>Live status across the restaurant</p></div><button class="text-action" data-go="orders">Open orders →</button></div><div class="order-pipeline">'+pipeline+'</div></section>'+
  '<section class="partner-panel"><div class="panel-heading"><div><h2>Quick operations</h2><p>Common restaurant controls</p></div></div><div class="quick-links"><button data-go="menu"><span>▦</span><b>Manage menu</b><small>Items, photos & prices</small></button><button data-go="inventory"><span>▣</span><b>Inventory</b><small>Stock counts & alerts</small></button><button data-go="settings"><span>⚙</span><b>Store setup</b><small>Hours, location & payments</small></button><button data-go="reports"><span>▥</span><b>Business reports</b><small>Sales & popular dishes</small></button></div></section></div>'+
  '<section class="partner-panel"><div class="panel-heading"><div><h2>Recent orders</h2><p>Latest customer activity</p></div><button class="text-action" data-go="orders">View all orders →</button></div>'+(orders.slice(0,6).map(orderCard).join("")||empty("No real orders have been received yet."))+'</section>'+
  '<div class="dashboard-columns"><section class="partner-panel"><div class="panel-heading"><div><h2>Inventory attention</h2><p>Items with five or fewer units</p></div><button class="text-action" data-go="inventory">Manage stock →</button></div>'+(menuItems.filter(i=>i.track_stock&&Number(i.stock_qty||0)<=5).slice(0,5).map(i=>'<div class="item-row"><b>'+esc(i.name)+'</b><span class="stock-state '+(Number(i.stock_qty||0)===0?'out':'low')+'">'+(Number(i.stock_qty||0)===0?'Out of stock':i.stock_qty+' left')+'</span></div>').join("")||empty("No low-stock alerts."))+'</section><section class="partner-panel"><div class="panel-heading"><div><h2>Account connection</h2><p>Secure restaurant access</p></div><span class="connection-dot">● Connected</span></div><p class="mute">Signed in with a verified '+esc(role)+' account. Order and notification updates are subscribed in real time.</p></section></div>';
}function ordersView(){
  const groups=[["New orders","pending_confirmation"],["Confirmed","confirmed"],["Preparing","preparing"],["Ready for pickup","ready_for_pickup"],["Delivery / completed",["picked_up","out_for_delivery","delivered"]],["Cancelled / rejected",["cancelled","rejected","delivery_failed"]]];
  return '<div class="orders-toolbar"><div><b>'+orders.length+' total orders</b><span> · Latest orders appear first</span></div><input id="order-search" type="search" placeholder="Search order number, customer or phone"></div><div class="order-groups">'+groups.map(([label,status])=>{const list=orders.filter(o=>Array.isArray(status)?status.includes(o.status):o.status===status);return '<section class="order-group"><div class="group-heading"><h2>'+label+'</h2><span>'+list.length+'</span></div>'+(list.map(orderCard).join("")||'<div class="empty compact">No orders in this stage.</div>')+'</section>';}).join("")+'</div>';
}function menuView(){
  const search='<div class="store-toolbar"><input id="menu-search" type="search" placeholder="Search dishes, e.g. Chicken Biryani"><select id="menu-filter"><option value="all">All items</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="stock">Stock tracking on</option><option value="low">Low stock</option><option value="out">Out of stock</option></select><button class="btn" id="add-category">+ Category</button><button class="btn" id="add-item">+ Add menu item</button></div>';
  const cards=menuItems.map(i=>{
    const photo=i.image_url?'<img src="'+esc(i.image_url)+'" alt="'+esc(i.name)+'" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'"><div class="store-photo-fallback" style="display:none">HD</div>':'<div class="store-photo-fallback">HD</div>';
    const variants=(i.menu_variants||[]).map(v=>'<div class="store-variant"><span>'+esc(v.label)+' <b>'+money(v.price)+'</b> '+(v.active?'':'<small>Hidden</small>')+'</span><div class="actions"><button class="btn ghost sm" data-price="'+esc(v.id)+'" data-current="'+esc(v.price)+'">Edit price</button><button class="btn ghost sm" data-variant-toggle="'+esc(v.id)+'" data-active="'+String(v.active)+'">'+(v.active?'Disable':'Enable')+'</button></div></div>').join("");
    const stock=Number(i.stock_qty||0);
    const stockBlock=i.track_stock?'<div class="inventory-panel"><div><small>AVAILABLE STOCK</small><b class="inventory-number">'+stock+'</b></div><div class="inventory-stepper"><button class="qty-step" data-stock-minus="'+esc(i.id)+'" '+(stock<=0?'disabled':'')+'>−</button><button class="qty-step" data-stock-plus="'+esc(i.id)+'">+</button><button class="btn ghost sm" data-stock-set="'+esc(i.id)+'">Set</button></div><span class="stock-state '+(stock===0?'out':stock<=5?'low':'in')+'">'+(stock===0?'Out':stock<=5?'Low stock':'In stock')+'</span></div>':'<div class="inventory-panel inventory-off"><span>Stock tracking is off</span><button class="btn ghost sm" data-stock-enable="'+esc(i.id)+'">Set opening stock</button></div>';
    return '<article class="store-product" data-product-card data-name="'+esc((i.name+" "+(i.description||"")+" "+(i.menu_categories?.name||"")).toLowerCase())+'" data-published="'+String(i.active)+'" data-tracked="'+String(i.track_stock)+'" data-stock-value="'+stock+'"><div class="store-product-photo">'+photo+'<span class="store-photo-type">'+(i.is_veg?'VEG':'NON-VEG')+'</span><span class="store-publish-tag '+(i.active?'published':'hidden')+'">'+(i.active?'PUBLISHED':'HIDDEN')+'</span></div><div class="store-product-info"><div class="store-product-heading"><div><small>'+esc(i.menu_categories?.name||"Uncategorised")+'</small><h3>'+esc(i.name)+'</h3></div><b class="store-product-price">'+money(Math.min(...(i.menu_variants||[]).filter(v=>v.active&&v.price!==null).map(v=>Number(v.price)).concat([0]).filter(n=>n>0))||0)+'</b></div><p>'+esc(i.description||"No product description added.")+'</p>'+stockBlock+'<div class="store-variants"><div class="store-section-label">PORTIONS & PRICING</div>'+(variants||'<small>No variants configured.</small>')+'</div><div class="store-product-actions"><button class="btn ghost sm" data-upload-image="'+esc(i.id)+'">Photo</button><button class="btn ghost sm" data-edit-item="'+esc(i.id)+'">Edit</button><button class="btn ghost sm" data-add-variant="'+esc(i.id)+'">+ Variant</button><button class="btn ghost sm" data-toggle="'+esc(i.id)+'" data-available="'+String(i.available)+'">'+(i.available?'Pause item':'Enable item')+'</button><button class="btn sm" data-publish="'+esc(i.id)+'" data-active="'+String(i.active)+'">'+(i.active?'Hide':'Publish')+'</button></div></div></article>';
  }).join("");
  const catCards=menuCategories.map(c=>'<span class="store-category-chip">'+esc(c.name)+'</span>').join("");
  return '<section class="menu-summary"><div><span class="eyebrow">CUSTOMER CATALOGUE</span><h2>Menu management</h2><p>Changes to items, prices, photos and availability sync to the live customer website.</p></div><div class="store-metrics"><div><small>MENU ITEMS</small><b>'+menuItems.length+'</b></div><div><small>LIVE</small><b>'+menuItems.filter(i=>i.active&&i.available).length+'</b></div><div><small>HIDDEN / PAUSED</small><b>'+menuItems.filter(i=>!i.active||!i.available).length+'</b></div><div><small>CATEGORIES</small><b>'+menuCategories.length+'</b></div></div></section>'+search+'<div class="store-category-list">'+catCards+'</div><div class="store-product-grid" id="store-product-grid">'+(cards||empty("No menu items yet. Add your first dish."))+'</div>';
}function inventoryView(){
  const tracked=menuItems.filter(i=>i.track_stock),untracked=menuItems.filter(i=>!i.track_stock);
  const low=tracked.filter(i=>Number(i.stock_qty||0)>0&&Number(i.stock_qty||0)<=5),out=tracked.filter(i=>Number(i.stock_qty||0)===0);
  const rows=[...tracked,...untracked].map(i=>'<div class="inventory-row"><div class="inventory-product"><div class="inventory-thumb">'+(i.image_url?'<img src="'+esc(i.image_url)+'" alt="">':'HD')+'</div><div><b>'+esc(i.name)+'</b><small>'+esc(i.menu_categories?.name||"Uncategorised")+'</small></div></div><div class="inventory-count">'+(i.track_stock?'<b>'+Number(i.stock_qty||0)+'</b><small>units on hand</small>':'<span class="not-tracked">Not tracked</span>')+'</div><div class="inventory-actions">'+(i.track_stock?'<button class="qty-step" data-stock-minus="'+esc(i.id)+'" '+(Number(i.stock_qty||0)<=0?'disabled':'')+'>−</button><button class="qty-step" data-stock-plus="'+esc(i.id)+'">+</button><button class="btn ghost sm" data-stock-set="'+esc(i.id)+'">Set quantity</button>':'<button class="btn ghost sm" data-stock-enable="'+esc(i.id)+'">Start tracking</button>')+'</div><span class="stock-state '+(!i.track_stock?'':Number(i.stock_qty||0)===0?'out':Number(i.stock_qty||0)<=5?'low':'in')+'">'+(!i.track_stock?'Unlimited':Number(i.stock_qty||0)===0?'Out of stock':Number(i.stock_qty||0)<=5?'Low stock':'In stock')+'</span></div>').join("");
  return '<section class="menu-summary"><div><span class="eyebrow">KITCHEN INVENTORY</span><h2>Inventory control</h2><p>Set actual quantities. Customer ordering automatically respects tracked stock.</p></div><div class="store-metrics"><div><small>TRACKED ITEMS</small><b>'+tracked.length+'</b></div><div><small>LOW STOCK</small><b>'+low.length+'</b></div><div><small>OUT OF STOCK</small><b>'+out.length+'</b></div><div><small>NOT TRACKED</small><b>'+untracked.length+'</b></div></div></section><section class="partner-panel"><div class="panel-heading"><div><h2>Stock register</h2><p>Use Set quantity for a physical stock count; plus/minus for adjustments.</p></div><input id="inventory-search" class="compact-search" type="search" placeholder="Search menu item"></div><div class="inventory-list">'+(rows||empty("No menu items found."))+'</div></section><p class="inventory-footnote">Inventory tracking stays off until actual opening quantities are entered. Avoid estimated counts.</p>';
}
function reservationsView(){
  return reservations.map(r=>'<article class="card" style="margin:10px 0"><div class="row"><b>'+esc(r.name)+'</b><span class="tag s-new">'+esc(r.status)+'</span></div><p class="mute">'+esc(r.phone)+' · '+esc(r.party_size)+' guests</p><p class="mute">'+new Date(r.reserve_at).toLocaleString()+'</p><p class="mute">'+esc(r.notes||"")+'</p><div class="actions">'+["confirmed","rejected","cancelled"].filter(s=>r.status==="pending"||s==="cancelled").map(s=>'<button class="btn sm '+(s==="cancelled"?"ghost":"")+'" data-reservation="'+esc(r.id)+'" data-res-status="'+s+'">'+s+'</button>').join("")+'</div></article>').join("")||empty("No reservations have been received.");
}function ridersView(){
  return riders.map(r=>'<div class="item-row"><div class="item-meta"><b>'+esc(r.name||"Rider")+'</b><span class="mute">'+esc(r.phone||"No phone on file")+'</span></div><span class="tag '+(r.is_online?"s-ready":"s-served")+'">'+(r.is_online?"Online":"Offline")+'</span></div>').join("")||empty("No rider accounts are linked yet.");
}
function reportsView(){
  const now=new Date(),days=[];
  for(let n=6;n>=0;n--){const d=new Date(now);d.setDate(now.getDate()-n);const key=d.toDateString();const done=orders.filter(o=>o.status==="delivered"&&new Date(o.created_at).toDateString()===key);days.push({label:d.toLocaleDateString("en-IN",{weekday:"short"}),sales:done.reduce((s,o)=>s+Number(o.total||0),0),count:done.length});}
  const delivered=orders.filter(o=>o.status==="delivered"),total=delivered.reduce((s,o)=>s+Number(o.total||0),0);
  const products={};delivered.forEach(o=>(o.order_items||[]).forEach(i=>{const k=i.item_name||"Menu item";products[k]=(products[k]||0)+Number(i.qty||0);}));
  const top=Object.entries(products).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const max=Math.max(1,...days.map(x=>x.sales));
  return '<section class="menu-summary"><div><span class="eyebrow">BUSINESS PERFORMANCE</span><h2>Reports & insights</h2><p>Calculated from order records currently available in the restaurant database.</p></div><div class="store-metrics"><div><small>DELIVERED ORDERS</small><b>'+delivered.length+'</b></div><div><small>DELIVERED VALUE</small><b>'+money(total)+'</b></div><div><small>AVERAGE ORDER</small><b>'+money(delivered.length?total/delivered.length:0)+'</b></div><div><small>MENU ITEMS SOLD</small><b>'+Object.values(products).reduce((a,b)=>a+b,0)+'</b></div></div></section><div class="dashboard-columns"><section class="partner-panel"><div class="panel-heading"><div><h2>Delivered sales · last 7 days</h2><p>Daily totals, based on order creation date</p></div></div><div class="sales-bars">'+days.map(d=>'<div class="sales-bar-col"><b>'+money(d.sales)+'</b><i style="height:'+Math.max(3,Math.round(d.sales/max*100))+'%"></i><small>'+d.label+'</small></div>').join("")+'</div></section><section class="partner-panel"><div class="panel-heading"><div><h2>Top dishes</h2><p>Units in delivered orders</p></div></div>'+(top.map(([name,qty],i)=>'<div class="item-row"><b>'+esc(name)+'</b><span class="top-rank">#'+(i+1)+' · '+qty+' sold</span></div>').join("")||empty("No delivered item data yet."))+'</section></div><p class="inventory-footnote">Operational summary only, not an accounting statement. Refunds, discounts, taxes and settlement may need separate reconciliation.</p>';
}
function alertsView(){
  return notifications.map(n=>'<div class="item-row"><div class="item-meta"><b>'+esc(n.title)+'</b><span class="mute">'+esc(n.body||"")+'</span><span class="mute">'+new Date(n.created_at).toLocaleString()+'</span></div>'+(n.is_read?"":'<button class="btn ghost sm" data-read="'+esc(n.id)+'">Mark read</button>')+'</div>').join("")||empty("No notifications yet.");
}function alertsView(){
  return notifications.map(n=>'<div class="item-row"><div class="item-meta"><b>'+esc(n.title)+'</b><span class="mute">'+esc(n.body||"")+'</span><span class="mute">'+new Date(n.created_at).toLocaleString()+'</span></div>'+(n.is_read?"":'<button class="btn ghost sm" data-read="'+esc(n.id)+'">Mark read</button>')+'</div>').join("")||empty("No notifications yet.");
}
function settingsView(){
  const s=settings||{};
  return '<div class="notice">Enter the restaurant’s exact map-pin coordinates and confirm them only after checking the pin. Orders remain blocked until the location is verified and a real payment method is enabled.</div>'+
    '<form id="settings-form" class="card"><h2 style="margin:0 0 12px">Restaurant details</h2>'+
    '<label>Restaurant name</label><input id="set-name" required value="'+esc(s.name||"Hurmat Darbar")+'">'+
    '<label>Contact phone</label><input id="set-phone" value="'+esc(s.phone||"")+'">'+
    '<label>Full address</label><input id="set-address" value="'+esc(s.address||"")+'">'+
    '<div class="grid"><div><label>Latitude</label><input id="set-lat" type="number" step="any" min="-90" max="90" value="'+(s.lat==null?"":esc(s.lat))+'"></div><div><label>Longitude</label><input id="set-lng" type="number" step="any" min="-180" max="180" value="'+(s.lng==null?"":esc(s.lng))+'"></div></div>'+
    '<label>Delivery radius (metres)</label><input id="set-radius" type="number" min="100" max="50000" value="'+esc(s.delivery_radius_m||5000)+'">'+
    '<div class="grid"><div><label>Delivery fee (₹)</label><input id="set-fee" type="number" min="0" max="100000" value="'+esc(s.delivery_fee||0)+'"></div><div><label>Minimum order (₹)</label><input id="set-min" type="number" min="0" max="100000" value="'+esc(s.min_order||0)+'"></div></div>'+
    '<label style="display:flex;align-items:center;gap:8px;margin:10px 0"><input id="set-open" type="checkbox" style="width:auto;margin:0" '+(s.is_open?"checked":"")+'> Accept orders while restaurant is open</label>'+
    '<label style="display:flex;align-items:center;gap:8px;margin:10px 0"><input id="set-cod" type="checkbox" style="width:auto;margin:0" '+(s.cod_enabled?"checked":"")+'> Enable cash on delivery</label>'+
    '<label style="display:flex;align-items:center;gap:8px;margin:10px 0"><input id="set-upi" type="checkbox" style="width:auto;margin:0" '+(s.upi_enabled?"checked":"")+'> Enable manual UPI (not automatic payment verification)</label>'+
    '<label>UPI ID (required only if manual UPI is enabled)</label><input id="set-upi-id" value="'+esc(s.upi_id||"")+'">'+
    '<label style="display:flex;align-items:center;gap:8px;margin:14px 0"><input id="set-verified" type="checkbox" style="width:auto;margin:0" '+(s.location_verified?"checked":"")+'> I have checked and verified the restaurant map pin</label>'+
    '<button class="btn wide" type="submit">Save real restaurant settings</button></form>';
}
function render(){
  nav();
  const titles={home:["Overview","Live restaurant operations and business pulse."],orders:["Order desk","Manage incoming orders through kitchen and delivery stages."],menu:["Menu management","Control dishes, categories, prices, photos and availability."],inventory:["Inventory","Physical stock counts synced with customer ordering."],reservations:["Bookings","Customer reservation requests."],riders:["Delivery team","Rider accounts and availability."],reports:["Reports","Sales trends and top-selling menu items."],settings:["Store setup","Restaurant profile, operating status, delivery and payment configuration."],alerts:["Notifications","Live operational alerts and order updates."]};
  const t=titles[page]||titles.home;
  let content=page==="home"?homeView():page==="orders"?ordersView():page==="menu"?menuView():page==="inventory"?inventoryView():page==="reservations"?reservationsView():page==="riders"?ridersView():page==="reports"?reportsView():page==="settings"?settingsView():alertsView();
  shell(t[0],t[1],content);
  bindActions();
}async function refresh(){
  const results=await Promise.allSettled([api("orders"),api("menu"),api("reservations"),api("riders"),
    supabase.from("notifications").select("id,title,body,order_id,is_read,created_at").order("created_at",{ascending:false}).limit(60),
    supabase.from("restaurant_settings").select("*").eq("id",1).single()]);
  if(results[0].status==="fulfilled")orders=results[0].value.orders||[];
  if(results[1].status==="fulfilled")menuItems=results[1].value.items||[];
  if(results[2].status==="fulfilled")reservations=results[2].value.reservations||[];
  if(results[3].status==="fulfilled")riders=results[3].value.riders||[];
  if(results[4].status==="fulfilled"&&!results[4].value.error)notifications=results[4].value.data||[];
  if(results[5].status==="fulfilled"&&!results[5].value.error)settings=results[5].value.data;
  const categoryResult=await supabase.from("menu_categories").select("id,name,active,sort_order").order("sort_order");if(!categoryResult.error)menuCategories=categoryResult.data||[];
  render();
}
function bindActions(){
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{page=b.dataset.go;render();});
  const outletToggle=document.getElementById("outlet-toggle");
  if(outletToggle)outletToggle.onclick=async()=>{
    const next=outletToggle.dataset.open!=="true";
    outletToggle.disabled=true;
    const {error}=await supabase.from("restaurant_settings").update({is_open:next,updated_at:new Date().toISOString()}).eq("id",1);
    if(error){toast(error.message,true);outletToggle.disabled=false;return;}
    await refresh();toast(next?"Restaurant is accepting orders.":"Restaurant orders paused.");
  };
  const orderSearch=document.getElementById("order-search");
  if(orderSearch)orderSearch.oninput=()=>{
    const q=orderSearch.value.trim().toLowerCase();
    document.querySelectorAll(".order-groups article.card").forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(q);});
  };
  const inventorySearch=document.getElementById("inventory-search");
  if(inventorySearch)inventorySearch.oninput=()=>{
    const q=inventorySearch.value.trim().toLowerCase();
    document.querySelectorAll(".inventory-row").forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(q);});
  };
  document.querySelectorAll("[data-order]").forEach(b=>b.onclick=async()=>{
    b.disabled=true;try{await api("",{action:"update_order_status",order_id:b.dataset.order,status:b.dataset.status});await refresh();toast("Order status updated.");}catch(e){toast(e.message,true);b.disabled=false;}
  });
  document.querySelectorAll("[data-cancel]").forEach(b=>b.onclick=async()=>{
    const reason=prompt("Enter a reason for cancelling or rejecting this order:");if(!reason||!reason.trim())return;
    try{await api("",{action:"update_order_status",order_id:b.dataset.cancel,status:"cancelled",reason:reason.trim()});await refresh();toast("Order cancelled.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-assign]").forEach(b=>b.onclick=async()=>{
    const rider=document.getElementById("rider-"+b.dataset.assign).value;if(!rider){toast("Choose a rider first.",true);return;}
    try{await api("",{action:"assign_rider",order_id:b.dataset.assign,rider_id:rider});await refresh();toast("Rider assigned.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-stock-set]").forEach(b=>b.onclick=async()=>{
    const item=menuItems.find(x=>x.id===b.dataset.stockSet);if(!item)return;
    const raw=prompt("Set the exact physical stock quantity for "+item.name+":",String(item.stock_qty||0));if(raw===null)return;
    const qty=Number(raw);if(!Number.isInteger(qty)||qty<0||qty>1000000){toast("Enter a whole number from 0 to 1,000,000.",true);return;}
    b.disabled=true;
    try{await api("",{action:"update_menu_item",item_id:item.id,track_stock:true,stock_qty:qty});await refresh();toast("Inventory count saved: "+qty+" units.");}catch(e){toast(e.message,true);b.disabled=false;}
  });
  document.querySelectorAll("[data-stock-enable]").forEach(b=>b.onclick=async()=>{
    const item=menuItems.find(x=>x.id===b.dataset.stockEnable);if(!item)return;
    const raw=prompt("Enter the current physical stock quantity for "+item.name+":","0");if(raw===null)return;
    const qty=Number(raw);if(!Number.isInteger(qty)||qty<0||qty>1000000){toast("Enter a whole number from 0 to 1,000,000.",true);return;}
    b.disabled=true;
    try{await api("",{action:"update_menu_item",item_id:item.id,track_stock:true,stock_qty:qty});await refresh();toast("Inventory tracking enabled.");}catch(e){toast(e.message,true);b.disabled=false;}
  });
  document.querySelectorAll("[data-stock-plus],[data-stock-minus]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.stockPlus||b.dataset.stockMinus,item=menuItems.find(x=>x.id===id);if(!item)return;
    const delta=b.hasAttribute("data-stock-plus")?1:-1,current=Number(item.stock_qty||0);
    b.disabled=true;
    try{await api("",{action:"adjust_menu_stock",item_id:id,delta});await refresh();toast("Stock updated: "+(current+delta)+" units remaining.");}catch(e){toast(e.message,true);b.disabled=false;}
  });
  const menuSearch=document.getElementById("menu-search"),menuFilter=document.getElementById("menu-filter");
  const applyStoreFilter=()=>{
    const q=(menuSearch?.value||"").trim().toLowerCase(),filter=menuFilter?.value||"all";
    document.querySelectorAll("[data-product-card]").forEach(card=>{
      const tracked=card.dataset.tracked==="true",qty=Number(card.dataset.stockValue||0),published=card.dataset.published==="true";
      const matchName=card.dataset.name.includes(q);
      const matchFilter=filter==="all"||(filter==="published"&&published)||(filter==="hidden"&&!published)||(filter==="stock"&&tracked)||(filter==="low"&&tracked&&qty>0&&qty<=5)||(filter==="out"&&tracked&&qty===0);
      card.hidden=!(matchName&&matchFilter);
    });
  };
  if(menuSearch)menuSearch.oninput=applyStoreFilter;if(menuFilter)menuFilter.onchange=applyStoreFilter;
  document.querySelectorAll("[data-upload-image]").forEach(b=>b.onclick=()=>{
    const item=menuItems.find(x=>x.id===b.dataset.uploadImage);if(!item)return;
    const picker=document.createElement("input");picker.type="file";picker.accept="image/jpeg,image/png,image/webp";
    picker.onchange=async()=>{
      const file=picker.files&&picker.files[0];if(!file)return;
      if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024){toast("Choose a JPG, PNG or WebP image up to 5 MB.",true);return;}
      b.disabled=true;b.textContent="Uploading…";
      try{
        const safeName=file.name.replace(/[^a-z0-9._-]/gi,"-");
        const path=item.id+"/"+Date.now()+"-"+safeName;
        const {data,error}=await supabase.storage.from("menu-images").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
        if(error)throw error;
        const {data:publicData}=supabase.storage.from("menu-images").getPublicUrl(data.path);
        await api("",{action:"update_menu_item",item_id:item.id,image_url:publicData.publicUrl});
        await refresh();toast("Product photo uploaded and published on the customer website.");
      }catch(e){toast(e.message||"Photo upload failed.",true);b.disabled=false;b.textContent="Photo";}
    };
    picker.click();
  });
  document.querySelectorAll("[data-edit-item]").forEach(b=>b.onclick=async()=>{
    const item=menuItems.find(x=>x.id===b.dataset.editItem);if(!item)return;
    const name=prompt("Product name:",item.name);if(name===null)return;
    const description=prompt("Product description:",item.description||"");if(description===null)return;
    const imageUrl=prompt("Food photo URL (https://) — leave blank for no photo:",item.image_url||"");if(imageUrl===null)return;
    if(imageUrl.trim()&&!imageUrl.trim().startsWith("https://")){toast("Photo URL must start with https://",true);return;}
    const veg=prompt("Food type: enter VEG or NON-VEG",item.is_veg?"VEG":"NON-VEG");if(veg===null)return;
    if(!name.trim()||name.trim().length<2||name.length>120||description.length>500||!["veg","non-veg"].includes(veg.trim().toLowerCase())){toast("Check product name, description and food type.",true);return;}
    try{await api("",{action:"update_menu_item",item_id:item.id,name:name.trim(),description,image_url:imageUrl.trim()||null,is_veg:veg.trim().toLowerCase()==="veg"});await refresh();toast("Product details and photo updated on the website.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-publish]").forEach(b=>b.onclick=async()=>{
    try{await api("",{action:"update_menu_item",item_id:b.dataset.publish,active:b.dataset.active!=="true"});await refresh();toast("Product publishing status updated.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=async()=>{
    try{await api("",{action:"update_menu_item",item_id:b.dataset.toggle,available:b.dataset.available!=="true"});await refresh();toast("Website menu availability updated.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-variant-toggle]").forEach(b=>b.onclick=async()=>{
    try{await api("",{action:"update_menu_variant",variant_id:b.dataset.variantToggle,active:b.dataset.active!=="true"});await refresh();toast("Variant availability updated.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-add-variant]").forEach(b=>b.onclick=async()=>{
    const item=menuItems.find(x=>x.id===b.dataset.addVariant);if(!item)return;
    const label=prompt("Variant name (e.g. Half, Full, Regular):");if(!label||!label.trim())return;
    const price=Number(prompt("Variant price in rupees:","100"));
    if(!Number.isInteger(price)||price<1||price>1000000){toast("Enter a valid whole-number price.",true);return;}
    try{await api("",{action:"create_menu_variant",item_id:item.id,label:label.trim(),price});await refresh();toast("New product variant added.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-price]").forEach(b=>b.onclick=async()=>{
    const value=prompt("New price in rupees:",b.dataset.current);if(value===null)return;const price=Number(value);
    if(!Number.isInteger(price)||price<1||price>1000000){toast("Enter a valid whole-number price.",true);return;}
    try{await api("",{action:"update_menu_variant",variant_id:b.dataset.price,price});await refresh();toast("Menu price updated.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-reservation]").forEach(b=>b.onclick=async()=>{
    try{await api("",{action:"update_reservation_status",reservation_id:b.dataset.reservation,status:b.dataset.resStatus});await refresh();toast("Reservation updated.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-read]").forEach(b=>b.onclick=async()=>{
    const {error}=await supabase.from("notifications").update({is_read:true}).eq("id",b.dataset.read);if(error){toast(error.message,true);return;}await refresh();
  });
  const settingsForm=document.getElementById("settings-form");
  if(settingsForm)settingsForm.onsubmit=async e=>{
    e.preventDefault();
    const latRaw=document.getElementById("set-lat").value.trim(),lngRaw=document.getElementById("set-lng").value.trim();
    const lat=latRaw===""?null:Number(latRaw),lng=lngRaw===""?null:Number(lngRaw);
    const verified=document.getElementById("set-verified").checked;
    if(verified&&(lat===null||lng===null||!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180)){toast("Enter valid map-pin coordinates before verifying.",true);return;}
    const cod=document.getElementById("set-cod").checked,upi=document.getElementById("set-upi").checked,upiId=document.getElementById("set-upi-id").value.trim();
    if(upi&&(!upiId||!upiId.includes("@"))){toast("Enter a valid UPI ID before enabling manual UPI.",true);return;}
    const patch={
      name:document.getElementById("set-name").value.trim(),
      phone:document.getElementById("set-phone").value.trim(),
      address:document.getElementById("set-address").value.trim(),
      lat:lat,lng:lng,location_verified:verified,
      delivery_radius_m:Number(document.getElementById("set-radius").value),
      delivery_fee:Number(document.getElementById("set-fee").value),
      min_order:Number(document.getElementById("set-min").value),
      is_open:document.getElementById("set-open").checked,
      cod_enabled:cod,upi_enabled:upi,upi_id:upi?upiId:null,updated_at:new Date().toISOString()
    };
    if(!patch.name||!patch.address||!Number.isInteger(patch.delivery_radius_m)||patch.delivery_radius_m<100||!Number.isInteger(patch.delivery_fee)||patch.delivery_fee<0||!Number.isInteger(patch.min_order)||patch.min_order<0){toast("Check the restaurant details and numeric settings.",true);return;}
    const {error}=await supabase.from("restaurant_settings").update(patch).eq("id",1);
    if(error){toast(error.message,true);return;}
    await refresh();toast("Restaurant settings saved.");
  };
  const addCategory=document.getElementById("add-category");
  if(addCategory)addCategory.onclick=async()=>{
    const name=prompt("New category name:");if(!name||!name.trim())return;
    const {error}=await supabase.from("menu_categories").insert({name:name.trim(),active:true});
    if(error){toast(error.message,true);return;}await refresh();toast("Category added.");
  };
  const addItem=document.getElementById("add-item");
  if(addItem)addItem.onclick=async()=>{
    const name=prompt("Product name:");if(!name||name.trim().length<2)return;
    const categoryName=prompt("Category name (choose an existing category):",menuCategories[0]?.name||"");
    const match=menuCategories.find(x=>x.name.toLowerCase()===String(categoryName||"").trim().toLowerCase());
    if(!match){toast("Category not found. Add the category first.",true);return;}
    const description=prompt("Short product description:","Freshly prepared at Hurmat Darbar");if(description===null)return;
    const imageUrl=prompt("Food photo URL (https://), optional:","");if(imageUrl===null)return;
    if(imageUrl.trim()&&!imageUrl.trim().startsWith("https://")){toast("Photo URL must start with https://",true);return;}
    const veg=prompt("Food type: VEG or NON-VEG","NON-VEG");if(!["veg","non-veg"].includes(String(veg||"").trim().toLowerCase())){toast("Enter VEG or NON-VEG.",true);return;}
    const price=Number(prompt("Regular price in rupees:","100"));if(!Number.isInteger(price)||price<1){toast("Enter a valid price.",true);return;}
    const trackStock=confirm("Track inventory for this product? Choose OK to enter stock quantity; Cancel keeps stock unlimited.");
    let initialStock=null;
    if(trackStock){const raw=prompt("Current stock quantity:","0");if(raw===null)return;initialStock=Number(raw);if(!Number.isInteger(initialStock)||initialStock<0||initialStock>1000000){toast("Enter a whole number from 0 to 1,000,000.",true);return;}}
    const {data,error}=await supabase.from("menu_items").insert({category_id:match.id,name:name.trim(),description,image_url:imageUrl.trim()||null,is_veg:veg.trim().toLowerCase()==="veg",active:true,available:true,track_stock:trackStock,stock_qty:initialStock}).select("id").single();
    if(error){toast(error.message,true);return;}
    const variant=await supabase.from("menu_variants").insert({item_id:data.id,label:"Regular",price,active:true});
    if(variant.error){toast("Item saved, but price variant failed: "+variant.error.message,true);return;}
    await refresh();toast("Menu item added to the live website.");
  };
}
async async function startApp(){
  await refresh();
  if(channel)await supabase.removeChannel(channel);
  channel=supabase.channel("hurmat-admin-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"orders"},()=>refresh())
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications"},()=>{refresh();toast("New restaurant notification.");})
    .on("postgres_changes",{event:"*",schema:"public",table:"menu_items"},()=>refresh())
    .on("postgres_changes",{event:"*",schema:"public",table:"menu_variants"},()=>refresh())
    .on("postgres_changes",{event:"*",schema:"public",table:"reservations"},()=>refresh())
    .on("postgres_changes",{event:"*",schema:"public",table:"restaurant_settings"},()=>refresh())
    .subscribe();
}async function init(){
  try{if(await verifyAccess())await startApp();else loginView("");}
  catch(e){loginView(e.message||"Unable to verify account.");}
}
supabase.auth.onAuthStateChange((event,session)=>{
  if(event==="SIGNED_OUT"){if(channel)supabase.removeChannel(channel);user=null;role=null;loginView("You have signed out.");}
});
init();
