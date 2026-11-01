---
type: Skill
name: handoff
title: Session Handoff
description: >-
  Compacts session state into a clean handoff document for the next agent or session.
  Triggers on "handoff", "end session", "wrap up", or when pausing a multi-step task.
tags: [session, handoff, checkpoint, context-management]
---

# Session Handoff

Compact working state into a concise snapshot document (`.handoff.md`).

> [!IMPORTANT]
> **Exit-Only Lifecycle:** `handoff` is triggered ONLY on explicit session pause, wrap-up, or agent handover (e.g. `/handoff`, "pause here", "end session").
> **Anti-Ceremony Rule:** NEVER write `.handoff.md` after routine micro-turns or sub-tasks inside an active conversation session. The IDE natively manages intra-session context compaction; writing repetitive handoffs wastes tool calls and context tokens.

---

## What to Produce

Write a file named `.handoff.md` (or `%TEMP%/.handoff.md` if the user prefers outside repo):

```markdown
# Session Handoff: [Brief Task Title]

## 1. Current State
- **Accomplished:** [Bullet list of completed milestones]
- **In-Flight:** [What is currently in progress or partially modified]

## 2. Key Decisions & Context
- [Decisions settled, architecture agreed, or constraints identified]
- **Deferred Debt:** [Any `shortcut:` markers left in code]

## 3. Resumption Instructions
- **Immediate Next Step:** [Exact 1-2 actions the next agent should take]
- **Recommended Workflow/Skills:** [e.g. `feature-delivery`, `systematic-debugging`, `tdd`]
- **Verification Command:** [Exact command to verify current state/tests]
```

---

## Rules

- **Zero Duplication:** Do not copy code diffs or specifications verbatim. Reference file paths and URLs.
- **Redact Secrets:** Never include API keys, tokens, or credentials in handoffs.
- **Run Verification First:** Ensure `.\tools\operon.ps1 clean` and `.\tools\operon.ps1 diff` (or `./tools/operon.sh`) have been checked before writing the handoff.
