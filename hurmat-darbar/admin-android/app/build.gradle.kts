plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
 namespace = "com.hurmatdarbar.admin"
 compileSdk = 35
 compileOptions {
  sourceCompatibility = JavaVersion.VERSION_17
  targetCompatibility = JavaVersion.VERSION_17
 }
 kotlinOptions { jvmTarget = "17" }
 defaultConfig { applicationId = "com.hurmatdarbar.admin"; minSdk = 24; targetSdk = 35; versionCode = 2; versionName = "0.2.0" }
}
dependencies {
 implementation("androidx.core:core-ktx:1.15.0")
 implementation("androidx.activity:activity-ktx:1.10.0")
}