import type { GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Id } from "./_generated/dataModel.js";
import { mutation, query } from "./_generated/server.js";
import { requireProjectToken } from "./auth.js";
import { emitEvent } from "./events.js";

export type EntityKind = "skill" | "knowledge" | "workflow";

export interface ParsedSection {
  slug: string;
  heading: string;
  level: number;
  content: string;
}

export interface ParsedEntityDoc {
  kind: EntityKind;
  name: string;
  path: string;
  title: string;
  description: string;
  tags: string[];
  triggers: string[];
  paths: string[];
  sections: ParsedSection[];
  content: string;
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseYamlArray(rawVal: string): string[] {
  const trimmed = rawVal.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return trimmed ? [trimmed.replace(/^["']|["']$/g, "")] : [];
}

/** Lightweight, zero-dependency frontmatter + section parser for Convex serverless functions. */
export function parseMarkdownEntity(
  filePath: string,
  content: string,
  kind: EntityKind,
): ParsedEntityDoc | null {
  const posixPath = filePath.replace(/\\/g, "/");
  const base = posixPath.split("/").pop() ?? "";
  if (!/\.mdc?$/i.test(base)) return null;
  if (["readme.md", "index.md", "memory.md", "boot.md"].includes(base.toLowerCase())) return null;

  const parts = posixPath.split("/");
  const fallbackName =
    base === "SKILL.md" || base === "WORKFLOW.md"
      ? (parts[parts.length - 2] ?? base.replace(/\.mdc?$/i, ""))
      : base.replace(/\.mdc?$/i, "");

  const norm = content.replace(/\r\n/g, "\n");
  let body = norm;
  const meta: Record<string, string | string[]> = {};

  if (norm.startsWith("---\n")) {
    const endIdx = norm.indexOf("\n---\n", 4);
    if (endIdx !== -1) {
      const fmLines = norm.slice(4, endIdx).split("\n");
      body = norm.slice(endIdx + 5);
      let currentArrayKey: string | null = null;
      for (const line of fmLines) {
        const listMatch = /^\s*-\s+(.+)$/.exec(line);
        if (listMatch && currentArrayKey) {
          const arr = Array.isArray(meta[currentArrayKey]) ? (meta[currentArrayKey] as string[]) : [];
          arr.push(listMatch[1].trim().replace(/^["']|["']$/g, ""));
          meta[currentArrayKey] = arr;
          continue;
        }
        const kvMatch = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line);
        if (kvMatch) {
          const [, key, val] = kvMatch;
          if (!val.trim()) {
            currentArrayKey = key;
            meta[key] = [];
          } else if (val.trim().startsWith("[")) {
            currentArrayKey = null;
            meta[key] = parseYamlArray(val);
          } else {
            currentArrayKey = null;
            meta[key] = val.trim().replace(/^["']|["']$/g, "");
          }
        }
      }
    }
  }

  const name = (typeof meta.name === "string" && meta.name ? meta.name : fallbackName).toLowerCase();
  const title = typeof meta.title === "string" && meta.title ? meta.title : name;
  const description = typeof meta.description === "string" ? meta.description : "";
  const tags = Array.isArray(meta.tags) ? meta.tags : [];
  const rawTriggers = Array.isArray(meta.triggers) ? meta.triggers : [];
  const paths = Array.isArray(meta.paths) ? meta.paths : [];

  // Parse markdown headings outside code fences and slice section bodies
  const lines = body.split("\n");
  const headings: { slug: string; heading: string; level: number; lineIdx: number }[] = [];
  const counts = new Map<string, number>();
  let fence = "";

  for (let i = 0; i < lines.length; i++) {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(lines[i]);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = "";
      continue;
    }
    if (fence) continue;
    const m = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (!m) continue;
    const baseSlug = slugifyHeading(m[2]) || "section";
    const n = counts.get(baseSlug) ?? 0;
    counts.set(baseSlug, n + 1);
    headings.push({
      slug: n ? `${baseSlug}-${n}` : baseSlug,
      heading: m[2].trim(),
      level: m[1].length,
      lineIdx: i,
    });
  }

  const sections: ParsedSection[] = headings
    .filter((h) => h.level >= 2)
    .map((h) => {
      const next = headings.find((o) => o.lineIdx > h.lineIdx && o.level <= h.level);
      const endLine = next ? next.lineIdx : lines.length;
      return {
        slug: h.slug,
        heading: h.heading,
        level: h.level,
        content: lines.slice(h.lineIdx, endLine).join("\n").trim(),
      };
    });

  const autoTokens = `${name} ${title} ${tags.join(" ")}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  const triggers = [...new Set([...rawTriggers, ...autoTokens])];

  return {
    kind,
    name,
    path: posixPath,
    title,
    description,
    tags,
    triggers,
    paths,
    sections,
    content,
  };
}

/** Upserts a parsed entity into the `entities` table and emits an `entity_synced` event if changed. */
export async function upsertParsedEntity(
  ctx: GenericMutationCtx<DataModel>,
  projectId: Id<"projects">,
  filePath: string,
  content: string,
  category: "skill" | "knowledge" | "workflow" | "tool",
  author = "agent",
): Promise<void> {
  if (category === "tool") return;
  const parsed = parseMarkdownEntity(filePath, content, category);
  if (!parsed) return;

  const existing = await ctx.db
    .query("entities")
    .withIndex("by_project_and_kind_name", (q) =>
      q.eq("projectId", projectId).eq("kind", parsed.kind).eq("name", parsed.name),
    )
    .first();

  const updatedAt = Date.now();
  if (existing) {
    const contentChanged = existing.content !== parsed.content;
    await ctx.db.patch(existing._id, { ...parsed, updatedAt });
    if (contentChanged) {
      await emitEvent(ctx, {
        projectId,
        type: "entity_synced",
        sessionId: "sync",
        author,
        branch: "main",
        summary: `Updated ${parsed.kind} "${parsed.title}" (${parsed.sections.length} sections)`,
        entityName: parsed.name,
        entityKind: parsed.kind,
        paths: [parsed.path],
        timestamp: updatedAt,
      });
    }
    return;
  }

  await ctx.db.insert("entities", {
    projectId,
    ...parsed,
    updatedAt,
  });
  await emitEvent(ctx, {
    projectId,
    type: "entity_synced",
    sessionId: "sync",
    author,
    branch: "main",
    summary: `Published ${parsed.kind} "${parsed.title}" (${parsed.sections.length} sections)`,
    entityName: parsed.name,
    entityKind: parsed.kind,
    paths: [parsed.path],
    timestamp: updatedAt,
  });
}

/** Lists structured metadata and section TOCs for all skills, knowledge docs, and workflows in a project. */
export const listCatalog = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const rows = await ctx.db
      .query("entities")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return rows.map((e) => ({
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
    }));
  },
});

/** Fetches a specific entity TOC or slices a single section directly from Convex (`operon fetch <name>:<section>`). */
export const getSection = query({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    section: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, name, section }) => {
    const rows = await ctx.db
      .query("entities")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const targetName = name.toLowerCase();
    const order: EntityKind[] = ["skill", "knowledge", "workflow"];
    let entity = null;
    for (const kind of order) {
      const hit = rows.find((e) => e.kind === kind && e.name === targetName);
      if (hit) {
        entity = hit;
        break;
      }
    }
    if (!entity) return null;

    if (!section) {
      return {
        found: true as const,
        kind: entity.kind,
        name: entity.name,
        title: entity.title,
        description: entity.description,
        sections: entity.sections.map((s) => ({ slug: s.slug, heading: s.heading, level: s.level })),
        sectionText: null,
      };
    }

    const qSlug = section.toLowerCase();
    const exact = entity.sections.find((s) => s.slug === qSlug);
    if (exact) {
      return {
        found: true as const,
        kind: entity.kind,
        name: entity.name,
        title: entity.title,
        description: entity.description,
        sections: entity.sections.map((s) => ({ slug: s.slug, heading: s.heading, level: s.level })),
        sectionText: exact.content,
      };
    }

    const partial = entity.sections.filter((s) => s.slug.includes(qSlug));
    if (partial.length === 1) {
      return {
        found: true as const,
        kind: entity.kind,
        name: entity.name,
        title: entity.title,
        description: entity.description,
        sections: entity.sections.map((s) => ({ slug: s.slug, heading: s.heading, level: s.level })),
        sectionText: partial[0].content,
      };
    }

    return {
      found: false as const,
      kind: entity.kind,
      name: entity.name,
      title: entity.title,
      description: entity.description,
      sections: entity.sections.map((s) => ({ slug: s.slug, heading: s.heading, level: s.level })),
      ambiguous: partial.map((s) => s.slug),
    };
  },
});

/** Directly upserts a structured entity into Convex. */
export const upsert = mutation({
  args: {
    projectId: v.id("projects"),
    projectToken: v.string(),
    path: v.string(),
    content: v.string(),
    kind: v.union(v.literal("skill"), v.literal("knowledge"), v.literal("workflow")),
    author: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectToken(ctx, args.projectId, args.projectToken);
    await upsertParsedEntity(ctx, args.projectId, args.path, args.content, args.kind, args.author ?? "agent");
    return { ok: true };
  },
});
