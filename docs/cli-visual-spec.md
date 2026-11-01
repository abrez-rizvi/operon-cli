# Operon CLI — Visual Tokens, Styling & Terminal Transcripts

This specification documents the exact visual tokens, styling rules, ASCII art, and character-for-character terminal output transcripts for the Operon CLI (`operon-cli`).

---

## 1. Visual Tokens, Box-Drawing Characters & Styling

### 1.1 Box-Drawing & Structural Symbols

Operon uses standard Unicode box-drawing characters for structured prompt callouts and `@clack/prompts` interactive dialogs:

| Token | Unicode | Name | Usage in Operon |
| :--- | :--- | :--- | :--- |
| `┌─` | `U+250C`, `U+2500` | Top-left box corner & horizontal bar | Header of agent prompt and conversion dialogs |
| `│`  | `U+2502` | Vertical line | Left rail of multiline dialogs and prompt blocks |
| `└─` | `U+2514`, `U+2500` | Bottom-left box corner & horizontal bar | Footer/closer of conversion boxes |
| `✔`  | `U+2714` | Heavy check mark | Success states, passed verification gates, saved checkpoints |
| `✘`  | `U+2718` | Heavy ballot X | Failed checks, verification violations, missing requirements |
| `!`  | `U+0021` | Warning exclamation mark | Skipped files, invalid frontmatter warnings, uncommitted alerts |
| `●`  | `U+25CF` | Black circle / filled dot | Active daemon, connected WebSocket status (`OPERON LIVE`) |
| `⚡` | `U+26A1` | High voltage bolt | In-flight seam collisions (`⚡ SEAM COLLISION`) |
| `★`  | `U+2605` | Black star | Matched skill/knowledge task relevance indicator |
| `↓`  | `U+2193` | Downwards arrow | Inbound real-time events from teammate agents (`↓ [Event: ...]`) |
| `↑`  | `U+2191` | Upwards arrow | Outbound real-time events pushed to peers (`↑ [Event: ...]`) |
| `◇`  | `U+25C7` | White diamond | Clack prompt inactive / unselected item indicator |
| `◆`  | `U+25C6` | Black diamond | Clack prompt active / selected multiselect item |
| `•`  | `U+2022` | Bullet point | Unordered catalog lists, pack item bullet |

---

### 1.2 Color Palette & Semantic Mapping (`picocolors`)

Operon formats all terminal output using `picocolors` (`pc`), ensuring zero overhead and native ANSI color rendering across macOS, Linux, and Windows Terminal.

```typescript
// Primary semantic styles
pc.cyan("...")                  // System branding, headings, invite codes, entity kinds, inbound events
pc.green("...")                 // Success marks (✔), passing gates, connected state, outbound events
pc.yellow("...")                // Invariant codes ([AUTH-01]), warnings (!), seam overlap paths
pc.red("...")                   // Error messages, failure marks (✘), FAIL verdicts
pc.dim("...")                   // Timestamps (HH:MM:SS), file paths, secondary hints, line numbers
pc.bold("...")                  // Authors, workspace names, command titles, invariant rules
pc.underline("...")             // Touched file paths during seam collisions
pc.bgYellow(pc.black(" ... "))  // In-flight seam collision badge (" ⚡ SEAM COLLISION ")
```

---

### 1.3 ASCII Banner & Header Wordmark

In interactive terminals, `operon` prints the following 5-line cyan ASCII banner with an embedded dim version badge (`src/core/banner.ts`):

```text
   ____  ____  ___________  ____  _   __
  / __ \/ __ \/ ____/ __ \/ __ \/ | / /
 / / / / /_/ / __/ / /_/ / / / /  |/ / 
/ /_/ / ____/ /___/ _, _/ /_/ / /|  /  
\____/_/   /_____/_/ |_|\____/_/ |_/   v0.2
```

---

### 1.4 Conversion Callout Box Format

When unvalidated markdown skills are imported, `agentConversionPrompt` (`src/core/packs.ts`) renders an OKF container:

```text
┌─ Agent OKF v0.3 Conversion Prompt (paste into your AI coding editor) ─────────────
│ Convert the Markdown skills/workflows in ".operon" to OKF v0.3 format:
│ 1. Ensure each SKILL.md / WORKFLOW.md starts with YAML frontmatter:
│    ---
│    type: Skill # (or Workflow)
│    name: <kebab-case-folder-name>
│    title: <Human-Readable Title>
│    description: <One-line summary>
│    ---
│ 2. Organize procedural sections under level-2 (`## Phase / Section`) headings.
│ 3. Run `operon validate ".operon"` and fix any reported line errors until it exits 0.
└───────────────────────────────────────────────────────────────────────────────────
```

---

## 2. Character-for-Character Terminal Output Transcripts

The following transcripts are raw character-for-character captures from actual CLI executions in the workspace.

---

### 2.1 `operon boot "<prompt>"` (Matched Invariants & Flight Plan)

**Command:**
```powershell
operon boot "fix sync policy and watch stream"
```

**Raw Output:**
```text
# Operon Boot · operon · main
Task: fix sync policy and watch stream
> **Operon Live Peer Bridge (Convex):** Read-only live feed of teammate contracts, checkpoints, and in-flight file edits.

## Resumed Session 57dbb8f9
Last checkpoint: Removed temporary test invariant CACHE-01; clean slate confirmed (mohammad.abrez@bcah.christuniversity.in, 30m ago)

## Teammate Activity
Latest on `main` by agent (0s ago, in-flight): Updated TRAMPOLINE_BLOCK and BOOT.md with explicit peer bridge identity, filtered harness files and wal-* self-sessions in seam collision detection, and made .operon/MEMORY.md strictly outbound-only (no incoming merge).

