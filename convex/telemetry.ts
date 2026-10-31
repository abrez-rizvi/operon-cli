import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { requireProjectToken } from "./auth.js";

export const log = mutation({
  args: {
    projectId: v.id("projects"),
    projectToken: v.string(),
    command: v.string(),
    exitCode: v.number(),
    locDelta: v.number(),
    author: v.string(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await requireProjectToken(ctx, args.projectId, args.projectToken);
    const { projectToken: _t, ...doc } = args;
    return await ctx.db.insert("telemetry", doc);
  },
});
