import pc from "picocolors";
import { listEntities } from "../core/entities.js";
import { loadProject } from "../core/local-store.js";
import { ensureDefaultPack, listPackItems, listPacks, packDir } from "../core/packs.js";

export async function listCommand(): Promise<number> {
  ensureDefaultPack();
  const packs = listPacks();
  console.log(pc.bold(`Operon Pack Library (${packs.length} pack${packs.length === 1 ? "" : "s"})`));
  for (const name of packs) {
    const items = listPackItems(name);
    console.log(`\n  ${pc.cyan(`[${name}]`)} ${pc.dim(packDir(name))}`);
    if (!items.length) {
      console.log(pc.dim("    (empty)"));
      continue;
    }
    for (const item of items) {
      console.log(`    • ${pc.bold(item.title)} ${pc.dim(`(${item.kind}: ${item.name} · ${item.displayPath})`)}`);
    }
  }

  const project = loadProject();
  if (project) {
    const equipped = listEntities(project.dir);
    console.log(`\n${pc.bold(`Active Project: ${project.config.name}`)} ${pc.dim(project.dir)}`);
    if (!equipped.length) console.log(pc.dim("  (no skills/workflows equipped)"));
    for (const e of equipped) {
      console.log(`  ✔ ${e.title} ${pc.dim(`(${e.kind}: ${e.name})`)}`);
    }
  }
  return 0;
}
