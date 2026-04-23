#!/usr/bin/env bash
set -euo pipefail

NPM11_DIR="${NPM11_DIR:-/tmp/octez-connect-npm11}"
NPM11_CLI="$NPM11_DIR/node_modules/npm/bin/npm-cli.js"

if [ ! -f "$NPM11_CLI" ]; then
  mkdir -p "$NPM11_DIR"
  npm install --prefix "$NPM11_DIR" npm@11.13.0
fi

exec node "$NPM11_CLI" "$@"
