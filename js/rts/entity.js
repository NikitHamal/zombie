/* SANDSTORM — units.

   A unit is an order, a path and a gun. The order says where it is going
   and what it will do when it gets there; the path is how it avoids the
   rocks and the walls on the way; the gun is why anybody cares.

   Orders are the RTS vocabulary: move, attack-move, attack that, hold,
   patrol, capture. A group told to move gets a formation — slots laid out
   across the line of march and handed to the unit that can reach each one
   fastest, so twenty tanks arrive as a line instead of a crowd.

   Three rules from the design spec live here and nowhere else:

     THE ROAD DRINKS. Every moving second, the pool pays. The pool runs
     dry and the army stands still — guns still up, engines cold.
     FIXED GUNS PAY FOR THE AMMO. A siege gun that has fired its last
     shell is a very expensive statue until a wagon feeds it.
     A VEHICLE THAT CANNOT TURN ITS GUN DOES NOT FIRE IT. The base-killer
     stops to shoot. Move it while it aims and the shot is gone.

   Aircraft keep their own tanks and come home to the pad to refill,
   because a fighter that forgets to come home falls out of the sky.
   That is the trade for being able to go anywhere. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE;

  const ARRIVE = 26;
  const REPATH_MIN = 0.55;

  const Entity = {
    /* ==================================================================
       orders
       ================================================================== */

    // `append` is the shift key: this order goes to the back of the queue
    // and the unit carries on with what it was doing.
    setOrder(g, u, ord, append) {
      if (append && u.order) {
        if (!u.q) u.q = [];
        u.q.push(Object.assign({}, ord));
        if (u.q.length > 12) u.q.shift();
        return;
      }
      u.order = ord ? Object.assign({}, ord) : null;
      if (u.q) u.q.length = 0;
      u.path = null;
      u.pi = 0;
      u.stuck = 0;
      u.slot = null;
      u.repairing = null;
      u.capturing = null;
      if (ord && ord.type === "patrol") u.leg = 0;
      if (ord && ord.type === "stop") {
        u.order = null;
        u.vx = u.vy = 0;
      }
    },

    // a group order: lay out slots and hand each unit the one it can take
    assignFormation(g, list, ord) {
      const n = list.length;
      let rad = 0;
      for (const u of list) rad = Math.max(rad, u.def.big ? 26 : u.def.cls === "arm" ? 22 : 14);
      const spacing = rad * 2.1 + 8;
      const cols = Math.max(3, Math.ceil(Math.sqrt(n) * 1.5));
      const cx = list.reduce((s, u) => s + u.x, 0) / n;
      const cy = list.reduce((s, u) => s + u.y, 0) / n;
      let ang = Math.atan2(ord.y - cy, ord.x - cx);
      if (Math.hypot(ord.x - cx, ord.y - cy) < 120) ang = -Math.PI / 2;
      const cos = Math.cos(ang),
        sin = Math.sin(ang);

      const slots = [];
      for (let i = 0; i < n; i++) {
        const col = i % cols,
          row = (i / cols) | 0;
        const lx = (col - (Math.min(cols, n) - 1) / 2) * spacing;
        const ly = row * spacing;
        slots.push({
          x: ord.x + lx * cos - ly * sin,
          y: ord.y + lx * sin + ly * cos,
          taken: false,
        });
      }
      const order = list
        .slice()
        .sort((a, b) => R.dist2(a.x, a.y, ord.x, ord.y) - R.dist2(b.x, b.y, ord.x, ord.y));
      for (const u of order) {
        let bi = 0,
          bd = 1e18;
        for (let i = 0; i < slots.length; i++) {
          if (slots[i].taken) continue;
          const d = R.dist2(u.x, u.y, slots[i].x, slots[i].y);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }
        slots[bi].taken = true;
        const free = g.nav.nearestOpen(
          (slots[bi].x / TILE) | 0,
          (slots[bi].y / TILE) | 0,
          5,
          u.layer,
          u.fac,
        );
        const tx = free ? (free.tx + 0.5) * TILE : slots[bi].x;
        const ty = free ? (free.ty + 0.5) * TILE : slots[bi].y;
        const o = Object.assign({}, ord, { x: tx, y: ty });
        this.setOrder(g, u, o);
      }
    },

    /* ==================================================================
       movement
       ================================================================== */

    // ask for a path, but only when we can afford it and only when we
    // need one — most of the desert is a straight line. Trains never get
    // the straight line: the rail decides.
    wantPath(g, u, gx, gy) {
      if (u.layer === 1) {
        u.path = [{ x: gx, y: gy }];
        u.pi = 0;
        return;
      }
      if (u.layer !== 3 && g.nav.los(u.x, u.y, gx, gy, u.layer, u.fac)) {
        u.path = [{ x: gx, y: gy }];
        u.pi = 0;
        return;
      }
      if (u.repathT > 0) return;
      if (g.nav.budget <= 0) return;
      g.nav.budget--;
      const p = g.nav.astar(u.x, u.y, gx, gy, u.layer, u.fac, u.layer !== 3);
      u.repathT = REPATH_MIN;
      if (p) {
        u.path = p;
        u.pi = 0;
      } else {
        u.path = [{ x: gx, y: gy }];
        u.pi = 0;
      }
    },

    step(g, u, dt, gx, gy, speed) {
      // where do we want to be?
      if (!u.path || u.pi >= u.path.length) this.wantPath(g, u, gx, gy);
      let wx = gx,
        wy = gy;
      if (u.path && u.pi < u.path.length) {
        const wp = u.path[u.pi];
        if (R.dist2(u.x, u.y, wp.x, wp.y) < 22 * 22) {
          u.pi++;
          if (u.pi >= u.path.length) u.path = null;
        }
        if (u.path && u.pi < u.path.length) {
          wx = u.path[u.pi].x;
          wy = u.path[u.pi].y;
        }
      }
      if (u.gx !== undefined && R.dist2(u.gx, u.gy, gx, gy) > 2600) {
        u.path = null;
        u.gx = gx;
        u.gy = gy;
      } else if (u.gx === undefined) {
        u.gx = gx;
        u.gy = gy;
      }

      const dx = wx - u.x,
        dy = wy - u.y;
      const want = Math.atan2(dy, dx);
      u.a = want;
      u.va = R.turnToward(
        u.va,
        want,
        dt * (u.def.cls === "arm" ? 3.2 : u.def.cls === "air" ? 4.5 : 6),
      );
      const terr = u.layer === 1 ? 1 : g.t.speedAt(u.x, u.y);
      const sp = speed * terr;
      const facing = Math.max(0, Math.cos(R.angDiff(u.va, want)));
      const mul =
        u.def.cls === "arm" ? 0.35 + 0.65 * facing : u.def.cls === "sea" ? 0.5 + 0.5 * facing : 1;
      u.vx = Math.cos(u.va) * sp * mul;
      u.vy = Math.sin(u.va) * sp * mul;
      if (u.vx || u.vy) u.lastMove = g.time;
      u.moveT = (u.moveT || 0) + dt;
    },

    stopMoving(u) {
      u.vx *= 0.82;
      u.vy *= 0.82;
      if (Math.abs(u.vx) < 1) u.vx = 0;
      if (Math.abs(u.vy) < 1) u.vy = 0;
    },

    moving(u) {
      return Math.hypot(u.vx, u.vy) > 6;
    },

    /* ==================================================================
       shooting
       ================================================================== */

    // pick the right gun for this target: the AA gun for aircraft, the
    // main gun for everything else
    gunFor(u, tgt) {
      if (u.w2 && tgt && tgt.kind === "u" && tgt.def.cls === "air" && u.w2.aa) return u.w2;
      if (u.w && tgt && tgt.kind === "u" && tgt.def.cls === "air" && !u.w.aa && u.w2) return u.w2;
      if (u.w && tgt && tgt.kind === "u" && tgt.def.cls !== "air" && u.w.as === false && u.w2)
        return u.w2;
      return u.w;
    },

    // can this unit fire at all, right now?
    ready(g, u, _tgt) {
      if (u.def.noTurret && this.moving(u)) return false; // fixed gun, moving feet
      if (u.ammoMax > 0 && u.ammo <= 0) return false; // the last shell is gone
      return true;
    },

    tryShoot(g, u, tgt) {
      const w = this.gunFor(u, tgt);
      if (!w) return false;
      if (!this.ready(g, u, tgt)) return false;
      let tx = tgt.x,
        ty = tgt.y;
      if (tgt.kind === "b" && tgt.size > 1) {
        const nx = R.clamp(Math.floor(u.x / TILE), tgt.tx, tgt.tx + tgt.size - 1),
          ny = R.clamp(Math.floor(u.y / TILE), tgt.ty, tgt.ty + tgt.size - 1);
        tx = (nx + 0.5) * TILE;
        ty = (ny + 0.5) * TILE;
      }
      const d = R.dist(u.x, u.y, tx, ty);
      if (d > R.Combat.rangeTo(g, u, tgt)) return false;
      if (u.layer === 0 && !g.nav.fireLine(u.x, u.y, tx, ty)) return false;
      if (u.cd > 0) return true; // in range, waiting on the reload
      u.cd = 1 / w.rof;
      u.flash = 0.07;
      u.recoil = 1;
      u.lastFire = g.time;
      if (u.ammoMax > 0) u.ammo--;
      R.Combat.fire(g, u, tgt, w);
      return true;
    },

    // find something to shoot: nearest thing we can hurt
    acquire(g, u, radius, noBld) {
      if (!u.w && !u.w2) return null;
      const w = u.w || u.w2;
      const r = radius || Math.max(w.range * 1.05, 200);
      return g.nearestTarget(u, r, undefined, noBld);
    },

    /* ==================================================================
       the per-unit frame
       ================================================================== */

    update(g, u, dt) {
      const def = u.def;
      u.repathT = Math.max(0, (u.repathT || 0) - dt);
      u.cd = Math.max(0, u.cd - dt);
      u.cd2 = Math.max(0, u.cd2 - dt);
      u.flash = Math.max(0, u.flash - dt);
      u.recoil = Math.max(0, u.recoil - dt * 5);
      u.dmgFlash = Math.max(0, u.dmgFlash - dt);
      u.sayT = Math.max(0, u.sayT - dt);
      if (u.attackers && g.time - u.attackerT > 1.2) {
        u.attackers = 0;
        u.attackerT = g.time;
      }

      if (u.inside) return; // riding in something: nothing to do

      /* ---- aircraft: own tank, own altitude, own return home ---- */
      if (u.layer === 1) {
        u.rotor += dt * (u.alt > 2 ? 26 : 6);
        if (u.landing) {
          u.altW = 0;
          if (u.alt < 1.5 && R.dist(u.x, u.y, u.landing.x, u.landing.y) < 60) {
            u.landed = u.landing;
            u.fuel = Math.min(u.fuelMax, u.fuel + dt * 45);
            if (u.fuel >= u.fuelMax - 0.5) {
              u.landing = null;
              u.fuel = u.fuelMax;
            }
          }
        } else {
          u.altW = def.alt;
          u.fuel -= dt * 2.1;
          if (u.fuel <= 0) {
            R.FX.explode(g, u.x, u.y, 40, 1);
            g.killUnit(u);
            if (u.fac === 0) g.say(0, def.name + " out of fuel — lost", "warn");
            return;
          }
          if (u.fuel < 22 && !u.order && u.home && !u.home.dead) {
            u.order = { type: "move", x: u.home.x, y: u.home.y, refuel: true };
          }
        }
        u.alt += (u.altW - u.alt) * Math.min(1, dt * 1.6);
      }

      if (!u.order && u.q && u.q.length) u.order = u.q.shift();

      const ord = u.order;

      /* ---- the order ---- */
      let goalX = null,
        goalY = null;
      // the pool: a dry well and a standing army. Guns still work.
      const fac = g.factions[u.fac];
      let speed = u.speed;
      if (fac && fac.fuelOut && u.layer !== 1) speed = 0;
      let shooting = null;

      if (def.capture && ord && ord.type === "capture") {
        // a conquest vehicle on a settlement: the ground has to be open —
        // the flaks down — before the flag can move
        const site = ord.site;
        if (!site || site.owner === u.fac) {
          u.order = null;
        } else if (!site.open) {
          // standing ground that will not turn yet. Drive up to the mouth
          // of the yard and wait there — the flaks have to go first.
          const dNow = R.dist(u.x, u.y, site.x, site.y);
          const reach = (site.r + 2) * TILE;
          if (dNow > reach) {
            goalX = site.x;
            goalY = site.y;
          } else {
            this.stopMoving(u);
            if (u.sayT <= 0) {
              u.sayT = 9;
              u.say = "flaks in the way";
              if (u.fac === 0 && u.sel)
                g.say(0, "Kill the flaks first — the base is still held", "warn");
            }
          }
        } else {
          const d = R.dist(u.x, u.y, site.x, site.y);
          if (d > 120) {
            goalX = site.x;
            goalY = site.y;
          } else {
            this.stopMoving(u);
            u.capT += dt;
            u.capturing = site;
            site.capT = (site.capT || 0) + dt;
            site.capBy = u.fac;
            site.capFrac = Math.min(1, site.capT / 14);
            if (site.capT >= 14) {
              if (g.capture(g, site, u.fac)) {
                u.order = null;
                u.capT = 0;
                site.capT = 0;
              } else {
                site.capT = 10;
                u.capT = 0;
              }
            }
          }
        }
      } else if (ord && ord.type === "attack" && ord.tgt && !ord.tgt.dead) {
        const tgt = ord.tgt;
        const w = this.gunFor(u, tgt);
        const rng = w ? R.Combat.rangeTo(g, u, tgt) : 60;
        const d = R.dist(u.x, u.y, tgt.x, tgt.y);
        if (d > rng * 0.9) {
          goalX = tgt.x;
          goalY = tgt.y;
        } else {
          this.stopMoving(u);
          u.a = u.va = Math.atan2(tgt.y - u.y, tgt.x - u.x);
          shooting = tgt;
        }
      } else if (ord && (ord.type === "move" || ord.type === "amove" || ord.type === "patrol")) {
        let tx = ord.x,
          ty = ord.y;
        if (ord.type === "patrol") {
          const legs = ord.legs || [ord];
          tx = legs[u.leg || 0].x;
          ty = legs[u.leg || 0].y;
          if (R.dist2(u.x, u.y, tx, ty) < 70 * 70) u.leg = ((u.leg || 0) + 1) % legs.length;
        }
        const d2 = R.dist2(u.x, u.y, tx, ty);
        if (d2 > ARRIVE * ARRIVE) {
          goalX = tx;
          goalY = ty;
        } else {
          this.stopMoving(u);
          if (ord.type === "move") {
            if (ord.refuel && u.layer === 1) u.landing = ord.home || null;
            u.order = null;
          } else if (ord.type === "patrol") {
            u.leg = ((u.leg || 0) + 1) % (ord.legs ? ord.legs.length : 1);
          } else {
            // attack-move arrived: hold here and shoot what comes
            u.order = { type: "hold", x: tx, y: ty };
          }
        }
        if (ord.type === "amove") {
          const t = this.acquire(g, u, Math.max(u.w ? u.w.range : 200, 240), true);
          if (t) {
            shooting = t;
            this.stopMoving(u);
            u.a = u.va = Math.atan2(t.y - u.y, t.x - u.x);
          }
        }
      } else if (ord && ord.type === "hold") {
        this.stopMoving(u);
        const t = this.acquire(g, u);
        if (t) {
          shooting = t;
          u.a = u.va = Math.atan2(t.y - u.y, t.x - u.x);
        }
      } else {
        // idle: hold the ground and shoot whatever walks into range
        const t = this.acquire(g, u, u.w ? Math.max(u.w.range, 230) : 0);
        if (t) {
          shooting = t;
          this.stopMoving(u);
          u.a = u.va = Math.atan2(t.y - u.y, t.x - u.x);
        } else {
          this.stopMoving(u);
          if (u.layer === 1 && !u.landed) {
            const h = u.home && !u.home.dead ? u.home : null;
            if (h) {
              const an = g.time * 0.35 + u.seed;
              goalX = h.x + Math.cos(an) * 200;
              goalY = h.y + Math.sin(an) * 200;
            }
          }
        }
      }

      /* ---- the wagons: shells for the guns they follow ---- */
      if (def.givesAmmo) this.resupply(g, u, dt);

      if (shooting) {
        if (!this.tryShoot(g, u, shooting)) {
          const w = this.gunFor(u, shooting);
          if (w && R.dist(u.x, u.y, shooting.x, shooting.y) <= R.Combat.rangeTo(g, u, shooting)) {
            const block = this.blockerAhead(g, u, shooting.x, shooting.y);
            if (block) {
              shooting = block;
              this.stopMoving(u);
              u.a = u.va = Math.atan2(block.y - u.y, block.x - u.x);
              this.tryShoot(g, u, block);
            }
          } else {
            goalX = shooting.x;
            goalY = shooting.y;
          }
        }
      }

      /* ---- go ---- */
      if (goalX !== null && (u.vx || u.vy || speed > 0)) {
        const wall = this.blockerAhead(g, u, goalX, goalY);
        if (wall && u.layer === 0) {
          shooting = wall;
          this.stopMoving(u);
          u.a = u.va = Math.atan2(wall.y - u.y, wall.x - u.x);
          this.tryShoot(g, u, wall);
        } else {
          this.step(g, u, dt, goalX, goalY, speed);
          const moved = Math.hypot(u.vx, u.vy) > 4;
          if (!moved && speed > 0) u.stuck += dt;
          else u.stuck = Math.max(0, u.stuck - dt * 2);
          if (u.stuck > 1.1) {
            u.path = null;
            u.repathT = 0;
            u.stuck = 0;
            g.nav.legalize(g, u);
          }
        }
      }

      /* ---- separation: nobody stands inside anybody else ---- */
      if (u.layer !== 1) this.separate(g, u, dt);

      /* ---- integrate ---- */
      const nx = u.x + u.vx * dt,
        ny = u.y + u.vy * dt;
      if (u.layer === 1) {
        u.x = R.clamp(nx, 40, R.W - 40);
        u.y = R.clamp(ny, 40, R.H - 40);
      } else {
        if (g.nav.openAt(nx, ny, u.layer, u.fac)) {
          u.x = nx;
          u.y = ny;
        } else if (g.nav.openAt(nx, u.y, u.layer, u.fac)) {
          u.x = nx;
          u.vy *= -0.25;
        } else if (g.nav.openAt(u.x, ny, u.layer, u.fac)) {
          u.y = ny;
          u.vx *= -0.25;
        } else {
          u.vx *= 0.3;
          u.vy *= 0.3;
        }
        u.x = R.clamp(u.x, 20, R.W - 20);
        u.y = R.clamp(u.y, 20, R.H - 20);
        g.nav.legalize(g, u);
      }

      /* ---- animation ---- */
      const sp = Math.hypot(u.vx, u.vy);
      u.gait += dt * (u.def.cls === "inf" ? 2 + sp * 0.16 : 3 + sp * 0.1);
      if (u.def.shape === "tank" || u.def.shape === "half" || u.def.shape === "artillery")
        u.tread += dt * sp * 0.055;
      if (u.layer === 0 && sp > 40 && Math.random() < dt * (u.def.cls === "arm" ? 14 : 6)) {
        R.FX.dust(
          g,
          u.x - Math.cos(u.va) * 14,
          u.y + 6 - Math.sin(u.va) * 14,
          u.def.cls === "arm" ? 1 : 0.6,
        );
      }
      if (u.layer === 2 && sp > 40 && Math.random() < dt * 8) R.FX.wake(g, u.x, u.y);
      if (u.layer === 1 && u.alt > 6 && Math.random() < dt * 2) R.FX.dust(g, u.x, u.y + 10, 0.2);
    },

    // a wagon on the line: one shell to the nearest thirsty gun of the
    // kind it feeds, a few seconds a time. The siege king drinks only
    // from the siege wagon.
    resupply(g, u, dt) {
      u.ammoT = (u.ammoT || 0) + dt;
      if (u.ammoT < 2) return;
      u.ammoT = 0;
      let best = null,
        bd = 90 * 90;
      g.grid.query(u.x, u.y, 90, (o) => {
        if (o === u || o.kind !== "u" || o.dead || o.fac !== u.fac) return;
        if (!o.def || o.ammoMax <= 0 || o.ammo >= o.ammoMax) return;
        if (o.ammoNeeds && o.ammoNeeds !== u.key) return;
        const d2 = R.dist2(u.x, u.y, o.x, o.y);
        if (d2 < bd) {
          bd = d2;
          best = o;
        }
      });
      if (best) {
        best.ammo = Math.min(best.ammoMax, best.ammo + 1);
        if (Math.random() < 0.4) R.FX.spark(g, (u.x + best.x) / 2, (u.y + best.y) / 2);
      }
    },

    blockerAhead(g, u, gx, gy) {
      if (u.layer !== 0) return null;
      const d = R.dist(u.x, u.y, gx, gy);
      if (d < 1) return null;
      const look = Math.min(d, (u.def.big ? 30 : 22) + 8);
      const px = u.x + ((gx - u.x) / d) * look,
        py = u.y + ((gy - u.y) / d) * look;
      const b = g.buildingAtWorld(px, py);
      if (!b || b.dead) return null;
      if (!R.hostileTo(u.fac, b.fac)) return null;
      const i = g.t.at(px, py);
      if (i < 0 || g.nav.passTile(i, u.fac)) return null;
      return b;
    },

    separate(g, u, dt) {
      const want = u.def.big
        ? 34
        : u.def.cls === "arm"
          ? 30
          : u.def.cls === "sea"
            ? 40
            : u.def.cls === "inf"
              ? 15
              : 24;
      let px = 0,
        py = 0,
        n = 0;
      g.grid.query(u.x, u.y, want, (o) => {
        if (o === u || o.kind !== "u" || o.dead || o.inside) return;
        if (o.layer !== u.layer) return;
        const dx = u.x - o.x,
          dy = u.y - o.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > want * want || d2 < 0.001) return;
        const d = Math.sqrt(d2);
        const f = (want - d) / want;
        px += (dx / d) * f;
        py += (dy / d) * f;
        n++;
      });
      if (!n) return;
      const push = u.def.cls === "inf" ? 42 : 74;
      u.vx += (px / n) * push * dt * 3;
      u.vy += (py / n) * push * dt * 3;
      if (u.order && u.order.type === "hold") {
        u.vx *= 0.2;
        u.vy *= 0.2;
      }
    },
  };

  R.Entity = Entity;
})();
