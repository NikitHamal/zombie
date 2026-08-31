/* Persistent battlefield damage: a generic stamp layer. Splats and
   corpses are painted once onto an offscreen canvas and drawn every frame
   as a single image. WHAT gets stamped is the scenario's call — it
   registers painters: st.register(kind, (sc, x, y, seed) => ...), and
   st.register("corpse", (sc, agent) => ...). */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const BUDGET = 10e6; // pixel budget: vast theatres stamp at a smaller scale

  class Stains {
    constructor(world) {
      this.cv = document.createElement("canvas");
      this.k = Math.min(1, Math.sqrt(BUDGET / (world.w * world.h)));
      this.cv.width = Math.max(1, Math.round(world.w * this.k));
      this.cv.height = Math.max(1, Math.round(world.h * this.k));
      this.c = this.cv.getContext("2d");
      this.p = {};
    }

    draw(c) {
      c.drawImage(this.cv, 0, 0, this.cv.width / this.k, this.cv.height / this.k);
    }

    register(kind, painter) {
      this.p[kind] = painter;
    }

    splat(x, y, kind, seed) {
      const f = this.p[kind];
      if (!f) return;
      const sc = this.c;
      sc.save();
      sc.scale(this.k, this.k);
      f(sc, x, y, seed, this);
      sc.restore();
    }

    corpse(a) {
      const f = this.p.corpse;
      if (!f) return;
      const sc = this.c;
      sc.save();
      sc.scale(this.k, this.k);
      f(sc, a, this);
      sc.restore();
    }

    // wobbly irregular blob — shared painter utility for the scenario
    fillBlob(cx, cy, r, seed, fill) {
      const sc = this.c;
      const n = 7 + Math.floor(ZS.hash(seed) * 3);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const rr = r * (0.75 + ZS.hash(seed + i) * 0.5);
        pts.push({
          x: cx + Math.cos(ang) * rr,
          y: cy + Math.sin(ang) * rr,
        });
      }
      sc.fillStyle = fill;
      ZS.wpoly(sc, pts, seed + 50, r * 0.35, true);
      sc.fill();
    }
  }

  ZS.Stains = Stains;
})();
