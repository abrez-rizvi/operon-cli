import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireProjectToken } from "./auth.js";
import { emitEvent } from "./events.js";

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

/**
 * Full-text and multi-field search across project invariants (`operon boot` L2 persistent recall).
 * Combines Convex full-text search index (`search_rule`) with token matching across code, reason, trigger, and paths.
 */
export const searchInvariants = query({
  args: {
    projectId: v.id("projects"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { projectId, query: searchQuery, limit }) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return [];
    const maxLimit = Math.max(1, Math.min(limit ?? 10, 50));

    const ftsHits = await ctx.db
      .query("invariants")
      .withSearchIndex("search_rule", (q) => q.search("rule", trimmed).eq("projectId", projectId))
      .take(maxLimit);

    const seen = new Set<string>();
    const results = ftsHits.map((r) => {
      seen.add(r.code);
      return {
        code: r.code,
        trigger: r.trigger,
        rule: r.rule,
        reason: r.reason,
        paths: r.paths,
        author: r.author,
        timestamp: r.timestamp,
      };
    });

    if (results.length < maxLimit) {
      const tokens = trimmed
        .toLowerCase()
        .split(/[^a-z0-9_-]+/)
        .filter((t) => t.length >= 3);

      if (tokens.length > 0) {
        const allRows = await ctx.db
          .query("invariants")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .collect();

        for (const r of allRows) {
          if (seen.has(r.code)) continue;
          const haystack = [r.code, r.rule, r.reason, r.trigger, ...r.paths].join(" ").toLowerCase();
          if (tokens.some((tok) => haystack.includes(tok))) {
            seen.add(r.code);
            results.push({
              code: r.code,
              trigger: r.trigger,
              rule: r.rule,
              reason: r.reason,
              paths: r.paths,
              author: r.author,
              timestamp: r.timestamp,
            });
            if (results.length >= maxLimit) break;
          }
        }
      }
    }

    return results;
  },
});

/** Adds or updates a spatially-scoped invariant (`operon remember`) and emits an `invariant_added` event. */
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
      const unchanged =
        existing.rule === args.rule &&
        existing.reason === args.reason &&
        existing.paths.join(",") === args.paths.join(",");
      await ctx.db.patch(existing._id, doc);
      if (unchanged) return existing._id;
    } else {
      const insertedId = await ctx.db.insert("invariants", doc);
      await emitEvent(ctx, {
        projectId: args.projectId,
        type: "invariant_added",
        sessionId: "cli",
        author: args.author,
        branch: "main",
        summary: args.rule,
        code: args.code,
        paths: args.paths,
        timestamp: args.timestamp,
      });
      return insertedId;
    }

    await emitEvent(ctx, {
      projectId: args.projectId,
      type: "invariant_added",
      sessionId: "cli",
      author: args.author,
      branch: "main",
      summary: args.rule,
      code: args.code,
      paths: args.paths,
      timestamp: args.timestamp,
    });

    return existing._id;
  },
});

/** Removes an invariant by code (`operon forget <code>`) and emits an `invariant_removed` event. */
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
    await emitEvent(ctx, {
      projectId,
      type: "invariant_removed",
      sessionId: "cli",
      author: existing.author,
      branch: "main",
      summary: existing.rule,
      code,
      timestamp: Date.now(),
    });
    return { removed: true };
  },
});
