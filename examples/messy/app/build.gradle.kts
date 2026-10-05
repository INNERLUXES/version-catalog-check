plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.kapt)
}

android {
    namespace = "rides.harborlight.app"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "rides.harborlight.app"
        minSdk = 24
        versionCode = 41
        versionName = "4.1.0"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(project(":core"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation("androidx.compose.ui:ui-tooling-preview:1.6.8")

    implementation(libs.retrofit)
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation(libs.okhttp.logging)
    implementation("com.android.support:appcompat-v7:28.0.0")

    implementation(libs.bundles.room)
    kapt(libs.room.compiler)
    implementation(libs.glide)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.espresso.core)
}
