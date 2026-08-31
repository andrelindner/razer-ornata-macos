#!/usr/bin/env bash
# Extracts the native addon (addon.node) from an installed razer-macos build.
# We do NOT ship that binary in this repo — it belongs to the razer-macos /
# librazermacos (GPL) projects. This pulls it out of the app you installed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="${1:-/Applications/Razer macOS.app}"
ASAR="$APP/Contents/Resources/app.asar"

if [ ! -f "$ASAR" ]; then
  echo "Could not find: $ASAR" >&2
  echo "" >&2
  echo "Install razer-macos first (see README.md → Requirements), or pass the" >&2
  echo "path to the .app as an argument, e.g.:" >&2
  echo "  ./setup.sh \"/Applications/Razer macOS.app\"" >&2
  exit 1
fi

echo "Extracting addon.node from:"
echo "  $ASAR"
cd "$HERE"
npx --yes @electron/asar extract-file "$ASAR" addon.node

if [ ! -f "$HERE/addon.node" ]; then
  echo "Extraction failed — addon.node was not produced." >&2
  exit 1
fi

echo "Done. addon.node is ready in $HERE"
echo ""

# Apply the default profile once, so the keyboard is lit right after install.
# Best-effort: this fails harmlessly if the Razer macOS app still holds the
# device (quit it, then run "node src/ornata.js default" yourself).
echo "Applying the default profile..."
if node "$HERE/src/ornata.js" default; then
  echo "The keyboard now shows the default profile. Customise it any time; see README.md."
else
  echo "" >&2
  echo "Could not apply the default profile yet. Quit the \"Razer macOS\" menu-bar" >&2
  echo "app (it holds the keyboard open), then run:  node src/ornata.js default" >&2
fi
