import path from "node:path";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api.js";
import * as apiMod from "../convex/_generated/api.js";
import * as serverMod from "../convex/_generated/server.js";
import * as auth from "../convex/auth.js";
import * as entitiesMod from "../convex/entities.js";
import * as eventsMod from "../convex/events.js";
import * as knowledge from "../convex/knowledge.js";
import * as memoryMod from "../convex/memory.js";
import * as projects from "../convex/projects.js";
import schema from "../convex/schema.js";
import * as sessions from "../convex/sessions.js";
import * as telemetry from "../convex/telemetry.js";
import { parseGitSource } from "../src/commands/add.js";
import { parseInviteInput } from "../src/commands/join.js";
import { buildInvariant } from "../src/commands/remember.js";
import { listEntities } from "../src/core/entities.js";
import {
  classifyWorkflow,
  detectSeamCollisions,
  isIgnoredSeamPath,
  matchEntities,
  matchInvariants,
} from "../src/core/matching.js";
import { formatCheckpointBlock, formatInvariantBlock, parseMemoryFile } from "../src/core/memory-parser.js";
import { templatesDir } from "../src/core/paths.js";
import { extractSection, tableOfContents } from "../src/tools/heading-parser.js";
import { validateOkf } from "../src/tools/okf-validator.js";
import { getAllPackItems } from "../src/core/packs.js";

const modules: Record<string, () => Promise<any>> = {
  "../convex/_generated/api.ts": async () => apiMod,
  "../convex/_generated/server.ts": async () => serverMod,
  "../convex/auth.ts": async () => auth,
  "../convex/entities.ts": async () => entitiesMod,
  "../convex/events.ts": async () => eventsMod,
  "../convex/memory.ts": async () => memoryMod,
  "../convex/projects.ts": async () => projects,
  "../convex/knowledge.ts": async () => knowledge,
  "../convex/sessions.ts": async () => sessions,
  "../convex/telemetry.ts": async () => telemetry,
};

