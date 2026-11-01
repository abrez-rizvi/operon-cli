import fs from "node:fs";
import path from "node:path";
import { listEntities } from "./entities.js";
import { copyDir, ensureMemoryFile, POLICY_FILE, walk } from "./local-store.js";
import { HARDCODED_DEFAULT_PACK_DIR, packsDir, templatesDir, toPosix } from "./paths.js";

export const DEFAULT_PACK = "default";

/** Resolves the default pack source directory (hardcoded D:\MAIN\operon with fallback to bundled templates). */
export function defaultPackSource(): string {
  if (process.env.OPERON_TEMPLATES_DIR && fs.existsSync(process.env.OPERON_TEMPLATES_DIR)) {
    return process.env.OPERON_TEMPLATES_DIR;
  }
  if (fs.existsSync(HARDCODED_DEFAULT_PACK_DIR)) {
    return HARDCODED_DEFAULT_PACK_DIR;
  }
  return templatesDir();
}

/** Ensures ~/.operon/packs/default exists, seeded from hardcoded D:\MAIN\operon or bundled templates. */
export function ensureDefaultPack(): string {
  const dest = path.join(packsDir(), DEFAULT_PACK);
  const src = defaultPackSource();
  const tmpl = templatesDir();

  const syncSub = (srcDir: string, destDir: string) => {
    if (!fs.existsSync(srcDir)) return;
    for (const entry of fs.readdirSync(srcDir)) {
      const entryDest = path.join(destDir, entry);
      if (!fs.existsSync(entryDest)) {
        const entrySrc = path.join(srcDir, entry);
        if (fs.statSync(entrySrc).isDirectory()) copyDir(entrySrc, entryDest);
        else {
          fs.mkdirSync(path.dirname(entryDest), { recursive: true });
          fs.copyFileSync(entrySrc, entryDest);
        }
      }
    }
  };

  for (const sub of ["skills", "workflows", "tools"]) {
    const destSub = path.join(dest, sub);
    syncSub(path.join(src, sub), destSub);
    if (src !== tmpl) syncSub(path.join(tmpl, sub), destSub);
  }

  return dest;
}

export function listPacks(): string[] {
  const dir = packsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => (a === DEFAULT_PACK ? -1 : b === DEFAULT_PACK ? 1 : a.localeCompare(b)));
}

export const packDir = (name: string) => path.join(packsDir(), name);

export interface PackItem {
  pack: string;
  kind: "skill" | "workflow";
  name: string;
  title: string;
  description: string;
  /** Relative path inside the pack to copy (e.g. "skills/tdd" or "skills/foo.md"). */
  relCopyPath: string;
  /** Short label shown in UI (e.g. "tdd/SKILL.md"). */
  displayPath: string;
}

export function listPackItems(packName: string): PackItem[] {
  const root = packDir(packName);
  if (!fs.existsSync(root)) return [];
  return listEntities(root)
    .filter((e): e is typeof e & { kind: "skill" | "workflow" } => e.kind === "skill" || e.kind === "workflow")
    .map((e) => {
      const relFile = toPosix(path.relative(root, e.file));
      const parts = relFile.split("/");
      // e.g. "skills/tdd/SKILL.md" -> copy whole "skills/tdd" folder; "skills/foo.md" -> copy that file
      const relCopyPath = parts.length >= 3 ? `${parts[0]}/${parts[1]}` : relFile;
      const displayPath = parts.slice(1).join("/");
      return {
        pack: packName,
        kind: e.kind,
        name: e.name,
        title: e.title,
        description: e.description,
        relCopyPath,
        displayPath,
      };
    });
}

