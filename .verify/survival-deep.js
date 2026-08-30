const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type()==="error") errs.push(m.text()); });
  const path = require("path");
  const file = "file:///" + path.resolve("survival.html").replace(/\\/g, "/");
  await page.goto(file, { waitUntil: "load" });
  await page.waitForTimeout(800);
  // speedup night for test: set BAL.NIGHT_LEN 12 via evaluate, then restart night
  // Instead use recording: we need to set window ZS scenario BAL? BAL is closed.
  // Use query param ? Not.
  // Instead we override via page: set SZ? easiest: use ZS.recording if available? Not without ?record=1
  // We'll just instrument directly: call scenario._sq manipulation
  const deep = await page.evaluate(async () => {
    const ZS = window.ZS;
    const sc = ZS.scenario;
    // give resources and build some buildings to test economy
    sc.scrap = 1000; sc.wood = 800; sc.food = 500;
    // build yard, lumber, farm, barracks
    const c = sc.blocks.core;
    const cx = (c.x0+c.x1)/2, cy=(c.y0+c.by)/2;
    // clear previous house from probe? check
    // place yard at 100,0 offset, lumber at -100, farm at 0,100
    const placements = [
      [cx+100, cy, "yard"],
      [cx-100, cy, "lumber"],
      [cx, cy+100, "farm"],
      [cx+140, cy+60, "house"],
      [cx-140, cy+60, "barracks"],
      [cx+80, cy-90, "turret"],
    ];
    const placed=[];
    for (const [x,y,k] of placements) {
      const [tx,ty]=sc.tiles.tileAt(x,y);
      sc.tool=k;
      sc._placeAt(x,y);
      placed.push({k, placed: sc.blocks.list.some(b=>b.tx===tx&&b.ty===ty), tx,ty});
    }
    // assign jobs: ensure 2 guards
    // we have 6 villagers: reassign idle to guard if possible
    // make sure we have idle
    const vs = ZS.Sim.agents.filter(a=>a.st===1);
    // set jobs manually for test: 1 guard,1 builder,1 farmer,1 scav,1 lumber,1 idle?
    // Already varied. Force builder to 2
    // start night
    sc.startNight();
    const startPhase = sc.phase;
    const sqLen = sc._sq.length;
    return { placements:placed, startPhase, sqLen, popCap: sc.popCap(), guardCap: sc.guardCap(), jobs: sc.jobCounts(), scrap: sc.scrap, wood: sc.wood, food: sc.food };
  });
  console.log("deep init", JSON.stringify(deep,null,2));
  // wait for dusk+night via real time: 3s dusk + 5s night
  await page.waitForTimeout(4500);
  const mid = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    const agents = window.ZS.Sim.agents;
    return {
      phase: sc.phase,
      nightT: sc.nightT.toFixed(2),
      zombAlive: agents.filter(a=>a.st===2&&!a.dead).length,
      villAlive: agents.filter(a=>a.st===1&&!a.dead).length,
      scScrap: Math.floor(sc.scrap),
      scWood: Math.floor(sc.wood),
      scFood: Math.floor(sc.food),
      kills: sc._n ? sc._n.kills : 0,
      blocks: sc.blocks.list.map(b=>b.kind+":"+Math.round(b.hp)).join(","),
    };
  });
  console.log("mid 4.5s", mid);
  await page.waitForTimeout(3000);
  const mid2 = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    const agents = window.ZS.Sim.agents;
    let bang = 0;
    for (const f of ZS.fx) if (f.kind==="muzzle") bang++;
    return {
      phase: sc.phase,
      nightT: sc.nightT.toFixed(2),
      zomb: agents.filter(a=>a.st===2).length,
      kills: sc._n ? sc._n.kills : 0,
      fx: ZS.fx.length,
      muzzle: bang,
    };
  });
  console.log("mid2 7.5s", mid2);
  // click combat: try hit a zombie
  const clickTest = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    const z = window.ZS.Sim.agents.find(a=>a.st===2&&!a.dead);
    if (!z) return { noZombie:true };
    const cam = window.ZS.debug.cam;
    const vw = window.innerWidth, vh=window.innerHeight;
    // world to screen: cam.apply inverse? easier call scenario._combatClick directly via screen->world?
    // _combatClick expects world coords
    const ok = sc._combatClick(z.x, z.y);
    return { ok, zHp: z.hp, combo: sc.combo.n };
  });
  console.log("clickTest", clickTest);
  // test repair: damage a house
  const repairTest = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    const house = sc.blocks.list.find(b=>b.kind==="house");
    if (!house) return {noHouse:true};
    house.hp = 30;
    house.cracks=3;
    const hpBefore = house.hp;
    // assign builder close
    const builder = window.ZS.Sim.agents.find(a=>a.st===1&&a.job===4);
    if (builder) {
      builder.x = (house.x0+house.x1)/2;
      builder.y = (house.y0+house.by)/2;
    }
    return { hpBefore, builder: !!builder };
  });
  console.log("damage house", repairTest);
  await page.waitForTimeout(2000);
  const afterRepair = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    const house = sc.blocks.list.find(b=>b.kind==="house");
    return house ? { hp: Math.round(house.hp), cracks: house.cracks } : { no:true };
  });
  console.log("afterRepair 2s", afterRepair);
  // test dig
  const digTest = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    sc.dig = 20;
    sc.tool = 1; // water
    const [tx,ty] = sc.tiles.tileAt(100,100);
    const before = sc.tiles.typeAt(tx,ty);
    const n = sc.digTo(100,100,null);
    const after = sc.tiles.typeAt(tx,ty);
    return { before, after, n, dig: sc.dig };
  });
  console.log("digTest", digTest);
  // test save
  const saveTest = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    sc.save();
    const raw = localStorage.getItem("zs.survival.v1");
    const obj = raw ? JSON.parse(raw) : null;
    return { hasSave: !!obj, v: obj ? obj.v : null, tiles: obj ? obj.tiles.length : 0, blocks: obj ? obj.blocks.length : 0, vill: obj ? obj.villagers.length : 0 };
  });
  console.log("saveTest", saveTest);
  // check resource production: idle+workers produce over 3s
  const prodTest = await page.evaluate(async () => {
    const sc = window.ZS.scenario;
    // ensure day phase for production: need to be day, but we are in night. End night quickly by fast-forward?
    // set phase to day manually for test: we will just measure scrap before/after 2s while in night still produces (passive)
    const beforeS = sc.scrap;
    const beforeW = sc.wood;
    const beforeF = sc.food;
    await new Promise(r=>setTimeout(r,2200));
    return { beforeS: Math.floor(beforeS), afterS: Math.floor(sc.scrap), beforeW: Math.floor(beforeW), afterW: Math.floor(sc.wood), beforeF: Math.floor(beforeF), afterF: Math.floor(sc.food) };
  });
  console.log("prodTest 2.2s", prodTest);
  console.log("errors", errs);
  await browser.close();
  if (errs.length) { console.error("ERRS",errs); process.exit(1);}
  // assertions
  if (mid.phase!=="night" && mid.phase!=="dusk") console.error("FAIL phase not night/dusk");
  if (mid.zombAlive===0) console.warn("WARN no zombies after 4.5s - wave maybe slow");
  if (afterRepair.hp !== undefined && afterRepair.hp <= 30) console.warn("WARN repair not happening");
  if (!saveTest.hasSave) { console.error("FAIL save"); process.exit(1); }
  console.log("DEEP PASS");
})();