describe("Operon core & tools", () => {
  it("validates bundled templates as 100% OKF v0.3 compliant", () => {
    const { issues, checked } = validateOkf(templatesDir());
    expect(issues).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(7);
  });

  it("slices markdown headings while ignoring headings inside code fences", () => {
    const md = [
      "# Title",
      "## Alpha Section",
      "```md",
      "## Fake Heading Inside Fence",
      "```",
      "Alpha content.",
      "## Beta Section",
      "Beta content.",
    ].join("\n");
    const toc = tableOfContents(md);
    expect(toc.map((h) => h.slug)).toEqual(["title", "alpha-section", "beta-section"]);
    const sliced = extractSection(md, "alpha-section");
    expect(sliced && "text" in sliced ? sliced.text : "").toContain("## Fake Heading Inside Fence");
    expect(sliced && "text" in sliced ? sliced.text : "").not.toContain("## Beta Section");
  });

  it("parses and validates OKF-tagged MEMORY.md blocks", () => {
    const inv = buildInvariant("[auth] Token expiry must be in seconds", [], "alice@acme.com");
    const validMd = [
      "# Project Memory",
      formatInvariantBlock(inv),
      formatCheckpointBlock({
        message: "Added token refresh test",
        author: "alice@acme.com",
        branch: "main",
        timestamp: 1730000000000,
      }),
    ].join("\n\n");

    const parsed = parseMemoryFile(validMd);
    expect(parsed.errors).toEqual([]);
    expect(parsed.invariants).toHaveLength(1);
    expect(parsed.invariants[0].code).toBe("AUTH-01");
    expect(parsed.checkpoints).toHaveLength(1);
    expect(parsed.checkpoints[0].message).toBe("Added token refresh test");

    const brokenMd = `# Memory\n<!-- okf:invariant code="AUTH-01" ts="2026-11-01T00:00:00Z" -->\nUnclosed block\n`;
    const broken = parseMemoryFile(brokenMd);
    expect(broken.errors).toHaveLength(1);
    expect(broken.errors[0].line).toBe(2);
  });

  it("parses remember gotchas and matches spatially + by prompt keyword", () => {
    const inv = buildInvariant("[auth] Token expiry must be in seconds", [], "alice@acme.com", {
      reason: "Downstream JWT verifier expects Unix seconds",
    });
    expect(inv.code).toBe("AUTH-01");
    expect(inv.paths).toContain("**/auth/**");

    const byKeyword = matchInvariants([inv], [], "fix auth token refresh");
    expect(byKeyword).toHaveLength(1);
    expect(byKeyword[0].reasons).toContain("prompt match");

    const byPath = matchInvariants([inv], ["src/auth/jwt.ts"], "refactor helper");
    expect(byPath).toHaveLength(1);
    expect(byPath[0].reasons[0]).toContain("src/auth/jwt.ts");
  });

  it("classifies workflow intent deterministically", () => {
    const workflows = listEntities(path.resolve(templatesDir())).filter((e) => e.kind === "workflow");
    expect(classifyWorkflow(workflows, "fix broken login").workflow?.name).toBe("bug-fix");
    expect(classifyWorkflow(workflows, "build rate limiter").workflow?.name).toBe("feature-delivery");
  });

  it("parses magic join URLs and GitHub tree URLs", () => {
    expect(parseInviteInput("https://operon.dev/join/acme-core-9x72ab3k4m/")).toBe("acme-core-9x72ab3k4m");
    expect(parseInviteInput("acme-core-9x72ab3k4m")).toBe("acme-core-9x72ab3k4m");
    const gh = parseGitSource("https://github.com/anthropics/claude-code/tree/main/skills/tdd");
    expect(gh).toEqual({
      cloneUrl: "https://github.com/anthropics/claude-code.git",
      branch: "main",
      subdir: "skills/tdd",
      defaultName: "tdd",
    });
  });

  it("lists all available pack items for skills multi-select", () => {
    const items = getAllPackItems();
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items.some((i) => i.name === "tdd" && i.kind === "skill")).toBe(true);
    expect(items.some((i) => i.name === "systematic-debugging" && i.kind === "skill")).toBe(true);
    expect(items.some((i) => i.name === "lean-diff" && i.kind === "skill")).toBe(true);
    expect(items.some((i) => i.name === "feature-delivery" && i.kind === "workflow")).toBe(true);
  });

  it("detects in-flight seam collisions across overlapping files, modules, and task intent", () => {
    const now = Date.now();
    const remote = [
      {
        sessionId: "remote-1",
        branch: "feature/auth",
        author: "dhruv@acme.com",
        status: "in-flight" as const,
        lastCheckpoint: "Refactoring JWT verifier",
        task: "Refactor token validation",
        touchedPaths: ["src/auth/tokens.ts"],
        updatedAt: now - 5000,
      },
    ];

    const byFile = detectSeamCollisions(["src/auth/middleware.ts"], "add rate limit", remote, "local-1", now);
    expect(byFile.collisions).toHaveLength(1);
    expect(byFile.collisions[0].reason).toContain("shared module (src/auth/**)");

    const byPrompt = detectSeamCollisions([], "update tokens expiry check", remote, "local-1", now);
    expect(byPrompt.collisions).toHaveLength(1);
    expect(byPrompt.collisions[0].overlappingPaths).toEqual(["src/auth/tokens.ts"]);
  });

  it("ignores Operon harness files and synthetic wal-* self-sessions in seam collision detection", () => {
    expect(isIgnoredSeamPath(".cursor/rules/operon.mdc")).toBe(true);
    expect(isIgnoredSeamPath(".gitignore")).toBe(true);
    expect(isIgnoredSeamPath("CLAUDE.md")).toBe(true);
    expect(isIgnoredSeamPath("AGENTS.md")).toBe(true);
    expect(isIgnoredSeamPath(".operon/BOOT.md")).toBe(true);
    expect(isIgnoredSeamPath("src/auth/tokens.ts")).toBe(false);

    const now = Date.now();
    const remote = [
      {
        sessionId: "remote-1",
        branch: "main",
        author: "dhruv@acme.com",
        status: "in-flight" as const,
        lastCheckpoint: "Arming workspace",
        task: "init",
        touchedPaths: [".cursor/rules/operon.mdc", ".gitignore", "CLAUDE.md"],
        updatedAt: now - 2000,
      },
      {
        sessionId: "wal-main",
        branch: "main",
        author: "alice@acme.com",
        status: "in-flight" as const,
        lastCheckpoint: "Self checkpoint without session attr",
        task: "auth work",
        touchedPaths: ["src/auth/tokens.ts"],
        updatedAt: now - 1000,
      },
    ];

    const res = detectSeamCollisions(
      [".cursor/rules/operon.mdc", ".gitignore", "src/auth/tokens.ts"],
      "auth work",
      remote,
      "local-1",
      now,
      "alice@acme.com",
    );
    expect(res.collisions).toHaveLength(0);
    expect(res.activeTeammates).toHaveLength(1);
    expect(res.activeTeammates[0].sessionId).toBe("remote-1");
  });

  it("indexes skill sections and matches knowledge & skills against task intent", () => {
    const entities = listEntities(path.resolve(templatesDir()));
    const tdd = entities.find((e) => e.name === "tdd");
    expect(tdd?.sections.map((s) => s.slug)).toContain("red-phase");

    const ranked = matchEntities(entities, ["src/auth/token.ts"], "write failing test with tdd");
    expect(ranked[0].entity.name).toBe("tdd");
    expect(ranked[0].matched).toBe(true);
  });
});

