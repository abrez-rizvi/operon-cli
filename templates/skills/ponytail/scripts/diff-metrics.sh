#!/usr/bin/env bash
# Evaluates git diff metrics to verify minimal code changes and detect dependency bloat.
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Notice: Not inside a git repository (or git is unavailable). Skipping diff metrics."
  exit 0
fi

target_ref="${1:-HEAD}"
echo "=================================================="
echo "         PONYTAIL DIFF & BLAST RADIUS METRICS     "
echo "=================================================="

numstat=$(git -c core.safecrlf=false diff --numstat "$target_ref" 2>/dev/null || git -c core.safecrlf=false diff --numstat 2>/dev/null || true)

if [ -z "$numstat" ]; then
  echo "Working tree is clean. No uncommitted changes detected."
  exit 0
fi

total_ins=0
total_del=0
dep_warn=()
monolith_warn=()

while IFS=$'\t' read -r ins del file; do
  [ -z "$file" ] && continue
  if [[ "$ins" =~ ^[0-9]+$ ]]; then total_ins=$((total_ins + ins)); fi
  if [[ "$del" =~ ^[0-9]+$ ]]; then total_del=$((total_del + del)); fi

  if [ -f "$file" ]; then
    lines=$(wc -l < "$file" 2>/dev/null || echo 0)
    if [ "$lines" -gt 600 ]; then
      monolith_warn+=("$file ($lines lines)")
    fi
  fi

  if [[ "$file" =~ (package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|pyproject\.toml|Pipfile|Cargo\.toml|Cargo\.lock|go\.mod|go\.sum|pom\.xml|Gemfile|build\.gradle.*) ]]; then
    dep_warn+=("$file")
  fi
done <<< "$numstat"

net_delta=$((total_ins - total_del))
echo ""
echo "Summary:"
echo "  Lines Added:   +$total_ins"
echo "  Lines Deleted: -$total_del"
echo "  Net Delta:     $net_delta"

if [ "$net_delta" -le 0 ]; then
  echo "  Verdict:       LEAN WIN (Zero or negative net LOC)"
else
  echo "  Verdict:       EXPANDED (Verify every added line is essential)"
fi

echo ""
echo "Dependency Bloat Check:"
if [ "${#dep_warn[@]}" -gt 0 ]; then
  echo "  [!] WARNING: Dependency manifest(s) modified:"
  for f in "${dep_warn[@]}"; do
    echo "      - $f"
  done
  echo "      Verify if an existing installed library or standard library could do the job."
else
  echo "  [OK] No dependency manifests modified. Clean zero-dependency addition."
fi

echo ""
echo "Monolith File Check (>600 LOC Ceiling):"
if [ "${#monolith_warn[@]}" -gt 0 ]; then
  echo "  [!] WARNING: Large file(s) detected. Ponytail forbids bloated monoliths:"
  for f in "${monolith_warn[@]}"; do
    echo "      - $f — Exceeds 600 LOC. Decompose into focused sibling modules."
  done
else
  echo "  [OK] All modified files remain under the 600 LOC modular ceiling."
fi
echo "=================================================="
