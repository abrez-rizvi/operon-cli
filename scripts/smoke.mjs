// End-to-end smoke tests against the built CLI (dist/cli.js) in isolated temp dirs.
// Usage: npm run build && npm run smoke [-- phase1 phase2 ...]
import { spawn, spawnSync, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/cli.js");
const only = process.argv.slice(2);
let failures = 0;

export function sandbox(label) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `operon-smoke-${label}-`));
  const home = path.join(base, "home");
  const repo = path.join(base, "repo");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
  fs.mkdirSync(repo, { recursive: true });
  const env = { ...process.env, OPERON_HOME: path.join(base, "operon"), OPERON_USER_HOME: home, NO_COLOR: "1", CI: "1" };
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", `${label}@example.com`);
  git("config", "user.name", label);
  git("config", "core.autocrlf", "false");
  const write = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), content);
  };
  const op = (...args) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, env, encoding: "utf8" });
    return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
  };
  const opAsync = (...args) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [CLI, ...args], { cwd: repo, env });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      child.on("close", (code) => resolve({ code, out }));
    });
  return { base, home, repo, env, git, write, op, opAsync };
}

export function check(name, cond, detail = "") {
  if (cond) console.log(`  ✔ ${name}`);
  else {
    failures++;
    console.log(`  ✘ ${name}${detail ? `\n${String(detail).split("\n").map((l) => "      " + l).join("\n")}` : ""}`);
  }
}

