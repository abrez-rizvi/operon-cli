import { isCancel, select, text } from "@clack/prompts";
import pc from "picocolors";
import { armGlobalHarnesses } from "../core/harness-scanner.js";
import { ensureDefaultPack } from "../core/packs.js";
import { isInteractive, operonOnPath, printArmResults } from "../core/ui.js";
import { addCommand } from "./add.js";

export async function setupCommand(opts: { yes?: boolean } = {}): Promise<number> {
  console.log(pc.bold("Operon Setup"));
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
  }

  if (!operonOnPath()) {
    console.log(pc.yellow("! `operon` is not on your PATH. Install globally: npm install -g operon-cli"));
  }
  return 0;
}
