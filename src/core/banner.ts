import pc from "picocolors";
import { isInteractive } from "./ui.js";

const LINES = [
  "   ____  ____  ___________  ____  _   __",
  "  / __ \\/ __ \\/ ____/ __ \\/ __ \\/ | / /",
  " / / / / /_/ / __/ / /_/ / / / /  |/ / ",
  "/ /_/ / ____/ /___/ _, _/ /_/ / /|  /  ",
  "\\____/_/   /_____/_/ |_|\\____/_/ |_/   ",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Renders a clean, minimal ASCII wordmark with a brief reveal in interactive terminals. */
export async function printBanner(): Promise<void> {
  const animate = isInteractive();
  console.log("");
  for (let i = 0; i < LINES.length; i++) {
    const line = i === LINES.length - 1 ? `${pc.cyan(LINES[i])}${pc.dim("v0.2")}` : pc.cyan(LINES[i]);
    console.log(line);
    if (animate) await sleep(22);
  }
  console.log("");
}
