import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireProjectToken } from "./auth.js";

const MAX_CHECKPOINTS = 50;

/** Appends a checkpoint to the active session record in Convex (capped at 50 entries). */
export const checkpoint = mutation({
  args: {
    projectId: v.id("projects"),
    projectToken: v.string(),
    sessionId: v.string(),
    branch: v.string(),
    author: v.string(),
    message: v.string(),
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
    if (existing) {
      const checkpoints = [...existing.checkpoints, entry].slice(-MAX_CHECKPOINTS);
      await ctx.db.patch(existing._id, {
        status,
        lastCheckpoint: args.message,
        checkpoints,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("sessions", {
      projectId: args.projectId,
      sessionId: args.sessionId,
      branch: args.branch,
      author: args.author,
      status,
      lastCheckpoint: args.message,
      checkpoints: [entry],
      updatedAt: now,
    });
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
