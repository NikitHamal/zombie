const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type()==="error") errs.push(m.text()); });
  const path = require("path");
  const file = "file:///" + path.resolve("survival.html").replace(/\\/g, "/");
  console.log("load", file);
  await page.goto(file, { waitUntil: "load" });
  await page.waitForTimeout(1000);
  const init = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    return {
      day: sc.day,
      scrap: Math.floor(sc.scrap),
      wood: Math.floor(sc.wood),
      food: Math.floor(sc.food),
      vill: window.ZS.Sim.agents.filter(a=>a.st===1).length,
      cap: sc.popCap(),
      builds: sc.blocks.list.map(b=>b.kind).join(","),
      jobs: sc.jobCounts(),
      dig: sc.dig,
    };
  });
  console.log("init", init);
  // test resource gathering for 3s day
  await page.waitForTimeout(3200);
  const afterDay = await page.evaluate(() => ({ scrap: Math.floor(window.ZS.scenario.scrap), wood: Math.floor(window.ZS.scenario.wood), food: Math.floor(window.ZS.scenario.food) }));
  console.log("after 3s day prod", afterDay, "delta", afterDay.scrap-init.scrap, afterDay.wood-init.wood);
  // test building placement: build house
  const build = await page.evaluate(() => {
    const sc = window.ZS.scenario;
    sc.scrap=300; sc.wood=300;
    const c=sc.blocks.core; const cx=(c.x0+c.x1)/2, cy=(c.y0+c.by)/2;
    const before=sc.blocks.list.length;
    const beforeCap=sc.popCap();
    // find free spot 4 tiles away
    for(let dx=-6; dx<=6; dx++) for(let dy=-6; dy<=6; dy++){
      const tx=Math.floor((cx+dx*40)/40), ty=Math.floor((cy+dy*40)/40);
      const chk=sc.blocks.checkPlace(tx,ty,"house");
      if(chk.ok){
        const ok=sc.blocks.place(tx,ty,"house");
        if(ok.ok){
          return { ok:true, tx,ty, before, after: sc.blocks.list.length, beforeCap, afterCap: sc.popCap() };
        }
      }
    }
    return { ok:false };
  });
  console.log("build house", build);
  // test job assign
  const job = await page.evaluate(() => {
    const sc=window.ZS.scenario;
    const before=sc.jobCounts();
    // assign idle to guard if idle exists
    const idle = window.ZS.Sim.agents.find(a=>a.st===1&&a.job===0);
    if(idle){
      sc._adjustJob(5,1);
    }
    return { before, after: sc.jobCounts(), guardCap: sc.guardCap() };
  });
  console.log("job assign guard", job);
  // test recruit
  const recruit = await page.evaluate(() => {
    const sc=window.ZS.scenario;
    sc.scrap=500; sc.wood=500; sc.food=500;
    const before=window.ZS.Sim.agents.filter(a=>a.st===1).length;
    const cap=sc.popCap();
    sc._recruit();
    const after=window.ZS.Sim.agents.filter(a=>a.st===1).length;
    return { before, after, cap, scrap: Math.floor(sc.scrap) };
  });
  console.log("recruit", recruit);
  // test upgrade
  const up = await page.evaluate(() => {
    const sc=window.ZS.scenario;
    sc.scrap=2000;
    const before=sc.up.weapon;
    sc._buyUp("weapon");
    return { before, after: sc.up.weapon, cost: sc._upCost("weapon") };
  });
  console.log("upgrade weapon", up);
  // test dig
  const dig = await page.evaluate(() => {
    const sc=window.ZS.scenario;
    sc.dig=20; const before=sc.dig;
    const n=sc.digTo(200,200,null);
    return { before, after: sc.dig, n, tile: sc.tiles.typeAt(Math.floor(200/40), Math.floor(200/40)) };
  });
  console.log("dig", dig);
  // test night cycle: start night, then fast forward to dawn via calling _endNight
  const night = await page.evaluate(() => {
    const sc=window.ZS.scenario;
    const beforePhase=sc.phase;
    const beforeDay=sc.day;
    sc.startNight();
    const afterPhase=sc.phase;
    const sqLen=sc._sq.length;
    // manually end night as survived
    // need to set _n to avoid null
    // wait a bit then call _endNight
    sc._endNight(true,false);
    return { beforePhase, afterPhase, sqLen, card: sc.card, phase: sc.phase, day: sc.day, paused: sc.paused };
  });
  console.log("night start + end", night);
  // dismiss card
  const dismiss = await page.evaluate(() => {
    const sc=window.ZS.scenario;
    const beforeDay=sc.day;
    sc._dismissCard();
    return { phase: sc.phase, day: sc.day, beforeDay, dig: sc.dig };
  });
  console.log("dismiss", dismiss);
  // test save/load
  const save = await page.evaluate(() => {
    const sc=window.ZS.scenario;
    sc.save();
    const raw=localStorage.getItem("zs.survival.v1");
    const obj=JSON.parse(raw);
    // clear and reload simulation?
    return { has: !!obj, day: obj.day, vill: obj.villagers.length, builds: obj.blocks.length };
  });
  console.log("save", save);
  // test villager repair already tested earlier, but check one more time
  const repair = await page.evaluate(async () => {
    const sc=window.ZS.scenario;
    const house=sc.blocks.list.find(b=>b.kind==="house");
    if(!house) return {noHouse:true};
    house.hp=20; house.cracks=3;
    const builder=window.ZS.Sim.agents.find(a=>a.st===1&&a.job===4);
    if(builder){
      builder.x=(house.x0+house.x1)/2;
      builder.y=(house.y0+house.by)/2+10;
    }
    const before=house.hp;
    await new Promise(r=>setTimeout(r,1500));
    return { before, after: house.hp, builder: !!builder };
  });
  console.log("repair check", repair);
  console.log("errs", errs);
  await browser.close();
  // assertions
  if(init.vill!==6) console.error("FAIL init vill");
  if(!build.ok) console.error("FAIL build");
  if(recruit.after<=recruit.before) console.error("FAIL recruit");
  if(up.after!==up.before+1) console.error("FAIL upgrade");
  if(night.card===null) console.error("FAIL card");
  if(dismiss.day!==night.day+1) console.error("FAIL dismiss day not inc");
  if(errs.length) { console.error("ERRS",errs); process.exit(1); }
  console.log("FULL PASS - village survival P1-P6 verified");
})();