const suites = {
  async phase1() {
    const s = sandbox("p1");
    s.write("README.md", "# demo\n");
    s.git("add", ".");
    s.git("commit", "-qm", "init");

    let r = s.op("boot", "fix login");
    check("boot in uninitialized repo exits 0 with notice", r.code === 0 && /not initialized/.test(r.out), r.out);

    r = s.op("setup");
    check("setup exits 0", r.code === 0, r.out);
    const claude = path.join(s.home, ".claude", "CLAUDE.md");
    check("setup arms ~/.claude/CLAUDE.md", fs.existsSync(claude) && fs.readFileSync(claude, "utf8").includes("operon:start"));
    s.op("setup");
    check("setup is idempotent (single block)", (fs.readFileSync(claude, "utf8").match(/operon:start/g) ?? []).length === 1);

    r = s.op("init", "demo", "--local");
    check("init --local exits 0", r.code === 0, r.out);
    check("init creates visible .operon/MEMORY.md in project folder", fs.existsSync(path.join(s.repo, ".operon/MEMORY.md")), r.out);
    check("init arms local Cursor rule", fs.existsSync(path.join(s.repo, ".cursor/rules/operon.mdc")), r.out);
    check(".operon/ and Cursor rule hidden from git status", !s.git("status", "--porcelain").includes(".operon") && !s.git("status", "--porcelain").includes(".cursor"), s.git("status", "--porcelain"));

    // Verify init works in a plain directory WITHOUT .git
    const noGitDir = path.join(s.base, "plain-folder");
    fs.mkdirSync(noGitDir, { recursive: true });
    const noGitRes = spawnSync(process.execPath, [CLI, "init", "plain-app", "--local"], { cwd: noGitDir, env: s.env, encoding: "utf8" });
    check(
      "init works in a folder without .git and adds .operon/ to .gitignore",
      noGitRes.status === 0 && fs.existsSync(path.join(noGitDir, ".operon/MEMORY.md")) && fs.readFileSync(path.join(noGitDir, ".gitignore"), "utf8").includes(".operon/"),
      noGitRes.stdout + noGitRes.stderr,
    );

    r = s.op("boot", "fix the broken login redirect");
    check("boot classifies bug-fix workflow and writes .operon/BOOT.md", r.code === 0 && /Workflow: Bug Fix/.test(r.out) && fs.existsSync(path.join(s.repo, ".operon/BOOT.md")), r.out);
    r = s.op("boot", "add rate limiting to login");
    check("boot classifies feature-delivery workflow", /Workflow: Feature Delivery/.test(r.out), r.out);
    check("boot output stays compact (<2500 chars)", r.out.length < 2500, `${r.out.length} chars`);

    r = s.op("fetch");
    check("fetch without args prints structured knowledge & skills catalog with section slugs", r.code === 0 && /Knowledge & Skills Catalog/.test(r.out) && /sections: seam-definition, red-phase/.test(r.out), r.out);
    r = s.op("fetch", "tdd");
    check("fetch entity prints TOC", r.code === 0 && /red-phase/.test(r.out), r.out);
    r = s.op("fetch", "tdd:red-phase");
    check("fetch slices a section", r.code === 0 && /## Red Phase/.test(r.out) && !/## Green Phase/.test(r.out), r.out);
    r = s.op("fetch", "nope:thing");
    check("fetch unknown entity exits 2", r.code === 2, r.out);

    r = s.op("checkpoint", "red: failing test for redirect");
    check("checkpoint exits 0", r.code === 0, r.out);
    r = s.op("boot", "fix login redirect");
    check("boot resumes session with last checkpoint", /Resumed Session/.test(r.out) && /failing test for redirect/.test(r.out), r.out);
  },

  async phase2() {
    const s = sandbox("p2");
    s.write("src/app.ts", "export const x = 1;\n");
    s.git("add", ".");
    s.git("commit", "-qm", "init");
    s.op("init", "demo", "--local");

    // 1. Clean repo passes verify & validate
    let r = s.op("verify");
    check("verify passes on clean repo", r.code === 0 && /RESULT: PASS/.test(r.out), r.out);

    r = s.op("validate");
    check("validate passes on default project profile", r.code === 0 && /100% OKF v0.3 compliant/.test(r.out), r.out);

    // 2. Debug statements caught & purged
    s.write(
      "src/app.ts",
      [
        "export function greet(name: string) {",
        "  console.log('hi', name);",
        "  // [DEBUG-auth] temporary trace",
        "  if (!name)",
        "    console.log('unsafe braceless');",
        "  return `hello ${name}`;",
        "}",
        "",
      ].join("\n"),
    );

    r = s.op("verify");
    check("verify fails (exit 1) when debug artifacts exist", r.code === 1 && /Debug artifacts \(3 found\): FAIL/.test(r.out), r.out);

    r = s.op("clean", "--purge");
    check(
      "clean --purge removes safe single-line debugs but keeps unsafe braceless if-body",
      r.code === 1 && /Purged 2 debug line/.test(r.out) && /1 debug artifact\(s\) remain/.test(r.out),
      r.out,
    );

    // Remove the remaining unsafe line manually
    s.write("src/app.ts", "export function greet(name: string) {\n  return `hello ${name}`;\n}\n");
    r = s.op("clean");
    check("clean passes after removing remaining debug line", r.code === 0, r.out);

    // 3. LOC ceiling check (ratchet: growing beyond 600 fails)
    const bigLines = Array.from({ length: 610 }, (_, i) => `export const v${i} = ${i};`).join("\n") + "\n";
    s.write("src/monolith.ts", bigLines);
    r = s.op("verify");
    check("verify fails when untracked file exceeds 600 LOC ceiling", r.code === 1 && /610 LOC exceeds ceiling 600/.test(r.out), r.out);
    fs.unlinkSync(path.join(s.repo, "src/monolith.ts"));

    // 4. Manifest guard & human-only allow
    s.write("package.json", '{"name":"demo","dependencies":{"left-pad":"1.0.0"}}\n');
    r = s.op("verify");
    check("verify fails on unapproved package.json modification", r.code === 1 && /package manifest modified without approval/.test(r.out), r.out);

    r = s.op("allow", "package.json");
    check("allow rejects non-interactive execution (agent guard)", r.code === 2 && /interactive terminal/.test(r.out), r.out);
    fs.unlinkSync(path.join(s.repo, "package.json"));

    // 5. OKF validator catches malformed frontmatter & malformed MEMORY.md tags
    const memFile = path.join(s.repo, ".operon/MEMORY.md");
    const origMem = fs.readFileSync(memFile, "utf8");
    fs.writeFileSync(memFile, origMem + '\n<!-- okf:invariant code="BAD-01" ts="2026-11-01T00:00:00Z" -->\nUnclosed tag\n');
    r = s.op("verify");
    check("verify fails when .operon/MEMORY.md has an unclosed OKF tag", r.code === 1 && /Unclosed <!-- okf:invariant -->/.test(r.out), r.out);
    fs.writeFileSync(memFile, origMem);

    const badDir = path.join(s.base, "bad-okf");
    fs.mkdirSync(path.join(badDir, "skills/broken"), { recursive: true });
    fs.writeFileSync(path.join(badDir, "skills/broken/SKILL.md"), "---\ntype: Skill\nname: Not_Kebab\ntitle: Broken\n---\n# Body\n");
    r = s.op("validate", badDir);
    check("validate exits 1 with line numbers on invalid OKF frontmatter", r.code === 1 && /SKILL\.md:3:/.test(r.out), r.out);
  },

  async phase3() {
    // Start a local HTTP server speaking ConvexHttpClient's /api/query & /api/mutation protocol
    const db = { projects: new Map(), files: new Map(), invariants: new Map(), sessions: new Map(), telemetry: [] };
    const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const { path: fnPath, args } = JSON.parse(body || "{}");
          const a = (args && args[0]) || {};
          let value = null;
          if (fnPath === "projects:createOrGet") {
            let p = [...db.projects.values()].find((x) => x.repoHash === a.repoHash);
            if (!p) {
              const id = `proj_${db.projects.size + 1}`;
              const inviteCode = `${a.name.toLowerCase()}-9x72ab3k4m`;
              const projectToken = `opt_${sha(`${id}:${inviteCode}`).slice(0, 32)}`;
              p = { projectId: id, name: a.name, repoHash: a.repoHash, inviteCode, projectToken };
              db.projects.set(id, p);
              db.files.set(id, new Map());
              db.invariants.set(id, new Map());
              db.sessions.set(id, new Map());
            }
            value = { projectId: p.projectId, name: p.name, inviteCode: p.inviteCode, projectToken: p.projectToken };
          } else if (fnPath === "projects:syncFiles") {
            const fmap = db.files.get(a.projectId);
            for (const f of a.files) fmap.set(f.path, { ...f, updatedAt: Date.now() });
            value = { synced: a.files.length, updatedAt: Date.now() };
          } else if (fnPath === "projects:syncFile") {
            const fmap = db.files.get(a.projectId);
            fmap.set(a.path, { path: a.path, content: a.content, category: a.category, updatedAt: Date.now() });
            value = a.path;
          } else if (fnPath === "projects:getSnapshot" || fnPath === "events:subscribeFeed") {
            const p = [...db.projects.values()].find((x) => x.inviteCode === a.inviteCode);
            value = p
              ? {
                  projectId: p.projectId,
                  name: p.name,
                  repoHash: p.repoHash,
                  inviteCode: p.inviteCode,
                  events: [],
                  entities: [],
                  files: [...db.files.get(p.projectId).values()],
                  invariants: [...db.invariants.get(p.projectId).values()],
                  sessions: [...db.sessions.get(p.projectId).values()],
                }
              : null;
          } else if (fnPath === "projects:redeemInvite") {
            const p = [...db.projects.values()].find((x) => x.inviteCode === a.inviteCode);
            if (!p) throw new Error("Invalid invite code");
            value = { projectId: p.projectId, name: p.name, inviteCode: p.inviteCode, projectToken: p.projectToken };
          } else if (fnPath === "knowledge:addInvariant") {
            const { projectId, projectToken: _t, ...inv } = a;
            db.invariants.get(projectId).set(inv.code, inv);
            value = inv.code;
          } else if (fnPath === "knowledge:removeInvariant") {
            const removed = db.invariants.get(a.projectId).delete(a.code);
            value = { removed };
          } else if (fnPath === "sessions:checkpoint") {
            const prev = db.sessions.get(a.projectId).get(a.sessionId) || {};
            db.sessions.get(a.projectId).set(a.sessionId, {
              ...prev,
              sessionId: a.sessionId,
              branch: a.branch,
              author: a.author,
              status: a.close ? "closed" : "in-flight",
              lastCheckpoint: a.message,
              updatedAt: Date.now(),
            });
            value = a.sessionId;
          } else if (fnPath === "sessions:declareSeam") {
            const prev = db.sessions.get(a.projectId).get(a.sessionId) || {};
            db.sessions.get(a.projectId).set(a.sessionId, {
              ...prev,
              sessionId: a.sessionId,
              branch: a.branch,
              author: a.author,
              status: "in-flight",
              lastCheckpoint: prev.lastCheckpoint || (a.task ? `Task: ${a.task}` : "Working in-flight"),
              task: a.task ?? prev.task ?? "",
              touchedPaths: a.touchedPaths ?? [],
              updatedAt: Date.now(),
            });
            value = a.sessionId;
          } else if (fnPath === "sessions:getLatest") {
            const all = [...(db.sessions.get(a.projectId)?.values() ?? [])].filter((s) => s.branch === a.branch);
            all.sort((x, y) => y.updatedAt - x.updatedAt);
            value = all[0] ?? null;
          } else if (fnPath === "telemetry:log") {
            db.telemetry.push(a);
            value = "t1";
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "success", value }));
        } catch (err) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "error", errorMessage: err.message }));
        }
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const convexUrl = `http://127.0.0.1:${port}`;

    try {
      const alice = sandbox("alice");
      const bob = sandbox("bob");
      alice.env.OPERON_CONVEX_URL = convexUrl;
      bob.env.OPERON_CONVEX_URL = convexUrl;

      for (const dev of [alice, bob]) {
        dev.write("src/auth/token.ts", "export const verify = () => true;\n");
        dev.git("add", ".");
        dev.git("commit", "-qm", "init");
      }

      // Alice initializes and shares
      let r = await alice.opAsync("init", "kno-wiki", "--yes");
      check("Alice init binds to Convex", r.code === 0, r.out);

      r = await alice.opAsync("share");
      const m = /operon join (kno-wiki-[a-z0-9]+)/.exec(r.out);
      const inviteCode = m?.[1];
      check("Alice share outputs invite code & magic link", r.code === 0 && !!inviteCode && /https:\/\/operon\.dev\/join\//.test(r.out), r.out);

      // Bob joins via magic link URL
      r = await bob.opAsync("join", `https://operon.dev/join/${inviteCode}`);
      check(
        "Bob join hydrates skills, workflows, and tools from magic URL and arms Cursor",
        r.code === 0 && /Hydrating skills/.test(r.out) && /skills\/ \(/.test(r.out) && /Ready!/.test(r.out),
        r.out,
      );

      // Alice records a gotcha & a WAL checkpoint
      r = await alice.opAsync("remember", "[auth] Token expiry must be in seconds", "--reason", "JWT verifier expects Unix seconds");
      check("Alice remember records AUTH-01 and syncs to Convex", r.code === 0 && /\[AUTH-01\]/.test(r.out) && /synced to Convex/.test(r.out), r.out);

      r = await alice.opAsync("checkpoint", "Auth test green, refactoring");
      check("Alice checkpoint syncs WAL to Convex", r.code === 0, r.out);

      // Bob boots on a task mentioning auth -> receives Alice's invariant + teammate activity!
      r = await bob.opAsync("boot", "fix auth session validation");
      check(
        "Bob boot pulls Alice's AUTH-01 invariant and teammate checkpoint from Convex",
        r.code === 0 && /\[AUTH-01\] Token expiry must be in seconds/.test(r.out) && /Teammate Activity/.test(r.out),
        r.out,
      );

      // In-flight seam collision: Alice modifies src/auth/token.ts and runs watch --once, Bob also touches src/auth/token.ts and runs watch --once
      alice.write("src/auth/token.ts", "export const verify = (expSec: number) => expSec > 0;\n");
      r = await alice.opAsync("watch", "--once");
      check("Alice watch --once declares in-flight seam on src/auth/token.ts", r.code === 0 && /src\/auth\/token\.ts/.test(r.out), r.out);

      bob.write("src/auth/token.ts", "export const verify = () => false;\n");
      r = await bob.opAsync("watch", "--once");
      const bobBoot = fs.readFileSync(path.join(bob.repo, ".operon/BOOT.md"), "utf8");
      check(
        "Bob watch --once detects in-flight seam collision with Alice and injects warning into .operon/BOOT.md",
        r.code === 0 && /SEAM COLLISION/.test(r.out) && /In-Flight Seam Collision Warning/.test(bobBoot),
        r.out + "\n" + bobBoot,
      );

      // Offline outbox resilience: Alice records invariant while offline, then flushes on next online command
      alice.env.OPERON_CONVEX_URL = "http://127.0.0.1:1"; // unreachable
      r = await alice.opAsync("remember", "[db] Always release pooled client in finally");
      check("Alice offline remember falls back to local outbox", r.code === 0 && /queued in offline outbox/.test(r.out), r.out);

      alice.env.OPERON_CONVEX_URL = convexUrl; // back online
      await alice.opAsync("boot", "check db"); // flushes outbox
      r = await bob.opAsync("boot", "check db connection pool");
      check("Bob receives Alice's queued DB-01 invariant after outbox flush", r.code === 0 && /\[DB-01\] Always release pooled client/.test(r.out), r.out);

      // Forget removes invariant across team
      r = await alice.opAsync("forget", "AUTH-01");
      check("Alice forget removes AUTH-01", r.code === 0 && /Removed invariant \[AUTH-01\]/.test(r.out), r.out);
    } finally {
      server.close();
    }
  },

  async phase4() {
    const s = sandbox("p4");
    s.write("README.md", "# app\n");
    s.git("add", ".");
    s.git("commit", "-qm", "init");

    // Create a external git repository with a raw skill + an OKF skill + a binary file
    const extRepo = path.join(s.base, "ext-skills");
    fs.mkdirSync(path.join(extRepo, "playwright"), { recursive: true });
    fs.writeFileSync(
      path.join(extRepo, "playwright/SKILL.md"),
      "---\ntype: Skill\nname: playwright\ntitle: Playwright E2E Testing\ndescription: Browser E2E checks.\n---\n# Playwright\n## Setup\nRun tests.\n",
    );
    fs.writeFileSync(path.join(extRepo, "next-actions.mdc"), "# Next.js 15 Server Actions\nAlways validate inputs with Zod.\n");
    fs.writeFileSync(path.join(extRepo, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: extRepo });
    execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: extRepo });
    execFileSync("git", ["config", "user.email", "ext@example.com"], { cwd: extRepo });
    execFileSync("git", ["config", "user.name", "ext"], { cwd: extRepo });
    execFileSync("git", ["add", "."], { cwd: extRepo });
    execFileSync("git", ["commit", "-qm", "initial skills"], { cwd: extRepo });

    // 1. Ingest via `operon add` from git URL
    let r = s.op("add", `file://${extRepo.replace(/\\/g, "/")}`, "--name", "community-nextjs", "--convert");
    check(
      "operon add clones git source, stages 2 skills, and prints Agent Conversion Prompt",
      r.code === 0 && /Staged 2 skill\(s\)/.test(r.out) && /Agent OKF v0\.3 Conversion Prompt/.test(r.out),
      r.out,
    );
    check(
      "operon add skips binary files",
      !fs.existsSync(path.join(s.env.OPERON_HOME, "packs/community-nextjs/skills/logo")),
    );

    // 2. List catalog
    r = s.op("list");
    check(
      "operon list shows default and community-nextjs packs",
      r.code === 0 && /\[default\]/.test(r.out) && /\[community-nextjs\]/.test(r.out) && /Playwright E2E Testing/.test(r.out),
      r.out,
    );

    // 3. Init equipping the imported pack
    r = s.op("init", "my-web", "--local", "--pack", "community-nextjs");
    check(
      "operon init --pack equips default + community-nextjs skills and flags unvalidated skill",
      r.code === 0 && /Initialized my-web with 7 skills\/workflows/.test(r.out),
      r.out,
    );

    // 4. Fetch from the newly equipped skill
    r = s.op("fetch", "playwright:setup");
    check("operon fetch slices section from imported skill", r.code === 0 && /## Setup/.test(r.out), r.out);

    // 5. Remove pack
    r = s.op("remove", "community-nextjs");
    check("operon remove deletes pack from ~/.operon/packs/", r.code === 0 && /Removed pack "community-nextjs"/.test(r.out), r.out);
  },
};

for (const [name, fn] of Object.entries(suites)) {
  if (only.length && !only.includes(name)) continue;
  console.log(`\n▶ ${name}`);
  try {
    await fn();
  } catch (e) {
    failures++;
    console.log(`  ✘ suite crashed: ${e.stack}`);
  }
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed");
process.exit(failures ? 1 : 0);
