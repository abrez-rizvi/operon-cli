import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // 1. Projects & Workspaces
  projects: defineTable({
    name: v.string(),
    repoHash: v.string(), // normalized git remote hash or local repo ID
    inviteCode: v.string(), // e.g. "acme-core-9x72ab3k4m" (~50 bits entropy)
    tokenHash: v.string(), // SHA-256 hex of secret projectToken required for mutations
    createdAt: v.number(),
  })
    .index("by_inviteCode", ["inviteCode"])
    .index("by_repoHash", ["repoHash"]),

  // 2. Hydration Snapshots (The files streamed on `operon join`)
  files: defineTable({
    projectId: v.id("projects"),
    path: v.string(), // e.g. "skills/tdd/SKILL.md", "knowledge/invariants.yaml"
    content: v.string(), // Raw markdown / YAML content
    category: v.union(
      v.literal("skill"),
      v.literal("knowledge"),
      v.literal("workflow"),
      v.literal("tool"),
    ),
    updatedAt: v.number(),
  })
    .index("by_project_and_path", ["projectId", "path"])
    .index("by_project", ["projectId"]),

  // 3. Spatially-Scoped Atomic Invariants
  invariants: defineTable({
    projectId: v.id("projects"),
    code: v.string(), // e.g. "AUTH-01"
    trigger: v.string(), // Keyword/function regex pattern
    rule: v.string(), // "Token expiry must be in seconds"
    reason: v.string(),
    paths: v.array(v.string()), // ["**/auth/**"]
    author: v.string(),
    timestamp: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_code", ["projectId", "code"]),

  // 4. Continuous Sessions & In-Flight Seams (Write-Ahead Logging + Collision Detection)
  sessions: defineTable({
    projectId: v.id("projects"),
    sessionId: v.string(),
    branch: v.string(),
    author: v.string(),
    status: v.union(v.literal("in-flight"), v.literal("paused"), v.literal("closed")),
    lastCheckpoint: v.string(),
    task: v.optional(v.string()),
    touchedPaths: v.optional(v.array(v.string())),
    checkpoints: v.array(
      v.object({
        timestamp: v.number(),
        message: v.string(),
      }),
    ),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_branch", ["projectId", "branch"])
    .index("by_project_and_session", ["projectId", "sessionId"]),

  // 5. Flight Recorder Telemetry
  telemetry: defineTable({
    projectId: v.id("projects"),
    command: v.string(), // "verify", "boot", "clean"
    exitCode: v.number(),
    locDelta: v.number(),
    author: v.string(),
    timestamp: v.number(),
  }).index("by_project", ["projectId"]),
});
