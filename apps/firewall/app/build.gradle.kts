plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Release signing comes from the environment, never from a file in the repo.
// Absent (a normal local build, or a fork with no secrets) the release build
// still assembles, unsigned - and the CI job refuses to publish it, rather
// than quietly handing out something nobody can install as an update.
val keystoreFile: String? = System.getenv("FIREWALL_KEYSTORE_FILE")
val keystorePassword: String? = System.getenv("FIREWALL_KEYSTORE_PASSWORD")
val releaseKeyAlias: String? = System.getenv("FIREWALL_KEY_ALIAS")
val releaseKeyPassword: String? = System.getenv("FIREWALL_KEY_PASSWORD")
val hasReleaseSigning = !keystoreFile.isNullOrBlank() &&
    !keystorePassword.isNullOrBlank() &&
    !releaseKeyAlias.isNullOrBlank() &&
    !releaseKeyPassword.isNullOrBlank()

android {
    namespace = "nz.corefocus.firewall"
    compileSdk = 34

    defaultConfig {
        applicationId = "nz.corefocus.firewall"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(keystoreFile!!)
                storePassword = keystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword

                // minSdk is 26, so the v1 JAR signature is dead weight - every
                // device that can install this reads v2. Leaving v1 on only
                // widens what an attacker can tamper with.
                enableV1Signing = false
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        release {
            // findByName, not getByName: no keystore in the environment means
            // no signing config exists, and the build should say so at the end
            // rather than fail here on a developer machine.
            signingConfig = signingConfigs.findByName("release")

            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.documentfile)
    implementation(libs.androidx.exifinterface)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)

    // The Keystore has no desktop implementation, so the key hierarchy can
    // only really be proven on a device. See androidTest/KeystoreVaultTest.
    androidTestImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)

    // Rendering the gallery on a real screen is the only way to catch a
    // control laid out past the bottom edge; assertIsDisplayed sees it, a
    // unit test cannot. See androidTest/VaultScreenLayoutTest.
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
