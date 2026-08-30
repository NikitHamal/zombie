const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const file of ["hold.html", "index.html", "battle.html"]) {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    const path = require("path");
    const url = "file:///" + path.resolve(file).replace(/\\/g, "/");
    console.log("testing", file);
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => ({
      hasZS: !!window.ZS,
      agents: window.ZS.Sim.agents.length,
      world: !!window.ZS.debug.world,
      scen: window.ZS.scenario.constructor.name,
    }));
    console.log(file, info, "errs", errs.length);
    if (!info.hasZS || errs.length) {
      console.error("FAIL", file, errs);
      process.exit(1);
    }
    await page.close();
  }
  await browser.close();
  console.log("HOLD REGRESSION PASS");
})();
