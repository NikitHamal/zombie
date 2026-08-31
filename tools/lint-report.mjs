// Read an oxlint --format=json dump and print a compact tally by rule and
// by file. Usage: node tools/lint-report.mjs .lint.json
import { readFileSync } from "node:fs";

const file = process.argv[2] || ".lint.json";
const j = JSON.parse(readFileSync(file, "utf8").trim());
const diags = j.diagnostics || [];
const byRule = {};
const byFile = {};
for (const d of diags) {
  const r = (d.code || "").replace(/^eslint\(/, "");
  byRule[r] = (byRule[r] || 0) + 1;
  const f = (d.filename || "").replace(/\\/g, "/");
  byFile[f] = (byFile[f] || 0) + 1;
}
console.log("TOTAL", diags.length);
console.log("-- by rule --");
console.log(byRule);
console.log("-- by file --");
console.log(byFile);
