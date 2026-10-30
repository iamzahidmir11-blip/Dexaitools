package com.hurmatdarbar.delivery
import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.content.Intent
import android.net.Uri
import android.widget.*
import org.json.JSONObject
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.io.OutputStreamWriter
import java.util.concurrent.Executors

class MainActivity : Activity() {
 private val base="https://rvrboufrnkzuptfjopwd.supabase.co"
 private val apiKey="sb_publishable_n1PWbHcomKpd63FPDdWSEw_iSo6UTi0"
 private val worker=Executors.newSingleThreadExecutor()
 private var token:String?=null
 private var online=false
 private lateinit var root:LinearLayout
 private lateinit var status:TextView
 private val ink=Color.rgb(33,31,24); private val gold=Color.rgb(181,138,75); private val paper=Color.rgb(245,241,232)
 override fun onCreate(savedInstanceState:Bundle?) { super.onCreate(savedInstanceState); login() }
 private fun setup(title:String) {
  root=LinearLayout(this).apply { orientation=1; setPadding(22,24,22,24); setBackgroundColor(paper) }
  root.addView(TextView(this).apply { text="H U R M A T   D A R B A R"; textSize=13f; setTextColor(gold) })
  root.addView(TextView(this).apply { text=title; textSize=27f; setTextColor(ink); setPadding(0,12,0,10) })
  status=TextView(this).apply { text="Ready"; textSize=13f; setTextColor(Color.DKGRAY); setPadding(0,4,0,12) }; root.addView(status)
  setContentView(ScrollView(this).apply { addView(root) })
 }
 private fun label(s:String,size:Float=14f)=TextView(this).apply { text=s; textSize=size; setTextColor(ink); setPadding(0,6,0,6) }
 private fun button(s:String,action:()->Unit)=Button(this).apply { text=s; isAllCaps=false; setOnClickListener { action() } }
 private fun field(s:String,secret:Boolean=false)=EditText(this).apply { hint=s; setSingleLine(true); if(secret) inputType=129 }
 private fun login() {
  setup("Rider Sign In")
  root.addView(label("Use the rider account created by the restaurant owner."))
  val email=field("Email address"); email.inputType=33
  val pass=field("Password",true); root.addView(email); root.addView(pass)
  root.addView(button("Sign in") {
   val e=email.text.toString().trim(); val p=pass.text.toString()
   if(e.isBlank()||p.isBlank()){status.text="Email and password required.";return@button}
   status.text="Signing in…"
   worker.execute { try {
    val s=request(base+"/auth/v1/token?grant_type=password","POST",JSONObject().put("email",e).put("password",p).toString(),null)
    val t=s.optString("access_token"); if(t.isBlank()) throw Exception("No access token returned")
    token=t; runOnUiThread { orders() }
   } catch(ex:Exception){runOnUiThread{status.text=message(ex)}} }
  })
 }
 private fun orders() {
  setup("My Deliveries")
  root.addView(button(if(online) "Go Offline" else "Go Online"){availability(!online)})
  root.addView(button("Refresh"){orders()})
  root.addView(button("Sign Out"){token=null;online=false;login()})
  status.text="Loading assigned orders…"
  worker.execute { try {
   val rows=request(base+"/functions/v1/restaurant-api","GET",null,token).optJSONArray("orders")?:JSONArray()
   runOnUiThread {
    status.text=rows.length().toString()+" assigned order(s)"
    if(rows.length()==0) root.addView(label("No assigned deliveries. Wait for the manager to assign an order."))
    for(i in 0 until rows.length()) render(rows.optJSONObject(i)?:continue)
   }
  } catch(ex:Exception){runOnUiThread{status.text=message(ex)}} }
 }
 private fun render(o:JSONObject) {
  val card=LinearLayout(this).apply{orientation=1;setPadding(14,12,14,12);setBackgroundColor(Color.WHITE)}
  val id=o.optString("id"); val state=o.optString("status")
  card.addView(label("Order #"+o.optString("order_no")+" • "+state.replace('_',' '),17f))
  card.addView(label(o.optString("customer_name")+" • "+o.optString("customer_phone")))
  card.addView(label(o.optString("address_text")))
  card.addView(label("Payment: "+o.optString("payment_method")+" ("+o.optString("payment_status")+")"))
  card.addView(label("Total: ₹"+o.optInt("total")))
  val items=o.optJSONArray("order_items")?:JSONArray()
  for(i in 0 until items.length()){val it=items.optJSONObject(i)?:continue;card.addView(label("• "+it.optString("item_name")+" — "+it.optString("variant_label")+" × "+it.optInt("qty"),13f))}
  val lat=o.optDouble("lat",Double.NaN);val lng=o.optDouble("lng",Double.NaN)
  if(lat.isFinite()&&lng.isFinite()) card.addView(button("Navigate to customer"){
   val uri=Uri.parse("google.navigation:q="+lat+","+lng)
   try{startActivity(Intent(Intent.ACTION_VIEW,uri).setPackage("com.google.android.apps.maps"))}
   catch(_:Exception){startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://www.google.com/maps/dir/?api=1&destination="+lat+","+lng)))}
  })
  val next=when(state){"ready_for_pickup"->"picked_up";"picked_up"->"out_for_delivery";"out_for_delivery"->"delivered";else->null}
  if(next!=null) card.addView(button(next.replace('_',' ').uppercase()){update(id,next,null)})
  if(state=="out_for_delivery") card.addView(button("Report delivery failed"){
   val reason=EditText(this).apply{hint="Reason required";setSingleLine(true)}
   android.app.AlertDialog.Builder(this).setTitle("Delivery failed").setView(reason).setNegativeButton("Back",null)
    .setPositiveButton("Submit"){_,_->val r=reason.text.toString().trim();if(r.isBlank())status.text="Reason is required." else update(id,"delivery_failed",r)}.show()
  })
  root.addView(card,LinearLayout.LayoutParams(-1,-2).apply{topMargin=10})
 }
 private fun availability(value:Boolean){
  status.text="Updating availability…"
  worker.execute{try{request(base+"/functions/v1/restaurant-api","POST",JSONObject().put("action","set_rider_availability").put("is_online",value).toString(),token);online=value;runOnUiThread{orders()}}
   catch(ex:Exception){runOnUiThread{status.text=message(ex)}}}
 }
 private fun update(id:String,next:String,reason:String?){
  status.text="Updating order…"
  worker.execute{try{val b=JSONObject().put("action","update_order_status").put("order_id",id).put("status",next);if(reason!=null)b.put("reason",reason)
   request(base+"/functions/v1/restaurant-api","POST",b.toString(),token);runOnUiThread{orders()}}
   catch(ex:Exception){runOnUiThread{status.text=message(ex)}}}
 }
 private fun request(url:String,method:String,body:String?,bearer:String?):JSONObject{
  val c=URL(url).openConnection() as HttpURLConnection;c.requestMethod=method;c.connectTimeout=15000;c.readTimeout=20000
  c.setRequestProperty("apikey",apiKey);c.setRequestProperty("Accept","application/json")
  if(bearer!=null)c.setRequestProperty("Authorization","Bearer "+bearer)
  if(body!=null){c.doOutput=true;c.setRequestProperty("Content-Type","application/json")}
  try{if(body!=null)OutputStreamWriter(c.outputStream,Charsets.UTF_8).use{it.write(body)}
   val code=c.responseCode;val stream=if(code in 200..299)c.inputStream else c.errorStream
   val raw=stream?.bufferedReader()?.use{it.readText()}?:"{}";val json=try{JSONObject(raw)}catch(_:Exception){JSONObject()}
   if(code !in 200..299)throw Exception(json.optString("error","HTTP "+code));return json
  }finally{c.disconnect()}
 }
 private fun message(ex:Exception):String{val m=ex.message?:"Request failed";return when{
  m.contains("401")||m.contains("invalid_session")->"Session expired. Sign in again."
  m.contains("403")||m.contains("forbidden")->"This account is not an active authorized rider."
  m.contains("riders")||m.contains("availability")->"Rider profile missing or unavailable. Ask owner to register this rider."
  else->m.take(180)
 }}
 override fun onDestroy(){worker.shutdownNow();super.onDestroy()}
}
