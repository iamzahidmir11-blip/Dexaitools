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
 private var ridersCache = JSONArray()
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
  root.addView(button("Menu Management") { loadMenu() })
  root.addView(button("Rider Assignment") { loadRiders() })
  root.addView(button("Table Reservations") { loadReservations() })
  root.addView(button("Sign out") { accessToken=null; showLogin() })
  refreshOrders()
 }
 private fun refreshOrders() {
  status.text="Refreshing…"
  worker.execute {
   try {
    val response=request("$base/functions/v1/restaurant-api","GET",null,accessToken)
    val orders=response.optJSONArray("orders")?:JSONArray()
    ridersCache = try { requestView("riders").optJSONArray("riders") ?: JSONArray() } catch (_:Exception) { JSONArray() }
    runOnUiThread { renderOrders(orders) }
   } catch(ex:Exception) { runOnUiThread { status.text=safeMessage(ex) } }
  }
 }
 private fun renderOrders(orders:JSONArray) {
  if(root.childCount>8) root.removeViews(8,root.childCount-8)
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
   if (order.optString("status") in listOf("confirmed","preparing","ready_for_pickup","picked_up","out_for_delivery")) {
    val riderNames = ArrayList<String>()
    val riderIds = ArrayList<String>()
    for (k in 0 until ridersCache.length()) {
     val rider = ridersCache.optJSONObject(k) ?: continue
     riderNames.add("${rider.optString("name")} — ${if(rider.optBoolean("is_online")) "Online" else "Offline"}")
     riderIds.add(rider.optString("user_id"))
    }
    if (riderNames.isNotEmpty()) {
     val picker = Spinner(this)
     picker.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, riderNames)
     card.addView(picker)
     card.addView(button("Assign selected rider") {
      val selected = picker.selectedItemPosition
      if (selected in riderIds.indices) {
       updateEntity("assign_rider", JSONObject().put("order_id",order.optString("id")).put("rider_id",riderIds[selected])) { refreshOrders() }
      }
     })
    } else card.addView(label("No rider account registered yet.",12f))
   }
   root.addView(card,LinearLayout.LayoutParams(-1,-2).apply { topMargin=10 })
  }
 }

 private fun requestView(view:String):JSONObject =
  request("$base/functions/v1/restaurant-api?view=$view","GET",null,accessToken)

 private fun clearContent(title:String) {
  setupRoot()
  root.addView(label("H U R M A T   D A R B A R",13f).apply { setTextColor(gold) })
  root.addView(label(title,27f))
  status=label("Loading…"); root.addView(status)
  root.addView(button("Back to Dashboard") { loadDashboard() })
 }

 private fun loadMenu() {
  clearContent("Menu Management")
  worker.execute {
   try {
    val items=requestView("menu").optJSONArray("items")?:JSONArray()
    runOnUiThread {
     status.text="${items.length()} menu items"
     for(i in 0 until items.length()) {
      val item=items.optJSONObject(i)?:continue
      val card=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(14,10,14,10); setBackgroundColor(Color.WHITE) }
      val category=item.optJSONObject("menu_categories")?.optString("name")?:"Uncategorised"
      card.addView(label(item.optString("name"),17f))
      card.addView(label("$category • ${if(item.optBoolean("is_veg")) "Veg" else "Non-veg"} • ${if(item.optBoolean("needs_verification")) "Needs verification" else "Verified"}",12f))
      val nameInput = field("Item name (2–120 characters)").apply { setText(item.optString("name")) }
      val descriptionInput = field("Description (max 500 characters)").apply { setText(item.optString("description")) }
      card.addView(nameInput, params())
      card.addView(descriptionInput, params())
      card.addView(button("Save item details") {
       val name = nameInput.text.toString().trim()
       val description = descriptionInput.text.toString()
       if (name.length !in 2..120 || description.length > 500) status.text = "Check item name and description length."
       else updateEntity("update_menu_item", JSONObject().put("item_id",item.optString("id")).put("name",name).put("description",description)) { loadMenu() }
      })
      card.addView(button(if(item.optBoolean("active")) "Deactivate item" else "Activate item") {
       updateEntity("update_menu_item",JSONObject().put("item_id",item.optString("id")).put("active",!item.optBoolean("active"))) { loadMenu() }
      })
      val variants=item.optJSONArray("menu_variants")?:JSONArray()
      for(j in 0 until variants.length()) {
       val v=variants.optJSONObject(j)?:continue
       card.addView(label("${v.optString("label")} — ${if(v.isNull("price")) "Price not set" else "₹"+v.optInt("price")} — ${if(v.optBoolean("active")) "Active" else "Inactive"}",12f))
       card.addView(button(if(v.optBoolean("active")) "Deactivate variant" else "Activate variant") {
        updateEntity("update_menu_variant",JSONObject().put("variant_id",v.optString("id")).put("active",!v.optBoolean("active"))) { loadMenu() }
       })
       val priceInput = field("Price in INR").apply {
        inputType = 2
        if (!v.isNull("price")) setText(v.optInt("price").toString())
       }
       card.addView(priceInput, params())
       card.addView(button("Save variant price") {
        val price = priceInput.text.toString().toIntOrNull()
        if (price == null || price <= 0) status.text = "Enter a valid price."
        else updateEntity("update_menu_variant", JSONObject().put("variant_id",v.optString("id")).put("price",price)) { loadMenu() }
       })
      }
      card.addView(button(if(item.optBoolean("available")) "Mark unavailable" else "Mark available") {
       updateEntity("update_menu_item",JSONObject().put("item_id",item.optString("id")).put("available",!item.optBoolean("available"))) { loadMenu() }
      })
      root.addView(card,params())
     }
    }
   } catch(ex:Exception) { runOnUiThread { status.text=safeMessage(ex) } }
  }
 }

 private fun loadReservations() {
  clearContent("Table Reservations")
  worker.execute {
   try {
    val rows=requestView("reservations").optJSONArray("reservations")?:JSONArray()
    runOnUiThread {
     status.text="${rows.length()} reservations"
     for(i in 0 until rows.length()) {
      val r=rows.optJSONObject(i)?:continue
      val card=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(14,10,14,10); setBackgroundColor(Color.WHITE) }
      card.addView(label(r.optString("name"),17f))
      card.addView(label("${r.optString("phone")} • ${r.optInt("party_size")} guests\n${r.optString("reserve_at")}\n${r.optString("notes")}\nStatus: ${r.optString("status")}",12f))
      if(r.optString("status")=="pending") {
       val row=LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL }
       listOf("confirmed","rejected").forEach { next ->
        row.addView(Button(this).apply { text=next; isAllCaps=false; setOnClickListener {
         updateEntity("update_reservation_status",JSONObject().put("reservation_id",r.optString("id")).put("status",next)) { loadReservations() }
        } },LinearLayout.LayoutParams(0,-2,1f))
       }
       card.addView(row)
      }
      root.addView(card,params())
     }
    }
   } catch(ex:Exception) { runOnUiThread { status.text=safeMessage(ex) } }
  }
 }

 private fun loadRiders() {
  clearContent("Rider Assignment")
  worker.execute {
   try {
    val rows=requestView("riders").optJSONArray("riders")?:JSONArray()
    runOnUiThread {
     status.text="${rows.length()} registered riders"
     if(rows.length()==0) root.addView(label("No rider accounts are registered yet. Owner/Manager must add and authorize riders first."))
     for(i in 0 until rows.length()) {
      val r=rows.optJSONObject(i)?:continue
      val card=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(14,10,14,10); setBackgroundColor(Color.WHITE) }
      card.addView(label(r.optString("name"),17f))
      card.addView(label("${r.optString("phone")} • ${if(r.optBoolean("is_online")) "Online" else "Offline"}\nLast seen: ${r.optString("last_seen")}",12f))
      root.addView(card,params())
     }
    }
   } catch(ex:Exception) { runOnUiThread { status.text=safeMessage(ex) } }
  }
 }

 private fun updateEntity(action:String,payload:JSONObject,done:()->Unit) {
  status.text="Saving…"
  worker.execute {
   try {
    request("$base/functions/v1/restaurant-api","POST",payload.put("action",action).toString(),accessToken)
    runOnUiThread { done() }
   } catch(ex:Exception) { runOnUiThread { status.text=safeMessage(ex) } }
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