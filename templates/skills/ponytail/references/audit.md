---
type: Reference
title: Ponytail Whole-Repo Audit Protocol
description: Repository-wide quality, concurrency, scaling, and dead-code audit protocol.
tags: [audit, code-quality, scale, security]
---

# Ponytail Whole-Repo Audit Protocol

Conduct a repository-wide quality audit like a senior developer who just inherited the codebase and owns the on-call pager.

Audit Scope: Focus where mistakes cost the most (auth, money, user data, background queues, database transactions).

---

## 1. Map Architecture & Scale
- Read entry points: routes, jobs, handlers, CLI commands, and database models.
- Determine the system load profile:
  - Personal script / internal CLI?
  - High-traffic web service?
  - Background batch processor?
- State the assumed load upfront in your audit report.

## 2. Targeted Audit Vectors
1. **Critical Vulnerabilities & Data Integrity:**
   - Secrets in code or configuration.
   - SQL injection, SSRF, XSS, insecure deserialization.
   - Non-atomic updates or missing rollback handlers.
2. **Concurrency & Scale Bottlenecks:**
   - Check-then-write race conditions.
   - Memory leaks (growing lists/maps in global state).
   - O(N^2) loops on unbounded user inputs.
   - Unbounded queries or missing database indexes on queried fields.
3. **Fragile Unverified Logic:**
   - Critical business logic without automated tests.
   - Unhandled exception blocks (`except: pass` or empty `catch`).
4. **Ruthless Lean Audit:**
   - Dead or unreachable code: Grep repo before flagging to avoid false positives.
   - Duplicate implementations of identical helpers.
   - Outdated or bloated dependencies doing tasks native standard library methods do.
   - Speculative architecture (interfaces with 1 class, unused configs/flags).

## 3. Ground Rules
- No hypothetical warnings without concrete trigger conditions.
- Mark existing `shortcut: <ceiling>` comments as tracked debt unless the ceiling is already crossed.
- Propose the leanest fix for every finding.

## 4. Structured Output Format
1. **Repository Summary:** 2-3 sentences explaining repo purpose and assumed load profile.
2. **Ranked Findings (numbered 1..N):**
   - **Must Fix**
   - **Should Fix**
   - **Nice to Have**
3. **Verdict:** Overall health assessment and immediate triage order.
4. **Lean Metrics:** Potential LOC reduction (`-N lines`) and packages removed (`-M dependencies`).
5. **Not Audited:** Explicitly list skipped sub-systems or third-party vendor directories.
