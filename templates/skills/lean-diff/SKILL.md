---
type: Skill
name: lean-diff
title: Lean Diff & Monolith Guard
description: Keep changes small, focused, and dependency-free; never grow files past the LOC ceiling.
tags: [hygiene, review]
---

# Lean Diff & Monolith Guard

## Scope Discipline
- Change only what the task requires. No drive-by refactors, renames, or formatting churn.
- If you discover unrelated problems, note them for the user instead of fixing them.

## File Size Ceiling
- No file may grow beyond the project ceiling (default 600 LOC); `operon verify` enforces this.
- When a file nears the ceiling, extract a cohesive module rather than appending.

## Dependency Policy
- Do not add packages for trivial tasks; prefer the standard library or existing dependencies.
- Package manifests and lockfiles are locked. A human must approve changes with `operon allow <file>`.

## Debug Hygiene
- Tag temporary diagnostics with `[DEBUG-<topic>]`.
- Run `operon clean` before reporting completion; use `--purge` to remove simple debug lines.
