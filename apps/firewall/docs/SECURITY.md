# What Firewall protects against, and what it does not

Read this before trusting the app with anything that matters. An honest account
of the limits is more useful than a list of algorithms.

## The threat this is built for

Someone else has your unlocked phone in their hands. A partner scrolling
Gallery, a flatmate borrowing it for a map, a kid playing a game, a colleague
looking at a photo you showed them. They are curious, not equipped. They will
open apps, scroll galleries, and poke at anything that looks like a locked box.

Against that, the app is designed so that there is no locked box to poke at.

## How it works

**Key hierarchy.** The vault key is 256 random bits, generated once and never
derived from the passcode. It is wrapped twice:

```
kek      = PBKDF2-HMAC-SHA256(passcode, random 16-byte salt, 200,000 iterations)
wrapped  = AES-256-GCM(kek, vaultKey)
stored   = AndroidKeystore-AES-256-GCM(wrapped)
```

Opening a single photo therefore needs two independent things: the passcode,
*and* this physical handset. Copying the app's data off the phone and attacking
the PIN on a desktop does not work, because the outer layer can only be removed
by a Keystore key that cannot be exported — on most Samsung devices from the S9
onward that key lives in hardware. Every guess has to be made on the handset,
one Keystore call at a time.

Because the vault key is independent of the passcode, changing the passcode
rewraps 32 bytes rather than re-encrypting the whole gallery, and a weak
passcode never weakens the file encryption itself.

**Files.** Every photo becomes a `.fwl` in `filesDir/vault/` — private app
storage, invisible to other apps, never indexed by the media scanner, excluded
from cloud backup and device-to-device transfer. See [FORMAT.md](FORMAT.md).

**Metadata.** Imports are decoded to pixels and re-encoded, which drops GPS,
capture time, camera serial and the camera's embedded preview thumbnail.

**Screenshots.** Allowed, by default, inside the app — the owner asked for
this and it is their call. What is *not* allowed either way is the vault
appearing in the task switcher: someone who picks up the phone and double-taps
recents would otherwise see a photo out of the vault without ever meeting the
passcode. `FLAG_SECURE` conflates those two things, so the app separates them
(`util/ScreenPrivacy.kt`): on Android 13 and up it calls
`setRecentsScreenshotEnabled(false)`, which suppresses the thumbnail and leaves
screen capture alone; below 13, where no such API exists, it carries
`FLAG_SECURE` only while the window is backgrounded, which is when the
thumbnail is taken.

A switch in the vault turns screen capture back off, which restores
`FLAG_SECURE` on every vault window immediately. The truth table behind all of
this is four cells wide and is unit tested — get one wrong and either a
screenshot the owner asked for fails, or a vault photo lands in recents.

Two caveats on the below-13 path. The system takes the recents snapshot around
`onPause`, so applying the flag there is best-effort and OEM-dependent; and
while screen capture is enabled, anything the *owner* screenshots leaves the
vault and lands in Gallery as an ordinary unencrypted JPEG, where the whole
point of the app no longer applies to it.

**Auto-lock.** The key is dropped from memory when the app leaves the screen —
no timer. The one exception is a two-minute grace window while the system photo
picker is in front, because the picker is another app and the vault would
otherwise lock itself mid-import.

**Permissions.** The app requests **no `INTERNET` permission**, so nothing in
the vault can leave the device over the network however wrong the rest of the
app might be, and that is verifiable by anyone who inspects the APK. It also
holds no storage or media permissions: importing goes through the system photo
picker, which grants access to exactly the photos you picked and nothing else.

