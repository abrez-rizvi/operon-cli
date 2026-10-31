import pc from "picocolors";
import { classifyWorkflow, matchInvariants, timeAgo } from "../core/matching.js";
import { listEntities } from "../core/entities.js";
import { author, changedFiles, currentBranch, EMPTY_TREE, headSha } from "../core/git.js";
import { loadProject, readInvariants } from "../core/local-store.js";
import { parseHeadings } from "../tools/heading-parser.js";
import { ensureSession } from "../core/sessions.js";
import { pullLatest, remoteSessionNote } from "../core/sync.js";

const MAX_INVARIANTS = 8;

interface Phase {
  title: string;
  summary: string;
  commands: string[];
}

function workflowPhases(body: string): Phase[] {
  const lines = body.split(/\r?\n/);
  const heads = parseHeadings(lines).filter((h) => h.level === 2);
  return heads.map((h, i) => {
    const section = lines.slice(h.line + 1, heads[i + 1]?.line ?? lines.length);
    const summary = section.find((l) => l.trim() && !l.trim().startsWith("`"))?.trim() ?? "";
    const commands = [...section.join("\n").matchAll(/`(operon [^`]+)`/g)].map((m) => m[1]);
    return { title: h.text, summary, commands };
  });
}

export async function bootCommand(prompt: string): Promise<number> {
  const project = loadProject();
  if (!project) {
    console.log("Operon is not initialized for this repository — proceed normally without Operon.");
    return 0;
  }
  const { root, dir, config } = project;

  const pulled = await pullLatest(project);
  const branch = currentBranch(root);
  const me = author(root);
  const { session, resumed } = ensureSession(dir, branch, me, headSha(root));
  const base = session.baseSha ?? headSha(root) ?? EMPTY_TREE;
  let changed: string[] = [];
  try {
    changed = changedFiles(root, base).map((f) => f.path);
  } catch {
    /* base may be unreachable (rebased away); spatial matching just sees no diff */
  }

  const matches = matchInvariants(readInvariants(dir), changed, prompt);
  const entities = listEntities(dir);
  const { workflow, matched } = classifyWorkflow(entities.filter((e) => e.kind === "workflow"), prompt);

  const out: string[] = [];
  out.push(`# Operon Boot · ${config.name} · ${branch}`);
  out.push(`Task: ${prompt}`);
  if (pulled === "offline") out.push(pc.dim("(cloud unreachable — using local cache)"));

  if (resumed) {
    const last = session.checkpoints.at(-1);
    out.push("", `## Resumed Session ${session.sessionId}`, last ? `Last checkpoint (${timeAgo(last.ts)}): ${last.message}` : "No checkpoints yet.");
  }
  const teammate = await remoteSessionNote(project, branch, me);
  if (teammate) out.push("", "## Teammate Activity", teammate);

  if (matches.length) {
    out.push("", `## ⚠ Active Invariants (${matches.length})`);
    for (const { inv, reasons } of matches.slice(0, MAX_INVARIANTS)) {
      out.push(`- [${inv.code}] ${inv.rule}${inv.reason ? ` — ${inv.reason}` : ""} (${inv.paths.join(", ")} · ${inv.author} · ${timeAgo(inv.timestamp)} · ${reasons.join(", ")})`);
    }
    if (matches.length > MAX_INVARIANTS) out.push(`- …${matches.length - MAX_INVARIANTS} more: \`operon fetch invariants\``);
  }

  if (workflow) {
    out.push("", `## Workflow: ${workflow.title}${matched.length ? ` (matched: ${matched.join(", ")})` : ""}`);
    workflowPhases(workflow.body).forEach((p, i) => {
      const cmds = p.commands.length ? ` → ${p.commands.map((c) => `\`${c}\``).join(" · ")}` : "";
      out.push(`${i + 1}. ${p.title.replace(/^Phase \d+:\s*/i, "")}: ${p.summary}${cmds}`);
    });
  }

  const skills = entities.filter((e) => e.kind === "skill").map((e) => e.name);
  if (skills.length) out.push("", `Skills: ${skills.join(", ")} (\`operon fetch <skill>\` for sections)`);

  out.push(
    "",
    "## Protocol",
    '- `operon checkpoint "<status>"` every 2–3 code-modifying turns.',
    '- `operon remember "[scope] <gotcha>"` when you discover a non-obvious project rule.',
    "- Before reporting done: `operon verify` and `operon clean` must exit 0 (exit 1 = fix and re-run).",
  );
  console.log(out.join("\n"));
  return 0;
}
