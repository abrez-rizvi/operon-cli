import pc from "picocolors";
import { mutateWithOutbox } from "../core/convex-client.js";
import { author, currentBranch } from "../core/git.js";
import { appendMemoryBlock, readInvariants, requireProject, writeInvariants } from "../core/local-store.js";
import { persistInvariantToMeko } from "../core/meko-client.js";
import { formatInvariantBlock } from "../core/memory-parser.js";
import { activeSession } from "../core/sessions.js";
import type { Invariant } from "../types/okf.js";

export interface RememberOptions {
  paths?: string;
  trigger?: string;
  reason?: string;
  code?: string;
}

/** Parses `[scope] rule text` (or plain English) into scope tag, default path glob, trigger regex, and next code. */
export function buildInvariant(
  rawGotcha: string,
  existing: Invariant[],
  me: string,
  opts: RememberOptions = {},
): Invariant {
  const m = /^\s*\[([^\]]+)\]\s*(.+)$/.exec(rawGotcha.trim());
  const scope = m ? m[1].trim().replace(/^\/+|\/+$/g, "") : "gen";
  const rule = (m ? m[2] : rawGotcha).trim();
  const prefix =
    scope
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)[0]
      ?.toUpperCase()
      .slice(0, 8) || "GEN";

  let code = opts.code?.trim().toUpperCase();
  if (!code) {
    const nums = existing
      .map((i) => (i.code.startsWith(`${prefix}-`) ? Number.parseInt(i.code.slice(prefix.length + 1), 10) : 0))
      .filter((n) => Number.isFinite(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    code = `${prefix}-${String(next).padStart(2, "0")}`;
  }

  const paths = opts.paths
    ? opts.paths
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : m
      ? [`**/${scope}/**`, `**/${scope}*`]
      : ["**"];

  const tokens = scope
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2);
  const trigger = opts.trigger ?? (tokens.length ? `\\b(${tokens.join("|")})\\b` : "");

  return {
    code,
    trigger,
    rule,
    reason: opts.reason?.trim() ?? "",
    paths,
    author: me,
    timestamp: Date.now(),
  };
}

export async function rememberCommand(gotcha: string, opts: RememberOptions): Promise<number> {
  const project = requireProject();
  const existing = readInvariants(project.dir);
  const inv = buildInvariant(gotcha, existing, author(project.root), opts);
  appendMemoryBlock(project.dir, formatInvariantBlock(inv));
  writeInvariants(project.dir, [...existing.filter((i) => i.code !== inv.code), inv]);

  const sess = activeSession(project.dir, currentBranch(project.root));
  const [l1Synced, mekoRes] = await Promise.all([
    project.config.cloud
      ? mutateWithOutbox(project, "knowledge:addInvariant", {
          projectId: project.config.cloud.projectId,
          projectToken: project.config.cloud.projectToken,
          ...inv,
        })
      : Promise.resolve(false),
    persistInvariantToMeko(project, inv, sess?.sessionId),
  ]);

  const mekoSuffix = mekoRes.persisted ? " + Meko/YugabyteDB (L2)" : "";
  const syncTag = project.config.cloud
    ? (l1Synced ? `synced to Convex${mekoSuffix}` : `queued in offline outbox${mekoSuffix}`)
    : `saved in .operon/MEMORY.md${mekoSuffix}`;
  console.log(`${pc.green("✔")} Recorded invariant [${pc.bold(inv.code)}] (${inv.paths.join(", ")}) — ${syncTag}`);
  console.log(`  ${inv.rule}`);
  return 0;
}