One permission does appear in the built APK, and it is worth naming rather than
glossing: `nz.corefocus.firewall.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.
It is not ours and not a capability — `androidx.core` merges it in as plumbing
for `ContextCompat.registerReceiver`, it is `signature`-protected, and it lives
in this app's own namespace, so only something signed with the same key could
ever hold it. It grants no access to the phone, the network, or storage.

CI checks both halves of this on every build: that `INTERNET` is absent by
name, and that nothing outside `nz.corefocus.firewall.*` appears at all. The
first version of that check asserted "no permissions whatsoever" and failed
immediately on the androidx one — which is how the paragraph above came to be
written, and a fair argument for asserting things against the artifact rather
than against the manifest you wrote.

**Wrong guesses.** Five free attempts, then an escalating lockout — 30s, 1min,
5min, 15min, 1hr. The lockout holds even against the correct passcode. There is
deliberately **no wipe-after-N-failures**: on a shared phone, someone fumbling
the PIN is far more likely than an attacker with the patience to sit through an
hour, and a vault that eats its owner's photos is worse than one that makes an
attacker wait.

## What it does not protect against

**A forensic examination of a seized phone.** A determined attacker with the
device, physical-extraction tooling and time is outside the threat model. The
Keystore wrap raises the cost a long way, but this is not a tool for evading a
state.

**A rooted or already-compromised phone.** Malware with root, or a keylogger,
reads the passcode as you type it. Nothing at this layer helps.

**Someone who watches you unlock it.** There is no shoulder-surfing defence
beyond the dots being dots.

**Someone who already knows the app is there.** Everything above the crypto is
disguise, not deniability. A person who knows what to look for will notice the
APK is larger than a Tetris game needs to be, or will find `filesDir/vault`
with a file manager that has root. It is a closed door in a corridor they were
not walking down — not a secret room.

**The passcode in memory.** It is held briefly as a Java `String`, which is
immutable and cannot be reliably wiped. The derived key material *is* wiped, but
the typed digits may sit in the heap until GC. Fixing this properly means a
`CharArray` all the way through the Compose state, which is worth doing and has
not been done.

**A forgotten passcode.** There is no recovery, no backup key, no reset. That is
the design. If the passcode is lost the photos are gone, and no one — including
whoever wrote this — can get them back.

**Anything not yet reviewed by someone else.** This code has unit tests and has
not had an independent security review.

**A Keystore that stops cooperating.** The device-bound wrap is a single point
of failure by design: if the Keystore entry is lost — a factory reset, some
restore paths, certain OEM migrations — the vault key cannot be unwrapped and
the photos are gone, exactly as if the passcode were forgotten. That is the
price of being device-bound, and it is why `unlock` reporting "wrong passcode"
for a Keystore fault was misleading enough to fix.

## What running it on a phone found

The first build to reach a handset could not create a vault at all. The
Keystore guard generated its own GCM nonce, which AndroidKeyStore rejects for
encryption when the key requires randomised encryption — *Caller-provided IV
not permitted*. It threw inside `setUp`, which had no handler, so the process
died and dropped the user back into the decoy game with no message.

Worth being precise about why the tests missed it. Every unit test runs the key
hierarchy against `DeviceGuard.PASSTHROUGH`, because there is no AndroidKeyStore
on a desktop JVM. So `KeystoreDeviceGuard.seal` had never executed anywhere, on
any machine, while the suite reported green — a whole layer of the design
untested and invisible. The comment in `VaultKeyManagerTest` even said the
guard's behaviour was "one Keystore call that only a device can prove", which
was true and should have been read as a gap rather than a note.

A second bug reached the phone right behind it, this one purely in layout: the
gallery's empty and loading branches used `Modifier.fillMaxSize()` inside a
Column, which takes the whole remaining height, so the screenshot toggle and
the ADD PHOTOS button were laid out past the bottom edge. You could unlock the
vault and then had no way to put anything in it. The branch with photos in it
used `weight(1f)` and was fine — which is why reading the code did not show it,
and why nothing but a real screen would have.

`app/src/androidTest/KeystoreVaultTest.kt` now covers the first on real hardware —
seal round-trips, a foreign Keystore key cannot unseal, a vault reopens after a
cold start, and `changePasscode` preserves the vault key — and CI runs it on an
emulator on every push. Decryption was never affected, which is why the fault
sat precisely on the one path that runs once per install.

`VaultScreenLayoutTest.kt` covers the second, asserting with
`assertIsDisplayed` — not `assertExists` — that the controls are actually
within the screen bounds in every state the gallery has. The button existed the
whole time; it was just somewhere nobody could reach.

The pattern across both: the only faults that reached a phone were in the code
paths no test could execute off a device. Everything the unit suite could
reach, it got right.

## Known gaps worth closing

- Passcode handling should be `CharArray` end to end (see above).
- The PBKDF2 iteration count is stored per vault so it can be raised later, but
  nothing yet re-derives an existing vault at a higher count.
- `VaultRepository.delete` overwrites the file with random bytes before
  unlinking. On a flash filesystem with wear levelling that does not guarantee
  the old blocks are unreachable; it only guarantees the file's own extent no
  longer holds ciphertext.
- There is no duress passcode (a second PIN that opens an empty vault). It is an
  obvious fit for this threat model.
- Nothing rate-limits how fast the passcode screen can be re-opened from the
  game; the lockout is enforced in the key manager, which is the right place,
  but a dedicated attacker gets unlimited *attempts at the attempt*.
