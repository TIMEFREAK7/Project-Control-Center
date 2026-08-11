#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Only dependency manifest in this repo: tests/package.json (jsdom + fake-indexeddb
# for the jsdom/IndexedDB test suite). The app itself has zero npm deps by design —
# see CLAUDE.md.
if [ -f tests/package.json ]; then
  ( cd tests && npm install )
fi

# Keep the shipped index.html in sync with src/ at session start, so a session that
# reads index.html isn't looking at a stale build from a prior session's uncommitted edits.
node build.js
