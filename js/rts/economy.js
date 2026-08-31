/* Desert war RTS — the ledger.

   Four stores, a purse, two caps and a road.

   The stores. Concrete, steel, aluminium and fuel are poured out by the
   plants and held in a ceiling that grows with the square root of what
   you own: every new plant helps less than the one before, and the home
   ground carries the rest. When the stores fill, the plants stop; that is
   the pressure to spend.

   The caps. ENERGY POINTS: every level of every plant and every flak
   stands in the energy book, and the book starts at a thousand lines.
   MILITARY POINTS: every unit, built or being built, stands in the
   military book. Overdraw either book by a hundred lines and the
   machinery stops — and the energy overdraw halves the stores with it.
   That is the rule that keeps a base from being everything at once.

   The purse. Gold is not poured; it is earned. Ten Gold Runners in one
   game day is one gold. The starter quests pay a little. And gold buys
   the things a store never can: power, points, base, reach, recovery.

   The road. Fuel is the only resource an army drinks while moving.
   Every moving second, every vehicle, a sip from the pool. The pool
   runs dry and the army stands still — fuel is not a cost, it is the
   road, and the refinery is the well. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});

  const Economy = {
    /* ---------- a faction's books ---------- */

    initFaction(f, gold) {
      f.res = { concrete: 0, steel: 0, alu: 0, fuel: 0 };
      f.store = { concrete: 0, steel: 0, alu: 0, fuel: 0 };
      f.rate = { concrete: 0, steel: 0, alu: 0, fuel: 0 }; // per minute, before productivity
      f.gold = gold || 0;
      f.ep = 0;
      f.epMax = R.EP_START;
      f.mp = 0;
      f.mpMax = R.MP_START;
      f.mpQueue = 0;
      f.baseMax = R.BASE_START;
      f.sites = 0;
      f.squads = Object.create(null); // squadId -> {key, n}
      f.squadCap = 0;
      f.flakL2 = false;
      f.flakL3 = false;
      f.recovered = { maxpower: 0, maxmil: 0, maxcommand: 0, maxextend: 0, flakL2: 0, flakL3: 0 };
      f.day = -1;
      f.poluToday = 0;
      f.poluPaid = false;
      f.quotaToday = 0;
      f.accels = []; // {t, total, res}
      f.fuelOut = false;
      f.burn = 0; // fuel units / second, for the HUD
      f.ai = null;
      f.counts = Object.create(null);
      f.hq = null;
      f.lost = 0;
      f.kills = 0;
      f.alive = true;
    },

    /* ---------- the frame: a few ticks a second ---------- */

    update(g, dt) {
      const day = Math.floor(g.time / R.CLOCK.CYCLE);
      for (let i = 0; i < 6; i++) {
        const f = g.factions[i];
        if (!f.alive) continue;
        if (f.day !== day) {
          f.day = day;
          this.newDay(g, f);
        }
        this.produce(g, f, dt);
        this.burnFuel(g, f, dt);
        // the books: recomputed a few times a second, not every frame
        f._capT = (f._capT || 0) - dt;
        if (f._capT <= 0) {
          f._capT = 0.3;
          this.recompute(g, f);
        }
      }
    },

    /* ---------- the day turns over ---------- */

    newDay(g, f) {
      // the sand blade quota resets: fifty a day at a tenth of the price
      f.quotaToday = 0;
      // the gold runners: ten in one day is one gold, once a day
      if (f.poluToday >= R.POLU_PER_DAY) {
        f.gold += R.GOLD_PER_POLU_DAY;
        f.poluPaid = true;
        if (f.id === 0) g.say(0, "The Gold Runners pay: +1 gold", "good");
      }
      f.poluToday = 0;
      f.poluPaid = false;
      // the free hours: one of steel a day under 1M, one of aluminium
      // once a second base is held
      if (f.res.steel < R.FREE_ACCEL_MAX) {
        f.accels.push({ t: R.ACCEL_HOUR, total: R.ACCEL_HOUR, res: "steel", free: true });
      }
      if (f.sites >= 2 && f.res.alu < R.FREE_ACCEL_MAX) {
        f.accels.push({ t: R.ACCEL_HOUR, total: R.ACCEL_HOUR, res: "alu", free: true });
      }
      if (f.id === 0) g.say(0, "A new day on the sand. The free production hours are running.", "");
    },

    /* ---------- production ---------- */

    // is this resource tripling right now?
    accelMult(f, resKey) {
      let m = 1;
      for (const a of f.accels) if (!a.res || a.res === resKey) m = 3;
      return m;
    },

    produce(g, f, dt) {
      const sites = Math.max(1, f.sites);
      const prod = R.productivity(sites);
      const over = f.ep - f.epMax > R.EP_TOLERANCE || f.mp - f.mpMax > R.MP_TOLERANCE;
      const min = dt / 60;
      for (const r of R.RES) {
        const k = r.key;
        let out = f.rate[k] * prod * this.accelMult(f, k) * min;
        // the store is a ceiling, not a hole
        out = Math.min(out, Math.max(0, f.store[k] - f.res[k]));
        f.res[k] += out;
      }
      // the ledgers run on
      for (let i = f.accels.length - 1; i >= 0; i--) {
        const a = f.accels[i];
        a.t -= dt;
        if (a.t <= 0) f.accels.splice(i, 1);
      }
      if (over) f.produceOut = g.time;
    },

    /* ---------- the fuel pool: moving is a burn ---------- */

    burnFuel(g, f, dt) {
      let burn = 0;
      for (const u of g.units) {
        if (u.dead || u.fac !== f.id || u.inside) continue;
        if (u.layer === 1) continue; // fixed wing runs on its own tank
        const sp = Math.hypot(u.vx, u.vy);
        if (sp < 6) continue;
        burn += (u.def.fuel || 0) * R.FUEL_BURN;
      }
      f.burn = burn;
      if (burn <= 0) {
        f.fuelOut = false;
        return;
      }
      f.res.fuel = Math.max(0, f.res.fuel - burn * dt);
      if (f.res.fuel <= 0) {
        if (!f.fuelOut) {
          f.fuelOut = true;
          if (f.id === 0) g.say(0, "The fuel pool is dry — the army stands still", "warn");
        }
      } else if (f.fuelOut && f.res.fuel > 2) {
        f.fuelOut = false;
        if (f.id === 0) g.say(0, "Fuel flows again", "good");
      }
    },

    /* ---------- the books ---------- */

    recompute(g, f) {
      const counts = f.counts;
      // stores: the ceiling the plants push against
      for (const r of R.RES) {
        f.store[r.key] = R.storageOf(r.key, counts[r.key] || 0, f.sites);
      }
      // the energy book: every plant level and every flak
      let ep = 0;
      for (const k in counts) {
        const n = counts[k] || 0;
        if (!n) continue;
        const def = R.BDEF[k];
        if (!def) continue;
        if (def.makes) ep += n * R.EP_PER_LVL[def.makes] * 1; // summed per level below
        if (def.flak) ep += n * R.EP_FLAK;
      }
      // the per-level sum: a plant at level 7 has paid 7 levels, not 7x1
      for (const b of g.buildings) {
        if (b.dead || b.fac !== f.id || !b.def.makes) continue;
        // b.lvl-1 levels already counted as `n * 1`; add the extra (lvl-1)
        ep += (b.lvl - 1) * R.EP_PER_LVL[b.def.makes];
      }
      f.ep = ep;
      f.epMax = R.EP_START + Math.min(R.EP_MAX_PLANTS, counts.maxpower || 0) * R.EP_POWERPLANT;
      // the military book: every standing unit, every queued one, and
      // the command centre itself stands in it too
      let mp = 0;
      for (const u of g.units) if (!u.dead && u.fac === f.id) mp += u.def.mp || 0;
      for (const b of g.buildings) if (!b.dead && b.fac === f.id) mp += b.def.mp || 0;
      f.mp = mp + (f.mpQueue || 0);
      f.mpMax =
        R.MP_START +
        Math.min(15, counts.maxmil || 0) * 100 +
        Math.min(4, counts.maxoffice || 0) * 500;
      // the base cap and the squad cap
      f.baseMax = R.BASE_START + Math.min(R.BASE_MAX_COMMAND, counts.maxcommand || 0);
      f.squadCap = Math.floor(R.groupLimit(f.sites) + (counts.maxgroup || 0));
      // the rates: what the plants pour out, per minute
      for (const r of R.RES) f.rate[r.key] = 0;
      for (const b of g.buildings) {
        if (b.dead || b.fac !== f.id || !b.built) continue;
        const def = b.def;
        if (!def.makes) continue;
        let rate = R.levelRate(def, b.lvl);
        if (def.onOil && b.onOil) rate *= def.onOil;
        f.rate[def.makes] += rate;
      }
      // storage shrinks when the energy book is a hundred over
      const over = f.ep - f.epMax > R.EP_TOLERANCE;
      if (over) for (const r of R.RES) f.store[r.key] = Math.round(f.store[r.key] * 0.1);
      f.produceStopped = over || f.mp - f.mpMax > R.MP_TOLERANCE;
    },

    /* ---------- the gold ledger ---------- */

    // price of the n-th copy of a gold building (the books get dearer)
    goldPrice(f, def) {
      const prices = def.goldCost || [def.cost.gold];
      const have = f.counts[def.key] || 0;
      return prices[Math.min(have, prices.length - 1)];
    },

    buyGoldItem(g, f, ledgerKey, placeAt) {
      const L = R.GOLD_LEDGER.find((x) => x.key === ledgerKey);
      if (L) return this.buyLedger(g, f, L, placeAt);
      // a placeable command building
      const def = R.BDEF[ledgerKey];
      if (!def || !def.goldBld) return "unknown item";
      if (this.countFor(f, def) >= (def.perSite ? 1 : def.max || 1)) return "limit reached";
      const price = this.goldPrice(f, def);
      if (f.gold < price) return "not enough gold";
      // instant: the books are paid here, and the tower is up at once
      const b = R.Base.place(
        g,
        ledgerKey,
        f.id,
        placeAt ? placeAt.tx : 0,
        placeAt ? placeAt.ty : 0,
        {
          instant: true,
        },
      );
      if (!b) return "no ground for it";
      f.gold -= price;
      return null;
    },

    buyLedger(g, f, L) {
      if (L.key === "flakArmor") {
        if (f.flakL2) return "already in plate";
        if (f.gold < L.cost) return "not enough gold";
        if (!this.flakClear(g, f)) return "an enemy is near your flaks";
        f.gold -= L.cost;
        f.flakL2 = true;
        this.applyFlak(g, f);
        if (f.id === 0) g.say(0, "The flaks are plated", "good");
        return null;
      }
      if (L.key === "flakWeapon") {
        if (!f.flakL2) return "plate the flaks first";
        if (f.flakL3) return "already the long gun";
        if (f.gold < L.cost) return "not enough gold";
        if (!this.flakClear(g, f)) return "an enemy is near your flaks";
        f.gold -= L.cost;
        f.flakL3 = true;
        this.applyFlak(g, f);
        if (f.id === 0) g.say(0, "The flaks grow long", "good");
        return null;
      }
      if (L.key === "instant") {
        if (f.gold < L.cost) return "not enough gold";
        for (const k of ["concrete", "steel", "alu"])
          if (f.res[k] >= 10000000) return "that store is already past 10M";
        f.gold -= L.cost;
        for (const k of ["concrete", "steel", "alu"]) f.res[k] += 30000000;
        if (f.id === 0) g.say(0, "Immediate resources: +30M of the three stores", "good");
        return null;
      }
      if (L.key.indexOf("accel") === 0) {
        if (f.gold < L.cost) return "not enough gold";
        f.gold -= L.cost;
        f.accels.push({ t: L.hours * R.ACCEL_HOUR, total: L.hours * R.ACCEL_HOUR, res: null });
        if (f.id === 0) g.say(0, "Production runs three times, for " + L.hours + "h", "good");
        return null;
      }
      return "unknown item";
    },

    // how many of a gold building count against its cap (per-site or total)
    countFor(f, def) {
      return f.counts[def.key] || 0;
    },

    // a flak upgrade waits for quiet: no enemy unit, seen or unseen,
    // near any of the company's flaks. No flak standing means nothing to
    // plate, so the gate is shut.
    flakClear(g, f) {
      let any = false;
      for (const b of g.buildings) {
        if (b.dead || b.fac !== f.id || !b.def.flak) continue;
        any = true;
        let near = false;
        g.grid.query(b.x, b.y, 900, (o) => {
          if (o.dead || o.kind !== "u") return;
          if (!R.hostileTo(f.id, o.fac)) return;
          near = true;
        });
        if (near) return false;
      }
      return any;
    },

    // plate and range for every standing flak of the faction
    applyFlak(g, f) {
      const st = R.flakStats(f.flakL2, f.flakL3);
      for (const b of g.buildings) {
        if (b.dead || b.fac !== f.id || !b.def.flak) continue;
        // plate buys room; damage taken above the new ceiling is forgiven,
        // damage taken below it stays. That is how upgrades feel.
        const frac = b.hp / b.maxHp;
        b.maxHp = st.hp;
        b.hp = Math.min(st.hp, Math.max(1, b.hp));
        b.hp = Math.max(1, Math.round(Math.max(frac, b.hp / st.hp) * st.hp));
        b.arm = st.arm;
        if (b.w)
          b.w = Object.assign({}, b.w, { dmg: st.dmg, rof: st.rof, range: st.range, pen: st.pen });
      }
    },

    /* ---------- the sand blade quota ---------- */

    // the price of a unit right now: the home ground's daily quota pays
    // a tenth of the price for fifty Sand Blades
    unitCost(g, f, key) {
      const ud = R.UDEF[key];
      const cost = Object.assign({}, ud.cost);
      if (key === "sandblade" && f.day >= 0) {
        const homeSite = f.hqSite;
        const fromHome = homeSite && this.siteOf(g, f, homeSite);
        if (fromHome && f.quotaToday < R.QUOTA_PER_DAY) {
          for (const k in cost) cost[k] = Math.round(cost[k] * (ud.quota ? ud.quota.mul : 0.1));
        }
      }
      return cost;
    },

    /* ---------- recovery after a fall ---------- */

    // a base has fallen: what of its command can the purse buy back?
    recoverLost(f, b, wasFlak) {
      const rec = f.recovered;
      if (b.key === "maxpower") rec.maxpower++;
      else if (b.key === "maxmil") rec.maxmil++;
      else if (b.key === "maxcommand") rec.maxcommand++;
      else if (b.key === "maxextend") rec.maxextend++;
      if (wasFlak) {
        if (f.flakL2) rec.flakL2 = 1;
        if (f.flakL3) rec.flakL3 = 1;
      }
    },

    recoverBuy(g, f, key) {
      const rec = f.recovered;
      const cost = key === "maxextend" || key === "flakL2" || key === "flakL3" ? R.FLAK_RECOVER : 1;
      if (rec[key] <= 0) return "nothing lost";
      if (f.gold < cost) return "not enough gold";
      f.gold -= cost;
      rec[key]--;
      if (key === "flakL2") {
        f.flakL2 = true;
        f.flakL3 = false;
      }
      if (key === "flakL3") {
        f.flakL2 = true;
        f.flakL3 = true;
      }
      this.applyFlak(g, f);
      return null;
    },

    /* ---------- helpers ---------- */

    siteOf(g, f, site) {
      return site && site.owner === f.id;
    },
  };

  R.Economy = Economy;
})();
