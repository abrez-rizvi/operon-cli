import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ProjectConfig } from "../types/config.js";
import { InvariantLedger, Policy, type Invariant } from "../types/okf.js";
import { addLocalExcludes, normalizeRemote, remoteUrl, workspaceRoot } from "./git.js";
import {
  DEFAULT_MEMORY_TEMPLATE,
  formatCheckpointBlock,
  formatInvariantBlock,
  parseMemoryFile,
  type MemoryCheckpoint,
} from "./memory-parser.js";
import { toPosix } from "./paths.js";

export const CATEGORY_DIRS = ["skills", "knowledge", "workflows", "tools"] as const;
export type CategoryDir = (typeof CATEGORY_DIRS)[number];
export type Category = "skill" | "knowledge" | "workflow" | "tool";
export const dirToCategory: Record<CategoryDir, Category> = {
  skills: "skill",
  knowledge: "knowledge",
  workflows: "workflow",
  tools: "tool",
};

export const MEMORY_FILE = "MEMORY.md";
export const BOOT_FILE = "BOOT.md";
export const INVARIANTS_FILE = "knowledge/invariants.yaml";
export const POLICY_FILE = "policy.yaml";
export const LEGACY_POLICY_FILE = "tools/policy.yaml";

export class OperonError extends Error {
  constructor(
    message: string,
    readonly exitCode = 2,
  ) {
    super(message);
  }
}

/** Stable project key: hash of normalized git remote, falling back to the folder path. */
export function projectKey(root: string): string {
  const remote = remoteUrl(root);
  const basis = remote ? normalizeRemote(remote) : path.resolve(root).toLowerCase();
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 16);
}

export interface Project {
  root: string;
  key: string;
  /** Visible `<root>/.operon` folder in the workspace. */
  dir: string;
  config: ProjectConfig;
}

/** Resolves the workspace root (works in any directory, with or without `.git`). */
export function requireRepo(cwd = process.cwd()): string {
  return workspaceRoot(cwd);
}

/** Visible `.operon` directory inside the project root. */
export const projectDirFor = (root: string) => path.join(root, ".operon");

export function loadProject(cwd = process.cwd()): Project | null {
  const root = workspaceRoot(cwd);
  const dir = projectDirFor(root);
  const cfgPath = path.join(dir, "config.json");
  if (!fs.existsSync(cfgPath)) return null;
  const config = ProjectConfig.parse(JSON.parse(fs.readFileSync(cfgPath, "utf8")));
  return { root, key: config.key || projectKey(root), dir, config };
}

export function requireProject(cwd = process.cwd()): Project {
  const p = loadProject(cwd);
  if (!p) {
    throw new OperonError("Operon is not initialized in this folder. Run `operon` (or `operon init` / `operon join <code>`).");
  }
  return p;
}

export function saveConfig(dir: string, config: ProjectConfig): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2) + "\n");
  addLocalExcludes(config.repoRoot, ["/.operon/", ".operon/"]);
}

export function writeProjectFile(dir: string, rel: string, content: string): void {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Recursively lists files under `dir`, returning POSIX paths relative to `dir`. */
export function walk(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(toPosix(path.relative(base, full)));
  }
  return out;
}

export interface ProjectFile {
  path: string;
  content: string;
  category: Category;
}

/** All syncable text files in `.operon/` (`MEMORY.md`, `policy.yaml`, `skills/`, `workflows/`, `knowledge/`). */
export function listProjectFiles(dir: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  const memPath = path.join(dir, MEMORY_FILE);
  if (fs.existsSync(memPath)) {
    files.push({ path: MEMORY_FILE, content: fs.readFileSync(memPath, "utf8"), category: "knowledge" });
  }
  const polPath = path.join(dir, POLICY_FILE);
  if (fs.existsSync(polPath)) {
    files.push({ path: POLICY_FILE, content: fs.readFileSync(polPath, "utf8"), category: "tool" });
  }
  for (const cat of CATEGORY_DIRS) {
    for (const rel of walk(path.join(dir, cat))) {
      const buf = fs.readFileSync(path.join(dir, cat, rel));
      if (buf.subarray(0, 8000).includes(0)) continue; // skip binary
      files.push({ path: `${cat}/${rel}`, content: buf.toString("utf8"), category: dirToCategory[cat] });
    }
  }
  return files;
}

