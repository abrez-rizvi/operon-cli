import fs from "node:fs";
import path from "node:path";
import type { Id } from "../../convex/_generated/dataModel.js";
import { author } from "./git.js";
import { api, createClient, flushOutbox, mutateWithOutbox, resolveConvexUrl } from "./convex-client.js";
import {
  INVARIANTS_FILE,
  listProjectFiles,
  MEMORY_FILE,
  readInvariants,
  readMemoryContent,
  saveConfig,
  writeInvariants,
  writeProjectFile,
  type Project,
} from "./local-store.js";
import { timeAgo, type RemoteSession } from "./matching.js";
import { formatCheckpointBlock, formatInvariantBlock, parseMemoryFile } from "./memory-parser.js";

const remoteSessionsPath = (dir: string) => path.join(dir, "sessions", "remote.json");

export function readRemoteSessions(dir: string): RemoteSession[] {
  const file = remoteSessionsPath(dir);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as RemoteSession[];
  } catch {
    return [];
  }
}

export function writeRemoteSessions(dir: string, sessions: RemoteSession[]): void {
  const file = remoteSessionsPath(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(sessions, null, 2) + "\n");
}

/** Conflict-free union of two MEMORY.md files (preserves all invariants by code and checkpoints by ts+message). */
export function mergeMemoryContent(baseContent: string, incomingContent: string): string {
  const baseParsed = parseMemoryFile(baseContent);
  const incParsed = parseMemoryFile(incomingContent);

  const seenInv = new Set(baseParsed.invariants.map((i) => i.code.toUpperCase()));
  const seenCp = new Set(baseParsed.checkpoints.map((c) => `${c.ts}:${c.message}`));

  const blocksToAppend: string[] = [];
  for (const inv of incParsed.invariants) {
    if (!seenInv.has(inv.code.toUpperCase())) {
      blocksToAppend.push(formatInvariantBlock(inv));
      seenInv.add(inv.code.toUpperCase());
    }
  }
  for (const cp of incParsed.checkpoints) {
    const key = `${cp.ts}:${cp.message}`;
    if (!seenCp.has(key)) {
      blocksToAppend.push(
        formatCheckpointBlock({
          message: cp.message,
          author: cp.author,
          branch: cp.branch,
          session: cp.session,
          status: cp.status,
          timestamp: cp.ts,
        }),
      );
      seenCp.add(key);
    }
  }

  if (!blocksToAppend.length) return baseContent;
  const sep = baseContent.endsWith("\n\n") ? "" : baseContent.endsWith("\n") ? "\n" : "\n\n";
  return `${baseContent}${sep}${blocksToAppend.join("\n\n")}\n`;
}

/** Pulls the latest files and invariants from Convex into `.operon/` (falls back to local cache on error/offline). */
export async function pullLatest(project: Project, timeoutMs = 6000): Promise<"local" | "pulled" | "offline"> {
  const url = resolveConvexUrl(project);
  const cloud = project.config.cloud;
  if (!url || !cloud) return "local";
  try {
    await flushOutbox(project.dir, url, timeoutMs);
    const client = createClient(url, timeoutMs);
    const snap = await client.query(api.projects.getSnapshot, { inviteCode: cloud.inviteCode });
    if (!snap) return "local";

    const lastPullAt = project.config.lastPullAt ?? 0;
    const localMem = readMemoryContent(project.dir);
    for (const f of snap.files) {
      if (f.path === INVARIANTS_FILE) continue;
      if (f.path === MEMORY_FILE) {
        const merged = mergeMemoryContent(f.content, localMem);
        writeProjectFile(project.dir, MEMORY_FILE, merged);
        continue;
      }
      const localFile = path.join(project.dir, f.path);
      if (lastPullAt > 0 && fs.existsSync(localFile)) {
        const stat = fs.statSync(localFile);
        if (stat.mtimeMs > lastPullAt && stat.mtimeMs > (f.updatedAt ?? 0)) {
          continue; // Keep newer local edit (prevents SYNC-01 overwrite)
        }
      }
      writeProjectFile(project.dir, f.path, f.content);
    }
    writeInvariants(project.dir, snap.invariants);
    if (Array.isArray((snap as { sessions?: RemoteSession[] }).sessions)) {
      writeRemoteSessions(project.dir, (snap as { sessions: RemoteSession[] }).sessions);
    }
    project.config.lastPullAt = Date.now();
    saveConfig(project.dir, project.config);
    return "pulled";
  } catch {
    return "offline";
  }
}

