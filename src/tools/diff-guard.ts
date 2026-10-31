import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { changedFiles, countLines, EMPTY_TREE, headSha, isAncestor } from "../core/git.js";
import { readPolicy, type Project } from "../core/local-store.js";
import { activeSession } from "../core/sessions.js";
import { currentBranch } from "../core/git.js";

export interface Finding {
  path: string;
  message: string;
}

export interface GuardReport {
  base: string;
  ceiling: number;
  violations: Finding[];
  warnings: Finding[];
  manifests: Finding[];
  stats: { files: number; added: number; deleted: number; net: number };
}

/** Diff base: the active session's starting commit (if still reachable), else HEAD, else the empty tree. */
export function resolveBase(project: Project): string {
  const head = headSha(project.root);
  const session = activeSession(project.dir, currentBranch(project.root));
  if (session?.baseSha && head && isAncestor(project.root, session.baseSha)) return session.baseSha;
  return head ?? EMPTY_TREE;
}

const allowFile = (dir: string) => path.join(dir, "allowances.json");

export function fileHash(file: string): string {
  return fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : "deleted";
}

export function readAllowances(dir: string): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(allowFile(dir), "utf8"));
  } catch {
    return {};
  }
}

export function writeAllowance(dir: string, relPath: string, hash: string): void {
  const all = readAllowances(dir);
  all[relPath] = hash;
  fs.writeFileSync(allowFile(dir), JSON.stringify(all, null, 2) + "\n");
}

export function isManifest(relPath: string, manifests: string[]): boolean {
  return manifests.some((m) => (m.includes("/") ? relPath === m : path.posix.basename(relPath) === m));
}

export function runDiffGuard(project: Project, base = resolveBase(project)): GuardReport {
  const policy = readPolicy(project.dir);
  const ceiling = policy.ceiling.loc;
  const allowances = readAllowances(project.dir);
  const report: GuardReport = { base, ceiling, violations: [], warnings: [], manifests: [], stats: { files: 0, added: 0, deleted: 0, net: 0 } };

  for (const f of changedFiles(project.root, base)) {
    report.stats.files++;
    report.stats.added += f.added;
    report.stats.deleted += f.deleted;
    const abs = path.join(project.root, f.path);

    if (isManifest(f.path, policy.manifests)) {
      const allowed = allowances[f.path] === fileHash(abs);
      const finding = { path: f.path, message: allowed ? "modified (approved via `operon allow`)" : "modified without approval" };
      report.manifests.push(finding);
      if (!allowed) report.violations.push({ path: f.path, message: `package manifest ${finding.message} — a human must run \`operon allow ${f.path}\`` });
      continue;
    }
    if (f.binary) continue;
    const total = countLines(abs);
    if (total !== null && total > ceiling) {
      if (f.added > f.deleted) {
        report.violations.push({ path: f.path, message: `${total} LOC exceeds ceiling ${ceiling} and grew by ${f.added - f.deleted} — split into smaller modules` });
      } else {
        report.warnings.push({ path: f.path, message: `${total} LOC is over ceiling ${ceiling} (did not grow)` });
      }
    }
  }
  report.stats.net = report.stats.added - report.stats.deleted;
  return report;
}
