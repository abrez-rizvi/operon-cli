import { cac } from "cac";
import pc from "picocolors";
import { addCommand } from "./commands/add.js";
import { allowCommand } from "./commands/allow.js";
import { bootCommand } from "./commands/boot.js";
import { checkpointCommand } from "./commands/checkpoint.js";
import { cleanCommand } from "./commands/clean.js";
import { fetchCommand } from "./commands/fetch.js";
import { forgetCommand } from "./commands/forget.js";
import { initCommand } from "./commands/init.js";
import { joinCommand } from "./commands/join.js";
import { listCommand } from "./commands/list.js";
import { rememberCommand } from "./commands/remember.js";
import { removeCommand } from "./commands/remove.js";
import { setupCommand } from "./commands/setup.js";
import { shareCommand } from "./commands/share.js";
import { syncCommand } from "./commands/sync-cmd.js";
import { validateCommand } from "./commands/validate.js";
import { verifyCommand } from "./commands/verify.js";
import { OperonError } from "./core/local-store.js";

/**
 * Exit codes: 0 = pass, 1 = violations the agent must fix, 2 = environment/usage error.
 */
type Handler<A extends unknown[]> = (...args: A) => Promise<number>;

function run<A extends unknown[]>(fn: Handler<A>) {
  return async (...args: A) => {
    try {
      process.exitCode = await fn(...args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(pc.red(`operon: ${msg}`));
      if (process.env.OPERON_DEBUG && err instanceof Error) console.error(err.stack); // operon-ignore
      process.exitCode = err instanceof OperonError ? err.exitCode : 2;
    }
  };
}

const cli = cac("operon");

// Human lifecycle
cli
  .command("setup", "Scan installed AI harnesses, arm global trampolines, seed the pack library")
  .option("-y, --yes", "Accept defaults without interactive prompts")
  .action(run(setupCommand));

cli
  .command("add <source>", "Import skills from a GitHub URL or local directory into ~/.operon/packs/")
  .option("--name <pack>", "Assign pack name directly")
  .option("--convert", "Print Agent OKF v0.3 conversion prompt after staging")
  .option("--raw", "Keep raw markdown without conversion prompt")
  .option("-f, --force", "Overwrite existing pack with the same name")
  .action(run(addCommand));

cli.command("list", "Display installed skill packs and active project playbooks").action(run(listCommand));
cli.command("remove <pack>", "Delete a skill pack from ~/.operon/packs/").action(run(removeCommand));

cli
  .command("init [name]", "Initialize Operon for the current repository")
  .option("--local", "Local-only (no Convex cloud binding)")
  .option("--pack <name>", "Also equip an additional pack in non-interactive mode")
  .option("-y, --yes", "Accept defaults without prompts")
  .action(run(initCommand));

cli.command("share", "Sync project to Convex and generate a team invite code / magic link").action(run(shareCommand));
cli
  .command("join <codeOrUrl>", "Hydrate project folders from Convex and arm local harnesses")
  .action(run(joinCommand));
cli
  .command("sync", "Push local playbooks/invariants to Convex (or pull with --pull)")
  .option("--pull", "Pull latest snapshot and invariants from Convex")
  .action(run(syncCommand));

// Agent lifecycle
cli.command("boot <prompt>", "Agent entry: workflow, spatial invariants, and session state").action(run(bootCommand));
cli.command("fetch <entity>", "Slice a skill/knowledge section: <entity>[:<heading>]").action(run(fetchCommand));
cli
  .command("checkpoint <message>", "Append a micro-checkpoint to the session WAL")
  .option("--close", "Close the current session")
  .action(run(checkpointCommand));
cli.command("verify", "Run deterministic diff guard, LOC ceiling, manifest, and debug checks").action(run(verifyCommand));
cli
  .command("clean", "Scan for temporary debug statements in added lines")
  .option("--purge", "Automatically remove safe single-line debug statements")
  .action(run(cleanCommand));
cli.command("allow <file>", "Approve a modified package manifest or lockfile (human-only)").action(run(allowCommand));
cli
  .command("remember <gotcha>", "Record a spatially-scoped invariant and push to Convex")
  .option("--paths <globs>", "Comma-separated path globs (e.g. src/auth/**,src/middleware/**)")
  .option("--trigger <regex>", "Regex trigger for prompt matching")
  .option("--reason <text>", "Why this invariant exists")
  .option("--code <code>", "Explicit invariant code (e.g. AUTH-01)")
  .action(run(rememberCommand));
cli.command("forget <code>", "Remove an invariant by code (e.g. AUTH-01)").action(run(forgetCommand));
cli.command("validate [path]", "Validate OKF v0.3 schema compliance across documents").action(run(validateCommand));

cli.help();
cli.version("0.1.0");

cli.addEventListener("command:*", () => {
  console.error(pc.red(`operon: unknown command "${cli.args.join(" ")}". See \`operon --help\`.`));
  process.exitCode = 2;
});

try {
  cli.parse();
} catch (err) {
  console.error(pc.red(`operon: ${err instanceof Error ? err.message : String(err)}`));
  process.exitCode = 2;
}