/** Uploads `.operon/MEMORY.md` to Convex (where server-side OKF parsing updates invariants & sessions). */
export async function pushMemoryFile(project: Project): Promise<boolean> {
  const cloud = project.config.cloud;
  if (!cloud) return false;
  const content = readMemoryContent(project.dir);
  const parsed = parseMemoryFile(content);
  if (parsed.errors.length > 0) return false;
  return await mutateWithOutbox(project, "projects:syncFile", {
    projectId: cloud.projectId,
    projectToken: cloud.projectToken,
    path: MEMORY_FILE,
    content,
    category: "knowledge",
  });
}

/** Queries Convex for the latest teammate checkpoint on the same branch (`operon boot`). */
export async function remoteSessionNote(
  project: Project,
  branch: string,
  me: string,
  localSessionId?: string,
): Promise<string | null> {
  const url = resolveConvexUrl(project);
  const cloud = project.config.cloud;
  if (!url || !cloud) return null;
  try {
    const client = createClient(url, 6000);
    const latest = await client.query(api.sessions.getLatest, {
      projectId: cloud.projectId as Id<"projects">,
      branch,
    });
    if (!latest) return null;
    if (localSessionId ? latest.sessionId === localSessionId : latest.author === me) return null;
    return `Latest on \`${branch}\` by ${latest.author} (${timeAgo(latest.updatedAt)}, ${latest.status}): ${latest.lastCheckpoint}`;
  } catch {
    return null;
  }
}

export async function pushSeam(
  project: Project,
  payload: { sessionId: string; branch: string; author: string; task?: string; touchedPaths: string[] },
): Promise<void> {
  const cloud = project.config.cloud;
  if (!cloud) return;
  await mutateWithOutbox(project, "sessions:declareSeam", {
    projectId: cloud.projectId,
    projectToken: cloud.projectToken,
    ...payload,
  });
}

export async function pushCheckpoint(
  project: Project,
  payload: { sessionId: string; branch: string; author: string; message: string; close: boolean },
): Promise<void> {
  const cloud = project.config.cloud;
  if (!cloud) return;
  await pushMemoryFile(project);
  await mutateWithOutbox(project, "sessions:checkpoint", {
    projectId: cloud.projectId,
    projectToken: cloud.projectToken,
    ...payload,
  });
}

export async function logTelemetry(
  project: Project,
  payload: { command: string; exitCode: number; locDelta: number },
): Promise<void> {
  if (process.env.OPERON_TELEMETRY === "0") return;
  const cloud = project.config.cloud;
  if (!cloud) return;
  await mutateWithOutbox(project, "telemetry:log", {
    projectId: cloud.projectId,
    projectToken: cloud.projectToken,
    ...payload,
    author: author(project.root),
    timestamp: Date.now(),
  });
}

/** Binds a local project to Convex and uploads all project files & invariants. */
export async function bindAndSyncProject(project: Project, url: string, timeoutMs = 20000) {
  const client = createClient(url, timeoutMs);
  const token = project.config.cloud?.url === url ? project.config.cloud.projectToken : undefined;
  const bound = await client.mutation(api.projects.createOrGet, {
    name: project.config.name,
    repoHash: project.key,
    projectToken: token,
  });
  project.config.cloud = {
    url,
    projectId: bound.projectId,
    inviteCode: bound.inviteCode,
    projectToken: bound.projectToken,
  };
  saveConfig(project.dir, project.config);

  const files = listProjectFiles(project.dir);
  if (files.length) {
    await client.mutation(api.projects.syncFiles, {
      projectId: bound.projectId,
      projectToken: bound.projectToken,
      files,
    });
  }
  for (const inv of readInvariants(project.dir)) {
    await client.mutation(api.knowledge.addInvariant, {
      projectId: bound.projectId,
      projectToken: bound.projectToken,
      ...inv,
    });
  }
  return project.config.cloud;
}
