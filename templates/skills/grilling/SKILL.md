---
type: Skill
name: grilling
title: Grilling — Plan Alignment & Decision Trees
description: >-
  Stress-tests plans and decisions through structured interview rounds. Triggers on
  "grill me", "stress-test this", "interview me", or ambiguous project plans.
tags: [planning, alignment, requirements, interview]
---

# Grilling — Plan Alignment & Decision Trees

Relentlessly interview the user to eliminate ambiguity and reach a shared understanding before writing code or executing complex plans.

---

## The Design Tree & The Frontier

Model the problem as a **Design Tree**: every major decision branches into sub-decisions that depend on it.

* **The Frontier:** The set of open decisions whose prerequisites are already settled.
* **Batch in Rounds:** Ask all frontier questions together in one round. Never ask questions that depend on unresolved decisions from the same round.
* **Word for Speed:** Phrase every question and recommendation so replying **"yes"** accepts your recommended path.
* **Find Facts Autonomously:** Never ask the user for facts you can look up yourself (codebase files, docs, tool outputs, configs). Use tools or subagents to uncover facts; put only *decisions and trade-offs* to the user.

---

## Round Format

Present each round cleanly:

```text
❓ Q1 - <Decision Title>
<Context and trade-offs. Include concrete options A/B/C if applicable.>

➡️ Recommended: <Your specific recommendation and why>

---

❓ Q2 - <Decision Title>
<Context and trade-offs.>

➡️ Recommended: <Your specific recommendation and why>
```

---

## Execution Loop

1. **Map Knowns vs Unknowns:** Read existing specs, issues, or code. Identify settled prerequisites.
2. **Compute Frontier:** Formulate questions for the immediate next layer of decisions.
3. **Present Round:** Deliver formatted questions with recommendations and wait for user reply.
4. **Reshape Tree:** Incorporate user choices, push the frontier outward, and compute the next round.
5. **Exit Condition:** Done when the frontier is empty and all branches are resolved. Summarize the agreed plan before taking action.
