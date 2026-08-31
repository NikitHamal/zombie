/* Desert Order — navigation.

   One grid, three layers: the ground walks tiles, ships hold the water,
   aircraft ignore the grid altogether.

   The map is 300x300 tiles, so a cross-map A* is not a thing a frame can
   afford. Three things keep it cheap:

   1. line of sight first — most of the desert is open, and a unit with a
      clear straight line never searches at all;
   2. a path cache — a squad all walking to the same place shares one
      search;
   3. a per-frame budget — searches are queued and spread across frames, so
      ordering two hundred tanks costs a few frames of thinking, not one
      very long frame.

   The search itself is weighted A* (the heuristic is inflated a little,
   which is the usual RTS trade: it explores far less and the path is
   marginally longer, never wrong). Work arrays are allocated once. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE,
    MAPW = R.MAPW,
    MAPH = R.MAPH,
    N = MAPW * MAPH;
  const T = R.T;

  const CACHE_MAX = 220;
  const WEIGHT = 1.22; // heuristic inflation
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

  class Nav {
    constructor(terrain) {
      this.t = terrain;
      this.blockG = new Uint8Array(N); // 1 = ground units cannot enter
      this.blockS = new Uint8Array(N); // 1 = ships cannot enter
      this.blockA = new Uint8Array(N); // 1 = ground fire cannot pass (rock, buildings)
      this.version = 0;
      this.tver = -1;

      this.g = new Float32Array(N);
      this.from = new Int32Array(N);
      this.stamp = new Int32Array(N);
      this.gen = 0;
      // the heap is two flat arrays: no objects, no allocation per search
      this.hf = new Float32Array(8192);
      this.hi = new Int32Array(8192);
      this.hn = 0;

      this.cache = new Map();
      this.budget = 24;
      this.searches = 0;

      this.rebuild();
    }

    /* ---------- the blocking grids ---------- */

    rebuild() {
      const t = this.t,
        typ = t.type,
        occ = t.occ;
      const bG = this.blockG,
        bS = this.blockS,
        bA = this.blockA;
      for (let i = 0; i < N; i++) {
        const v = typ[i];
        const rock = v === T.ROCK;
        const water = v === T.WATER;
        const built = occ[i] !== 0;
        bG[i] = rock || water || built ? 1 : 0;
        bS[i] = water && !built ? 0 : 1;
        bA[i] = rock || built ? 1 : 0;
      }
      this.tver = t.version;
      this.version++;
      this.cache.clear();
    }

    // a building went up or came down: patch just its footprint
    markFootprint(tx, ty, size, solid) {
      const t = this.t;
      const v = solid ? 1 : 0;
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) {
          const i = t.idx(tx + dx, ty + dy);
          if (i < 0) continue;
          this.blockG[i] = v;
          this.blockA[i] = v;
          this.blockS[i] = 1;
        }
      this.version++;
      this.cache.clear();
    }

    // called once per frame: if the terrain changed underneath us (a new
    // wall, a fallen tower) the grids and the cache are rebuilt
    sync() {
      if (this.tver !== this.t.version) this.rebuild();
      this.budget = 24;
      this.searches = 0;
    }

    open(tx, ty, layer) {
      if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return false;
      const i = ty * MAPW + tx;
      if (!layer) return this.blockG[i] === 0;
      if (layer === 2) return this.blockS[i] === 0;
      return true;
    }
    openAt(x, y, layer) {
      return this.open((x / TILE) | 0, (y / TILE) | 0, layer);
    }

    /* ---------- line of sight ---------- */

    // tile DDA: does a straight run of tiles stay clear? Aircraft always
    // see; ships need water the whole way; ground fire stops on rock and
    // on buildings but not on brush.
    los(x1, y1, x2, y2, layer) {
      if (layer === 1) return true;
      const grid = layer === 2 ? this.blockS : this.blockG;
      const pass = layer === 2 ? 0 : 0;
      // walk the segment in tile-sized steps
      const dx = x2 - x1,
        dy = y2 - y1;
      const d = Math.hypot(dx, dy);
      if (d < TILE * 0.5) {
        const i = this.t.idx((x2 / TILE) | 0, (y2 / TILE) | 0);
        return i >= 0 && grid[i] === pass;
      }
      const steps = Math.ceil(d / (TILE * 0.45));
      for (let s = 1; s <= steps; s++) {
        const px = x1 + (dx * s) / steps,
          py = y1 + (dy * s) / steps;
        const i = this.t.idx((px / TILE) | 0, (py / TILE) | 0);
        if (i < 0 || grid[i] !== pass) return false;
      }
      return true;
    }

    // can shots pass? rocks and buildings stop them, brush does not
    fireLine(x1, y1, x2, y2) {
      const dx = x2 - x1,
        dy = y2 - y1;
      const steps = Math.ceil(Math.hypot(dx, dy) / (TILE * 0.6));
      for (let s = 1; s < steps; s++) {
        const px = x1 + (dx * s) / steps,
          py = y1 + (dy * s) / steps;
        const i = this.t.idx((px / TILE) | 0, (py / TILE) | 0);
        if (i < 0 || this.blockA[i]) return false;
      }
      return true;
    }

    /* ---------- A* ---------- */

    heapClear() {
      this.hn = 0;
    }
    heapPush(f, i) {
      let n = this.hn;
      if (n >= this.hf.length) return; // the cap keeps the worst case bounded
      const hf = this.hf,
        hi = this.hi;
      hf[n] = f;
      hi[n] = i;
      let c = n;
      this.hn = n + 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (hf[p] <= hf[c]) break;
        const tf = hf[p],
          ti = hi[p];
        hf[p] = hf[c];
        hi[p] = hi[c];
        hf[c] = tf;
        hi[c] = ti;
        c = p;
      }
    }
    heapPop() {
      const hf = this.hf,
        hi = this.hi;
      const top = hi[0],
        topf = hf[0];
      const n = --this.hn;
      if (n > 0) {
        hf[0] = hf[n];
        hi[0] = hi[n];
        let p = 0;
        for (;;) {
          const l = p * 2 + 1,
            r = l + 1;
          let m = p;
          if (l < n && hf[l] < hf[m]) m = l;
          if (r < n && hf[r] < hf[m]) m = r;
          if (m === p) break;
          const tf = hf[p],
            ti = hi[p];
          hf[p] = hf[m];
          hi[p] = hi[m];
          hf[m] = tf;
          hi[m] = ti;
          p = m;
        }
      }
      this._top = top;
      this._topf = topf;
      return top;
    }

    /* Returns an array of world waypoints (or null). `layer`: 0 ground,
       1 air, 2 sea. `cap` overrides the expansion limit. */
    astar(sx, sy, gx, gy, layer, cap) {
      layer = layer || 0;
      if (layer === 1) return [{ x: gx, y: gy }];
      let stx = R.clamp((sx / TILE) | 0, 0, MAPW - 1),
        sty = R.clamp((sy / TILE) | 0, 0, MAPH - 1);
      let gtx = R.clamp((gx / TILE) | 0, 0, MAPW - 1),
        gty = R.clamp((gy / TILE) | 0, 0, MAPH - 1);

      const grid = layer === 2 ? this.blockS : this.blockG;
      // the goal itself may be occupied (you clicked a tank): take the
      // nearest open tile to it instead
      if (grid[gty * MAPW + gtx] !== 0) {
        const alt = this.nearestOpen(gtx, gty, 6, layer);
        if (!alt) return null;
        gtx = alt.tx;
        gty = alt.ty;
      }
      const si = sty * MAPW + stx,
        ti = gty * MAPW + gtx;
      if (si === ti) return [{ x: gx, y: gy }];

      // cache: a squad walking to the same place shares one search
      const key = si * N + ti;
      const hit = this.cache.get(key);
      if (hit) {
        // refresh LRU
        this.cache.delete(key);
        this.cache.set(key, hit);
        return hit.slice();
      }

      const straight = Math.hypot(gtx - stx, gty - sty);
      const limit = cap || R.clamp(straight * 70 + 400, 1200, 7000);

      const gen = ++this.gen;
      const g = this.g,
        from = this.from,
        stamp = this.stamp;
      const tix = gtx,
        tiy = gty;
      const H = (ix, iy) => {
        const dx = Math.abs(ix - tix),
          dy = Math.abs(iy - tiy);
        return (dx > dy ? 1.41421 * dy + (dx - dy) : 1.41421 * dx + (dy - dx)) * WEIGHT;
      };

      this.heapClear();
      stamp[si] = gen;
      g[si] = 0;
      from[si] = -1;
      this.heapPush(H(stx, sty), si);
      let expanded = 0,
        found = false;

      while (this.hn > 0) {
        const i = this.heapPop();
        if (stamp[i] !== gen) continue;
        if (i === ti) {
          found = true;
          break;
        }
        if (++expanded > limit) break;
        const ix = i % MAPW,
          iy = (i / MAPW) | 0;
        const gi = g[i];
        for (let d = 0; d < 8; d++) {
          const nx = ix + DIRS[d][0],
            ny = iy + DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= MAPW || ny >= MAPH) continue;
          const ni = ny * MAPW + nx;
          if (grid[ni] !== 0) continue;
          if (d >= 4) {
            // no cutting a diagonal past a corner
            if (grid[iy * MAPW + nx] !== 0 || grid[ny * MAPW + ix] !== 0) continue;
          }
          const ng = gi + DIRS[d][2];
          if (stamp[ni] === gen && ng >= g[ni]) continue;
          stamp[ni] = gen;
          g[ni] = ng;
          from[ni] = i;
          this.heapPush(ng + H(nx, ny), ni);
        }
      }
      this.searches++;
      if (!found) return null;

      // walk back and turn corners into world waypoints
      const cells = [];
      let i = ti,
        guard = 0;
      while (i !== si && i !== -1 && guard++ < 20000) {
        cells.push(i);
        i = from[i];
      }
      cells.reverse();
      // drop collinear runs: one waypoint per change of direction
      const keep = [];
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k];
        const p = keep[keep.length - 1];
        if (p === undefined) {
          keep.push(c);
          continue;
        }
        const ax = (p % MAPW) - ((cells[k + 1] ?? c) % MAPW);
        const ay = ((p / MAPW) | 0) - (((cells[k + 1] ?? c) / MAPW) | 0);
        const bx = (c % MAPW) - ((cells[k + 1] ?? c) % MAPW);
        const by = ((c / MAPW) | 0) - (((cells[k + 1] ?? c) / MAPW) | 0);
        if (ax !== bx || ay !== by) keep.push(c);
      }
      const path = keep.map((c) => ({
        x: ((c % MAPW) + 0.5) * TILE,
        y: (((c / MAPW) | 0) + 0.5) * TILE,
      }));
      // the true destination, not the centre of its tile
      if (path.length) {
        path[path.length - 1] = { x: gx, y: gy };
      } else path.push({ x: gx, y: gy });

      this.cache.set(key, path);
      if (this.cache.size > CACHE_MAX) {
        // drop the oldest third
        let k = 0;
        const drop = Math.ceil(CACHE_MAX / 3);
        for (const kk of this.cache.keys()) {
          this.cache.delete(kk);
          if (++k >= drop) break;
        }
      }
      return path.slice();
    }

    nearestOpen(tx, ty, r, layer) {
      if (this.open(tx, ty, layer)) return { tx, ty };
      for (let rr = 1; rr <= (r || 8); rr++) {
        const n = Math.max(8, rr * 8);
        for (let k = 0; k < n; k++) {
          const an = (k / n) * R.TAU;
          const x = Math.round(tx + Math.cos(an) * rr),
            y = Math.round(ty + Math.sin(an) * rr);
          if (this.open(x, y, layer)) return { tx: x, ty: y };
        }
      }
      return null;
    }

    // a random open tile near (tx,ty) — rally points, scatter, retreats
    randomOpenNear(tx, ty, r, layer, rnd) {
      rnd = rnd || Math.random;
      for (let k = 0; k < 24; k++) {
        const an = rnd() * R.TAU,
          rr = rnd() * r;
        const x = Math.round(tx + Math.cos(an) * rr),
          y = Math.round(ty + Math.sin(an) * rr);
        if (this.open(x, y, layer)) return { tx: x, ty: y };
      }
      return this.nearestOpen(tx, ty, r, layer) || { tx, ty };
    }
  }

  R.Nav = Nav;
})();
