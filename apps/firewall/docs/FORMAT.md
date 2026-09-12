# The `.fwl` container

Version 1. Implemented in `vault/VaultFormat.kt`, tested in `VaultFormatTest`.

A `.fwl` is not an image file. No gallery, media scanner, thumbnailer or file
manager will recognise it, and nothing outside this app can decrypt it. Files
live in `filesDir/vault/`, named with a random UUID — the name carries no
information about the picture.

## Layout

```
offset  size  contents
     0     4  magic, ASCII "FWL1"
     4     2  format version, u16 big-endian
     6     2  header length, u16 big-endian (32)
     8     8  created-at, epoch millis, i64 big-endian
    16     4  thumbnail section length, u32 big-endian
    20     4  metadata section length, u32 big-endian
    24     4  image section length, u32 big-endian
    28     4  CRC-32 of bytes 0..27

    32     -  thumbnail section
     -     -  metadata section
     -     -  image section
```

Each section is `nonce (12 bytes) || ciphertext || GCM tag (16 bytes)`, and the
stored length covers all three parts. Sections are AES-256-GCM under the vault
key, each with its own additional authenticated data:

| section   | AAD          | plaintext                       |
|-----------|--------------|---------------------------------|
| thumbnail | `fwl/thumb`  | JPEG, long edge 384px, q80      |
| metadata  | `fwl/meta`   | the record below                |
| image     | `fwl/image`  | JPEG, long edge 3072px, q92     |

### Metadata record

Length-prefixed binary, written with `DataOutputStream`:

```
UTF   display name
i32   width
i32   height
i64   source size in bytes
i64   captured-at, epoch millis
```

## Why it is shaped this way

**Three sections, not one.** The grid needs a 384px thumbnail, not a 12MP
frame. Separate sections mean drawing the gallery decrypts about 30KB per
photo instead of several megabytes.

**A plaintext header.** It holds only three lengths, a version and a
timestamp — nothing that identifies the picture. Everything that could (the
original filename, its dimensions, its size) is in the sealed metadata section.
Keeping the lengths readable is what lets the gallery recognise a corrupted
file and skip it instead of falling over, and lets the reader seek straight to
the section it wants.

**A CRC over the header.** Not a security control — GCM already authenticates
every byte that matters. It is there so a truncated or garbled file is
diagnosed as damaged rather than surfacing as a decryption failure, which would
otherwise look identical to a wrong passcode.

**Per-section AAD.** Without it, a section could be lifted from one file and
dropped into the matching slot of another, or the image and thumbnail of the
same file could be swapped. Binding each section's tag to its role makes any
such move fail. `VaultFormatTest` crafts exactly that file — sealed image bytes
under a valid CRC-correct header claiming to be the thumbnail — and asserts the
reader rejects it.

**A fresh nonce per section per write.** Importing the same photo twice
produces entirely different files. Identical ciphertext would leak that two
entries hold the same picture.

## What is deliberately not stored

The import path decodes the source to pixels and re-encodes it. Nothing from
the original file's metadata survives that: no GPS coordinates, no capture
time, no camera make, model or serial, no lens data, and no camera-embedded
preview thumbnail. EXIF orientation is read before the re-encode and applied to
the pixels, because there is no EXIF left afterwards to carry it.

The stored `captured-at` is the import time, not the original capture time. The
capture time is part of what the owner is hiding.

## Forward compatibility

The version field is checked and an unknown version is refused outright rather
than guessed at. A version 2 that adds a section would add its length field
inside a longer header, which is why `headerLength` is in the header and why
section offsets are computed from it rather than hardcoded.
