import path from "node:path";
import { confirm, isCancel } from "@clack/prompts";
import pc from "picocolors";
import { OperonError, readPolicy, requireProject } from "../core/local-store.js";
import { toPosix } from "../core/paths.js";
import { isInteractive } from "../core/ui.js";
import { fileHash, isManifest, writeAllowance } from "../tools/diff-guard.js";

/** Human-only approval of a manifest change; bound to the file's current content hash. */
export async function allowCommand(file: string): Promise<number> {
  const project = requireProject();
  if (!isInteractive()) {
    throw new OperonError("`operon allow` must be run by a human in an interactive terminal.");
  }
  const abs = path.resolve(file);
  const rel = toPosix(path.relative(project.root, abs));
  if (rel.startsWith("..")) throw new OperonError(`${file} is outside the repository.`);
  if (!isManifest(rel, readPolicy(project.dir).manifests)) {
    console.log(pc.yellow(`! ${rel} is not a guarded manifest; nothing to allow.`));
    return 0;
  }
  const ok = await confirm({ message: `Approve the current changes to ${rel}?` });
  if (isCancel(ok) || !ok) {
    console.log("Not approved.");
    return 1;
  }
  writeAllowance(project.dir, rel, fileHash(abs));
  console.log(`${pc.green("✔")} Approved ${rel} (any further edit requires re-approval).`);
  return 0;
}
