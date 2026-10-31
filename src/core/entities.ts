import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import { walk } from "./local-store.js";

export interface Entity {
  name: string;
  kind: "skill" | "knowledge" | "workflow";
  file: string; // absolute
  title: string;
  description: string;
  data: Record<string, unknown>;
  body: string;
}

const RESERVED = new Set(["readme.md", "index.md"]);

function load(file: string, kind: Entity["kind"], fallbackName: string): Entity {
  const { data, body } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  return {
    name: typeof data.name === "string" ? data.name : fallbackName,
    kind,
    file,
    title: typeof data.title === "string" ? data.title : fallbackName,
    description: typeof data.description === "string" ? data.description : "",
    data,
    body,
  };
}

/** Lists skills, knowledge docs, and workflows in a project (or pack) directory. */
export function listEntities(dir: string): Entity[] {
  const out: Entity[] = [];
  const scan = (sub: string, kind: Entity["kind"], marker: string) => {
    for (const rel of walk(path.join(dir, sub))) {
      if (!/\.mdc?$/.test(rel)) continue;
      const base = path.posix.basename(rel);
      const parent = path.posix.dirname(rel);
      const file = path.join(dir, sub, rel);
      if (base === marker && parent !== ".") out.push(load(file, kind, path.posix.basename(parent)));
      else if (RESERVED.has(base.toLowerCase())) continue;
      // Skills/workflows: loose top-level files; knowledge: any doc at any depth.
      else if (kind === "knowledge" || parent === ".") out.push(load(file, kind, base.replace(/\.mdc?$/, "")));
    }
  };
  scan("skills", "skill", "SKILL.md");
  scan("knowledge", "knowledge", "index.md");
  scan("workflows", "workflow", "WORKFLOW.md");
  return out;
}

export function findEntity(dir: string, name: string): Entity | undefined {
  const all = listEntities(dir);
  const order: Entity["kind"][] = ["skill", "knowledge", "workflow"];
  for (const kind of order) {
    const hit = all.find((e) => e.kind === kind && e.name === name);
    if (hit) return hit;
  }
  return undefined;
}
