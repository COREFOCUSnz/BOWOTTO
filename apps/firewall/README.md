# Firewall

A private photo vault for Android, hidden behind a playable Tetris game.

**This is not part of THE BOWOTTO.** It shares a repository and nothing else —
no shared code, no shared build, and the plugin tree is untouched. See
[Why it lives here](#why-it-lives-here).

## What it does

Someone else picks up your phone — a partner, a flatmate, a kid, a colleague
you handed it to. Firewall is built for that, not for a forensics lab.

- The launcher icon is **Blockfall**, a real game of Tetris. That is all the app
  looks like from the app drawer, the task switcher, or a scroll through
  Settings → Apps.
- **Long-press the small gold chip** below the stats column and a passcode pad
  appears. The correct passcode opens the gallery. Nothing else does.
- Photos you add are re-encoded and encrypted into `.fwl` files in the app's
  private storage. Samsung Gallery, Files, the media scanner, a USB browse and
  every other app on the phone see nothing.
- After an import, the app offers to delete the originals from Gallery in one
  system dialog. The vault copy stays until you delete it from inside the vault
  — the two deletions are separate, on purpose.
- The vault locks itself the moment the app leaves the screen.
- Screenshots work inside the app. The task switcher still shows nothing, and a
  switch in the vault turns screen capture back off if you want that.

## Building it

There is no Gradle wrapper checked in yet (it needs a network fetch to
generate). Either:

- **Android Studio** — open `apps/firewall`, let it add the wrapper and sync, then
  Run. This is the easy path.
- **Command line** with a local Gradle 8.7+ and an Android SDK:

  ```sh
  cd apps/firewall
  gradle :app:assembleDebug        # APK at app/build/outputs/apk/debug/
  gradle :app:testDebugUnitTest    # the unit tests
  ```

Targets API 34, minimum API 26 (Android 8). Kotlin 2.0.21, Compose, no other
third-party libraries.

## Testing

28 unit tests, no device needed. They cover the four things worth proving:

- **`VaultFormatTest`** — the container round-trips; a foreign key cannot open a
  section; a section cannot be moved into another slot; a single flipped header
  byte is rejected; the plaintext photo does not appear anywhere in the file;
  two imports of the same photo produce different bytes.
- **`VaultKeyManagerTest`** — the right passcode always returns the *same* key;
  a wrong one never does; repeated failures escalate into a lockout that even
  the correct passcode has to wait out; changing the passcode keeps the vault
  key, so the gallery survives it.
- **`TetrisEngineTest`** — pieces stay inside the well, the seven-bag deals
  fairly, hold swaps once per piece, the game actually ends, and the gravity
  delay never reaches zero.
- **`ScreenPrivacyPolicyTest`** — the four-cell table deciding when
  `FLAG_SECURE` applies, so allowing screenshots cannot quietly start leaking
  the vault into the task switcher.

Three were checked by mutation: deleting the header CRC check makes the
corruption test fail, collapsing the two section AADs into one makes the
role-binding test fail, and writing the screen policy the naive way — drop the
flag whenever screenshots are allowed — fails two of the privacy tests. They
bite.

## How it is put together

```
FirewallApp.kt              locks the vault when the process backgrounds
crypto/Crypto.kt            AES-GCM and PBKDF2, no Android types, unit tested
crypto/DeviceGuard.kt       the Keystore wrap that pins the vault to this phone
crypto/KeyStorage.kt        salt, iterations, wrapped key, failure tally
crypto/VaultKeyManager.kt   set up, unlock, change passcode, lockout policy
game/TetrisEngine.kt        the game, pure Kotlin
game/TetrisShapes.kt        the tetromino tables, shared with the renderer
game/TetrisScreen.kt        the board, the controls, and the gold chip
game/TetrisActivity.kt      the launcher activity — the only exported component
lock/PasscodeScreen.kt      the pad, the lockout countdown, first-run setup
util/ScreenPrivacy.kt       screenshots on, recents thumbnail off - unit tested
util/AppSettings.kt         the owner's preferences
vault/VaultFormat.kt        the .fwl container
vault/ImageNormaliser.kt    downsample, rotate, re-encode, strip every EXIF tag
vault/VaultRepository.kt    the gallery on disk
vault/VaultScreen.kt        the grid; ViewerScreen.kt the full-screen view
```

Full details of the on-disk container are in [docs/FORMAT.md](docs/FORMAT.md),
and the threat model — including what this does *not* protect against — is in
[docs/SECURITY.md](docs/SECURITY.md). Read the second one before trusting the
app with anything that matters.

## Changing the obvious things

- **The decoy's name** is `app_name` in `res/values/strings.xml`. It is
  currently "Blockfall". `vault_name` is the name used inside the vault.
- **The way in** is `SecretChip` in `game/TetrisScreen.kt`. It is a long-press
  today; swapping `onLongClick` for `onClick` makes it a single tap, at the cost
  of it being hit by accident.
- **Screen capture** defaults to on. `AppSettings.allowScreenshots` is the
  stored setting and `util/ScreenPrivacy.kt` decides what the window does with
  it; flipping the default to `false` restores the original always-`FLAG_SECURE`
  behaviour.

## Why it lives here

The task assigned this work to a branch of the BOWOTTO repository, so that is
where it went. It is self-contained under `apps/firewall/` and shares nothing
with the plugin — different language, different toolchain, different product. If
it is going to grow, it wants its own repository.

## Getting it onto a phone

The APK is built by CI, not by hand: `.github/workflows/firewall-apk.yml`
runs the unit tests and then `assembleDebug` on every push that touches
`apps/firewall/`. A green run attaches **firewall-debug-apk** to itself.

From the phone:

1. Open the run: **Actions → Build Firewall APK** in GitHub, newest run.
2. Scroll to **Artifacts** and tap `firewall-debug-apk`. GitHub serves it as a
   `.zip` — every artifact is zipped, there is no way to skip that.
3. Open the download, extract `app-debug.apk`. Samsung's My Files handles the
   zip; tap the APK inside it.
4. Android will refuse the first time and offer a settings shortcut: allow
   **Install unknown apps** for whichever app is doing the installing (My
   Files, or Chrome). Grant it, go back, install.
5. Play Protect will warn that the app is unrecognised. It says that about
   every sideloaded APK that has never been through the Play Store. Install
   anyway.
6. It appears in the drawer as **Blockfall**. First run of the vault asks for
   a passcode twice; there is no recovery if it is lost.

Downloading the artifact needs a GitHub login with access to the repo, so it
is not a link that can be forwarded to someone else.

### This is a debug build

`assembleDebug` signs with the standard Android debug keystore — the one every
SDK install shares. That is what makes it installable without setting up
signing, and it has consequences worth knowing:

- It is `debuggable`, so anything with ADB access can attach to it and read
  the vault key out of memory while it is unlocked.
- Anyone can build an APK that Android considers the same app, because they
  have the same key. An update from an untrusted source would install straight
  over it.
- `isMinifyEnabled` is off for debug, so the APK is larger and fully symbolised.

Fine for putting it on your own phone and trying it. Not what you would ship,
and not what you would hand to someone else. A release build needs a keystore
you generate and keep, which is a deliberate step and not one CI should do on
its own.
