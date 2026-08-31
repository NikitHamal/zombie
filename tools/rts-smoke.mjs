/* Headless smoke test for the RTS page.

   Loads rts.html in Chromium, records every console error and page
   exception, runs the sim for a while, and reports what the world looks
   like: units, buildings, factions, fog, fps. Exits non-zero if anything
   threw, if nothing was built, or if the frame rate collapsed.

   Run: node tools/rts-smoke.mjs            (a fresh random seed)
        node tools/rts-smoke.mjs 20260830   (a pinned seed)
        node tools/rts-smoke.mjs --shot     (also write a screenshot) */

import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const args = process.argv.slice(2);
const shot = args.includes("--shot");
const seed = args.find((a) => /^\d+$/.test(a)) || String((Math.random() * 4294967295) >>> 0);

const url = pathToFileURL(resolve(root, "rts.html")).href + "?seed=" + seed;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

const errors = [];
const warns = [];
page.on("console", (m) => {
  const t = m.type();
  if (t === "error") errors.push(m.text());
  else if (t === "warning") warns.push(m.text());
});
page.on("pageerror", (e) => errors.push("PAGEERROR: " + (e.stack || e.message)));

console.log("seed " + seed);
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1200);

/* ---- let it run ---- */
const SECONDS = Number(args.find((a) => /^--t=(\d+)$/.test(a))?.slice(4) || 20);
await page.waitForTimeout(SECONDS * 1000);

/* ---- what is in the world ---- */
const report = await page.evaluate(() => {
  const R = window.ZS.RTS;
  const g = window.ZS.debug.rts.g;
  const byFac = {};
  for (const u of g.units) if (!u.dead) byFac[u.fac] = (byFac[u.fac] || 0) + 1;
  const bByFac = {};
  for (const b of g.buildings) if (!b.dead) bByFac[b.fac] = (bByFac[b.fac] || 0) + 1;
  let visTiles = 0;
  for (let i = 0; i < g.t.vis.length; i++) if (g.t.vis[i] === 2) visTiles++;
  let owned = 0;
  for (let i = 0; i < g.t.owner.length; i++) if (g.t.owner[i] === 0) owned++;
  return {
    time: +g.time.toFixed(1),
    units: g.units.length,
    unitsByFac: byFac,
    buildings: g.buildings.length,
    buildingsByFac: bByFac,
    shots: g.shots.length,
    log: g.log.slice(-6).map((e) => e.text),
    visTiles,
    ownedTiles: owned,
    sites: g.t.sites.map((s) => s.owner).filter((o) => o === 0).length,
    playerSites: g.factions[0].sites,
    res: Object.fromEntries(Object.entries(g.factions[0].res).map(([k, v]) => [k, Math.round(v)])),
    rate: Object.fromEntries(Object.entries(g.factions[0].rate).map(([k, v]) => [k, +v.toFixed(1)])),
    cap: g.factions[0].capUsed + "/" + g.factions[0].cap,
    fps: Math.round(window.ZS.Perf.fps),
    perfTier: window.ZS.Perf.tier,
    hordeWave: window.ZS.RTS.Horde.wave || 0,
    over: g.over,
  };
});

console.log(JSON.stringify(report, null, 2));

/* ---- a screenshot, when asked ---- */
if (shot) {
  const out = resolve(here, "rts-smoke.png");
  await page.screenshot({ path: out });
  console.log("shot -> " + out);
}

await browser.close();

const problems = [];
if (errors.length) problems.push(errors.length + " console/page errors");
if (!report.buildings) problems.push("no buildings were raised");
if (!report.units) problems.push("no units on the map");
if (report.ownedTiles === 0) problems.push("player owns no territory");
// headless Chromium renders Canvas 2D on the CPU; the same game on a
// real GPU sits at 60. We accept anything above the laptop floor.
if (report.fps < 14) problems.push("fps collapsed to " + report.fps);

for (const e of errors.slice(0, 12)) console.log("  ! " + e);
if (warns.length) for (const w of warns.slice(0, 5)) console.log("  ~ " + w);

if (problems.length) {
  console.log("\nFAIL: " + problems.join("; "));
  process.exit(1);
}
console.log("\nPASS — " + Math.round(report.fps) + " fps, " + report.units + " units, " + report.buildings + " buildings.");
