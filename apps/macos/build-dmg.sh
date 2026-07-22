#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP="$SCRIPT_DIR/build/My Job Finder.app"
ARCH_SUFFIX="${ARCH_SUFFIX:-$(uname -m)}"
OUTPUT_NAME="${OUTPUT_NAME:-MyJobFinder-macOS-$ARCH_SUFFIX.dmg}"
OUTPUT="$REPO_ROOT/artifacts/$OUTPUT_NAME"
STAGING="$SCRIPT_DIR/build/dmg-root"

if [[ ! -d "$APP" ]]; then
  echo "Missing app bundle: $APP" >&2
  exit 1
fi

rm -rf "$STAGING" "$OUTPUT"
mkdir -p "$STAGING" "$REPO_ROOT/artifacts"
cp -R "$APP" "$STAGING/"
ln -s /Applications "$STAGING/Applications"
hdiutil create -volname "My Job Finder" -srcfolder "$STAGING" -ov -format UDZO "$OUTPUT"
rm -rf "$STAGING"
echo "Built $OUTPUT"
