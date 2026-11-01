#!/usr/bin/env bash
# Searches the codebase for existing helper functions and utilities before reinventing them.
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: ./find-helpers.sh <query>" >&2
  exit 1
fi

query="$1"

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Error: Not inside a git repository." >&2
  exit 1
fi

echo "=================================================="
echo "      PONYTAIL CODEBASE HELPER DISCOVERY          "
echo "=================================================="
echo "Searching for existing utilities matching: '$query'..."
echo ""

declaration_regex="(function|def|class|const|let|var|func|pub fn|fn|type|interface)[[:space:]]+([a-zA-Z0-9_]*${query}[a-zA-Z0-9_]*)"

hits=$(git grep -n -I -i -E "$declaration_regex" 2>/dev/null || true)

if [ -z "$hits" ]; then
  echo "No matching helper declarations found for '$query'."
else
  echo "$hits" | head -n 25
fi

echo ""
echo "=================================================="
