import path from "node:path";
import { cancel, confirm, isCancel, multiselect, select, text } from "@clack/prompts";
import pc from "picocolors";
import { printBanner } from "../core/banner.js";
import { listEntities } from "../core/entities.js";
import { workspaceRoot } from "../core/git.js";
import { armGlobalHarnesses } from "../core/harness-scanner.js";
import { loadProject, readInvariants, readMemoryCheckpoints } from "../core/local-store.js";
import { copyEntity, ensureDefaultPack, getAllPackItems } from "../core/packs.js";
import { isInteractive } from "../core/ui.js";
import { addCommand } from "./add.js";
import { initCommand } from "./init.js";
import { joinCommand } from "./join.js";
import { shareCommand } from "./share.js";
import { syncCommand } from "./sync-cmd.js";
import { verifyCommand } from "./verify.js";
import { watchCommand } from "./watch.js";

export function printProjectStatus(cwd = process.cwd()): void {
  const project = loadProject(cwd);
  if (!project) {
    console.log(`Folder:  ${pc.bold(path.basename(workspaceRoot(cwd)))} ${pc.dim("(not initialized — run `operon` or `operon share`)")}`);
    return;
  }
  const invariants = readInvariants(project.dir);
  const checkpoints = readMemoryCheckpoints(project.dir);
  const entities = listEntities(project.dir);
  const skills = entities.filter((e) => e.kind === "skill").map((e) => e.name);
  const workflows = entities.filter((e) => e.kind === "workflow").map((e) => e.name);
  const invite = project.config.cloud?.inviteCode;

  console.log(`Project:     ${pc.bold(project.config.name)} ${pc.dim(`(${project.dir})`)}`);
  console.log(`Invite:      ${invite ? pc.cyan(`operon join ${invite}`) : pc.dim("local only (run `operon share` to generate)")}`);
  console.log(`Memory:      ${pc.bold(String(invariants.length))} invariant(s), ${pc.bold(String(checkpoints.length))} checkpoint(s) in ${pc.dim(".operon/MEMORY.md")}`);
  console.log(`Skills:      ${skills.join(", ") || "none"}`);
  console.log(`Workflows:   ${workflows.join(", ") || "none"}`);
}

export async function statusCommand(): Promise<number> {
  printProjectStatus();
  return 0;
}

/** Smooth single-entry guided flow when the user runs `operon` with no arguments. */
export async function guidedCommand(): Promise<number> {
  await printBanner();

  // Quietly ensure global editor hooks & default pack exist
  armGlobalHarnesses();
  ensureDefaultPack();

  const root = workspaceRoot();
  const folderName = path.basename(root);
  const existing = loadProject(root);

  if (!isInteractive()) {
    printProjectStatus(root);
    return 0;
  }

  if (!existing) {
    const action = await select({
      message: `Set up ${pc.bold(folderName)}:`,
      options: [
        { value: "share", label: "Initialize & share this project", hint: "creates .operon/ + invite code" },
        { value: "join", label: "Join an existing project", hint: "enter invite code" },
        { value: "init-local", label: "Initialize local only", hint: "creates .operon/ offline" },
        { value: "add", label: "Import skills from GitHub or folder" },
      ],
    });
    if (isCancel(action)) {
      cancel("Cancelled.");
      return 0;
    }
    if (action === "share") return await shareCommand();
    if (action === "init-local") return await initCommand(undefined, { local: true });
    if (action === "join") {
      const code = await text({
        message: "Invite code or URL:",
        placeholder: "project-name-xxxxxxxxxx",
      });
      if (isCancel(code) || !code.trim()) {
        cancel("Cancelled.");
        return 0;
      }
      return await joinCommand(code.trim());
    }
    if (action === "add") {
      const src = await text({
        message: "GitHub URL or local folder:",
        placeholder: "https://github.com/owner/repo",
      });
      if (isCancel(src) || !src.trim()) {
        cancel("Cancelled.");
        return 0;
      }
      return await addCommand(src.trim());
    }
    return 0;
  }

  printProjectStatus(root);
  console.log("");
  const action = await select({
    message: "Action:",
    options: [
      { value: "watch", label: "Watch live sync (real-time stream)", hint: "stream checkpoints, invariants & collision alerts" },
      { value: "share", label: "Sync & show invite code", hint: existing.config.cloud?.inviteCode ?? "push to Convex" },
      { value: "pull", label: "Pull latest from Convex", hint: "updates .operon/MEMORY.md & skills" },
      { value: "verify", label: "Verify project & MEMORY.md" },
      { value: "add", label: "Import skills from GitHub or folder" },
      { value: "exit", label: "Exit" },
    ],
  });
  if (isCancel(action) || action === "exit") return 0;
  if (action === "watch") return await watchCommand();
  if (action === "share") return await shareCommand({ yes: true });
  if (action === "pull") return await syncCommand({ pull: true });
  if (action === "verify") return await verifyCommand();
  if (action === "add") {
    const src = await text({
      message: "GitHub URL or local folder:",
      placeholder: "https://github.com/owner/repo",
    });
    if (isCancel(src) || !src.trim()) return 0;
    const addCode = await addCommand(src.trim());
    if (addCode === 0) {
      const equip = await confirm({
        message: "Equip newly imported skills into this project (.operon/)?",
        initialValue: true,
      });
      if (!isCancel(equip) && equip) {
        const allItems = getAllPackItems();
        const options = allItems.map((item) => ({
          value: `${item.pack}:${item.relCopyPath}`,
          label: `[${item.pack}] ${item.title} ${pc.dim(`(${item.displayPath})`)}`,
          hint: item.kind,
        }));
        const selected = await multiselect({
          message: "Select skills to add to .operon/:",
          options,
          required: false,
        });
        if (!isCancel(selected) && selected.length > 0) {
          for (const entry of selected) {
            const idx = entry.indexOf(":");
            if (idx === -1) continue;
            copyEntity(entry.slice(0, idx), entry.slice(idx + 1), existing.dir);
          }
          console.log(pc.green(`✔ Added ${selected.length} item(s) to ${existing.dir}`));
        }
      }
    }
    return 0;
  }
  return 0;
}
