import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { randomToken, requireProjectToken, sha256Hex, slugifyProject } from "./auth.js";

const categoryValidator = v.union(
  v.literal("skill"),
  v.literal("knowledge"),
  v.literal("workflow"),
  v.literal("tool"),
);

/** Creates a new Convex project (or returns existing when caller holds a valid projectToken). */
export const createOrGet = mutation({
  args: {
    name: v.string(),
    repoHash: v.string(),
    projectToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.projectToken) {
      const existing = await ctx.db
        .query("projects")
        .withIndex("by_repoHash", (q) => q.eq("repoHash", args.repoHash))
        .first();
      if (existing && (await sha256Hex(args.projectToken)) === existing.tokenHash) {
        return {
          projectId: existing._id,
          name: existing.name,
          inviteCode: existing.inviteCode,
          projectToken: args.projectToken,
        };
      }
    }

    const inviteCode = `${slugifyProject(args.name)}-${randomToken(10)}`;
    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      repoHash: args.repoHash,
      inviteCode,
      tokenHash: "",
      createdAt: Date.now(),
    });
    const projectToken = `opt_${(await sha256Hex(`${projectId}:${inviteCode}`)).slice(0, 32)}`;
    await ctx.db.patch(projectId, { tokenHash: await sha256Hex(projectToken) });
    return { projectId, name: args.name, inviteCode, projectToken };
  },
});

/** Exchanges a high-entropy inviteCode for the project snapshot, invariants, and secret token (`operon join`). */
export const getSnapshot = query({
  args: { inviteCode: v.string() },
  handler: async (ctx, { inviteCode }) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
      .first();
    if (!project) return null;
    const files = await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    const invariants = await ctx.db
      .query("invariants")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    return {
      projectId: project._id,
      name: project.name,
      repoHash: project.repoHash,
      inviteCode: project.inviteCode,
      files: files.map((f) => ({ path: f.path, content: f.content, category: f.category, updatedAt: f.updatedAt })),
      invariants: invariants.map((i) => ({
        code: i.code,
        trigger: i.trigger,
        rule: i.rule,
        reason: i.reason,
        paths: i.paths,
        author: i.author,
        timestamp: i.timestamp,
      })),
    };
  },
});

/** Redeems an inviteCode and returns the shared projectToken for mutations. */
export const redeemInvite = mutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, { inviteCode }) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
      .first();
    if (!project) throw new Error(`Invalid invite code: ${inviteCode}`);
    const projectToken = `opt_${(await sha256Hex(`${project._id}:${project.inviteCode}`)).slice(0, 32)}`;
    return { projectId: project._id, name: project.name, inviteCode: project.inviteCode, projectToken };
  },
});

/** Upserts a single file in the cloud hydration snapshot. */
export const syncFile = mutation({
  args: {
    projectId: v.id("projects"),
    projectToken: v.string(),
    path: v.string(),
    content: v.string(),
    category: categoryValidator,
  },
  handler: async (ctx, args) => {
    await requireProjectToken(ctx, args.projectId, args.projectToken);
    const existing = await ctx.db
      .query("files")
      .withIndex("by_project_and_path", (q) => q.eq("projectId", args.projectId).eq("path", args.path))
      .first();
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { content: args.content, category: args.category, updatedAt });
      return existing._id;
    }
    return await ctx.db.insert("files", {
      projectId: args.projectId,
      path: args.path,
      content: args.content,
      category: args.category,
      updatedAt,
    });
  },
});

/** Batch-upserts multiple files in one round-trip (`operon init` / `operon sync`). */
export const syncFiles = mutation({
  args: {
    projectId: v.id("projects"),
    projectToken: v.string(),
    files: v.array(
      v.object({
        path: v.string(),
        content: v.string(),
        category: categoryValidator,
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireProjectToken(ctx, args.projectId, args.projectToken);
    const updatedAt = Date.now();
    for (const file of args.files) {
      const existing = await ctx.db
        .query("files")
        .withIndex("by_project_and_path", (q) => q.eq("projectId", args.projectId).eq("path", file.path))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { content: file.content, category: file.category, updatedAt });
      } else {
        await ctx.db.insert("files", {
          projectId: args.projectId,
          path: file.path,
          content: file.content,
          category: file.category,
          updatedAt,
        });
      }
    }
    return { synced: args.files.length, updatedAt };
  },
});
