#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$APP_ROOT/unpacked-firefox"

[ "$OUT" = "$APP_ROOT/unpacked-firefox" ] || { echo "ERROR: OUT safety check failed" >&2; exit 1; }
command -v rsync >/dev/null 2>&1 || { echo "ERROR: rsync is required" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT"

rsync -a --exclude='.DS_Store' "$APP_ROOT/src/" "$OUT/src/"
node "$APP_ROOT/scripts/create-firefox-manifest.js" "$APP_ROOT/manifest.json" "$OUT/manifest.json"

for legal_file in LICENSE NOTICE THIRD_PARTY_NOTICES.md; do
  cp "$APP_ROOT/$legal_file" "$OUT/$legal_file"
done

FILE_COUNT="$(find "$OUT" -type f | wc -l | tr -d ' ')"
echo "✓ unpacked-firefox/ ready — $FILE_COUNT files"
