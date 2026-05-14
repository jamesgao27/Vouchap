#!/usr/bin/env bash
# Regenerate iOS App Store icon + Android launcher mipmaps from src/mobile-ui/assets/logo2.png
# Run after updating logo2.png (see src/mobile-ui/assets/README.md).
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src/mobile-ui/assets/logo2.png"
if [[ ! -f "$SRC" ]]; then
  echo "Missing: $SRC" >&2
  exit 1
fi

IOS_OUT="$ROOT/ios/Vouchap/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png"
magick "$SRC" -resize 1024x1024 -background none -gravity center -extent 1024x1024 "$IOS_OUT"
echo "Wrote $IOS_OUT"

write_android() {
  local d="$1" fg="$2" la="$3"
  local dir="$ROOT/android/app/src/main/res/mipmap-${d}"
  magick "$SRC" -resize "${fg}x${fg}^" -gravity center -extent "${fg}x${fg}" -define webp:method=6 "${dir}/ic_launcher_foreground.webp"
  magick "$SRC" -resize "${la}x${la}^" -gravity center -extent "${la}x${la}" -define webp:method=6 "${dir}/ic_launcher.webp"
  cp "${dir}/ic_launcher.webp" "${dir}/ic_launcher_round.webp"
  echo "Wrote mipmap-${d}/*.webp"
}

write_android mdpi 108 48
write_android hdpi 162 72
write_android xhdpi 216 96
write_android xxhdpi 324 144
write_android xxxhdpi 432 192

echo "Done."
