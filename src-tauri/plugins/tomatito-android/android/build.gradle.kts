import com.android.build.api.dsl.LibraryExtension
import com.android.build.api.variant.LibraryAndroidComponentsExtension
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

// Os sons de fim (5.5, A08): a fonte única são os WAV do desktop em
// src-tauri/sounds/; esta tarefa os copia para um res/raw gerado (dentro da
// saída do módulo, fora do /home), trocando `-` por `_`, que recurso Android
// não aceita (`focus-end.wav` → `raw/focus_end`). Nada é copiado para o
// src/main/res versionado.
abstract class CopiarSons : DefaultTask() {
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.NAME_ONLY)
    abstract val sons: ConfigurableFileCollection

    @get:OutputDirectory
    abstract val saida: DirectoryProperty

    @TaskAction
    fun copiar() {
        val raw = saida.get().dir("raw").asFile
        raw.deleteRecursively()
        raw.mkdirs()
        val wavs = sons.files.filter { it.name.endsWith(".wav") }
        check(wavs.isNotEmpty()) { "nenhum WAV em src-tauri/sounds" }
        for (wav in wavs) {
            wav.copyTo(raw.resolve(wav.name.replace('-', '_')), overwrite = true)
        }
    }
}

val copiarSons = tasks.register<CopiarSons>("copiarSons") {
    sons.from(fileTree(file("../../../sounds")) { include("*.wav") })
}

configure<LibraryAndroidComponentsExtension> {
    onVariants { variante ->
        variante.sources.res?.addGeneratedSourceDirectory(copiarSons, CopiarSons::saida)
    }
}
