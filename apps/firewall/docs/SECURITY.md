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

**Screenshots.** Both the passcode screen and the vault set `FLAG_SECURE`, so
they cannot be screenshotted or screen-recorded, and they show as blank in the
recents list.

**Auto-lock.** The key is dropped from memory when the app leaves the screen —
no timer. The one exception is a two-minute grace window while the system photo
picker is in front, because the picker is another app and the vault would
otherwise lock itself mid-import.

**Permissions.** The app requests none. In particular it has **no `INTERNET`
permission**, so nothing in the vault can leave the device over the network, and
that is verifiable by anyone who inspects the APK. Importing uses the system
photo picker, which grants access to exactly the photos you picked.

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
