import { isCancel, select, text } from "@clack/prompts";
import pc from "picocolors";
import { DEMO_CONVEX_URL, resolveConvexUrl } from "../core/convex-client.js";
import { loadProject, OperonError } from "../core/local-store.js";
import { bindAndSyncProject } from "../core/sync.js";
import { isInteractive } from "../core/ui.js";
import { readUserGlobalConfig, writeUserGlobalConfig } from "../core/user-config.js";
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
  let url = resolveConvexUrl(project);
  if (!url) {
    if (isInteractive()) {
      const choice = await select({
        message: "No Convex deployment configured. Select a cloud backend to share:",
        options: [
          {
            value: "demo",
            label: "(1) Connect to Community Demo Cloud",
            hint: "Instantly sync to the public demo backend to test team sharing",
          },
          {
            value: "custom",
            label: "(2) Enter a custom Convex Deployment URL",
            hint: "e.g. https://my-team.convex.cloud",
          },
          {
            value: "skip",
            label: "(3) Keep local-only for now",
            hint: "Project remains fully functional locally without cloud sync",
          },
        ],
      });
      if (isCancel(choice) || choice === "skip") {
        console.log(pc.yellow("Project initialized in local-only mode. Run `operon share` when ready to sync."));
        return 0;
      }
      if (choice === "demo") {
        url = DEMO_CONVEX_URL;
        writeUserGlobalConfig({ ...readUserGlobalConfig(), convexUrl: DEMO_CONVEX_URL });
        console.log(`${pc.green("✔")} Configured Community Demo Cloud (${pc.cyan(DEMO_CONVEX_URL)})`);
      } else if (choice === "custom") {
        const input = await text({
          message: "Enter your Convex Deployment URL:",
          placeholder: "https://my-team.convex.cloud",
        });
        if (isCancel(input) || !input.trim()) {
          console.log(pc.yellow("Cancelled. Project kept in local-only mode."));
          return 0;
        }
        url = input.trim();
        writeUserGlobalConfig({ ...readUserGlobalConfig(), convexUrl: url });
        console.log(`${pc.green("✔")} Saved Convex URL in ~/.operon/config.json`);
      }
    } else if (opts.yes) {
      url = DEMO_CONVEX_URL;
    } else {
      throw new OperonError(
        "No Convex deployment URL configured. Set `OPERON_CONVEX_URL=https://<your-deployment>.convex.cloud` and re-run `operon share`.",
      );
    }
  }
  if (!url) return 1;
  const cloud = await bindAndSyncProject(project, url);
  console.log(`${pc.green("✔")} Project synced to Convex [Workspace: ${pc.bold(project.config.name)}]`);
  console.log("Share this command with your team:");
  console.log(`  ${pc.cyan(`operon join ${cloud.inviteCode}`)}`);
  console.log("Or share the direct link:");
  console.log(`  ${pc.underline(`https://operon.dev/join/${cloud.inviteCode}`)}`);
  console.log(`Open a live sync stream in your terminal: ${pc.cyan("operon watch")}`);
  return 0;
}
