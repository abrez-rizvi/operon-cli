import pc from "picocolors";
import { resolveConvexUrl } from "../core/convex-client.js";
import { OperonError, requireProject } from "../core/local-store.js";
import { bindAndSyncProject } from "../core/sync.js";

export async function shareCommand(): Promise<number> {
  const project = requireProject();
  const url = resolveConvexUrl(project);
  if (!url) {
    throw new OperonError(
      "No Convex deployment URL configured. Set `OPERON_CONVEX_URL=https://<your-deployment>.convex.cloud` and re-run `operon share`.",
    );
  }
  const cloud = await bindAndSyncProject(project, url);
  console.log(`${pc.green("✔")} Project synced to Convex [Workspace: ${pc.bold(project.config.name)}]`);
  console.log("Share this command with your team:");
  console.log(`  ${pc.cyan(`operon join ${cloud.inviteCode}`)}`);
  console.log("Or share the direct link:");
  console.log(`  ${pc.underline(`https://operon.dev/join/${cloud.inviteCode}`)}`);
  return 0;
}
