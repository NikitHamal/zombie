const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror:" + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push("console:" + m.text());
  });
  const path = require("path");
  const file = "file:///" + path.resolve("survival.html").replace(/\\/g, "/");
  console.log("loading", file);
  await page.goto(file, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const ZS = window.ZS;
    const sc = ZS.scenario;
    const agents = ZS.Sim.agents;
    const vill = agents.filter((a) => a.st === 1);
    const zomb = agents.filter((a) => a.st === 2);
    return {
      hasZS: !!ZS,
      hasTiles: !!sc.tiles,
      hasBlocks: !!sc.blocks,
      tilesCols: sc.tiles ? sc.tiles.cols : 0,
      tilesRows: sc.tiles ? sc.tiles.rows : 0,
      worldW: ZS.debug.world.w,
      worldH: ZS.debug.world.h,
      agents: agents.length,
      vill: vill.length,
      zomb: zomb.length,
      scrap: Math.floor(sc.scrap),
      wood: Math.floor(sc.wood),
      food: Math.floor(sc.food),
      day: sc.day,
      phase: sc.phase,
      buildKinds: sc.blocks ? sc.blocks.list.map((b) => b.kind).join(",") : "",
      popCap: sc.popCap ? sc.popCap() : 0,
      guardCap: sc.guardCap ? sc.guardCap() : 0,
      jobs: sc.jobCounts ? sc.jobCounts() : null,
      dig: sc.dig,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  // try building a house
  const buildTest = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    sc.scrap = 500;
    sc.wood = 500;
    const before = sc.blocks.list.length;
    // find free tile near core
    const c = sc.blocks.core;
    const cx = (c.x0 + c.x1) / 2;
    const cy = (c.y0 + c.by) / 2;
    // try place house at offset
    const tx = Math.floor((cx + 80) / 40);
    const ty = Math.floor((cy + 80) / 40);
    sc.tool = "house";
    sc._placeAt(cx + 80, cy + 80);
    const after = sc.blocks.list.length;
    const last = sc.blocks.list[sc.blocks.list.length - 1];
    return { before, after, lastKind: last ? last.kind : null, tx, ty, ok: after > before };
  });
  console.log("buildTest", buildTest);
  // try job assign
  const jobTest = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    const before = sc.jobCounts();
    // try assign one idle to guard if possible
    const v = window.ZS.Sim.agents.find((a) => a.st === 1 && a.job === 0);
    if (v) {
      sc._adjustJob(5, 1);
    }
    const after = sc.jobCounts();
    return { before, after };
  });
  console.log("jobTest", jobTest);
  // try start night
  const nightTest = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    sc.startNight();
    return { phase: sc.phase, sqLen: sc._sq.length, nightMod: sc._nightMod(sc.day) };
  });
  console.log("nightTest", nightTest);
  await page.waitForTimeout(2000);
  const afterNight = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    const agents = window.ZS.Sim.agents;
    return {
      phase: sc.phase,
      nightT: sc.nightT,
      zomb: agents.filter((a) => a.st === 2).length,
      kills: sc._n ? sc._n.kills : 0,
    };
  });
  console.log("afterNight2s", afterNight);
  console.log("errors", errs);
  await browser.close();
  if (errs.length) process.exit(1);
  // checks
  if (info.vill < 5) {
    console.error("FAIL vill <5");
    process.exit(1);
  }
  if (!buildTest.ok) {
    console.error("FAIL build house");
    process.exit(1);
  }
  if (nightTest.phase !== "dusk") {
    console.error("FAIL not dusk after startNight");
    process.exit(1);
  }
  console.log("PROBE PASS");
})();
