# Making a signed release

A release build differs from the debug one in three ways that matter: it is
signed with **your** key instead of the keystore every Android SDK shares, it
is not `debuggable`, and it is minified.

Everything below is done once. After that, releasing is one button.

## The part that cannot be undone

Read this before generating anything.

An Android app is identified by its package name **and its signing
certificate**. A phone will only accept an update to Firewall if the new APK
is signed with the same key as the one already installed. There is no recovery
and no appeal:

- **Lose the keystore** and you can never update any phone that has the app.
  The only route is a new package name — a different app, installed alongside,
  with an empty vault. Existing vaults do not move across.
- **Leak the keystore** and anyone holding it can build an APK that phones
  accept as a legitimate update to yours. For an app whose whole job is
  holding private photos, that is the worst thing that could happen to it.

So: back the file up somewhere you will still have in five years, keep the
password somewhere you can actually find it, and do not put either in a chat,
an email, or the repository.

## 1. Generate the keystore

Needs a JDK — Android Studio bundles one, or `brew install openjdk`.

```sh
keytool -genkeypair -v \
  -keystore firewall-release.jks \
  -storetype PKCS12 \
  -alias firewall \
  -keyalg RSA -keysize 4096 \
  -validity 10000
```

It asks for a password, then some identity questions. Only the first field
(name) shows up anywhere; the rest can be blank. `-validity 10000` is about 27
years — an expired signing certificate is another way to lose update ability,
so there is no reason to pick a shorter one.

Use one strong password and give the key the same one when prompted.

**Back up `firewall-release.jks` now**, before going further.

## 2. Turn it into a secret

GitHub secrets hold text, so the keystore goes in base64:

```sh
base64 -i firewall-release.jks | tr -d '\n' | pbcopy   # macOS, now on the clipboard
base64 -w0 firewall-release.jks                        # Linux, prints it
```

## 3. Add four repository secrets

**Settings → Secrets and variables → Actions → New repository secret**, in
`COREFOCUSnz/BOWOTTO`:

| Secret | Value |
|---|---|
| `FIREWALL_KEYSTORE_BASE64` | the base64 blob from step 2 |
| `FIREWALL_KEYSTORE_PASSWORD` | the keystore password |
| `FIREWALL_KEY_ALIAS` | `firewall` |
| `FIREWALL_KEY_PASSWORD` | the key password (same as above if you reused it) |

GitHub will not show these again after saving, and they are not readable by
pull requests from forks.

## 4. Release

**Actions → Release Firewall APK → Run workflow.** Or tag it:

```sh
git tag firewall-v0.1.0 && git push origin firewall-v0.1.0
```

The workflow runs the unit tests, builds, signs, then:

- **verifies the signature** and prints the certificate fingerprint — record
  that once, so a swapped key would be obvious later;
- **fails if the certificate is `CN=Android Debug`**, which would mean the
  wrong key was used;
- **installs the minified APK on an emulator and launches it**, failing if it
  crashes or is not still running ten seconds later.

That last check exists because release builds are minified and the debug ones
are not. R8 removing something the app needs at runtime is invisible until
launch, and "works in debug, dies in release" is the classic way a release
build goes wrong.

The signed APK lands in the run's artifacts as `firewall-release-apk`.

## Updating later

Bump both in `app/build.gradle.kts`:

```kotlin
versionCode = 2          // must increase, or phones refuse the update
versionName = "0.2.0"    // what a human reads
```

Same key, same package name, so it installs straight over the top and the
vault survives. Phones will refuse an APK whose `versionCode` is not higher
than the installed one.

## What a release build changes for the user

- **Not `debuggable`.** ADB can no longer attach and read the vault key out of
  memory while the vault is open. This is the main reason to bother.
- **Signed by you.** Nobody else can build something a phone will accept as an
  update to it.
- **Minified.** Smaller, and the class and method names are gone, which makes
  a casual look through the APK less informative.

What it does not change: there is still no passcode recovery, the vault is
still excluded from cloud backup and device transfer, and the app still has no
`INTERNET` permission.
