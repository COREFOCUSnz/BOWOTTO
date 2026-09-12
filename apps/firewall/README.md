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

24 unit tests, no device needed. They cover the three things worth proving:

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

Two of them were checked by mutation: deleting the header CRC check makes the
corruption test fail, and collapsing the two section AADs into one makes the
role-binding test fail. They bite.

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
vault/VaultFormat.kt        the .fwl container
vault/ImageNormaliser.kt    downsample, rotate, re-encode, strip every EXIF tag
vault/VaultRepository.kt    the gallery on disk
vault/VaultScreen.kt        the grid; ViewerScreen.kt the full-screen view
```

Full details of the on-disk container are in [docs/FORMAT.md](docs/FORMAT.md),
and the threat model — including what this does *not* protect against — is in
[docs/SECURITY.md](docs/SECURITY.md). Read the second one before trusting the
app with anything that matters.

## Changing the two obvious things

- **The decoy's name** is `app_name` in `res/values/strings.xml`. It is
  currently "Blockfall". `vault_name` is the name used inside the vault.
- **The way in** is `SecretChip` in `game/TetrisScreen.kt`. It is a long-press
  today; swapping `onLongClick` for `onClick` makes it a single tap, at the cost
  of it being hit by accident.

## Why it lives here

The task assigned this work to a branch of the BOWOTTO repository, so that is
where it went. It is self-contained under `apps/firewall/` and shares nothing
with the plugin — different language, different toolchain, different product. If
it is going to grow, it wants its own repository.
