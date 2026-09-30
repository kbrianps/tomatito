plugins {
    `kotlin-dsl`
}

gradlePlugin {
    plugins {
        create("pluginsForCoolKids") {
            id = "rust"
            implementationClass = "RustPlugin"
        }
    }
}

// O buildSrc é um build à parte: as saídas dele também vão para fora do /home (7.1).
val saidas = System.getenv("TT_GRADLE_SAIDAS")
    ?: error("TT_GRADLE_SAIDAS não definido (source scripts/android/ambiente.sh)")
layout.buildDirectory = file("$saidas/buildSrc")

repositories {
    google()
    mavenCentral()
}

dependencies {
    compileOnly(gradleApi())
    implementation("com.android.tools.build:gradle:9.3.1")
}

