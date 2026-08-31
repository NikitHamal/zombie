// Print every oxlint diagnostic as one line with a real line number, by
// resolving the byte offset in `labels[0].span.offset` against the source.
// Usage: node tools/lint-list.mjs .lint.json
import { readFileSync } from "node:fs";

const file = process.argv[2] || ".lint.json";
const j = JSON.parse(readFileSync(file, "utf8").trim());
const cache = new Map();
function lineOf(path, offset) {
  if (!cache.has(path)) cache.set(path, readFileSync(path, "utf8"));
  const s = cache.get(path);
  let n = 1;
  for (let i = 0; i < offset && i < s.length; i++) if (s[i] === "\n") n++;
  return n;
}
for (const d of j.diagnostics || []) {
  const f = (d.filename || "").replace(/\\/g, "/");
  const off = d.labels?.[0]?.span?.offset ?? 0;
  const ln = lineOf(f, off);
  const rule = (d.code || "").replace(/^eslint\(/, "").replace(/\)$/, "");
  const m = /'([^']+)'/.exec(d.message || "");
  console.log(`${f}\t${ln}\t${rule}\t${m ? m[1] : ""}\t${(d.message || "").slice(0, 70)}`);
}
