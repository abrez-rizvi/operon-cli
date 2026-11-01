---
type: Skill
name: tdd
title: Test-Driven Development (TDD)
description: Seam-based test-driven development loop; smallest failing test first, minimal code to pass.
tags: [testing, tdd, seams, verification]
---

# Test-Driven Development (TDD)

TDD is the vertical red → green cycle. Verify public behavior at architectural seams, never internal implementation details.

---

## Seam Definition
A **seam** is the narrowest public boundary where behavior can be observed without reaching inside:
1. **Agree Seams First:** Identify the public interface before writing a test ("`refreshToken(token, now)` returns a new expiry").
2. **Never Test Internals:** Do not test private functions, hidden state, or implementation details.
3. **Mock Only at Boundaries:** Mock network I/O, clock/time, and third-party systems—never internal collaborators.
*Detailed mocking patterns and boundary guidelines: see [Seams & Mocking Guide](./references/seams-and-mocking.md).*

---

## Red Phase
1. Write ONE failing test asserting the expected behavior at the public seam.
2. Expected values must come from an independent truth (spec, worked example, hardcoded literal)—never recomputed using the same logic as the implementation.
3. Run the test and confirm it fails for the expected reason (not a typo or import error).
4. `operon checkpoint "red: <behavior>"`.

---

## Green Phase
1. Write the minimum code to make the failing test pass. No speculative generality (adhere to `ponytail`).
2. Run the relevant test suite; all tests must pass.
3. `operon checkpoint "green: <behavior>"`.

---

## Refactor Phase
- Remove duplication and clarify names while tests stay green.
- Keep each file under the project LOC ceiling (see `operon verify`).
- Do not add dependencies during refactor.

---

## Anti-Patterns to Reject
- **Tautological Tests:** Assertions that pass by construction (`expect(add(a, b)).toBe(a + b)`).
- **Implementation Coupling:** Mocks private functions or queries internal state directly.
- **Horizontal Slicing:** Writing all tests upfront before implementing code. Bulk tests test imagined behavior.
- **Vertical Tracer Bullets (The Right Way):** One seam → One failing test → Minimal implementation to pass → Repeat.

---

## Done Criteria
- Every new behavior has a test that failed before the change.
- `operon verify` and `operon clean` exit 0.
