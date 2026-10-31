import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { loadProject, OperonError } from "../core/local-store.js";
import { validateOkf } from "../tools/okf-validator.js";

export async function validateCommand(target?: string): Promise<number> {
  const root = target ? path.resolve(target) : (loadProject()?.dir ?? process.cwd());
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new OperonError(`Not a directory: ${root}`);
  const { issues, checked } = validateOkf(root);
  for (const i of issues) console.log(`${i.file}:${i.line}: ${i.message}`);
  if (issues.length) {
    console.log(pc.red(`✘ ${issues.length} OKF v0.3 issue(s) in ${checked} document(s) under ${root}`));
    return 1;
  }
  console.log(`${pc.green("✔")} ${checked} document(s) are 100% OKF v0.3 compliant ${pc.dim(root)}`);
  return 0;
}
