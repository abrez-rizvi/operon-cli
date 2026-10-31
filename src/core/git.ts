import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Git's well-known empty tree object, used as a diff base in repos without commits. */
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export function git(args: string[], cwd: string): string {
  return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function tryGit(args: string[], cwd: string): string | null {
  try {
    return git(args, cwd).trim();
  } catch {
    return null;
  }
}

export function repoRoot(cwd: string): string | null {
  const root = tryGit(["rev-parse", "--show-toplevel"], cwd);
  return root ? path.resolve(root) : null;
}

export const remoteUrl = (root: string) => tryGit(["config", "--get", "remote.origin.url"], root) || null;

/** Normalizes SSH/HTTPS remotes to `host/owner/repo` so all clones hash identically. */
export function normalizeRemote(url: string): string {
  return url
    .trim()
    .replace(/^[a-z+]+:\/\//i, "")
    .replace(/^[^@/]+@/, "")
    .replace(/^([^/:]+):(?!\d+\/)/, "$1/")
    .replace(/\.git\/?$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/** Converts a remote to a browsable https URL when it looks like a forge remote. */
export function remoteToHttps(url: string): string {
  return `https://${normalizeRemote(url)}`;
}

export const headSha = (root: string) => tryGit(["rev-parse", "--verify", "-q", "HEAD"], root);

export function currentBranch(root: string): string {
  return tryGit(["symbolic-ref", "--short", "HEAD"], root) ?? (headSha(root)?.slice(0, 12) || "detached");
}

export function author(root: string): string {
  return tryGit(["config", "user.email"], root) || tryGit(["config", "user.name"], root) || os.userInfo().username;
}

export function isAncestor(root: string, sha: string): boolean {
  try {
    git(["merge-base", "--is-ancestor", sha, "HEAD"], root);
    return true;
  } catch {
    return false;
  }
}

export function isTracked(root: string, relPath: string): boolean {
  return tryGit(["ls-files", "--error-unmatch", relPath], root) !== null;
}

/** Adds patterns to .git/info/exclude so Operon's local harness files never show in git status. */
export function addLocalExcludes(root: string, patterns: string[]): void {
  const rel = tryGit(["rev-parse", "--git-path", "info/exclude"], root);
  if (!rel) return;
  const file = path.resolve(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = new Set(current.split(/\r?\n/));
  const missing = patterns.filter((p) => !lines.has(p));
  if (!missing.length) return;
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(file, `${prefix}# operon (local harness files)\n${missing.join("\n")}\n`);
}

export interface FileStat {
  path: string; // POSIX, repo-relative
  added: number;
  deleted: number;
  binary: boolean;
  untracked: boolean;
}

export function untrackedFiles(root: string): string[] {
  return git(["ls-files", "--others", "--exclude-standard", "-z"], root).split("\0").filter(Boolean);
}

function readLines(file: string): string[] | null {
  try {
    const buf = fs.readFileSync(file);
    if (buf.subarray(0, 8000).includes(0)) return null; // binary
    const text = buf.toString("utf8");
    if (!text) return [];
    return text.replace(/\r?\n$/, "").split(/\r?\n/);
  } catch {
    return null;
  }
}

export function countLines(file: string): number | null {
  return readLines(file)?.length ?? null;
}

/** Tracked changes vs `base` (working tree, staged + unstaged) plus untracked files. */
export function changedFiles(root: string, base: string): FileStat[] {
  const out: FileStat[] = [];
  const numstat = git(["diff", "--numstat", "--no-renames", base], root);
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [a, d, ...rest] = line.split("\t");
    const binary = a === "-";
    out.push({ path: rest.join("\t"), added: binary ? 0 : +a, deleted: binary ? 0 : +d, binary, untracked: false });
  }
  for (const p of untrackedFiles(root)) {
    const lines = readLines(path.join(root, p));
    out.push({ path: p, added: lines?.length ?? 0, deleted: 0, binary: lines === null, untracked: true });
  }
  return out;
}

export interface AddedLine {
  path: string;
  line: number; // 1-based line in working tree
  text: string;
}

/** Every line added vs `base`, including all lines of untracked text files. */
export function addedLines(root: string, base: string): AddedLine[] {
  const out: AddedLine[] = [];
  const diff = git(["diff", "-U0", "--no-color", "--no-renames", "--no-ext-diff", base], root);
  let file: string | null = null;
  let lineNo = 0;
  for (const raw of diff.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("+++ ")) {
      file = line === "+++ /dev/null" ? null : line.slice(6);
    } else if (line.startsWith("@@")) {
      const m = /\+(\d+)/.exec(line);
      lineNo = m ? +m[1] : 0;
    } else if (file && line.startsWith("+")) {
      out.push({ path: file, line: lineNo++, text: line.slice(1) });
    }
  }
  for (const p of untrackedFiles(root)) {
    const lines = readLines(path.join(root, p));
    lines?.forEach((text, i) => out.push({ path: p, line: i + 1, text }));
  }
  return out;
}
