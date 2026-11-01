#!/usr/bin/env bash
# Detects and cleans up temporary [DEBUG-...] instrumentation logs from the codebase.
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Notice: Not inside a git repository. Skipping debug log scan."
  exit 0
fi

tag="${1:-DEBUG-}"
purge="${2:-}"

echo "=================================================="
echo "      DEBUG INSTRUMENTATION SCAN & CLEANUP        "
echo "=================================================="

raw_hits=$(git grep -n -I -E "\[$tag[a-zA-Z0-9_\-]+\]" -- ":(exclude)operon" ":(exclude).agents" ":(exclude)*.md" ":(exclude)*.ps1" ":(exclude)*.sh" 2>/dev/null || true)

if [ -z "$raw_hits" ]; then
  echo "No temporary debug logs detected. Clean codebase!"
  echo "=================================================="
  exit 0
fi

echo "Found temporary debug logs:"
echo "$raw_hits"
echo ""

if [ "$purge" = "--purge" ]; then
  echo "Purging debug logs..."
  files=$(echo "$raw_hits" | cut -d: -f1 | sort -u)
  for f in $files; do
    sed -i "/\[$tag[a-zA-Z0-9_\-]*\]/d" "$f"
    echo "  [CLEANED] $f"
  done
  echo "All temporary debug logs purged successfully!"
else
  echo "Dry-run complete. Run with '--purge' to automatically delete these lines."
fi
echo "=================================================="
