/* Navigation: a 20px cell grid over the whole world.
   Cell values: 0 = blocked (water, wall), 1 = land, 2 = building floor,
   3 = intact door. Interiors and intact doors block zombies but not
   humans; a broken door becomes plain land (nav.doorBroken). astar() and
   los() are the only geometry agents use for movement, so water and walls
   are a hard block — no agent can ever end up inside them, no matter how
   fast they run. Scenarios that set `swim` (zombie.js) treat water as a
   soft block instead: astar() treats water cells as passable at 4x cost
   (it swims only when the swim beats the detour), los() sees across it,
   and the core caps in-water speed (SWIM_FRAC in agents.js). */
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
      this.val.fill(1); // land until proven otherwise
      this.wm = new Uint8Array(this.n); // 1 = water cell (river/lake/pond)
      // persistent A* work arrays, stamped per search (no per-call alloc)
      this.g = new Float32Array(this.n);
      this.fs = new Float32Array(this.n);
      this.from = new Int32Array(this.n);
      this.stamp = new Int32Array(this.n);
      this.gen = 0;
      this.version = 0; // bumped when a door breaks; agents replan on change
    }

    idx(x, y) {
      const ix = (x / CELL) | 0,
        iy = (y / CELL) | 0;
      if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return -1;
      return iy * this.w + ix;
    }

    cellAt(x, y) {
      const i = this.idx(x, y);
      return i < 0 ? 0 : this.val[i];
    }

    // floors (2) and intact doors (3) pass humans only: a zombie inside
    // (via a broken door) can still path back out, but nothing can cross
    // a wall or an intact door
    isWalkable(x, y, isZombie) {
      const i = this.idx(x, y);
      if (i < 0) return false;
      const v = this.val[i];
      if (v === 3 || v === 2) return !isZombie;
      return v >= 1;
    }

    // water test: a blocked cell that is river/lake/pond water. Walls are
    // blocked too but not water; door-front cells carved in the river are
    // plain land again (val 1), so they read as land, not water
    isWater(x, y) {
      const i = this.idx(x, y);
      return i >= 0 && this.val[i] === 0 && this.wm[i] === 1;
    }
    centerOf(i) {
      return {
        x: ((i % this.w) + 0.5) * CELL,
        y: (((i / this.w) | 0) + 0.5) * CELL,
      };
    }

    // mark a world rect's cells (cell centers inside the rect)
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

    // water from the world's river/lake/pond polygons (matches the
    // drawing exactly); ponds are optional smaller lakes (world.ponds)
    markWater() {
      const river = this.world.river.pts,
        lake = this.world.lake.pts,
        ponds = this.world.ponds || [];
      for (let iy = 0; iy < this.h; iy++)
        for (let ix = 0; ix < this.w; ix++) {
          const x = (ix + 0.5) * CELL,
            y = (iy + 0.5) * CELL;
          if (pointInPoly(x, y, river) || pointInPoly(x, y, lake)) {
            const i = iy * this.w + ix;
            this.val[i] = 0;
            this.wm[i] = 1;
            continue;
          }
          for (let i = 0; i < ponds.length; i++)
            if (pointInPoly(x, y, ponds[i].pts)) {
              const pi = iy * this.w + ix;
              this.val[pi] = 0;
              this.wm[pi] = 1;
              break;
            }
        }
    }

    // clear straight-line travel (cell-by-cell) between two world points;
    // swim-capable callers see across water
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
      // the endpoint: whatever stands there is reachable through whatever
      // the ray passed — a human-walkable point (floor, door, land) is
      // sightable from every side (the ray's intermediate cells carry the
      // side's own mask; the side's agent is clamped to its own cells)
      return this.isWalkable(x2, y2, false) || (swim && this.isWater(x2, y2));
    }

    /* 8-directional A* with an octile heuristic and a binary heap.
       Diagonal moves never cut corners. Returns a simplified path as an
       array of world-space {x,y} waypoints (start excluded) or null when
       the target is unreachable. swim: water cells become passable at
       4x cost — the swim is only taken when it beats the detour (the
       unit-cost heuristic stays admissible, so the path stays optimal). */
    astar(x1, y1, x2, y2, isZombie, maxExpand, swim) {
      const si = this.idx(x1, y1),
        ti = this.idx(x2, y2);
      if (si < 0 || ti < 0 || si === ti) return null;
      // a zombie already inside a building (start on a floor cell) may roam
      // that interior and out through broken doors; a zombie outside can
      // never path into floors, and no zombie crosses an intact door
      const inB = isZombie && this.val[si] === 2;
      const tw = swim && this.val[ti] === 0 && this.wm[ti] === 1; // water target
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

      // binary min-heap of [f, i]; stale entries are skipped on pop
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
            // no corner cutting: both orthogonal neighbors must be open
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

      // walk back, drop collinear points, map to world coords
      const raw = [];
      let i = ti;
      while (i !== si) {
        raw.push(i);
        i = from[i];
        if (raw.length > 4000) return null; // loop guard (should be impossible)
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
      return kept.map((ci) => this.centerOf(ci));
    }

    // first walkable point within maxR of (x, y), spiral search
    nearestWalkable(x, y, maxR, isZombie) {
      if (this.isWalkable(x, y, isZombie)) return { x, y };
      for (let r = 10; r <= maxR; r += 10) {
        const n = Math.max(10, (r * 0.7) | 0);
        for (let k = 0; k < n; k++) {
          const an = (k / n) * Math.PI * 2 + r * 0.35;
          const px = x + Math.cos(an) * r,
            py = y + Math.sin(an) * r;
          const i = this.idx(px, py);
          if (i >= 0 && this.isWalkable(px, py, isZombie)) return this.centerOf(i);
        }
      }
      return null;
    }

    // random open-land point (never floor, water or walls)
    randLand() {
      for (let i = 0; i < 300; i++) {
        const x = 30 + Math.random() * (this.world.w - 60);
        const y = 30 + Math.random() * (this.world.h - 60);
        const idx = this.idx(x, y);
        if (idx >= 0 && this.val[idx] === 1) return this.centerOf(idx);
      }
      for (let i = 0; i < this.n; i++) if (this.val[i] === 1) return this.centerOf(i);
      return { x: this.world.w / 2, y: this.world.h / 2 };
    }
  }

  ZS.Nav = Nav;
})();
