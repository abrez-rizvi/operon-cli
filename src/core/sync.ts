import type { Id } from "../../convex/_generated/dataModel.js";
import { author } from "./git.js";
import { api, createClient, flushOutbox, mutateWithOutbox, resolveConvexUrl } from "./convex-client.js";
import {
  INVARIANTS_FILE,
  listProjectFiles,
  readInvariants,
  saveConfig,
  writeInvariants,
  writeProjectFile,
  type Project,
} from "./local-store.js";
import { timeAgo } from "./matching.js";

/** Pulls the latest files and invariants from Convex (800ms timeout; falls back to local cache). */
export async function pullLatest(project: Project, timeoutMs = 800): Promise<"local" | "pulled" | "offline"> {
  const url = resolveConvexUrl(project);
  const cloud = project.config.cloud;
  if (!url || !cloud) return "local";
  try {
    await flushOutbox(project.dir, url, timeoutMs);
    const client = createClient(url, timeoutMs);
    const snap = await client.query(api.projects.getSnapshot, { inviteCode: cloud.inviteCode });
    if (!snap) return "local";
    for (const f of snap.files) {
      if (f.path === INVARIANTS_FILE) continue; // merged below from invariants table
      writeProjectFile(project.dir, f.path, f.content);
    }
    writeInvariants(project.dir, snap.invariants);
    project.config.lastPullAt = Date.now();
    saveConfig(project.dir, project.config);
    return "pulled";
  } catch {
    return "offline";
  }
}

/** Queries Convex for the latest teammate checkpoint on the same branch (`operon boot`). */
export async function remoteSessionNote(project: Project, branch: string, me: string): Promise<string | null> {
  const url = resolveConvexUrl(project);
  const cloud = project.config.cloud;
  if (!url || !cloud) return null;
  try {
    const client = createClient(url, 600);
    const latest = await client.query(api.sessions.getLatest, {
      projectId: cloud.projectId as Id<"projects">,
      branch,
    });
    if (!latest || latest.author === me) return null;
    return `Latest on \`${branch}\` by ${latest.author} (${timeAgo(latest.updatedAt)}, ${latest.status}): ${latest.lastCheckpoint}`;
  } catch {
    return null;
  }
}

export async function pushCheckpoint(
  project: Project,
  payload: { sessionId: string; branch: string; author: string; message: string; close: boolean },
): Promise<void> {
  const cloud = project.config.cloud;
  if (!cloud) return;
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
export async function bindAndSyncProject(project: Project, url: string, timeoutMs = 4000) {
  const client = createClient(url, timeoutMs);
  const bound = await client.mutation(api.projects.createOrGet, {
    name: project.config.name,
    repoHash: project.key,
    projectToken: project.config.cloud?.projectToken,
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
