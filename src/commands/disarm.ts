import pc from "picocolors";
import { workspaceRoot } from "../core/git.js";
import {
  disarmGlobalHarnesses,
  disarmLocalHarnesses,
  disarmPath,
  type DisarmResult,
} from "../core/harness-scanner.js";
import { printDisarmResults } from "../core/ui.js";

export interface DisarmOptions {
  global?: boolean;
  local?: boolean;
  all?: boolean;
}

export async function disarmCommand(target?: string, opts: DisarmOptions = {}): Promise<number> {
  if (target) {
    const res = disarmPath(target);
    if (res.status === "not_found") {
      console.error(pc.red(`operon: file not found "${target}"`));
      return 1;
    }
    if (res.status === "unchanged") {
      console.log(pc.yellow(`! No Operon instructions found in ${pc.bold(res.file)}.`));
      return 0;
    }
    if (res.status === "removed") {
      console.log(`${pc.green("✔")} Removed ${pc.bold(res.file)} (contained only Operon instructions).`);
      return 0;
    }
    console.log(`${pc.green("✔")} Disarmed ${pc.bold(res.file)} (removed Operon instructions, preserved other content).`);
    return 0;
  }

  const root = workspaceRoot();
  const isGlobalOnly = opts.global && !opts.all && !opts.local;
  const isLocalOnly = opts.local && !opts.all && !opts.global;

  const scopeLabel = isGlobalOnly ? "global" : isLocalOnly ? "local workspace" : "local & global";
  console.log(`Scanning and disarming ${scopeLabel} AI agent files…`);

  const results: DisarmResult[] = [];
  if (!isGlobalOnly) {
    results.push(...disarmLocalHarnesses(root));
  }
  if (!isLocalOnly) {
    results.push(...disarmGlobalHarnesses());
  }

  printDisarmResults(results);

  const count = results.filter((r) => r.status === "disarmed" || r.status === "removed").length;
  if (count > 0) {
    console.log(`\n${pc.green("✔")} Operon instructions removed from ${pc.bold(String(count))} agent file(s).`);
  } else {
    console.log(`\n${pc.dim("No active Operon instructions found across scanned agent files.")}`);
  }
  return 0;
}
