import crypto from "node:crypto";
import fs from "node:fs";
import { ConvexClient } from "convex/browser";
import pc from "picocolors";
import { printBanner } from "../core/banner.js";
import { api, createClient, resolveConvexUrl } from "../core/convex-client.js";
import { author, changedFiles, currentBranch, EMPTY_TREE, headSha } from "../core/git.js";
import {
  INVARIANTS_FILE,
  listProjectFiles,
  MEMORY_FILE,
  OperonError,
  readInvariants,
  readMemoryContent,
  requireProject,
  saveConfig,
  writeInvariants,
  writeProjectFile,
  type Project,
} from "../core/local-store.js";
import { detectSeamCollisions, isIgnoredSeamPath, type RemoteSession } from "../core/matching.js";
import { persistInvariantToMeko } from "../core/meko-client.js";
import { parseMemoryFile } from "../core/memory-parser.js";
import { ensureSession } from "../core/sessions.js";
import { pushSeam, readRemoteSessions, writeRemoteSessions } from "../core/sync.js";
import type { Invariant } from "../types/okf.js";
import { refreshBootFile } from "./boot.js";
import { shareCommand } from "./share.js";

export interface WatchOptions {
  once?: boolean;
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function nowStamp(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

function logEvent(badge: string, detail: string, subline?: string): void {
  console.log(`${pc.dim(nowStamp())}  ${badge} ${detail}`);
  if (subline) console.log(`          ${pc.dim(subline)}`);
}

function currentChangedPaths(root: string, base: string): string[] {
  try {
    return changedFiles(root, base)
      .map((f) => f.path)
      .filter((p) => !isIgnoredSeamPath(p))
      .sort();
  } catch {
    return [];
  }
}

export interface BusEventItem {
  id: string;
  type: "checkpoint" | "seam" | "invariant_added" | "invariant_removed" | "entity_synced";
  sessionId: string;
  author: string;
  branch: string;
  summary: string;
  code?: string;
  paths?: string[];
  entityName?: string;
  entityKind?: string;
  timestamp: number;
}

export interface SnapshotPayload {
  projectId: string;
  name: string;
  repoHash?: string;
  inviteCode: string;
  events?: BusEventItem[];
  files?: { path: string; content: string; category: string; updatedAt: number }[];
  invariants: Invariant[];
  sessions?: RemoteSession[];
}

/** Applies an incoming Convex Event Bus feed or snapshot to `.operon/`, logs live events, and refreshes `.operon/BOOT.md`. */
export function applyIncomingSnapshot(
  project: Project,
  snap: SnapshotPayload,
  state: {
    initialized: boolean;
    localSessionId: string;
    localTask: string;
    localPaths: string[];
    fileHashes: Map<string, string>;
    invariantMap: Map<string, number>;
    sessionMap: Map<string, { updatedAt: number; lastCheckpoint: string; pathsKey: string }>;
    alertedCollisions: Set<string>;
    seenEventIds?: Set<string>;
  },
): boolean {
  let changed = false;
  const localAuthor = author(project.root);
  const seenEvents = state.seenEventIds ?? new Set<string>();
  state.seenEventIds = seenEvents;

  // 1. Stream typed events from the Convex Event Bus (`events` table) when present
  const hasEventStream = Array.isArray(snap.events);
  if (hasEventStream && snap.events) {
    for (const ev of snap.events) {
      if (seenEvents.has(ev.id)) continue;
      seenEvents.add(ev.id);
      if (!state.initialized) continue;
      if (ev.sessionId === state.localSessionId) continue;
      if ((ev.sessionId === "cli" || ev.sessionId === "memory" || ev.sessionId === "sync") && ev.author === localAuthor) {
        continue;
      }

      if (ev.type === "invariant_added") {
        logEvent(
          pc.cyan("↓ [Event: Invariant]"),
          `${pc.bold(ev.author)} published ${pc.yellow(`[${ev.code ?? "INV"}]`)} ${pc.dim(`(${(ev.paths ?? []).join(", ")})`)}`,
          `"${ev.summary}"`,
        );
        changed = true;
      } else if (ev.type === "invariant_removed") {
        logEvent(pc.cyan("↓ [Event: Invariant Removed]"), `${pc.bold(ev.author)} removed [${ev.code ?? "INV"}]`);
        changed = true;
      } else if (ev.type === "checkpoint") {
        logEvent(
          pc.cyan("↓ [Event: Checkpoint]"),
          `${pc.bold(ev.author)} ${pc.dim(`(${ev.branch})`)}: "${ev.summary}"`,
        );
        changed = true;
      } else if (ev.type === "seam") {
        const cleanPaths = (ev.paths ?? []).filter((p) => !isIgnoredSeamPath(p));
        if (cleanPaths.length > 0) {
          logEvent(
            pc.cyan("↓ [Event: Seam]"),
            `${pc.bold(ev.author)} ${pc.dim(`(${ev.branch})`)} touching: ${pc.underline(cleanPaths.join(", "))}`,
          );
          changed = true;
        }
      } else if (ev.type === "entity_synced") {
        logEvent(pc.cyan("↓ [Event: Knowledge/Skill]"), `${pc.bold(ev.author)}: ${ev.summary}`);
        changed = true;
      }
    }
  }

  // 2. Sync invariants to local cache (.operon/knowledge/invariants.yaml)
  for (const inv of snap.invariants) {
    const prevTs = state.invariantMap.get(inv.code);
    if (prevTs === undefined || inv.timestamp > prevTs) {
      state.invariantMap.set(inv.code, inv.timestamp);
      if (state.initialized && !hasEventStream) {
        logEvent(
          pc.cyan("↓ [Teammate Invariant]"),
          `${pc.bold(inv.author)} logged ${pc.yellow(`[${inv.code}]`)} ${pc.dim(`(${inv.paths.join(", ")})`)}`,
          `"${inv.rule}"`,
        );
        changed = true;
      }
    }
  }
  writeInvariants(project.dir, snap.invariants);

  // 3. Sync non-memory files when included in payload
  for (const f of snap.files ?? []) {
    if (f.path === INVARIANTS_FILE || f.path === MEMORY_FILE) continue;

    const incomingHash = sha256(f.content);
    if (state.fileHashes.get(f.path) !== incomingHash) {
      state.fileHashes.set(f.path, incomingHash);
      writeProjectFile(project.dir, f.path, f.content);
      if (state.initialized && !hasEventStream) {
        logEvent(pc.cyan("↓ [Teammate File]"), `Updated ${pc.bold(`.operon/${f.path}`)}`);
        changed = true;
      }
    }
  }

  // 4. Process teammate sessions & in-flight seam collisions
  const remoteSessions = snap.sessions ?? readRemoteSessions(project.dir);
  if (snap.sessions) {
    writeRemoteSessions(project.dir, snap.sessions);
  }

  for (const s of remoteSessions) {
    if (s.sessionId === state.localSessionId) continue;
    if (s.sessionId.startsWith("wal-") && s.author === localAuthor) continue;
    const cleanPaths = (s.touchedPaths ?? []).filter((p) => !isIgnoredSeamPath(p));
    const pathsKey = cleanPaths.slice().sort().join(",");
    const prev = state.sessionMap.get(s.sessionId);
    state.sessionMap.set(s.sessionId, {
      updatedAt: s.updatedAt,
      lastCheckpoint: s.lastCheckpoint,
      pathsKey,
    });

    if (!state.initialized || hasEventStream) continue;

    if (!prev || prev.lastCheckpoint !== s.lastCheckpoint) {
      logEvent(
        pc.cyan("↓ [Teammate Activity]"),
        `${pc.bold(s.author)} ${pc.dim(`(${s.branch})`)}: "${s.lastCheckpoint}"`,
      );
      changed = true;
    }
    if (pathsKey && (!prev || prev.pathsKey !== pathsKey)) {
      logEvent(
        pc.cyan("↓ [Teammate Seam]"),
        `${pc.bold(s.author)} ${pc.dim(`(${s.branch})`)} is touching: ${pc.underline(cleanPaths.join(", "))}`,
      );
      changed = true;
    }
  }

  const { collisions } = detectSeamCollisions(
    state.localPaths,
    state.localTask,
    remoteSessions,
    state.localSessionId,
    Date.now(),
    localAuthor,
  );
  for (const c of collisions) {
    const key = `${c.session.sessionId}:${c.overlappingPaths.join(",")}`;
    if (!state.alertedCollisions.has(key)) {
      state.alertedCollisions.add(key);
      logEvent(
        pc.bgYellow(pc.black(" ⚡ SEAM COLLISION ")),
        `${pc.bold(c.session.author)} (${c.session.branch}) is modifying ${pc.yellow(c.overlappingPaths.join(", "))} (${c.reason})`,
        "✔ Injected collision guard into .operon/BOOT.md for your agent",
      );
      changed = true;
    }
  }

  if (!state.initialized || changed) {
    refreshBootFile(project, state.localTask);
    if (changed && state.initialized) {
      console.log(`          ${pc.green("✔")} Refreshed ${pc.bold(".operon/BOOT.md")} with teammate state`);
    }
  }

  project.config.lastPullAt = Date.now();
  saveConfig(project.dir, project.config);
  state.initialized = true;
  return changed;
}

export async function watchCommand(opts: WatchOptions = {}): Promise<number> {
  let project = requireProject();
  if (!project.config.cloud) {
    console.log(pc.cyan("→ Project is local-only; sharing to Convex first..."));
    await shareCommand({ yes: true });
    project = requireProject();
  }

  const url = resolveConvexUrl(project);
  const cloud = project.config.cloud;
  if (!url || !cloud) {
    throw new OperonError("No Convex cloud binding found. Run `operon share` first.");
  }

  const { root, dir } = project;
  const branch = currentBranch(root);
  const me = author(root);
  const { session } = ensureSession(dir, branch, me, headSha(root));
  const base = session.baseSha ?? headSha(root) ?? EMPTY_TREE;

  const fileHashes = new Map<string, string>();
  for (const f of listProjectFiles(dir)) {
    fileHashes.set(f.path, sha256(f.content));
  }

  const initialMem = parseMemoryFile(readMemoryContent(dir));
  const knownLocalInvariants = new Set(initialMem.invariants.map((i) => i.code.toUpperCase()));
  const knownLocalCheckpoints = new Set(initialMem.checkpoints.map((c) => `${c.ts}:${c.message}`));

  const invariantMap = new Map<string, number>();
  for (const inv of readInvariants(dir)) {
    invariantMap.set(inv.code, inv.timestamp);
  }

  let localPaths = currentChangedPaths(root, base);
  let lastDeclaredPathsKey = "";

  const state = {
    initialized: false,
    localSessionId: session.sessionId,
    localTask: session.task ?? "Active workspace session",
    localPaths,
    fileHashes,
    invariantMap,
    sessionMap: new Map<string, { updatedAt: number; lastCheckpoint: string; pathsKey: string }>(),
    alertedCollisions: new Set<string>(),
    seenEventIds: new Set<string>(),
  };

  const httpClient = createClient(url, 15000);

  /** Converts local `.operon/MEMORY.md` blocks into typed Convex mutations, and syncs entity files & git seams. */
  const pushLocalChanges = async () => {
    localPaths = currentChangedPaths(root, base);
    state.localPaths = localPaths;

    // 1. Check `.operon/` files for local edits
    for (const f of listProjectFiles(dir)) {
      const h = sha256(f.content);
      if (fileHashes.get(f.path) === h) continue;

      if (f.path === MEMORY_FILE) {
        const parsed = parseMemoryFile(f.content);
        if (parsed.errors.length > 0) {
          logEvent(
            pc.yellow("! [Local MEMORY.md]"),
            `Skipping sync until OKF tag error on line ${parsed.errors[0].line} is closed`,
          );
          continue;
        }
        fileHashes.set(f.path, h);

        for (const inv of parsed.invariants) {
          const code = inv.code.toUpperCase();
          if (!knownLocalInvariants.has(code)) {
            knownLocalInvariants.add(code);
            invariantMap.set(code, inv.timestamp);
            logEvent(
              pc.green("↑ [Event: Invariant]"),
              `Publishing ${pc.bold(`[${code}]`)} (${inv.paths.join(", ")})`,
              `"${inv.rule}"`,
            );
            await httpClient.mutation(api.knowledge.addInvariant, {
              projectId: cloud.projectId as any,
              projectToken: cloud.projectToken,
              code,
              trigger: inv.trigger,
              rule: inv.rule,
              reason: inv.reason,
              paths: inv.paths,
              author: inv.author || me,
              timestamp: inv.timestamp,
            });
            void persistInvariantToMeko(project, inv, session.sessionId);
          }
        }

        for (const cp of parsed.checkpoints) {
          const key = `${cp.ts}:${cp.message}`;
          if (!knownLocalCheckpoints.has(key)) {
            knownLocalCheckpoints.add(key);
            logEvent(pc.green("↑ [Event: Checkpoint]"), `"${cp.message}"`);
            await httpClient.mutation(api.sessions.checkpoint, {
              projectId: cloud.projectId as any,
              projectToken: cloud.projectToken,
              sessionId: cp.session && !cp.session.startsWith("wal-") ? cp.session : session.sessionId,
              branch: cp.branch || branch,
              author: cp.author || me,
              message: cp.message,
              task: state.localTask,
              touchedPaths: localPaths,
              close: cp.status === "closed",
            });
          }
        }

        refreshBootFile(project, state.localTask);
        continue;
      }

      fileHashes.set(f.path, h);
      logEvent(pc.green("↑ [Event: Knowledge/Skill]"), `Indexing ${pc.bold(`.operon/${f.path}`)} in Convex`);
      await httpClient.mutation(api.projects.syncFile, {
        projectId: cloud.projectId as any,
        projectToken: cloud.projectToken,
        path: f.path,
        content: f.content,
        category: f.category,
      });
      refreshBootFile(project, state.localTask);
    }

    // 2. Check if touched git seam paths changed
    const pathsKey = localPaths.join(",");
    if (pathsKey !== lastDeclaredPathsKey) {
      lastDeclaredPathsKey = pathsKey;
      if (localPaths.length > 0) {
        logEvent(
          pc.green("↑ [Event: Seam]"),
          `Declaring in-flight paths (${localPaths.length}): ${pc.underline(localPaths.slice(0, 5).join(", "))}`,
        );
      }
      await pushSeam(project, {
        sessionId: session.sessionId,
        branch,
        author: me,
        task: state.localTask,
        touchedPaths: localPaths,
      });
    }
  };

  if (opts.once) {
    await pushLocalChanges();
    let feed = await httpClient
      .query(api.events.subscribeFeed, { inviteCode: cloud.inviteCode, limit: 30 })
      .catch(() => null);
    if (!feed) {
      feed = (await httpClient.query(api.projects.getSnapshot, { inviteCode: cloud.inviteCode })) as any;
    }
    if (feed) {
      state.initialized = true;
      applyIncomingSnapshot(project, feed as unknown as SnapshotPayload, state);
    }
    return 0;
  }

  await printBanner();
  console.log(
    `${pc.green("●")} ${pc.bold("OPERON LIVE EVENT BUS")} · ${pc.bold(project.config.name)} ${pc.cyan(`[${cloud.inviteCode}]`)} · branch ${pc.bold(branch)}`,
  );
  console.log(
    `${pc.dim("  Subscribed to Convex reactive events table + active seams · Press Ctrl+C to stop")}\n`,
  );

  // Initial seam & file push
  try {
    await pushLocalChanges();
  } catch {
    /* initial offline tolerated */
  }

  // Subscribe to real-time updates over WebSocket via ConvexClient on the lightweight `events:subscribeFeed` query
  const liveClient = new ConvexClient(url);
  const unsubscribe = liveClient.onUpdate(
    api.events.subscribeFeed,
    { inviteCode: cloud.inviteCode, limit: 30 },
    (feed) => {
      if (!feed) return;
      const firstConnect = !state.initialized;
      applyIncomingSnapshot(project, feed as unknown as SnapshotPayload, state);
      if (firstConnect) {
        const activeCount = (feed.sessions ?? []).filter((s) => s.status === "in-flight").length;
        logEvent(
          pc.green("● [Connected]"),
          `Event bus active · ${feed.invariants.length} invariant(s) · ${feed.entities.length} skill/knowledge doc(s) · ${activeCount} in-flight session(s)`,
        );
      }
    },
  );

  // Watch `.operon/` directory with debounce + periodic seam check
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;
  const triggerCheck = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (syncing) return;
      syncing = true;
      try {
        await pushLocalChanges();
      } catch {
        /* ignore transient network hiccup */
      } finally {
        syncing = false;
      }
    }, 250);
  };

  let fsWatcher: fs.FSWatcher | null = null;
  try {
    fsWatcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const norm = filename.replace(/\\/g, "/");
      if (norm === "BOOT.md" || norm === "config.json" || norm.startsWith("sessions/")) return;
      triggerCheck();
    });
  } catch {
    /* fallback to interval polling below */
  }

  const interval = setInterval(triggerCheck, 1500);

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      clearInterval(interval);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (fsWatcher) fsWatcher.close();
      unsubscribe();
      void liveClient.close();
      console.log(pc.dim("\nStopped Operon live sync."));
      resolve();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });

  return 0;
}
