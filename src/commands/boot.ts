import pc from "picocolors";
import { listEntities } from "../core/entities.js";
import { author, changedFiles, currentBranch, EMPTY_TREE, headSha } from "../core/git.js";
import {
  BOOT_FILE,
  ensureMemoryFile,
  loadProject,
  readInvariants,
  readMemoryCheckpoints,
  writeProjectFile,
  type Project,
} from "../core/local-store.js";
import { classifyWorkflow, detectSeamCollisions, matchInvariants, timeAgo } from "../core/matching.js";
import { activeSession, ensureSession } from "../core/sessions.js";
import { pullLatest, pushSeam, readRemoteSessions, remoteSessionNote } from "../core/sync.js";
import { parseHeadings } from "../tools/heading-parser.js";

const MAX_INVARIANTS = 10;

interface Phase {
  title: string;
  summary: string;
}

function workflowPhases(body: string): Phase[] {
  const lines = body.split(/\r?\n/);
  const heads = parseHeadings(lines).filter((h) => h.level === 2);
  return heads.map((h, i) => {
    const section = lines.slice(h.line + 1, heads[i + 1]?.line ?? lines.length);
    const summary = section.find((l) => l.trim() && !l.trim().startsWith("`"))?.trim() ?? "";
    return { title: h.text, summary };
  });
}

export interface RefreshBootOptions {
  offlineNote?: boolean;
  teammateOverride?: string | null;
  resumed?: boolean;
}