export function readMemoryContent(dir: string): string {
  const file = path.join(dir, MEMORY_FILE);
  if (!fs.existsSync(file)) return DEFAULT_MEMORY_TEMPLATE;
  return fs.readFileSync(file, "utf8");
}

export function ensureMemoryFile(dir: string): string {
  const file = path.join(dir, MEMORY_FILE);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, DEFAULT_MEMORY_TEMPLATE);
  }
  return file;
}

export function appendMemoryBlock(dir: string, block: string): void {
  const file = ensureMemoryFile(dir);
  const current = fs.readFileSync(file, "utf8");
  const sep = current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  fs.writeFileSync(file, `${current}${sep}${block}\n`);
}

export function readMemoryCheckpoints(dir: string): MemoryCheckpoint[] {
  const file = path.join(dir, MEMORY_FILE);
  if (!fs.existsSync(file)) return [];
  return parseMemoryFile(fs.readFileSync(file, "utf8")).checkpoints;
}

/** Reads invariants from `.operon/MEMORY.md` (and merges any from legacy `knowledge/invariants.yaml`). */
export function readInvariants(dir: string): Invariant[] {
  const byCode = new Map<string, Invariant>();
  const yamlFile = path.join(dir, INVARIANTS_FILE);
  if (fs.existsSync(yamlFile)) {
    try {
      const parsed = InvariantLedger.parse(YAML.parse(fs.readFileSync(yamlFile, "utf8")) ?? { type: "InvariantLedger" });
      for (const inv of parsed.invariants) byCode.set(inv.code.toUpperCase(), inv);
    } catch {
      /* ignore malformed legacy yaml */
    }
  }
  const memFile = path.join(dir, MEMORY_FILE);
  if (fs.existsSync(memFile)) {
    for (const inv of parseMemoryFile(fs.readFileSync(memFile, "utf8")).invariants) {
      byCode.set(inv.code.toUpperCase(), inv);
    }
  }
  return [...byCode.values()];
}

/** Syncs invariants into `.operon/MEMORY.md` (preserving existing checkpoints & notes). */
export function writeInvariants(dir: string, invariants: Invariant[]): void {
  ensureMemoryFile(dir);
  const current = readMemoryContent(dir);
  const existingCodes = new Set(parseMemoryFile(current).invariants.map((i) => i.code.toUpperCase()));
  for (const inv of invariants) {
    if (!existingCodes.has(inv.code.toUpperCase())) {
      appendMemoryBlock(dir, formatInvariantBlock(inv));
      existingCodes.add(inv.code.toUpperCase());
    }
  }
}

export function removeInvariantFromMemory(dir: string, code: string): boolean {
  const file = path.join(dir, MEMORY_FILE);
  if (!fs.existsSync(file)) return false;
  const content = fs.readFileSync(file, "utf8");
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `\\n?<!--\\s*okf:invariant[^>]*\\bcode="${escaped}"[^>]*-->[\\s\\S]*?<!--\\s*\\/okf:invariant\\s*-->\\n?`,
    "gi",
  );
  if (!re.test(content)) return false;
  fs.writeFileSync(file, content.replace(re, "\n"));
  return true;
}

export function appendCheckpointToMemory(
  dir: string,
  cp: { message: string; author: string; branch: string; session?: string; status?: "in-flight" | "paused" | "closed" },
): void {
  appendMemoryBlock(dir, formatCheckpointBlock(cp));
}

export function readPolicy(dir: string): Policy {
  const direct = path.join(dir, POLICY_FILE);
  const legacy = path.join(dir, LEGACY_POLICY_FILE);
  const file = fs.existsSync(direct) ? direct : fs.existsSync(legacy) ? legacy : null;
  const raw = file ? YAML.parse(fs.readFileSync(file, "utf8")) : null;
  return Policy.parse(raw ?? { type: "Policy" });
}

export function copyDir(src: string, dest: string): void {
  fs.cpSync(src, dest, { recursive: true, force: true });
}
