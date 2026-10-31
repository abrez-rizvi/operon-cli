import pc from "picocolors";
import { api, createClient, resolveConvexUrl } from "../core/convex-client.js";
import { armLocalHarnesses } from "../core/harness-scanner.js";
import { remoteUrl } from "../core/git.js";
import {
  INVARIANTS_FILE,
  loadProject,
  OperonError,
  projectDirFor,
  projectKey,
  requireRepo,
  saveConfig,
  writeInvariants,
  writeProjectFile,
} from "../core/local-store.js";
import { seedProjectBasics } from "../core/packs.js";
import { printArmResults } from "../core/ui.js";

/** Accepts a bare code (`acme-core-9x72ab3k4m`) or a magic URL (`https://.../join/<code>`). */
export function parseInviteInput(codeOrUrl: string): string {
  const trimmed = codeOrUrl.trim().replace(/\/+$/, "");
  const m = /\/join\/([^/?#]+)$/i.exec(trimmed);
  return m ? m[1] : trimmed;
}

export async function joinCommand(codeOrUrl: string): Promise<number> {
  const root = requireRepo();
  const existing = loadProject(root);
  const url = resolveConvexUrl(existing);
  if (!url) {
    throw new OperonError(
      "No Convex deployment URL configured. Set `OPERON_CONVEX_URL=https://<your-deployment>.convex.cloud` and re-run `operon join`.",
    );
  }
  const inviteCode = parseInviteInput(codeOrUrl);
  const client = createClient(url, 4000);
  const snap = await client.query(api.projects.getSnapshot, { inviteCode });
  if (!snap) throw new OperonError(`No Convex workspace found for invite code "${inviteCode}".`);

  const redeemed = await client.mutation(api.projects.redeemInvite, { inviteCode });
  const key = projectKey(root);
  const dir = projectDirFor(key);

  console.log(`${pc.green("✔")} Connecting to Convex workspace [${pc.bold(snap.name)}]…`);
  console.log(`${pc.green("✔")} Hydrating skills, knowledge, workflows, and deterministic tools to disk…`);

  seedProjectBasics(dir);
  const byCategory: Record<string, Set<string>> = { skill: new Set(), knowledge: new Set(), workflow: new Set(), tool: new Set() };
  for (const f of snap.files) {
    if (f.path === INVARIANTS_FILE) continue;
    writeProjectFile(dir, f.path, f.content);
    const item = f.path.split("/")[1]?.replace(/\.[^.]+$/, "") ?? f.path;
    byCategory[f.category]?.add(item);
  }
  writeInvariants(dir, snap.invariants);
  if (snap.invariants.length) byCategory.knowledge.add("invariants");

  for (const [cat, dirName] of [
    ["skill", "skills/"],
    ["knowledge", "knowledge/"],
    ["workflow", "workflows/"],
    ["tool", "tools/"],
  ] as const) {
    const names = [...byCategory[cat]];
    if (names.length) console.log(`  - ${dirName} (${names.join(", ")})`);
  }

  saveConfig(dir, {
    version: 1,
    name: snap.name,
    key,
    repoRoot: root,
    remote: remoteUrl(root),
    createdAt: existing?.config.createdAt ?? Date.now(),
    lastPullAt: Date.now(),
    cloud: {
      url,
      projectId: redeemed.projectId,
      inviteCode: redeemed.inviteCode,
      projectToken: redeemed.projectToken,
    },
  });

  const armed = armLocalHarnesses(root);
  if (armed.length) {
    console.log(`${pc.green("✔")} Auto-arming detected AI editors: ${armed.map((a) => a.name).join(", ")}.`);
  }
  console.log(`${pc.green("✔")} Ready! Just prompt your agent with "operon <task>" to begin.`);
  return 0;
}
