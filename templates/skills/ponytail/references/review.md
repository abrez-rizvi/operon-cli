---
type: Reference
title: Ponytail Code Review Protocol
description: Change review protocol for correctness, data safety, load scaling, and lean diffs.
tags: [review, code-review, correctness, safety]
---

# Ponytail Code Review Protocol

Review a change like a senior developer who will be paged when it breaks in production.

Order of priority:
1. **Correctness**
2. **Safety & Data Loss Prevention**
3. **Scale & Concurrency under Load**
4. **Test Coverage on Risky Logic**
5. **Speed & Latency**
6. **Lean Implementation (Zero Bloat)**

---

## 1. Trace the Scope
- Read the diff, then inspect callers and connected modules (functions it calls, tests, data models).
- Grep for callers if any function signature, return type, or behavior changed.
- Determine the assumed load: single user script vs. multi-tenant concurrent service.

## 2. Check for Flaws
- **Bugs:** Wrong edge cases (null, empty, zero, boundary off-by-one, timezone mismatch), broken callers.
- **Risks:** Unvalidated input at trust boundaries, swallowed errors, un-transactional multi-step writes.
- **Scale:** In-memory unbounded growth, N+1 queries, race conditions (check-then-act), unshared process state.
- **Missing Tests:** Any new branch, loop, parser, or security/financial calculation without a failing test case.
- **Lean Opportunities:**
  - Dead code, unused flags, speculative parameters.
  - Duplicated helpers already available elsewhere in the repo.
  - Native standard library or platform capabilities replacing new dependencies.
  - Single-implementation interfaces, empty wrappers, factory boilerplate.

## 3. Ground Every Finding
- Every finding must cite a concrete failure scenario: *"Input X in situation Y causes error Z."*
- Propose the **smallest possible fix**, favoring code deletion over new layers.
- Avoid aesthetic bike-shedding or stylistic nitpicking.

## 4. Structured Output Format
Group findings into three categories (skip empty ones):
1. **Must Fix:** Bugs, data loss, security vulnerabilities, scale failures.
2. **Should Fix:** Risky untested paths, high duplicate code, real performance bottlenecks.
3. **Nice to Have:** Minor speed-ups, shorter idiomatic expressions.

Each finding format:
```text
[Number]. [Summary Title] (`path/to/file.ext:L12-L34`)
   - What this is: 1 sentence description of what the code does.
   - Problem: Concrete failure case and why it breaks.
   - Fix: Minimal line-level fix.
   - If skipped: Concrete consequence in production.
```

End with:
- **Verdict:** `Ship` OR `Fix items [X, Y] before shipping`.
- **Lean Delta:** Potential lines or dependencies saved.
- **Unverified Scope:** Explicitly list any environments or edge cases not checked.
