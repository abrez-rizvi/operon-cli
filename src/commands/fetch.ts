import path from "node:path";
import { findEntity, listEntities } from "../core/entities.js";
import { OperonError, readInvariants, requireProject } from "../core/local-store.js";
import { timeAgo } from "../core/matching.js";
import { extractSection, tableOfContents } from "../tools/heading-parser.js";

export async function fetchCommand(target: string): Promise<number> {
  const { dir } = requireProject();
  const idx = target.indexOf(":");
  const name = idx === -1 ? target : target.slice(0, idx);
  const heading = idx === -1 ? "" : target.slice(idx + 1);

  if (name === "invariants") {
    const invs = readInvariants(dir);
    if (!invs.length) console.log("No invariants recorded yet.");
    for (const i of invs) console.log(`- [${i.code}] ${i.rule}${i.reason ? ` — ${i.reason}` : ""} (${i.paths.join(", ")} · ${i.author} · ${timeAgo(i.timestamp)})`);
    return 0;
  }

  const entity = findEntity(dir, name);
  if (!entity) {
    const names = listEntities(dir).map((e) => `${e.name} (${e.kind})`);
    throw new OperonError(`Unknown entity "${name}". Available: ${names.join(", ") || "none"}`);
  }

  if (!heading) {
    const toc = tableOfContents(entity.body).filter((h) => h.level >= 2);
    console.log(`# ${entity.title} (${entity.kind}: ${entity.name})`);
    if (entity.description) console.log(entity.description);
    console.log("\nSections (fetch with `operon fetch " + entity.name + ":<section>`):");
    for (const h of toc) console.log(`${"  ".repeat(h.level - 2)}- ${h.slug} — ${h.text}`);
    return 0;
  }

  const result = extractSection(entity.body, heading);
  if (!result) {
    const slugs = tableOfContents(entity.body).map((h) => h.slug);
    throw new OperonError(`No section "${heading}" in ${path.basename(entity.file)}. Sections: ${slugs.join(", ")}`);
  }
  if ("ambiguous" in result) {
    throw new OperonError(`Section "${heading}" is ambiguous: ${result.ambiguous.map((h) => h.slug).join(", ")}`);
  }
  console.log(result.text);
  return 0;
}
