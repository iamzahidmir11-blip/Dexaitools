import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
const db=createClient("https://rvrboufrnkzuptfjopwd.supabase.co","sb_publishable_n1PWbHcomKpd63FPDdWSEw_iSo6UTi0");
document.getElementById("year").textContent=new Date().getFullYear();
document.querySelector(".hamb").onclick=()=>document.querySelector(".top").classList.toggle("nav-open");
const cats=document.getElementById("menu-categories"),grid=document.getElementById("menu-grid"),status=document.getElementById("menu-status"),panel=document.getElementById("cart-panel"),scrim=document.getElementById("cart-scrim");
let items=[],cat="all",query="",cart=[],selectedVariants={},restaurantSettings=null,placingOrder=false;try{cart=JSON.parse(localStorage.getItem("hd-cart")||"[]");if(!Array.isArray(cart))cart=[]}catch{cart=[]}
const money=n=>"₹"+Number(n).toLocaleString("en-IN");

function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n}
function toggleCart(on){panel.classList.toggle("open",on);scrim.classList.toggle("open",on)}
document.getElementById("open-cart").onclick=()=>toggleCart(true);document.getElementById("close-cart").onclick=()=>toggleCart(false);scrim.onclick=()=>toggleCart(false);
function renderCats(data){cats.replaceChildren();[ {id:"all",name:"All categories"},...data].forEach((x,i)=>{const b=el("button","chip"+(i===0?" active":""),x.name);b.dataset.cat=x.id;cats.append(b)});cats.onclick=e=>{const b=e.target.closest("[data-cat]");if(!b)return;cat=b.dataset.cat;cats.querySelectorAll(".chip").forEach(x=>x.classList.toggle("active",x===b));render()}}
function foodImage(item){return item.image_url&&item.image_url.startsWith("https://")?item.image_url:""}
function foodDescription(item){if(item.description&&item.description.trim())return item.description.trim();const category=(item.category_name||"").toLowerCase();if(category.includes("wazwan"))return "A traditional Kashmiri-style preparation, served fresh from the Hurmat Darbar kitchen.";if(category.includes("momo"))return "A flavourful momo favourite, prepared fresh and served hot.";if(category.includes("drink")||category.includes("breakfast"))return "A refreshing pick, prepared fresh for your table.";if(category.includes("fries"))return "Crisp, savoury comfort food made for sharing.";if(category.includes("soup"))return "A warm, comforting bowl prepared fresh to order.";if(category.includes("pasta"))return "A satisfying pasta favourite, freshly prepared.";return "A restaurant favourite, freshly prepared and served with care."}
function cartKey(itemId,variantId){return itemId+":"+variantId}
function cartQty(itemId,variantId){return cart.find(x=>x.key===cartKey(itemId,variantId))?.qty||0}
function render(){
  grid.replaceChildren();
  const list=items.filter(x=>(cat==="all"||x.category_id===cat)&&(!query||(x.name+" "+(x.description||"")+" "+x.category_name).toLowerCase().includes(query)));
  if(!list.length){grid.append(el("p","menu-empty","No matching items found."));return}
  list.forEach(x=>{
    const card=el("article","menu-card"),photo=el("div","food-photo"),image=el("img","food-image");
    const imageUrl=foodImage(x);image.alt=x.name+" food";image.loading="lazy";image.decoding="async";image.referrerPolicy="no-referrer";
    if(imageUrl){image.src=imageUrl;image.onerror=()=>{image.onerror=null;image.remove();photo.classList.add("photo-unavailable");photo.append(el("span","photo-label",x.name));};photo.append(image);}
    else{photo.classList.add("photo-unavailable");photo.append(el("span","photo-label",x.name));}
    const body=el("div","food-body"),type=el("span","food-type "+(x.is_veg?"veg":"nonveg"),x.is_veg?"VEG":"NON-VEG"),title=el("h3","",x.name);
    body.append(type,title,el("p","food-description",foodDescription(x)));
    const select=el("select","variant-select");
    x.menu_variants.forEach((v,n)=>{const opt=document.createElement("option");opt.value=String(n);opt.textContent=v.label+" · "+money(v.price);select.append(opt)});
    const savedVariantIndex=x.menu_variants.findIndex(v=>v.id===selectedVariants[x.id]);if(savedVariantIndex>=0)select.value=String(savedVariantIndex);
    const foot=el("div","food-bottom"),price=el("div","price-stack",money(x.menu_variants[0].price));
    price.append(el("small","","Selected price"));
    const add=el("button","add-btn card-add","Add to bag");
    add.type="button";add.disabled=x.available===false;
    const controls=el("div","menu-qty-control"),minus=el("button","qty-minus","−"),qty=el("span","qty-value","0"),plus=el("button","qty-plus","+");
    minus.type=plus.type="button";plus.disabled=x.available===false;
    const sync=()=>{
      const v=x.menu_variants[Number(select.value)],amount=cartQty(x.id,v.id);
      qty.textContent=String(amount);minus.disabled=amount===0;plus.disabled=x.available===false||amount>=50;price.firstChild.textContent=money(v.price);
      add.hidden=amount>0;controls.hidden=amount===0;
      add.textContent=x.available===false?"Unavailable":"Add to bag";
    };
    select.onchange=()=>{selectedVariants[x.id]=x.menu_variants[Number(select.value)].id;sync()};
    add.onclick=()=>{const v=x.menu_variants[Number(select.value)];addItem(x,v,false)};
    minus.onclick=()=>{const v=x.menu_variants[Number(select.value)];qtyChange(cartKey(x.id,v.id),-1)};
    plus.onclick=()=>{const v=x.menu_variants[Number(select.value)];addItem(x,v,false)};
    controls.append(minus,qty,plus);foot.append(price,add,controls);body.append(select,foot);card.append(photo,body);grid.append(card);sync();
  });
}
function addItem(item,v,open=true){const key=cartKey(item.id,v.id),old=cart.find(x=>x.key===key);if(old&&old.qty>=50){alert("Maximum 50 units per item.");return}selectedVariants[item.id]=v.id;if(old)old.qty++;else cart.push({key,item_id:item.id,variant_id:v.id,name:item.name,label:v.label,price:+v.price,qty:1});save();render();if(open)toggleCart(true)}
function save(){localStorage.setItem("hd-cart",JSON.stringify(cart));renderCart();checkoutState()}
function renderCart(){
  const root=document.getElementById("cart-lines");root.replaceChildren();let subtotal=0,count=0;
  cart.forEach(x=>{
    subtotal+=x.price*x.qty;count+=x.qty;
    const row=el("div","cart-line"),info=el("div","cart-item-info",x.name),small=el("small",""," "+x.label+" · "+money(x.price));
    info.append(small);
    const controls=el("div","qty-control"),minus=el("button","qty-minus","−"),qty=el("span","qty-value",x.qty),plus=el("button","qty-plus","+");
    minus.type=plus.type="button";minus.setAttribute("aria-label","Decrease "+x.name);plus.setAttribute("aria-label","Increase "+x.name);
    minus.onclick=()=>qtyChange(x.key,-1);plus.disabled=Number(x.qty)>=50;plus.onclick=()=>qtyChange(x.key,1);
    controls.append(minus,qty,plus);row.append(info,controls);root.append(row);
  });
  if(!cart.length)root.append(el("p","menu-empty","Your bag is empty. Add dishes from the menu."));
  document.getElementById("cart-count").textContent=count;
  document.getElementById("cart-subtotal").textContent=money(subtotal);
  document.getElementById("cart-total").textContent=money(subtotal+(cart.length?Number(restaurantSettings?.delivery_fee??30):0));
  const checkout=document.getElementById("checkout");if(checkout&&!placingOrder)checkout.disabled=!cart.length||!restaurantSettings?.is_open||!restaurantSettings?.location_verified||!(restaurantSettings?.cod_enabled||(restaurantSettings?.upi_enabled&&restaurantSettings?.upi_id));
}
function qtyChange(key,d){const x=cart.find(x=>x.key===key);if(!x)return;x.qty=Math.max(0,Math.min(50,Number(x.qty)+d));if(x.qty===0)cart=cart.filter(x=>x.key!==key);save();render()}
const paymentSelect=el("select","payment-method");
paymentSelect.id="payment-method";
const orderHelp=el("small","","Checking restaurant ordering setup…");
orderHelp.id="order-help";
const checkoutButton=document.getElementById("checkout");
checkoutButton.textContent="Place order";
checkoutButton.insertAdjacentElement("beforebegin",paymentSelect);
checkoutButton.insertAdjacentElement("afterend",orderHelp);
function checkoutState(){
  const fee=Number(restaurantSettings?.delivery_fee??30);
  const feeLabel=document.getElementById("delivery-fee-label");
  if(feeLabel)feeLabel.textContent=money(fee);
  const methods=[];
  if(restaurantSettings?.cod_enabled)methods.push({value:"cod",label:"Cash on delivery"});
  if(restaurantSettings?.upi_enabled&&restaurantSettings?.upi_id)methods.push({value:"upi_manual",label:"Manual UPI (staff verifies payment)"});
  paymentSelect.replaceChildren();
  methods.forEach(m=>{const o=document.createElement("option");o.value=m.value;o.textContent=m.label;paymentSelect.append(o);});
  if(!methods.length){const o=document.createElement("option");o.value="";o.textContent="No payment method enabled";paymentSelect.append(o);}
  const ready=cart.length>0&&!!restaurantSettings?.is_open&&!!restaurantSettings?.location_verified&&methods.length>0;
  checkoutButton.disabled=!ready||placingOrder||Number(document.getElementById("cart-subtotal").textContent.replace(/[^0-9]/g,""))<Number(restaurantSettings?.min_order||0);
  orderHelp.textContent=!restaurantSettings?"Restaurant setup could not be loaded.":
    !restaurantSettings.is_open?"The restaurant is currently not accepting orders.":
    !restaurantSettings.location_verified?"Online delivery is not enabled: restaurant map location still needs verification.":
    !methods.length?"Online ordering is paused until the restaurant enables a payment method.":Number(document.getElementById("cart-subtotal").textContent.replace(/[^0-9]/g,""))<Number(restaurantSettings?.min_order||0)?"Minimum order is "+money(restaurantSettings.min_order)+". Add more items to continue.":"Your order will be saved directly to the restaurant order system.";
}
function getPosition(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error("This browser does not support location. Please use a device with location access."));
    navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude}),()=>reject(new Error("Location permission is required to check delivery coverage.")),{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
  });
}
checkoutButton.onclick=async()=>{
  if(placingOrder)return;
  if(!cart.length)return alert("Your bag is empty.");
  if(!restaurantSettings?.is_open||!restaurantSettings?.location_verified||!paymentSelect.value){checkoutState();return;}
  const name=document.getElementById("customer-name").value.trim();
  const phone=document.getElementById("customer-phone").value.trim();
  const address=document.getElementById("customer-address").value.trim();
  const notes=document.getElementById("customer-notes").value.trim();
  if(name.length<2||address.length<8||phone.replace(/\D/g,"").length<10)return alert("Enter your name, valid mobile number and complete delivery address.");
  placingOrder=true;checkoutButton.disabled=true;checkoutButton.textContent="Submitting order…";
  try{
    const position=await getPosition();
    let {data:{session}}=await db.auth.getSession();
    if(!session){
      const anon=await db.auth.signInAnonymously();
      if(anon.error)throw new Error("Secure guest checkout is not enabled on the restaurant account yet. Please contact the restaurant.");
      session=anon.data.session;
    }
    const payload={
      name:name,phone:phone,address:address,lat:position.lat,lng:position.lng,notes:notes,
      payment_method:paymentSelect.value,
      idempotency_key:(crypto.randomUUID?crypto.randomUUID():"hd-"+Date.now()+"-"+Math.random().toString(36).slice(2)),
      items:cart.map(x=>({variant_id:x.variant_id,qty:Math.max(1,Math.min(50,Number(x.qty)||1))}))
    };
    const response=await fetch("https://rvrboufrnkzuptfjopwd.supabase.co/functions/v1/restaurant-api",{
      method:"POST",headers:{"Content-Type":"application/json","apikey":"sb_publishable_n1PWbHcomKpd63FPDdWSEw_iSo6UTi0","Authorization":"Bearer "+session.access_token},
      body:JSON.stringify({action:"create_order",order:payload})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.code||result.error||"Order could not be submitted.");
    const order=result.order||{};
    cart=[];save();toggleCart(false);
    alert("Order received successfully.\nOrder #"+(order.order_no||"")+"\nTotal: "+money(order.total||0)+"\nKeep your tracking reference safe: "+(order.tracking_token||""));
    document.getElementById("customer-name").value="";
    document.getElementById("customer-phone").value="";
    document.getElementById("customer-address").value="";
    document.getElementById("customer-notes").value="";
  }catch(error){alert(error.message||"Unable to submit the order.");}
  finally{placingOrder=false;checkoutButton.textContent="Place order";checkoutState();}
};
async function load(){
  status.textContent="Loading live menu and restaurant settings…";
  const [a,b,c]=await Promise.all([
    db.from("menu_categories").select("id,name,sort_order").eq("active",true).order("sort_order"),
    db.from("menu_items").select("id,category_id,name,description,image_url,is_veg,available,sort_order,menu_categories(name),menu_variants(id,label,price,sort_order,active)").eq("active",true).order("sort_order"),
    db.from("restaurant_settings").select("name,is_open,location_verified,lat,lng,delivery_fee,min_order,cod_enabled,upi_enabled,upi_id").eq("id",1).single()
  ]);
  if(a.error||b.error){status.textContent="Menu unavailable. Please call +91 97971 51590.";return;}
  if(c.error){status.textContent="Menu is live, but checkout settings are unavailable. Please call the restaurant.";return;}
  restaurantSettings=c.data;
  items=(b.data||[]).map(x=>({...x,category_name:x.menu_categories?.name||"",menu_variants:(x.menu_variants||[]).filter(v=>v.active!==false&&v.price!==null).sort((p,q)=>p.sort_order-q.sort_order)})).filter(x=>x.menu_variants.length);
  cart=cart.flatMap(line=>{const item=items.find(x=>x.id===line.item_id&&x.available!==false),variant=item?.menu_variants.find(v=>v.id===line.variant_id);return item&&variant?[{...line,key:cartKey(item.id,variant.id),name:item.name,label:variant.label,price:Number(variant.price),qty:Math.max(1,Math.min(50,Number(line.qty)||1))}]:[]});
  localStorage.setItem("hd-cart",JSON.stringify(cart));
  renderCats(a.data||[]);
  status.textContent=items.length+" menu items loaded · live restaurant prices";
  const search=el("input","menu-search");search.placeholder="Search dishes, drinks and more…";search.oninput=()=>{query=search.value.toLowerCase().trim();render();};
  const tools=el("div","menu-tools");tools.append(search);cats.after(tools);render();renderCart();checkoutState();
}
renderCart();load();if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}))}
const reservationForm=document.getElementById("reservation-form");
if(reservationForm)reservationForm.addEventListener("submit",async e=>{
 e.preventDefault();const button=reservationForm.querySelector("button[type=submit]"),message=document.getElementById("res-message");
 const name=document.getElementById("res-name").value.trim(),phone=document.getElementById("res-phone").value.trim(),party=Number(document.getElementById("res-party").value),when=document.getElementById("res-time").value,notes=document.getElementById("res-notes").value.trim();
 if(name.length<2||phone.replace(/[^0-9]/g,"").length<10||!Number.isInteger(party)||party<1||party>30||!when||new Date(when)<=new Date()){message.textContent="Please check your name, mobile number, guest count and future date/time.";return;}
 button.disabled=true;button.textContent="Sending request…";
 try{const {error}=await db.from("reservations").insert({name,phone,party_size:party,reserve_at:new Date(when).toISOString(),notes:notes||null,status:"pending"});if(error)throw error;message.textContent="Reservation request received. The restaurant will confirm it.";reservationForm.reset();document.getElementById("res-party").value="2";}
 catch(err){message.textContent="Could not send request: "+(err.message||"Please call the restaurant.");}
 finally{button.disabled=false;button.textContent="Request reservation ↗";}
});
const trackingForm=document.getElementById("tracking-form");
if(trackingForm)trackingForm.addEventListener("submit",async e=>{
 e.preventDefault();const button=trackingForm.querySelector("button[type=submit]"),box=document.getElementById("tracking-result"),token=document.getElementById("tracking-token").value.trim();
 if(token.length<16){box.textContent="Enter the complete tracking reference.";return;}
 button.disabled=true;button.textContent="Checking…";box.replaceChildren();
 try{const {data,error}=await db.rpc("track_order",{p_token:token});if(error)throw error;if(!data){box.textContent="No order found for this tracking reference.";return;}
 const heading=el("b","", "Order #"+data.order_no+" · "+String(data.status||"").replaceAll("_"," "));
 box.append(heading);(data.items||[]).forEach(it=>box.append(el("p","",it.qty+" × "+it.name+" ("+it.variant+")")));
 box.append(el("p","tracking-total","Total "+money(data.total)));
 (data.history||[]).forEach(h=>box.append(el("small","tracking-step",String(h.status).replaceAll("_"," ")+" · "+new Date(h.at).toLocaleString())));
 }catch(err){box.textContent="Tracking is temporarily unavailable: "+(err.message||"Try again later.");}
 finally{button.disabled=false;button.textContent="Track order ↗";}
});
