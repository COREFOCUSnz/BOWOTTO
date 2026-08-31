# How to get these plugins working for Windows launch on GitHub

*The Core Focus Productions playbook, written 2026-08-31 after THE BOWOTTO
became the first plugin in the family to ship a working Windows build.
THE BOWOTTO's repo (https://github.com/COREFOCUSnz/BOWOTTO) is the living
template — when porting another plugin, copy from it, don't re-derive.*

---

## The one-paragraph version

Copy `.github/workflows/build.yml` from THE BOWOTTO into the new plugin's
repo, rename the targets and product names, add the `*_COPY_AFTER_BUILD`
CMake option, make sure the plugin's test bench exits non-zero on failure,
push, and watch the Actions tab. On Windows, **never pass `-G` to CMake** —
that single rule is most of the magic.

---

## Why every earlier attempt failed (the history, so we never repeat it)

| Attempt | Why it died |
|---|---|
| `-G Ninja` (plain) | Ninja picks the first compiler on PATH; GitHub's Windows runners have a stray MinGW gcc there. JUCE 8 dropped MinGW → `memset`/`strlen` "not declared" errors. |
| `-G Ninja -DCMAKE_CXX_COMPILER=cl` | `cl.exe` isn't on PATH without the Visual Studio environment (`vcvarsall`) loaded. `setup-msbuild` does NOT load it. |
| `-G "Visual Studio 17 2022"` | The runner image moved on. As of Aug 2026, `windows-latest` = `win25-vs2026` and only Visual Studio **18 2026** is installed. Pinning a VS version is a time bomb. |
| `-G "Ninja Multi-Config"` | Same missing-MSVC-environment problem as plain Ninja. |
| A CMakeLists.txt syntax error | One orphaned line after a closing `)` killed configure before any of the above even mattered. Always run a local `cmake -B build` before pushing. |

Two silent killers that never got the chance to bite, fixed pre-emptively:

- **New repos give workflows a read-only token.** Without top-level
  `permissions: contents: write`, the release job can never publish — it
  would have failed even after the builds went green.
- **The Windows `.vst3` is a folder-bundle**, not a file. Upload it raw and
  the download extracts as a confusing bare `Contents` folder. Zip it first
  (`Compress-Archive`) so it extracts as `The Plugin.vst3`.

## The rules that make it work

1. **No `-G` on Windows.** CMake auto-picks the newest Visual Studio on the
   image. Survives GitHub's image upgrades. No choco installs, no
   setup-msbuild step — cmake and MSVC are preinstalled.
2. **`permissions: contents: write`** at the top of the workflow, or
   releases silently can't publish.
3. **Run the plugin's bench as a CI gate on BOTH platforms.** The bench must
   exit non-zero on failure (BOWOTTO's does: `return gFailures == 0 ? 0 : 1`).
   This is what turns "it compiled" into "the DSP is proven on Windows" —
   BOWOTTO's 23 tests pass with the same measured dB values as on the Mac.
4. **`*_COPY_AFTER_BUILD` CMake option** (default ON, CI passes OFF) so
   `COPY_PLUGIN_AFTER_BUILD` doesn't fire on a build server.
5. **Zip the Windows `.vst3` folder before uploading.** Include install
   instructions in the release body (`C:\Program Files\Common Files\VST3`).
6. **`if-no-files-found: error`** on every upload-artifact step, so a wrong
   artefact path fails loudly instead of shipping an empty artifact.
7. **Artefact paths** (same on both platforms, `Release/` included):
   `build/<Target>_artefacts/Release/VST3/<Product>.vst3`
   Windows test exe: `build/Release/<Bench>.exe`; macOS: `build/<Bench>`.
8. **Releases are tag-driven.** Tag `vX.Y.Z`, push the tag, the release
   publishes itself with both zips. If a tag's run failed, delete the tag
   and re-push it at the fixed commit — the release then publishes.

## When it breaks anyway: the probe pattern

Actions logs need repo-admin API access; without `gh` authenticated you're
locked out. Don't iterate blind — make the runner report:

1. Copy `.github/workflows/win-diag.yml` from THE BOWOTTO.
2. Push it on a branch named `ci-diag-setup`.
3. It gathers the facts on the real runner (image name, `vswhere` output,
   CMake's generator list) and attempts the real configure → build → bench,
   then force-pushes everything it learned to branch `ci-diag-results`.
4. `git fetch origin ci-diag-results && git show origin/ci-diag-results:ci-diagnostics.txt`

One probe run replaces a dozen guess-and-push cycles.

## Porting checklist for the next plugin

- [ ] Repo created under `COREFOCUSnz`, SSH remote, local history pushed
- [ ] Local `cmake -B build` passes (catches syntax errors before CI does)
- [ ] `*_COPY_AFTER_BUILD` option added to CMakeLists (default ON)
- [ ] Bench target builds on CI flags and exits non-zero on failure
- [ ] `build.yml` copied from BOWOTTO; target/product/bench names updated
- [ ] Push to main → both jobs green, bench green on both platforms
- [ ] Tag `vX.Y.Z` → release publishes with both zips
- [ ] Download the Windows zip yourself once and check it extracts as
      `<Product>.vst3`, not `Contents`
- [ ] The last mile is human: someone loads it in a real DAW on a real PC

*Known unknown, deliberately not yet handled: code signing. The builds are
unsigned; Windows DAWs load unsigned VST3s fine, and SmartScreen only nags
on downloaded executables, not plugin folders. Revisit if a host refuses.*