## ⚠ Active Invariants (4)
- [SEAM-02] Seam detection gives false positives: Operon's own harness files (.cursor/rules/operon.mdc, .gitignore, CLAUDE.md) count as touched paths, and MEMORY.md checkpoints with no session attr become a synthetic `wal-<branch>` session, so this machine's own past checkpoints show up as a teammate collision and as duplicate Teammate Activity lines. (src/core/matching.ts, src/commands/watch.ts, convex/memory.ts · agent · 0s ago · touches convex/memory.ts, prompt match)
- [MEKO-01] Meko/YugabyteDB L2 uses FastMCP JSON-RPC 2.0 tools/call at https://mcp.mekodata.ai/mcp with RFC 4122 UUID conversation_id and 12s timeout fallback (**/meko/**, **/meko* · mohammad.abrez@bcah.christuniversity.in · 43m ago · touches mekocalls.txt)
- [SEAM-01] Distinguish active teammate sessions by `sessionId !== localSessionId` (not just `author !== me`) so testing across two laptops with the same git user.email still detects in-flight seam collisions. (src/core/matching.ts, src/commands/watch.ts · agent · 4h ago · touches src/commands/watch.ts, prompt match)
- [SYNC-01] Local edits to .operon/policy.yaml or skills must be synced to Convex (or watched in real-time) before `operon boot`, otherwise `pullLatest` overwrites them with the last cloud snapshot. (.operon/policy.yaml, src/core/sync.ts · agent · 4h ago · touches src/core/sync.ts, prompt match)

## Workflow: Bug Fix (matched: fix)
1. **Reproduce:** Capture a deterministic failing test or script.
2. **Root Cause:** Isolate and state the cause in one sentence; record team-relevant quirks.
3. **Fix:** Smallest change at the root cause; keep the reproduction test.
4. **Verify:** Run tests, then the deterministic gates; fix until both exit 0.

## Knowledge & Skills (`operon fetch <name>:<section>`)
- [skill ★ task match (policy)] **Lean Diff & Monolith Guard** (`lean-diff`): Keep changes small, focused, and dependency-free; never grow files past the LOC ceiling. · sections: `scope-discipline`, `file-size-ceiling`, `dependency-policy`, `debug-hygiene`
*(+2 more in catalog · run `operon fetch` to view all)*

## Live Broadcast Commands (Convex Event Bus)
- **Broadcast progress (every 2-3 turns):** `operon checkpoint "<summary>"`
- **Broadcast contract / gotcha:** `operon remember "[scope] <rule>" --paths "src/scope/**"`
- **Slice skill / knowledge section:** `operon fetch <name>:<section>` (or `operon fetch` for full catalog)
- **Before finishing:** run `operon verify` (must exit 0).

✔ Wrote .operon/BOOT.md — use `operon checkpoint` & `operon remember` to broadcast live.
```

---

### 2.2 `operon checkpoint "<message>"`

**Command:**
```powershell
operon checkpoint "Testing telemetry and checkpoint broadcast"
```

**Raw Output:**
```text
Checkpoint saved [57dbb8f9@main → .operon/MEMORY.md]: Testing telemetry and checkpoint broadcast
```

---

### 2.3 `operon verify` (Failed Violation State)

**Command:**
```powershell
operon verify
```

**Raw Output:**
```text
Operon verify · base fe54b85 · 68 file(s) · +6069 / -456 (net +5613)
✔ LOC ceiling (600): PASS
✔ Package manifests (0 touched): PASS
✘ Debug artifacts (2 found): FAIL
    src/core/git.ts:11  console.log("temp debug statement");
    src/core/git.ts:12  // [DEBUG-temp] trace
    → run `operon clean --purge`, then remove any remaining lines manually
✔ OKF memory tags (.operon/MEMORY.md · 4 invariant(s), 12 checkpoint(s)): PASS
RESULT: FAIL (exit 1) — fix the violations above and re-run `operon verify`
```

---

### 2.4 `operon clean --purge`

**Command:**
```powershell
operon clean --purge
```

**Raw Output:**
```text
✔ Purged 2 debug line(s):
    src/core/git.ts:11  console.log("temp debug statement");
    src/core/git.ts:12  // [DEBUG-temp] trace
✔ No temporary debug artifacts in the diff.
```

---

### 2.5 `operon verify` (Passed State)

**Command:**
```powershell
operon verify
```

**Raw Output:**
```text
Operon verify · base fe54b85 · 68 file(s) · +6067 / -456 (net +5611)
✔ LOC ceiling (600): PASS
✔ Package manifests (0 touched): PASS
✔ Debug artifacts (0 found): PASS
✔ OKF memory tags (.operon/MEMORY.md · 4 invariant(s), 12 checkpoint(s)): PASS
RESULT: PASS
```

---

### 2.6 `operon remember "<rule>"`

**Command:**
```powershell
operon remember "[test] Temporary rule for terminal output transcript" --reason "Verifying CLI output styling"
```

**Raw Output:**
```text
✔ Recorded invariant [TEST-01] (**/test/**, **/test*) — synced to Convex + Meko/YugabyteDB (L2)
  Temporary rule for terminal output transcript
```

---

### 2.7 `operon join <code-or-url>`

**Command:**
```powershell
operon join https://operon.dev/join/operon-rymhx2pwa2
```

**Raw Output:**
```text
✔ Connecting to Convex workspace [operon]…
✔ Hydrating skills, knowledge, workflows, and deterministic tools to .operon/…
  - skills/ (lean-diff, systematic-debugging, tdd)
  - knowledge/ (invariants)
  - workflows/ (bug-fix, feature-delivery)
  - tools/ (policy)
✔ Auto-arming detected AI editors: Cursor.
✔ Ready! Files are in .operon/ — run operon watch for live sync or prompt your agent with "operon <task>".
```
