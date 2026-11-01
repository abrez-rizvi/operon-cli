---
type: Reference
title: Seams & Mocking Reference Guide
description: Architectural seam identification, mocking rules of thumb, and test smell detection.
tags: [testing, seams, mocking, architecture]
---

# Seams & Mocking Reference Guide

## Mocking Rules of Thumb

1. **Mock at System Boundaries:**
   - Network / HTTP APIs
   - Disk I/O & Filesystem (when necessary)
   - Clock / System Timers
   - External Databases / Message Queues

2. **Never Mock:**
   - Pure domain logic or calculations.
   - Internal helper functions or utility modules.
   - Sibling classes/functions inside the same bounded context.

---

## The Tell of a Bad Test
- If changing an internal variable name, splitting a private helper, or refactoring an algorithm breaks your test even though user-facing inputs and outputs remain identical, **the test is coupled to implementation, not behavior.**
- Delete or rewrite tests that assert internal state. Assert observable side-effects and return values at public seams.
