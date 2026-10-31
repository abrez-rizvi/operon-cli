import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Write-Ahead Log: one JSONL file per branch in <project>/sessions/. */
export interface WalEntry {
  ts: number;
  kind: "start" | "checkpoint" | "close";
  sessionId: string;
  author: string;
  message?: string;
  task?: string;
  baseSha?: string | null;
}

export interface Session {
  sessionId: string;
  baseSha: string | null;
  status: "in-flight" | "closed";
  startedAt: number;
  updatedAt: number;
  task?: string;
  checkpoints: { ts: number; message: string }[];
}

export const STALE_MS = 12 * 60 * 60 * 1000;

const walFile = (dir: string, branch: string) =>
  path.join(dir, "sessions", `${branch.replace(/[^\w.-]+/g, "_")}.jsonl`);

function readWal(dir: string, branch: string): WalEntry[] {
  const file = walFile(dir, branch);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as WalEntry];
      } catch {
        return []; // tolerate a torn final write
      }
    });
}

function append(dir: string, branch: string, entry: WalEntry): void {
  const file = walFile(dir, branch);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + "\n");
}

/** Latest session on this branch (may be closed or stale). */
export function latestSession(dir: string, branch: string): Session | null {
  const entries = readWal(dir, branch);
  const startIdx = entries.map((e) => e.kind).lastIndexOf("start");
  if (startIdx === -1) return null;
  const start = entries[startIdx];
  const rest = entries.slice(startIdx).filter((e) => e.sessionId === start.sessionId);
  const last = rest[rest.length - 1];
  const lastTask = [...rest].reverse().find((e) => e.task)?.task;
  return {
    sessionId: start.sessionId,
    baseSha: start.baseSha ?? null,
    status: rest.some((e) => e.kind === "close") ? "closed" : "in-flight",
    startedAt: start.ts,
    updatedAt: last.ts,
    ...(lastTask ? { task: lastTask } : {}),
    checkpoints: rest.filter((e) => e.kind === "checkpoint").map((e) => ({ ts: e.ts, message: e.message ?? "" })),
  };
}

/** The current in-flight, non-stale session, if any. */
export function activeSession(dir: string, branch: string): Session | null {
  const s = latestSession(dir, branch);
  return s && s.status === "in-flight" && Date.now() - s.updatedAt < STALE_MS ? s : null;
}

export function startSession(dir: string, branch: string, author: string, baseSha: string | null, task?: string): Session {
  const sessionId = crypto.randomBytes(4).toString("hex");
  const ts = Date.now();
  append(dir, branch, { ts, kind: "start", sessionId, author, baseSha, ...(task ? { task } : {}) });
  return { sessionId, baseSha, status: "in-flight", startedAt: ts, updatedAt: ts, ...(task ? { task } : {}), checkpoints: [] };
}

export function ensureSession(dir: string, branch: string, author: string, baseSha: string | null, task?: string) {
  const active = activeSession(dir, branch);
  if (active) {
    if (task && active.task !== task) {
      active.task = task;
    }
    return { session: active, resumed: true };
  }
  return { session: startSession(dir, branch, author, baseSha, task), resumed: false };
}

export function appendCheckpoint(dir: string, branch: string, author: string, sessionId: string, message: string): void {
  append(dir, branch, { ts: Date.now(), kind: "checkpoint", sessionId, author, message });
}

export function closeSession(dir: string, branch: string, author: string, sessionId: string, message?: string): void {
  append(dir, branch, { ts: Date.now(), kind: "close", sessionId, author, message });
}
