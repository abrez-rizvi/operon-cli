---
type: Workflow
name: feature-delivery
title: Feature Delivery Workflow
description: >-
  Use when the user wants to build, add, create, or modify any feature, component, API,
  or capability (e.g. "add X", "build Y", "create Z", "implement...", "we need support for...").
  Orchestrates grilling -> tdd -> ponytail -> handoff.
default: true
triggers: [add, build, implement, create, feature, support, new, introduce, enable]
tags: [workflow, feature, delivery, tdd, lean]
---

# Feature Delivery Workflow

A sequenced route for delivering complete, lean, and fully-tested features without over-engineering or silent assumptions.

```text
[Phase 1: Align]       [Phase 2: Build]               [Phase 3: Verify & Close]
  grilling        ──►    tdd (Seam Test)        ──►    operon diff (Ceiling Check)
                         ponytail (Minimal Diff         operon clean
                                   + Monolith Cap)      handoff (Exit-Only)
```

---

## Phase 1: Align & Scope (Entry)
* **Skill Bundled:** `skills/grilling`
* **Action:**
  1. Inspect existing code and domain architecture.
  2. Compute the frontier of unsettled decisions.
  3. Ask frontier questions in batched rounds phrased so "yes" accepts the recommended path.
* **Phase Gate:** Stop when the frontier is empty and the specification is mutually agreed upon.

---

## Phase 2: Implement (In-Flight)
* **Skills Bundled:** `skills/tdd`, `skills/ponytail`
* **Action:**
  1. **Seam Test First:** Use `tdd` to identify the public interface and write one failing test (vertical slice).
  2. **Minimal Pass:** Use `ponytail` decision ladder:
     - Check `operon helpers` before creating utilities.
     - Prefer standard library / platform features over new dependencies.
     - Enforce Monolith Ceiling: Decompose into sibling modules if any file exceeds 600 LOC.
     - Write the minimum code required to pass the test.
  3. **Repeat:** Advance slice by slice until feature requirements are satisfied.
* **Phase Gate:** All test cases green, zero unrequested abstractions or dependencies, files within 600 LOC ceiling.

---

## Phase 3: Verify & Close (Wrap-up)
* **Tools / Skills Bundled:** `operon diff`, `skills/handoff` (Exit-Only)
* **Action:**
  1. Run `.\tools\operon.ps1 diff` (or `./tools/operon.sh diff`) to confirm net LOC delta, verify zero dependency bloat, and check monolith limits.
  2. Mark any deliberate deferred items as `// shortcut: <limit>, upgrade: <trigger>`.
  3. **Closure:** If pausing or ending the session, run `handoff` to write `.handoff.md`. For normal turn completions inside an active session, report metrics directly without writing `.handoff.md`.

---

## Adaptive Entry & Fast-Paths
* **Skip Phase 1 (Align):** If the user provides an exact, unambiguous interface or spec, skip `grilling` and jump directly into Phase 2 (Build).
* **Targeted Verification Only:** If the user asks only to inspect diffs or prepare a handoff, enter Phase 3 directly without re-executing implementation.
