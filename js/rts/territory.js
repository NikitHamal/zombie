/* Desert Order — ground.

   The map is cut into settlements. A settlement is a ring of territory:
   everything inside it is yours to build on, and every settlement you hold
   raises the ceiling on how much industry and how much army you may own.

   You take one with a conquest truck. Drive it onto the settlement and
   hold it for fourteen seconds with nothing of yours shooting and nothing
   of theirs standing on it, and the flag turns. Taking a settlement from
   another nation means breaking what they built on it first — the ground
   will not turn while their buildings are standing.

   Settlements grow: hold one long enough and its ring widens. */
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

    capture(g, site, fac) {
      const old = site.owner;
      // An enemy settlement only turns once you have broken its command.
      // Walls and guns are not what holds ground — the command centre is.
      // Everything else they left standing burns when the flag turns.
      if (old >= 0 && old !== fac && R.hostileTo(fac, old)) {
        const ring = Math.pow((site.r + 6) * TILE, 2);
        let hq = null;
        for (const b of g.buildings) {
          if (b.dead || b.fac !== old || b.key !== "hq") continue;
          if (R.dist2(b.x, b.y, site.x, site.y) < ring) {
            hq = b;
            break;
          }
        }
        if (hq) {
          if (fac === 0)
            g.say(0, site.name + " will not turn while their command centre stands", "warn");
          return false;
        }
        // the garrison's buildings go up with the place
        for (const b of g.buildings.slice()) {
          if (b.dead || b.fac !== old) continue;
          if (R.dist2(b.x, b.y, site.x, site.y) < ring) g.removeBuilding(b, true);
        }
      }
      site.owner = fac;
      site.capT = 0;
      site.capFrac = 0;
      site.capBy = -1;
      if (site.nest) {
        site.nest = false;
        if (R.Horde) R.Horde.nestLost(g, site);
      }
      g.claimSite(site, fac);
      if (fac === 0) {
        g.stats.captured++;
        g.say(0, site.name + " is yours", "good");
        R.FX.ping(g, site.x, site.y, "good");
      } else if (old === 0) {
        g.say(0, R.factionName[fac] + " has taken " + site.name, "warn");
        R.FX.ping(g, site.x, site.y, "bad");
      }
      if (ZS.sound) ZS.sound.event("capture", site.x, site.y);
      return true;
    },

    // the ring widens the longer you hold the place
    grow(g, dt) {
      for (const s of g.t.sites) {
        if (s.owner < 0 || s.owner === 6) continue;
        s.hold = (s.hold || 0) + dt;
        if (s.hold > 150 && s.tier < 4) {
          s.tier++;
          s.hold = 0;
          g.reclaim();
          if (s.owner === 0) g.say(0, s.name + " has grown — its ground reaches further", "good");
        }
      }
    },
  };

  R.Territory = Territory;
})();
