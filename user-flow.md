# Operon: End-to-End User Flow Specification

This document details the complete developer journey—from installation and project initialization to agent-assisted rule conversion, team sharing, and daily development.

---

## 1. High-Level Lifecycle Flowchart

```text
[ 1. Install & Setup ]
        │
        ▼
   operon setup ──► Auto-detects harnesses (Cursor, Claude, Codex)
        │       ──► Populates local pack library (~/.operon/packs/)
        │           (Default pack + optional harness imports)
        │
[ 2. Project Initialization ]
        │
        ▼
   operon init  ──► Project Name (defaults to folder)
        │       ──► GitHub Repo Link (Optional / Auto-detected)
        │       ──► Pack Selection: [Pick from local packs] OR [Import GitHub Repo] OR [Empty]
        │           └─► (If Unvalidated) ──► Agent OKF Conversion Prompt ──► `operon validate`
        │
[ 3. Team Sharing ]
        │
        ▼
   operon share ──► Generates Convex Magic Link: `operon join <code-or-url>`
        │
        ▼
   Teammate runs `operon join <code-or-url>` ──► Instant local hydration in <2s
        │
[ 4. Daily Development Loop ]
        │
        ▼
   User prompts: "operon <task>" ──► Agent runs `boot` ➔ `fetch` ➔ `verify` ➔ `remember`
```

---

## 2. The Library Model: Named Skill Packs

Rather than merging rules from Cursor, Claude Code, and GitHub into one chaotic global bucket, Operon organizes them as **clean, isolated Skill Packs** in `~/.operon/packs/`:

```text
~/.operon/packs/
├── default/               # Core pack: TDD, systematic-debugging, lean-diff guardrails
├── cursor-import/         # Imported rules extracted from Cursor (.cursor/rules/)
├── claude-import/         # Imported skills extracted from Claude Code (~/.claude/skills/)
└── community-nextjs/      # Cloned from a public GitHub skills repository
```

* **Zero Collision:** Rules from different harnesses remain separated.
* **Direct File Control:** Users can add, modify, or delete folders in `~/.operon/packs/` directly via their file manager or CLI commands (`operon pack add/remove`).
* **Modular Assignment:** When initializing any project, the user explicitly picks which pack(s) that specific codebase should use.

---

## 3. Step 1: Global Installation & Setup (`operon setup`)

A developer installs Operon once on their machine:

```bash
npm install -g operon
operon setup
```

### Terminal Walkthrough
```text
? [Operon Setup] Scanning system for installed AI coding harnesses...
  ✔ Detected: Cursor (.cursor/rules/)
  ✔ Detected: Claude Code (~/.claude/CLAUDE.md)
  ✔ Detected: Codex / OpenCode (AGENTS.md)
  → Injected 40-token activation trampolines into 3 harness configurations.

? [Library Initialization] Found existing rules across your harnesses.
  How would you like to initialize your local pack library?
  ❯ (1) Standard Starter Pack only
        Installs default TDD, systematic-debugging, lean-diff, and sanitizers into `default/`
    (2) Discover & import all local harness rules into separate packs
        Creates isolated `cursor-import/` and `claude-import/` packs automatically
    (3) Import a custom pack from a GitHub repository URL
```

---

## 4. Standalone Skill Ingestion (`operon add`)

Users can import and curate skills anytime **without creating or being inside a project**. 

Whether copying a popular open-source skills repository or importing a colleague's custom playbook, running `operon add` downloads the assets directly into the global catalog (`~/.operon/packs/`):

```bash
operon add https://github.com/anthropics/claude-code-skills
```

### Minimalist Terminal Walkthrough
```text
┌  Operon Skill Ingestion
│
◇  Source: https://github.com/anthropics/claude-code-skills
◇  Cloning repository to temporary staging...
│  ✔ Cloned 6 skills into staging
│
◇  Assign a pack name: (claude-code-skills) [Press Enter]
│
◇  Convert to OKF v0.3 format?
│  ● Yes (Generate agent conversion prompt)
│  ○ Keep raw markdown
│
└  Staged 6 skills into ~/.operon/packs/claude-code-skills/
```

