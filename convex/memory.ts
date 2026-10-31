export interface ParsedOkfMemory {
  invariants: {
    code: string;
    trigger: string;
    rule: string;
    reason: string;
    paths: string[];
    author: string;
    timestamp: number;
  }[];
  checkpoints: {
    timestamp: number;
    author: string;
    branch: string;
    sessionId: string;
    status: "in-flight" | "paused" | "closed";
    message: string;
    task?: string;
    touchedPaths?: string[];
  }[];
}

const OPEN_TAG = /^<!--\s*okf:([a-z0-9_-]+)((?:\s+[a-zA-Z0-9_-]+="[^"]*")*)\s*-->$/;
const CLOSE_TAG = /^<!--\s*\/okf:([a-z0-9_-]+)\s*-->$/;
const ATTR_RE = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR_RE)) out[m[1]] = m[2];
  return out;
}

function parseTs(raw: string | undefined): number {
  if (!raw) return Date.now();
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

/** Server-side OKF tag parser that extracts structured invariants and session checkpoints from MEMORY.md. */
export function parseOkfMemory(content: string): ParsedOkfMemory {
  const invariants: ParsedOkfMemory["invariants"] = [];
  const checkpoints: ParsedOkfMemory["checkpoints"] = [];
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);

  let fence: string | null = null;
  let open: { kind: string; attrs: Record<string, string>; body: string[] } | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
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
      if (closeMatch && open && open.kind === closeMatch[1]) {
        const body = open.body.join("\n").trim();
        const attrs = open.attrs;
        const ts = parseTs(attrs.ts);
        if (body && open.kind === "invariant") {
          const code = (attrs.code ?? "").trim().toUpperCase() || `INV-${String(invariants.length + 1).padStart(2, "0")}`;
          const paths = (attrs.paths ?? "**")
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean);
          invariants.push({
            code,
            trigger: attrs.trigger ?? "",
            rule: body.replace(/\s+/g, " "),
            reason: attrs.reason ?? "",
            paths: paths.length ? paths : ["**"],
            author: attrs.author || "agent",
            timestamp: ts,
          });
        } else if (body && open.kind === "checkpoint") {
          const status =
            attrs.status === "closed" || attrs.status === "paused" ? attrs.status : ("in-flight" as const);
          const touchedPaths = attrs.paths
            ? attrs.paths
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean)
            : undefined;
          checkpoints.push({
            timestamp: ts,
            author: attrs.author || "agent",
            branch: attrs.branch || "main",
            sessionId: attrs.session || `wal-${attrs.branch || "main"}`,
            status,
            message: body.replace(/\s+/g, " "),
            ...(attrs.task ? { task: attrs.task } : {}),
            ...(touchedPaths?.length ? { touchedPaths } : {}),
          });
        }
        open = null;
        continue;
      }
      const openMatch = OPEN_TAG.exec(trimmed);
      if (openMatch) {
        open = { kind: openMatch[1], attrs: parseAttrs(openMatch[2] ?? ""), body: [] };
        continue;
      }
    }

    if (open) open.body.push(rawLine);
  }

  return { invariants, checkpoints };
}
