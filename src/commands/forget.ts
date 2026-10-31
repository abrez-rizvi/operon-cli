import pc from "picocolors";
import { mutateWithOutbox } from "../core/convex-client.js";
import { OperonError, readInvariants, requireProject, writeInvariants } from "../core/local-store.js";

export async function forgetCommand(codeArg: string): Promise<number> {
  const project = requireProject();
  const code = codeArg.trim().toUpperCase();
  const existing = readInvariants(project.dir);
  const filtered = existing.filter((i) => i.code.toUpperCase() !== code);
  if (filtered.length === existing.length) {
    throw new OperonError(`No invariant with code "${code}".`);
  }
  writeInvariants(project.dir, filtered);

  if (project.config.cloud) {
    await mutateWithOutbox(project, "knowledge:removeInvariant", {
      projectId: project.config.cloud.projectId,
      projectToken: project.config.cloud.projectToken,
      code,
    });
  }
  console.log(`${pc.green("✔")} Removed invariant [${pc.bold(code)}].`);
  return 0;
}
