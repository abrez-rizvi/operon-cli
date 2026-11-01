---
type: Workflow
name: bug-fix
title: Bug Fix Workflow
description: >-
  Use when anything is broken, failing, throwing errors, returning wrong output,
  or behaving unexpectedly (e.g. "fix this", "it crashes", "error 500", "test failed",
  "why does this happen?"). Orchestrates systematic-debugging -> tdd + ponytail -> clean-debug-logs -> handoff.
triggers: [fix, broken, error, fail, crash, bug, issue, regress, exception]
tags: [workflow, bug-fix, debugging, tdd, reliability]
---

# Bug Fix Workflow

A disciplined route for diagnosing, reproducing, and fixing bugs without guesswork or leftover debug scaffolding.

```text
[Phase 1: Reproduce]          [Phase 2: Root-Cause Fix]        [Phase 3: Clean & Close]
  systematic-debugging  ──►    tdd (Regression Test)    ──►    operon clean -Purge
  (Tier 1 or Tier 2)           ponytail (Minimal Fix)          operon diff
                                                               handoff (Exit-Only)
```

---

## Phase 1: Reproduce & Isolate (Entry)
* **Skill Bundled:** `skills/systematic-debugging`
* **Action:**
  1. **Triage Tier:**
     - **Tier 1 (Deterministic Trace):** If direct stack trace, syntax error, broken UI locator, or clear layout bounds overflow, diagnose directly and jump to Phase 2.
     - **Tier 2 (Scientific Loop):** For multi-factor, flaky, or silent bugs, construct an automated red-capable command, minimize repro, hypothesize (3–5 predictions), and instrument (`[DEBUG-<id>]`).
* **Phase Gate:** Root cause confirmed (or red reproduction command active).

---

## Phase 2: Fix & Regression Lock (In-Flight)
* **Skills Bundled:** `skills/tdd`, `skills/ponytail`
* **Action:**
  1. Convert minimal repro into a permanent regression test at the public seam.
  2. Apply the minimal fix using `ponytail` (solve root cause once, enforce 600 LOC ceiling).
  3. Confirm both regression test and original feedback loop pass green.
* **Phase Gate:** Regression test locked in and green.

---

## Phase 3: Clean & Close (Wrap-up)
* **Tools / Skills Bundled:** `operon clean`, `operon diff`, `skills/handoff` (Exit-Only)
* **Action:**
  1. Run `.\tools\operon.ps1 clean -Purge` (or `./tools/operon.sh clean --purge`) to purge temporary `[DEBUG-...]` scaffolding.
  2. Run `.\tools\operon.ps1 diff` to verify clean blast radius and check 600 LOC ceiling.
  3. **Closure:** If ending session, generate `.handoff.md`. For normal turn completions within an active session, report fix and metrics directly.

---

## Adaptive Entry & Fast-Paths
* **Pre-Existing Reproduction:** If the user already provides a failing test or automated reproduction script, skip Phase 1 construction and jump directly to Phase 2 (Root-Cause Fix).
* **Cleanup Only:** If the user asks only to purge debug logs or verify uncommitted diffs, execute Phase 3 directly (`operon exec bug-fix:close`).
