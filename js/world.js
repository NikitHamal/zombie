/* The world: an endless sheet of paper that becomes a country.
   No square frame — the land goes on. Far north the Himalayas rise where
   every river is born; far south the ocean waits. Between them the river
   widens from a mountain stream to a valley river to a delta, gathering
   lakes and ponds. Forests, fields and stones grow where elevation and
   moisture let them, via coherent noise — no tiling, no cut-off. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const SS = 1.25;

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

  // tiny coherent noise — no dependency, deterministic per seed
  function hash2(x, y, s) {
    const h = Math.imul(x * 374761393 + y * 668265263 + s, 1274126177);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }
  function noise2(x, y, s) {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = x - xi,
      yf = y - yi;
    const u = smooth(xf),
      v = smooth(yf);
    const a = hash2(xi, yi, s),
      b = hash2(xi + 1, yi, s),
      c = hash2(xi, yi + 1, s),
      d = hash2(xi + 1, yi + 1, s);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function fbm(x, y, s, oct) {
    let v = 0,
      amp = 0.5,
      freq = 1,
      sum = 0;
    for (let i = 0; i < oct; i++) {
      v += noise2(x * freq, y * freq, s + i * 1009) * amp;
      sum += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return v / sum;
  }

  class World {
    constructor(w, h) {
      this.w = w;
      this.h = h;
      this.seed = 0;
      this.forest = null;
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
      this.peaks = [];
      this.oceanY = 0;
      this.mountainY = 0;
      this.canvas = document.createElement("canvas");
      this.tileCanvas = null;
      this.nav = null;
    }

    // elevation — -0.8 ocean .. 1.4 Himalayan peak. Deterministic per seed.
    elevationAt(x, y) {
      const s = this.seed | 0;
      const cx = this.w * 0.5,
        cy = this.h * 0.54;
      const nx = (x - cx) * 0.0012,
        ny = (y - cy) * 0.0012;
      let e = fbm(nx, ny, s, 4) * 0.55 + fbm(nx * 2.1, ny * 2.1, s + 500, 2) * 0.22;
      // north — Himalayan rise
      const northT = ZS.clamp((cy - y - 900) / 1600, 0, 1);
      e += Math.pow(northT, 1.35) * (1.1 + fbm(nx * 0.8, ny * 0.8, s + 900, 3) * 0.6);
      // south — ocean trench
      const southT = ZS.clamp((y - cy - 1100) / 1400, 0, 1);
      e -= Math.pow(southT, 1.2) * 1.05;
      // central valley — keep the village habitable
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy) * 0.7;
      if (d2 < 700 * 700) e += (1 - Math.sqrt(d2) / 700) * 0.32;
      // peak spikes near Himalayan source
      for (let i = 0; i < this.peaks.length; i++) {
        const p = this.peaks[i];
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < p.r) e += ((p.r - d) / p.r) * p.h * 0.9;
      }
      return e;
    }

    isOcean(x, y) {
      if (y > this.oceanY) return true;
      return this.elevationAt(x, y) < -0.18;
    }
    isMountain(x, y) {
      return this.elevationAt(x, y) > 0.82;
    }

    riverX(y) {
      const r = this.river;
      if (!r || !r.pts || r.pts.length === 0) return this.w * 0.5;
      // for the natural river interpolate the centreline
      let best = r.pts[0],
        bd = 1e9;
      for (let i = 0; i < r.pts.length; i++) {
        const d = Math.abs(r.pts[i].y - y);
        if (d < bd) {
          bd = d;
          best = r.pts[i];
        }
      }
      return best.x;
    }
    riverW(y) {
      const r = this.river;
      if (!r || !r.samples || r.samples.length === 0) return 60;
      let best = r.samples[0],
        bd = 1e9;
      for (let i = 0; i < r.samples.length; i++) {
        const d = Math.abs(r.samples[i].y - y);
        if (d < bd) {
          bd = d;
          best = r.samples[i];
        }
      }
      return best.hw * 2;
    }

    water(_opts) {
      const rng = ZS.rng32(this.seed ^ 0x51d);
      const cx = this.w * 0.5,
        cy = this.h * 0.54;
      // curated valley: Himalayas at the north edge, ocean at the south — both inside the sheet
      this.mountainY = 190;
      this.oceanY = this.h - 190;
      // Himalayan peaks — where the river is born, spread across the north with a valley gap for the river
      this.peaks = [];
      const peakN = 6 + Math.floor(rng() * 3);
      // river runs west of the village, as the old map did — keep the gap there
      const riverX = cx - 560 + rng() * 120;
      const gapX = riverX;
      for (let i = 0; i < peakN; i++) {
        let x = 0;
        if (i < peakN / 2) x = gapX - 280 - rng() * 420;
        else x = gapX + 280 + rng() * 420;
        x = ZS.clamp(x, 90, this.w - 90);
        const y = this.mountainY - 20 + (rng() - 0.5) * 120;
        this.peaks.push({ x, y, r: 170 + rng() * 130, h: 0.62 + rng() * 0.38 });
      }
      this.peaks.sort((a, b) => a.y - b.y);
      this._genNaturalRiver(rng);
      // one valley lake, fed by the river (40% chance)
      this.lake = { cx: 0, cy: 0, r: 0, pts: [] };
      this.ponds = [];
      if (rng() < 0.55) {
        let lx = 0,
          ly = 0,
          lr = 0,
          ok = false;
        for (let t = 0; t < 18 && !ok; t++) {
          const a = rng() * Math.PI * 2;
          const rad = 420 + rng() * 380;
          lx = cx + Math.cos(a) * rad;
          ly = cy + Math.sin(a) * rad * 0.85;
          lr = 170 + rng() * 140;
          if (this.isOcean(lx, ly) || this.isMountain(lx, ly)) continue;
          if (this.nearRiver(lx, ly, lr + 90)) continue;
          if (this.elevationAt(lx, ly) < -0.05 || this.elevationAt(lx, ly) > 0.5) continue;
          ok = true;
        }
        if (ok) this.lake = this._lakeBlob(lx, ly, lr, rng);
      }
      if (rng() < 0.22) {
        let px = 0,
          py = 0,
          pr = 0,
          ok = false;
        for (let t = 0; t < 14 && !ok; t++) {
          px = cx + (rng() - 0.5) * 900;
          py = cy + (rng() - 0.5) * 700;
          pr = 70 + rng() * 55;
          if (this.isOcean(px, py) || this.isMountain(px, py)) continue;
          if (this.nearRiver(px, py, pr + 70) || this.inLake(px, py, pr + 40)) continue;
          ok = true;
        }
        if (ok) this.ponds.push(this._lakeBlob(px, py, pr, rng));
      }
      this.ripples = [];
      if (this.lake.r > 0)
        for (let i = 0; i < 14; i++) {
          const a = rng() * Math.PI * 2,
            rr = rng() * this.lake.r * 0.62;
          this.ripples.push({
            x: this.lake.cx + Math.cos(a) * rr,
            y: this.lake.cy + Math.sin(a) * rr * 0.8,
            s: rng() * 100,
            w: 8 + rng() * 12,
          });
        }
      for (const p of this.ponds)
        for (let i = 0; i < 5; i++) {
          const a = rng() * Math.PI * 2,
            rr = rng() * p.r * 0.55;
          this.ripples.push({
            x: p.cx + Math.cos(a) * rr,
            y: p.cy + Math.sin(a) * rr * 0.8,
            s: rng() * 100,
            w: 7 + rng() * 9,
          });
        }
      // ripples along the natural river
      for (let i = 0; i < 18; i++) {
        const s = this.river.samples[(rng() * this.river.samples.length) | 0];
        if (!s) continue;
        this.ripples.push({
          x: s.x + (rng() - 0.5) * s.hw * 0.7,
          y: s.y + (rng() - 0.5) * 60,
          s: 100 + rng() * 100,
          w: 8 + rng() * 11,
        });
      }
      // towns — keep them in the habitable valley, clear of water/mountain
      this._genTowns(rng);
    }

    _genNaturalRiver(rng) {
      const cx = this.w * 0.5;
      // source high in the Himalayas — west of the village, as the old valley was
      const rx = cx - 560 + (rng() - 0.5) * 80;
      const source = {
        x: rx + (rng() - 0.5) * 60,
        y: this.mountainY + 22 + (rng() - 0.5) * 80,
      };
      // mouth in the ocean delta — same western line
      const mouth = {
        x: rx + (rng() - 0.5) * 90,
        y: this.oceanY + 180 + rng() * 140,
      };
      // walk south, hugging the terrain fall
      const pts = [source];
      let cur = { x: source.x, y: source.y };
      let steps = 0;
      while (cur.y < mouth.y - 30 && steps < 90) {
        steps++;
        const t = (cur.y - source.y) / (mouth.y - source.y);
        const targetX = source.x + (mouth.x - source.x) * Math.pow(t, 0.9);
        const ny = cur.y + 52 + rng() * 28;
        let nx = cur.x + (targetX - cur.x) * 0.14;
        // meander — sine that grows mid-valley, fades at source/mouth
        const meander =
          Math.sin(ny * 0.0031 + rng() * 0.6) * (18 + t * 34) +
          Math.sin(ny * 0.0012 + 1.7) * (12 + t * 22);
        nx += meander + (rng() - 0.5) * 18;
        // nudge downhill: sample elevation left/right, drift to lower
        const el = this.elevationAt(nx - 28, ny),
          er = this.elevationAt(nx + 28, ny);
        nx += (el - er) * 14;
        cur = { x: nx, y: ny };
        pts.push({ x: cur.x, y: cur.y });
      }
      pts.push(mouth);
      // build bank polygon with width that grows from source to sea
      const left = [],
        right = [];
      const samples = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const t = i / (pts.length - 1);
        // source stream 14px, valley 42px, delta 86px
        const w = 14 + Math.pow(t, 0.85) * 72 + Math.sin(t * 7 + 1.3) * 4;
        // perpendicular
        const prev = pts[Math.max(0, i - 1)],
          nxt = pts[Math.min(pts.length - 1, i + 1)];
        const dx = nxt.x - prev.x,
          dy = nxt.y - prev.y;
        const L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L,
          ny = dx / L;
        const hw = w / 2;
        left.push({ x: p.x + nx * (hw + 2), y: p.y + ny * (hw + 2) });
        right.push({ x: p.x - nx * (hw + 2), y: p.y - ny * (hw + 2) });
        samples.push({ x: p.x, y: p.y, hw });
      }
      // close the delta into the ocean — fan the mouth
      const mhw = 44;
      left.push({ x: mouth.x - mhw, y: mouth.y + 420 });
      left.push({ x: mouth.x - 22, y: mouth.y + 520 });
      right.push({ x: mouth.x + mhw, y: mouth.y + 420 });
      right.push({ x: mouth.x + 22, y: mouth.y + 520 });
      this.river = {
        pts: left.concat(right.reverse()),
        samples,
        centre: pts,
        source,
        mouth,
        baseX: source.x,
        a1: 0,
        a2: 0,
        p1: 0,
        p2: 0,
        p3: rng() * Math.PI * 2,
        baseW: 54,
        f1: 0,
        f2: 0,
        ori: "n",
      };
    }

    _genTowns(rng) {
      this.towns = [];
      const n = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        let placed = false;
        for (let tries = 0; tries < 90 && !placed; tries++) {
          const x = this.w * (0.12 + rng() * 0.76);
          const y = this.h * (0.18 + rng() * 0.62);
          if (x < 140 || x > this.w - 140 || y < 140 || y > this.h - 140) continue;
          if (this.isOcean(x, y) || this.isMountain(x, y)) continue;
          if (this.elevationAt(x, y) < -0.08 || this.elevationAt(x, y) > 0.62) continue;
          let bad = false;
          for (const t of this.towns)
            if (Math.hypot(t.x - x, t.y - y) < 420) {
              bad = true;
              break;
            }
          if (bad) continue;
          for (let k = 0; k < 8; k++) {
            const an = (k / 8) * Math.PI * 2;
            const px = x + Math.cos(an) * 120,
              py = y + Math.sin(an) * 120;
            if (this.nearRiver(px, py, 110) || this.inLake(px, py, -80) || this.isOcean(px, py)) {
              bad = true;
              break;
            }
          }
          if (bad) continue;
          this.towns.push({ x, y, n: 1 + Math.floor(rng() * 4), spread: 300 + rng() * 180 });
          placed = true;
        }
      }
      if (!this.towns.length)
        this.towns.push({ x: this.w * 0.5, y: this.h * 0.54, n: 2, spread: 340 });
    }

    _lakeBlob(cx, cy, r, rng) {
      const lake = { cx, cy, r, pts: [] };
      const L = 14;
      for (let i = 0; i < L; i++) {
        const a = (i / L) * Math.PI * 2;
        const rr = r * (0.92 + rng() * 0.18);
        lake.pts.push({
          x: cx + Math.cos(a) * rr * 1.03,
          y: cy + Math.sin(a) * rr * 0.78 * 1.03,
        });
      }
      return lake;
    }

    _waterClear(cx, cy, r, townPad) {
      if (this.isOcean(cx, cy) || this.isMountain(cx, cy)) return false;
      if (cx - r < 40 || cx + r > this.w - 40 || cy - r < 40 || cy + r > this.h - 40) return false;
      for (const s of this.river.samples)
        if (Math.hypot(s.x - cx, s.y - cy) < s.hw + r + 70) return false;
      for (const t of this.towns)
        if (Math.hypot(t.x - cx, t.y - cy) < townPad + t.spread * 0.5) return false;
      return true;
    }

    placeAllTrees(opts) {
      const rng = ZS.rng32(this.seed ^ 0xb0ba);
      const pins = (opts && opts.grovePos) || null;
      if (pins) {
        for (const g of pins) {
          const n = 6 + Math.floor(rng() * 8);
          for (let k = 0; k < n; k++) {
            this.placeTree(g.x + (rng() - 0.5) * 280, g.y + (rng() - 0.5) * 240, rng);
          }
        }
      } else {
        const groves = 5 + Math.floor(rng() * 5);
        for (let i = 0; i < groves; i++) {
          let gx = 0,
            gy = 0,
            tries = 0;
          do {
            gx = 180 + rng() * (this.w - 360);
            gy = 180 + rng() * (this.h - 360);
            tries++;
          } while (
            tries < 30 &&
            (this.isOcean(gx, gy) ||
              this.isMountain(gx, gy) ||
              this.elevationAt(gx, gy) < -0.06 ||
              this.elevationAt(gx, gy) > 0.58)
          );
          const n = 6 + Math.floor(rng() * 7);
          for (let k = 0; k < n; k++) {
            this.placeTree(gx + (rng() - 0.5) * 300, gy + (rng() - 0.5) * 260, rng);
          }
        }
      }
      const f = this.forest;
      if (f) {
        for (let i = 0; i < 90; i++) {
          const a = rng() * Math.PI * 2,
            rr = Math.sqrt(rng()) * f.r * 0.9;
          this.placeTree(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.9, rng);
        }
      }
      for (let i = 0; i < 14; i++) {
        this.placeTree(120 + rng() * (this.w - 240), 120 + rng() * (this.h - 240), rng);
      }
    }

    nearRiver(x, y, pad) {
      pad = pad || 0;
      if (!this.river || !this.river.samples) return false;
      // ocean delta — wide
      if (y > this.oceanY - 80 && Math.abs(x - this.river.mouth.x) < 110 + pad) return true;
      for (let i = 0; i < this.river.samples.length - 1; i++) {
        const s1 = this.river.samples[i],
          s2 = this.river.samples[i + 1];
        const dx = s2.x - s1.x,
          dy = s2.y - s1.y;
        const L2 = dx * dx + dy * dy;
        let t = L2 > 0 ? ((x - s1.x) * dx + (y - s1.y) * dy) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        const px = s1.x + t * dx,
          py = s1.y + t * dy;
        const hw = s1.hw + t * (s2.hw - s1.hw);
        const r = hw + pad;
        const dx2 = x - px,
          dy2 = y - py;
        if (dx2 * dx2 + dy2 * dy2 < r * r) return true;
      }
      if (this.river.samples.length === 1) {
        const s = this.river.samples[0];
        const r = s.hw + pad;
        const dx = s.x - x,
          dy = s.y - y;
        if (dx * dx + dy * dy < r * r) return true;
      }
      return false;
    }

    inLake(x, y, pad) {
      pad = pad || 0;
      const l = this.lake;
      if (!l || !l.r) return false;
      const ex = (x - l.cx) / 1.04,
        ey = (y - l.cy) / 0.84;
      const r = l.r + pad;
      if (ex * ex + ey * ey < r * r) return true;
      if (l.pts && l.pts.length && pointInPoly(x, y, l.pts)) return true;
      return false;
    }

    layoutForest(opts) {
      if (opts && opts.none) {
        this.forest = null;
        return;
      }
      const rng = ZS.rng32(this.seed ^ 0xf057);
      for (let i = 0; i < 64; i++) {
        const x = 320 + rng() * (this.w - 640);
        const y = 320 + rng() * (this.h - 640);
        const r = 300 + rng() * 220;
        if (!this.nav || !this.nav.isWalkable(x, y)) continue;
        if (this.isOcean(x, y) || this.isMountain(x, y)) continue;
        if (this.inLake(x, y, r * 0.5)) continue;
        if (this.nearRiver(x, y, r * 0.5 + 24)) continue;
        const e = this.elevationAt(x, y);
        if (e < 0.08 || e > 0.48) continue;
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
      this.forest = { x: this.w * 0.18, y: this.h * 0.78, r: 340 };
    }

    inForest(x, y) {
      const f = this.forest;
      if (!f) return false;
      const dx = (x - f.x) / f.r,
        dy = (y - f.y) / (f.r * 0.9);
      return dx * dx + dy * dy < 1;
    }

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
      pad = pad || 0;
      const cx = x + w / 2,
        cy = y + h / 2;
      if (this.isOcean(cx, cy) || this.nearRiver(cx, cy, pad) || this.inLake(cx, cy, pad))
        return false;
      if (this._inWaterPoly(cx, cy)) return false;
      for (const p of this.perimeterPoints(x, y, w, h, 16)) {
        if (this.isOcean(p.x, p.y) || this.nearRiver(p.x, p.y, pad) || this.inLake(p.x, p.y, pad))
          return false;
        for (const pd of this.ponds) {
          const dx = p.x - pd.cx,
            dy = p.y - pd.cy;
          if (dx * dx + dy * dy < (pd.r + pad) * (pd.r + pad)) return false;
        }
        if (this._inWaterPoly(p.x, p.y)) return false;
      }
      return true;
    }

    _inWaterPoly(x, y) {
      if (
        this.river &&
        this.river.pts &&
        this.river.pts.length &&
        pointInPoly(x, y, this.river.pts)
      )
        return true;
      const lake = this.lake;
      if (lake && lake.r && lake.pts && lake.pts.length && pointInPoly(x, y, lake.pts)) return true;
      for (const pd of this.ponds) {
        if (pd.pts && pd.pts.length && pointInPoly(x, y, pd.pts)) return true;
      }
      return false;
    }

    placeTree(x, y, rng) {
      for (let i = 0; i < 50; i++) {
        const cx = ZS.clamp(x, 40, this.w - 40);
        const cy = ZS.clamp(y, 40, this.h - 40);
        if (!this.treeClear(cx, cy)) {
          x += (rng() - 0.5) * 140;
          y += (rng() - 0.5) * 140;
          continue;
        }
        const r = 11 + rng() * 8;
        const pts = [];
        for (let k = 0; k < 8; k++) pts.push(r * (0.82 + rng() * 0.36));
        this.trees.push({ x: cx, y: cy, r, seed: rng() * 997, pts });
        return;
      }
    }

    treeClear(x, y) {
      if (x < 35 || y < 35 || x > this.w - 35 || y > this.h - 35) return false;
      const nav = this.nav;
      if (!nav || nav.cellAt(x, y) !== 1) return false;
      if (
        nav.cellAt(x + 16, y) !== 1 ||
        nav.cellAt(x - 16, y) !== 1 ||
        nav.cellAt(x, y + 16) !== 1 ||
        nav.cellAt(x, y - 16) !== 1
      )
        return false;
      if (this.isOcean(x, y) || !this.clearOfWater(x - 22, y - 22, 44, 44, 18)) return false;
      if (this.nearRiver(x, y, 26)) return false;
      if (this.inLake(x, y, 22)) return false;
      const e = this.elevationAt(x, y);
      if (e < -0.04 || e > 0.72) return false;
      return true;
    }

    build() {
      const c = this.canvas,
        g = c.getContext("2d");
      c.width = Math.round(this.w * SS);
      c.height = Math.round(this.h * SS);
      g.setTransform(SS, 0, 0, SS, 0, 0);
      const W = this.w,
        H = this.h;
      // the base paper is the infinite tile — so inside and outside are the same sheet
      const trng = ZS.rng32(this.seed ^ 0x6a73 ^ 0x9e37);
      if (!this.tileCanvas) this._buildTile(trng);
      const rng = ZS.rng32(this.seed ^ 0x6a73);
      const pat = this.tileCanvas ? g.createPattern(this.tileCanvas, "repeat") : null;
      if (pat) {
        g.fillStyle = pat;
        g.fillRect(0, 0, W, H);
      } else {
        g.fillStyle = "#f3edde";
        g.fillRect(0, 0, W, H);
      }
      // faint world stains — kept unique but very subtle so the seam does not read
      for (let i = 0; i < 4; i++) {
        const x = rng() * W,
          y = rng() * H;
        const gr = g.createRadialGradient(x, y, 4, x, y, 40 + rng() * 70);
        gr.addColorStop(0, "rgba(120,105,70,0.025)");
        gr.addColorStop(1, "rgba(120,105,70,0)");
        g.fillStyle = gr;
        g.fillRect(x - 140, y - 140, 280, 280);
      }
      // elevation-tinted washes — mountains darker, valley greener
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
      // ocean fill south of the delta — soft, not a rectangle
      {
        const oy = this.oceanY;
        const grad = g.createLinearGradient(0, oy - 80, 0, H);
        grad.addColorStop(0, "rgba(96,138,166,0)");
        grad.addColorStop(0.25, "rgba(96,138,166,0.18)");
        grad.addColorStop(1, "rgba(96,138,166,0.28)");
        g.fillStyle = grad;
        g.fillRect(0, oy - 80, W, H - oy + 80);
        // subtle wave hatching in the ocean
        g.strokeStyle = "rgba(96,138,166,0.14)";
        g.lineWidth = 1;
        for (let y = oy + 40; y < H; y += 22) {
          g.beginPath();
          for (let x = 0; x < W; x += 18) {
            const off = Math.sin(x * 0.04 + y * 0.03) * 3;
            if (x === 0) g.moveTo(x, y + off);
            else g.lineTo(x, y + off);
          }
          g.stroke();
        }
      }
      // Himalayan snow wash north
      {
        const my = this.mountainY;
        const grad = g.createLinearGradient(0, 0, 0, my + 260);
        grad.addColorStop(0, "rgba(232,232,238,0.42)");
        grad.addColorStop(0.5, "rgba(220,228,236,0.18)");
        grad.addColorStop(1, "rgba(220,228,236,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, W, my + 260);
        // peaks — hand-drawn with wobbly ink, not flat triangles
        const _sorted = [...this.peaks].sort((a, b) => a.y - b.y);
        for (const p of _sorted) {
          const h = 74 + p.h * 68;
          const bw = p.r * 0.88;
          const pts = [
            { x: p.x - bw * 0.52, y: p.y + 22 },
            { x: p.x - bw * 0.18, y: p.y - h * 0.52 },
            { x: p.x, y: p.y - h },
            { x: p.x + bw * 0.18, y: p.y - h * 0.52 },
            { x: p.x + bw * 0.52, y: p.y + 22 },
          ];
          ZS.wpoly(g, pts, p.x * 0.07 + p.y * 0.11, 1.7, true);
          g.fillStyle = "rgba(214,220,232,0.96)";
          g.fill();
          g.strokeStyle = "rgba(74,62,46,0.88)";
          g.lineWidth = 1.6;
          g.stroke();
          const snow = [
            { x: p.x - 20, y: p.y - h + 28 },
            { x: p.x - 8, y: p.y - h + 12 },
            { x: p.x, y: p.y - h },
            { x: p.x + 8, y: p.y - h + 12 },
            { x: p.x + 20, y: p.y - h + 28 },
            { x: p.x + 9, y: p.y - h + 34 },
            { x: p.x - 9, y: p.y - h + 34 },
          ];
          ZS.wpoly(g, snow, p.x * 0.07 + p.y * 0.11 + 50, 1.1, true);
          g.fillStyle = "rgba(248,248,252,0.98)";
          g.fill();
          g.strokeStyle = "rgba(74,62,46,0.45)";
          g.lineWidth = 1.1;
          g.stroke();
          g.strokeStyle = "rgba(74,62,46,0.18)";
          g.lineWidth = 1;
          ZS.wline(g, p.x, p.y - h, p.x - bw * 0.22, p.y - h * 0.32, p.x * 0.1, 0.7);
          ZS.wline(g, p.x, p.y - h, p.x + bw * 0.22, p.y - h * 0.32, p.x * 0.1 + 20, 0.7);
        }
      }
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
    }

    _buildTile(rng) {
      const SZ = 512;
      const tc = document.createElement("canvas");
      tc.width = SZ;
      tc.height = SZ;
      const g = tc.getContext("2d");
      g.fillStyle = "#f3edde";
      g.fillRect(0, 0, SZ, SZ);
      for (let i = 0, n = ((SZ * SZ) / 350) | 0; i < n; i++) {
        g.fillStyle = "rgba(90,80,60," + (rng() * 0.07).toFixed(3) + ")";
        g.fillRect(rng() * SZ, rng() * SZ, 1.5, 1.5);
      }
      for (let i = 0; i < 6; i++) {
        const x = rng() * SZ,
          y = rng() * SZ,
          rx = 60 + rng() * 160,
          ry = 40 + rng() * 110;
        g.save();
        g.translate(x, y);
        g.scale(1, ry / rx);
        const gr = g.createRadialGradient(0, 0, 2, 0, 0, rx);
        gr.addColorStop(0, "rgba(122,148,84," + (0.05 + rng() * 0.07).toFixed(3) + ")");
        gr.addColorStop(1, "rgba(122,148,84,0)");
        g.fillStyle = gr;
        g.fillRect(-rx, -rx, rx * 2, rx * 2);
        g.restore();
      }
      g.strokeStyle = "rgba(95,120,60,0.30)";
      g.lineWidth = 1;
      for (let i = 0; i < 78; i++) {
        const x = rng() * SZ,
          y = rng() * SZ;
        g.beginPath();
        for (let k = -1; k <= 1; k++) {
          g.moveTo(x + k * 2, y);
          g.lineTo(x + k * 3 + ZS.sjit(i * 3 + k) * 2.2, y - 4 - rng() * 6);
        }
        g.stroke();
      }
      g.strokeStyle = "rgba(80,75,60,0.22)";
      for (let i = 0; i < 16; i++) {
        ZS.wcirc(g, rng() * SZ, rng() * SZ, 1.5 + rng() * 2, i * 11.3, 0.4);
      }
      this.tileCanvas = tc;
    }

    drawInfinite(c, vis) {
      const tc = this.tileCanvas;
      if (tc) {
        const pat = c.createPattern(tc, "repeat");
        if (pat) {
          c.save();
          c.fillStyle = pat;
          c.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, vis.y1 - vis.y0);
          c.restore();
        }
      } else {
        c.fillStyle = "#f3edde";
        c.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, vis.y1 - vis.y0);
      }
      // ocean beyond the delta — infinite water
      if (vis.y1 > this.oceanY - 40) {
        const y0 = Math.max(vis.y0, this.oceanY - 40);
        const grad = c.createLinearGradient(0, this.oceanY - 40, 0, vis.y1);
        grad.addColorStop(0, "rgba(96,138,166,0)");
        grad.addColorStop(0.2, "rgba(96,138,166,0.18)");
        grad.addColorStop(1, "rgba(96,138,166,0.30)");
        c.fillStyle = grad;
        c.fillRect(vis.x0, y0, vis.x1 - vis.x0, vis.y1 - y0);
        c.strokeStyle = "rgba(96,138,166,0.13)";
        c.lineWidth = 1;
        for (let y = y0 + 30; y < vis.y1; y += 24) {
          c.beginPath();
          for (let x = vis.x0; x < vis.x1; x += 18) {
            const off = Math.sin(x * 0.035 + y * 0.02) * 3;
            if (x === vis.x0) c.moveTo(x, y + off);
            else c.lineTo(x, y + off);
          }
          c.stroke();
        }
      }
      // Himalayan wash north — infinite mountains
      if (vis.y0 < this.mountainY + 220) {
        const y1 = Math.min(vis.y1, this.mountainY + 220);
        const grad = c.createLinearGradient(0, vis.y0, 0, y1);
        grad.addColorStop(0, "rgba(232,232,238,0.45)");
        grad.addColorStop(0.55, "rgba(220,228,236,0.20)");
        grad.addColorStop(1, "rgba(220,228,236,0)");
        c.fillStyle = grad;
        c.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, y1 - vis.y0);
        const _sorted2 = [...this.peaks].sort((a, b) => a.y - b.y);
        for (const p of _sorted2) {
          if (
            p.x < vis.x0 - p.r - 40 ||
            p.x > vis.x1 + p.r + 40 ||
            p.y < vis.y0 - 120 ||
            p.y > vis.y1 + 40
          )
            continue;
          const h = 74 + p.h * 68;
          const bw = p.r * 0.88;
          const pts = [
            { x: p.x - bw * 0.52, y: p.y + 18 },
            { x: p.x - bw * 0.18, y: p.y - h * 0.52 },
            { x: p.x, y: p.y - h },
            { x: p.x + bw * 0.18, y: p.y - h * 0.52 },
            { x: p.x + bw * 0.52, y: p.y + 18 },
          ];
          ZS.wpoly(c, pts, p.x * 0.07 + p.y * 0.11, 1.7, true);
          c.fillStyle = "rgba(214,220,232,0.96)";
          c.fill();
          c.strokeStyle = "rgba(74,62,46,0.88)";
          c.lineWidth = 1.6;
          c.stroke();
          const snow = [
            { x: p.x - 20, y: p.y - h + 28 },
            { x: p.x - 8, y: p.y - h + 12 },
            { x: p.x, y: p.y - h },
            { x: p.x + 8, y: p.y - h + 12 },
            { x: p.x + 20, y: p.y - h + 28 },
            { x: p.x + 9, y: p.y - h + 34 },
            { x: p.x - 9, y: p.y - h + 34 },
          ];
          ZS.wpoly(c, snow, p.x * 0.07 + p.y * 0.11 + 50, 1.1, true);
          c.fillStyle = "rgba(248,248,252,0.98)";
          c.fill();
          c.strokeStyle = "rgba(74,62,46,0.45)";
          c.lineWidth = 1.1;
          c.stroke();
          c.strokeStyle = "rgba(74,62,46,0.18)";
          c.lineWidth = 1;
          ZS.wline(c, p.x, p.y - h, p.x - bw * 0.22, p.y - h * 0.32, p.x * 0.1, 0.7);
          ZS.wline(c, p.x, p.y - h, p.x + bw * 0.22, p.y - h * 0.32, p.x * 0.1 + 20, 0.7);
        }
      }
      // infinite trees/washes beyond the pre-render — chunk-hashed, same seed always same place
      const cs = 320;
      const x0 = Math.floor(vis.x0 / cs) * cs,
        x1 = Math.floor(vis.x1 / cs) * cs,
        y0 = Math.floor(vis.y0 / cs) * cs,
        y1 = Math.floor(vis.y1 / cs) * cs;
      for (let cy = y0; cy <= y1; cy += cs) {
        for (let cx = x0; cx <= x1; cx += cs) {
          if (cx >= 0 && cx < this.w && cy >= 0 && cy < this.h) continue;
          if (
            this.isOcean(cx + cs * 0.5, cy + cs * 0.5) ||
            this.isMountain(cx + cs * 0.5, cy + cs * 0.5)
          )
            continue;
          const e = this.elevationAt(cx + cs * 0.5, cy + cs * 0.5);
          if (e < -0.06 || e > 0.62) continue;
          const h = this._chunkHash(cx, cy);
          const n = 3 + (h % 4);
          for (let i = 0; i < n; i++) {
            const hx = ZS.hash(h + i * 17.3) - 0.5,
              hy = ZS.hash(h + i * 31.7 + 9.3) - 0.5;
            const x = cx + cs * 0.5 + hx * cs * 0.7,
              y = cy + cs * 0.5 + hy * cs * 0.7;
            if (this.isOcean(x, y) || this.nearRiver(x, y, 28) || this.inLake(x, y, 20)) continue;
            const ee = this.elevationAt(x, y);
            if (ee < -0.04 || ee > 0.66) continue;
            const r = 11 + ZS.hash(h + i * 7.7 + 3.1) * 7;
            const pts = [];
            for (let k = 0; k < 8; k++) pts.push(r * (0.82 + ZS.hash(h + i * 5.1 + k) * 0.36));
            const tr = { x, y, r, seed: h + i * 11.3, pts };
            const t = 0;
            const sway = Math.sin(t * 0.8 + tr.seed) * 1.6;
            const tcx = tr.x + sway,
              tcy = tr.y - tr.r * 1.15;
            c.strokeStyle = "rgba(40,35,25,0.12)";
            c.lineWidth = 1.2;
            ZS.wcirc(c, tr.x, tr.y + 2, tr.r * 0.75, tr.seed + 3, 1.2);
            c.strokeStyle = "rgba(96,74,50,0.9)";
            c.lineWidth = 1.6;
            ZS.wline(
              c,
              tr.x,
              tr.y + 2,
              tr.x + ZS.sjit(tr.seed) * 2,
              tcy + tr.r * 0.55,
              tr.seed + 5,
              0.7,
            );
            const tpts = [];
            for (let k = 0; k < 8; k++) {
              const an = (k / 8) * Math.PI * 2;
              tpts.push({
                x: tcx + Math.cos(an) * tr.pts[k],
                y: tcy + Math.sin(an) * tr.pts[k] * 0.92,
              });
            }
            c.strokeStyle = "rgba(74,108,48,0.8)";
            c.lineWidth = 1.5;
            ZS.wpoly(c, tpts, tr.seed * 13.7, 1.6, true);
            c.fillStyle = "rgba(112,148,72,0.32)";
            c.fill();
            c.stroke();
          }
          if (h % 3 === 0) {
            const wx = cx + cs * (0.2 + ZS.hash(h + 1.1) * 0.6),
              wy = cy + cs * (0.2 + ZS.hash(h + 2.2) * 0.6);
            if (this.isOcean(wx, wy) || this.isMountain(wx, wy)) continue;
            const rx = 42 + ZS.hash(h + 3.3) * 110,
              ry = 28 + ZS.hash(h + 4.4) * 70;
            c.save();
            c.translate(wx, wy);
            c.scale(1, ry / rx);
            const grad = c.createRadialGradient(0, 0, 2, 0, 0, rx);
            grad.addColorStop(0, "rgba(122,148,84,0.05)");
            grad.addColorStop(1, "rgba(122,148,84,0)");
            c.fillStyle = grad;
            c.fillRect(-rx, -rx, rx * 2, rx * 2);
            c.restore();
          }
        }
      }
    }

    _chunkHash(cx, cy) {
      const s = this.seed | 0;
      let h = (Math.floor(cx * 0.0037) * 374761393 + Math.floor(cy * 0.0039) * 668265263) ^ s;
      h = ((h >>> 13) * 1274126177) ^ (h << 7);
      return Math.abs(h) % 100000;
    }
  }

  ZS.World = World;
})();
