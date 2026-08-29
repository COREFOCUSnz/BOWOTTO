#!/bin/bash
#
# release.sh — the release ritual for THE BOWOTTO. Same shape as Core
# Clipper / The Bow / The Crank: every version backs up the old build, runs
# the tests, and deploys BOTH the VST3 and the AU — the two formats can each
# independently go stale in a host if only one gets redeployed. Corey's own
# versioning rule for this plugin (feedback_bowotto_versioning): sequential
# names, always ask before a version bump, always back up the old build.
#
#   ./Tools/release.sh 0.3.0
#
set -euo pipefail

if [ "${BOWOTTO_RELEASE_REEXEC:-}" != "1" ]; then
    _snapshot="$(mktemp -t bowotto-release)"
    cp "${BASH_SOURCE[0]}" "$_snapshot"
    chmod +x "$_snapshot"
    BOWOTTO_RELEASE_REEXEC=1 BOWOTTO_RELEASE_ORIGIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" \
        "$_snapshot" "$@"
    _rc=$?
    rm -f "$_snapshot"
    exit $_rc
fi

NEW="${1:?usage: release.sh <new-version>   e.g. release.sh 0.3.0}"
REPO="${BOWOTTO_RELEASE_ORIGIN:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PLUGINS="$HOME/Documents/Core Focus Plugins"
DEPLOYED_VST3="$PLUGINS/Ableton Live VST3 (never move or rename this folder)/The Bowotto.vst3"
DEPLOYED_AU="$HOME/Library/Audio/Plug-Ins/Components/The Bowotto.component"
BACKUPS="$PLUGINS/Backups"
DATE="$(date +%Y-%m-%d)"

fail() { echo "✗ $1" >&2; exit 1; }
step() { echo ""; echo "── $1"; }

cd "$REPO"

pgrep -x Live >/dev/null 2>&1 && fail "Ableton Live is running — quit it first"

OLD="$(sed -n 's/^project(TheBowotto VERSION \([0-9.]*\).*/\1/p' CMakeLists.txt)"
[ -n "$OLD" ] || fail "could not read current version from CMakeLists.txt"
[ "$OLD" != "$NEW" ] || fail "version $NEW is already the current version"

echo "THE BOWOTTO release:  v$OLD  ->  v$NEW"

step "Backing up the deployed plugin"
mkdir -p "$BACKUPS"
if [ -d "$DEPLOYED_VST3" ]; then
    B="$BACKUPS/The Bowotto v$OLD ($DATE).vst3"; rm -rf "$B"; ditto "$DEPLOYED_VST3" "$B"; echo "✓ $B"
else
    echo "· no VST3 deployed yet — skipping"
fi
if [ -d "$DEPLOYED_AU" ]; then
    B="$BACKUPS/The Bowotto v$OLD ($DATE).component"; rm -rf "$B"; ditto "$DEPLOYED_AU" "$B"; echo "✓ $B"
else
    echo "· no AU deployed yet — skipping"
fi

step "Archiving the source tree"
ARCHIVE="$REPO/Archive/the-bowotto-v$OLD-$DATE"
mkdir -p "$REPO/Archive"
rm -rf "$ARCHIVE"
mkdir -p "$ARCHIVE"
ditto Source "$ARCHIVE/Source"
ditto Tools "$ARCHIVE/Tools"
cp CMakeLists.txt README.md "$ARCHIVE/" 2>/dev/null || true
[ -d Manual ] && ditto Manual "$ARCHIVE/Manual"
echo "✓ $ARCHIVE"

step "Bumping version to $NEW"
sed -i '' "s/^project(TheBowotto VERSION $OLD/project(TheBowotto VERSION $NEW/" CMakeLists.txt
grep -q "project(TheBowotto VERSION $NEW" CMakeLists.txt || fail "version bump failed"
echo "✓ CMakeLists.txt"

step "Rebuilding and running the test rig"
cmake --build build --target TheBowotto_VST3 --target TheBowotto_AU --target TheBowotto_Standalone \
      --target BowottoTests --target BowottoSnapshot \
      > /dev/null 2>&1 || fail "build failed - run cmake --build build to see errors"
./build/BowottoTests > /dev/null || fail "BowottoTests FAILED"
echo "✓ BowottoTests passed"

step "Regenerating the manual screenshot"
mkdir -p Manual
./build/BowottoSnapshot "$REPO/Manual/bowotto-editor.png" > /dev/null || fail "screenshot render failed"
echo "✓ Manual/bowotto-editor.png"

step "Checking docs are up to date"
grep -q "$NEW" README.md         || fail "README.md has no v$NEW section — write the changelog, then re-run"
[ -f Manual/index.html ] && { grep -q "$NEW" Manual/index.html || fail "Manual/index.html still shows an older version — update it, then re-run"; }
echo "✓ docs mention v$NEW"

step "Deploying to Live's folder (VST3 + AU)"
"$REPO/../tools/deploy-plugin.sh" "$REPO/build/TheBowotto_artefacts/Release/VST3/The Bowotto.vst3"
"$REPO/../tools/deploy-au.sh"     "$REPO/build/TheBowotto_artefacts/Release/AU/The Bowotto.component"

echo ""
echo "RELEASE OK — THE BOWOTTO v$NEW is built, tested, documented and deployed (VST3 + AU)."
