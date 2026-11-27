# Operon: Technical Implementation Specification

## 1. Architectural Overview

Operon is built as a lightweight, zero-latency TypeScript CLI backed by **Convex** for real-time team synchronization and the **Open Knowledge Format (OKF v0.3)** for plain-text data storage.

```text
[ Developer Machine ]                                              [ Convex Cloud Backend ]
  │
  ├── Local CLI Runner (TypeScript / Node / Bun)                     ├── Real-Time Reactive Tables
  │     ├── Command Dispatcher (cac / commander)                     │     ├── projects
  │     ├── Local File Cache (~/.operon/projects/<id>/) ◄──────────► │     ├── files (Hydration snapshots)
  │     └── The 4 Deterministic Host Tools (<5ms execution)          │     ├── invariants (Spatial knowledge)
  │                                                                  │     ├── sessions (WAL checkpoints)
  └── Agent Harness Trampolines (<40 tokens)                         │     └── telemetry (Audit logs)
        ├── Cursor (.cursor/rules/operon.mdc)                        │
        ├── Claude Code (CLAUDE.md)                                  └── Zero-DevOps Infrastructure
        └── Codex / OpenCode (AGENTS.md)
```

---

## 2. Repository Layout

```text
operon/
├── package.json
├── tsconfig.json
├── convex/                          # Convex Cloud Backend
│   ├── _generated/
│   ├── schema.ts                    # Strongly typed Convex tables
│   ├── projects.ts                  # Workspace init, invite codes, share/join
│   ├── knowledge.ts                 # Real-time invariants & spatial queries
│   ├── sessions.ts                  # WAL checkpoints & handoffs
│   ├── skills.ts                    # Playbooks & staged evolution
│   └── telemetry.ts                 # Flight recorder logs
│
├── src/                             # Local CLI Engine (TypeScript)
│   ├── cli.ts                       # CLI entrypoint (command routing)
│   ├── commands/                    # Command implementations
│   │   ├── setup.ts                 # Global PATH & harness trampolines
│   │   ├── init.ts                  # Local project registration
│   │   ├── share.ts                 # Magic link / invite generator
│   │   ├── join.ts                  # Hydration from Convex to disk
│   │   ├── boot.ts                  # Agent entry: intent + spatial gotchas
│   │   ├── fetch.ts                 # Slices skill/doc AST headings
│   │   ├── checkpoint.ts            # Fast WAL micro-delta writer
│   │   ├── verify.ts                # Diff guard + ceiling checks
│   │   ├── clean.ts                 # Debug marker detection/purging
│   │   └── remember.ts              # Invariant capture & Convex push
│   │
│   ├── core/                        # Core Systems
│   │   ├── convex-client.ts         # Lightweight Convex HTTP client
│   │   ├── local-store.ts           # ~/.operon/projects/<id>/ file manager
│   │   └── harness-scanner.ts       # Detects Cursor, Claude, Codex & injects hooks
│   │
│   ├── tools/                       # The 4 Deterministic Engine Tools
│   │   ├── okf-validator.ts         # OKF v0.3 schema & frontmatter validator
│   │   ├── heading-parser.ts        # Fast AST markdown section extractor
│   │   ├── diff-guard.ts            # LOC blast radius & package manifest check
│   │   └── debug-sanitizer.ts       # Temporary debug log/marker scrubber
│   │
│   └── types/                       # Shared OKF & Zod Schemas
│       ├── okf.ts                   # Skill, Knowledge, Session, Workflow types
│       └── config.ts                # Operon project config schemas
│
└── templates/                       # Default Starter OKF Assets
    ├── skills/ (tdd, debugging, lean-diff)
    └── workflows/ (feature-delivery, bug-fix)
```

---

