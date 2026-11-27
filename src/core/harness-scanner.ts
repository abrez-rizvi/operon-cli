import fs from "node:fs";
import path from "node:path";
import { addLocalExcludes, isTracked, removeLocalExcludes } from "./git.js";
import { expandHome, userHome } from "./paths.js";

export interface HarnessTarget {
  name: string;
  /** Global targets: "~/..." path. Local targets: repo-relative POSIX path. */
  configPath: string;
  type: "global" | "local";
  /** Returns true when the harness appears installed on this machine. */
  detect: (repoRoot?: string) => boolean;
  /** When true, Operon owns the whole file (vs. injecting a marked block). */
  ownsFile?: boolean;
}

const exists = (p: string) => fs.existsSync(p);
const home = (...p: string[]) => path.join(userHome(), ...p);

export const HARNESS_TARGETS: HarnessTarget[] = [
  { name: "Claude Code", configPath: "~/.claude/CLAUDE.md", type: "global", detect: () => exists(home(".claude")) },
  { name: "Codex / OpenCode", configPath: "~/.codex/AGENTS.md", type: "global", detect: () => exists(home(".codex")) },
  { name: "Antigravity / Gemini", configPath: "~/.gemini/GEMINI.md", type: "global", detect: () => exists(home(".gemini")) },
  {
    name: "Windsurf",
    configPath: "~/.codeium/windsurf/memories/global_rules.md",
    type: "global",
    detect: () => exists(home(".codeium", "windsurf")),
  },
  {
    name: "Cursor",
    configPath: ".cursor/rules/operon.mdc",
    type: "local",
    ownsFile: true,
    detect: (root) => exists(home(".cursor")) || (!!root && exists(path.join(root, ".cursor"))),
  },
  {
    name: "GitHub Copilot",
    configPath: ".github/copilot-instructions.md",
    type: "local",
    detect: () => {
      const ext = home(".vscode", "extensions");
      return exists(ext) && fs.readdirSync(ext).some((d) => d.toLowerCase().startsWith("github.copilot"));
    },
  },
];

export const START = "<!-- operon:start -->";
export const END = "<!-- operon:end -->";

export const TRAMPOLINE_BLOCK = `${START}
## Operon (Real-Time Multi-Agent Bridge over Convex)
Operon connects you live to your teammates' AI agents across machines. \`.operon/BOOT.md\` is your read-only live feed of their invariants, checkpoints, and in-flight file edits. Do not waste turns running \`operon --help\` or inspecting internal files.
1. At task start (and when resuming a turn), run \`operon boot "<task>"\` and read \`.operon/BOOT.md\`.
2. Every 2-3 turns, broadcast progress with \`operon checkpoint "<summary>"\` and record contracts/gotchas with \`operon remember "[scope] <rule>"\` (or append OKF blocks to \`.operon/MEMORY.md\`).
3. Before finishing, run \`operon verify\` (must exit 0).
${END}`;

const CURSOR_FILE = `---
description: Operon team protocol
alwaysApply: true
---
${TRAMPOLINE_BLOCK}
`;

/** Replaces an existing operon block or appends one at the bottom; preserves CRLF files. */
export function upsertBlock(content: string, block = TRAMPOLINE_BLOCK): string {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const normalizedBlock = block.replace(/\n/g, eol);
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (re.test(content)) return content.replace(re, () => normalizedBlock);
  if (!content.trim()) return normalizedBlock + eol;
  const sep = content.endsWith(eol + eol) ? "" : content.endsWith(eol) ? eol : eol + eol;
  return content + sep + normalizedBlock + eol;
}

export interface ArmResult {
  name: string;
  file: string;
  status: "armed" | "updated" | "unchanged" | "skipped";
  note?: string;
}

function armFile(target: HarnessTarget, file: string): ArmResult {
  const before = exists(file) ? fs.readFileSync(file, "utf8") : null;
  const after = target.ownsFile ? CURSOR_FILE : upsertBlock(before ?? "");
  if (before === after) return { name: target.name, file, status: "unchanged" };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, after);
  return { name: target.name, file, status: before === null ? "armed" : "updated" };
}

export function armGlobalHarnesses(): ArmResult[] {
  return HARNESS_TARGETS.filter((t) => t.type === "global" && t.detect()).map((t) => armFile(t, expandHome(t.configPath)));
}

/** Arms repo-local harness files; never touches tracked files and hides new ones via .git/info/exclude. */
export function armLocalHarnesses(repoRoot: string): ArmResult[] {
  const results: ArmResult[] = [];
  const excludes: string[] = [];
  for (const t of HARNESS_TARGETS.filter((t) => t.type === "local" && t.detect(repoRoot))) {
    const file = path.join(repoRoot, t.configPath);
    if (isTracked(repoRoot, t.configPath)) {
      results.push({ name: t.name, file, status: "skipped", note: "file is tracked by git; add the Operon block manually" });
      continue;
    }
    excludes.push(`/${t.configPath}`);
    results.push(armFile(t, file));
  }
  addLocalExcludes(repoRoot, ["/.operon/", ".operon/", ...excludes]);
  return results;
}

export interface DisarmResult {
  name: string;
  file: string;
  status: "disarmed" | "removed" | "unchanged" | "not_found";
  note?: string;
}

/**
 * Removes an Operon trampoline block from file content.
 * Matches `<!-- operon:start --> ... <!-- operon:end -->` or the un-commented Operon header block.
 * Preserves surrounding user instructions and line endings.
 */
