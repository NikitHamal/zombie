/* SANDSTORM — shooting.

   Every shot is a record that travels: bullets and shells fly straight,
   howitzers lob, missiles chase, bombs fall out of a bomber. Nothing hits
   instantly except a claw, so you can watch a shell cross the map and
   understand why it landed where it did.

   Damage is decided at the moment of impact:

     dmg x the specialisation x the armour gap x the hard-target rule

   The specialisation follows the design spec, and it is worth repeating,
   because it decides what a base-killer truck is for: against what it is
   built to kill it deals five times the sheet damage, and against
   everything else a fifth of a fifth. The gun that loves the factory
   does not love the tank. The hard-target rule says a hundred guns
   shooting a flak deal three times the damage of ten, not ten times —
   swarming a hard target with cheap units is a way to waste cheap units. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});

  const BOMB_FALL = 320;
  const MISSILE_TURN = 3.4;

  const Combat = {
    /* ---------- range: what the gun can reach, at this target ---------- */

    // the range the gun offers against this particular target. The
    // specialisation stretches it (rm), and only while the target moves
    // or fires when the sheet says rmMove. A flak tower sees boats and
    // trains from further out, because they are long.
    rangeTo(g, e, tgt) {
      const w = e.w;
      if (!w) return 0;
      let r = w.range;
      const spec = e.def ? e.def.spec : null;
      if (spec && R.specMatch(spec, tgt)) {
        const moved =
          tgt.kind === "b" ||
          tgt.vx * tgt.vx + tgt.vy * tgt.vy > 36 ||
          (tgt.lastFire || -99) > g.time - 1.5;
        if (!e.def.rmMove || moved) r *= e.def.rm || 1;
      }
      if (e.def && e.def.flak) {
        const c = R.classOf(tgt);
        if (c === "boat" || c === "train") r += R.FLAK_SEA_RANGE_BONUS;
      }
      return r;
    },

    /* ---------- firing ---------- */

    fire(g, src, tgt, w) {
      if (!w) return;
      this.noteShot(g, tgt);
      const d = R.dist(src.x, src.y, tgt.x, tgt.y);

      // claws and point-blank bursts simply land
      if (w.kind === "claw") {
        R.FX.slash(g, src.x, src.y, tgt.x, tgt.y, src.fac);
        this.hit(g, src, tgt, w, tgt.x, tgt.y);
        if (ZS.sound) ZS.sound.event("claw", src.x, src.y);
        return;
      }
      if (d < 34 && w.kind === "bullet") {
        R.FX.tracer(g, src.x, src.y - (src.alt || 0) * 0.4, tgt.x, tgt.y, src.fac, w);
        this.hit(g, src, tgt, w, tgt.x, tgt.y);
        if (ZS.sound) ZS.sound.event("shot", src.x, src.y);
        return;
      }

      const muzzleY = src.y - (src.alt || 0) * 0.5;
      const sh = {
        x: src.x,
        y: muzzleY,
        z: src.alt || 0,
        sx: src.x,
        sy: muzzleY,
        tx: tgt.x,
        ty: tgt.y,
        w,
        fac: src.fac,
        srcId: src.id,
        src,
        tgt,
        tgtId: tgt.id,
        life: 6,
        t: 0,
        seed: Math.random(),
      };

      if (w.kind === "bomb") {
        // dropped straight down from altitude, and it lands where the
        // target was when it let go
        sh.x = src.x;
        sh.y = src.y;
        sh.z = src.alt || 0;
        sh.tx = tgt.x;
        sh.ty = tgt.y;
        sh.fall = true;
        sh.dur = 0.25 + (src.alt || 0) / BOMB_FALL;
        sh.vx = (tgt.x - src.x) / sh.dur;
        sh.vy = (tgt.y - src.y) / sh.dur;
      } else if (w.arc) {
        const dur = Math.max(0.4, d / w.speed);
        sh.dur = dur;
        sh.arcH = Math.min(320, 60 + d * 0.42);
        sh.vx = (tgt.x - sh.x) / dur;
        sh.vy = (tgt.y - sh.y) / dur;
      } else if (w.kind === "missile") {
        sh.home = true;
        sh.spd = w.speed;
        sh.a = Math.atan2(tgt.y - sh.y, tgt.x - sh.x);
      } else {
        const dur = Math.max(0.05, d / w.speed);
        sh.dur = dur;
        sh.vx = (tgt.x - sh.x) / dur;
        sh.vy = (tgt.y - sh.y) / dur;
      }
      g.shots.push(sh);

      R.FX.muzzle(g, src, w);
      if (ZS.sound) {
        const ev =
          w.kind === "shell"
            ? "cannon"
            : w.kind === "rocket" || w.kind === "missile"
              ? "rocket"
              : w.kind === "bomb"
                ? "bomb"
                : "shot";
        ZS.sound.event(ev, src.x, src.y);
      }
    },

    // how many guns are on this target right now — the hard-target number
    noteShot(g, tgt) {
      if (g.time - (tgt.atkWin || -9) > 1) {
        tgt.atkWin = g.time;
        tgt.atkN = 0;
      }
      tgt.atkN = (tgt.atkN || 0) + 1;
      return tgt.atkN;
    },

    /* ---------- the frame ---------- */

    update(g, dt) {
      const shots = g.shots;
      let w = 0;
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i];
        s.life -= dt;
        s.t += dt;
        let arrived = false;

        if (s.home) {
          // chase: a missile can be outrun, and it can be dodged by death
          if (!s.tgt || s.tgt.dead) {
            s.tgt = g.nearestTarget(
              { x: s.x, y: s.y, fac: s.fac, kind: "u", w: s.w, def: {} },
              260,
              true,
            );
            if (!s.tgt) s.life = 0;
          }
          if (s.tgt) {
            const want = Math.atan2(s.tgt.y - s.y, s.tgt.x - s.x);
            s.a = R.turnToward(s.a, want, MISSILE_TURN * dt);
            s.x += Math.cos(s.a) * s.spd * dt;
            s.y += Math.sin(s.a) * s.spd * dt;
            s.z = s.tgt.alt || 0;
            if (R.dist2(s.x, s.y, s.tgt.x, s.tgt.y) < 22 * 22) arrived = true;
          }
          R.FX.smoke(g, s.x, s.y, 0.4);
        } else if (s.fall) {
          const f = Math.min(1, s.t / s.dur);
          s.x = s.sx + s.vx * s.t;
          s.y = s.sy + s.vy * s.t;
          s.z = (s.z || 0) * (1 - f);
          if (f >= 1) arrived = true;
        } else {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (s.w.arc) {
            const f = Math.min(1, s.t / s.dur);
            s.z = Math.sin(f * Math.PI) * s.arcH;
          } else s.z = 0;
          // travelled far enough?
          if (s.dur !== undefined && s.t >= s.dur) arrived = true;
          const dd = R.dist2(s.x, s.y, s.tx, s.ty);
          if (dd < 18 * 18) arrived = true;
        }

        if (s.life <= 0) {
          if (s.w.arc || s.fall) this.detonate(g, s, s.x, s.y);
          continue; // dropped
        }
        if (!arrived) {
          shots[w++] = s;
          // tracers for the fast stuff
          if (s.w.kind === "bullet" && Math.random() < 0.55)
            R.FX.tracer(g, s.x - s.vx * 0.02, s.y - s.vy * 0.02, s.x, s.y, s.fac, s.w);
          continue;
        }

        // arrived: did we hit the thing we aimed at, or the ground?
        const t = s.tgt;
        if (t && !t.dead && R.dist2(s.x, s.y, t.x, t.y) < 46 * 46)
          this.hit(g, s.src, t, s.w, s.x, s.y);
        else this.detonate(g, s, s.x, s.y);
      }
      shots.length = w;
    },

    detonate(g, s, x, y) {
      const w = s.w;
      R.FX.impact(g, x, y, w);
      if (w.splash) this.splash(g, x, y, w.splash, w, s.fac, s.src);
      else {
        // a miss that still lands: check for something standing there
        const t = this.pickAt(g, x, y, 24, s.fac);
        if (t) this.hit(g, s.src, t, w, x, y);
      }
      if (ZS.sound) ZS.sound.event(w.kind === "bomb" ? "boom" : "hit", x, y);
    },

    pickAt(g, x, y, r, fac) {
      let best = null,
        bd = r * r;
      g.grid.query(x, y, r + 20, (o) => {
        if (o.dead || o.fac === fac) return;
        if (!R.hostileTo(fac, o.fac)) return;
        const d2 = R.dist2(x, y, o.x, o.y);
        if (d2 < bd) {
          bd = d2;
          best = o;
        }
      });
      return best;
    },

    splash(g, x, y, r, w, fac, src) {
      const hit = [];
      g.grid.query(x, y, r + 40, (o) => {
        if (o.dead) return;
        if (o.fac === fac) return;
        if (!R.hostileTo(fac, o.fac)) return;
        const d = R.dist(x, y, o.x, o.y);
        if (d > r + (o.kind === "b" ? o.size * 18 : 14)) return;
        hit.push([o, d]);
      });
      for (const [o, d] of hit) {
        const fall = R.clamp(1 - (d / r) * 0.62, 0.3, 1);
        this.hit(g, src, o, w, x, y, fall);
      }
      R.FX.explode(g, x, y, r, w.kind === "bomb" ? 1.5 : 1);
      if (R.Cam) R.Cam.shake(R.clamp(r * 0.12, 2, 16));
    },

    /* ---------- the hit ---------- */

    hit(g, src, tgt, w, x, y, fall) {
      if (!tgt || tgt.dead) return;
      if (tgt.kind === "u" && tgt.inside) return;
      if (src && src.fac !== undefined && src.fac === tgt.fac) return;
      if (src && src.fac !== undefined && !R.hostileTo(src.fac, tgt.fac)) return;

      const cls = tgt.kind === "b" ? "bld" : tgt.def.cls;
      const vs = w.vs && w.vs[cls] !== undefined ? w.vs[cls] : 1;
      const arm = tgt.kind === "b" ? tgt.arm || tgt.def.arm : tgt.def.arm + (tgt.vet || 0);
      const am = R.armorMul(w.pen || 0, arm || 0);

      // the specialisation: the gun loves what it is built to kill
      let sm = 1;
      const spec = src && src.def ? src.def.spec : null;
      if (spec) sm = R.specMatch(spec, tgt) ? R.SPEC_MUL : R.SPEC_OFF;

      // the hard-target rule: a flak tower soaks up a swarm
      let hard = 1;
      if (tgt.kind === "b" && tgt.def.hard) {
        const n = Math.max(1, tgt.atkN || 1);
        hard = R.hardScale(n);
      }
      const dmg = w.dmg * sm * am * vs * hard * (fall === undefined ? 1 : fall);

      tgt.hp -= dmg;
      tgt.dmgFlash = 0.22;
      tgt.lastHit = g.time;

      // who touched this flak: the capture rule remembers
      if (tgt.kind === "b" && tgt.def.flak && src && src.fac !== undefined) tgt.lastBy = src.fac;

      if (src && src.kind) {
        // being shot wakes you up: you turn on whoever shot you
        if (tgt.kind === "u" && !tgt.order && (tgt.w || tgt.w2)) {
          const d = R.dist(tgt.x, tgt.y, src.x, src.y);
          if (d < Math.max(tgt.sight, 260)) tgt.order = { type: "attack", tgt: src };
        }
      }

      R.FX.blood(g, x, y, tgt.kind === "b" ? "bld" : tgt.def.cls, dmg);

      if (tgt.hp <= 0) {
        if (tgt.kind === "b") g.removeBuilding(tgt);
        else {
          g.killUnit(tgt);
          if (src && src.fac !== undefined && g.factions[src.fac]) {
            g.factions[src.fac].kills++;
            if (src.fac === 0) g.stats.killed++;
          }
        }
      }
    },
  };

  R.Combat = Combat;
})();