## 3. Convex Database Schema (`convex/schema.ts`)

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // 1. Projects & Workspaces
  projects: defineTable({
    name: v.string(),
    repoHash: v.string(),             // git remote URL hash or local repo ID
    inviteCode: v.string(),           // e.g. "op_kno_9x72a"
    createdAt: v.number(),
  }).index("by_inviteCode", ["inviteCode"])
    .index("by_repoHash", ["repoHash"]),

  // 2. Hydration Snapshots (The files streamed on `operon join`)
  files: defineTable({
    projectId: v.id("projects"),
    path: v.string(),                 // e.g. "skills/tdd/SKILL.md", "knowledge/gotchas.md"
    content: v.string(),              // Raw markdown / YAML content
    category: v.union(
      v.literal("skill"),
      v.literal("knowledge"),
      v.literal("workflow"),
      v.literal("tool")
    ),
    updatedAt: v.number(),
  }).index("by_project_and_path", ["projectId", "path"])
    .index("by_project", ["projectId"]),

  // 3. Spatially-Scoped Atomic Invariants
  invariants: defineTable({
    projectId: v.id("projects"),
    code: v.string(),                 // e.g. "AUTH-01"
    trigger: v.string(),              // Keyword/function regex pattern
    rule: v.string(),                 // "Use crypto.timingSafeEqual for token verification"
    reason: v.string(),
    paths: v.array(v.string()),       // ["src/auth/**", "src/middleware/**"]
    author: v.string(),
    timestamp: v.number(),
  }).index("by_project", ["projectId"]),

  // 4. Continuous Sessions (Write-Ahead Logging)
  sessions: defineTable({
    projectId: v.id("projects"),
    sessionId: v.string(),
    branch: v.string(),
    author: v.string(),
    status: v.union(v.literal("in-flight"), v.literal("paused"), v.literal("closed")),
    lastCheckpoint: v.string(),
    checkpoints: v.array(
      v.object({
        timestamp: v.number(),
        message: v.string(),
      })
    ),
    updatedAt: v.number(),
  }).index("by_project_and_branch", ["projectId", "branch"]),

  // 5. Flight Recorder Telemetry
  telemetry: defineTable({
    projectId: v.id("projects"),
    command: v.string(),              // "verify", "boot", "clean"
    exitCode: v.number(),
    locDelta: v.number(),
    author: v.string(),
    timestamp: v.number(),
  }).index("by_project", ["projectId"]),
});
```

---

## 4. Convex Backend Functions

### `convex/projects.ts` (Workspace Init & Hydration)
* `createOrGet`: Binds a local repo hash to a Convex project; generates unique `inviteCode` if new.
* `getSnapshot`: Queries all records in the `files` table for a given `inviteCode` and returns an array of `{ path, content, category }` objects for immediate local disk hydration.
* `syncFile`: Updates or inserts a file record in the cloud snapshot when local playbooks or tools change.

### `convex/knowledge.ts` (Spatial Matching)
* `getInvariantsForPaths`: Accepts an array of file paths modified in the active git diff. Filters the project's `invariants` table, matching path glob patterns (using minimatch semantics) and returns only active constraints.
* `addInvariant`: Mutates the database with a newly learned gotcha from `operon remember`.

### `convex/sessions.ts` (Write-Ahead Logging)
* `checkpoint`: Appends `{ timestamp, message }` to the active session record in <10ms.
* `getLatest`: Resolves the most recent session state for a branch or teammate during `operon boot`.

---

## 5. The 4 Deterministic Engine & Hygiene Tools (`src/tools/`)

All 4 tools run on the host CPU in pure TypeScript with **zero prompt tokens** and strict exit codes:

### Tool 1: OKF Conformance Validator (`okf-validator.ts`)
* **Role:** Enforces structural compliance with OKF v0.3.
* **Mechanism:**
  * Uses `gray-matter` to parse YAML frontmatter.
  * Validates schema fields via Zod:
    * `type`: Must be `Skill`, `Knowledge`, `Workflow`, or `Session`.
    * `name`, `title`, `description`: Mandatory strings.
  * Validates file naming and reserved document rules (`index.md`, `README.md`).
* **Exit Code:** Exits `0` on 100% compliance; exits `1` with exact line-number parse errors on failure.

### Tool 2: Fast Heading Parser (`heading-parser.ts`)
* **Role:** Slices specific sub-sections for `operon fetch <entity>:<heading>`.
* **Mechanism:**
  * Uses a fast streaming regex/lexer parser.
  * Matches target heading `## <heading_name>` and extracts all content until the next heading of equal or higher level (`##` or `#`).
  * Ingests target phases in **<3ms**, preventing token blowup.

### Tool 3: Git Diff & Blast Radius Guard (`diff-guard.ts`)
* **Role:** Language-agnostic hygiene enforcement on uncommitted changes.
* **Mechanism:**
  * Runs `git diff --numstat HEAD` via `child_process`.
  * **Ceiling Check:** Computes total lines in touched files. Flags any file exceeding the project ceiling (default: 600 LOC) to prevent monolith accretion.
  * **Manifest Audit:** Flags modifications to package manifests (`package.json`, `package-lock.json`, `pnpm-lock.yaml`, `Cargo.toml`, `requirements.txt`).
  * **LOC Delta Summary:** Calculates net lines added vs. deleted.
* **Exit Code:** Exits `0` if clean; exits `1` if the monolith ceiling is violated or locked manifests are modified without override flags.

### Tool 4: Debug Sanitizer (`debug-sanitizer.ts`)
* **Role:** Prevents temporary diagnostic prints and logs from entering commits.
* **Mechanism:**
  * Inspects added lines in the git diff using pattern matching:
    * `console.log(`, `debugger;`, `[DEBUG-...]`, `print(`, `dump(`.
  * Supports `--purge` flag: automatically removes matched lines from the working tree.
* **Exit Code:** Exits `0` if clean; exits `1` with file locations if temporary debug statements remain.

