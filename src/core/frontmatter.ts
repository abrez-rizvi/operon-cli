import YAML from "yaml";

export interface ParsedDoc {
  data: Record<string, unknown>;
  body: string;
  /** 1-based line where the body starts in the original file. */
  bodyLine: number;
  /** Raw frontmatter YAML (without fences), or null when absent. */
  raw: string | null;
  error?: { line: number; message: string };
}

const FENCE = /^---\s*$/;

/** Splits `---` YAML frontmatter from markdown; reports YAML errors with file line numbers. */
export function parseFrontmatter(text: string): ParsedDoc {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!FENCE.test(lines[0] ?? "")) return { data: {}, body: text, bodyLine: 1, raw: null };
  const end = lines.findIndex((l, i) => i > 0 && FENCE.test(l));
  if (end === -1) {
    return { data: {}, body: text, bodyLine: 1, raw: null, error: { line: 1, message: "unterminated frontmatter (missing closing ---)" } };
  }
  const raw = lines.slice(1, end).join("\n");
  const body = lines.slice(end + 1).join("\n");
  const doc = YAML.parseDocument(raw, { prettyErrors: false });
  if (doc.errors.length) {
    const e = doc.errors[0];
    const line = (e.linePos?.[0]?.line ?? 0) + 1; // +1 for opening fence
    return { data: {}, body, bodyLine: end + 2, raw, error: { line, message: e.message.split("\n")[0] } };
  }
  const data = doc.toJS();
  return { data: data && typeof data === "object" ? data : {}, body, bodyLine: end + 2, raw };
}

/** Finds the 1-based file line of a top-level frontmatter key (for validator messages). */
export function keyLine(raw: string | null, key: string | number | undefined): number {
  if (!raw || key === undefined) return 1;
  const idx = raw.split("\n").findIndex((l) => l.startsWith(`${String(key)}:`));
  return idx === -1 ? 1 : idx + 2;
}
