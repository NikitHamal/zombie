/* SANDSTORM — ground.

   The map is cut into settlements. A settlement is a ring of territory:
   everything inside it is yours to build on, and every settlement you
   hold raises the ceiling on how much industry you may own.

   What it is held by is the flak, and the capture itself lives in the
   game: every flak down, the ground is ownerless; a Conquest Truck on
   open ground, and the flag turns with two fresh flaks in the door. This
   file keeps the one question the AI asks often: is anybody hostile
   standing on this ground right now? */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE;

  const Territory = {
    // is anybody hostile standing on this ground?
    contested(g, site, fac) {
      let enemy = 0,
        mine = 0;
      const r = (site.r + 4) * TILE;
      g.grid.query(site.x, site.y, r, (o) => {
        if (o.dead || o.kind !== "u") return;
        if (R.dist2(o.x, o.y, site.x, site.y) > r * r) return;
        if (o.fac === fac) mine++;
        else if (R.hostileTo(fac, o.fac)) enemy++;
      });
      return { enemy, mine };
    },
  };

  R.Territory = Territory;
})();
