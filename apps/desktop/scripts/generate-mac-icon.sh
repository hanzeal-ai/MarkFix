#!/bin/sh
set -eu

desktop_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
icon_tmp=$(mktemp -d)
trap 'rm -rf "$icon_tmp"' EXIT

# Render the vector at the full canvas size before generating each ICNS representation.
sed 's/width="96" height="96"/width="1024" height="1024"/' \
  "$desktop_dir/../../docs/brand/logo/markfix-logo-icon.svg" > "$icon_tmp/icon.svg"
sips -s format png "$icon_tmp/icon.svg" --out "$icon_tmp/icon.png" >/dev/null
mkdir "$icon_tmp/icon.iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$icon_tmp/icon.png" \
    --out "$icon_tmp/icon.iconset/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size * 2))" "$((size * 2))" "$icon_tmp/icon.png" \
    --out "$icon_tmp/icon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$icon_tmp/icon.iconset" -o "$desktop_dir/build/icon.icns"
