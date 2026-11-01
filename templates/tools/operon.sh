#!/usr/bin/env bash
# Operon Unified CLI Dispatcher
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
cmd="${1:-help}"
shift || true

case "$cmd" in
  diff)
    "$repo_root/skills/ponytail/scripts/diff-metrics.sh" "$@"
    ;;
  clean)
    "$repo_root/skills/systematic-debugging/scripts/clean-debug-logs.sh" "$@"
    ;;
  scan)
    "$repo_root/skills/ponytail/scripts/scan-debt.sh" "$@"
    ;;
  helpers)
    "$repo_root/skills/ponytail/scripts/find-helpers.sh" "$@"
    ;;
  validate)
    python3 "$script_dir/validate-okf.py" "$repo_root"
    ;;
  tokens)
    python3 "$script_dir/count-tokens.py" "$repo_root"
    ;;
  help|*)
    echo "Operon CLI Dispatcher:"
    echo "  ./tools/operon.sh diff [ref]       Check LOC delta, dependency bloat & >600 LOC ceiling"
    echo "  ./tools/operon.sh clean [--purge]  Detect & purge temporary [DEBUG-...] instrumentation"
    echo "  ./tools/operon.sh scan [path]      Scan for // shortcut: markers & technical debt"
    echo "  ./tools/operon.sh helpers <query>  Search existing helpers to prevent duplication"
    echo "  ./tools/operon.sh validate         Validate OKF conformance across Operon catalog"
    echo "  ./tools/operon.sh tokens [path]    Audit token footprint across skills and workflows"
    ;;
esac
