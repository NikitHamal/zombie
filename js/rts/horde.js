/* The horde. The war between the nations is loud enough to wake what was
   never properly dead: in the broken places of the theatre there are
   nests, and the nests leak. By day they send out small packs that go at
   whoever stands nearest — any flag, any faction; at nightfall each nest
   empties a surge toward the noise, and the player's walls are usually
   the nearest noise.

   A nest is a ring of ruined buildings. It stops leaking when everything
   in the ring is burned down to nothing (hp gone, not merely ruined) —
   which is a job for a tank, or for wings with nothing better to bomb.

   The horde's dice are the scenario's (`scen.rand()`), the same way the
   nations' are: nothing here shifts the stream it does not own. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const BAL = {
    NESTS: 6, // how many broken places there are
    PACK_T: 42, // seconds between packs by day
    NIGHT_MUL: 2.1, // night: the same clock runs this much faster
    SURGE_BASE: 3, // what comes out of a nest when the dark drops
    SURGE_DAY: 0.8, // ...and grows by this a day
    AWAY: 900, // a nest keeps this much ground from any base
    APART: 520, // ...and this much from each other
    SIGHT: 640, // how far the dead can smell the living
    CAP: 150, // no more of them than this walk the theatre at once
  };

  // what climbs out, and from which day
  const TYPES = {
    walker: { hp: 55, dmg: 9, spd: 50, rate: 1, day: 1 },
    crawler: { hp: 42, dmg: 8, spd: 78, rate: 0.8, day: 3, z: "crawler" },
    runner: { hp: 50, dmg: 11, spd: 118, rate: 0.7, day: 5, z: "runner" },
    brute: { hp: 250, dmg: 26, spd: 42, rate: 1.35, day: 9, z: "brute" },
  };

  const Horde = {
    BAL,
    TYPES,

    create(scen) {
      const world = scen.world,
        nav = scen.nav;
      scen.nests = [];
      const rng = ZS.rng32(world.seed ^ 0xdeed);
      for (let i = 0; i < BAL.NESTS; i++) {
        let x = 0,
          y = 0,
          ok = false;
        for (let tries = 0; tries < 90 && !ok; tries++) {
          x = 260 + rng() * (world.w - 520);
          y = 260 + rng() * (world.h - 520);
          if (!nav.isWalkable(x, y, false)) continue;
          if (world.inLake(x, y, 200) || world.nearRiver(x, y, 160)) continue;
          ok = true;
          for (const b of scen.bases) if (Math.hypot(b.x - x, b.y - y) < BAL.AWAY) ok = false;
          if (ok)
            for (const n of scen.nests) if (Math.hypot(n.x - x, n.y - y) < BAL.APART) ok = false;
        }
        if (!ok) continue;
        // the ring of ruins: two dead houses and a broken wall
        const bs = [];
        const put = (kind, ox, oy) => {
          const r = ZS.Structs.place(world, nav, kind, x + ox, y + oy, { ruined: true });
          if (r.ok) {
            r.s.fac = -1;
            r.s.nest = i;
            bs.push(r.s);
          }
        };
        put("hut", -46, -30);
        put("hut", 52, 26);
        put("wall", 8, -58);
        scen.nests.push({ x, y, b: bs, t: BAL.PACK_T * (0.4 + rng() * 0.8), seed: i * 37 + 5 });
      }
    },

    // a nest leaks while anything in the ring still stands (hp > 0)
    alive(nest) {
      for (const b of nest.b) if (b.hp > 0) return true;
      return false;
    },

    // standing but broken: ruins leak at half the rate
    allRuined(nest) {
      for (const b of nest.b) if (!b.ruined && b.hp > 0) return false;
      return true;
    },

    tick(scen, dt) {
      const day = scen.day;
      const night = scen.night;
      for (const nest of scen.nests) {
        if (!this.alive(nest)) continue;
        let rate = night ? BAL.NIGHT_MUL : 1;
        if (this.allRuined(nest)) rate *= 0.5;
        nest.t -= dt * rate;
        if (nest.t > 0) continue;
        nest.t = BAL.PACK_T * (0.7 + scen.rand() * 0.6);
        const size = Math.min(9, 1 + Math.floor(day * 0.7) + (night ? 2 : 0));
        this.pack(scen, nest, size, null);
      }
    },

    // nightfall: every whole nest throws a surge at the player's noise
    surge(scen) {
      const size = Math.min(14, BAL.SURGE_BASE + Math.floor(scen.day * BAL.SURGE_DAY));
      const hq = scen.bldsOf(0, "hall")[0];
      if (!hq) return;
      for (const nest of scen.nests) {
        if (!this.alive(nest)) continue;
        if (Math.hypot(nest.x - hq.x, nest.y - hq.y) > 3400) continue;
        this.pack(scen, nest, size, { x: hq.x + hq.w / 2, y: hq.y + hq.h / 2 });
      }
    },

    pack(scen, nest, n, tgt) {
      const day = scen.day;
      let walking = 0;
      for (const a of scen.agents) if (a.st === 2 && !a.dead) walking++;
      for (let i = 0; i < n; i++) {
        if (walking >= BAL.CAP) return; // the theatre is already full of them
        walking++;
        const pick = scen.rand();
        let type = "walker";
        if (day >= TYPES.brute.day && pick < 0.1) type = "brute";
        else if (day >= TYPES.runner.day && pick < 0.34) type = "runner";
        else if (day >= TYPES.crawler.day && pick < 0.58) type = "crawler";
        const an = scen.rand() * 6.283,
          rr = 26 + scen.rand() * 70;
        scen.spawnZombie(type, nest.x + Math.cos(an) * rr, nest.y + Math.sin(an) * rr, tgt);
      }
    },
  };

  ZS.Horde = Horde;
})();
