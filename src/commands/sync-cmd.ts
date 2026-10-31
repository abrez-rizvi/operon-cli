import pc from "picocolors";
import { resolveConvexUrl } from "../core/convex-client.js";
import { OperonError, requireProject } from "../core/local-store.js";
import { bindAndSyncProject, pullLatest } from "../core/sync.js";

export async function syncCommand(opts: { pull?: boolean }): Promise<number> {
  const project = requireProject();
  const url = resolveConvexUrl(project);
  if (!url) {
    throw new OperonError("No Convex deployment URL configured. Set `OPERON_CONVEX_URL` or run `operon share`.");
  }
  if (opts.pull) {
    const res = await pullLatest(project, 4000);
    if (res === "offline") throw new OperonError("Could not reach Convex deployment.");
    console.log(`${pc.green("✔")} Pulled latest snapshot & invariants from Convex.`);
    return 0;
  }
  const cloud = await bindAndSyncProject(project, url);
  console.log(`${pc.green("✔")} Synced local skills, workflows, knowledge, and policy to Convex [${cloud.inviteCode}].`);
  return 0;
}
