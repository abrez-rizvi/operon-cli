import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ProjectConfig } from "../types/config.js";
import { InvariantLedger, Policy, type Invariant } from "../types/okf.js";
import { normalizeRemote, remoteUrl, repoRoot } from "./git.js";
import { projectsDir, toPosix } from "./paths.js";

export const CATEGORY_DIRS = ["skills", "knowledge", "workflows", "tools"] as const;
export type CategoryDir = (typeof CATEGORY_DIRS)[number];
export type Category = "skill" | "knowledge" | "workflow" | "tool";
export const dirToCategory: Record<CategoryDir, Category> = {
  skills: "skill",
  knowledge: "knowledge",
  workflows: "workflow",
  tools: "tool",
};

export const INVARIANTS_FILE = "knowledge/invariants.yaml";
export const POLICY_FILE = "tools/policy.yaml";

export class OperonError extends Error {
  constructor(message: string, readonly exitCode = 2) {
    super(message);
  }
}

/** Stable local key: hash of normalized remote, falling back to the repo root path. */
export function projectKey(root: string): string {
  const remote = remoteUrl(root);
  const basis = remote ? normalizeRemote(remote) : path.resolve(root).toLowerCase();
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 16);
}

export interface Project {
  root: string;
  key: string;
  dir: string;
  config: ProjectConfig;
}

export function requireRepo(cwd = process.cwd()): string {
  const root = repoRoot(cwd);
  if (!root) throw new OperonError("Not inside a git repository.");
  return root;
}

export const projectDirFor = (key: string) => path.join(projectsDir(), key);

export function loadProject(cwd = process.cwd()): Project | null {
  const root = repoRoot(cwd);
  if (!root) return null;
  const key = projectKey(root);
  const dir = projectDirFor(key);
  const cfgPath = path.join(dir, "config.json");
  if (!fs.existsSync(cfgPath)) return null;
  const config = ProjectConfig.parse(JSON.parse(fs.readFileSync(cfgPath, "utf8")));
  return { root, key, dir, config };
}

export function requireProject(cwd = process.cwd()): Project {
  const p = loadProject(cwd);
  if (!p) throw new OperonError("Operon is not initialized for this repository. Run `operon init` (or `operon join <code>`).");
  return p;
}

export function saveConfig(dir: string, config: ProjectConfig): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2) + "\n");
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

/** All syncable text files in the project profile (skills/knowledge/workflows/tools). */
export function listProjectFiles(dir: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  for (const cat of CATEGORY_DIRS) {
    for (const rel of walk(path.join(dir, cat))) {
      const buf = fs.readFileSync(path.join(dir, cat, rel));
      if (buf.subarray(0, 8000).includes(0)) continue; // skip binary
      files.push({ path: `${cat}/${rel}`, content: buf.toString("utf8"), category: dirToCategory[cat] });
    }
  }
  return files;
}

export function readInvariants(dir: string): Invariant[] {
  const file = path.join(dir, INVARIANTS_FILE);
  if (!fs.existsSync(file)) return [];
  return InvariantLedger.parse(YAML.parse(fs.readFileSync(file, "utf8")) ?? { type: "InvariantLedger" }).invariants;
}

export function writeInvariants(dir: string, invariants: Invariant[]): void {
  const ledger = { okf: "0.3", type: "InvariantLedger", invariants };
  writeProjectFile(dir, INVARIANTS_FILE, YAML.stringify(ledger));
}

export function readPolicy(dir: string): Policy {
  const file = path.join(dir, POLICY_FILE);
  const raw = fs.existsSync(file) ? YAML.parse(fs.readFileSync(file, "utf8")) : null;
  return Policy.parse(raw ?? { type: "Policy" });
}

/** Copies a directory tree (text + binary) recursively. */
export function copyDir(src: string, dest: string): void {
  fs.cpSync(src, dest, { recursive: true, force: true });
}
