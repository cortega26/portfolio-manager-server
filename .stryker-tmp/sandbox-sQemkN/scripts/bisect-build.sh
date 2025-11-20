#!/usr/bin/env bash
set -euo pipefail
rm -rf node_modules >/dev/null 2>&1 || true
npm ci --silent
npm run verify:lint --silent
npm run verify:build --silent
