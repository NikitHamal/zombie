/* Desert Order — the economy.

   Four resources: concrete, steel, aluminium, fuel. Industry makes them,
   stores hold them, and the army eats them.

   Two Desert Order rules are reproduced exactly:

   PRODUCTIVITY. The more settlements you hold, the less efficient each
   one is: productivity = sqrt(n) / n. Total output still grows — as
   sqrt(n) — but holding nine settlements gives you three times the steel,
   not nine times. Spreading wide is worth it, and it is not free.

   STORAGE. Every plant of a kind raises that resource's ceiling, and each
   additional plant raises it a little less than the one before:
   sqrt(plants * 1000). Hit the ceiling and the plants stop. Building
   industry you cannot store is the same as building nothing.

   Fuel is the one that bites: refineries on an oil seep pay better than
   double, so where you put them matters more than how many you have. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});

  // base store, before a single plant is raised
  const BASE_STORE = { concrete: 5000, steel: 2500, alu: 1200, fuel: 900 };
  // which building makes which resource
  const MAKER = { concrete: "concrete", steel: "steelmill", alu: "aluworks", fuel: "refinery" };

  const Economy = {
    tick: 0,

    update(g, dt) {
      this.tick += dt;
      if (this.tick > 0.4) {
        this.tick = 0;
        this.recompute(g);
      }
      for (const f of g.factions) {
        if (!f.alive) continue;
        const prod = f.productivity;
        for (const k of R.RES_KEYS) {
          const rate = f.rate[k];
          if (rate <= 0) continue;
          f.res[k] = Math.min(f.store[k], f.res[k] + (rate / 60) * prod * dt);
        }
      }
    },

    recompute(g) {
      for (const f of g.factions) {
        for (const k of R.RES_KEYS) {
          f.rate[k] = 0;
          f.store[k] = BASE_STORE[k];
        }

        // the productivity curve: sqrt(n)/n, n = settlements held
        const n = Math.max(1, f.sites);
        f.productivity = Math.sqrt(n) / n;

        let power = 1,
          depot = 1;
        const plants = { concrete: 0, steel: 0, alu: 0, fuel: 0 };
        let cap = 30;

        for (const b of g.buildings) {
          if (b.dead || b.fac !== f.id || !b.built) continue;
          const d = b.def;
          if (d.makes) {
            let r = R.levelRate(d, b.lvl);
            if (d.onOil && b.onOil) r *= d.onOil;
            f.rate[d.makes] += r;
            plants[d.makes]++;
          }
          if (d.boost) power += d.boost * (1 + (b.lvl - 1) * 0.35);
          if (d.store) depot += d.store * b.lvl;
          if (d.cap) cap += d.cap + (b.lvl - 1) * Math.round(d.cap * 0.4);
        }

        // power stations speed everything up, including the assembly lines
        for (const k of R.RES_KEYS) f.rate[k] *= power;
        f.buildRate = 1 + (power - 1) * 0.45;

        // storage: sqrt(plants * 1000), each plant worth less than the last
        for (const k of R.RES_KEYS) {
          const res = R.RES.find((r) => r.key === k);
          const mk = MAKER[k];
          const count = f.counts[mk] || 0;
          const fromPlants = Math.round(Math.sqrt(Math.max(0, count) * 1000)) * (res.cap / 4);
          f.store[k] = Math.round((BASE_STORE[k] + fromPlants) * depot);
        }

        // army cap: room at the depots, plus room for every settlement
        cap += f.sites * 15;
        f.cap = cap;

        let used = 0;
        for (const u of g.units) if (!u.dead && u.fac === f.id && !u.inside) used += u.def.pop;
        f.capUsed = used;
        f.units = g.countUnits(f.id);
      }
    },

    // what a faction is short of, for the AI and for the warnings
    shortOf(g, fac) {
      const f = g.factions[fac];
      let worst = null,
        wv = 0;
      for (const k of R.RES_KEYS) {
        const frac = f.res[k] / Math.max(1, f.store[k]);
        if (frac < 0.35 && (worst === null || frac < wv)) {
          worst = k;
          wv = frac;
        }
      }
      return worst;
    },
  };

  R.Economy = R.Economy || Economy;
})();
