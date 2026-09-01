/* Navigation: a 20px cell grid over the whole world.
   Cell values: 0 = blocked (water, wall), 1 = land, 2 = building floor,
   3 = intact door. Interiors and intact doors block zombies but not
   humans; a broken door becomes plain land (nav.doorBroken). The world is
   infinite — beyond the mapped town the land goes on. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const CELL = 20;
  const DIRS = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.41421],
    [1, -1, 1.41421],
    [-1, 1, 1.41421],
    [-1, -1, 1.41421],
  ];

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

  class Nav {
    constructor(world) {
      this.world = world;
      this.w = world.w / CELL;
      this.h = world.h / CELL;
      this.n = this.w * this.h;
      this.val = new Uint8Array(this.n);
      this.val.fill(1);
      this.wm = new Uint8Array(this.n);
      this.g = new Float32Array(this.n);
      this.fs = new Float32Array(this.n);
      this.from = new Int32Array(this.n);
      this.stamp = new Int32Array(this.n);
      this.gen = 0;
      this.version = 0;
    }

    idx(x, y) {
      const ix = (x / CELL) | 0,
        iy = (y / CELL) | 0;
      if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return -1;
      return iy * this.w + ix;
    }

    cellAt(x, y) {
      const i = this.idx(x, y);
      if (i < 0) {
        const w = this.world;
        if (w.nearRiver && w.nearRiver(x, y, 2)) return 0;
        if (w.inLake && w.inLake(x, y, 0)) return 0;
        if (w._inWaterPoly && w._inWaterPoly(x, y)) return 0;
        return 1;
      }
      return this.val[i];
    }

    isWalkable(x, y, isZombie) {
      const i = this.idx(x, y);
      if (i < 0) {
        const w = this.world;
        if (w._inWaterPoly && w._inWaterPoly(x, y)) return false;
        if (w.inLake && w.inLake(x, y, 0)) return false;
        if (w.nearRiver && w.nearRiver(x, y, 0)) return false;
        return true;
      }
      const v = this.val[i];
      if (v === 3 || v === 2) return !isZombie;
      return v >= 1;
    }

    isWater(x, y) {
      const i = this.idx(x, y);
      if (i < 0) {
        const w = this.world;
        return !!(w.nearRiver && w.nearRiver(x, y, 0)) || !!(w.inLake && w.inLake(x, y, 0));
      }
      return i >= 0 && this.val[i] === 0 && this.wm[i] === 1;
    }
    centerOf(i) {
      return {
        x: ((i % this.w) + 0.5) * CELL,
        y: (((i / this.w) | 0) + 0.5) * CELL,
      };
    }

    markRect(x, y, w, h, v, onlyIf) {
      const ix0 = Math.max(0, (x / CELL) | 0),
        iy0 = Math.max(0, (y / CELL) | 0),
        ix1 = Math.min(this.w - 1, ((x + w) / CELL) | 0),
        iy1 = Math.min(this.h - 1, ((y + h) / CELL) | 0);
      for (let iy = iy0; iy <= iy1; iy++)
        for (let ix = ix0; ix <= ix1; ix++) {
          const cx = (ix + 0.5) * CELL,
            cy = (iy + 0.5) * CELL;
          if (cx < x || cx >= x + w || cy < y || cy >= y + h) continue;
          const i = iy * this.w + ix;
          if (onlyIf === undefined || this.val[i] === onlyIf) this.val[i] = v;
        }
    }

    markWater() {
      const river = this.world.river ? this.world.river.pts : [],
        lake = this.world.lake ? this.world.lake.pts : [],
        ponds = this.world.ponds || [];
      for (let iy = 0; iy < this.h; iy++) {
        for (let ix = 0; ix < this.w; ix++) {
          const x = (ix + 0.5) * CELL,
            y = (iy + 0.5) * CELL;
          const i = iy * this.w + ix;
          if (
            (river.length && pointInPoly(x, y, river)) ||
            (lake.length && pointInPoly(x, y, lake)) ||
            (this.world.nearRiver && this.world.nearRiver(x, y, 2))
          ) {
            this.val[i] = 0;
            this.wm[i] = 1;
            continue;
          }
          for (let p = 0; p < ponds.length; p++) {
            if (ponds[p].pts && pointInPoly(x, y, ponds[p].pts)) {
              this.val[i] = 0;
              this.wm[i] = 1;
              break;
            }
          }
        }
      }
    }

    los(x1, y1, x2, y2, isZombie, swim) {
      const dx = x2 - x1,
        dy = y2 - y1;
      const d = Math.hypot(dx, dy);
      if (d < 2) return true;
      const steps = Math.max(2, (d / 8) | 0);
      for (let i = 1; i < steps; i++) {
        const px = x1 + (dx * i) / steps,
          py = y1 + (dy * i) / steps;
        if (!this.isWalkable(px, py, isZombie) && !(swim && this.isWater(px, py))) return false;
      }
      return this.isWalkable(x2, y2, false) || (swim && this.isWater(x2, y2));
    }

    astar(x1, y1, x2, y2, isZombie, maxExpand, swim) {
      let si = this.idx(x1, y1),
        ti = this.idx(x2, y2);
      let outX = null,
        outY = null;
      if (ti < 0) {
        outX = x2;
        outY = y2;
        const ex = ZS.clamp(x2, 40, this.world.w - 40);
        const ey = ZS.clamp(y2, 40, this.world.h - 40);
        let p = this.nearestWalkable(ex, ey, 400, isZombie);
        if (!p) p = this.nearestWalkable(this.world.w / 2, this.world.h / 2, 1200, isZombie);
        if (!p) return null;
        ti = this.idx(p.x, p.y);
        if (ti < 0) return null;
        x2 = p.x;
        y2 = p.y;
      }
      if (si < 0) {
        const ex = ZS.clamp(x1, 40, this.world.w - 40);
        const ey = ZS.clamp(y1, 40, this.world.h - 40);
        let p = this.nearestWalkable(ex, ey, 400, isZombie);
        if (!p) p = this.nearestWalkable(this.world.w / 2, this.world.h / 2, 1200, isZombie);
        if (!p) return null;
        si = this.idx(p.x, p.y);
        if (si < 0) return null;
        x1 = p.x;
        y1 = p.y;
      }
      if (si === ti) {
        if (outX !== null) return [{ x: outX, y: outY }];
        return null;
      }
      const inB = isZombie && this.val[si] === 2;
      const tw = swim && this.val[ti] === 0 && this.wm[ti] === 1;
      if (!this.isWalkable(x2, y2, isZombie) && !tw && !(inB && this.val[ti] === 2)) return null;

      this.gen++;
      const gen = this.gen,
        g = this.g,
        fs = this.fs,
        from = this.from,
        stamp = this.stamp,
        val = this.val,
        wm = this.wm,
        w = this.w,
        H = this.h;
      const tix = ti % w,
        tiy = (ti / w) | 0;
      const h = (i) => {
        const dx = Math.abs((i % w) - tix),
          dy = Math.abs(((i / w) | 0) - tiy);
        return dx > dy ? 1.41421 * dy + (dx - dy) : 1.41421 * dx + (dy - dx);
      };
      const free = (v, ni) =>
        v === 1 ||
        (v >= 2 && (!isZombie || inB) && !(v === 3 && isZombie)) ||
        (swim && v === 0 && wm[ni] === 1);

      const heap = [];
      const push = (f, i) => {
        heap.push([f, i]);
        let c = heap.length - 1;
        while (c > 0) {
          const p = (c - 1) >> 1;
          if (heap[p][0] <= heap[c][0]) break;
          const t = heap[p];
          heap[p] = heap[c];
          heap[c] = t;
          c = p;
        }
      };
      const pop = () => {
        const top = heap[0],
          last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          let p = 0;
          for (;;) {
            const l = p * 2 + 1,
              r = l + 1;
            let m = p;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === p) break;
            const t = heap[m];
            heap[m] = heap[p];
            heap[p] = t;
            p = m;
          }
        }
        return top;
      };

      stamp[si] = gen;
      g[si] = 0;
      fs[si] = h(si);
      push(fs[si], si);
      let expanded = 0;

      const budget = maxExpand || Math.min(this.n, 12000);
      while (heap.length) {
        const cur = pop();
        const i = cur[1];
        if (stamp[i] !== gen || cur[0] > fs[i] + 1e-4) continue;
        if (i === ti) break;
        if (++expanded > budget) return null;
        const ix = i % w,
          iy = (i / w) | 0;
        for (let d = 0; d < 8; d++) {
          const dx = DIRS[d][0],
            dy = DIRS[d][1];
          const nx = ix + dx,
            ny = iy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= H) continue;
          const ni = ny * w + nx;
          const v = val[ni];
          if (!free(v, ni)) continue;
          if (dx && dy) {
            if (!free(val[iy * w + nx], iy * w + nx) || !free(val[ny * w + ix], ny * w + ix))
              continue;
          }
          const ng = g[i] + DIRS[d][2] * (swim && v === 0 && wm[ni] === 1 ? 4 : 1);
          if (stamp[ni] === gen && ng >= g[ni]) continue;
          stamp[ni] = gen;
          g[ni] = ng;
          from[ni] = i;
          fs[ni] = ng + h(ni);
          push(fs[ni], ni);
        }
      }

      if (stamp[ti] !== gen) return null;

      const raw = [];
      let i = ti;
      while (i !== si) {
        raw.push(i);
        i = from[i];
        if (raw.length > 4000) return null;
      }
      raw.reverse();
      const kept = [raw[0]];
      for (let k = 1; k < raw.length - 1; k++) {
        const ax = (raw[k - 1] % w) - (raw[k] % w),
          ay = ((raw[k - 1] / w) | 0) - ((raw[k] / w) | 0);
        const bx = (raw[k] % w) - (raw[k + 1] % w),
          by = ((raw[k] / w) | 0) - ((raw[k + 1] / w) | 0);
        if (ax !== bx || ay !== by) kept.push(raw[k]);
      }
      kept.push(raw[raw.length - 1]);
      const path = kept.map((ci) => this.centerOf(ci));
      if (outX !== null) path.push({ x: outX, y: outY });
      return path;
    }

    nearestWalkable(x, y, maxR, isZombie) {
      if (this.isWalkable(x, y, isZombie)) {
        const i = this.idx(x, y);
        return i >= 0 ? this.centerOf(i) : { x, y };
      }
      for (let r = 10; r <= maxR; r += 10) {
        const n = Math.max(10, (r * 0.7) | 0);
        for (let k = 0; k < n; k++) {
          const an = (k / n) * Math.PI * 2 + r * 0.35;
          const px = x + Math.cos(an) * r,
            py = y + Math.sin(an) * r;
          if (this.isWalkable(px, py, isZombie)) {
            const i = this.idx(px, py);
            return i >= 0 ? this.centerOf(i) : { x: px, y: py };
          }
        }
      }
      return null;
    }

    randLand() {
      for (let i = 0; i < 300; i++) {
        const far = Math.random() < 0.3;
        const x = far
          ? (Math.random() - 0.5) * this.world.w * 2 + this.world.w * 0.5
          : 30 + Math.random() * (this.world.w - 60);
        const y = far
          ? (Math.random() - 0.5) * this.world.h * 2 + this.world.h * 0.5
          : 30 + Math.random() * (this.world.h - 60);
        if (this.isWalkable(x, y, false) && this.cellAt(x, y) === 1) {
          const idx = this.idx(x, y);
          return idx >= 0 ? this.centerOf(idx) : { x, y };
        }
      }
      for (let i = 0; i < this.n; i++) if (this.val[i] === 1) return this.centerOf(i);
      return { x: this.world.w / 2, y: this.world.h / 2 };
    }
  }

  ZS.Nav = Nav;
})();