/** Lists all available skills & workflows across all installed packs. */
export function getAllPackItems(): PackItem[] {
  ensureDefaultPack();
  const packs = listPacks();
  const all: PackItem[] = [];
  const seen = new Set<string>();
  for (const pack of packs) {
    for (const item of listPackItems(pack)) {
      const key = `${item.pack}:${item.relCopyPath}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(item);
      }
    }
  }
  return all;
}

/** Copies the bundled policy + default MEMORY.md into `.operon/` (never overwrites). */
export function seedProjectBasics(projectDir: string): void {
  ensureMemoryFile(projectDir);
  const policyDest = path.join(projectDir, POLICY_FILE);
  if (!fs.existsSync(policyDest)) {
    fs.mkdirSync(path.dirname(policyDest), { recursive: true });
    fs.copyFileSync(path.join(templatesDir(), "tools/policy.yaml"), policyDest);
  }
}

/** Copies one entity directory (or loose file) from a pack into the project profile. */
export function copyEntity(packName: string, relDir: string, projectDir: string): void {
  const src = path.join(packDir(packName), relDir);
  const dest = path.join(projectDir, relDir);
  if (fs.statSync(src).isDirectory()) copyDir(src, dest);
  else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

/** Copies every skill & workflow of a pack into a project. */
export function copyWholePack(packName: string, projectDir: string): number {
  let n = 0;
  for (const sub of ["skills", "workflows"]) {
    const src = path.join(packDir(packName), sub);
    if (!fs.existsSync(src)) continue;
    copyDir(src, path.join(projectDir, sub));
    n += walk(src).filter((f) => /(SKILL|WORKFLOW)\.md$/.test(f) || !f.includes("/")).length;
  }
  return n;
}

const SKIP_DOC = /^(readme|license|changelog|contributing|code_of_conduct)\b/i;

function isBinary(file: string): boolean {
  const buf = fs.readFileSync(file);
  return buf.subarray(0, 8000).includes(0);
}

function copyTextTree(srcDir: string, destDir: string): void {
  for (const rel of walk(srcDir)) {
    const srcFile = path.join(srcDir, rel);
    if (isBinary(srcFile)) continue;
    const destFile = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.copyFileSync(srcFile, destFile);
  }
}

export function toSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\.mdc?$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "skill"
  );
}

/**
 * Discovers skills & workflows inside `srcRoot` (a cloned repo or local directory)
 * and stages them into `destPackDir/skills/<slug>/` and `destPackDir/workflows/<slug>/`.
 */
export function ingestDirectoryIntoPack(srcRoot: string, destPackDir: string): { skills: number; workflows: number } {
  const allFiles = walk(srcRoot);
  const skillMarkers = allFiles.filter((f) => path.posix.basename(f) === "SKILL.md");
  const workflowMarkers = allFiles.filter((f) => path.posix.basename(f) === "WORKFLOW.md");

  let skills = 0;
  let workflows = 0;
  const coveredDirs = new Set<string>();

  for (const rel of skillMarkers) {
    const relDir = path.posix.dirname(rel);
    coveredDirs.add(relDir);
    const slug = toSlug(relDir === "." ? path.basename(srcRoot) : path.posix.basename(relDir));
    copyTextTree(path.join(srcRoot, relDir), path.join(destPackDir, "skills", slug));
    skills++;
  }

  for (const rel of workflowMarkers) {
    const relDir = path.posix.dirname(rel);
    coveredDirs.add(relDir);
    const slug = toSlug(relDir === "." ? path.basename(srcRoot) : path.posix.basename(relDir));
    copyTextTree(path.join(srcRoot, relDir), path.join(destPackDir, "workflows", slug));
    workflows++;
  }

  // If no explicit SKILL.md folders were found (or alongside them), ingest standalone .md/.mdc rule files
  for (const rel of allFiles) {
    if (!/\.mdc?$/i.test(rel)) continue;
    const base = path.posix.basename(rel);
    if (base === "SKILL.md" || base === "WORKFLOW.md" || SKIP_DOC.test(base)) continue;
    const parent = path.posix.dirname(rel);
    if ([...coveredDirs].some((d) => d === "." || parent === d || parent.startsWith(`${d}/`))) continue;
    const srcFile = path.join(srcRoot, rel);
    if (isBinary(srcFile)) continue;
    const slug = toSlug(base);
    const destFile = path.join(destPackDir, "skills", slug, "SKILL.md");
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.copyFileSync(srcFile, destFile);
    skills++;
  }

  return { skills, workflows };
}

export function agentConversionPrompt(targetDir: string): string {
  return [
    "┌─ Agent OKF v0.3 Conversion Prompt (paste into your AI coding editor) ─────────────",
    `│ Convert the Markdown skills/workflows in "${targetDir}" to OKF v0.3 format:`,
    "│ 1. Ensure each SKILL.md / WORKFLOW.md starts with YAML frontmatter:",
    "│    ---",
    "│    type: Skill # (or Workflow)",
    "│    name: <kebab-case-folder-name>",
    "│    title: <Human-Readable Title>",
    "│    description: <One-line summary>",
    "│    ---",
    "│ 2. Organize procedural sections under level-2 (`## Phase / Section`) headings.",
    `│ 3. Run \`operon validate "${targetDir}"\` and fix any reported line errors until it exits 0.`,
    "└───────────────────────────────────────────────────────────────────────────────────",
  ].join("\n");
}
