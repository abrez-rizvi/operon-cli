import pc from "picocolors";
import { readMemoryContent, readPolicy, requireProject } from "../core/local-store.js";
import { parseMemoryFile } from "../core/memory-parser.js";
import { logTelemetry, pushMemoryFile } from "../core/sync.js";
import { scanDebug, type DebugFinding } from "../tools/debug-sanitizer.js";
import { resolveBase, runDiffGuard } from "../tools/diff-guard.js";

export function printDebugFindings(findings: DebugFinding[], max = 15): void {
  for (const f of findings.slice(0, max)) console.log(`    ${f.path}:${f.line}  ${pc.dim(f.text.trim().slice(0, 100))}`);
  if (findings.length > max) console.log(`    …and ${findings.length - max} more`);
}

export async function verifyCommand(): Promise<number> {
  const project = requireProject();
  const base = resolveBase(project);
  const report = runDiffGuard(project, base);
  const debug = scanDebug(project.root, base, readPolicy(project.dir));
  const memParsed = parseMemoryFile(readMemoryContent(project.dir));
  const { files, added, deleted, net } = report.stats;

  console.log(`Operon verify · base ${base.slice(0, 7)} · ${files} file(s) · +${added} / -${deleted} (net ${net >= 0 ? "+" : ""}${net})`);

  const ceilingViolations = report.violations.filter((v) => !report.manifests.some((m) => m.path === v.path));
  const manifestViolations = report.violations.filter((v) => report.manifests.some((m) => m.path === v.path));

  const line = (ok: boolean, label: string) => console.log(`${ok ? pc.green("✔") : pc.red("✘")} ${label}: ${ok ? "PASS" : "FAIL"}`);
  line(!ceilingViolations.length, `LOC ceiling (${report.ceiling})`);
  for (const v of ceilingViolations) console.log(`    ${v.path}: ${v.message}`);
  for (const w of report.warnings) console.log(pc.yellow(`    ! ${w.path}: ${w.message}`));

  line(!manifestViolations.length, `Package manifests (${report.manifests.length} touched)`);
  for (const v of manifestViolations) console.log(`    ${v.path}: ${v.message}`);

  line(!debug.length, `Debug artifacts (${debug.length} found)`);
  if (debug.length) {
    printDebugFindings(debug);
    console.log("    → run `operon clean --purge`, then remove any remaining lines manually");
  }

  line(!memParsed.errors.length, `OKF memory tags (.operon/MEMORY.md · ${memParsed.invariants.length} invariant(s), ${memParsed.checkpoints.length} checkpoint(s))`);
  for (const err of memParsed.errors) {
    console.log(`    .operon/MEMORY.md:${err.line}: ${err.message}`);
  }

  const failed = report.violations.length > 0 || debug.length > 0 || memParsed.errors.length > 0;
  if (!failed && project.config.cloud) {
    await pushMemoryFile(project);
  }
  console.log(failed ? pc.red("RESULT: FAIL (exit 1) — fix the violations above and re-run `operon verify`") : pc.green("RESULT: PASS"));
  const code = failed ? 1 : 0;
  await logTelemetry(project, { command: "verify", exitCode: code, locDelta: net });
  return code;
}
