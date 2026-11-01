import { isCancel, select, text } from "@clack/prompts";
import pc from "picocolors";
import { DEMO_CONVEX_URL } from "../core/convex-client.js";
import { armGlobalHarnesses } from "../core/harness-scanner.js";
import { ensureDefaultPack } from "../core/packs.js";
import { isInteractive, operonOnPath, printArmResults } from "../core/ui.js";
import { clearUserGlobalConfig, readUserGlobalConfig, writeUserGlobalConfig, type UserGlobalConfig } from "../core/user-config.js";
import { addCommand } from "./add.js";

export interface SetupOptions {
  yes?: boolean;
  reset?: boolean;
}

export async function setupCommand(opts: SetupOptions = {}): Promise<number> {
  console.log(pc.bold("Operon Setup"));

  if (opts.reset) {
    clearUserGlobalConfig();
    console.log(`${pc.green("✔")} Cleared user-global cloud credentials (~/.operon/config.json).`);
  }

  console.log("Scanning for installed AI coding harnesses (global configs)…");
  printArmResults(armGlobalHarnesses());
  console.log(pc.dim("  Cursor / Copilot are armed per-project by `operon init` / `operon join`."));

  const pack = ensureDefaultPack();
  console.log(`${pc.green("✔")} Pack library ready: ${pc.dim(pack)}`);

  if (isInteractive() && !opts.yes) {
    const choice = await select({
      message: "How would you like to initialize your local pack library?",
      options: [
        {
          value: "starter",
          label: "(1) Standard Starter Pack only",
          hint: "Installs default TDD, systematic-debugging, and lean-diff into `default/`",
        },
        {
          value: "custom",
          label: "(2) Import a custom pack from a GitHub repository URL or local directory",
        },
      ],
    });
    if (!isCancel(choice) && choice === "custom") {
      const src = await text({
        message: "GitHub URL or local directory path:",
        placeholder: "https://github.com/anthropics/claude-code-skills",
      });
      if (!isCancel(src) && src.trim()) {
        await addCommand(src.trim());
      }
    }

    const cloudChoice = await select({
      message: "Cloud Endpoints & Knowledge Tier (Convex & Meko / YugabyteDB):",
      options: [
        {
          value: "local",
          label: "(1) Pure Local-First (Recommended)",
          hint: "All playbooks and deterministic quality gates run locally; zero cloud setup needed",
        },
        {
          value: "demo",
          label: "(2) Community Demo Cloud",
          hint: "Test multi-agent team sync via public demo Convex backend",
        },
        {
          value: "custom",
          label: "(3) Connect your own Convex & Meko / YugabyteDB endpoints",
          hint: "Configure your own private Convex URL and/or Meko API token",
        },
      ],
    });

    if (!isCancel(cloudChoice)) {
      if (cloudChoice === "demo") {
        writeUserGlobalConfig({ convexUrl: DEMO_CONVEX_URL });
        console.log(`${pc.green("✔")} Connected to Community Demo Cloud (${pc.cyan(DEMO_CONVEX_URL)})`);
      } else if (cloudChoice === "custom") {
        const existing = readUserGlobalConfig();
        const convexUrlInput = await text({
          message: "Convex Deployment URL (leave empty to keep local-only):",
          placeholder: "https://my-team.convex.cloud",
          initialValue: existing.convexUrl ?? "",
        });
        const mekoTokenInput = await text({
          message: "Meko API Token (mko_tkn_... · leave empty to skip semantic memory):",
          placeholder: "mko_tkn_...",
          initialValue: existing.mekoToken ?? "",
        });
        const mekoDatapackInput = await text({
          message: "Meko Datapack ID (optional UUID · leave empty for default):",
          placeholder: "e.g. 3e4a6d90-6b3c-...",
          initialValue: existing.mekoDatapackId ?? "",
        });

        const newCfg: UserGlobalConfig = {};
        if (!isCancel(convexUrlInput) && convexUrlInput.trim()) newCfg.convexUrl = convexUrlInput.trim();
        if (!isCancel(mekoTokenInput) && mekoTokenInput.trim()) newCfg.mekoToken = mekoTokenInput.trim();
        if (!isCancel(mekoDatapackInput) && mekoDatapackInput.trim()) newCfg.mekoDatapackId = mekoDatapackInput.trim();

        writeUserGlobalConfig(newCfg);
        console.log(`${pc.green("✔")} Saved cloud endpoints in ~/.operon/config.json`);
      } else if (cloudChoice === "local") {
        clearUserGlobalConfig();
        console.log(`${pc.green("✔")} Set to Pure Local-First. Zero cloud endpoints configured.`);
      }
    }
  }

  if (!operonOnPath()) {
    console.log(pc.yellow("! `operon` is not on your PATH. Install globally: npm install -g operon-cli"));
  }
  return 0;
}
