#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -e "console.log(require(process.argv[1]).version)" "$APP_ROOT/package.json")"
DIST="$APP_ROOT/dist"
CHROME_ZIP="$DIST/rastchin-v${VERSION}-chrome-web-store.zip"
FIREFOX_ZIP="$DIST/rastchin-v${VERSION}-firefox-add-ons.zip"

[ "$DIST" = "$APP_ROOT/dist" ] || { echo "ERROR: DIST safety check failed" >&2; exit 1; }
for required_command in node pnpm; do
  command -v "$required_command" >/dev/null 2>&1 || {
    echo "ERROR: $required_command is required" >&2
    exit 1
  }
done

cd "$APP_ROOT"

pnpm run verify:version
pnpm run verify:store-assets
pnpm test
pnpm run build:unpacked
pnpm run verify:unpacked
pnpm run build:firefox
pnpm run verify:firefox

mkdir -p "$DIST"
rm -f "$CHROME_ZIP" "$FIREFOX_ZIP"
node scripts/create-store-zip.js "$APP_ROOT/unpacked" "$CHROME_ZIP"
node scripts/create-store-zip.js "$APP_ROOT/unpacked-firefox" "$FIREFOX_ZIP"

pnpm run verify:store-zip -- "$CHROME_ZIP"
pnpm run verify:store-zip:firefox -- "$FIREFOX_ZIP"

echo "✓ Browser store ZIPs ready:"
echo "  $CHROME_ZIP"
echo "  $FIREFOX_ZIP"
