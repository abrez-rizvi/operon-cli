import type { GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Id } from "./_generated/dataModel.js";
import { query } from "./_generated/server.js";

export type EventType = "checkpoint" | "seam" | "invariant_added" | "invariant_removed" | "entity_synced";

export interface EmitEventInput {
  projectId: Id<"projects">;
  type: EventType;
  sessionId: string;
  author: string;
  branch: string;
  summary: string;
  code?: string;
  paths?: string[];
  entityName?: string;
  entityKind?: string;
  timestamp?: number;
}

const MAX_PROJECT_EVENTS = 150;

/** Appends a real-time event to the project's reactive event bus and bounds history. */
export async function emitEvent(ctx: GenericMutationCtx<DataModel>, input: EmitEventInput): Promise<Id<"events">> {
  const timestamp = input.timestamp ?? Date.now();
  const inserted = await ctx.db.insert("events", {
    projectId: input.projectId,
    type: input.type,
    sessionId: input.sessionId,
    author: input.author,
    branch: input.branch,
    summary: input.summary,
    ...(input.code !== undefined ? { code: input.code } : {}),
    ...(input.paths !== undefined ? { paths: input.paths } : {}),
    ...(input.entityName !== undefined ? { entityName: input.entityName } : {}),
    ...(input.entityKind !== undefined ? { entityKind: input.entityKind } : {}),
    timestamp,
  });

  const all = await ctx.db
    .query("events")
    .withIndex("by_project_and_timestamp", (q) => q.eq("projectId", input.projectId))
    .collect();
  if (all.length > MAX_PROJECT_EVENTS) {
    const excess = all.slice(0, all.length - MAX_PROJECT_EVENTS);
    for (const old of excess) {
      await ctx.db.delete(old._id);
    }
  }
  return inserted;
}

/** Lists recent events on the project event bus (`operon watch`). */
export const listRecent = query({
  args: {
    projectId: v.id("projects"),
    since: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { projectId, since, limit }) => {
    const cap = Math.min(Math.max(limit ?? 30, 1), 100);
    const rows = await ctx.db
      .query("events")
      .withIndex("by_project_and_timestamp", (q) =>
        since !== undefined ? q.eq("projectId", projectId).gt("timestamp", since) : q.eq("projectId", projectId),
      )
      .order("desc")
      .take(cap);
    return rows.reverse().map((e) => ({
      id: e._id,
      type: e.type,
      sessionId: e.sessionId,
      author: e.author,
      branch: e.branch,
      summary: e.summary,
      code: e.code,
      paths: e.paths ?? [],
      entityName: e.entityName,
      entityKind: e.entityKind,
      timestamp: e.timestamp,
    }));
  },
});

/**
 * Lightweight reactive feed for `operon watch`: streams typed events, active seams, invariants,
 * and structured entity metadata WITHOUT re-transmitting raw markdown file blobs on every tick.
 */
export const subscribeFeed = query({
  args: {
    inviteCode: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { inviteCode, limit }) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
      .first();
    if (!project) return null;

    const cap = Math.min(Math.max(limit ?? 30, 1), 100);
    const recentEvents = await ctx.db
      .query("events")
      .withIndex("by_project_and_timestamp", (q) => q.eq("projectId", project._id))
      .order("desc")
      .take(cap);

    const invariants = await ctx.db
      .query("invariants")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);

    const entities = await ctx.db
      .query("entities")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();

    return {
      projectId: project._id,
      name: project.name,
      inviteCode: project.inviteCode,
      events: recentEvents.reverse().map((e) => ({
        id: e._id,
        type: e.type,
        sessionId: e.sessionId,
        author: e.author,
        branch: e.branch,
        summary: e.summary,
        code: e.code,
        paths: e.paths ?? [],
        entityName: e.entityName,
        entityKind: e.entityKind,
        timestamp: e.timestamp,
      })),
      invariants: invariants.map((i) => ({
        code: i.code,
        trigger: i.trigger,
        rule: i.rule,
        reason: i.reason,
        paths: i.paths,
        author: i.author,
        timestamp: i.timestamp,
      })),
      sessions: sessions.slice(0, 20).map((s) => ({
        sessionId: s.sessionId,
        branch: s.branch,
        author: s.author,
        status: s.status,
        lastCheckpoint: s.lastCheckpoint,
        task: s.task ?? "",
        touchedPaths: s.touchedPaths ?? [],
        updatedAt: s.updatedAt,
      })),
      entities: entities.map((e) => ({
        kind: e.kind,
        name: e.name,
        path: e.path,
        title: e.title,
        description: e.description,
        tags: e.tags,
        triggers: e.triggers,
        paths: e.paths,
        sections: e.sections.map((s) => ({ slug: s.slug, heading: s.heading, level: s.level })),
        updatedAt: e.updatedAt,
      })),
    };
  },
});