If conversion is requested, Operon prints the standardized **Agent Conversion Prompt** so the user's active editor agent can normalize the files and verify them with `operon validate`.

---

## 5. Step 2: Project Initialization (`operon init`)

When onboarding a specific codebase, the developer runs `operon init`. The terminal interface uses a **minimalist, interactive multi-select UI** that lets developers pick and choose individual skills and playbooks from their library:

```bash
cd /path/to/my-project
operon init
```

### Minimalist Terminal Walkthrough
```text
┌  Operon Project Initialization
│
◇  Project name: (kno-wiki) [Press Enter to accept]
│
◇  GitHub repository URL: (optional, press Enter to auto-detect/skip)
│  → Auto-detected: https://github.com/acme/kno-wiki
│
◆  Select skills & playbooks to equip for this project:
│  (Press <space> to select, <a> to toggle all, <enter> to confirm)
│
│  [default]
│  ◼  Seam-Based TDD (tdd/SKILL.md)
│  ◼  Systematic Debugging (systematic-debugging/SKILL.md)
│  ◼  Lean Diff & Monolith Guard (ponytail/SKILL.md)
│
│  [claude-code-skills]
│  ◼  Playwright E2E Testing (playwright/SKILL.md)
│  ◻  Docker Containerization (docker/SKILL.md)
│
│  [cursor-import]
│  ◻  Next.js 15 Server Actions (next-actions/SKILL.md)
│
│  [Actions]
│  ◻  + Import another GitHub repository...
│  ◻  + Import from local directory...
│
└  ✔ 4 skills and core guardrails equipped to kno-wiki!
```

* **Granular Multi-Selection:** The developer isn't forced to import an entire monolith pack. They can check TDD and Debugging from `default`, grab E2E testing from `claude-code-skills`, and leave out unwanted tools.
* **On-the-Fly GitHub Import:** If a needed skill isn't in their local library, the user can select `+ Import another GitHub repository...` right from the menu.

---

## 6. Library & Pack Management

Users can inspect, add, or prune their skill packs anytime:

| Action | Command | Description |
| :--- | :--- | :--- |
| **Add from GitHub** | `operon add <git-url>` | Imports skills directly from a remote GitHub repo into the global library (no project needed). |
| **Add from Local** | `operon add <dir-path>` | Imports a local directory of rules into the global catalog. |
| **List Catalog** | `operon list` (or `pack list`) | Displays all installed packs and individual skills. |
| **Remove Pack** | `operon remove <name>` | Deletes a pack from `~/.operon/packs/` (or delete the folder directly in File Explorer). |

---

## 7. Why Agent-Assisted Conversion Beats Static Parsers

Legacy rules come in hundreds of unpredictable formats (`.cursorrules`, `.windsurfrules`, custom system prompts, markdown guidelines). 

Rather than writing brittle, error-prone regex parsers:
1. **The LLM provides natural language understanding:** The agent understands the *meaning* of the custom instructions and extracts actionable invariants and skills.
2. **Operon provides deterministic validation:** The agent is required to run `operon validate`. If the frontmatter is malformed or types are invalid, the tool exits with `1`, forcing the agent to correct it before proceeding.

---

## 8. Step 3: Team Sharing (`operon share` ➔ `operon join`)

Once a project is initialized, the developer shares it with their team.

### Developer A (Sharing)
```bash
operon share
```
```text
✔ Project synced to Convex [Workspace: acme-core]
Share this command with your team:
  operon join acme-core-88f21
Or share the direct link:
  https://operon.dev/join/acme-core-88f21
```

