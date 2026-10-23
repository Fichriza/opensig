#!/bin/bash
# Builds dist/OpenSig.app on a Mac: a native macOS app (main.swift, WKWebView) that embeds ../opensig.
# Needs only Apple's free command line tools:  xcode-select --install
# Run from Terminal:  bash build-mac.sh        Result: dist/OpenSig.app and dist/OpenSig-mac.zip (to copy to other Macs)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
web="$here/../opensig"
dist="$here/dist"
app="$dist/OpenSig.app"
version="1.0"
build="$(date +%Y%m%d%H%M)"

command -v swiftc >/dev/null 2>&1 || { echo "swiftc was not found. Install Apple's command line tools first:  xcode-select --install"; exit 1; }
[ -f "$web/index.html" ] || { echo "The OpenSig web app was not found at $web (keep the 'mac' and 'opensig' folders side by side)."; exit 1; }

echo "1/5  Compiling (Apple silicon and Intel)…"
rm -rf "$app"; mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/web" "$dist"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
built=()
for arch in arm64 x86_64; do
  if swiftc -O -target "$arch-apple-macos12.0" -o "$tmp/OpenSig-$arch" "$here/main.swift" \
       -framework Cocoa -framework WebKit -framework Network 2>"$tmp/swiftc-$arch.log"; then
    built+=("$tmp/OpenSig-$arch")
  else
    echo "     ($arch build failed – see below)"; cat "$tmp/swiftc-$arch.log"
  fi
done
[ ${#built[@]} -gt 0 ] || { echo "Compiling failed."; exit 1; }
if [ ${#built[@]} -eq 2 ]; then lipo -create -output "$app/Contents/MacOS/OpenSig" "${built[@]}"
else cp "${built[0]}" "$app/Contents/MacOS/OpenSig"; echo "     Built for $(basename "${built[0]}" | sed 's/OpenSig-//') only."; fi

echo "2/5  Copying the web app…"
rsync -a --delete --exclude 'test/' --exclude '*.md' --exclude '.DS_Store' "$web/" "$app/Contents/Resources/web/"

echo "3/5  Info.plist and icon…"
sed -e "s/__VERSION__/$version/" -e "s/__BUILD__/$build/" "$here/Info.plist" > "$app/Contents/Info.plist"
printf 'APPL????' > "$app/Contents/PkgInfo"
iconset="$tmp/OpenSig.iconset"; mkdir -p "$iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$here/icon-1024.png" --out "$iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$here/icon-1024.png" --out "$iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app/Contents/Resources/OpenSig.icns"

echo "4/5  Signing (ad hoc, for this Mac)…"
xattr -cr "$app"
codesign --force --deep --sign - "$app"

echo "5/5  Zipping…"
rm -f "$dist/OpenSig-mac.zip"
ditto -c -k --keepParent "$app" "$dist/OpenSig-mac.zip"

echo
echo "Done: $app"
echo "Start it with:  open \"$app\"   (or drag it to Applications)"
