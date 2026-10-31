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
const tabs = [["home","⌂","Home"],["orders","▤","Orders"],["menu","▦","Menu"],["reservations","▣","Bookings"],["riders","♧","Riders"],["alerts","♢","Alerts"],["settings","⚙","Settings"]];
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
  return '<header><div class="logo">HD</div><div class="brand">HURMAT DARBAR</div><span class="pill">'+esc(role||"STAFF").toUpperCase()+'</span><button class="btn ghost sm" id="signout">Sign out</button></header>';
}
function shell(title,desc,content){
  root.innerHTML=header()+'<h1>'+esc(title)+'</h1><p class="sub">'+esc(desc||"Live data from the restaurant database.")+'</p>'+content;
  document.getElementById("signout").onclick=async()=>{if(channel)await supabase.removeChannel(channel);await supabase.auth.signOut();user=null;role=null;loginView("You have signed out.");};
}
function card(title,body){return '<section class="card" style="margin:10px 0"><h2 style="margin:0 0 12px">'+title+'</h2>'+body+'</section>';}
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
  const pending=orders.filter(o=>o.status==="pending_confirmation").length;
  const active=orders.filter(o=>!["delivered","cancelled","rejected"].includes(o.status)).length;
  const sales=orders.filter(o=>o.status==="delivered").reduce((a,o)=>a+Number(o.total||0),0);
  return '<div class="grid"><div class="card stat"><span>Orders in system</span><b>'+orders.length+'</b></div><div class="card stat"><span>Awaiting confirmation</span><b>'+pending+'</b></div><div class="card stat"><span>Active orders</span><b>'+active+'</b></div><div class="card stat"><span>Delivered value</span><b>'+money(sales)+'</b></div></div>'+
    card("Latest orders",orders.slice(0,5).map(orderCard).join("")||empty("No real orders have been received yet."))+
    card("System connection",'<p class="good">Connected to Supabase</p><p class="mute">Signed in as '+esc(user.email||"verified account")+' · '+esc(role)+' role</p><p class="mute">Live order and notification updates are enabled while this panel is open.</p>');
}
function ordersView(){return orders.map(orderCard).join("")||empty("No customer orders in the database yet.");}
function menuView(){
  const search='<div class="store-toolbar"><input id="menu-search" type="search" placeholder="Search products, e.g. Chicken Biryani"><select id="menu-filter"><option value="all">All products</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="stock">Stock tracking on</option><option value="low">Low stock</option><option value="out">Out of stock</option></select><button class="btn" id="add-category">+ Category</button><button class="btn" id="add-item">+ Add product</button></div>';
  const cards=menuItems.map(i=>{
    const photo=i.image_url?'<img src="'+esc(i.image_url)+'" alt="'+esc(i.name)+'" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'"><div class="store-photo-fallback" style="display:none">HD</div>':'<div class="store-photo-fallback">HD</div>';
    const variants=(i.menu_variants||[]).map(v=>'<div class="store-variant"><span>'+esc(v.label)+' <b>'+money(v.price)+'</b> '+(v.active?'':'<small>Hidden</small>')+'</span><div class="actions"><button class="btn ghost sm" data-price="'+esc(v.id)+'" data-current="'+esc(v.price)+'">Price</button><button class="btn ghost sm" data-variant-toggle="'+esc(v.id)+'" data-active="'+String(v.active)+'">'+(v.active?'Hide':'Enable')+'</button></div></div>').join("");
    const stock=Number(i.stock_qty||0);
    const stockBlock=i.track_stock?'<div class="inventory-panel"><div><small>INVENTORY ON HAND</small><b class="inventory-number">'+stock+'</b><small>units available</small></div><div class="inventory-stepper"><button class="qty-step" data-stock-minus="'+esc(i.id)+'" data-stock="'+stock+'" '+(stock<=0?'disabled':'')+'>−</button><button class="qty-step" data-stock-plus="'+esc(i.id)+'" data-stock="'+stock+'">+</button><button class="btn ghost sm" data-stock-set="'+esc(i.id)+'">Set</button></div><span class="stock-state '+(stock===0?'out':stock<=5?'low':'in')+'">'+(stock===0?'Out of stock':stock<=5?'Low stock':'In stock')+'</span></div>':'<div class="inventory-panel inventory-off"><span>Inventory not tracked</span><button class="btn ghost sm" data-stock-enable="'+esc(i.id)+'">Set stock quantity</button></div>';
    return '<article class="store-product" data-product-card data-name="'+esc((i.name+" "+(i.description||"")+" "+(i.menu_categories?.name||"")).toLowerCase())+'" data-published="'+String(i.active)+'" data-tracked="'+String(i.track_stock)+'" data-stock-value="'+stock+'"><div class="store-product-photo">'+photo+'<span class="store-photo-type">'+(i.is_veg?'VEG':'NON-VEG')+'</span><span class="store-publish-tag '+(i.active?'published':'hidden')+'">'+(i.active?'PUBLISHED':'HIDDEN')+'</span></div><div class="store-product-info"><div class="store-product-heading"><div><small>'+esc(i.menu_categories?.name||"Uncategorised")+'</small><h3>'+esc(i.name)+'</h3></div><b class="store-product-price">'+money(Math.min(...(i.menu_variants||[]).filter(v=>v.active&&v.price!==null).map(v=>Number(v.price)).concat([0]).filter(n=>n>0))||0)+'</b></div><p>'+esc(i.description||"No product description added.")+'</p>'+stockBlock+'<div class="store-variants"><div class="store-section-label">PRICE & VARIANTS</div>'+(variants||'<small>No active variants configured.</small>')+'</div><div class="store-product-actions"><button class="btn ghost sm" data-upload-image="'+esc(i.id)+'">Upload photo</button><button class="btn ghost sm" data-edit-item="'+esc(i.id)+'">Edit details</button><button class="btn ghost sm" data-toggle="'+esc(i.id)+'" data-available="'+String(i.available)+'">'+(i.available?'Pause':'Enable')+'</button><button class="btn sm" data-publish="'+esc(i.id)+'" data-active="'+String(i.active)+'">'+(i.active?'Hide product':'Publish product')+'</button></div></div></article>';
  }).join("");
  const catCards=menuCategories.map(c=>'<span class="store-category-chip">'+esc(c.name)+'</span>').join("");
  return '<div class="store-intro"><div><span class="store-kicker">HURMAT DARBAR · COMMERCE</span><h2>Product Store</h2><p>Manage the complete customer catalogue from one place. Photos, pricing, variants, publishing and stock all sync to the live website.</p></div><div class="store-metrics"><div><small>PRODUCTS</small><b>'+menuItems.length+'</b></div><div><small>PUBLISHED</small><b>'+menuItems.filter(i=>i.active).length+'</b></div><div><small>TRACKED STOCK</small><b>'+menuItems.filter(i=>i.track_stock).length+'</b></div><div><small>OUT OF STOCK</small><b>'+menuItems.filter(i=>i.track_stock&&Number(i.stock_qty||0)===0).length+'</b></div></div></div>'+search+'<div class="store-category-list">'+catCards+'</div><div class="store-product-grid" id="store-product-grid">'+(cards||empty("No products yet. Add your first product."))+'</div>';
}
function reservationsView(){
  return reservations.map(r=>'<article class="card" style="margin:10px 0"><div class="row"><b>'+esc(r.name)+'</b><span class="tag s-new">'+esc(r.status)+'</span></div><p class="mute">'+esc(r.phone)+' · '+esc(r.party_size)+' guests</p><p class="mute">'+new Date(r.reserve_at).toLocaleString()+'</p><p class="mute">'+esc(r.notes||"")+'</p><div class="actions">'+["confirmed","rejected","cancelled"].filter(s=>r.status==="pending"||s==="cancelled").map(s=>'<button class="btn sm '+(s==="cancelled"?"ghost":"")+'" data-reservation="'+esc(r.id)+'" data-res-status="'+s+'">'+s+'</button>').join("")+'</div></article>').join("")||empty("No reservations have been received.");
}
function ridersView(){
  return riders.map(r=>'<div class="item-row"><div class="item-meta"><b>'+esc(r.name||"Rider")+'</b><span class="mute">'+esc(r.phone||"No phone on file")+'</span></div><span class="tag '+(r.is_online?"s-ready":"s-served")+'">'+(r.is_online?"Online":"Offline")+'</span></div>').join("")||empty("No rider accounts are linked yet.");
}
function alertsView(){
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
  const titles={home:["Dashboard","Live restaurant operations."],orders:["Orders","Customer orders stored in Supabase."],menu:["Menu management","Changes here update the customer website menu."],reservations:["Reservations","Real customer booking requests."],riders:["Delivery riders","Accounts with an active rider role."],alerts:["Notifications","Live notifications from the database."],settings:["Restaurant settings","Current verified operational configuration."]};
  const t=titles[page]||titles.home;
  let content=page==="home"?homeView():page==="orders"?ordersView():page==="menu"?menuView():page==="reservations"?reservationsView():page==="riders"?ridersView():page==="alerts"?alertsView():settingsView();
  shell(t[0],t[1],content);
  bindActions();
}
async function refresh(){
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
async function startApp(){
  await refresh();
  if(channel)await supabase.removeChannel(channel);
  channel=supabase.channel("hurmat-admin-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"orders"},()=>refresh())
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications"},()=>{refresh();toast("New restaurant notification.");})
    .subscribe();
}
async function init(){
  try{if(await verifyAccess())await startApp();else loginView("");}
  catch(e){loginView(e.message||"Unable to verify account.");}
}
supabase.auth.onAuthStateChange((event,session)=>{
  if(event==="SIGNED_OUT"){if(channel)supabase.removeChannel(channel);user=null;role=null;loginView("You have signed out.");}
});
init();
