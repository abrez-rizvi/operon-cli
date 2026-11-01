import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireProjectToken } from "./auth.js";
import { emitEvent } from "./events.js";

const MAX_CHECKPOINTS = 50;

/** Appends a checkpoint to the active session record in Convex and emits a `checkpoint` event on the bus. */
export const checkpoint = mutation({
  args: {
    projectId: v.id("projects"),
    projectToken: v.string(),
    sessionId: v.string(),
    branch: v.string(),
    author: v.string(),
    message: v.string(),
    task: v.optional(v.string()),
    touchedPaths: v.optional(v.array(v.string())),
    close: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireProjectToken(ctx, args.projectId, args.projectToken);
    const now = Date.now();
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_project_and_session", (q) => q.eq("projectId", args.projectId).eq("sessionId", args.sessionId))
      .first();
    const entry = { timestamp: now, message: args.message };
    const status = args.close ? ("closed" as const) : ("in-flight" as const);
    let docId = existing?._id;

    if (existing) {
      if (
        existing.lastCheckpoint === args.message &&
        existing.status === status &&
        now - existing.updatedAt < 10000
      ) {
        return existing._id;
      }
      const checkpoints = [...existing.checkpoints, entry].slice(-MAX_CHECKPOINTS);
      await ctx.db.patch(existing._id, {
        status,
        lastCheckpoint: args.message,
        ...(args.task !== undefined ? { task: args.task } : {}),
        ...(args.touchedPaths !== undefined ? { touchedPaths: args.touchedPaths } : {}),
        checkpoints,
        updatedAt: now,
      });
    } else {
      docId = await ctx.db.insert("sessions", {
        projectId: args.projectId,
        sessionId: args.sessionId,
        branch: args.branch,
        author: args.author,
        status,
        lastCheckpoint: args.message,
        task: args.task,
        touchedPaths: args.touchedPaths,
        checkpoints: [entry],
        updatedAt: now,
      });
    }

    await emitEvent(ctx, {
      projectId: args.projectId,
      type: "checkpoint",
      sessionId: args.sessionId,
      author: args.author,
      branch: args.branch,
      summary: args.message,
      paths: args.touchedPaths,
      timestamp: now,
    });

    return docId;
  },
});

/** Declares or updates an in-flight working seam (task + touched file paths) and emits a `seam` event when changed. */
export const declareSeam = mutation({
  args: {
    projectId: v.id("projects"),
    projectToken: v.string(),
    sessionId: v.string(),
    branch: v.string(),
    author: v.string(),
    task: v.optional(v.string()),
    touchedPaths: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectToken(ctx, args.projectId, args.projectToken);
    const now = Date.now();
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_project_and_session", (q) => q.eq("projectId", args.projectId).eq("sessionId", args.sessionId))
      .first();

    const prevPaths = (existing?.touchedPaths ?? []).slice().sort().join(",");
    const nextPaths = args.touchedPaths.slice().sort().join(",");
    const pathsChanged = prevPaths !== nextPaths;
    const taskChanged = args.task !== undefined && args.task !== (existing?.task ?? "");

    let docId = existing?._id;
    if (existing) {
      await ctx.db.patch(existing._id, {
        branch: args.branch,
        author: args.author,
        status: "in-flight",
        ...(args.task !== undefined ? { task: args.task } : {}),
        touchedPaths: args.touchedPaths,
        updatedAt: now,
      });
    } else {
      docId = await ctx.db.insert("sessions", {
        projectId: args.projectId,
        sessionId: args.sessionId,
        branch: args.branch,
        author: args.author,
        status: "in-flight",
        lastCheckpoint: args.task ? `Task: ${args.task}` : "Working in-flight",
        task: args.task,
        touchedPaths: args.touchedPaths,
        checkpoints: [],
        updatedAt: now,
      });
    }

    if ((pathsChanged && args.touchedPaths.length > 0) || (!existing && args.touchedPaths.length > 0) || taskChanged) {
      await emitEvent(ctx, {
        projectId: args.projectId,
        type: "seam",
        sessionId: args.sessionId,
        author: args.author,
        branch: args.branch,
        summary: args.task || existing?.task || `Touching ${args.touchedPaths.slice(0, 3).join(", ")}`,
        paths: args.touchedPaths,
        timestamp: now,
      });
    }

    return docId;
  },
});

/** Resolves the most recent session state for a branch (`operon boot`). */
export const getLatest = query({
  args: {
    projectId: v.id("projects"),
    branch: v.string(),
  },
  handler: async (ctx, { projectId, branch }) => {
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_project_and_branch", (q) => q.eq("projectId", projectId).eq("branch", branch))
      .collect();
    if (!rows.length) return null;
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    const latest = rows[0];
    return {
      sessionId: latest.sessionId,
      branch: latest.branch,
      author: latest.author,
      status: latest.status,
      lastCheckpoint: latest.lastCheckpoint,
      updatedAt: latest.updatedAt,
    };
  },
});
