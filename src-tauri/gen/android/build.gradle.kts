buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:9.3.1")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")
    }
}

// Saídas do Gradle fora do /home (PLANO-ANDROID 7.1): todos os módulos (:app,
// :tauri-android, que compila dentro do ~/.cargo/registry, e os plugins) escrevem
// em $TT_GRADLE_SAIDAS/<módulo>. Sem link simbólico: um clean ou uma nova
// geração pelo CLI trocaria o link por uma pasta de verdade no /home.
val saidas = System.getenv("TT_GRADLE_SAIDAS")
    ?: error("TT_GRADLE_SAIDAS não definido (source scripts/android/ambiente.sh)")

allprojects {
    layout.buildDirectory = file("$saidas/${project.name}")
    repositories {
        google()
        mavenCentral()
    }
}

tasks.register("clean").configure {
    delete(layout.buildDirectory)
}

