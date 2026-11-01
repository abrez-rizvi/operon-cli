---
type: Workflow
name: codebase-audit
title: Codebase Audit Workflow
description: >-
  Use when inspecting, analyzing, or cleaning up a repository for tech debt, dead code,
  bloat, or scaling limits (e.g. "audit the repo", "find bloat", "clean up dead code",
  "check for shortcuts", "review project health"). Orchestrates ponytail/audit -> scan-debt -> find-helpers.
triggers: [audit, debt, bloat, review, scan, shortcut, inspect]
tags: [workflow, audit, tech-debt, bloat, review]
---

# Codebase Audit Workflow

An inspection route to identify critical bugs, race conditions, scaling ceilings, and dead code across a repository.

```text
[Phase 1: Map]            [Phase 2: Scan]              [Phase 3: Triage Report]
  ponytail/references ──►  scan-debt (Shortcuts)   ──►  Ranked Findings
  (Entry Points & Load)    find-helpers (Duplicates)    Lean LOC Delta
```

---

## Phase 1: Map System & Load Profile (Entry)
* **Skill Bundled:** `skills/ponytail/references/audit.md`
* **Action:**
  1. Inspect entry points: routes, workers, CLI commands, and data models.
  2. Determine expected load (single script vs. high-concurrency multi-tenant).
  3. Trace critical paths: auth, database transactions, money, and data writes.

---

## Phase 2: Deterministic Scans (In-Flight)
* **Skills / Tools Bundled:** `operon scan`, `operon helpers`
* **Action:**
  1. Run `.\tools\operon.ps1 scan` (or `./tools/operon.sh scan`) to inventory deferred shortcuts and identify `[ROT RISK]` markers.
  2. Run `.\tools\operon.ps1 helpers <query>` across core modules to detect duplicate utilities and reinvented logic.
  3. Grep to verify suspected dead code before flagging.

---

## Phase 3: Deliver Ranked Findings (Wrap-up)
* **Action:**
  1. Structure findings into **Must Fix**, **Should Fix**, and **Nice to Have**.
  2. Provide concrete failure cases and minimal 1-line fixes.
  3. Deliver net potential LOC reduction (`-N lines`, `-M dependencies`).

---

## Adaptive Entry & Fast-Paths
* **Shortcut Debt Scan Only:** If the user asks only to inspect technical debt or deferred shortcuts, run `.\tools\operon.ps1 scan` without executing the full architectural audit.
* **Helper / Duplicate Discovery Only:** If the user searches for existing utilities, run `.\tools\operon.ps1 helpers <term>`.