export function removeBlock(content: string): { content: string; removed: boolean } {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const startTagPattern = /<!--\s*operon:start\s*-->/i;
  const endTagPattern = /<!--\s*operon:end\s*-->/i;

  let updated = content;
  let removed = false;

  if (startTagPattern.test(content) && endTagPattern.test(content)) {
    const re = /\r?\n?<!--\s*operon:start\s*-->[\s\S]*?<!--\s*operon:end\s*-->\r?\n?/gi;
    updated = content.replace(re, "");
    removed = true;
  } else {
    const fallbackRe =
      /\r?\n?##\s*Operon\s*\(Real-Time Multi-Agent Bridge over Convex\)[\s\S]*?3\.\s*Before finishing,\s*run\s*`operon verify`[^\r\n]*\r?\n?/gi;
    if (fallbackRe.test(content)) {
      updated = content.replace(fallbackRe, "");
      removed = true;
    }
  }

  if (!removed) {
    return { content, removed: false };
  }

  const trimmed = updated.trim();
  if (!trimmed) {
    return { content: "", removed: true };
  }

  const cleaned = trimmed.replace(/(?:\r?\n){3,}/g, `${eol}${eol}`);
  return { content: cleaned + eol, removed: true };
}

/** Disarms a specific harness file, stripping Operon instructions or deleting owned files. */
export function disarmFile(file: string, opts: { name?: string; ownsFile?: boolean } = {}): DisarmResult {
  const name = opts.name ?? path.basename(file);
  if (!exists(file)) {
    return { name, file, status: "not_found" };
  }

  const content = fs.readFileSync(file, "utf8");

  if (opts.ownsFile) {
    const { content: remaining, removed } = removeBlock(content);
    const hasOtherContent = remaining.replace(/---[\s\S]*?---/, "").trim().length > 0;
    if (!hasOtherContent || removed) {
      try {
        fs.unlinkSync(file);
        const parent = path.dirname(file);
        if (exists(parent) && fs.readdirSync(parent).length === 0) {
          fs.rmdirSync(parent);
          const grandParent = path.dirname(parent);
          if (exists(grandParent) && fs.readdirSync(grandParent).length === 0) {
            fs.rmdirSync(grandParent);
          }
        }
      } catch {
        /* ignore cleanup error */
      }
      return { name, file, status: "removed", note: "deleted Operon rule file" };
    }
    fs.writeFileSync(file, remaining);
    return { name, file, status: "disarmed" };
  }

  const { content: updated, removed } = removeBlock(content);
  if (!removed) {
    return { name, file, status: "unchanged", note: "no Operon instructions found" };
  }

  if (updated === "") {
    try {
      fs.unlinkSync(file);
      return { name, file, status: "removed", note: "file was empty after removing Operon instructions" };
    } catch {
      fs.writeFileSync(file, "");
      return { name, file, status: "disarmed" };
    }
  }

  fs.writeFileSync(file, updated);
  return { name, file, status: "disarmed" };
}

export const GLOBAL_CANDIDATES = [
  { name: "Codex / OpenCode", configPath: "~/.codex/AGENTS.md" },
  { name: "Claude Code", configPath: "~/.claude/CLAUDE.md" },
  { name: "Antigravity / Gemini", configPath: "~/.gemini/GEMINI.md" },
  { name: "Windsurf", configPath: "~/.codeium/windsurf/memories/global_rules.md" },
  { name: "User AGENTS.md", configPath: "~/AGENTS.md" },
  { name: "User .cursorrules", configPath: "~/.cursorrules" },
];

export function disarmGlobalHarnesses(): DisarmResult[] {
  const results: DisarmResult[] = [];
  for (const t of GLOBAL_CANDIDATES) {
    const file = expandHome(t.configPath);
    if (!exists(file)) continue;
    const res = disarmFile(file, { name: t.name });
    if (res.status === "disarmed" || res.status === "removed") {
      results.push(res);
    }
  }
  return results;
}

export const LOCAL_CANDIDATES = [
  { name: "AGENTS.md", configPath: "AGENTS.md" },
  { name: "CLAUDE.md", configPath: "CLAUDE.md" },
  { name: "Cursor Rule", configPath: ".cursor/rules/operon.mdc", ownsFile: true },
  { name: "GitHub Copilot", configPath: ".github/copilot-instructions.md" },
  { name: "GEMINI.md", configPath: "GEMINI.md" },
  { name: "Windsurf Rules", configPath: ".windsurfrules" },
  { name: "Cursor Rules", configPath: ".cursorrules" },
];

export function disarmLocalHarnesses(repoRoot: string): DisarmResult[] {
  const results: DisarmResult[] = [];
  const cleanedPaths: string[] = [];
  for (const t of LOCAL_CANDIDATES) {
    const file = path.join(repoRoot, t.configPath);
    if (!exists(file)) continue;
    const res = disarmFile(file, { name: t.name, ownsFile: t.ownsFile });
    if (res.status === "disarmed" || res.status === "removed") {
      results.push(res);
      cleanedPaths.push(`/${t.configPath}`);
    }
  }
  if (cleanedPaths.length) {
    removeLocalExcludes(repoRoot, cleanedPaths);
  }
  return results;
}

export function disarmPath(targetPath: string, repoRoot = process.cwd()): DisarmResult {
  const file = targetPath.startsWith("~/") ? expandHome(targetPath) : path.resolve(repoRoot, targetPath);
  const ownsFile = file.endsWith(".cursor/rules/operon.mdc") || file.endsWith("operon.mdc");
  return disarmFile(file, { name: path.basename(file), ownsFile });
}
