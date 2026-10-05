import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// A19 (PLANO-ANDROID 7.3): a chave de upload fica fora do repositório. Sem o
// keystore.properties, um build de release falha com mensagem clara (nunca um
// AAB sem assinatura por engano). TOMATITO_SEM_ASSINATURA=1 libera o build sem
// assinatura (a sonda do A18).
val propsDaChave = Properties().apply {
    val caminho = System.getenv("TOMATITO_KEYSTORE_PROPS")
        ?: "${System.getProperty("user.home")}/.config/tomatito/android/keystore.properties"
    val arquivo = file(caminho)
    if (arquivo.exists()) arquivo.inputStream().use { load(it) }
}
val temChave = propsDaChave.containsKey("storeFile")
val pedeRelease = gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }
if (pedeRelease && !temChave && System.getenv("TOMATITO_SEM_ASSINATURA") != "1") {
    error(
        "Falta a chave de upload: ~/.config/tomatito/android/keystore.properties não existe " +
            "(docs/android/versoes.md). Para um build sem assinatura, TOMATITO_SEM_ASSINATURA=1.",
    )
}

android {
    compileSdk = 37
    signingConfigs {
        if (temChave) {
            create("release") {
                keyAlias = propsDaChave.getProperty("keyAlias")
                keyPassword = propsDaChave.getProperty("password")
                storeFile = file(propsDaChave.getProperty("storeFile"))
                storePassword = propsDaChave.getProperty("password")
            }
        }
    }
    namespace = "io.github.kbrianps.tomatito"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "io.github.kbrianps.tomatito"
        minSdk = 24
        targetSdk = 37
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".debug"
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (temChave) signingConfig = signingConfigs.getByName("release")
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))
