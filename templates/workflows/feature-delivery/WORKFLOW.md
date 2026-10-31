---
type: Workflow
name: feature-delivery
title: Feature Delivery
description: Scope, test-first build, and verify a new feature or enhancement.
default: true
triggers: [add, build, implement, create, feature, support, new, introduce, enable]
---

# Feature Delivery

## Phase 1: Scope
Define the seam and the smallest shippable slice.
`operon fetch tdd:seam-definition` · `operon fetch lean-diff:scope-discipline`

## Phase 2: Test
Write one failing test for the next behavior.
`operon fetch tdd:red-phase`

## Phase 3: Build
Minimal code to green, then refactor within the ceiling.
`operon fetch tdd:green-phase` · `operon fetch tdd:refactor-phase`

## Phase 4: Verify
Run tests, then the deterministic gates; fix until both exit 0.
`operon verify` · `operon clean`