/** Generates and writes `.operon/BOOT.md` from current local state + cached remote sessions/invariants. */
export function refreshBootFile(project: Project, promptOverride?: string, opts: RefreshBootOptions = {}): string {
  const { root, dir, config } = project;
  const branch = currentBranch(root);
  const me = author(root);
  const session = activeSession(dir, branch);
  const prompt = promptOverride ?? session?.task ?? "Active workspace session";
  const base = session?.baseSha ?? headSha(root) ?? EMPTY_TREE;

  let changed: string[] = [];
  try {
    changed = changedFiles(root, base).map((f) => f.path);
  } catch {
    /* ignore unreachable base */
  }

  const allInvariants = readInvariants(dir);
  const matches = matchInvariants(allInvariants, changed, prompt);
  const entities = listEntities(dir);
  const { workflow, matched } = classifyWorkflow(
    entities.filter((e) => e.kind === "workflow"),
    prompt,
  );
  const memCheckpoints = readMemoryCheckpoints(dir);
  const remoteSessions = readRemoteSessions(dir);
  const { collisions, activeTeammates } = detectSeamCollisions(changed, prompt, remoteSessions, session?.sessionId);
  const nowIso = new Date().toISOString();

  const md: string[] = [];
  md.push(`# Operon Boot · ${config.name} · ${branch}`);
  md.push(`Task: ${prompt}`);
  if (opts.offlineNote) md.push(`*(cloud unreachable — using local .operon/ cache)*`);

  if (session && (opts.resumed || session.checkpoints.length || memCheckpoints.length)) {
    const lastWal = session.checkpoints.at(-1);
    const lastMem = memCheckpoints.at(-1);
    const latestMsg =
      lastMem && (!lastWal || lastMem.ts >= lastWal.ts)
        ? `${lastMem.message} (${lastMem.author}, ${timeAgo(lastMem.ts)})`
        : lastWal
          ? `${lastWal.message} (${timeAgo(lastWal.ts)})`
          : null;
    if (latestMsg) {
      md.push("", `## Resumed Session ${session.sessionId}`, `Last checkpoint: ${latestMsg}`);
    }
  }

  if (collisions.length > 0) {
    md.push("", `## ⚡ In-Flight Seam Collision Warning (${collisions.length})`);
    for (const c of collisions) {
      const s = c.session;
      md.push(
        `- **${s.author}** (\`${s.branch}\` · ${timeAgo(s.updatedAt)}) is modifying overlapping paths: \`${c.overlappingPaths.join("`, `")}\` (${c.reason})${s.task ? ` — Task: "${s.task}"` : ""}. Coordinate interfaces before editing!`,
      );
    }
  }

  const activityLines: string[] = [];
  if (opts.teammateOverride) activityLines.push(opts.teammateOverride);
  for (const t of activeTeammates.slice(0, 3)) {
    const pathsLabel = t.touchedPaths?.length ? ` [touching: ${t.touchedPaths.slice(0, 4).join(", ")}]` : "";
    const line = `Latest on \`${t.branch}\` by ${t.author} (${timeAgo(t.updatedAt)}, ${t.status}): ${t.lastCheckpoint}${pathsLabel}`;
    if (!activityLines.includes(line)) activityLines.push(line);
  }
  if (activityLines.length > 0) {
    md.push("", "## Teammate Activity", ...activityLines);
  }

  if (matches.length) {
    md.push("", `## ⚠ Active Invariants (${matches.length})`);
    for (const { inv, reasons } of matches.slice(0, MAX_INVARIANTS)) {
      md.push(
        `- [${inv.code}] ${inv.rule}${inv.reason ? ` — ${inv.reason}` : ""} (${inv.paths.join(", ")} · ${inv.author} · ${timeAgo(inv.timestamp)} · ${reasons.join(", ")})`,
      );
    }
  } else if (allInvariants.length) {
    md.push("", `## Project Invariants (${allInvariants.length} total in .operon/MEMORY.md)`);
    for (const inv of allInvariants.slice(0, 5)) {
      md.push(`- [${inv.code}] ${inv.rule} (${inv.paths.join(", ")})`);
    }
  }

  if (workflow) {
    md.push("", `## Workflow: ${workflow.title}${matched.length ? ` (matched: ${matched.join(", ")})` : ""}`);
    workflowPhases(workflow.body).forEach((p, i) => {
      md.push(`${i + 1}. **${p.title.replace(/^Phase \d+:\s*/i, "")}:** ${p.summary}`);
    });
  }

  const skills = entities.filter((e) => e.kind === "skill");
  if (skills.length) {
    md.push("", "## Active Skills (in `.operon/skills/`)");
    for (const s of skills) {
      md.push(`- **${s.title}** (\`.operon/skills/${s.name}/SKILL.md\`): ${s.description}`);
    }
  }

  md.push(
    "",
    "## How to Log Progress & Gotchas (Edit `.operon/MEMORY.md` Directly)",
    "Do NOT run extra CLI commands while coding. Append OKF blocks directly to `.operon/MEMORY.md`:",
    "```markdown",
    `<!-- okf:checkpoint ts="${nowIso}" author="${me}" branch="${branch}" -->`,
    "One-line status update (every 2-3 code-modifying turns).",
    "<!-- /okf:checkpoint -->",
    "",
    `<!-- okf:invariant code="SCOPE-01" paths="src/scope/**" ts="${nowIso}" author="${me}" -->`,
    "Non-obvious project rule or gotcha discovered during work.",
    "<!-- /okf:invariant -->",
    "```",
    "- Before reporting done: run `operon verify` (validates `.operon/MEMORY.md`, checks LOC ceiling & debug logs, and syncs to Convex).",
  );

  const bootContent = md.join("\n") + "\n";
  writeProjectFile(dir, BOOT_FILE, bootContent);
  return bootContent;
}

export async function bootCommand(prompt: string): Promise<number> {
  const project = loadProject();
  if (!project) {
    console.log("Operon is not initialized for this repository — proceed normally without Operon.");
    return 0;
  }
  const { root, dir } = project;

  ensureMemoryFile(dir);
  const pulled = await pullLatest(project);
  const branch = currentBranch(root);
  const me = author(root);
  const { session, resumed } = ensureSession(dir, branch, me, headSha(root), prompt);
  const base = session.baseSha ?? headSha(root) ?? EMPTY_TREE;

  let changed: string[] = [];
  try {
    changed = changedFiles(root, base).map((f) => f.path);
  } catch {
    /* ignore unreachable base */
  }

  if (project.config.cloud) {
    await pushSeam(project, {
      sessionId: session.sessionId,
      branch,
      author: me,
      task: prompt,
      touchedPaths: changed,
    });
  }

  const teammate = await remoteSessionNote(project, branch, me, session.sessionId);
  const bootContent = refreshBootFile(project, prompt, {
    offlineNote: pulled === "offline",
    teammateOverride: teammate,
    resumed,
  });

  console.log(bootContent.trimEnd());
  console.log(pc.green(`\n✔ Wrote .operon/BOOT.md — append checkpoints & invariants to .operon/MEMORY.md as you work.`));
  return 0;
}
