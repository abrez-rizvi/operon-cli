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
