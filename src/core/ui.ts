import { execFileSync } from "node:child_process";
import pc from "picocolors";
import type { ArmResult } from "./harness-scanner.js";

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