---

## 6. Harness Trampoline Injector (`src/core/harness-scanner.ts`)

Automates harness detection and safe activation block injection:

```typescript
export interface HarnessTarget {
  name: string;
  configPath: string;
  type: "global" | "local";
}

export const HARNESS_TARGETS: HarnessTarget[] = [
  { name: "Cursor Rules", configPath: ".cursor/rules/operon.mdc", type: "local" },
  { name: "Claude Code", configPath: "CLAUDE.md", type: "local" },
  { name: "Codex / OpenCode", configPath: "AGENTS.md", type: "local" },
  { name: "Antigravity", configPath: "~/.gemini/GEMINI.md", type: "global" },
];

export const TRAMPOLINE_BLOCK = `
<!-- operon:start -->
## Operon Protocol
When 'operon' is mentioned, execute:
\`operon boot "<prompt>"\`
Follow the returned workflow sequence. Run \`operon verify\` before completion.
<!-- operon:end -->
`;
```

* **Safe Ingestion Logic:**
  * Checks if target file exists. If missing, creates it.
  * If the file contains `<!-- operon:start -->`, replaces the existing block without touching surrounding user configuration.
  * If absent, cleanly appends to the top or bottom of the document.

---

## 7. Local Storage & Hydration Engine (`src/core/local-store.ts`)

Operon ensures **zero-latency local execution** via local-first caching:

```text
~/.operon/projects/<repo-hash>/
├── config.json          # Project ID, Convex invite code, ceiling policies
├── skills/              # Cached SKILL.md playbooks
├── knowledge/           # Cached gotchas.md, ADRs, invariants
├── workflows/           # Cached WORKFLOW.md pipelines
└── tools/               # Local deterministic scripts
```

### The Hydration Flow (`operon join <inviteCode>`)
1. User runs `npx operon join <inviteCode>`.
2. CLI calls Convex query `projects:getSnapshot({ inviteCode })`.
3. Streams file objects down and writes them directly to `~/.operon/projects/<repo-hash>/`.
4. Executes `harness-scanner.ts` to arm all detected AI editors on the machine.
5. Saves local configuration in `<repo-hash>/config.json`.
6. Total execution time: **<2.0 seconds**.

---

## 8. CLI Command Router (`src/cli.ts`)

Built using `cac` or `commander` for minimal bundle size and instant boot:

```typescript
import { cac } from "cac";

const cli = cac("operon");

// Human Lifecycle
cli.command("setup", "Configure global PATH and scan/arm installed AI harnesses")
  .action(async () => { /* run setup */ });

cli.command("add <source>", "Import skills from GitHub URL or local directory into global catalog")
  .action(async (source) => { /* run add */ });

cli.command("list", "Display installed skill packs and playbooks")
  .action(async () => { /* run list */ });

cli.command("init [name]", "Initialize an Operon workspace for the current repository")
  .action(async (name) => { /* run init */ });

cli.command("share", "Generate a team invite link / code backed by Convex")
  .action(async () => { /* run share */ });

cli.command("join <codeOrUrl>", "Hydrate project folders from Convex and arm local harnesses")
  .action(async (code) => { /* run join */ });

// Agent Lifecycle
cli.command("boot <prompt>", "Bootstraps intent, active session WAL, and spatial invariants")
  .action(async (prompt) => { /* run boot */ });

cli.command("fetch <entity>", "Slices specific AST headings from skills or knowledge")
  .action(async (entity) => { /* run fetch */ });

cli.command("checkpoint <message>", "Appends a micro-delta to the session Write-Ahead Log")
  .action(async (msg) => { /* run checkpoint */ });

cli.command("verify", "Runs deterministic diff metrics, LOC ceiling, and package checks")
  .action(async () => { /* run verify */ });

cli.command("clean", "Scans for and purges temporary debug markers")
  .option("--purge", "Automatically purge detected debug lines")
  .action(async (opts) => { /* run clean */ });

cli.command("remember <gotcha>", "Records an atomic invariant and pushes to Convex")
  .action(async (gotcha) => { /* run remember */ });

cli.parse();
```

---

## 9. Key Dependencies (`package.json`)

```json
{
  "name": "operon",
  "version": "0.1.0",
  "bin": {
    "operon": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsup src/cli.ts --format cjs,esm --dts",
    "dev": "convex dev",
    "test": "vitest"
  },
  "dependencies": {
    "@clack/prompts": "^0.9.1",
    "cac": "^6.7.14",
    "convex": "^1.19.0",
    "gray-matter": "^4.0.3",
    "minimatch": "^10.0.1",
    "picocolors": "^1.1.1",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/node": "^22.13.0",
    "tsup": "^8.3.6",
    "typescript": "^5.7.3",
    "vitest": "^3.0.4"
  }
}
```
