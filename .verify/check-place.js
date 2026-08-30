const { chromium } = require("playwright");
(async()=>{
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  const path=require("path");
  const file="file:///"+path.resolve("survival.html").replace(/\\/g,"/");
  await page.goto(file,{waitUntil:"load"});
  await page.waitForTimeout(800);
  const r = await page.evaluate(()=>{
    const sc=window.ZS.scenario;
    const c=sc.blocks.core;
    const cx=(c.x0+c.x1)/2, cy=(c.y0+c.by)/2;
    const tests=[
      [cx+100,cy,"yard"],
      [cx-100,cy,"lumber"],
      [cx,cy+100,"farm"],
      [cx+140,cy+60,"house"],
      [cx-140,cy+60,"barracks"],
      [cx+80,cy-90,"turret"],
    ];
    const out=[];
    for(const [x,y,k] of tests){
      const [tx,ty]=sc.tiles.tileAt(x,y);
      const chk=sc.blocks.checkPlace(tx,ty,k);
      const tile=sc.tiles.typeAt(tx,ty);
      const at=sc.blocks.at(tx,ty);
      out.push({k,tx,ty,tile,at: !!at, chk});
    }
    // also list existing blocks
    out.push({list: sc.blocks.list.map(b=>[b.kind,b.tx,b.ty])});
    out.push({core: [c.tx,c.ty,c.w,c.h]});
    return out;
  });
  console.log(JSON.stringify(r,null,2));
  await browser.close();
})();
