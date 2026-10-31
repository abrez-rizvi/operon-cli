---
type: Skill
name: tdd
title: Seam-Based Test-Driven Development
description: Red-green-refactor around a clearly defined seam; smallest failing test first, minimal code to pass.
tags: [testing, quality]
---

# Seam-Based TDD

## Seam Definition
Identify the narrowest boundary where behavior can be observed: a pure function, a module's public API, or an HTTP handler.
- Name the seam explicitly before writing tests ("`refreshToken(token, now)` returns a new expiry").
- Prefer seams that avoid network, clock, and filesystem; inject those as parameters.
- If no seam exists, create one with the smallest possible extraction — do not refactor broadly first.

## Red Phase
1. Write ONE failing test that describes the next behavior at the seam.
2. Run it and confirm it fails for the expected reason (not a typo or import error).
3. `operon checkpoint "red: <behavior>"`.

## Green Phase
1. Write the minimum code to make the failing test pass. No speculative generality.
2. Run the full relevant test file; all tests must pass.
3. `operon checkpoint "green: <behavior>"`.

## Refactor Phase
- Remove duplication and clarify names while tests stay green.
- Keep each file under the project LOC ceiling (see `operon verify`).
- Do not add dependencies during refactor.

## Done Criteria
- Every new behavior has a test that failed before the change.
- `operon verify` and `operon clean` exit 0.
