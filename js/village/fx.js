/* The Hollow — the noise and the smoke.
   Everything an army does that is loud: an arrow on its way, a shell
   arcing over the wall, the burst when it lands, the smoke that hangs
   over it afterwards, the dust a tank leaves, the wash a rotor pushes
   down into the grass, and the crater that stays.

   Records go on the scenario's `fx` list (the core decays and prunes
   them by `t`), and `draw` renders one — it returns true when it has
   claimed the shape, so the scenario's own shapes still come through.

   Nothing here allocates per frame beyond the record itself. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  function push(scen, f) {
    if (scen && scen.fx) scen.fx.push(f);
    return f;
  }

  const Fx = {
    /* ---------- making them ---------- */

    // an arrow: a line that is already most of the way there
    arrow(scen, x0, y0, x1, y1, seed) {
      return push(scen, { x0, y0, x1, y1, t: 0.2, arrow: 1, seed: seed || 0 });
    },

    // a shell: it arcs, and where it lands is where the burst goes
    shell(scen, x0, y0, x1, y1, big, seed) {
      return push(scen, {
        x0,
        y0,
        x1,
        y1,
        t: 0.55,
        shell: 1,
        big: big ? 1 : 0,
        seed: seed || 0,
        arc: 0.6 + Math.random() * 0.5,
      });
    },

    // the burst itself: rings, shrapnel, and smoke that stays a while
    burst(scen, x, y, r, seed) {
      const f = push(scen, { x, y, t: 0.5, boom: 1, r: r || 34, seed: seed || 0 });
      if (ZS.sound) ZS.sound.event("boom", x, y);
      if (scen && scen.stains) scen.stains.splat(x, y, "scorch", seed || Math.random() * 99);
      return f;
    },

    // smoke: it rises and thins, and it hangs over a battlefield
    smoke(scen, x, y, r, seed) {
      return push(scen, { x, y, t: 1.6, smoke: 1, r: r || 12, seed: seed || 0 });
    },

    // dust: wheels, tracks, hooves
    dust(scen, x, y, seed) {
      return push(scen, { x, y, t: 0.5, dust: 1, seed: seed || 0 });
    },

    // the rotor's wash, pressed into the grass
    wash(scen, x, y, seed) {
      return push(scen, { x, y, t: 0.7, wash: 1, seed: seed || 0 });
    },

    // a bomb dropped from above: it falls, then bursts
    bomb(scen, x0, y0, x1, y1, seed) {
      return push(scen, { x0, y0, x1, y1, t: 0.7, bomb: 1, seed: seed || 0 });
    },

    // sparks off armour, and chips off stone
    spark(scen, x, y, seed, n) {
      return push(scen, { x, y, t: 0.22, spark: 1, n: n || 4, seed: seed || 0 });
    },

    /* ---------- drawing one ---------- */

    draw(c, f) {
      if (f.arrow) {
        // most of the shaft, and the head arriving
        const k = 1 - f.t / 0.2;
        const x = f.x0 + (f.x1 - f.x0) * Math.min(1, k * 1.15);
        const y = f.y0 + (f.y1 - f.y0) * Math.min(1, k * 1.15);
        const an = Math.atan2(f.y1 - f.y0, f.x1 - f.x0);
        c.strokeStyle = "rgba(104,78,44,0.9)";
        c.lineWidth = 1.2;
        ZS.wline(c, x - Math.cos(an) * 14, y - Math.sin(an) * 14 * 0.5, x, y, f.seed, 0.3);
        c.strokeStyle = "rgba(70,66,58,0.95)";
        c.lineWidth = 1.4;
        ZS.wline(c, x, y, x + Math.cos(an) * 4, y + Math.sin(an) * 2, f.seed + 1, 0.2);
        return true;
      }
      if (f.shell) {
        const k = 1 - f.t / 0.55;
        const x = f.x0 + (f.x1 - f.x0) * k;
        const bow = Math.sin(k * Math.PI) * 46 * f.arc;
        const y = f.y0 + (f.y1 - f.y0) * k - bow;
        c.strokeStyle = "rgba(70,66,58,0.5)";
        c.lineWidth = 1;
        // the trail it has already flown
        for (let i = 1; i <= 3; i++) {
          const kk = Math.max(0, k - i * 0.06);
          const bx = f.x0 + (f.x1 - f.x0) * kk;
          const by = f.y0 + (f.y1 - f.y0) * kk - Math.sin(kk * Math.PI) * 46 * f.arc;
          c.globalAlpha = 0.3 / i;
          ZS.wcirc(c, bx, by, 2.2, f.seed + i, 0.4);
        }
        c.globalAlpha = 1;
        c.fillStyle = "rgba(64,60,54,0.95)";
        c.beginPath();
        c.arc(x, y, f.big ? 3.4 : 2.4, 0, 6.2832);
        c.fill();
        // and the smoke it drags
        c.strokeStyle = "rgba(150,150,146,0.3)";
        c.lineWidth = 1;
        ZS.wline(c, x, y, x - 6, y - 4, f.seed + 9, 0.6);
        return true;
      }
      if (f.bomb) {
        const k = 1 - f.t / 0.7;
        const x = f.x0 + (f.x1 - f.x0) * Math.min(1, k * 1.6);
        const y = f.y0 + (f.y1 - f.y0) * Math.min(1, k * 1.6);
        c.strokeStyle = "rgba(60,58,52,0.9)";
        c.lineWidth = 1.6;
        ZS.wline(c, x, y, x - 2, y - 9, f.seed, 0.2);
        ZS.wline(c, x - 3, y - 3, x + 3, y - 3, f.seed + 1, 0.2);
        c.strokeStyle = "rgba(150,150,146,0.35)";
        c.lineWidth = 1;
        ZS.wline(c, x, y - 9, x - 5, y - 15, f.seed + 2, 0.5);
        return true;
      }
      if (f.boom) {
        const k = 1 - f.t / 0.5;
        const r = f.r * (0.35 + k * 0.75);
        // the rings
        c.strokeStyle = "rgba(196,120,54," + (0.5 * f.t * 2).toFixed(2) + ")";
        c.lineWidth = 2.4;
        ZS.wcirc(c, f.x, f.y, r, f.seed, 3);
        c.strokeStyle = "rgba(150,90,44," + (0.35 * f.t * 2).toFixed(2) + ")";
        c.lineWidth = 1.6;
        ZS.wcirc(c, f.x, f.y, r * 0.6, f.seed + 4, 2);
        // the shrapnel, thrown out and falling
        c.strokeStyle = "rgba(96,86,74,0.75)";
        c.lineWidth = 1.2;
        for (let i = 0; i < 7; i++) {
          const an = ZS.hash(f.seed + i) * 6.283;
          const d = r * (0.7 + ZS.hash(f.seed + i * 3) * 0.7);
          ZS.wline(
            c,
            f.x + Math.cos(an) * (d - 6),
            f.y + Math.sin(an) * (d - 6) * 0.6,
            f.x + Math.cos(an) * d,
            f.y + Math.sin(an) * d * 0.6,
            f.seed + 10 + i,
            0.4,
          );
        }
        // the flash inside it
        c.save();
        c.globalCompositeOperation = "lighter";
        c.fillStyle = "rgba(242,186,96," + (0.5 * f.t * 2).toFixed(2) + ")";
        c.beginPath();
        c.arc(f.x, f.y, r * 0.5, 0, 6.2832);
        c.fill();
        c.restore();
        return true;
      }
      if (f.smoke) {
        const k = 1 - f.t / 1.6;
        const y = f.y - k * 26;
        const r = f.r * (0.5 + k * 1.4);
        c.strokeStyle = "rgba(140,138,132," + (0.3 * f.t).toFixed(2) + ")";
        c.lineWidth = 1.2;
        ZS.wcirc(c, f.x + Math.sin(k * 6) * 4, y, r, f.seed, 2.4);
        c.strokeStyle = "rgba(120,118,112," + (0.2 * f.t).toFixed(2) + ")";
        ZS.wcirc(c, f.x + Math.sin(k * 6 + 2) * 6, y - r * 0.6, r * 0.7, f.seed + 3, 2);
        return true;
      }
      if (f.dust) {
        const k = 1 - f.t / 0.5;
        c.strokeStyle = "rgba(168,158,132," + (0.34 * f.t).toFixed(2) + ")";
        c.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const d = 3 + k * (7 + i * 4);
          ZS.wcirc(c, f.x - i * 3, f.y - k * (2 + i), d * 0.6, f.seed + i, 1.6);
        }
        return true;
      }
      if (f.wash) {
        const k = 1 - f.t / 0.7;
        c.strokeStyle = "rgba(150,164,132," + (0.3 * f.t).toFixed(2) + ")";
        c.lineWidth = 1.4;
        for (let i = 0; i < 4; i++) {
          const r = 8 + k * (16 + i * 8);
          ZS.wcirc(c, f.x, f.y, r, f.seed + i * 5, 2.2);
        }
        return true;
      }
      if (f.spark) {
        c.strokeStyle = "rgba(232,196,110," + (f.t * 3).toFixed(2) + ")";
        c.lineWidth = 1.2;
        for (let i = 0; i < f.n; i++) {
          const an = ZS.hash(f.seed + i) * 6.283;
          const d = 4 + ZS.hash(f.seed + i * 5) * 9;
          ZS.wline(
            c,
            f.x,
            f.y,
            f.x + Math.cos(an) * d,
            f.y + Math.sin(an) * d * 0.6,
            f.seed + i,
            0.3,
          );
        }
        return true;
      }
      return false;
    },
  };

  ZS.Fx = Fx;
})();
