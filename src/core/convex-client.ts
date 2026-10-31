import fs from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { api } from "../../convex/_generated/api.js";
import type { Project } from "./local-store.js";

declare const __OPERON_CONVEX_URL__: string | undefined;

export { api };

/** Resolves the Convex deployment URL from env, project config, or build-time default. */
export function resolveConvexUrl(project?: Project | null): string | null {
  const envUrl = process.env.OPERON_CONVEX_URL?.trim();
  if (envUrl) return envUrl;
  if (project?.config.cloud?.url) return project.config.cloud.url;
  const baked = typeof __OPERON_CONVEX_URL__ !== "undefined" ? __OPERON_CONVEX_URL__?.trim() : "";
  return baked || null;
}

export function createClient(url: string, timeoutMs = 800): ConvexHttpClient {
  return new ConvexHttpClient(url, {
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
  });
}

export interface OutboxEntry {
  fn: string; // e.g. "knowledge:addInvariant"
  args: Record<string, unknown>;
  ts: number;
}

const outboxPath = (dir: string) => path.join(dir, "outbox.jsonl");

export function enqueueOutbox(dir: string, fn: string, args: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(outboxPath(dir), JSON.stringify({ fn, args, ts: Date.now() }) + "\n");
}

function resolveMutationRef(fn: string) {
  const [mod, name] = fn.split(":");
  return (anyApi as any)[mod][name];
}

/** Flushes queued offline mutations in FIFO order; keeps remaining entries on failure. */
export async function flushOutbox(dir: string, url: string, timeoutMs = 800): Promise<number> {
  const file = outboxPath(dir);
  if (!fs.existsSync(file)) return 0;
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  if (!lines.length) return 0;

  const client = createClient(url, timeoutMs);
  let sent = 0;
  for (let i = 0; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]) as OutboxEntry;
      await client.mutation(resolveMutationRef(entry.fn), entry.args);
      sent++;
    } catch {
      const remaining = lines.slice(i).join("\n") + "\n";
      fs.writeFileSync(file, remaining);
      return sent;
    }
  }
  fs.unlinkSync(file);
  return sent;
}

/** Runs a Convex mutation with automatic fallback to the local outbox on network failure. */
export async function mutateWithOutbox(
  project: Project,
  fn: string,
  args: Record<string, unknown>,
  timeoutMs = 800,
): Promise<boolean> {
  const url = resolveConvexUrl(project);
  if (!url || !project.config.cloud) return false;
  try {
    await flushOutbox(project.dir, url, timeoutMs);
    const client = createClient(url, timeoutMs);
    await client.mutation(resolveMutationRef(fn), args);
    return true;
  } catch {
    enqueueOutbox(project.dir, fn, args);
    return false;
  }
}
