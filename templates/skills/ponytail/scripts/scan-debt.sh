#!/usr/bin/env bash
# Scans the repository for intentional 'shortcut:' debt markers and audits rot risk.
set -euo pipefail

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Error: Not inside a git repository." >&2
  exit 1
fi

marker="${1:-shortcut|ponytail}"

echo "=================================================="
echo "            PONYTAIL SHORTCUT DEBT LEDGER         "
echo "=================================================="

raw_hits=$(git grep -n -I -E "(#|//|/\*|<!--|--)[[:space:]]*($marker):" 2>/dev/null || true)

if [ -z "$raw_hits" ]; then
  echo "No shortcut debt detected. Clean ledger!"
  echo "=================================================="
  exit 0
fi

total=0
rot=0

while IFS= read -r line; do
  [ -z "$line" ] && continue
  total=$((total + 1))
  if echo "$line" | grep -qiE "(upgrade|trigger|when|revisit):"; then
    echo "  [TRACKED] $line"
  else
    rot=$((rot + 1))
    echo "  [ROT RISK] $line"
  fi
done <<< "$raw_hits"

echo ""
echo "Summary:"
echo "  Total Shortcuts: $total"
echo "  Tracked Safely:  $((total - rot))"
echo "  Rot Risk:        $rot"
echo "=================================================="
