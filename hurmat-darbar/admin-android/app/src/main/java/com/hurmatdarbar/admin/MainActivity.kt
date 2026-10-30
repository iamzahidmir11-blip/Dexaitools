package com.hurmatdarbar.admin

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.view.Gravity
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.io.OutputStreamWriter
import java.util.concurrent.Executors

class MainActivity : Activity() {
 private val base = "https://rvrboufrnkzuptfjopwd.supabase.co"
 private val apiKey = "sb_publishable_n1PWbHcomKpd63FPDdWSEw_iSo6UTi0"
 private val worker = Executors.newSingleThreadExecutor()
 private var accessToken: String? = null
 private lateinit var root: LinearLayout
 private lateinit var status: TextView
 private val ink = Color.rgb(35,32,25)
 private val gold = Color.rgb(171,126,62)
 private val paper = Color.rgb(247,244,237)

 override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); showLogin() }

 private fun setupRoot() {
  root = LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(22,28,22,24); setBackgroundColor(paper) }
  setContentView(ScrollView(this).apply { addView(root) })
 }
 private fun label(t:String,s:Float=15f)=TextView(this).apply { text=t; textSize=s; setTextColor(ink); setPadding(0,8,0,8) }
 private fun field(h:String,pw:Boolean=false)=EditText(this).apply {
  hint=h; textSize=16f; setSingleLine(true); if(pw) inputType=129
  setPadding(14,10,14,10); setBackgroundColor(Color.WHITE)
 }
 private fun button(t:String, click:()->Unit)=Button(this).apply {
  text=t; isAllCaps=false; setTextColor(Color.WHITE)
  setBackgroundTintList(android.content.res.ColorStateList.valueOf(ink)); setOnClickListener { click() }
 }
 private fun params()=LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=12 }

 private fun showLogin(message:String="") {
  setupRoot()
  root.gravity=Gravity.CENTER_HORIZONTAL
  root.addView(label("H U R M A T   D A R B A R",13f).apply { setTextColor(gold) })
  root.addView(label("Admin Console",30f))
  root.addView(label("Sign in with an owner/admin account created by the restaurant owner."))
  val email=field("Email address").apply { inputType=33 }
  val password=field("Password",true)
  root.addView(email,params()); root.addView(password,params())
  status=label(message); root.addView(status)
  root.addView(button("Secure sign in") {
   val e=email.text.toString().trim(); val p=password.text.toString()
   if(e.isBlank()||p.isBlank()) { status.text="Enter both email and password." }
   else {
    status.text="Signing in…"
    worker.execute {
     try {
      val response=request("$base/auth/v1/token?grant_type=password","POST",
       JSONObject().put("email",e).put("password",p).toString(),null)
      accessToken=response.getString("access_token")
      runOnUiThread { loadDashboard() }
     } catch(ex:Exception) { runOnUiThread { status.text=safeMessage(ex) } }
    }
   }
  })
  root.addView(label("Access is controlled by Supabase roles. This app does not create admin accounts.",12f))
 }

 private fun loadDashboard() {
  setupRoot()
  root.addView(label("H U R M A T   D A R B A R",13f).apply { setTextColor(gold) })
  root.addView(label("Live Orders",28f))
  status=label("Loading orders…"); root.addView(status)
  root.addView(button("Refresh orders") { refreshOrders() })
  root.addView(button("Sign out") { accessToken=null; showLogin() })
  refreshOrders()
 }
 private fun refreshOrders() {
  status.text="Refreshing…"
  worker.execute {
   try {
    val response=request("$base/functions/v1/restaurant-api","GET",null,accessToken)
    val orders=response.optJSONArray("orders")?:JSONArray()
    runOnUiThread { renderOrders(orders) }
   } catch(ex:Exception) { runOnUiThread { status.text=safeMessage(ex) } }
  }
 }
 private fun renderOrders(orders:JSONArray) {
  if(root.childCount>5) root.removeViews(5,root.childCount-5)
  status.text="${orders.length()} recent orders"
  if(orders.length()==0) { root.addView(label("No orders found. New orders will appear here when available.")); return }
  for(i in 0 until orders.length()) {
   val order=orders.optJSONObject(i)?:continue
   val card=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(16,12,16,12); setBackgroundColor(Color.WHITE) }
   card.addView(label("Order #${order.optLong("order_no")}",18f))
   card.addView(label(
    "${order.optString("customer_name")} • ${order.optString("customer_phone")}\n"+
    "${order.optString("address_text")}\n₹${order.optInt("total")} | ${order.optString("payment_method")}\n"+
    "Status: ${order.optString("status")}",13f))
   val items=order.optJSONArray("order_items")?:JSONArray()
   for(j in 0 until items.length()) {
    val item=items.optJSONObject(j)?:continue
    card.addView(label("• ${item.optString("item_name")} (${item.optString("variant_label")}) × ${item.optInt("qty")}",12f))
   }
   val controls=LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL }
   val choices=when(order.optString("status")) {
    "pending_confirmation"->listOf("confirmed","rejected")
    "confirmed"->listOf("preparing","cancelled")
    "preparing"->listOf("ready_for_pickup","cancelled")
    "ready_for_pickup"->listOf("picked_up")
    "picked_up"->listOf("out_for_delivery")
    "out_for_delivery"->listOf("delivered","delivery_failed")
    else->emptyList()
   }
   choices.forEach { next ->
    controls.addView(Button(this).apply {
     text=next.replace('_',' '); textSize=10f; isAllCaps=false
     setOnClickListener { updateStatus(order.optString("id"),next) }
    },LinearLayout.LayoutParams(0,-2,1f))
   }
   card.addView(controls)
   root.addView(card,LinearLayout.LayoutParams(-1,-2).apply { topMargin=10 })
  }
 }
 private fun updateStatus(id:String,next:String) {
  status.text="Updating order…"
  worker.execute {
   try {
    request("$base/functions/v1/restaurant-api","POST",
     JSONObject().put("action","update_order_status").put("order_id",id).put("status",next).toString(),accessToken)
    runOnUiThread { refreshOrders() }
   } catch(ex:Exception) { runOnUiThread { status.text=safeMessage(ex) } }
  }
 }
 private fun request(url:String,method:String,body:String?,token:String?):JSONObject {
  val c=URL(url).openConnection() as HttpURLConnection
  c.requestMethod=method; c.connectTimeout=15000; c.readTimeout=20000
  c.setRequestProperty("apikey",apiKey); c.setRequestProperty("Accept","application/json")
  if(token!=null)c.setRequestProperty("Authorization","Bearer $token")
  if(body!=null){ c.doOutput=true; c.setRequestProperty("Content-Type","application/json") }
  try {
   if(body!=null) OutputStreamWriter(c.outputStream,Charsets.UTF_8).use { it.write(body) }
   val code=c.responseCode
   val stream=if(code in 200..299)c.inputStream else c.errorStream
   val raw=stream?.bufferedReader()?.use { it.readText() }?:"{}"
   val json=try{JSONObject(raw)}catch(_:Exception){JSONObject()}
   if(code !in 200..299) throw IllegalStateException(json.optString("error",json.optString("msg","Request failed ($code)")))
   return json
  } finally { c.disconnect() }
 }
 private fun safeMessage(ex:Exception):String {
  val msg=ex.message?:"Something went wrong."
  return when {
   msg.contains("invalid login",true)->"Email or password is incorrect."
   msg.contains("forbidden",true)->"This account does not have an admin role."
   msg.contains("401")||msg.contains("invalid_session",true)->"Session expired. Please sign in again."
   else->msg.take(180)
  }
 }
 override fun onDestroy(){ worker.shutdown(); super.onDestroy() }
}