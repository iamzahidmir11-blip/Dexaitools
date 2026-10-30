package com.hurmatdarbar.delivery
import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
class MainActivity : Activity() {
 override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState)
  val root=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; gravity=Gravity.CENTER; setPadding(32,32,32,32); setBackgroundColor(Color.rgb(245,241,232)) }
  root.addView(TextView(this).apply { text="HURMAT DARBAR"; textSize=13f; setTextColor(Color.rgb(181,138,75)) })
  root.addView(TextView(this).apply { text="Delivery Partner"; textSize=30f; setTextColor(Color.rgb(33,31,24)); setPadding(0,18,0,12) })
  root.addView(TextView(this).apply { text="Delivery app foundation created. Rider sign-in, assigned orders and location updates require the secure backend connection."; textSize=15f; setTextColor(Color.DKGRAY) })
  setContentView(root)
 }
}