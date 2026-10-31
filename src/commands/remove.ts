import fs from "node:fs";
import pc from "picocolors";
import { OperonError } from "../core/local-store.js";
import { packDir, toSlug } from "../core/packs.js";

export async function removeCommand(nameArg: string): Promise<number> {
  const name = toSlug(nameArg);
  const dir = packDir(name);
  if (!fs.existsSync(dir)) {
    throw new OperonError(`Pack "${name}" does not exist in ~/.operon/packs/.`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${pc.green("✔")} Removed pack "${name}" ${pc.dim(dir)}`);
  return 0;
}
