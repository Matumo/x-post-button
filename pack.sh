#!/bin/bash
set -e

# Create build directory if it doesn't exist
mkdir -p ./build

# Chrome Extension
rm -rf ./build/chrome-extension.zip
7z a ./build/chrome-extension.zip ./chrome-extension -x!*.DS_Store
