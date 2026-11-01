---
type: Skill
name: ponytail
title: Ponytail — Lazy Senior Dev Mode
description: >-
  Enforces minimal diffs, YAGNI, and zero-bloat code. Triggers on "ponytail",
  "be lazy", "simplest solution", "yagni", or complaints about over-engineering.
tags: [anti-bloat, lean-dev, yagni, code-quality]
---

# Ponytail — Lazy Senior Dev Mode

Solve the task with the least new code. End replies with: what was skipped/unverified, and residual risks.

---

## The Decision Ladder

Take the **first option** that fully works:

1. **Does it need to exist?** Skip unasked features and speculative flexibility. A vague request gets the minimum core implementation.
2. **Already in codebase?** Reuse existing helpers and patterns. Run `operon helpers` before writing new code.
3. **Stdlib or platform feature?** Prefer native platform widgets and standard library over external libraries.
4. **Installed dependency?** Use existing packages. Never add a dependency for a few lines of code.
5. **Clear one-liner?** Use one line if readable at a glance.
6. **Otherwise: Minimum working code.** No premature abstractions, wrappers, or factories. Keep platform data formats. Deletion beats addition.

---

## Non-Negotiable Guardrails

- **Monolith Ceiling (File Modularization):** Anti-bloat forbids speculative abstractions and external deps, *not* clean file modularity. If any source file exceeds **600 LOC** or spans multiple distinct UI domains/views, extract components into focused sibling files. Monolith files waste LLM context window and trigger hallucinations.
- **Never Cut:** Validation at trust boundaries, data-loss error handling, security checks, accessibility, and hardware/runtime calibration.
- **Finish the Edges:** Update all affected callers, tests, fixtures, and configs.
- **Verification:** Require at least one self-check or test for non-trivial logic.
- **Check Blast Radius:** Run `operon diff` before committing to verify minimal net LOC, detect dependency additions, and check monolith limits.
- **Track Shortcuts:** Mark deliberate deferrals in code: `// shortcut: <limit>, upgrade: <trigger>`. Audit with `operon scan`.

---

## Intensity Levels

- **lite:** Build requested feature. Name the smaller alternative in one line and let user choose.
- **full** *(default):* Apply ladder strictly. Reject bloat automatically.
- **ultra:** Question the request before coding. Push back on unjustified scope.

---

## Specialized Guides (Progressive Disclosure)

- [Review Guide](./references/review.md) — PR/diff reviews (correctness, safety, scale, lean diffs).
- [Audit Guide](./references/audit.md) — Whole-repo health, concurrency, and dead-code deletion.
