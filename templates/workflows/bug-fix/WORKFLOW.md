---
type: Workflow
name: bug-fix
title: Bug Fix
description: Reproduce, root-cause, fix, and verify a defect.
triggers: [fix, bug, broken, error, crash, fails, failing, regression, issue, debug, wrong]
---

# Bug Fix

## Phase 1: Reproduce
Capture a deterministic failing test or script.
`operon fetch systematic-debugging:reproduce`

## Phase 2: Root Cause
Isolate and state the cause in one sentence; record team-relevant quirks.
`operon fetch systematic-debugging:isolate` · `operon fetch systematic-debugging:root-cause`

## Phase 3: Fix
Smallest change at the root cause; keep the reproduction test.
`operon fetch systematic-debugging:fix`

## Phase 4: Verify
Run tests, then the deterministic gates; fix until both exit 0.
`operon verify` · `operon clean`
