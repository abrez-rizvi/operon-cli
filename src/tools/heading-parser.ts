export interface Heading {
  level: number;
  text: string;
  slug: string;
  line: number; // 0-based index into lines
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s{0,3}(```|~~~)/;

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-");

/** Lexes ATX headings, ignoring anything inside fenced code blocks. */
export function parseHeadings(lines: string[]): Heading[] {
  const out: Heading[] = [];
  let fence: string | null = null;
  lines.forEach((line, i) => {
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1] === fence) fence = null;
      return;
    }
    if (fence) return;
    const m = HEADING.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2], slug: slugify(m[2]), line: i });
  });
  return out;
}

/** Resolves a heading by exact slug, then by unique partial slug match. */
export function findHeading(headings: Heading[], target: string): Heading | Heading[] | null {
  const t = slugify(target);
  const exact = headings.find((h) => h.slug === t);
  if (exact) return exact;
  const partial = headings.filter((h) => h.slug.includes(t));
  if (partial.length === 1) return partial[0];
  return partial.length ? partial : null;
}

/** Extracts a heading's section: until the next heading of equal or higher level. */
export function extractSection(markdown: string, target: string): { heading: Heading; text: string } | { ambiguous: Heading[] } | null {
  const lines = markdown.split(/\r?\n/);
  const headings = parseHeadings(lines);
  const found = findHeading(headings, target);
  if (!found) return null;
  if (Array.isArray(found)) return { ambiguous: found };
  const next = headings.find((h) => h.line > found.line && h.level <= found.level);
  const text = lines.slice(found.line, next ? next.line : lines.length).join("\n").trimEnd();
  return { heading: found, text };
}

export function tableOfContents(markdown: string): Heading[] {
  return parseHeadings(markdown.split(/\r?\n/));
}
