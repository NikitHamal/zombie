/* Desert Order — the other nations.

   Five nations on the same map, and none of them are waiting politely for
   you. Each has a personality that decides what it builds, what it
   attacks with, and how early it comes: the Iron Pact rushes, the Azure
   League booms and then grinds you down, the Crimson Front lives in the
   air, the Jade Accord owns the water, the Sand Union spreads.

   They are not only fighting you. A nation picks the nearest settlement it
   cannot call its own — yours, or another nation's — and goes for it. Two
   of them start as your allies and will not raise a hand to you, which
   means the map has sides as well as enemies.

   The AI thinks four times a second, one nation per tick, and never does
   anything a player could not do: it pays for buildings out of the same
   stores, it queues units in the same factories, and it issues the same
   orders. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE;

  function value(u) {
    return (u.def.pop || 1) * 12 + u.maxHp * 0.02;
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
        this.buildStarter(g, ai, g.factions[i].hq);
      }
    },

    /* ---------- the opening base ---------- */

    buildStarter(g, ai, site) {
      if (!site) return;
      const f = ai.fac;
      const cx = site.tx,
        cy = site.ty;
      const put = (key, dx, dy, lvl) => g.addBuilding(key, f, cx + dx, cy + dy, lvl || 1, true);
      put("hq", -2, -2, 1);
      put("concrete", 3, -3, 1);
      put("steelmill", 3, 0, 1);
      put("refinery", -5, 3, 1);
      put("works", -5, -5, 1);
      if (ai.p.air > 1) put("airfield", -5, 2, 1);
      if (ai.p.sea > 1) {
        // find water and put the slipway on it
        const w = this.findWater(g, site, 14);
        if (w) put("shipyard", w.tx - cx, w.ty - cy, 1);
      }
      // a ring of wall, with a gate facing the map centre
      const R0 = 7;
      const ring = [];
      for (let a = -R0; a <= R0; a++) ring.push([a, -R0], [a, R0], [-R0, a], [R0, a]);
      for (const [dx, dy] of ring) {
        if (dx === 0 && dy === -R0) {
          put("gate", dx, dy, 1);
          continue;
        }
        put("wall", dx, dy, 1);
      }
      put("mgnest", -R0 + 1, -R0 + 1, 1);
      put("atgun", R0 - 2, R0 - 2, 1);
      put("flaktower", R0 - 2, -R0 + 1, 1);
      if (ai.p.turret) {
        put("mgnest", R0 - 2, 1, 1);
        put("flaktower", -R0 + 1, 1, 1);
        put("atgun", 1, R0 - 2, 1);
      }
      // a garrison
      const spots = [];
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const x = (cx + dx + 0.5) * TILE,
            y = (cy + dy + 0.5) * TILE;
          if (g.nav.openAt(x, y, 0)) spots.push({ x, y });
        }
      if (spots.length) {
        const give = (key, n) => {
          for (let i = 0; i < n; i++) {
            const p = spots[(i * 3 + 1) % spots.length];
            g.addUnit(key, f, p.x, p.y);
          }
        };
        give("ltank", 3);
        give("scout", 2);
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
        // one think per tick, and the tick length is handed down so the
        // expansion and attack clocks run on real time, not on a guess
        const step = 0.7 + Math.random() * 0.4;
        ai.t = step;
        this.think(g, ai, step);
      }
    },

    think(g, ai, dt) {
      const f = g.factions[ai.fac];
      if (!f.alive) return;
      this.industry(g, ai, f);
      this.defend(g, ai);
      this.produce(g, ai);
      this.reinforce(g, ai);
      this.expand(g, ai, dt);
      this.attack(g, ai, dt);
    },

    /* ---------- buildings ---------- */

    // where can this nation put a building? inside its own ground, near a
    // settlement it holds, on flat open tiles
    spotFor(g, fac, key, size, near) {
      const def = R.BDEF[key];
      size = size || def.size;
      const sites = g.t.sites.filter((s) => s.owner === fac);
      sites.sort((a, b) => {
        if (!near) return 0;
        return R.dist2(a.x, a.y, near.x, near.y) - R.dist2(b.x, b.y, near.x, near.y);
      });
      for (const s of sites) {
        const r = s.r + 2;
        for (let k = 0; k < 26; k++) {
          const an = Math.random() * R.TAU;
          const rr = Math.random() * r;
          const tx = Math.round(s.tx + Math.cos(an) * rr - size / 2);
          const ty = Math.round(s.ty + Math.sin(an) * rr - size / 2);
          if (!g.t.canBuild(tx, ty, size, { water: def.water })) continue;
          // and it has to be ours
          let mine = true;
          for (let dy = 0; dy < size && mine; dy++)
            for (let dx = 0; dx < size; dx++) {
              if (g.t.ownerAt((tx + dx + 0.5) * TILE, (ty + dy + 0.5) * TILE) !== fac) {
                if (
                  !(R.BDEF[key].wall && g.t.ownerAt((tx + 0.5) * TILE, (ty + 0.5) * TILE) === fac)
                )
                  mine = false;
              }
            }
          if (!mine) continue;
          // keep a little space between buildings so the base reads as a base
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
      // what we would like to own, roughly in order
      const wants = [
        ["concrete", Math.max(2, Math.round(4 * p.eco))],
        ["steelmill", Math.max(2, Math.round(4 * p.eco))],
        ["refinery", Math.max(1, Math.round(3 * p.eco))],
        ["aluworks", Math.max(1, Math.round(2.5 * p.eco))],
        ["power", Math.round(2 * p.eco)],
        ["depot", 1],
        ["works", Math.max(1, Math.round(2 * p.army))],
        ["radar", 1],
        ["repair", 1],
      ];
      if (p.air > 1) wants.push(["airfield", Math.round(2 * p.air * 0.6)]);
      if (p.sea > 1) wants.push(["shipyard", Math.round(1.5 * p.sea * 0.6)]);

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
      const gunWant = Math.max(3, Math.round((p.turret || 1) * 4 * f.sites));
      const guns = ["flaktower", "atgun", "mgnest", "howitzer", "sam"];
      for (const key of guns) {
        const have = f.counts[key] || 0;
        if (have >= gunWant) continue;
        const def = R.BDEF[key];
        if (!g.canPay(ai.fac, def.cost)) continue;
        // guns go on the frontier: the settlement nearest an enemy
        const front = this.frontierSite(g, ai.fac);
        const spot = this.spotFor(g, ai.fac, key, def.size, front);
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
          const b = cands[(Math.random() * cands.length) | 0];
          R.Base.startUpgrade(g, b);
        }
      }
    },

    /* ---------- production ---------- */

    produce(g, ai) {
      const mix = ai.p.mix;
      for (const b of g.buildings) {
        if (b.dead || b.fac !== ai.fac || !b.built || b.upgrading) continue;
        const list = R.PRODUCES[b.key];
        if (!list) continue;
        if (b.queue.length >= 3) continue;
        // pick a unit from this factory's list that the persona likes
        const opts = mix.filter((m) => list.indexOf(m[0]) >= 0);
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
        // do not drown in one thing: if we have plenty of it, try again
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
          if (o === s || o.owner < 0 || o.owner === fac) continue;
          if (!R.hostileTo(fac, o.owner)) continue;
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
      // if one of our settlements has company, everything nearby goes home
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
        // gather the defenders: anything of ours within a long march
        let gathered = 0;
        for (const u of g.units) {
          if (u.dead || u.fac !== ai.fac || u.inside) continue;
          if (u.def.pop === 0) continue;
          if (u.order && u.order.type === "attack" && u.order.tgt && !u.order.tgt.dead) continue;
          const d = R.dist2(u.x, u.y, s.x, s.y);
          if (d > Math.pow(s.r * TILE + 900, 2)) continue;
          if (d < Math.pow(s.r * TILE * 1.4, 2) && (!u.order || u.order.type === "hold")) continue; // already home
          R.Entity.setOrder(g, u, { type: "amove", x: threat.x, y: threat.y });
          gathered++;
          if (gathered > 24) break;
        }
        if (gathered > 3 && s === g.factions[ai.fac].hq) {
          ai.alarmed = g.time;
        }
      }
    },

    reinforce(g, ai) {
      // park a few things at the frontier when there is nothing to do
      if (Math.random() > 0.25) return;
      const front = this.frontierSite(g, ai.fac);
      if (!front) return;
      let idle = 0;
      for (const u of g.units) {
        if (u.dead || u.fac !== ai.fac || u.inside) continue;
        if (u.def.pop === 0) continue;
        if (u.order) continue;
        idle++;
      }
      if (idle <= 6) return;
      let sent = 0;
      for (const u of g.units) {
        if (u.dead || u.fac !== ai.fac || u.inside) continue;
        if (u.def.pop === 0 || u.order) continue;
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
      // a conquest truck, then send it at the nearest free settlement
      const trucks = g.units.filter(
        (u) => !u.dead && u.fac === ai.fac && u.def.capture && !u.order,
      );
      let truck = trucks[0];
      if (!truck) {
        for (const b of g.buildings) {
          if (b.dead || b.fac !== ai.fac || b.key !== "works" || !b.built) continue;
          if (R.Base.queueItem(g, b, "truck")) break;
        }
        return;
      }
      // nearest settlement that is not ours
      let best = null,
        bd = 1e18;
      for (const s of g.t.sites) {
        if (s.owner === ai.fac) continue;
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

      // gather everything that is armed and not busy defending
      const army = [];
      let val = 0;
      for (const u of g.units) {
        if (u.dead || u.fac !== ai.fac || u.inside) continue;
        if (u.def.pop === 0) continue;
        if (u.def.capture || u.def.repair) continue;
        if (u.order && u.order.type === "attack") continue;
        if (u.order && u.order.defend) continue;
        army.push(u);
        val += value(u);
      }
      // the bar rises as the game goes on, and with how much we own
      const bar = 90 * ai.p.army + ai.wave * 22 + f.sites * 10;
      if (val < bar) {
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

      // send the army: attack-move on the objective, in one formation.
      // A walled yard is attacked at its door — the mouth of the gate is
      // where the defenders' guns are, and it is the only way in worth
      // the walk. Wall-less yards are simply overrun.
      let ax = target.x,
        ay = target.y;
      if (target.gateX !== undefined) {
        ax = target.gateX - (target.ux || 0) * 140;
        ay = target.gateY - (target.uy || 0) * 140;
      } else if (target.owner >= 0) {
        // somebody's home: their HQ is the objective — the ground does
        // not turn until it falls, so that is where the army goes
        const hq = g.buildings.find((b) => !b.dead && b.fac === target.owner && b.key === "hq");
        if (hq) {
          ax = hq.x;
          ay = hq.y;
        }
      }
      const list = army.slice(0, 60);
      R.Entity.assignFormation(g, list, { type: "amove", x: ax, y: ay });
      // and the trucks go with them. The tanks are there to open the
      // gate; the truck is the thing that actually takes the ground.
      this.sendTrucks(g, ai, target);
      // and tell the world, if it concerns the player
      if (target.owner === 0 || (target.kind === "b" && target.fac === 0)) {
        g.say(ai.fac, ai.name + " is moving on " + (target.name || "your ground"), "warn");
        R.FX.ping(g, target.x, target.y, "bad");
        if (R.Cam) R.Cam.shake(3);
      }
    },

    // The trucks are the point of a raid, not the baggage. A truck on its
    // own will only ever park outside somebody's wall, so they follow the
    // army to the objective and plant the flag once the yard is open.
    sendTrucks(g, ai, target) {
      let sent = 0;
      for (const u of g.units) {
        if (u.dead || u.fac !== ai.fac || u.inside) continue;
        if (!u.def.capture) continue;
        if (u.order && u.order.type === "capture" && u.order.site === target) continue;
        R.Entity.setOrder(g, u, { type: "capture", site: target, x: target.x, y: target.y });
        if (++sent >= 3) break;
      }
    },

    pickTarget(g, ai, army) {
      // the army marches from wherever it is, so "nearest" is measured
      // from the army, not from the capital
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
        // the first raid of the war is always at the player's gate: the
        // eight flaks exist to be tested, and the player exists to watch
        // them work. Everything after that is ordinary strategy.
        if (ai.wave === 0 && s.home && s.owner === 0) return s;
        const d = R.dist(ax, ay, s.x, s.y);
        let score = -d * 0.0016;
        // the player is the protagonist of this war: the pull toward
        // their gate grows with every wave, until late in the game
        // everyone is at their walls
        if (s.owner === 0) score += 1.2 + ai.wave * 0.4 + ai.p.aggro * 0.6;
        if (s.home) score += 0.3;
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
