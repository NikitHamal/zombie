/* Desert Order — buildings.

   A building is a footprint on the tile grid, a queue of things it is
   making, a rally point, and (if it is a defence) a turret that turns.

   Two rules come straight from Desert Order and shape the whole game:

   - you may only build inside your own territory, so taking settlements is
     how you get room for more industry;
   - a settler counts against a cap on each building type, and more
     settlements raise every cap. Expansion is not a luxury, it is the
     production limit.

   Construction is paid up front and then goes up over time, which is what
   engineers are for: they make it go faster. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE;

  const Base = {
    /* ==================================================================
       placement
       ================================================================== */

    // why a building cannot go here (null = it can)
    blockReason(g, key, fac, tx, ty) {
      const def = R.BDEF[key];
      if (!def) return "unknown";
      if (fac !== 0) return null; // the AI places for itself
      if (!g.t.canBuild(tx, ty, def.size, { water: def.water })) {
        if (def.water) return "must be built on water";
        return "ground is blocked";
      }
      // territory: everything you raise has to be on your own ground
      if (key !== "wall" && key !== "gate") {
        let mine = false;
        for (let dy = 0; dy < def.size; dy++)
          for (let dx = 0; dx < def.size; dx++)
            if (g.t.ownerAt((tx + dx + 0.5) * TILE, (ty + dy + 0.5) * TILE) === fac) mine = true;
        if (!mine) return "outside your territory";
      } else {
        let mine = false;
        if (g.t.ownerAt((tx + 0.5) * TILE, (ty + 0.5) * TILE) === fac) mine = true;
        if (!mine) return "outside your territory";
      }
      if (g.count(fac, key) >= g.maxBuildings(fac, key)) return "building limit reached";
      if (!g.canPay(fac, def.cost)) return "not enough resources";
      return null;
    },

    canPlace(g, key, fac, tx, ty) {
      return !this.blockReason(g, key, fac, tx, ty);
    },

    place(g, key, fac, tx, ty) {
      if (!this.canPlace(g, key, fac, tx, ty)) return null;
      const def = R.BDEF[key];
      g.pay(fac, def.cost);
      const b = g.addBuilding(key, fac, tx, ty, 1, false);
      if (b) {
        g.stats.built++;
        if (fac === 0) R.FX.marker(g, b.x, b.y, "move");
      }
      return b;
    },

    /* ==================================================================
       upgrades
       ================================================================== */

    upCostFor(g, b) {
      const def = b.def;
      const max = def.cat === "def" ? R.MAXLEVEL_DEF : R.MAXLEVEL;
      if (b.lvl >= max) return null;
      return R.upCost(def, b.lvl);
    },

    startUpgrade(g, b) {
      if (b.upgrading || !b.built) return false;
      const cost = this.upCostFor(g, b);
      if (!cost) return false;
      if (!g.canPay(b.fac, cost)) return false;
      g.pay(b.fac, cost);
      b.upgrading = 1;
      b.upT = R.upTime(b.def, b.lvl);
      b.upTotal = b.upT;
      return true;
    },

    finishUpgrade(g, b) {
      b.lvl++;
      b.upgrading = 0;
      const nh = R.levelHp(b.def, b.lvl);
      b.hp = Math.min(nh, b.hp + (nh - b.maxHp));
      b.maxHp = nh;
      b.arm = b.def.arm + b.lvl * 2;
      if (b.fac === 0) g.say(0, b.def.name + " is now level " + b.lvl);
      if (ZS.sound) ZS.sound.event("build", b.x, b.y);
    },

    /* ==================================================================
       production
       ================================================================== */

    queueItem(g, b, key) {
      const ud = R.UDEF[key];
      if (!ud || !b.built || b.upgrading) return false;
      if (R.PRODUCES[b.key] && R.PRODUCES[b.key].indexOf(key) < 0) return false;
      if (b.queue.length >= 12) return false;
      if (!g.canPay(b.fac, ud.cost)) return false;
      // the army cap: a unit is only queued if there will be room for it
      const f = g.factions[b.fac];
      let pending = 0;
      for (const q of b.queue) pending += R.UDEF[q.key].pop;
      if (f.capUsed + pending + ud.pop > f.cap) return false;
      g.pay(b.fac, ud.cost);
      b.queue.push({ key, t: ud.time, total: ud.time });
      return true;
    },

    cancelQueued(g, b, i) {
      const q = b.queue[i];
      if (!q) return;
      // `frac` is how much of it is built, and that much is spent: cancel
      // a finished-order item and you get nothing back
      const frac = R.clamp(1 - q.t / q.total, 0, 1);
      g.refund(b.fac, R.UDEF[q.key].cost, 1 - frac);
      b.queue.splice(i, 1);
    },

    spawnPoint(g, b, def) {
      // out of the door, on open ground, nearest the rally point. Our own
      // gates count as open ground, so a factory behind a wall can still
      // put its tanks on the drive.
      const layer = def.cls === "sea" ? 2 : 0;
      const size = b.size;
      const rnd = (b.seed + b.queue.length * 37) % 1000;
      for (let ring = 1; ring < 12; ring++) {
        const r = size / 2 + ring * 0.9;
        const n = 8 + ring * 4;
        for (let k = 0; k < n; k++) {
          // start somewhere different each time so a queue of tanks does
          // not all fight over the same doorway
          const an = ((k + rnd) / n) * R.TAU + ring;
          const x = b.x + Math.cos(an) * r * TILE;
          const y = b.y + Math.sin(an) * r * TILE;
          if (g.nav.openAt(x, y, layer, b.fac)) return { x, y };
        }
      }
      // nothing around this building at all: hand back something legal
      // rather than something inside a wall
      const near = g.nav.nearestOpen((b.x / TILE) | 0, (b.y / TILE) | 0, 12, layer, b.fac);
      return near ? { x: (near.tx + 0.5) * TILE, y: (near.ty + 0.5) * TILE } : { x: b.x, y: b.y };
    },

    /* ==================================================================
       the frame
       ================================================================== */

    update(g, b, dt) {
      const def = b.def;
      b.flash = Math.max(0, b.flash - dt);
      b.recoil = Math.max(0, b.recoil - dt * 4);
      b.dmgFlash = Math.max(0, b.dmgFlash - dt);

      /* ---- going up ---- */
      if (!b.built) {
        // engineers on site work faster
        const help = g.countUnits(b.fac, "eng") > 0 ? 1 : 1;
        b.buildT -= dt * (1 + (b.help || 0) * 0.55) * help;
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
          b.hp = R.levelHp(def, b.lvl);
          if (b.fac === 0) g.say(0, def.name + " raised");
          if (ZS.sound) ZS.sound.event("build", b.x, b.y);
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
        if (b.upT <= 0) this.finishUpgrade(g, b);
        // a building being upgraded does not shoot or produce
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

      /* ---- production ---- */
      if (b.queue.length) {
        const q = b.queue[0];
        // a busy factory runs at the pace of the economy
        q.t -= dt * g.factions[b.fac].buildRate;
        if (q.t <= 0) {
          const ud = R.UDEF[q.key];
          const p = this.spawnPoint(g, b, ud);
          const u = g.addUnit(q.key, b.fac, p.x, p.y);
          if (u) {
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
            } else if (ud.cls !== "air") {
              // drift a little way out of the door so the next one fits
              const an = Math.atan2(p.y - b.y, p.x - b.x);
              R.Entity.setOrder(g, u, {
                type: "move",
                x: p.x + Math.cos(an) * 40,
                y: p.y + Math.sin(an) * 40,
              });
            }
            if (b.fac === 0 && b.queue.length === 1) R.FX.marker(g, u.x, u.y, "move");
          }
          b.queue.shift();
        }
      }

      /* ---- guns ---- */
      if (b.w) {
        const w = b.w;
        b.cd = Math.max(0, b.cd - dt);
        b.tgtT -= dt;
        if (!b.tgt || b.tgt.dead || R.dist(b.x, b.y, b.tgt.x, b.tgt.y) > w.range * 1.05)
          b.tgt = null;
        if (!b.tgt && b.tgtT <= 0) {
          b.tgtT = 0.35;
          // a tower searches with the same eyes as the units standing next
          // to it: if it cannot see it, it cannot shoot it
          const cand = g.nearestTarget(b, w.range);
          if (cand && g.visibleNow(cand.x, cand.y) === true) b.tgt = cand;
          else if (cand && b.fac !== 0) b.tgt = cand;
        }
        if (b.tgt) {
          const want = Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x);
          b.turretW = want;
          b.turretA = R.turnToward(b.turretA, want, dt * 3.4);
          const aligned = Math.abs(R.angDiff(b.turretA, want)) < 0.12;
          // the muzzle sits at the near face of the emplacement, not its
          // middle: a turret that sights from its own centre is blind —
          // its own footprint is in the way of every shot it takes
          const td = R.dist(b.x, b.y, b.tgt.x, b.tgt.y) || 1;
          const off = (b.size * TILE) * 0.75 + 4;
          const mx = b.x + ((b.tgt.x - b.x) / td) * off,
            my = b.y + ((b.tgt.y - b.y) / td) * off;
          if (aligned && b.cd <= 0 && g.nav.fireLine(mx, my, b.tgt.x, b.tgt.y)) {
            b.cd = 1 / w.rof;
            b.flash = 0.08;
            b.recoil = 1;
            R.Combat.fire(g, b, b.tgt, w);
          }
        } else {
          // idle turret: sweep slowly, the way a real one does
          b.turretW = Math.sin(g.time * 0.25 + b.seed) * 0.7 + b.seed;
          b.turretA = R.turnToward(b.turretA, b.turretW, dt * 0.7);
        }
      }

      /* ---- repair depot ---- */
      if (def.heal) {
        const f = g.factions[b.fac];
        if (f.res.fuel > 0) {
          const found = [];
          g.grid.query(b.x, b.y, def.healR, (o) => {
            if (o.kind !== "u" || o.dead || o.fac !== b.fac) return;
            if (o.hp >= o.maxHp) return;
            found.push(o);
          });
          if (found.length) {
            const u = found[0];
            u.hp = Math.min(u.maxHp, u.hp + def.heal * dt);
            f.res.fuel = Math.max(0, f.res.fuel - dt * 2.2);
            if (Math.random() < dt * 4) R.FX.spark(g, u.x, u.y);
          }
        }
      }
    },
  };

  R.Base = Base;
})();
