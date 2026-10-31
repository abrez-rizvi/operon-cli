import path from "node:path";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api.js";
import * as apiMod from "../convex/_generated/api.js";
import * as serverMod from "../convex/_generated/server.js";
import * as auth from "../convex/auth.js";
import * as knowledge from "../convex/knowledge.js";
import * as projects from "../convex/projects.js";
import schema from "../convex/schema.js";
import * as sessions from "../convex/sessions.js";
import * as telemetry from "../convex/telemetry.js";
import { parseGitSource } from "../src/commands/add.js";
import { parseInviteInput } from "../src/commands/join.js";
import { buildInvariant } from "../src/commands/remember.js";
import { listEntities } from "../src/core/entities.js";
import { classifyWorkflow, matchInvariants } from "../src/core/matching.js";
import { templatesDir } from "../src/core/paths.js";
import { extractSection, tableOfContents } from "../src/tools/heading-parser.js";
import { validateOkf } from "../src/tools/okf-validator.js";

const modules: Record<string, () => Promise<any>> = {
  "../convex/_generated/api.ts": async () => apiMod,
  "../convex/_generated/server.ts": async () => serverMod,
  "../convex/auth.ts": async () => auth,
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

  it("parses remember gotchas and matches spatially + by prompt keyword", () => {
    const inv = buildInvariant("[auth] Token expiry must be in seconds", [], "alice@acme.com", {
      reason: "Downstream JWT verifier expects Unix seconds",
    });
    expect(inv.code).toBe("AUTH-01");
    expect(inv.paths).toContain("**/auth/**");

    // Matches by prompt keyword even when git diff is empty
    const byKeyword = matchInvariants([inv], [], "fix auth token refresh");
    expect(byKeyword).toHaveLength(1);
    expect(byKeyword[0].reasons).toContain("prompt match");

    // Matches spatially when a file under src/auth/ is modified
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
});

describe("Convex Cloud Brain (convex-test)", () => {
  it("creates workspace, syncs snapshot, redeems invite, syncs invariants & sessions, and enforces projectToken", async () => {
    const t = convexTest(schema, modules);

    const created = await t.mutation(api.projects.createOrGet, {
      name: "kno-wiki",
      repoHash: "hash123",
    });
    expect(created.inviteCode).toMatch(/^kno-wiki-[a-z0-9]{10}$/);
    expect(created.projectToken).toMatch(/^opt_/);

    await t.mutation(api.projects.syncFiles, {
      projectId: created.projectId,
      projectToken: created.projectToken,
      files: [{ path: "skills/tdd/SKILL.md", content: "# TDD", category: "skill" }],
    });

    await t.mutation(api.knowledge.addInvariant, {
      projectId: created.projectId,
      projectToken: created.projectToken,
      code: "AUTH-01",
      trigger: "\\bauth\\b",
      rule: "Token expiry must be in seconds",
      reason: "",
      paths: ["**/auth/**"],
      author: "alice@acme.com",
      timestamp: Date.now(),
    });

    // Teammate redeems invite and hydrates snapshot
    const redeemed = await t.mutation(api.projects.redeemInvite, { inviteCode: created.inviteCode });
    expect(redeemed.projectToken).toBe(created.projectToken);

    const snap = await t.query(api.projects.getSnapshot, { inviteCode: created.inviteCode });
    expect(snap?.files).toHaveLength(1);
    expect(snap?.invariants).toHaveLength(1);
    expect(snap?.invariants[0].code).toBe("AUTH-01");

    // Session WAL checkpoint & branch query
    await t.mutation(api.sessions.checkpoint, {
      projectId: created.projectId,
      projectToken: redeemed.projectToken,
      sessionId: "s1",
      branch: "main",
      author: "alice@acme.com",
      message: "Auth test green",
    });
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
});
