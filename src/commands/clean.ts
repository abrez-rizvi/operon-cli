import pc from "picocolors";
import { readPolicy, requireProject } from "../core/local-store.js";
import { logTelemetry } from "../core/sync.js";
import { purgeDebug, scanDebug } from "../tools/debug-sanitizer.js";
import { resolveBase } from "../tools/diff-guard.js";
import { printDebugFindings } from "./verify.js";

export async function cleanCommand(opts: { purge?: boolean }): Promise<number> {
  const project = requireProject();
  const base = resolveBase(project);
  const policy = readPolicy(project.dir);
  let findings = scanDebug(project.root, base, policy);

  if (opts.purge && findings.length) {
    const removed = purgeDebug(project.root, findings);
    if (removed.length) {
      console.log(`${pc.green("✔")} Purged ${removed.length} debug line(s):`);
      printDebugFindings(removed);
    }
    findings = scanDebug(project.root, base, policy);
  }

  if (!findings.length) {
    console.log(`${pc.green("✔")} No temporary debug artifacts in the diff.`);
  } else {
    console.log(`${pc.red("✘")} ${findings.length} debug artifact(s) remain${opts.purge ? " (not safe to auto-remove)" : ""}:`);
    printDebugFindings(findings);
    console.log(opts.purge ? "    → remove these manually, then re-run `operon clean`" : "    → run `operon clean --purge` or remove them manually");
  }
  const code = findings.length ? 1 : 0;
  await logTelemetry(project, { command: "clean", exitCode: code, locDelta: 0 });
  return code;
}
