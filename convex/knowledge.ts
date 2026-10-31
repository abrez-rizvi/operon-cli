import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireProjectToken } from "./auth.js";

/** Lists all invariants for a project (matched locally against diff paths + prompt keywords). */
export const listInvariants = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const rows = await ctx.db
      .query("invariants")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return rows.map((r) => ({
      code: r.code,
      trigger: r.trigger,
      rule: r.rule,
      reason: r.reason,
      paths: r.paths,
      author: r.author,
      timestamp: r.timestamp,
    }));
  },
});

/** Adds or updates a spatially-scoped invariant (`operon remember`). */
export const addInvariant = mutation({
  args: {
    projectId: v.id("projects"),
    projectToken: v.string(),
    code: v.string(),
    trigger: v.string(),
    rule: v.string(),
    reason: v.string(),
    paths: v.array(v.string()),
    author: v.string(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await requireProjectToken(ctx, args.projectId, args.projectToken);
    const existing = await ctx.db
      .query("invariants")
      .withIndex("by_project_and_code", (q) => q.eq("projectId", args.projectId).eq("code", args.code))
      .first();
    const { projectToken: _t, ...doc } = args;
    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return await ctx.db.insert("invariants", doc);
  },
});

/** Removes an invariant by code (`operon forget <code>`). */
export const removeInvariant = mutation({
  args: {
    projectId: v.id("projects"),
    projectToken: v.string(),
    code: v.string(),
  },
  handler: async (ctx, { projectId, projectToken, code }) => {
    await requireProjectToken(ctx, projectId, projectToken);
    const existing = await ctx.db
      .query("invariants")
      .withIndex("by_project_and_code", (q) => q.eq("projectId", projectId).eq("code", code))
      .first();
    if (!existing) return { removed: false };
    await ctx.db.delete(existing._id);
    return { removed: true };
  },
});
