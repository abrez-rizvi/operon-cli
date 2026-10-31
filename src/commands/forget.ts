import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import pc from "picocolors";
import { mutateWithOutbox } from "../core/convex-client.js";
import {
  INVARIANTS_FILE,
  OperonError,
  readInvariants,
  removeInvariantFromMemory,
  requireProject,
} from "../core/local-store.js";
import { pushMemoryFile } from "../core/sync.js";
import { InvariantLedger } from "../types/okf.js";

export async function forgetCommand(codeArg: string): Promise<number> {
  const project = requireProject();
  const code = codeArg.trim().toUpperCase();
  const existing = readInvariants(project.dir);
  if (!existing.some((i) => i.code.toUpperCase() === code)) {
    throw new OperonError(`No invariant with code "${code}".`);
  }

  removeInvariantFromMemory(project.dir, code);
  const yamlFile = path.join(project.dir, INVARIANTS_FILE);
  if (fs.existsSync(yamlFile)) {
    try {
      const ledger = InvariantLedger.parse(YAML.parse(fs.readFileSync(yamlFile, "utf8")) ?? { type: "InvariantLedger" });
      ledger.invariants = ledger.invariants.filter((i) => i.code.toUpperCase() !== code);
      fs.writeFileSync(yamlFile, YAML.stringify(ledger));
    } catch {
      /* ignore */
    }
  }

  if (project.config.cloud) {
    await pushMemoryFile(project);
    await mutateWithOutbox(project, "knowledge:removeInvariant", {
      projectId: project.config.cloud.projectId,
      projectToken: project.config.cloud.projectToken,
      code,
    });
  }
  console.log(`${pc.green("✔")} Removed invariant [${pc.bold(code)}].`);
  return 0;
}
