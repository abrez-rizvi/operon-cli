import { execFileSync } from "node:child_process";
import pc from "picocolors";
import type { ArmResult, DisarmResult } from "./harness-scanner.js";

export function printArmResults(results: ArmResult[], log: (s: string) => void = console.log): void {
  if (!results.length) {
    log(pc.dim("  (no matching AI harnesses detected)"));
    return;
  }
  for (const r of results) {
    const icon = r.status === "skipped" ? pc.yellow("!") : pc.green("✔");
    log(`  ${icon} ${r.name}: ${r.status} ${pc.dim(r.file)}${r.note ? pc.yellow(` — ${r.note}`) : ""}`);
  }
}

export function printDisarmResults(results: DisarmResult[], log: (s: string) => void = console.log): void {
  const acted = results.filter((r) => r.status === "disarmed" || r.status === "removed");
  if (!acted.length) {
    const unchanged = results.filter((r) => r.status === "unchanged");
    if (unchanged.length) {
      log(pc.dim(`  No Operon instructions found in ${unchanged.length} scanned agent file(s).`));
    } else {
      log(pc.dim("  (no matching AI agent files found)"));
    }
    return;
  }
  for (const r of results) {
    if (r.status === "disarmed") {
      log(`  ${pc.green("✔")} ${r.name}: ${pc.cyan("disarmed")} ${pc.dim(r.file)}${r.note ? pc.dim(` (${r.note})`) : ""}`);
    } else if (r.status === "removed") {
      log(`  ${pc.green("✔")} ${r.name}: ${pc.yellow("removed")} ${pc.dim(r.file)}${r.note ? pc.dim(` (${r.note})`) : ""}`);
    } else if (r.status === "unchanged") {
      log(`  ${pc.dim("•")} ${r.name}: ${pc.dim("unchanged")} ${pc.dim(r.file)}`);
    } else if (r.status === "not_found") {
      log(`  ${pc.yellow("!")} ${r.name}: ${pc.dim("not found")} ${pc.dim(r.file)}`);
    }
  }
}

/** True when `operon` resolves on PATH. */
export function operonOnPath(): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", ["operon"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export const isInteractive = () => !!process.stdin.isTTY && !!process.stdout.isTTY && !process.env.CI;
