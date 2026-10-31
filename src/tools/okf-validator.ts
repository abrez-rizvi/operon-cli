import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { ZodType } from "zod";
import { keyLine, parseFrontmatter } from "../core/frontmatter.js";
import { walk } from "../core/local-store.js";
import { BaseFrontmatter, InvariantLedger, KnowledgeFrontmatter, Policy, SkillFrontmatter, WorkflowFrontmatter } from "../types/okf.js";

export interface Issue {
  file: string; // POSIX, relative to validated root
  line: number;
  message: string;
}

const RESERVED = new Set(["readme.md", "index.md"]);

/** Picks the OKF schema for a markdown file based on its name and location. */
function schemaFor(rel: string, isSupportingDoc: boolean): ZodType | null {
  const parts = rel.split("/");
  const base = parts[parts.length - 1];
  if (RESERVED.has(base.toLowerCase())) return null;
  if (base === "SKILL.md") return SkillFrontmatter;
  if (base === "WORKFLOW.md") return WorkflowFrontmatter;
  if (parts.includes("knowledge")) return KnowledgeFrontmatter;
  if (isSupportingDoc) return null; // e.g. skills/tdd/reference.md beside SKILL.md
  if (parts.includes("workflows")) return WorkflowFrontmatter;
  if (parts.includes("skills")) return SkillFrontmatter;
  return BaseFrontmatter;
}

function validateMarkdown(rel: string, text: string, schema: ZodType, issues: Issue[]): { type?: string; name?: string } {
  const doc = parseFrontmatter(text);
  if (doc.error) {
    issues.push({ file: rel, line: doc.error.line, message: `invalid frontmatter: ${doc.error.message}` });
    return {};
  }
  if (doc.raw === null) {
    issues.push({ file: rel, line: 1, message: "missing YAML frontmatter (--- type/name/title/description ---)" });
    return {};
  }
  const result = schema.safeParse(doc.data);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path[0] as string | number | undefined;
      issues.push({ file: rel, line: keyLine(doc.raw, key), message: `${issue.path.join(".") || "frontmatter"}: ${issue.message}` });
    }
  }
  return { type: doc.data.type as string, name: doc.data.name as string };
}

function validateYaml(rel: string, text: string, schema: ZodType, issues: Issue[]): void {
  const doc = YAML.parseDocument(text, { prettyErrors: false });
  if (doc.errors.length) {
    const e = doc.errors[0];
    issues.push({ file: rel, line: (e.linePos?.[0]?.line ?? 1), message: `invalid YAML: ${e.message.split("\n")[0]}` });
    return;
  }
  const result = schema.safeParse(doc.toJS());
  if (!result.success) {
    for (const issue of result.error.issues) issues.push({ file: rel, line: 1, message: `${issue.path.join(".") || "document"}: ${issue.message}` });
  }
}

/** Validates every OKF document under `root`. Empty result = 100% compliant. */
export function validateOkf(root: string): { issues: Issue[]; checked: number } {
  const issues: Issue[] = [];
  const seen = new Map<string, string>();
  let checked = 0;
  for (const rel of walk(root)) {
    if (rel.startsWith("sessions/")) continue;
    const abs = path.join(root, rel);
    const base = path.posix.basename(rel);
    if (/\.mdc?$/.test(rel)) {
      const dirFiles = fs.readdirSync(path.dirname(abs));
      const supporting = base !== "SKILL.md" && base !== "WORKFLOW.md" && (dirFiles.includes("SKILL.md") || dirFiles.includes("WORKFLOW.md"));
      const schema = schemaFor(rel, supporting);
      if (!schema) continue;
      checked++;
      const { type, name } = validateMarkdown(rel, fs.readFileSync(abs, "utf8"), schema, issues);
      if (type && name) {
        const id = `${type}:${name}`;
        if (seen.has(id)) issues.push({ file: rel, line: 1, message: `duplicate ${type} name "${name}" (also in ${seen.get(id)})` });
        else seen.set(id, rel);
      }
    } else if (/\.ya?ml$/.test(rel)) {
      const text = fs.readFileSync(abs, "utf8");
      if (base.startsWith("invariants.") || /^type:\s*InvariantLedger/m.test(text)) {
        checked++;
        validateYaml(rel, text, InvariantLedger, issues);
      } else if (base.startsWith("policy.") || /^type:\s*Policy/m.test(text)) {
        checked++;
        validateYaml(rel, text, Policy, issues);
      }
    }
  }
  return { issues, checked };
}
