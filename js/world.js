/* The world: a hand-drawn town on a big sheet of paper.
   Ground (paper, speckle, grass wash, water fill, floor wash, page frame)
   is pre-rendered once to an offscreen canvas; water outlines, trees,
   building walls and doors boil every frame in draw.js. Walkability is a
   hard nav grid (nav.js) — main.js orders the creation: water, nav,
   buildings, pre-render, trees. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const SS = 1.25; // pre-render supersample (crisp from fit-zoom up to max zoom)
  const GROUND_BUDGET = 14e6; // pixel budget for the pre-rendered sheet: a
  // vast theatre scales down instead of eating hundreds of megabytes
  function groundSS(w, h) {
    return Math.min(SS, Math.sqrt(GROUND_BUDGET / (w * h)));
  }

  // strict point-in-polygon (raycast): a local copy of the nav.js one, so
  // placement can reject footprints that touch a water polygon
  function pointInPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x,
        yi = pts[i].y,
        xj = pts[j].x,
        yj = pts[j].y;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  class World {
    constructor(w, h) {
      this.w = w;
      this.h = h;
      this.seed = 0; // set by main.js: a new town on every refresh
      this.forest = null; // dense tree cover, picked in layoutForest()
      this.towns = [
        { x: 1250, y: 950, n: 3, spread: 430 },
        { x: 2150, y: 1750, n: 3, spread: 430 },
        { x: 2100, y: 2100, n: 2, spread: 360 },
        { x: 850, y: 1800, n: 2, spread: 380 },
        { x: 1550, y: 430, n: 2, spread: 380 },
        { x: 2700, y: 1300, n: 2, spread: 380 },
      ];
      this.trees = [];
      this.buildings = [];
      this.ripples = [];
      this.lake = null;
      this.river = null;
      this.ponds = [];
      this.canvas = document.createElement("canvas");
      this.nav = null; // set by main.js before water()/build()/trees()
    }

    riverX(y) {
      // the pinned (scenario) records carry the classic frequencies;
      // the generative vertical river stores its own on the record
      const r = this.river;
      return (
        r.baseX +
        Math.sin(y * (r.f1 || 0.0021) + r.p1) * r.a1 +
        Math.sin(y * (r.f2 || 0.0007) + r.p2) * r.a2
      );
    }
    riverW(y) {
      const r = this.river;
      return r.baseW + Math.sin(y * 0.0016 + r.p3) * 28;
    }

    /* ---------- layout ---------- */

    // water first: the nav grid, buildings and trees all keep to it.
    // A scenario may pin the battlefield (opts.riverBaseX + opts.lake):
    // that path runs the old way, bit for bit. Everything else is
    // generative — the river's orientation, the lake, the ponds, and
    // the districts all move with the seed.
    water(opts) {
      const rng = ZS.rng32(this.seed ^ 0x51d);
      const pinned = !!(opts && opts.riverBaseX);

      if (pinned && opts.lake) {
        // ---- the pinned battlefield (scenario-owned): the old way ----
        this.river = {
          pts: [],
          samples: [],
          baseX: opts.riverBaseX,
          a1: 110 + rng() * 130,
          a2: 50 + rng() * 110,
          p1: rng() * Math.PI * 2,
          p2: rng() * Math.PI * 2,
          p3: rng() * Math.PI * 2,
          baseW: 70 + rng() * 50,
        };
        const left = [],
          right = [];
        for (let y = 14; y <= this.h - 14; y += 120) {
          const x = ZS.clamp(this.riverX(y), 60, this.w - 60);
          const hw = this.riverW(y) / 2;
          left.push({ x: x - hw - 3, y });
          right.push({ x: x + hw + 3, y });
          this.river.samples.push({ x, y, hw });
        }
        this.river.pts = left.concat(right.reverse());
        if (!(opts.towns === false))
          for (const t of this.towns) {
            t.x += (rng() - 0.5) * 260;
            t.y += (rng() - 0.5) * 260;
          }
        const cx = opts.lake.x,
          cy = opts.lake.y,
          r = opts.lake.r;
        this.lake = { cx, cy, pts: [], r };
        const L = 15;
        for (let i = 0; i < L; i++) {
          const a = (i / L) * Math.PI * 2;
          const rr = r * (0.92 + rng() * 0.18);
          this.lake.pts.push({
            x: cx + Math.cos(a) * rr * 1.03,
            y: cy + Math.sin(a) * rr * 0.8 * 1.03,
          });
        }
        for (let i = 0; i < 16; i++) {
          const a = rng() * Math.PI * 2,
            rr = rng() * r * 0.65;
          this.ripples.push({
            x: cx + Math.cos(a) * rr,
            y: cy + Math.sin(a) * rr * 0.8,
            s: rng() * 100,
            w: 8 + rng() * 14,
          });
        }
        for (let i = 0; i < 20; i++) {
          const y = 40 + rng() * (this.h - 80);
          this.ripples.push({
            x: this.riverX(y) + (rng() - 0.5) * this.riverW(y) * 0.6,
            y,
            s: 100 + rng() * 100,
            w: 8 + rng() * 12,
          });
        }
        this.ponds = [];
        return;
      }

      // ---- the generative map (the outbreak) ----
      this._genRiver(rng);
      this._genTowns(rng);
      this.lake = { cx: 0, cy: 0, r: 0, pts: [] };
      this.ponds = [];
      // a wobbly lake on open land (55% of maps)
      if (rng() < 0.55) {
        let cx = 0,
          cy = 0,
          r = 230,
          ok = false;
        for (let i = 0; i < 12 && !ok; i++) {
          cx = this.w * (0.1 + rng() * 0.8);
          cy = this.h * (0.1 + rng() * 0.8);
          r = 200 + rng() * 140;
          ok = this._waterClear(cx, cy, r, r + 160);
        }
        if (ok) this.lake = this._lakeBlob(cx, cy, r, rng);
      }
      // a small pond (25% of maps), well off the main lake
      if (rng() < 0.25) {
        let px = 0,
          py = 0,
          pr = 0,
          ok = false;
        for (let i = 0; i < 12 && !ok; i++) {
          px = this.w * (0.1 + rng() * 0.8);
          py = this.h * (0.1 + rng() * 0.8);
          pr = 80 + rng() * 70;
          ok = this._waterClear(px, py, pr, pr + 160);
          if (
            ok &&
            this.lake.r > 0 &&
            Math.hypot(this.lake.cx - px, this.lake.cy - py) <= this.lake.r + pr + 200
          )
            ok = false;
        }
        if (ok) this.ponds.push(this._lakeBlob(px, py, pr, rng));
      }
      // ripples: short squiggle marks floating in the water
      if (this.lake.r > 0)
        for (let i = 0; i < 16; i++) {
          const a = rng() * Math.PI * 2,
            rr = rng() * this.lake.r * 0.65;
          this.ripples.push({
            x: this.lake.cx + Math.cos(a) * rr,
            y: this.lake.cy + Math.sin(a) * rr * 0.8,
            s: rng() * 100,
            w: 8 + rng() * 14,
          });
        }
      for (const p of this.ponds)
        for (let i = 0; i < 6; i++) {
          const a = rng() * Math.PI * 2,
            rr = rng() * p.r * 0.6;
          this.ripples.push({
            x: p.cx + Math.cos(a) * rr,
            y: p.cy + Math.sin(a) * rr * 0.8,
            s: rng() * 100,
            w: 8 + rng() * 10,
          });
        }
      for (let i = 0; i < 20; i++) {
        const s = this.river.samples[(rng() * this.river.samples.length) | 0];
        this.ripples.push({
          x: s.x + (rng() - 0.5) * s.hw * 0.8,
          y: s.y + (rng() - 0.5) * 80,
          s: 100 + rng() * 100,
          w: 8 + rng() * 12,
        });
      }
    }

    // the generative river: orientation (vertical 45% / horizontal 35% /
    // diagonal 20%) and the meander all move with the seed. The output is
    // the same pts/samples model the rest of the world consumes.
    _genRiver(rng) {
      const o = rng() < 0.45 ? "v" : rng() < 0.55 ? "h" : "d";
      const a1 = 60 + rng() * 200;
      const a2 = 30 + rng() * 130;
      const f1 = 0.0016 + rng() * 0.0012;
      const f2 = 0.0005 + rng() * 0.0008;
      const p1 = rng() * Math.PI * 2;
      const p2 = rng() * Math.PI * 2;
      const p3 = rng() * Math.PI * 2;
      const baseW = 45 + rng() * 85;
      this.river = {
        pts: [],
        samples: [],
        baseX: 0,
        a1,
        a2,
        p1,
        p2,
        p3,
        baseW,
        f1,
        f2,
        ori: o,
      };
      const left = [],
        right = [],
        W = this.w,
        H = this.h;
      if (o === "v") {
        const baseX = a1 + 60 + rng() * Math.max(1, W - 2 * (a1 + 60));
        this.river.baseX = baseX; // riverX/riverW keep their vertical meaning
        for (let y = -40; y <= H + 40; y += 120) {
          const x = ZS.clamp(
            baseX + Math.sin(y * f1 + p1) * a1 + Math.sin(y * f2 + p2) * a2,
            40,
            W - 40,
          );
          const hw = (baseW + Math.sin(y * 0.0016 + p3) * 28) / 2;
          left.push({ x: x - hw - 3, y });
          right.push({ x: x + hw + 3, y });
          this.river.samples.push({ x, y, hw });
        }
      } else if (o === "h") {
        const baseY = a1 + 60 + rng() * Math.max(1, H - 2 * (a1 + 60));
        for (let x = -40; x <= W + 40; x += 120) {
          const y = ZS.clamp(
            baseY + Math.sin(x * f1 + p1) * a1 + Math.sin(x * f2 + p2) * a2,
            40,
            H - 40,
          );
          const hw = (baseW + Math.sin(x * 0.0016 + p3) * 28) / 2;
          left.push({ x, y: y - hw - 3 });
          right.push({ x, y: y + hw + 3 });
          this.river.samples.push({ x, y, hw });
        }
      } else {
        // diagonal: a ribbon from one edge to another, sine-offset across
        const e0 = (rng() * 4) | 0;
        const e1 = (e0 + 1 + ((rng() * 3) | 0)) % 4; // any other edge
        const pt = (e, f) => {
          f = 0.15 + f * 0.7;
          if (e === 0) return { x: W * f, y: 14 };
          if (e === 1) return { x: W - 14, y: H * f };
          if (e === 2) return { x: W * f, y: H - 14 };
          return { x: 14, y: H * f };
        };
        const A = pt(e0, rng()),
          B = pt(e1, rng());
        const dx = B.x - A.x,
          dy = B.y - A.y;
        const L = Math.hypot(dx, dy);
        const nx = -dy / L,
          ny = dx / L; // the perpendicular
        for (let s = -40; s <= L + 40; s += 120) {
          // the meander fades out at the rims so the ribbon stays in-bounds
          const tt = s / L;
          const fade = Math.min(1, s / 240, (L - s) / 240);
          const off = (Math.sin(s * f1 + p1) * a1 + Math.sin(s * f2 + p2) * a2) * fade;
          const cx = ZS.clamp(A.x + dx * tt + nx * off, 40, W - 40);
          const cy = ZS.clamp(A.y + dy * tt + ny * off, 40, H - 40);
          const hw = (baseW + Math.sin(s * 0.0016 + p3) * 28) / 2;
          left.push({ x: cx + nx * (hw + 3), y: cy + ny * (hw + 3) });
          right.push({ x: cx - nx * (hw + 3), y: cy - ny * (hw + 3) });
          this.river.samples.push({ x: cx, y: cy, hw });
        }
      }
      this.river.pts = left.concat(right.reverse());
    }

    // the generative districts: 4-7 anchors on open land, clear of water
    _genTowns(rng) {
      this.towns = [];
      const n = 4 + Math.floor(rng() * 4); // 4-7
      for (let i = 0; i < n; i++) {
        let placed = false;
        for (let tries = 0; tries < 80 && !placed; tries++) {
          const x = this.w * (0.08 + rng() * 0.84);
          const y = this.h * (0.08 + rng() * 0.84);
          if (x < 160 || x > this.w - 160 || y < 160 || y > this.h - 160) continue;
          let bad = false;
          for (const t of this.towns)
            if (Math.hypot(t.x - x, t.y - y) < 450) {
              bad = true;
              break;
            }
          if (bad) continue;
          // the district's near ring must stay off the water
          for (let k = 0; k < 8; k++) {
            const an = (k / 8) * Math.PI * 2;
            const px = x + Math.cos(an) * 120,
              py = y + Math.sin(an) * 120;
            if (this.nearRiver(px, py, 120) || this.inLake(px, py, -120)) {
              bad = true;
              break;
            }
          }
          if (bad) continue;
          this.towns.push({ x, y, n: 1 + Math.floor(rng() * 5), spread: 280 + rng() * 200 });
          placed = true;
        }
      }
      if (!this.towns.length)
        this.towns.push({ x: this.w * 0.5, y: this.h * 0.5, n: 2, spread: 380 });
    }

    // a wobbly lake polygon (the boiling outline is drawn per-frame)
    _lakeBlob(cx, cy, r, rng) {
      const lake = { cx, cy, r, pts: [] };
      const L = 15;
      for (let i = 0; i < L; i++) {
        const a = (i / L) * Math.PI * 2;
        const rr = r * (0.92 + rng() * 0.18);
        lake.pts.push({
          x: cx + Math.cos(a) * rr * 1.03,
          y: cy + Math.sin(a) * rr * 0.8 * 1.03,
        });
      }
      return lake;
    }

    // is a circle of radius r clear of the rim, the river and the towns?
    _waterClear(cx, cy, r, townPad) {
      if (cx - r < 40 || cx + r > this.w - 40 || cy - r < 40 || cy + r > this.h - 40) return false;
      for (const s of this.river.samples)
        if (Math.hypot(s.x - cx, s.y - cy) < s.hw + r + 60) return false;
      for (const t of this.towns)
        if (Math.hypot(t.x - cx, t.y - cy) < townPad + t.spread * 0.5) return false;
      return true;
    }

    // trees last: they stand on open land, one cell off water and walls
    placeAllTrees(opts) {
      const rng = ZS.rng32(this.seed ^ 0xb0ba);
      // scattered groves on open land — or pinned spots for a scenario field
      const pins = (opts && opts.grovePos) || null;
      if (pins) {
        for (const g of pins) {
          const n = 6 + Math.floor(rng() * 8);
          for (let k = 0; k < n; k++) {
            this.placeTree(g.x + (rng() - 0.5) * 280, g.y + (rng() - 0.5) * 240, rng);
          }
        }
      } else {
        const groves = 5 + Math.floor(rng() * 6);
        for (let i = 0; i < groves; i++) {
          const gx = 150 + rng() * (this.w - 300),
            gy = 150 + rng() * (this.h - 300),
            n = 6 + Math.floor(rng() * 8);
          for (let k = 0; k < n; k++) {
            this.placeTree(gx + (rng() - 0.5) * 280, gy + (rng() - 0.5) * 240, rng);
          }
        }
      }
      // the forest: a dense canopy inside the cover circle
      const f = this.forest;
      if (f) {
        for (let i = 0; i < 90; i++) {
          const a = rng() * Math.PI * 2,
            rr = Math.sqrt(rng()) * f.r * 0.92;
          this.placeTree(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.9, rng);
        }
      }
      // a few stragglers
      for (let i = 0; i < 12; i++) {
        this.placeTree(100 + rng() * (this.w - 200), 100 + rng() * (this.h - 200), rng);
      }
    }

    nearRiver(x, y, pad) {
      // radial clearance against the centerline samples: works for every
      // river orientation (the old strip test only knew vertical)
      for (const s of this.river.samples) {
        const dx = s.x - x,
          dy = s.y - y,
          r = s.hw + pad;
        if (dx * dx + dy * dy < r * r) return true;
      }
      return false;
    }

    // pad may be negative to test a ring *outside* the lake
    inLake(x, y, pad) {
      const l = this.lake;
      if (!l || !l.r) return false;
      const dx = x - l.cx,
        dy = y - l.cy;
      const r = l.r - pad;
      return dx * dx + dy * dy < r * r;
    }

    // the forest: a dense patch of cover on open land, picked before the
    // buildings so the town works around it. The horde gets lost inside.
    layoutForest(opts) {
      if (opts && opts.none) {
        this.forest = null;
        return;
      }
      const rng = ZS.rng32(this.seed ^ 0xf057);
      for (let i = 0; i < 48; i++) {
        const x = 340 + rng() * (this.w - 680);
        const y = 340 + rng() * (this.h - 680);
        const r = 300 + rng() * 220;
        // the CENTER must be solid land; the rim may brush water and the
        // tree scatter keeps to the bank on its own
        if (!this.nav || !this.nav.isWalkable(x, y)) continue;
        if (this.inLake(x, y, -r * 0.5)) continue;
        if (this.nearRiver(x, y, r * 0.5 + 20)) continue;
        // stay mostly clear of the street grid — clearOfForest keeps the
        // building footprints out of whatever slips through
        let townHit = false;
        for (const t of this.towns) {
          if (Math.hypot(t.x - x, t.y - y) < r * 0.5 + t.spread * 0.35 + 80) {
            townHit = true;
            break;
          }
        }
        if (townHit) continue;
        this.forest = { x, y, r };
        return;
      }
      // the land ran out: shrink into a corner
      this.forest = { x: this.w * 0.18, y: this.h * 0.78, r: 360 };
    }

    // is a point under the tree cover? (the horde's sight drops off in here)
    inForest(x, y) {
      const f = this.forest;
      if (!f) return false;
      const dx = (x - f.x) / f.r,
        dy = (y - f.y) / (f.r * 0.9);
      return dx * dx + dy * dy < 1;
    }

    // does a footprint stay out of the tree cover (pad = clearance)?
    clearOfForest(x, y, w, h, pad) {
      const f = this.forest;
      if (!f) return true;
      const rr = f.r + pad;
      for (const p of this.perimeterPoints(x, y, w, h, 10)) {
        const dx = (p.x - f.x) / rr,
          dy = (p.y - f.y) / (rr * 0.9);
        if (dx * dx + dy * dy < 1) return false;
      }
      return true;
    }

    // sample a rect's perimeter evenly (for "is this footprint clear of water")
    perimeterPoints(x, y, w, h, n) {
      const pts = [];
      const p = 2 * (w + h);
      for (let i = 0; i < n; i++) {
        const t = (i / n) * p;
        let px, py;
        if (t < w) {
          px = x + t;
          py = y;
        } else if (t < w + h) {
          px = x + w;
          py = y + (t - w);
        } else if (t < 2 * w + h) {
          px = x + (2 * w + h - t);
          py = y + h;
        } else {
          px = x;
          py = y + (2 * h + 2 * w - t);
        }
        pts.push({ x: px, y: py });
      }
      return pts;
    }

    clearOfWater(x, y, w, h, pad) {
      for (const p of this.perimeterPoints(x, y, w, h, 10)) {
        if (this.nearRiver(p.x, p.y, pad) || this.inLake(p.x, p.y, -pad)) return false;
        for (const pd of this.ponds) {
          const dx = p.x - pd.cx,
            dy = p.y - pd.cy;
          if (dx * dx + dy * dy < (pd.r + pad) * (pd.r + pad)) return false;
        }
        if (this._inWaterPoly(p.x, p.y)) return false;
      }
      return !this._inWaterPoly(x + w / 2, y + h / 2);
    }

    // strict membership in the water polygons (river, lake, ponds): the
    // radial tests can miss a meander that slips between the samples
    _inWaterPoly(x, y) {
      if (pointInPoly(x, y, this.river.pts)) return true;
      const lake = this.lake;
      if (lake && lake.r && pointInPoly(x, y, lake.pts)) return true;
      for (const pd of this.ponds) {
        if (pd.pts.length && pointInPoly(x, y, pd.pts)) return true;
      }
      return false;
    }

    placeTree(x, y, rng) {
      for (let i = 0; i < 40; i++) {
        if (!this.treeClear(x, y)) {
          x += (rng() - 0.5) * 120;
          y += (rng() - 0.5) * 120;
          continue;
        }
        const r = 11 + rng() * 8;
        const pts = [];
        for (let k = 0; k < 8; k++) pts.push(r * (0.82 + rng() * 0.36));
        this.trees.push({
          x: ZS.clamp(x, 30, this.w - 30),
          y: ZS.clamp(y, 40, this.h - 30),
          r,
          seed: rng() * 997,
          pts,
        });
        return;
      }
    }

    treeClear(x, y) {
      const nav = this.nav;
      if (!nav || nav.cellAt(x, y) !== 1) return false;
      if (nav.cellAt(x + 10, y) === 0 || nav.cellAt(x - 10, y) === 0) return false;
      if (nav.cellAt(x, y + 10) === 0 || nav.cellAt(x, y - 10) === 0) return false;
      return true;
    }

    /* ---------- pre-rendered ground ---------- */

    build() {
      const c = this.canvas,
        g = c.getContext("2d");
      const SS = groundSS(this.w, this.h);
      c.width = Math.max(1, Math.round(this.w * SS));
      c.height = Math.max(1, Math.round(this.h * SS));
      g.setTransform(SS, 0, 0, SS, 0, 0);
      const W = this.w,
        H = this.h;

      // paper
      g.fillStyle = "#f3edde";
      g.fillRect(0, 0, W, H);

      // paper speckle
      for (let i = 0, n = ((W * H) / 350) | 0; i < n; i++) {
        g.fillStyle = "rgba(90,80,60," + (Math.random() * 0.07).toFixed(3) + ")";
        g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
      }

      // faint stains
      for (let i = 0; i < 12; i++) {
        const x = Math.random() * W,
          y = Math.random() * H;
        const gr = g.createRadialGradient(x, y, 4, x, y, 40 + Math.random() * 90);
        gr.addColorStop(0, "rgba(120,105,70,0.045)");
        gr.addColorStop(1, "rgba(120,105,70,0)");
        g.fillStyle = gr;
        g.fillRect(x - 140, y - 140, 280, 280);
      }

      // soft grass washes
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * W,
          y = Math.random() * H;
        const rx = 60 + Math.random() * 180,
          ry = 40 + Math.random() * 120;
        g.save();
        g.translate(x, y);
        g.scale(1, ry / rx);
        const gr = g.createRadialGradient(0, 0, 2, 0, 0, rx);
        gr.addColorStop(0, "rgba(122,148,84," + (0.05 + Math.random() * 0.07).toFixed(3) + ")");
        gr.addColorStop(1, "rgba(122,148,84,0)");
        g.fillStyle = gr;
        g.fillRect(-rx, -rx, rx * 2, rx * 2);
        g.restore();
      }

      // forest wash: the cover reads as a darker, greener patch of land
      const f = this.forest;
      if (f) {
        g.save();
        g.translate(f.x, f.y);
        g.scale(1, 0.9);
        const gr = g.createRadialGradient(0, 0, 20, 0, 0, f.r);
        gr.addColorStop(0, "rgba(104,132,66,0.16)");
        gr.addColorStop(0.75, "rgba(104,132,66,0.10)");
        gr.addColorStop(1, "rgba(104,132,66,0)");
        g.fillStyle = gr;
        g.fillRect(-f.r, -f.r, f.r * 2, f.r * 2);
        g.restore();
      }

      // water fill (static; the boiling outlines are drawn per-frame in draw.js)
      g.fillStyle = "rgba(96,138,166,0.26)";
      const blob = (pts) => {
        g.beginPath();
        for (let i = 0; i < pts.length; i++) {
          if (i) g.lineTo(pts[i].x, pts[i].y);
          else g.moveTo(pts[i].x, pts[i].y);
        }
        g.closePath();
        g.fill();
      };
      if (this.lake) blob(this.lake.pts);
      if (this.river) blob(this.river.pts);
      if (this.ponds) for (const p of this.ponds) blob(p.pts);

      // building floors: one warm wash under the boiling walls
      for (const b of this.buildings) {
        const p = new Path2D();
        for (const r of b.rooms) p.rect(r[0], r[1], r[2], r[3]);
        g.fillStyle = "rgba(198,182,150,0.30)";
        g.fill(p);
        g.strokeStyle = "rgba(92,72,50,0.16)";
        g.lineWidth = 1;
        for (const r of b.rooms) {
          const n = Math.max(1, (r[2] / 46) | 0);
          for (let i = 1; i <= n; i++) {
            const x = r[0] + (r[2] * i) / (n + 1);
            g.beginPath();
            g.moveTo(x, r[1] + 6);
            g.lineTo(x + r[2] * 0.05, r[1] + r[3] - 6);
            g.stroke();
          }
        }
      }

      // grass tufts
      g.strokeStyle = "rgba(95,120,60,0.30)";
      g.lineWidth = 1;
      for (let i = 0, n = ((W * H) / 3200) | 0; i < n; i++) {
        const x = Math.random() * W,
          y = Math.random() * H;
        g.beginPath();
        for (let k = -1; k <= 1; k++) {
          g.moveTo(x + k * 2, y);
          g.lineTo(x + k * 3 + ZS.sjit(i * 3 + k) * 2.5, y - 5 - Math.random() * 7);
        }
        g.stroke();
      }

      // the forest floor gets a denser tuft scatter
      if (f) {
        g.strokeStyle = "rgba(95,120,60,0.38)";
        for (let i = 0; i < 320; i++) {
          const a = Math.random() * Math.PI * 2,
            rr = Math.sqrt(Math.random()) * f.r * 0.95;
          const x = f.x + Math.cos(a) * rr,
            y = f.y + Math.sin(a) * rr * 0.9;
          g.beginPath();
          for (let k = -1; k <= 1; k++) {
            g.moveTo(x + k * 2, y);
            g.lineTo(x + k * 3 + ZS.sjit(i * 3 + k) * 2.5, y - 5 - Math.random() * 7);
          }
          g.stroke();
        }
      }

      // pebbles
      g.strokeStyle = "rgba(80,75,60,0.25)";
      for (let i = 0, n = ((W * H) / 16000) | 0; i < n; i++) {
        ZS.wcirc(g, Math.random() * W, Math.random() * H, 1.5 + Math.random() * 2, i * 11.3, 0.5);
      }

      // hand-drawn world frame (like the original page border)
      g.strokeStyle = "rgba(60,50,40,0.55)";
      ZS.sketchRect(g, 10, 10, W - 20, H - 20);
      g.strokeStyle = "rgba(60,50,40,0.30)";
      ZS.sketchRect(g, 16, 16, W - 32, H - 32);
    }
  }

  ZS.World = World;
})();
