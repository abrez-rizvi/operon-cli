import pc from "picocolors";
import { resolveConvexUrl } from "../core/convex-client.js";
import { loadProject, OperonError, requireProject } from "../core/local-store.js";
import { bindAndSyncProject } from "../core/sync.js";
import { initCommand } from "./init.js";

export async function shareCommand(): Promise<number> {
  let project = loadProject();
  if (!project) {
    console.log(pc.cyan("→ Initializing project before sharing..."));
    await initCommand(undefined, { yes: true });
    project = requireProject();
  }
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
