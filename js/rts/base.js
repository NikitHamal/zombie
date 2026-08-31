/* SANDSTORM — buildings.

   A building is a footprint on the tile grid, a queue of things it is
   making, a rally point, and (if it is a defence) a turret that turns.

   The rules that come straight from the original and shape everything:

   - you may only build inside your own territory, so taking settlements
     is how you get room for more industry;
   - every kind of settlement builds its own kind of industry: a tank
     base grows vehicle works, a naval base grows the shipyard and the
     shipyard must sit in the water, a railyard must touch the track;
   - a factory stands at twelve levels until the settlement is extended,
     and every level costs more, takes longer, and pours out a fifth
     more;
   - the military book caps the queue: a unit is only built if there is
     a point for it, and a squad a place to ride in;
   - the command buildings are bought in gold, one per purse, and the
     settlement's extension is the only one that is a place on the map.

   Construction is paid up front and then goes up over time. The gold
   towers level up the same way: the second level is a price in gold, not
   a stack of steel. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE;

  const Base = {
    /* ==================================================================
       placement
       ================================================================== */

    // which settlement this footprint would stand in, if any
    siteAt(g, tx, ty, size) {
      const cx = tx + size / 2,
        cy = ty + size / 2;
      let best = null,
        bd = 1e18;
      for (const s of g.t.sites) {
        const d = (s.tx - cx) ** 2 + (s.ty - cy) ** 2;
        const r = (s.r + 4) ** 2;
        if (d < r && d < bd) {
          bd = d;
          best = s;
        }
      }
      return best;
    },

    // why a building cannot go here (null = it can). `opts.skipGold` and
    // `opts.skipRes` let a gold purchase that has already paid pass the
    // price gate.
    blockReason(g, key, fac, tx, ty, opts) {
      opts = opts || {};
      const def = R.BDEF[key];
      if (!def) return "unknown";
      if (!g.t.canBuild(tx, ty, def.size, { water: def.water, rail: def.rail })) {
        if (def.rail) return "must touch the rail";
        if (def.water) return "must be built on water";
        return "ground is blocked";
      }
      // the kind of ground: a shipyard in the mountains is not a shipyard.
      // A home ground, however, always takes the vehicle works — it is the
      // company's own ground, and it builds ground forces no matter what.
      if (def.site) {
        const s = this.siteAt(g, tx, ty, def.size);
        if (!s) return "must stand in a settlement";
        const ok = def.site.indexOf(s.kind) >= 0 || (key === "works" && s.home);
        if (!ok) return "needs " + R.BASE_TYPES[def.site[0]].name.toLowerCase() + " ground";
      }
      // territory: everything you raise has to be on your own ground
      let mine = 0,
        all = def.size * def.size;
      for (let dy = 0; dy < def.size; dy++)
        for (let dx = 0; dx < def.size; dx++)
          if (g.t.ownerAt((tx + dx + 0.5) * TILE, (ty + dy + 0.5) * TILE) === fac) mine++;
      if (mine < (def.wall ? 1 : all)) return "outside your territory";
      // the cap
      if (g.count(fac, key) >= (def.max || 1)) return "building limit reached";
      if (def.perSite) {
        const s = this.siteAt(g, tx, ty, def.size);
        if (s)
          for (const b of g.buildings)
            if (!b.dead && b.key === key && b.fac === fac && b.site === s)
              return "one per settlement";
      }
      // the price
      if (def.goldBld) {
        if (!opts.skipGold && g.factions[fac].gold < R.Economy.goldPrice(g.factions[fac], def))
          return "not enough gold";
      } else if (!opts.skipRes && !g.canPay(fac, def.cost)) {
        return "not enough resources";
      }
      return null;
    },

    canPlace(g, key, fac, tx, ty, opts) {
      return !this.blockReason(g, key, fac, tx, ty, opts);
    },

    place(g, key, fac, tx, ty, opts) {
      opts = opts || {};
      if (!this.canPlace(g, key, fac, tx, ty, opts)) return null;
      const def = R.BDEF[key];
      if (!opts.instant) {
        if (def.goldBld) g.factions[fac].gold -= R.Economy.goldPrice(g.factions[fac], def);
        else g.pay(fac, def.cost);
      }
      const b = g.addBuilding(key, fac, tx, ty, 1, !!opts.instant);
      if (b) {
        g.stats.built++;
        if (fac === 0 && !opts.quiet) R.FX.marker(g, b.x, b.y, "move");
      }
      return b;
    },

    /* ==================================================================
       upgrades: factory levels and the gold towers
       ================================================================== */

    upCostFor(g, b) {
      const def = b.def;
      if (def.makes) {
        const max = R.maxLevelOf(def, b.site);
        if (b.lvl >= max) return null;
        return R.upCost(def, b.lvl);
      }
      if (def.goldBld && def.goldCost.length > 1 && b.lvl < def.goldCost.length) {
        return { gold: def.goldCost[b.lvl] };
      }
      return null;
    },

    startUpgrade(g, b) {
      if (b.upgrading || !b.built) return false;
      const cost = this.upCostFor(g, b);
      if (!cost) return false;
      if (!g.canPay(b.fac, cost)) return false;
      g.pay(b.fac, cost);
      b.upgrading = 1;
      b.upT = b.def.makes ? R.upTime(b.def, b.lvl) : b.def.time;
      b.upTotal = b.upT;
      return true;
    },

    finishUpgrade(g, b) {
      b.lvl++;
      b.upgrading = 0;
      if (b.def.makes) {
        const nh = R.levelHp(b.def, b.lvl);
        b.maxHp = nh;
        b.hp = Math.min(nh, b.hp + (nh - b.maxHp));
        b.arm = b.def.arm + b.lvl * 2;
        if (b.fac === 0) g.say(0, b.def.name + " is now level " + b.lvl, "good");
      }
      if (b.key === "sight") b.sight = 500 + 200 * b.lvl;
      if (ZS.sound) ZS.sound.event("build", b.x, b.y);
    },

    /* ==================================================================
       production
       ================================================================== */

    queueItem(g, b, key) {
      const ud = R.UDEF[key];
      if (!ud || !b.built || b.upgrading) return ((b.lastFail = "building"), false);
      if (R.PRODUCES[b.key] && R.PRODUCES[b.key].indexOf(key) < 0)
        return ((b.lastFail = "menu"), false);
      // home ground only: the gold trucks and the cheap scouts
      if (ud.homeOnly && !(b.site && b.site.home)) return ((b.lastFail = "homeOnly"), false);
      if (b.queue.length >= 12) return ((b.lastFail = "queue"), false);
      const f = g.factions[b.fac];
      if (!f || f.produceStopped) return ((b.lastFail = "stopped"), false); // the books are overdrawn
      // the military book: no point, no unit
      if (f.mp + ud.mp > f.mpMax + R.MP_TOLERANCE) return ((b.lastFail = "mp"), false);
      // the squad book: a place to ride in
      let join = false,
        nSquads = 0;
      for (const id in f.squads) {
        const s = f.squads[id];
        nSquads++;
        if (s.key === key && s.n < ud.grp) join = true;
      }
      if (!join && nSquads >= Math.max(1, f.squadCap)) return ((b.lastFail = "squad"), false);
      // the price, with the home ground's daily quota in it
      const cost = R.Economy.unitCost(g, f, key);
      if (!g.canPay(b.fac, cost)) return ((b.lastFail = "cost"), false);
      g.pay(b.fac, cost);
      f.mpQueue += ud.mp;
      b.queue.push({ key, t: ud.time, total: ud.time, cost });
      b.lastFail = null;
      return true;
    },

    cancelQueued(g, b, i) {
      const q = b.queue[i];
      if (!q) return;
      const frac = R.clamp(1 - q.t / q.total, 0, 1);
      g.refund(b.fac, q.cost, 1 - frac);
      const f = g.factions[b.fac];
      if (f) f.mpQueue = Math.max(0, (f.mpQueue || 0) - (R.UDEF[q.key].mp || 0));
      b.queue.splice(i, 1);
    },

    spawnPoint(g, b, def) {
      // out of the door, on open ground, nearest the rally point. Trains
      // come out onto the track; ships into the water; aircraft onto the
      // pad itself and climb from there.
      const layer = def.train ? 3 : def.cls === "air" ? 1 : def.cls === "sea" ? 2 : 0;
      if (layer === 1) return { x: b.x, y: b.y };
      const size = b.size;
      const rnd = (b.seed + b.queue.length * 37) % 1000;
      for (let ring = 1; ring < 14; ring++) {
        const r = size / 2 + ring * 0.9;
        const n = 8 + ring * 4;
        for (let k = 0; k < n; k++) {
          const an = ((k + rnd) / n) * R.TAU + ring;
          const x = b.x + Math.cos(an) * r * TILE;
          const y = b.y + Math.sin(an) * r * TILE;
          if (g.nav.openAt(x, y, layer, b.fac)) return { x, y };
        }
      }
      const near = g.nav.nearestOpen((b.x / TILE) | 0, (b.y / TILE) | 0, 14, layer, b.fac);
      return near ? { x: (near.tx + 0.5) * TILE, y: (near.ty + 0.5) * TILE } : { x: b.x, y: b.y };
    },

    /* ==================================================================
       the frame
       ================================================================== */

    update(g, b, dt) {
      const def = b.def;
      const f = g.factions[b.fac];
      b.flash = Math.max(0, b.flash - dt);
      b.recoil = Math.max(0, b.recoil - dt * 4);
      b.dmgFlash = Math.max(0, b.dmgFlash - dt);

      /* ---- going up ---- */
      // overdrawn books stop everything the books pay for. The gold
      // towers are paid in gold, so they keep going — that is how you
      // claw your way back.
      const stopped = f && f.produceStopped && !b.def.goldBld;
      if (!b.built) {
        b.buildT -= stopped ? 0 : dt;
        if (Math.random() < dt * 2)
          R.FX.dust(
            g,
            b.x + (Math.random() - 0.5) * b.size * TILE,
            b.y + (Math.random() - 0.5) * b.size * TILE,
            0.7,
          );
        if (b.buildT <= 0) {
          b.built = true;
          b.buildT = 0;
          b.hp = b.def.flak ? b.hp : R.levelHp(def, b.lvl);
          if (b.key === "maxextend" && b.site) b.site.extend = true;
          if (b.fac === 0) g.say(0, def.name + " raised");
          if (ZS.sound) ZS.sound.event("build", b.x, b.y);
          R.Economy.recompute(g, f);
        }
        return;
      }

      /* ---- upgrading ---- */
      if (b.upgrading) {
        b.upT -= dt;
        if (Math.random() < dt * 1.6)
          R.FX.spark(
            g,
            b.x + (Math.random() - 0.5) * b.size * TILE,
            b.y + (Math.random() - 0.5) * b.size * TILE,
          );
        if (b.upT <= 0) {
          this.finishUpgrade(g, b);
          R.Economy.recompute(g, f);
        }
        return;
      }

      /* ---- burning ---- */
      const hpf = b.hp / b.maxHp;
      if (hpf < 0.35) {
        b.onFire = 1;
        if (Math.random() < dt * (1 - hpf) * 9)
          R.FX.smoke(
            g,
            b.x + (Math.random() - 0.5) * b.size * TILE * 0.8,
            b.y + (Math.random() - 0.5) * b.size * TILE * 0.6,
            1.1,
          );
        if (Math.random() < dt * 2)
          R.FX.ember(g, b.x + (Math.random() - 0.5) * b.size * TILE * 0.7, b.y);
      } else if (hpf > 0.55) b.onFire = 0;

      /* ---- production: the queue runs at the pace the sheet gives ---- */
      if (b.queue.length && f && !f.produceStopped) {
        const q = b.queue[0];
        q.t -= dt;
        if (q.t <= 0) {
          const ud = R.UDEF[q.key];
          const p = this.spawnPoint(g, b, ud);
          const u = g.addUnit(q.key, b.fac, p.x, p.y);
          if (u) {
            if (f) f.mpQueue = Math.max(0, (f.mpQueue || 0) - (ud.mp || 0));
            if (ud.cls === "air") u.home = b;
            if (b.rally) {
              const pt = g.nav.nearestOpen(
                (b.rally.x / TILE) | 0,
                (b.rally.y / TILE) | 0,
                6,
                u.layer,
                b.fac,
              );
              const rx = pt ? (pt.tx + 0.5) * TILE : b.rally.x;
              const ry = pt ? (pt.ty + 0.5) * TILE : b.rally.y;
              R.Entity.setOrder(g, u, { type: "amove", x: rx, y: ry });
            } else if (u.layer === 0 || u.layer === 3) {
              // drift a little way out of the door so the next one fits
              const an = Math.atan2(p.y - b.y, p.x - b.x);
              R.Entity.setOrder(g, u, {
                type: "move",
                x: p.x + Math.cos(an) * 44,
                y: p.y + Math.sin(an) * 44,
              });
            }
            if (b.fac === 0 && q.key === "stonehammer") g.stats.bredaBuilt++;
            if (b.fac === 0 && b.queue.length === 1) R.FX.marker(g, u.x, u.y, "move");
          } else {
            // the squad book closed on it: refund the rest
            if (f) {
              const frac = R.clamp(1 - q.t / q.total, 0, 1);
              g.refund(b.fac, q.cost, 1 - frac);
              f.mpQueue = Math.max(0, (f.mpQueue || 0) - (ud.mp || 0));
            }
          }
          b.queue.shift();
        }
      }

      /* ---- guns ---- */
      if (b.w) {
        const w = b.w;
        b.cd = Math.max(0, b.cd - dt);
        b.tgtT -= dt;
        if (!b.tgt || b.tgt.dead) b.tgt = null;
        if (b.tgt && R.dist(b.x, b.y, b.tgt.x, b.tgt.y) > R.Combat.rangeTo(g, b, b.tgt) * 1.06)
          b.tgt = null;
        if (!b.tgt && b.tgtT <= 0) {
          b.tgtT = 0.35;
          const cand = g.nearestTarget(b, w.range, false);
          if (cand && (b.fac !== 0 || g.visibleNow(cand.x, cand.y))) b.tgt = cand;
        }
        if (b.tgt) {
          const want = Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x);
          b.turretW = want;
          b.turretA = R.turnToward(b.turretA, want, dt * 3.4);
          const aligned = Math.abs(R.angDiff(b.turretA, want)) < 0.12;
          const td = R.dist(b.x, b.y, b.tgt.x, b.tgt.y) || 1;
          const off = b.size * TILE * 0.75 + 4;
          const mx = b.x + ((b.tgt.x - b.x) / td) * off,
            my = b.y + ((b.tgt.y - b.y) / td) * off;
          if (aligned && b.cd <= 0 && g.nav.fireLine(mx, my, b.tgt.x, b.tgt.y)) {
            b.cd = 1 / w.rof;
            b.flash = 0.08;
            b.recoil = 1;
            b.lastFire = g.time;
            R.Combat.fire(g, b, b.tgt, w);
          }
        } else {
          b.turretW = Math.sin(g.time * 0.25 + b.seed) * 0.7 + b.seed;
          b.turretA = R.turnToward(b.turretA, b.turretW, dt * 0.7);
        }
      }

      /* ---- the repair crane: it mends what is parked at the base ---- */
      if (b.key === "crane") {
        const rate = [0.5, 1.0, 2.0][b.lvl - 1] || 0.5; // % of max hp, per minute
        const air = b.lvl >= 3;
        const found = [];
        g.grid.query(b.x, b.y, 340, (o) => {
          if (o.kind !== "u" || o.dead || o.fac !== b.fac || o.hp >= o.maxHp) return;
          if (o.layer === 1 && !air) return;
          found.push(o);
        });
        found.sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp);
        for (let k = 0; k < Math.min(found.length, b.lvl); k++) {
          const u = found[k];
          u.hp = Math.min(u.maxHp, u.hp + u.maxHp * (rate / 100) * (dt / 60));
          if (Math.random() < dt * 3) R.FX.spark(g, u.x, u.y);
        }
      }
    },
  };

  R.Base = Base;
})();
