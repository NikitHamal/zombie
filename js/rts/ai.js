/* SANDSTORM — the other nations.

   Five nations on the same map, and none of them are waiting politely for
   you. Each has a personality that decides what it builds, what it
   attacks with, and how early it comes: the Iron Pact rushes, the Azure
   League booms and then grinds you down, the Sand Union spreads, the
   Crimson Front lives in the air, the Jade Accord owns the water.

   They are not only fighting you. A nation picks the nearest settlement
   it cannot call its own — yours, or another nation's, or a yellow base
   held by nobody — and goes for it. Two of them start as your allies and
   will not raise a hand to you, which means the map has sides as well as
   enemies.

   They play by the same rules as you: the same books, the same caps, the
   same flaks. They earn a little gold a minute the way the original's
   other players do, and spend it where it wins — power, points, plate. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE;

  function value(u) {
    return (u.def.mp || 1) * 12 + u.maxHp * 0.02;
  }

  const AI = {
    setup(g) {
      g.ai = [];
      for (let i = 1; i <= 5; i++) {
        const cfg = R.NATION_SETUP[i];
        const persona = R.PERSONA[cfg.persona];
        const ai = {
          fac: i,
          persona: cfg.persona,
          p: persona,
          name: cfg.name,
          t: Math.random() * 0.8,
          nextWave: persona.first,
          wave: 0,
          army: [],
          expansionT: 40 + Math.random() * 60,
          upgradeT: 90,
          target: null,
          lastThink: -9,
        };
        g.factions[i].ai = ai;
        g.ai.push(ai);
        this.buildStarter(g, ai, g.factions[i].hqSite);
      }
    },

    /* ---------- the opening base ---------- */

    buildStarter(g, ai, site) {
      if (!site) return;
      const f = ai.fac;
      const cx = site.tx,
        cy = site.ty;
      const p = ai.p;
      const put = (key, dx, dy, lvl) => g.addBuilding(key, f, cx + dx, cy + dy, lvl || 1, true);
      put("hq", -2, -3, 1);
      put("concrete", 3, -3, 2);
      put("steel", 3, 1, 2);
      put("oil", -5, 3, 1);
      if (p.eco > 1.1) put("alu", -5, -1, 1);
      put("works", -5, -5, 1);
      if (p.air > 1 && (site.kind === "air" || site.home)) put("airfield", 2, -6, 1);
      if (p.air > 1 && p.sea <= 1 && site.kind === "copter") put("heli", 2, -6, 1);
      if (p.sea > 1) {
        const w = this.findWater(g, site, 16);
        if (w) put("shipyard", w.tx - cx, w.ty - cy, 1);
      }
      // the gate faces the map centre, and the flaks arc over the mouth
      const R0 = 7;
      let best = null,
        bd = 1e18;
      for (const s of g.t.sites) {
        if (s === site) continue;
        const d = (s.tx - cx) ** 2 + (s.ty - cy) ** 2;
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      // a unit axis toward the nearest other settlement — the gate
      // opens there, and the flaks arc across the mouth
      let ux = best ? best.tx - cx : 1,
        uy = best ? best.ty - cy : 0;
      if (Math.abs(ux) >= Math.abs(uy)) {
        ux = ux < 0 ? -1 : 1;
        uy = 0;
      } else {
        ux = 0;
        uy = uy < 0 ? -1 : 1;
      }
      if (!ux && !uy) ux = 1;
      const vx = -uy,
        vy = ux;
      const gw = 3;
      for (let k = -(gw >> 1); k <= gw >> 1; k++)
        put("gate", Math.round(ux * R0 + vx * k), Math.round(uy * R0 + vy * k), 1);
      for (let a = -R0; a <= R0; a++) {
        for (const [dx, dy] of [
          [a, -R0],
          [a, R0],
          [-R0, a],
          [R0, a],
        ]) {
          let doorway = false;
          for (let k = -(gw >> 1); k <= gw >> 1; k++)
            if (dx === Math.round(ux * R0 + vx * k) && dy === Math.round(uy * R0 + vy * k))
              doorway = true;
          if (doorway) continue;
          put("wall", dx, dy, 1);
        }
      }
      site.ux = ux;
      site.uy = uy;
      site.gateX = (cx + ux * R0 + 0.5) * TILE;
      site.gateY = (cy + uy * R0 + 0.5) * TILE;
      // the flak arc and a little point defence
      const flaks = 6 + Math.round((p.turret || 1) * 3);
      for (let i = 0; i < flaks; i++) {
        const th = -2.6 + (5.2 * i) / (flaks - 1);
        put(
          "flak",
          Math.round((ux * Math.cos(th) - uy * Math.sin(th)) * 5),
          Math.round((ux * Math.sin(th) + uy * Math.cos(th)) * 5),
          1,
        );
      }
      put("mg", Math.round(ux * 4 - vx * 2), Math.round(uy * 4 - vy * 2), 1);
      put("atgun", Math.round(ux * 4 + vx * 2), Math.round(uy * 4 + vy * 2), 1);
      // a garrison
      const spots = [];
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const x = (cx + dx + 0.5) * TILE,
            y = (cy + dy + 0.5) * TILE;
          if (g.nav.openAt(x, y, 0, f)) spots.push({ x, y });
        }
      if (spots.length) {
        const give = (key, n) => {
          for (let i = 0; i < n; i++) {
            const pt = spots[(i * 3 + 1) % spots.length];
            const u = g.addUnit(key, f, pt.x, pt.y);
            if (u) R.Entity.setOrder(g, u, { type: "hold", x: pt.x, y: pt.y });
          }
        };
        give("gnasher", 3);
        give("lynx", 2);
        give("mgmc", 1);
      }
    },

    findWater(g, site, r) {
      for (let rr = 4; rr <= r; rr++) {
        const n = rr * 8;
        for (let k = 0; k < n; k++) {
          const an = (k / n) * R.TAU;
          const tx = Math.round(site.tx + Math.cos(an) * rr);
          const ty = Math.round(site.ty + Math.sin(an) * rr);
          if (g.t.canBuild(tx, ty, 3, { water: true })) return { tx, ty };
        }
      }
      return null;
    },

    /* ---------- the frame ---------- */

    update(g, dt) {
      if (!g.ai) this.setup(g);
      for (const ai of g.ai) {
        ai.t -= dt;
        if (ai.t > 0) continue;
        const step = 0.7 + Math.random() * 0.4;
        ai.t = step;
        this.think(g, ai, step);
      }
    },

    think(g, ai, dt) {
      const f = g.factions[ai.fac];
      if (!f.alive) return;
      // the other players' purses: a little gold, always
      f.gold += dt / 60;
      this.industry(g, ai, f);
      this.goldShop(g, ai, f);
      this.defend(g, ai);
      this.produce(g, ai);
      this.reinforce(g, ai);
      this.expand(g, ai, dt);
      this.attack(g, ai, dt);
    },

    /* ---------- buildings ---------- */

    // where can this nation put a building? inside its own ground, on the
    // kind of ground the building wants
    spotFor(g, fac, key, near) {
      const def = R.BDEF[key];
      const size = def.size;
      let sites = g.t.sites.filter((s) => s.owner === fac);
      if (def.site) {
        const right = sites.filter(
          (s) => def.site.indexOf(s.kind) >= 0 || (key === "works" && s.home),
        );
        if (right.length) sites = right;
      }
      sites.sort((a, b) => {
        if (!near) return 0;
        return R.dist2(a.x, a.y, near.x, near.y) - R.dist2(b.x, b.y, near.x, near.y);
      });
      const opts = { water: def.water, rail: def.rail };
      for (const s of sites) {
        const r = s.r + 2;
        for (let k = 0; k < 30; k++) {
          const an = Math.random() * R.TAU;
          const rr = Math.random() * r;
          const tx = Math.round(s.tx + Math.cos(an) * rr - size / 2);
          const ty = Math.round(s.ty + Math.sin(an) * rr - size / 2);
          if (!g.t.canBuild(tx, ty, size, opts)) continue;
          let mine = true;
          for (let dy = 0; dy < size && mine; dy++)
            for (let dx = 0; dx < size; dx++) {
              if (g.t.ownerAt((tx + dx + 0.5) * TILE, (ty + dy + 0.5) * TILE) !== fac) {
                if (!(def.wall && g.t.ownerAt((tx + 0.5) * TILE, (ty + 0.5) * TILE) === fac))
                  mine = false;
              }
            }
          if (!mine) continue;
          let clear = true;
          for (const b of g.buildings) {
            if (b.dead || b.fac !== fac) continue;
            if (Math.abs(b.tx - tx) < size + 1 && Math.abs(b.ty - ty) < b.size + 1) clear = false;
          }
          if (!clear) continue;
          return { tx, ty };
        }
      }
      return null;
    },

    industry(g, ai, f) {
      const p = ai.p;
      const wants = [
        ["concrete", Math.max(2, Math.round(4 * p.eco))],
        ["steel", Math.max(2, Math.round(4 * p.eco))],
        ["oil", Math.max(1, Math.round(3 * p.eco))],
        ["alu", Math.max(1, Math.round(2.5 * p.eco))],
        ["works", Math.max(1, Math.round(2 * p.army))],
      ];
      if (p.air > 1) wants.push(["airfield", Math.round(2 * p.air * 0.6)]);
      if (p.air > 1.3) wants.push(["heli", 1]);
      if (p.sea > 1) wants.push(["shipyard", Math.round(1.5 * p.sea * 0.6)]);
      // a railyard, when the doctrine carries trains and the ground allows
      const wantsTrains = (p.mix || []).some((m) => R.UDEF[m[0]] && R.UDEF[m[0]].train);
      if (wantsTrains) wants.push(["trainyard", 1]);

      for (const [key, want] of wants) {
        const have = f.counts[key] || 0;
        if (have >= want) continue;
        const def = R.BDEF[key];
        if (!g.canPay(ai.fac, def.cost)) continue;
        const spot = this.spotFor(g, ai.fac, key);
        if (!spot) continue;
        g.pay(ai.fac, def.cost);
        g.addBuilding(key, ai.fac, spot.tx, spot.ty, 1, false);
        return; // one at a time, like a player
      }

      // defences at the settlements we hold
      const gunWant = Math.max(3, Math.round((p.turret || 1) * 4 * Math.max(1, f.sites)));
      const guns = ["flak", "atgun", "mg", "howitzer"];
      for (const key of guns) {
        const have = f.counts[key] || 0;
        if (have >= gunWant) continue;
        const def = R.BDEF[key];
        if (!g.canPay(ai.fac, def.cost)) continue;
        const front = this.frontierSite(g, ai.fac);
        const spot = this.spotFor(g, ai.fac, key, front);
        if (!spot) continue;
        g.pay(ai.fac, def.cost);
        g.addBuilding(key, ai.fac, spot.tx, spot.ty, 1, false);
        return;
      }

      // and every so often, deepen what we already have
      ai.upgradeT -= 0.8;
      if (ai.upgradeT <= 0) {
        ai.upgradeT = 60 + Math.random() * 60;
        const cands = g.buildings.filter(
          (b) => !b.dead && b.fac === ai.fac && b.built && !b.upgrading && R.Base.upCostFor(g, b),
        );
        if (cands.length) {
          cands.sort((a, b) => (b.def.makes ? b.lvl : 0) - (a.def.makes ? a.lvl : 0));
          const b = cands[(Math.random() * Math.min(4, cands.length)) | 0];
          R.Base.startUpgrade(g, b);
        }
      }
    },

    /* ---------- the gold purse ---------- */

    goldShop(g, ai, f) {
      const buy = (key) => {
        const shop = R.GOLD_SHOP.find((x) => x.key === key);
        if (!shop) return false;
        if ((f.counts[key] || 0) >= shop.max) return false;
        const def = R.BDEF[key];
        const price = R.Economy.goldPrice(f, def);
        if (f.gold < price + 15) return false; // keep a margin
        const spot = this.spotFor(g, ai.fac, key, this.frontierSite(g, ai.fac));
        if (!spot) return false;
        const b = R.Base.place(g, key, ai.fac, spot.tx, spot.ty, {});
        return !!b;
      };
      if (f.ep > f.epMax * 0.55 && (f.counts.maxpower || 0) < 8) buy("maxpower");
      else if ((f.counts.maxmil || 0) < 6) buy("maxmil");
      else if ((f.counts.crane || 0) < 2) buy("crane");
      else if ((f.counts.sight || 0) < 2) buy("sight");
      // the flak upgrades, when the purse is thick and the guns are quiet
      if (!f.flakL2 && f.gold >= 70 && R.Economy.flakClear(g, f))
        R.Economy.buyLedger(
          g,
          f,
          R.GOLD_LEDGER.find((l) => l.key === "flakArmor"),
        );
      else if (f.flakL2 && !f.flakL3 && f.gold >= 150 && R.Economy.flakClear(g, f))
        R.Economy.buyLedger(
          g,
          f,
          R.GOLD_LEDGER.find((l) => l.key === "flakWeapon"),
        );
    },

    /* ---------- production ---------- */

    produce(g, ai) {
      const f = g.factions[ai.fac];
      const mix = ai.p.mix;
      for (const b of g.buildings) {
        if (b.dead || b.fac !== ai.fac || !b.built || b.upgrading) continue;
        const list = R.PRODUCES[b.key];
        if (!list) continue;
        if (b.queue.length >= 3) continue;
        // never spend the purse dry: the walls and the plants come next,
        // so a unit only leaves the queue if the books survive it
        const canBuy = (k) => {
          const c = R.Economy.unitCost(g, f, k);
          for (const r in c) if (f.res[r] < c[r] * 1.05 + 5000) return false;
          return true;
        };
        // the doctrine's list, narrowed to what the books can carry; a
        // young purse works the cheap end of the menu until the heavy
        // things arrive
        let opts = mix.filter((m) => list.indexOf(m[0]) >= 0 && canBuy(m[0]));
        if (!opts.length) opts = list.map((k) => [k, 1]).filter(([k]) => canBuy(k));
        if (!opts.length) continue;
        let tw = 0;
        for (const o of opts) tw += o[1];
        let r = Math.random() * tw,
          key = opts[0][0];
        for (const o of opts) {
          r -= o[1];
          if (r <= 0) {
            key = o[0];
            break;
          }
        }
        if (g.countUnits(ai.fac, key) > 4 + ai.wave * 0.6 && Math.random() < 0.6) continue;
        R.Base.queueItem(g, b, key);
      }
    },

    /* ---------- defence ---------- */

    frontierSite(g, fac) {
      let best = null,
        bd = 1e18;
      for (const s of g.t.sites) {
        if (s.owner !== fac) continue;
        let near = 1e18;
        for (const o of g.t.sites) {
          if (o === s || o.owner === fac) continue;
          if (o.owner >= 0 && !R.hostileTo(fac, o.owner)) continue;
          near = Math.min(near, R.dist2(s.x, s.y, o.x, o.y));
        }
        if (near < bd) {
          bd = near;
          best = s;
        }
      }
      return best || g.t.sites.find((s) => s.owner === fac);
    },

    defend(g, ai) {
      for (const s of g.t.sites) {
        if (s.owner !== ai.fac) continue;
        let threat = null,
          td = 1e18;
        g.grid.query(s.x, s.y, s.r * TILE, (o) => {
          if (o.dead || o.kind !== "u" || o.fac === ai.fac) return;
          if (!R.hostileTo(ai.fac, o.fac)) return;
          const d = R.dist2(o.x, o.y, s.x, s.y);
          if (d < td) {
            td = d;
            threat = o;
          }
        });
        if (!threat) continue;
        let gathered = 0;
        for (const u of g.units) {
          if (u.dead || u.fac !== ai.fac || u.inside) continue;
          if (!u.def.mp) continue;
          if (u.order && u.order.type === "attack" && u.order.tgt && !u.order.tgt.dead) continue;
          const d = R.dist2(u.x, u.y, s.x, s.y);
          if (d > Math.pow(s.r * TILE + 900, 2)) continue;
          if (d < Math.pow(s.r * TILE * 1.4, 2) && (!u.order || u.order.type === "hold")) continue;
          R.Entity.setOrder(g, u, { type: "amove", x: threat.x, y: threat.y });
          gathered++;
          if (gathered > 24) break;
        }
        if (gathered > 3 && s === g.factions[ai.fac].hqSite) {
          ai.alarmed = g.time;
        }
      }
    },

    reinforce(g, ai) {
      if (Math.random() > 0.25) return;
      const front = this.frontierSite(g, ai.fac);
      if (!front) return;
      let idle = 0;
      for (const u of g.units) {
        if (u.dead || u.fac !== ai.fac || u.inside) continue;
        if (!u.def.mp) continue;
        if (u.order) continue;
        idle++;
      }
      if (idle <= 6) return;
      let sent = 0;
      for (const u of g.units) {
        if (u.dead || u.fac !== ai.fac || u.inside) continue;
        if (!u.def.mp || u.order) continue;
        const an = Math.random() * R.TAU,
          rr = Math.random() * front.r * TILE * 0.7;
        R.Entity.setOrder(g, u, {
          type: "amove",
          x: front.x + Math.cos(an) * rr,
          y: front.y + Math.sin(an) * rr,
        });
        if (++sent > 4) break;
      }
    },

    /* ---------- expansion ---------- */

    expand(g, ai, dt) {
      ai.expansionT -= dt;
      if (ai.expansionT > 0) return;
      ai.expansionT = (70 + Math.random() * 80) / (ai.p.expand || 1);
      const trucks = g.units.filter(
        (u) => !u.dead && u.fac === ai.fac && u.def.capture && u.layer === 0 && !u.order,
      );
      let truck = trucks[0];
      if (!truck) {
        for (const b of g.buildings) {
          if (b.dead || b.fac !== ai.fac || b.key !== "works" || !b.built) continue;
          if (b.queue.some((q) => q.key === "apc")) continue;
          if (R.Base.queueItem(g, b, "apc")) break;
        }
        return;
      }
      // the truck mops up ground the flaks have already left. Defended
      // ground is the army's problem — the raid sends the trucks along.
      let best = null,
        bd = 1e18;
      for (const s of g.t.sites) {
        if (s.owner === ai.fac || !s.open) continue;
        if (s.owner >= 0 && !R.hostileTo(ai.fac, s.owner)) continue;
        const d = R.dist2(s.x, s.y, truck.x, truck.y);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      if (best) R.Entity.setOrder(g, truck, { type: "capture", site: best, x: best.x, y: best.y });
    },

    /* ---------- attack ---------- */

    attack(g, ai, dt) {
      ai.nextWave -= dt;
      if (ai.nextWave > 0) return;
      const f = g.factions[ai.fac];

      const army = [];
      let val = 0;
      for (const u of g.units) {
        if (u.dead || u.fac !== ai.fac || u.inside) continue;
        if (!u.def.mp) continue;
        if (u.def.capture || u.def.givesAmmo) continue;
        if (u.order && u.order.type === "attack") continue;
        army.push(u);
        val += value(u);
      }
      // a raid is a column, not a scout: it needs to be big enough to
      // trade with the flaks and still have wheels left at the door
      const bar = 1600 * ai.p.army + ai.wave * 400 + f.sites * 200;
      if (val < bar || army.length < 5) {
        ai.nextWave = 18;
        return;
      }

      const target = this.pickTarget(g, ai, army);
      if (!target) {
        ai.nextWave = 25;
        return;
      }
      ai.wave++;
      ai.nextWave = ai.p.wave * (0.85 + Math.random() * 0.4);
      ai.target = target;

      // send the army in THROUGH the gate. Parked at the mouth of it,
      // a column is outside every gun on both sides and the raid is
      // over before it started. So each gun in the yard gets a share of
      // the column, and the rest walks for the centre.
      const guns = g.buildings.filter(
        (b) =>
          !b.dead &&
          b.site === target &&
          b.fac !== ai.fac &&
          (b.def.turret || b.key === "hq") &&
          R.hostileTo(ai.fac, b.fac),
      );
      const list = army.slice(0, 60);
      if (guns.length) {
        for (let i = 0; i < list.length; i++) {
          const tgt = guns[i % guns.length];
          R.Entity.setOrder(g, list[i], { type: "attack", tgt, x: tgt.x, y: tgt.y });
        }
      } else {
        R.Entity.assignFormation(g, list, { type: "amove", x: target.x, y: target.y });
      }
      this.sendTrucks(g, ai, target);
      if (target.owner === 0) {
        g.say(ai.fac, ai.name + " is moving on " + (target.name || "your ground"), "warn");
        R.FX.ping(g, target.x, target.y, "bad");
        if (R.Cam) R.Cam.shake(3);
      }
    },

    // The trucks are the point of a raid, not the baggage. They follow
    // the army to the objective and turn the flag once the yard is open —
    // flaks down, ground ownerless.
    sendTrucks(g, ai, target) {
      let sent = 0;
      const coastal = g.t.waterNear(target.tx, target.ty, 16);
      for (const u of g.units) {
        if (u.dead || u.fac !== ai.fac || u.inside) continue;
        if (!u.def.capture) continue;
        if (u.def.cls === "sea" && !coastal) continue;
        if (u.order && u.order.type === "capture" && u.order.site === target) continue;
        R.Entity.setOrder(g, u, { type: "capture", site: target, x: target.x, y: target.y });
        if (++sent >= 3) break;
      }
    },

    pickTarget(g, ai, army) {
      let ax = 0,
        ay = 0,
        n = 0;
      for (const u of army) {
        ax += u.x;
        ay += u.y;
        n++;
      }
      if (n) {
        ax /= n;
        ay /= n;
      } else return null;

      let best = null,
        bs = -1e18;
      for (const s of g.t.sites) {
        if (s.owner === ai.fac) continue;
        if (s.owner >= 0 && !R.hostileTo(ai.fac, s.owner)) continue;
        // the first raid of the war: the aggressive ones test the
        // player's flaks at the gate — the rest take the yellow ground
        // in between first, and grow strong enough to be a problem
        if (ai.wave === 0) {
          if (s.home) {
            if (s.owner === 0 && ai.p.aggro >= 1) return s;
            continue;
          }
        }
        const d = R.dist(ax, ay, s.x, s.y);
        let score = -d * 0.0016;
        if (s.owner === 0) score += 1.2 + ai.wave * 0.4 + ai.p.aggro * 0.6;
        if (s.home) score += 0.3;
        // ownerless ground is free — take it without a fight
        if (s.owner < 0 && s.open) score += 1.5;
        // the other nations already marching here get first blood —
        // three armies on one yard is a funeral for all of them
        let wanters = 0;
        for (const o of g.ai) {
          if (o === ai || !R.hostileTo(ai.fac, o.fac)) continue;
          if (o.target === s) wanters++;
        }
        score -= wanters * 1.1;
        // and a soft target is a tempting one
        let guard = 0;
        g.grid.query(s.x, s.y, s.r * TILE, (o) => {
          if (o.dead || o.kind !== "u") return;
          if (o.fac === s.owner) guard += value(o);
        });
        score -= guard * 0.004;
        if (score > bs) {
          bs = score;
          best = s;
        }
      }
      return best;
    },
  };

  R.AI = AI;
})();
