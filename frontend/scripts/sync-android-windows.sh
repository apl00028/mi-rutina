#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

WIN="/mnt/c/Users/apelaezl/AndroidStudioProjects/Aptus"

echo "=== Building Angular ==="
npm run build

echo
echo "=== Syncing Capacitor ==="
npx cap sync android

echo
echo "=== Copying Android project ==="

rsync -a --delete \
  --exclude='.idea' \
  --exclude='.gradle' \
  --exclude='build' \
  --exclude='app/build' \
  --exclude='local.properties' \
  --exclude='mnt' \
  --exclude='capacitor-android' \
  --exclude='capacitor-app' \
  --exclude='capacitor-browser' \
  --exclude='capacitor-splash-screen' \
  android/ \
  "$WIN/"

rm -rf \
  "$WIN/capacitor-android" \
  "$WIN/capacitor-app" \
  "$WIN/capacitor-browser" \
  "$WIN/capacitor-splash-screen"

rsync -a \
  node_modules/@capacitor/android/capacitor/ \
  "$WIN/capacitor-android/"

rsync -a \
  node_modules/@capacitor/app/android/ \
  "$WIN/capacitor-app/"

rsync -a \
  node_modules/@capacitor/browser/android/ \
  "$WIN/capacitor-browser/"


rsync -a \
  node_modules/@capacitor/splash-screen/android/ \
  "$WIN/capacitor-splash-screen/"

python3 - <<'PY'
from pathlib import Path

p = Path(
    "/mnt/c/Users/apelaezl/"
    "AndroidStudioProjects/Aptus/"
    "capacitor.settings.gradle"
)

s = p.read_text()

replacements = {
    "../node_modules/@capacitor/android/capacitor":
        "./capacitor-android",
    "../node_modules/@capacitor/app/android":
        "./capacitor-app",
    "../node_modules/@capacitor/browser/android":
        "./capacitor-browser",
}

for old, new in replacements.items():
    s = s.replace(old, new)

p.write_text(s)
PY

echo

# FIX_WINDOWS_SPLASH_PATH
python3 - <<'PYFIX'
from pathlib import Path

p = Path(
    "/mnt/c/Users/apelaezl/AndroidStudioProjects/Aptus/"
    "capacitor.settings.gradle"
)

s = p.read_text()

s = s.replace(
    "../node_modules/@capacitor/splash-screen/android",
    "./capacitor-splash-screen"
)

p.write_text(s)
PYFIX

echo "=== Android ready ==="
cat "$WIN/capacitor.settings.gradle"