describe("Convex Cloud Brain (convex-test)", () => {
  it("parses uploaded MEMORY.md OKF tags into invariants & sessions tables on the server", async () => {
    const t = convexTest(schema, modules);

    const created = await t.mutation(api.projects.createOrGet, {
      name: "kno-wiki",
      repoHash: "hash123",
    });
    expect(created.inviteCode).toMatch(/^kno-wiki-[a-z0-9]{10}$/);

    const memoryMd = [
      "# Project Memory",
      '<!-- okf:invariant code="AUTH-01" paths="src/auth/**" trigger="auth|token" ts="2026-11-01T00:05:00Z" author="alice@acme.com" -->',
      "Token expiry must be in seconds",
      "<!-- /okf:invariant -->",
      "",
      '<!-- okf:checkpoint ts="2026-11-01T00:06:00Z" author="alice@acme.com" branch="main" session="s1" -->',
      "Auth test green",
      "<!-- /okf:checkpoint -->",
    ].join("\n");

    await t.mutation(api.projects.syncFile, {
      projectId: created.projectId,
      projectToken: created.projectToken,
      path: "MEMORY.md",
      content: memoryMd,
      category: "knowledge",
    });

    const snap = await t.query(api.projects.getSnapshot, { inviteCode: created.inviteCode });
    expect(snap?.files.some((f) => f.path === "MEMORY.md")).toBe(true);
    expect(snap?.invariants).toHaveLength(1);
    expect(snap?.invariants[0].code).toBe("AUTH-01");
    expect(snap?.invariants[0].rule).toBe("Token expiry must be in seconds");

    const latest = await t.query(api.sessions.getLatest, { projectId: created.projectId, branch: "main" });
    expect(latest?.lastCheckpoint).toBe("Auth test green");

    // Unauthorized token rejected
    await expect(
      t.mutation(api.knowledge.removeInvariant, {
        projectId: created.projectId,
        projectToken: "opt_wrong_token",
        code: "AUTH-01",
      }),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("streams typed events on the reactive event bus and slices structured entities in Convex", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.projects.createOrGet, {
      name: "event-bus-demo",
      repoHash: "hash-bus",
    });

    // 1. Sync a skill file -> parsed into structured `entities` table + emits `entity_synced` event
    const skillMd = [
      "---",
      "type: Skill",
      "name: api-design",
      "title: API Boundary Contracts",
      "description: Keep REST and RPC schemas backward compatible.",
      "tags: [api, contracts]",
      "paths: [src/api/**]",
      "---",
      "# API Boundary Contracts",
      "## Versioning Rules",
      "Never remove required fields without a deprecation window.",
      "## Error Payloads",
      "Return structured `{ code, message }` objects.",
    ].join("\n");

    await t.mutation(api.projects.syncFile, {
      projectId: created.projectId,
      projectToken: created.projectToken,
      path: "skills/api-design/SKILL.md",
      content: skillMd,
      category: "skill",
    });

    // 2. Publish typed invariant and checkpoint mutations directly
    await t.mutation(api.knowledge.addInvariant, {
      projectId: created.projectId,
      projectToken: created.projectToken,
      code: "API-01",
      trigger: "\\b(api|schema)\\b",
      rule: "All endpoints return { status, data }",
      reason: "Frontend client wrapper expects envelope",
      paths: ["src/api/**"],
      author: "alice@acme.com",
      timestamp: Date.now(),
    });

    await t.mutation(api.sessions.checkpoint, {
      projectId: created.projectId,
      projectToken: created.projectToken,
      sessionId: "sess-1",
      branch: "feat/api",
      author: "alice@acme.com",
      message: "Added envelope validator",
      touchedPaths: ["src/api/envelope.ts"],
    });

    // 3. Query reactive `events:subscribeFeed`
    const feed = await t.query(api.events.subscribeFeed, {
      inviteCode: created.inviteCode,
      limit: 20,
    });
    expect(feed).not.toBeNull();
    expect(feed?.events.map((e) => e.type)).toEqual(["entity_synced", "invariant_added", "checkpoint"]);
    expect(feed?.entities).toHaveLength(1);
    expect(feed?.entities[0].name).toBe("api-design");
    expect(feed?.entities[0].sections.map((s) => s.slug)).toEqual(["versioning-rules", "error-payloads"]);

    // 4. Slice section directly from Convex via `entities:getSection`
    const sliced = await t.query(api.entities.getSection, {
      projectId: created.projectId,
      name: "api-design",
      section: "versioning-rules",
    });
    expect(sliced?.found).toBe(true);
    expect(sliced?.sectionText).toContain("## Versioning Rules");
    expect(sliced?.sectionText).not.toContain("## Error Payloads");
  });
});
