import fs from "node:fs";
import path from "node:path";
import { addLocalExcludes, isTracked } from "./git.js";
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
## Operon Protocol
When 'operon' is mentioned, execute:
\`operon boot "<prompt>"\`
Follow the returned workflow sequence. Run \`operon verify\` before completion.
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
  if (excludes.length) addLocalExcludes(repoRoot, excludes);
  return results;
}
