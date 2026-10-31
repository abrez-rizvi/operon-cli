---
type: Skill
name: systematic-debugging
title: Systematic Debugging
description: Reproduce, isolate, root-cause, and fix bugs with evidence instead of guesswork.
tags: [debugging]
---

# Systematic Debugging

## Reproduce
- Capture the exact failing input, command, and observed vs. expected output.
- Write a failing test or a minimal script that reproduces the bug deterministically.
- If you cannot reproduce it, gather more evidence before changing code.

## Isolate
- Bisect: narrow the failing path by halving the search space (inputs, commits, modules).
- Use temporary diagnostics tagged `[DEBUG-<topic>]` so `operon clean` can find them.
- Check `operon boot` invariants — known team gotchas often explain the failure.

## Root Cause
- State the root cause in one sentence before writing the fix.
- Distinguish the trigger (what exposed it) from the cause (what is actually wrong).
- If the cause is a non-obvious project quirk, record it: `operon remember "[scope] <gotcha>"`.

## Fix
- Make the smallest change that addresses the root cause, not the symptom.
- Keep the reproduction test; it must now pass.
- Remove all `[DEBUG-...]` diagnostics: `operon clean --purge`.

## Verify
- Run the relevant test suite, then `operon verify` and `operon clean` (both must exit 0).
