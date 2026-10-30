const $=id=>document.getElementById(id);
const data={
orders:[
{id:"HD-1048",name:"Ayaan Khan",type:"Delivery",status:"Pending",amount:1010,pay:"UPI pending",items:"Wazwan Platter ×1, Kahwa ×2"},
{id:"HD-1047",name:"Sara Ahmad",type:"Pickup",status:"Preparing",amount:560,pay:"Cash on delivery",items:"Chicken Biryani ×2"},
{id:"HD-1046",name:"Ibrahim Mir",type:"Delivery",status:"Ready",amount:400,pay:"UPI demo paid",items:"Seekh Kebab ×1, Roti ×4"},
{id:"HD-1045",name:"Zoya",type:"Delivery",status:"Delivered",amount:290,pay:"Cash",items:"Paneer Special ×1"}],
menu:[{name:"Wazwan Platter",category:"Wazwan",price:850,availability:"Available"},{name:"Chicken Biryani",category:"Rice",price:280,availability:"Available"},{name:"Seekh Kebab",category:"Starters",price:320,availability:"Available"},{name:"Kahwa",category:"Beverages",price:80,availability:"Available"},{name:"Paneer Special",category:"Main Course",price:290,availability:"Unavailable"}],
inventory:[{name:"Chicken",stock:8,unit:"kg",min:5},{name:"Rice",stock:24,unit:"kg",min:10},{name:"Paneer",stock:2,unit:"kg",min:4},{name:"Cooking oil",stock:3,unit:"L",min:5},{name:"Kashmiri spices",stock:7,unit:"kg",min:3}],
riders:[{name:"Danish",phone:"Demo contact",zone:"Uri Market",status:"Available",deliveries:12},{name:"Sameer",phone:"Demo contact",zone:"Tehsil Road",status:"On delivery",deliveries:8},{name:"Adil",phone:"Demo contact",zone:"Uri",status:"Offline",deliveries:5}],
reservations:[{guest:"Areeba",date:"Today · 7:30 PM",guests:4,status:"Confirmed"},{guest:"Musaib",date:"Today · 8:00 PM",guests:2,status:"Pending"},{guest:"Hina",date:"Tomorrow · 1:00 PM",guests:6,status:"Confirmed"}],
customers:[{name:"Ayaan Khan",orders:6,spent:4250,last:"Today"},{name:"Sara Ahmad",orders:3,spent:1890,last:"Today"},{name:"Ibrahim Mir",orders:9,spent:6120,last:"Yesterday"}],
staff:[{name:"Demo Owner",role:"Owner",access:"Full access"},{name:"Demo Manager",role:"Manager",access:"Operations"},{name:"Demo Cashier",role:"Cashier",access:"Billing only"},{name:"Demo Kitchen",role:"Kitchen",access:"Order preparation"}],
payments:[{ref:"PAY-2081",order:"HD-1048",method:"UPI",amount:1010,status:"Pending"},{ref:"PAY-2080",order:"HD-1047",method:"Cash",amount:560,status:"Due on delivery"},{ref:"PAY-2079",order:"HD-1046",method:"UPI",amount:400,status:"Demo paid"}],
support:[{id:"T-021",from:"Ayaan Khan",topic:"Order timing",status:"Open"},{id:"T-020",from:"Sara Ahmad",topic:"Menu question",status:"In review"}]};
const pages={
overview:["Overview dashboard.","Restaurant operations at a glance."],
orders:["Order management.","Review orders and simulate status changes."],
menu:["Menu & categories.","Preview menu items, prices and availability."],
inventory:["Inventory control.","Monitor stock levels and low-stock alerts."],
riders:["Delivery riders.","View rider availability and demo assignments."],
reservations:["Reservations.","Review table bookings and guest counts."],
customers:["Customers.","Sample customer history and order activity."],
staff:["Staff & roles.","Preview staff roles and access boundaries."],
payments:["Payments & settlements.","Sample payment ledger; no money is moved."],
support:["Customer support.","Sample tickets and response workflow."],
reports:["Reports & analytics.","Illustrative figures generated from sample records."],
settings:["Restaurant settings.","Preview operating details and configuration categories."]};
let current="overview";
const money=n=>"₹"+Number(n).toLocaleString("en-IN");
function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join("")+'</tr></thead><tbody>'+rows+'</tbody></table></div>'}
function action(label,attrs=""){return '<button class="small-action" '+attrs+'>'+label+'</button>'}
function render(){
const p=pages[current];$("page-title").innerHTML=p[0].replace(" dashboard."," <i>dashboard.</i>");$("page-desc").textContent=p[1];
document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===current));
let out="";
if(current==="overview"){
out='<div class="stats"><article class="glass"><small>TODAY\'S SAMPLE ORDERS</small><strong>'+data.orders.length+'</strong><span>Fictional records</span></article><article class="glass"><small>SAMPLE REVENUE</small><strong>'+money(data.orders.reduce((a,x)=>a+x.amount,0))+'</strong><span>Not actual earnings</span></article><article class="glass"><small>LOW STOCK ALERTS</small><strong>'+data.inventory.filter(x=>x.stock<=x.min).length+'</strong><span>Items at/below threshold</span></article><article class="glass"><small>ACTIVE RIDERS</small><strong>'+data.riders.filter(x=>x.status!=="Offline").length+'</strong><span>Demo availability</span></article></div><div class="section-head"><h2>Recent orders</h2>'+action("View all",'data-go="orders"')+'</div>'+table(["Order","Customer","Type","Status","Total"],data.orders.slice(0,4).map(o=>'<tr><td>'+o.id+'</td><td>'+o.name+'</td><td>'+o.type+'</td><td><span class="pill">'+o.status+'</span></td><td>'+money(o.amount)+'</td></tr>').join(""))+'<div class="quick-grid">'+["menu","inventory","riders","reservations"].map(k=>'<button class="quick glass" data-go="'+k+'">'+pages[k][0]+' <span>Open →</span></button>').join("")+'</div>';
}else if(current==="orders"){
out='<div class="section-head"><h2>All sample orders</h2><input id="filter" placeholder="Search order or customer"></div><div id="table-slot">'+ordersTable()+'</div>';
}else if(current==="menu"){
out='<div class="section-head"><h2>Menu catalogue</h2>'+action("+ Add sample item",'data-add="menu"')+'</div>'+table(["Item","Category","Price","Availability","Action"],data.menu.map((x,i)=>'<tr><td>'+x.name+'</td><td>'+x.category+'</td><td>'+money(x.price)+'</td><td><span class="pill">'+x.availability+'</span></td><td>'+action("Toggle",'data-toggle="menu" data-index="'+i+'"')+'</td></tr>').join(""));
}else if(current==="inventory"){
out='<div class="alert">Low stock: '+data.inventory.filter(x=>x.stock<=x.min).map(x=>x.name).join(", ")+'</div>'+table(["Ingredient","Stock","Unit","Minimum","Status","Action"],data.inventory.map((x,i)=>'<tr><td>'+x.name+'</td><td>'+x.stock+'</td><td>'+x.unit+'</td><td>'+x.min+'</td><td><span class="pill">'+(x.stock<=x.min?"Low stock":"Healthy")+'</span></td><td>'+action("+1",'data-stock="'+i+'"')+'</td></tr>').join(""));
}else if(current==="riders"){
out='<div class="section-head"><h2>Rider roster</h2>'+action("Add demo rider",'data-add="riders"')+'</div>'+table(["Rider","Contact","Zone","Status","Completed","Action"],data.riders.map((x,i)=>'<tr><td>'+x.name+'</td><td>'+x.phone+'</td><td>'+x.zone+'</td><td><span class="pill">'+x.status+'</span></td><td>'+x.deliveries+'</td><td>'+action("Change status",'data-rider="'+i+'"')+'</td></tr>').join(""));
}else if(current==="reservations"){
out='<div class="section-head"><h2>Booking calendar</h2>'+action("Add booking",'data-add="reservations"')+'</div>'+table(["Guest","Date & time","Guests","Status","Action"],data.reservations.map((x,i)=>'<tr><td>'+x.guest+'</td><td>'+x.date+'</td><td>'+x.guests+'</td><td><span class="pill">'+x.status+'</span></td><td>'+action("Update",'data-res="'+i+'"')+'</td></tr>').join(""));
}else if(current==="customers"){
out=table(["Customer","Orders","Sample spend","Last activity"],data.customers.map(x=>'<tr><td>'+x.name+'</td><td>'+x.orders+'</td><td>'+money(x.spent)+'</td><td>'+x.last+'</td></tr>').join(""));
}else if(current==="staff"){
out='<div class="alert">Role permissions are illustrative only. No real staff accounts exist in demo mode.</div>'+table(["Staff profile","Role","Access preview"],data.staff.map(x=>'<tr><td>'+x.name+'</td><td>'+x.role+'</td><td>'+x.access+'</td></tr>').join(""));
}else if(current==="payments"){
out='<div class="alert">Payment records are fictional. No payment gateway is connected and no transaction can be initiated.</div>'+table(["Reference","Order","Method","Amount","Status"],data.payments.map(x=>'<tr><td>'+x.ref+'</td><td>'+x.order+'</td><td>'+x.method+'</td><td>'+money(x.amount)+'</td><td><span class="pill">'+x.status+'</span></td></tr>').join(""));
}else if(current==="support"){
out='<div class="section-head"><h2>Support inbox</h2>'+action("Create sample ticket",'data-add="support"')+'</div>'+table(["Ticket","Customer","Topic","Status","Action"],data.support.map((x,i)=>'<tr><td>'+x.id+'</td><td>'+x.from+'</td><td>'+x.topic+'</td><td><span class="pill">'+x.status+'</span></td><td>'+action("Resolve",'data-ticket="'+i+'"')+'</td></tr>').join(""));
}else if(current==="reports"){
out='<div class="stats"><article class="glass"><small>ORDERS</small><strong>'+data.orders.length+'</strong></article><article class="glass"><small>GROSS SAMPLE VALUE</small><strong>'+money(data.orders.reduce((a,x)=>a+x.amount,0))+'</strong></article><article class="glass"><small>AVG. ORDER VALUE</small><strong>'+money(Math.round(data.orders.reduce((a,x)=>a+x.amount,0)/data.orders.length))+'</strong></article></div><div class="glass report"><h2>Order status breakdown</h2>'+Object.entries(data.orders.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{})).map(([k,v])=>'<p>'+k+' <b>'+v+'</b></p>').join("")+'</div>';
}else{
out='<div class="settings-grid">'+[["Restaurant profile","Name, address, phone and opening hours"],["Order preferences","Pickup, delivery and preparation estimates"],["Delivery zones","Service areas and delivery fee examples"],["Notifications","New order and reservation alert preferences"],["Tax & invoices","Illustrative tax and receipt settings"],["Security & access","Production login and Owner approval — not active"]].map(x=>'<article class="glass setting"><b>'+x[0]+'</b><p>'+x[1]+'</p>'+action("Preview",'data-setting="'+x[0]+'"')+'</article>').join("")+'</div>';
}
$("page-content").innerHTML=out;
}
function ordersTable(list=data.orders){return table(["Order","Customer","Type","Items","Status","Total","Action"],list.map((o)=>'<tr><td>'+o.id+'</td><td>'+o.name+'</td><td>'+o.type+'</td><td>'+o.items+'</td><td><span class="pill">'+o.status+'</span></td><td>'+money(o.amount)+'</td><td>'+action("Next status",'data-order="'+o.id+'"')+'</td></tr>').join(""))}
function reset(){location.reload()}
$("nav").addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(b){current=b.dataset.page;render()}});
$("page-content").addEventListener("click",e=>{
const b=e.target.closest("button");if(!b)return;
if(b.dataset.go){current=b.dataset.go;render();return}
if(b.dataset.order){const o=data.orders.find(x=>x.id===b.dataset.order);const steps=["Pending","Confirmed","Preparing","Ready","Picked up","Delivered"];o.status=steps[(steps.indexOf(o.status)+1)%steps.length];render();return}
if(b.dataset.toggle==="menu"){const x=data.menu[+b.dataset.index];x.availability=x.availability==="Available"?"Unavailable":"Available";render();return}
if(b.dataset.stock!==undefined){data.inventory[+b.dataset.stock].stock++;render();return}
if(b.dataset.rider!==undefined){const x=data.riders[+b.dataset.rider];x.status=x.status==="Available"?"On delivery":x.status==="On delivery"?"Offline":"Available";render();return}
if(b.dataset.res!==undefined){const x=data.reservations[+b.dataset.res];x.status=x.status==="Pending"?"Confirmed":"Pending";render();return}
if(b.dataset.ticket!==undefined){data.support[+b.dataset.ticket].status="Resolved";render();return}
if(b.dataset.add){const kind=b.dataset.add;if(kind==="menu")data.menu.push({name:"New demo dish",category:"Specials",price:250,availability:"Available"});if(kind==="riders")data.riders.push({name:"New demo rider",phone:"Demo contact",zone:"Uri",status:"Available",deliveries:0});if(kind==="reservations")data.reservations.push({guest:"Demo guest",date:"Tomorrow · 6:00 PM",guests:2,status:"Pending"});if(kind==="support")data.support.push({id:"T-0"+(22+data.support.length),from:"Demo guest",topic:"New enquiry",status:"Open"});render();return}
if(b.dataset.setting)alert(b.dataset.setting+" is a preview-only setting.");
});
$("page-content").addEventListener("input",e=>{if(e.target.id==="filter"){const q=e.target.value.toLowerCase();const slot=$("table-slot");if(slot)slot.innerHTML=ordersTable(data.orders.filter(o=>(o.id+" "+o.name+" "+o.status).toLowerCase().includes(q)))}});
$("reset").addEventListener("click",reset);render();