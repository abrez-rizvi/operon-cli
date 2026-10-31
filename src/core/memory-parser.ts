import type { Invariant } from "../types/okf.js";

export interface MemoryCheckpoint {
  ts: number;
  iso: string;
  author: string;
  branch: string;
  session: string;
  status: "in-flight" | "paused" | "closed";
  message: string;
  line: number;
}

export interface MemoryTagError {
  line: number;
  message: string;
}

export interface ParsedMemory {
  invariants: Invariant[];
  checkpoints: MemoryCheckpoint[];
  errors: MemoryTagError[];
}

const OPEN_TAG = /^<!--\s*okf:([a-z0-9_-]+)((?:\s+[a-zA-Z0-9_-]+="[^"]*")*)\s*-->$/;
const CLOSE_TAG = /^<!--\s*\/okf:([a-z0-9_-]+)\s*-->$/;
const ATTR_RE = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR_RE)) attrs[m[1]] = m[2];
  return attrs;
}

function parseTimestamp(raw: string | undefined): number | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Parses `.operon/MEMORY.md` for `<!-- okf:invariant ... -->` and `<!-- okf:checkpoint ... -->` blocks.
 * ignores any tags inside fenced code blocks (``` or ~~~).
 */
export function parseMemoryFile(content: string): ParsedMemory {
  const invariants: Invariant[] = [];
  const checkpoints: MemoryCheckpoint[] = [];
  const errors: MemoryTagError[] = [];

  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  let fence: string | null = null;
  let open: { kind: string; attrs: Record<string, string>; line: number; body: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    const lineNo = i + 1;

    const fenceMatch = /^\s{0,3}(```|~~~)/.exec(rawLine);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (fence === fenceMatch[1]) fence = null;
      if (open) open.body.push(rawLine);
      continue;
    }
    if (fence) {
      if (open) open.body.push(rawLine);
      continue;
    }

    if (trimmed.startsWith("<!--") && /okf:/i.test(trimmed)) {
      const closeMatch = CLOSE_TAG.exec(trimmed);
      if (closeMatch) {
        const closeKind = closeMatch[1];
        if (!open) {
          errors.push({ line: lineNo, message: `Unexpected closing tag <!-- /okf:${closeKind} --> without matching opening tag` });
        } else if (open.kind !== closeKind) {
          errors.push({
            line: lineNo,
            message: `Mismatched closing tag <!-- /okf:${closeKind} --> for <!-- okf:${open.kind} --> opened on line ${open.line}`,
          });
          open = null;
        } else {
          finalizeBlock(open.kind, open.attrs, open.body.join("\n").trim(), open.line, invariants, checkpoints, errors);
          open = null;
        }
        continue;
      }

      const openMatch = OPEN_TAG.exec(trimmed);
      if (!openMatch) {
        errors.push({ line: lineNo, message: `Malformed OKF tag syntax: ${trimmed}` });
        continue;
      }
      if (open) {
        errors.push({
          line: open.line,
          message: `Unclosed <!-- okf:${open.kind} --> tag before new tag on line ${lineNo}`,
        });
      }
      open = { kind: openMatch[1], attrs: parseAttrs(openMatch[2] ?? ""), line: lineNo, body: [] };
      continue;
    }

    if (open) open.body.push(rawLine);
  }

  if (open) {
    errors.push({ line: open.line, message: `Unclosed <!-- okf:${open.kind} --> tag at end of file` });
  }

  return { invariants, checkpoints, errors };
}

