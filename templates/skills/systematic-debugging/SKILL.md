---
type: Skill
name: systematic-debugging
title: Systematic Debugging — Scientific Root-Cause Discipline
description: >-
  Scientific root-cause debugging discipline. Triggers on "diagnose", "debug this",
  or when an issue is reported as broken, failing, throwing, or regressing.
tags: [debugging, root-cause, testing, reliability]
---

# Systematic Debugging — Scientific Root-Cause Discipline

Never guess or mutate code on a hunch. Match debugging depth to the failure mode:

* **Tier 1 (Deterministic Fast-Path):** Direct stack trace, compiler error, syntax failure, broken UI locator, or clear layout bounds overflow. Inspect the failing line/trace directly, apply a surgical 1-step fix, and verify with the build/test command. Skip hypothesis logging ceremony.
* **Tier 2 (Scientific Discipline):** Multi-factor failures, flaky tests, race conditions, silent data corruption, or unexplained behavioral bugs. Strictly execute the 6-phase loop below.

---

## Phase 1: Build a Tight Feedback Loop (Non-Negotiable Gate)

**Do not read code or form hypotheses until this command exists.**

Construct a single, fast, automated command that is **Red-Capable**:
* Drives the actual bug code path and asserts the user's exact symptom.
* Fails (red) on the current bug and succeeds (green) once fixed.
* Deterministic and fast (runs in seconds, unattended).

*Strategies to build the loop (curl, test, replay trace, bisection): see [Loop Strategies Guide](./references/loop-strategies.md).*

> **Gate:** If you cannot build an automated loop, STOP and ask the user for a reproduction artifact or environment. Do not proceed to Phase 2 without a red signal.

---

## Phase 2: Reproduce & Minimize

1. **Verify Symptom:** Confirm the failure matches the user's exact reported error, not a coincident adjacent failure.
2. **Shrink the Repro:** Strip inputs, config, and setup one by one, re-running the loop after each cut. Keep only what is load-bearing.

---

## Phase 3: Hypothesize (3–5 Ranked Predictions)

Generate **3 to 5 distinct, falsifiable hypotheses** before testing any. Never anchor on a single guess.

Format:
> *"If [Cause X] is true, then [Changing Y] will make the bug disappear / [Condition Z] will trigger it."*

---

## Phase 4: Targeted Instrumentation

1. Test one hypothesis at a time by changing a single variable.
2. Prefer debugger/REPL inspection over print statements.
3. If logging, use **unique tagged prefixes**: `[DEBUG-a1b2]`.
4. Never log everything. Log only at boundaries that distinguish hypotheses.

---

## Phase 5: Regression Test & Fix

1. **Lock Down the Seam:** Convert the minimal repro into a permanent regression test at the true public interface. Watch it fail.
2. **Apply the Minimal Fix:** Make the smallest change that addresses the root cause (adhere to `ponytail` ladder).
3. **Verify:** Confirm the regression test passes, then re-run the original Phase 1 loop.

---

## Phase 6: Deterministic Cleanup

Before declaring victory:
1. Run `.\tools\operon.ps1 clean -Purge` (or `./tools/operon.sh clean --purge`) to detect and remove all `[DEBUG-...]` scaffolding.
2. Delete throwaway reproduction scripts and temporary test fixtures.
3. State the confirmed root cause clearly in the commit or final summary.
