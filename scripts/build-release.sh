#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")/.."

BUILD_DIR="build/weather"
rm -rf "$BUILD_DIR" build/weather.zip

mkdir -p "$BUILD_DIR"

cp .env.example "$BUILD_DIR/"
cp .htaccess README.md "$BUILD_DIR/"
cp index.html app.js styles.css sw.js "$BUILD_DIR/"
cp manifest.json manifest.webmanifest favicon.ico "$BUILD_DIR/"
cp version.php updater.php weather.php waves.php tides.php "$BUILD_DIR/"
cp -R icons "$BUILD_DIR/"

cd build
zip -r weather.zip weather/

echo "Release build: build/weather.zip"
