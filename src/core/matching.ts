import { minimatch } from "minimatch";
import type { Invariant } from "../types/okf.js";
import type { Entity } from "./entities.js";

export interface InvariantMatch {
  inv: Invariant;
  reasons: string[];
}

const GLOBAL = new Set(["**", "**/*", "*"]);

function safeRegex(src: string): RegExp | null {
  try {
    return src ? new RegExp(src, "i") : null;
  } catch {
    return null;
  }
}

/** Spatial (changed paths vs globs) + intent (prompt vs trigger) matching. */
export function matchInvariants(invs: Invariant[], changedPaths: string[], prompt: string): InvariantMatch[] {
  const out: InvariantMatch[] = [];
  for (const inv of invs) {
    const reasons: string[] = [];
    if (inv.paths.some((g) => GLOBAL.has(g))) reasons.push("project-wide");
    else {
      const hit = changedPaths.find((p) => inv.paths.some((g) => minimatch(p, g, { dot: true, nocase: true })));
      if (hit) reasons.push(`touches ${hit}`);
    }
    if (safeRegex(inv.trigger)?.test(prompt)) reasons.push("prompt match");
    if (reasons.length) out.push({ inv, reasons });
  }
  return out.sort((a, b) => b.inv.timestamp - a.inv.timestamp);
}

/** Deterministic keyword intent classifier over workflow `triggers`. */
export function classifyWorkflow(workflows: Entity[], prompt: string): { workflow: Entity | undefined; matched: string[] } {
  const words = new Set(prompt.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  let best: { workflow: Entity; matched: string[] } | undefined;
  for (const wf of workflows) {
    const triggers = Array.isArray(wf.data.triggers) ? (wf.data.triggers as string[]) : [];
    const matched = triggers.filter((t) => words.has(t.toLowerCase()));
    if (matched.length && (!best || matched.length > best.matched.length)) best = { workflow: wf, matched };
  }
  if (best) return best;
  return { workflow: workflows.find((w) => w.data.default === true) ?? workflows[0], matched: [] };
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export interface RemoteSession {
  sessionId: string;
  branch: string;
  author: string;
  status: "in-flight" | "paused" | "closed";
  lastCheckpoint: string;
  task?: string;
  touchedPaths?: string[];
  updatedAt: number;
}

export interface SeamCollision {
  session: RemoteSession;
  overlappingPaths: string[];
  reason: string;
}

const ACTIVE_SEAM_WINDOW_MS = 30 * 60 * 1000;

function dirPrefix(p: string): string | null {
  const clean = p.replace(/^\.?\//, "").replace(/\/\*\*.*$/, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts.length >= 2 && ["src", "app", "lib", "convex", "packages", "server", "client"].includes(parts[0])) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts.length >= 2 ? parts[0] : null;
}

/** Detects in-flight seam overlaps between local touched paths/prompt and active teammate sessions. */
export function detectSeamCollisions(
  localPaths: string[],
  localPrompt: string,
  remoteSessions: RemoteSession[],
  localSessionId?: string,
  now = Date.now(),
): { collisions: SeamCollision[]; activeTeammates: RemoteSession[] } {
  const activeTeammates = remoteSessions.filter(
    (s) =>
      s.status === "in-flight" &&
      (!localSessionId || s.sessionId !== localSessionId) &&
      now - s.updatedAt <= ACTIVE_SEAM_WINDOW_MS,
  );

  const promptWords = new Set(
    localPrompt
      .toLowerCase()
      .match(/[a-z0-9_-]{3,}/g)
      ?.filter((w) => !["the", "and", "for", "with", "fix", "add", "update", "implement", "build", "src"].includes(w)) ?? [],
  );

  const collisions: SeamCollision[] = [];
  for (const remote of activeTeammates) {
    const rPaths = remote.touchedPaths ?? [];
    if (!rPaths.length) continue;

    const overlapping = new Set<string>();
    const reasons = new Set<string>();

    for (const rp of rPaths) {
      for (const lp of localPaths) {
        if (
          lp === rp ||
          minimatch(lp, rp, { dot: true, nocase: true }) ||
          minimatch(rp, lp, { dot: true, nocase: true })
        ) {
          overlapping.add(rp);
          reasons.add(`direct file overlap (${lp})`);
          continue;
        }
        const lDir = dirPrefix(lp);
        const rDir = dirPrefix(rp);
        if (lDir && rDir && lDir.toLowerCase() === rDir.toLowerCase()) {
          overlapping.add(rp);
          reasons.add(`shared module (${lDir}/**)`);
        }
      }

      // Also check if the local task prompt explicitly targets a module/file the teammate is modifying
      const tokens = rp
        .toLowerCase()
        .replace(/\.[^.]+$/, "")
        .split(/[^a-z0-9_-]+/)
        .filter((t) => t.length >= 3 && !["src", "app", "lib", "index"].includes(t));
      const matchedToken = tokens.find((t) => promptWords.has(t));
      if (matchedToken) {
        overlapping.add(rp);
        reasons.add(`task targets "${matchedToken}"`);
      }
    }

    if (overlapping.size > 0) {
      collisions.push({
        session: remote,
        overlappingPaths: [...overlapping],
        reason: [...reasons].join(", "),
      });
    }
  }

  return { collisions, activeTeammates };
}
