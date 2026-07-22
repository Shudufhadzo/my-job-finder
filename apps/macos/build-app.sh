#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_VERSION="${APP_VERSION:-$(cd "$REPO_ROOT" && node -p "require('./package.json').version")}"
swift build -c release

APP="$SCRIPT_DIR/build/My Job Finder.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
BIN_DIR="$(swift build -c release --show-bin-path)"
cp "$BIN_DIR/MyJobFinder" "$APP/Contents/MacOS/MyJobFinder"
ENGINE="$APP/Contents/Resources/engine"
mkdir -p "$ENGINE"
cp -R "$REPO_ROOT/dist" "$ENGINE/dist"
cp "$REPO_ROOT/package.json" "$REPO_ROOT/package-lock.json" "$ENGINE/"
cp "$(command -v node)" "$ENGINE/node"
(cd "$ENGINE" && npm install --omit=dev --ignore-scripts --no-audit --no-fund)
(cd "$ENGINE" && PLAYWRIGHT_BROWSERS_PATH="$ENGINE/ms-playwright" npx playwright install --only-shell chromium)
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>MyJobFinder</string>
  <key>CFBundleIdentifier</key><string>com.myjobfinder.desktop</string>
  <key>CFBundleName</key><string>My Job Finder</string>
  <key>CFBundleDisplayName</key><string>My Job Finder</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>__APP_VERSION__</string>
  <key>CFBundleVersion</key><string>__APP_VERSION__</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
sed -i '' "s/__APP_VERSION__/$APP_VERSION/g" "$APP/Contents/Info.plist"
chmod +x "$APP/Contents/MacOS/MyJobFinder" "$ENGINE/node"
codesign --force --deep --sign - "$APP"
echo "Built $APP"
