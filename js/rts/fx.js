/* SANDSTORM — the noise of a battle.

   Dust behind a column, the flash and the shove of a gun firing, a tracer
   you can follow with your eye, the smoke that hangs over a burning base,
   and the wrecks that stay where a tank died for the rest of the game.

   Everything here is pooled: the particle array is allocated once and
   reused forever, and nothing in a busy frame allocates. The wreck list is
   the one that grows, and it is capped — the oldest hull rusts away. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});

  const PMAX = 1400;
  const TMAX = 320;
  const WRECK_MAX = 220;

  const parts = [];
  for (let i = 0; i < PMAX; i++)
    parts.push({
      on: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      max: 1,
      k: 0,
      s: 1,
      r: 0,
      vr: 0,
      seed: 0,
      fac: 0,
    });
  const tracers = [];
  for (let i = 0; i < TMAX; i++)
    tracers.push({ on: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, max: 1, fac: 0, big: 0 });
  const markers = [];
  const wrecks = [];
  let pi = 0,
    ti = 0;

  function take() {
    // ring buffer: when the pool is full the oldest particle is recycled,
    // which is exactly the right behaviour for smoke
    for (let n = 0; n < 24; n++) {
      const p = parts[pi];
      pi = (pi + 1) % PMAX;
      if (!p.on) return p;
    }
    const p = parts[pi];
    pi = (pi + 1) % PMAX;
    return p;
  }
  function takeT() {
    const t = tracers[ti];
    ti = (ti + 1) % TMAX;
    return t;
  }

  function spawn(g, x, y, z, vx, vy, vz, life, k, s, fac) {
    const p = take();
    p.on = true;
    p.x = x;
    p.y = y;
    p.z = z || 0;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz || 0;
    p.life = life;
    p.max = life;
    p.k = k;
    p.s = s;
    p.r = Math.random() * R.TAU;
    p.vr = (Math.random() - 0.5) * 6;
    p.seed = Math.random() * 1000;
    p.fac = fac || 0;
    return p;
  }

  const FX = {
    parts,
    tracers,
    markers,
    wrecks,

    /* ---------- emitters ---------- */

    dust(g, x, y, scale) {
      const n = 1;
      for (let i = 0; i < n; i++)
        spawn(
          g,
          x + (Math.random() - 0.5) * 8,
          y + (Math.random() - 0.5) * 6,
          1,
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 10 - 6,
          6 + Math.random() * 12,
          0.7 + Math.random() * 0.6,
          0, // dust
          0.6 + (scale || 1) * 0.7,
        );
    },

    wake(g, x, y) {
      spawn(
        g,
        x + (Math.random() - 0.5) * 18,
        y + 12,
        0,
        (Math.random() - 0.5) * 6,
        4,
        0,
        1.1,
        6,
        1.1,
      );
    },

    smoke(g, x, y, scale) {
      spawn(
        g,
        x + (Math.random() - 0.5) * 6,
        y + (Math.random() - 0.5) * 6,
        4,
        (Math.random() - 0.5) * 10,
        -8 - Math.random() * 10,
        14 + Math.random() * 14,
        1.4 + Math.random() * 1.4,
        1, // smoke
        0.9 * (scale || 1) + 0.5,
      );
    },

    ember(g, x, y) {
      spawn(
        g,
        x,
        y,
        2,
        (Math.random() - 0.5) * 70,
        (Math.random() - 0.5) * 70 - 20,
        40 + Math.random() * 60,
        0.4 + Math.random() * 0.5,
        2, // ember
        0.7 + Math.random() * 0.6,
      );
    },

    spark(g, x, y) {
      for (let i = 0; i < 2; i++)
        spawn(g, x, y, 2, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, 30, 0.22, 3, 0.6);
    },

    chunk(g, x, y, fac) {
      spawn(
        g,
        x,
        y,
        3,
        (Math.random() - 0.5) * 120,
        (Math.random() - 0.5) * 120,
        60 + Math.random() * 90,
        0.7 + Math.random() * 0.5,
        4, // chunk
        0.7 + Math.random() * 0.7,
        fac,
      );
    },

    // the spray answers to the wound: a rifle round spits, a tank shell
    // throws meat. `dmg` is the hit that caused it, in the target's own
    // hit points.
    blood(g, x, y, cls, dmg) {
      const heft = R.clamp((dmg || 10) / 26, 0.3, 2.4);
      if (cls === "bld") {
        // concrete and steel do not bleed, they spall
        const n = Math.round(1 + heft);
        for (let i = 0; i < n; i++) this.chunk(g, x, y);
        return;
      }
      if (cls === "arm" || cls === "sea") {
        // a hull: sparks off the plate, and more of them for a big hit
        const n = Math.random() < heft * 0.35 ? 1 + (Math.random() < heft * 0.4 ? 1 : 0) : 0;
        for (let i = 0; i < n; i++) this.spark(g, x, y);
        return;
      }
      if (Math.random() < 0.5 * heft)
        spawn(
          g,
          x,
          y,
          2,
          (Math.random() - 0.5) * 40 * heft,
          (Math.random() - 0.5) * 40 * heft,
          20,
          0.4,
          4 + heft * 2,
          0.6,
        );
    },

    muzzle(g, src, w) {
      const d = w.kind === "bullet" ? 16 : 26;
      const mx = src.x + Math.cos(src.va) * d;
      const my = src.y + Math.sin(src.va) * d - (src.alt || 0) * 0.5 - 4;
      src.flash = 0.08;
      spawn(
        g,
        mx,
        my,
        2,
        Math.cos(src.va) * 40,
        Math.sin(src.va) * 40,
        0,
        0.1,
        2,
        w.kind === "bullet" ? 0.7 : 1.4,
      );
      if (w.kind !== "bullet")
        this.smoke(g, mx + Math.cos(src.va) * 10, my + Math.sin(src.va) * 10, 0.5);
    },

    tracer(g, x1, y1, x2, y2, fac, w) {
      const t = takeT();
      t.on = true;
      t.x1 = x1;
      t.y1 = y1;
      t.x2 = x2;
      t.y2 = y2;
      t.life = 0.09;
      t.max = 0.09;
      t.fac = fac;
      t.big = w.kind === "shell" ? 1 : 0;
    },

    slash(g, x1, y1, x2, y2, fac) {
      const t = takeT();
      t.on = true;
      t.x1 = x1;
      t.y1 = y1;
      t.x2 = x2;
      t.y2 = y2;
      t.life = 0.14;
      t.max = 0.14;
      t.fac = fac;
      t.big = 2;
    },

    impact(g, x, y, w) {
      if (w.splash) return; // the explosion does the work
      for (let i = 0; i < 3; i++) this.spark(g, x, y);
      this.dust(g, x, y, 0.8);
      if (ZS.sound) ZS.sound.event("hit", x, y);
    },

    explode(g, x, y, r, scale) {
      scale = scale || 1;
      const n = Math.round(R.clamp(r * 0.5, 6, 44) * scale);
      const cap = ZS.Perf ? ZS.Perf.cap(n) : n;
      for (let i = 0; i < cap; i++) {
        const an = Math.random() * R.TAU;
        const sp = (40 + Math.random() * r * 2.6) * scale;
        spawn(
          g,
          x,
          y,
          2,
          Math.cos(an) * sp,
          Math.sin(an) * sp * 0.6,
          50 + Math.random() * 130,
          0.5 + Math.random() * 0.7,
          Math.random() < 0.45 ? 2 : 1,
          (0.8 + Math.random() * 0.9) * scale,
        );
      }
      for (let i = 0; i < Math.min(8, cap); i++) this.ember(g, x, y);
      for (let i = 0; i < Math.min(6, cap); i++) this.chunk(g, x, y);
      // the ground ring: a scorch that fades
      markers.push({ x, y, type: "scorch", t: 0, life: 26, r: r * 0.9, seed: Math.random() * 100 });
      if (R.Cam) R.Cam.shake(R.clamp(r * 0.14, 2, 18));
    },

    wreck(g, x, y, def, fac) {
      if (wrecks.length >= WRECK_MAX) wrecks.shift();
      wrecks.push({ x, y, def, fac, seed: Math.random() * 1000, t: 0, rot: Math.random() * R.TAU });
    },

    marker(g, x, y, type) {
      if (!type) return;
      markers.push({ x, y, type, t: 0, life: 0.9, seed: Math.random() * 100 });
      if (ZS.sound) ZS.sound.event(type === "attack" ? "order" : "move", x, y);
    },

    ping(g, x, y, kind) {
      markers.push({ x, y, type: "ping", t: 0, life: 2.4, kind: kind || "alert", seed: 0 });
    },

    /* ---------- the frame ---------- */

    update(g, dt) {
      for (let i = 0; i < PMAX; i++) {
        const p = parts[i];
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.on = false;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.z > 0) p.vz -= 120 * dt;
        else {
          p.z = 0;
          p.vz = 0;
          p.vx *= 1 - 2.4 * dt;
          p.vy *= 1 - 2.4 * dt;
        }
        p.r += p.vr * dt;
        if (p.k === 1) {
          p.vy -= 12 * dt; // smoke rises
          p.vx *= 1 - 0.8 * dt;
          p.vy *= 1 - 0.8 * dt;
        }
      }
      for (let i = 0; i < TMAX; i++) {
        const t = tracers[i];
        if (!t.on) continue;
        t.life -= dt;
        if (t.life <= 0) t.on = false;
      }
      let w = 0;
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        m.t += dt;
        if (m.t < m.life) markers[w++] = m;
      }
      markers.length = w;
      for (const wr of wrecks) wr.t += dt;
    },
  };

  R.FX = FX;
})();
