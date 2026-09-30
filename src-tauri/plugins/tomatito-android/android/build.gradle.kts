import com.android.build.api.dsl.LibraryExtension
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Plugin tomatito-android (PLANO-ANDROID 4.2). Gerado pelo `tauri plugin new`
// e ajustado ao app (A07a): pacote do Tomatito, minSdk do app (24), só as
// dependências usadas, sem `buildTypes` (quem minifica é o :app, com as
// regras do consumer-rules.pro) e sem testes instrumentados (os de JVM, em
// src/test, rodam com :tauri-plugin-tomatito-android:testDebugUnitTest). A saída vai para $TT_GRADLE_SAIDAS pelo allprojects do
// build.gradle.kts raiz (7.1). O bloco é o `configure<LibraryExtension>` e não
// o `android { }` do modelo, que o AGP 9 (DSL nova) marca como obsoleto.
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

configure<LibraryExtension> {
    namespace = "io.github.kbrianps.tomatito.android"
    compileSdk = 37

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.9.0")
    testImplementation("junit:junit:4.13.2")
    // O org.json do android.jar dos testes de JVM é só casca (lança "Stub!");
    // a agenda (Puras.kt) usa o de verdade nos testes.
    testImplementation("org.json:json:20250517")
    implementation(project(":tauri-android"))
}
