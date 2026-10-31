import { z } from "zod";

/** OKF v0.3 entity types (see docs/okf-v0.3.md). */
export const OKF_TYPES = ["Skill", "Knowledge", "Workflow", "Session"] as const;

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "must be kebab-case (a-z, 0-9, -)");

export const BaseFrontmatter = z.looseObject({
  type: z.enum(OKF_TYPES),
  name: slug,
  title: z.string().min(1),
  description: z.string().min(1),
});

export const SkillFrontmatter = BaseFrontmatter.extend({
  type: z.literal("Skill"),
  tags: z.array(z.string()).optional(),
});

export const WorkflowFrontmatter = BaseFrontmatter.extend({
  type: z.literal("Workflow"),
  triggers: z.array(z.string()).optional(),
  default: z.boolean().optional(),
});

export const KnowledgeFrontmatter = BaseFrontmatter.extend({
  type: z.literal("Knowledge"),
  paths: z.array(z.string()).optional(),
});

export const Invariant = z.object({
  code: z.string().min(1),
  trigger: z.string().default(""),
  rule: z.string().min(1),
  reason: z.string().default(""),
  paths: z.array(z.string()).min(1),
  author: z.string().default("unknown"),
  timestamp: z.number(),
});
export type Invariant = z.infer<typeof Invariant>;

export const InvariantLedger = z.object({
  okf: z.string().default("0.3"),
  type: z.literal("InvariantLedger"),
  invariants: z.array(Invariant).default([]),
});
export type InvariantLedger = z.infer<typeof InvariantLedger>;

export const DEFAULT_MANIFESTS = [
  "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock",
  "Cargo.toml", "Cargo.lock", "requirements.txt", "pyproject.toml", "poetry.lock",
  "go.mod", "go.sum", "Gemfile", "Gemfile.lock", "composer.json", "composer.lock",
];

export const Policy = z.object({
  okf: z.string().default("0.3"),
  type: z.literal("Policy"),
  ceiling: z.object({ loc: z.number().int().positive().default(600) }).prefault({}),
  manifests: z.array(z.string()).default(DEFAULT_MANIFESTS),
  debug: z
    .object({
      allow: z.array(z.string()).default([]),
      markers: z.array(z.string()).default(["\\[DEBUG-[^\\]]*\\]"]),
    })
    .prefault({}),
});
export type Policy = z.infer<typeof Policy>;