function finalizeBlock(
  kind: string,
  attrs: Record<string, string>,
  body: string,
  line: number,
  invariants: Invariant[],
  checkpoints: MemoryCheckpoint[],
  errors: MemoryTagError[],
): void {
  if (kind !== "invariant" && kind !== "checkpoint") {
    errors.push({ line, message: `Unknown OKF block type "okf:${kind}" (expected "okf:invariant" or "okf:checkpoint")` });
    return;
  }
  if (!body) {
    errors.push({ line, message: `Empty <!-- okf:${kind} --> block` });
    return;
  }
  const ts = parseTimestamp(attrs.ts);
  if (ts === null) {
    errors.push({ line, message: `Missing or invalid "ts" attribute on <!-- okf:${kind} --> (use ISO timestamp e.g. ts="2026-11-01T00:00:00Z")` });
    return;
  }

  if (kind === "invariant") {
    const code = (attrs.code ?? "").trim().toUpperCase() || `INV-${String(invariants.length + 1).padStart(2, "0")}`;
    const paths = (attrs.paths ?? "**")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    invariants.push({
      code,
      trigger: attrs.trigger ?? deriveTrigger(code, paths),
      rule: body.replace(/\s+/g, " "),
      reason: attrs.reason ?? "",
      paths: paths.length ? paths : ["**"],
      author: attrs.author || "agent",
      timestamp: ts,
    });
  } else {
    const status =
      attrs.status === "closed" || attrs.status === "paused" ? attrs.status : ("in-flight" as const);
    checkpoints.push({
      ts,
      iso: attrs.ts,
      author: attrs.author || "agent",
      branch: attrs.branch || "main",
      session: attrs.session || "default",
      status,
      message: body.replace(/\s+/g, " "),
      line,
    });
  }
}

function deriveTrigger(code: string, paths: string[]): string {
  const words = new Set<string>();
  const prefix = code.split("-")[0]?.toLowerCase();
  if (prefix && prefix !== "inv" && prefix !== "gen" && prefix.length >= 2) words.add(prefix);
  for (const p of paths) {
    for (const seg of p.split(/[^a-zA-Z0-9]+/)) {
      const lower = seg.toLowerCase();
      if (lower.length >= 3 && lower !== "src" && lower !== "app" && lower !== "lib") words.add(lower);
    }
  }
  return words.size ? `\\b(${[...words].join("|")})\\b` : "";
}

export function formatInvariantBlock(inv: Invariant): string {
  const iso = new Date(inv.timestamp).toISOString();
  const attrs = [
    `code="${inv.code}"`,
    `paths="${inv.paths.join(",")}"`,
    ...(inv.trigger ? [`trigger="${inv.trigger.replace(/"/g, "")}"`] : []),
    ...(inv.reason ? [`reason="${inv.reason.replace(/"/g, "'")}"`] : []),
    `ts="${iso}"`,
    `author="${inv.author.replace(/"/g, "")}"`,
  ].join(" ");
  return `<!-- okf:invariant ${attrs} -->\n${inv.rule}\n<!-- /okf:invariant -->`;
}

export function formatCheckpointBlock(cp: {
  message: string;
  author: string;
  branch: string;
  session?: string;
  status?: "in-flight" | "paused" | "closed";
  timestamp?: number;
}): string {
  const iso = new Date(cp.timestamp ?? Date.now()).toISOString();
  const attrs = [
    `ts="${iso}"`,
    `author="${cp.author.replace(/"/g, "")}"`,
    `branch="${cp.branch.replace(/"/g, "")}"`,
    ...(cp.session ? [`session="${cp.session}"`] : []),
    ...(cp.status && cp.status !== "in-flight" ? [`status="${cp.status}"`] : []),
  ].join(" ");
  return `<!-- okf:checkpoint ${attrs} -->\n${cp.message}\n<!-- /okf:checkpoint -->`;
}

export const DEFAULT_MEMORY_TEMPLATE = `# Project Memory (.operon/MEMORY.md)

Append OKF blocks below as you work. \`operon verify\` and \`operon sync\` validate and sync this file to Convex.

\`\`\`markdown
<!-- okf:checkpoint ts="2026-11-01T00:00:00Z" author="agent" branch="main" -->
Short status update (every 2-3 code-modifying turns).
<!-- /okf:checkpoint -->

<!-- okf:invariant code="AUTH-01" paths="src/auth/**" ts="2026-11-01T00:00:00Z" author="agent" -->
Non-obvious project rule or gotcha discovered during work.
<!-- /okf:invariant -->
\`\`\`

---
`;