### Developer B (Joining)
Developer B clones the repo and runs:
```bash
operon join acme-core-88f21
```
```text
✔ Connecting to Convex workspace [acme-core]...
✔ Hydrating skills, knowledge, workflows, and deterministic tools to disk...
  - skills/ (tdd, systematic-debugging)
  - knowledge/ (auth-invariants, db-gotchas)
  - workflows/ (feature-delivery, bug-fix)
  - tools/ (diff-guard, debug-sanitizer)
✔ Auto-arming detected AI editors: Cursor, Claude Code.
✔ Ready! Just prompt your agent with "operon <task>" to begin.
```

---

## 9. Step 4: Daily Development Loop

Once setup is complete, the human uses **pure natural language**. The agent operates the CLI behind the scenes:

```text
[Turn 1: Human]
"operon add rate limiting to the login endpoint"

        │
        ▼
[Agent Action: Tool Call]
operon boot "add rate limiting to the login endpoint"
  → CLI returns:
    • Spatial Gotchas for `src/auth/**` (e.g., Redis pool timeout quirk)
    • Phased Sequence: Phase 1: Test ➔ Phase 2: Implement ➔ Phase 3: Verify

        │
        ▼
[Agent Action: Tool Call]
operon fetch tdd:red-phase
  → Slices and reads only Phase 1 instructions (30 tokens).
  → Agent writes failing rate-limit test.

        │
        ▼
[Agent Action: Tool Call]
operon checkpoint "Failing test written for 5 req/min ceiling"
  → Writes micro-delta to WAL on disk and Convex (<5ms).

        │
        ▼
[Agent Action: Implementation]
Agent writes minimal rate-limiting logic.

        │
        ▼
[Agent Action: Tool Call]
operon verify
  → Host checks:
    - LOC Ceiling: src/auth/limiter.ts is 140 lines (Under 600 LOC ceiling: PASS)
    - Package Manifests: 0 unexpected dependencies added (PASS)
    - Exit Code: 0

        │
        ▼
[Agent Action: Discovered Quirk]
"Notice: The Redis key must be prefixed with user IP, not session ID"
operon remember "[auth/rate-limit] Keys must prefix IP before token decoding"
  → Syncs to Convex: Every teammate's agent now knows this constraint.

        │
        ▼
[Turn Conclusion]
Agent responds to user: "Rate limiting implemented and verified with tests."
```

---

## 10. Command Reference Matrix for User Flow

| Command | Invoked By | Primary Purpose |
| :--- | :--- | :--- |
| `operon setup` | **Human** (Global) | One-time machine setup, harness trampolines, initialize local pack library. |
| `operon add <git\|dir>` | **Human** (Global) | Add skills from GitHub or local dir without creating or opening a project. |
| `operon list` | **Human** (Global) | Display installed packs and individual skills. |
| `operon init` | **Human** (Per Project) | Minimalist multi-select project setup, optional GitHub URL. |
| `operon share` | **Human** | Generates the Convex invite code / magic link for teammates. |
| `operon join <code\|url>` | **Human** | One-command hydration: pulls cloud files to disk and arms editors in <2s. |
| `operon boot "<prompt>"` | **Agent** (Autonomous) | Classifies intent, checks active WAL, injects spatially-scoped gotchas. |
| `operon fetch <target>` | **Agent** (Autonomous) | Pulls specific sliced AST headings to prevent context window bloat. |
| `operon checkpoint "<msg>"`| **Agent** (Autonomous) | Drops continuous Write-Ahead Log micro-deltas to disk and cloud. |
| `operon verify` | **Agent** (Autonomous) | Runs deterministic checks: LOC ceiling, manifest guard, debug check. |
| `operon clean [--purge]` | **Agent** (Autonomous) | Detects and purges temporary debug statements (`console.log`, `print`). |
| `operon remember "<rule>"`| **Agent** (Autonomous) | Captures discovered project landmines into Convex for all teammates. |
| `operon validate` | **Agent / CLI** | Conformance tester verifying 100% OKF v0.3 schema adherence. |
