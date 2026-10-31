import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel.js";

const BASE32 = "23456789abcdefghjkmnpqrstuvwxyz";

export function randomToken(len = 10): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => BASE32[b % BASE32.length]).join("");
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function slugifyProject(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "project";
}

export async function requireProjectToken(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  projectId: Id<"projects">,
  projectToken: string,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  const hash = await sha256Hex(projectToken);
  if (hash !== project.tokenHash) throw new Error("Unauthorized: invalid projectToken");
  return project;
}
