import pc from "picocolors";
import { resolveConvexUrl } from "../core/convex-client.js";
import { loadProject, OperonError, requireProject } from "../core/local-store.js";
import { bindAndSyncProject } from "../core/sync.js";
import { initCommand } from "./init.js";

export interface ShareOptions {
  yes?: boolean;
  skillsRepo?: string;
}

export async function shareCommand(opts: ShareOptions = {}): Promise<number> {
  let project = loadProject();
  if (!project) {
    console.log(pc.cyan("→ Initializing project before sharing..."));
    const code = await initCommand(undefined, { yes: opts.yes, skillsRepo: opts.skillsRepo });
    if (code !== 0) return code;
    project = loadProject();
    if (!project) return 1;
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
  console.log(`Open a live sync stream in your terminal: ${pc.cyan("operon watch")}`);
  return 0;
}
