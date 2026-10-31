import fs from "node:fs";
import path from "node:path";
import { minimatch } from "minimatch";
import { addedLines } from "../core/git.js";
import type { Policy } from "../types/okf.js";

export interface DebugFinding {
  path: string;
  line: number;
  text: string;
  rule: string;
}

interface Rule {
  name: string;
  exts: string[];
  detect: RegExp;
  /** Whole-line shape that is safe to delete (trimmed line). */
  purge?: RegExp;
}

const JS = ["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts", "vue", "svelte", "astro"];
const RULES: Rule[] = [
  { name: "console", exts: JS, detect: /\bconsole\.(log|debug|trace|dir|table)\s*\(/, purge: /^console\.(log|debug|trace|dir|table)\(.*\);?$/ },
  { name: "debugger", exts: JS, detect: /(^|[^\w.])debugger\s*;?\s*$/, purge: /^debugger;?$/ },
  { name: "print", exts: ["py"], detect: /^\s*print\s*\(/, purge: /^print\(.*\)$/ },
  { name: "breakpoint", exts: ["py"], detect: /\b(breakpoint\(\)|pdb\.set_trace\(\)|ipdb\.set_trace\(\))/, purge: /^(import i?pdb;\s*)?(breakpoint\(\)|i?pdb\.set_trace\(\))$/ },
  { name: "dump", exts: ["php"], detect: /\b(var_dump|dump|dd|print_r)\s*\(/, purge: /^(var_dump|dump|dd|print_r)\(.*\);$/ },
  { name: "pry", exts: ["rb"], detect: /\b(binding\.pry|byebug)\b/, purge: /^(binding\.pry|byebug)$/ },
  { name: "dbg", exts: ["rs"], detect: /\bdbg!\s*\(/, purge: /^dbg!\(.*\);$/ },
  { name: "sysout", exts: ["java", "kt"], detect: /\bSystem\.out\.println\s*\(/, purge: /^System\.out\.println\(.*\);?$/ },
];

const SKIP_EXTS = new Set(["md", "mdx", "markdown", "txt", "rst", "lock", "svg", "map"]);
const IGNORE = /operon-ignore/;
const COMMENT_MARKER_LINE = /^(\/\/|#|--|\/\*|<!--|\*)/;

const ext = (p: string) => path.posix.extname(p).slice(1).toLowerCase();

/** Scans lines added since `base` for temporary debug artifacts. */
export function scanDebug(root: string, base: string, policy: Policy): DebugFinding[] {
  const markers = policy.debug.markers.map((m) => new RegExp(m));
  const allowed = (p: string) => policy.debug.allow.some((g) => minimatch(p, g, { dot: true }));
  const out: DebugFinding[] = [];
  for (const l of addedLines(root, base)) {
    const e = ext(l.path);
    if (SKIP_EXTS.has(e) || IGNORE.test(l.text) || allowed(l.path)) continue;
    const rule = RULES.find((r) => r.exts.includes(e) && r.detect.test(l.text));
    if (rule) out.push({ path: l.path, line: l.line, text: l.text, rule: rule.name });
    else if (markers.some((m) => m.test(l.text))) out.push({ path: l.path, line: l.line, text: l.text, rule: "marker" });
  }
  return out;
}

const balanced = (s: string) => (s.match(/\(/g)?.length ?? 0) === (s.match(/\)/g)?.length ?? 0);
const indent = (s: string) => s.length - s.trimStart().length;

function neighbor(lines: string[], i: number, dir: -1 | 1): string | undefined {
  for (let j = i + dir; j >= 0 && j < lines.length; j += dir) if (lines[j].trim()) return lines[j];
  return undefined;
}

/** True only for whole-line, single-statement matches whose removal can't change control flow. */
function isPurgeable(f: DebugFinding, lines: string[], i: number): boolean {
  const trimmed = lines[i].trim();
  const rule = RULES.find((r) => r.name === f.rule);
  const shapeOk = f.rule === "marker" ? COMMENT_MARKER_LINE.test(trimmed) : !!rule?.purge?.test(trimmed) && balanced(trimmed);
  if (!shapeOk) return false;
  const prev = neighbor(lines, i, -1)?.trim() ?? "";
  if (ext(f.path) === "py") {
    const next = neighbor(lines, i, 1);
    if (prev.endsWith(":") && (next === undefined || indent(next) < indent(lines[i]))) return false; // sole statement in block
  } else if (f.rule !== "marker" && /(\)|\belse|=>)$/.test(prev)) {
    return false; // brace-less if/else/arrow body
  }
  return true;
}

/** Removes purgeable findings from the working tree; returns what was removed. */
export function purgeDebug(root: string, findings: DebugFinding[]): DebugFinding[] {
  const removed: DebugFinding[] = [];
  const byFile = new Map<string, DebugFinding[]>();
  for (const f of findings) byFile.set(f.path, [...(byFile.get(f.path) ?? []), f]);
  for (const [rel, list] of byFile) {
    const file = path.join(root, rel);
    const content = fs.readFileSync(file, "utf8");
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const lines = content.split(/\r?\n/);
    const drop = new Set<number>();
    for (const f of list) {
      const i = f.line - 1;
      if (lines[i] === undefined || lines[i] !== f.text.replace(/\r$/, "")) continue;
      if (isPurgeable(f, lines, i)) {
        drop.add(i);
        removed.push(f);
      }
    }
    if (drop.size) fs.writeFileSync(file, lines.filter((_, i) => !drop.has(i)).join(eol));
  }
  return removed;
}
