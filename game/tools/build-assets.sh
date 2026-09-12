#!/bin/sh
# Rebuild the character assets from the source GLB.
#   tools/build-assets.sh /path/to/mercenaries.glb
set -e
SRC="$1"; [ -n "$SRC" ] || { echo "usage: tools/build-assets.sh <source.glb>"; exit 1; }
DIR="$(cd "$(dirname "$0")/.." && pwd)"
node "$DIR/tools/extract-models.js" "$SRC" "$DIR/assets/models" 0
node "$DIR/tools/extract-textures.js" "$SRC" "$DIR/assets/models"
