/* SANDSTORM — navigation.

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
   marginally longer, never wrong). Work arrays are allocated once.

   Two rules own everything else in here:

   1. A GATE IS A DOOR, NOT A WALL. Every tile remembers whose building
      stands on it, and the door belongs to the ground it stands in: the
      owner's units drive straight through, and so does anybody once the
      base's flaks are down and the yard stands open. A base with no door
      is a box, and a garrison that cannot march out is not a garrison.
   2. THE WALL DOES NOT NEGOTIATE. The arch is part of the ground — no
      faction can chew it, no gun targets it. The only way in is the gate,
      and the only way to open the gate is to kill the flaks that watch
      it. That is the whole shape of an assault.

   And one invariant, enforced in `legalize()`: no unit ever occupies a
   tile a unit could not stand on. Not at spawn, not on unload, not after
   the shove that frees a stuck tank. Tanks do not live inside walls. */
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
      this.blockR = new Uint8Array(N); // 1 = trains cannot enter (not rail)
      this.blockA = new Uint8Array(N); // 1 = ground fire cannot pass (rock, buildings)
      this.gateOf = new Int8Array(N); // whose gate stands on this tile, -1 = none
      this.bFac = new Int8Array(N); // who owns the building on this tile, -1 = none
      this.gateSite = new Map(); // gate tile -> the settlement it belongs to
      this.version = 0;
      this.tver = -1;
      this.game = null; // the game, for the full rebuild (set by Game)

      this.g = new Float32Array(N);
      this.from = new Int32Array(N);
      this.stamp = new Int32Array(N);
      this.gen = 0;
      // the heap is two flat arrays: no objects, no allocation per search.
      // It grows (doubling, capped) when a frontier outgrows it — a full
      // drop would make a route that exists look like no route at all.
      this.hf = new Float32Array(16384);
      this.hi = new Int32Array(16384);
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
        bR = this.blockR,
        bA = this.blockA;
      const gO = this.gateOf,
        bF = this.bFac;
      for (let i = 0; i < N; i++) {
        const v = typ[i];
        const rock = v === T.ROCK;
        const water = v === T.WATER;
        const built = occ[i] !== 0;
        bG[i] = rock || water || built ? 1 : 0;
        bS[i] = water && !built ? 0 : 1;
        bR[i] = v === T.RAIL ? 0 : 1; // trains walk the rail and nothing else
        bA[i] = rock || built ? 1 : 0;
        gO[i] = -1;
        bF[i] = -1;
      }
      // occupancy alone cannot tell a gate from a wall, so the buildings
      // themselves say whose door is where. Shots fly through an open
      // gate — that is what makes the entrance a killing ground rather
      // than a blind spot.
      if (this.game) {
        for (const b of this.game.buildings) {
          if (b.dead) continue;
          for (let dy = 0; dy < b.size; dy++)
            for (let dx = 0; dx < b.size; dx++) {
              const i = t.idx(b.tx + dx, b.ty + dy);
              if (i < 0) continue;
              bF[i] = b.fac;
              if (b.def.gate) {
                gO[i] = b.fac;
                bA[i] = 0;
                if (b.site) this.gateSite.set(i, b.site);
              }
            }
        }
      }
      this.tver = t.version;
      this.version++;
      this.cache.clear();
    }

    // a building went up or came down: patch just its footprint
    markFootprint(tx, ty, size, solid, fac, isGate, site) {
      const t = this.t;
      const v = solid ? 1 : 0;
      const owner = solid && fac !== undefined ? fac : -1;
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) {
          const i = t.idx(tx + dx, ty + dy);
          if (i < 0) continue;
          this.blockG[i] = v;
          this.blockA[i] = v && !isGate ? 1 : 0;
          this.blockS[i] = 1;
          this.blockR[i] = solid ? 1 : t.type[i] === T.RAIL ? 0 : 1;
          this.bFac[i] = owner;
          this.gateOf[i] = solid && isGate ? owner : -1;
          if (solid && isGate && site) this.gateSite.set(i, site);
          else if (!solid) this.gateSite.delete(i);
        }
      this.version++;
      this.cache.clear();
    }

    // called once per frame: if the terrain changed underneath us (a new
    // wall, a fallen tower) the grids and the cache are rebuilt
    sync(game) {
      if (game) this.game = game;
      if (this.tver !== this.t.version) this.rebuild();
      this.budget = 24;
      this.searches = 0;
    }

    /* ---------- who may stand where ----------
       `fac` is the faction doing the moving. Omit it and you get the
       cautious answer — every door shut — which is what a query that
       does not know who is asking should hear. */

    passTile(i, fac) {
      if (this.blockG[i] === 0) return true;
      const go = this.gateOf[i];
      if (go < 0) return false; // the wall: part of the ground, it does not open
      // the gate belongs to the settlement it stands in: the owner's
      // units drive through, and everybody drives through once the
      // flaks are down and the yard stands open
      const site = this.gateSite.get(i);
      if (site) {
        if (fac >= 0 && site.owner === fac) return true;
        return !!site.open;
      }
      return fac >= 0 && R.sameTeam(fac, go);
    }

    open(tx, ty, layer, fac) {
      if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return false;
      const i = ty * MAPW + tx;
      if (!layer) return this.passTile(i, fac === undefined ? -1 : fac);
      if (layer === 2) return this.blockS[i] === 0;
      if (layer === 3) return this.blockR[i] === 0;
      return true; // layer 1: the sky is open
    }
    openAt(x, y, layer, fac) {
      return this.open((x / TILE) | 0, (y / TILE) | 0, layer, fac);
    }

    /* ---------- the hard rule: nothing stands inside a building ----------
       Every hand-placed move (spawning out of a factory, climbing out of
       a transport, the nudge that frees something wedged against a wall)
       goes through here. If the tile is not one this unit could have
       walked onto, it is put back on the nearest one it could. */
    legalize(g, u) {
      if (u.layer === 1) return false;
      const i = g.t.at(u.x, u.y);
      const ok =
        i >= 0 &&
        (u.layer === 3
          ? this.blockR[i] === 0
          : u.layer === 2
            ? this.blockS[i] === 0
            : this.passTile(i, u.fac));
      if (ok) return false;
      const near = this.nearestOpen((u.x / TILE) | 0, (u.y / TILE) | 0, 10, u.layer, u.fac);
      if (!near) return false;
      u.x = (near.tx + 0.5) * TILE;
      u.y = (near.ty + 0.5) * TILE;
      u.vx = 0;
      u.vy = 0;
      u.path = null;
      u.stuck = 0;
      return true;
    }

    /* ---------- line of sight ---------- */

    // tile DDA: does a straight run of tiles stay clear? Aircraft always
    // see; ships need water the whole way; ground fire stops on rock and
    // on buildings but not on brush.
    los(x1, y1, x2, y2, layer, fac) {
      if (layer === 1) return true;
      if (layer === 3) return false; // a train never sees a straight line
      const sea = layer === 2;
      const who = fac === undefined ? -1 : fac;
      const ok = (i) => (sea ? this.blockS[i] === 0 : this.passTile(i, who));
      // walk the segment in tile-sized steps
      const dx = x2 - x1,
        dy = y2 - y1;
      const d = Math.hypot(dx, dy);
      if (d < TILE * 0.5) {
        const i = this.t.idx((x2 / TILE) | 0, (y2 / TILE) | 0);
        return i >= 0 && ok(i);
      }
      const steps = Math.ceil(d / (TILE * 0.45));
      for (let s = 1; s <= steps; s++) {
        const px = x1 + (dx * s) / steps,
          py = y1 + (dy * s) / steps;
        const i = this.t.idx((px / TILE) | 0, (py / TILE) | 0);
        if (i < 0 || !ok(i)) return false;
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

    // double the frontier arrays, up to a hard ceiling (~1 MB). The space
    // is kept for every later search — this is capacity, not churn.
    heapGrow(need) {
      const MAX = 131072;
      let cap = this.hf.length;
      while (cap < need && cap < MAX) cap *= 2;
      if (cap <= this.hf.length) return; // at the ceiling: nothing to be done
      const hf = new Float32Array(cap),
        hi = new Int32Array(cap);
      hf.set(this.hf);
      hi.set(this.hi);
      this.hf = hf;
      this.hi = hi;
    }
    heapPush(f, i) {
      let n = this.hn;
      if (n >= this.hf.length) this.heapGrow(n + 1); // rare, and it sticks
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
       1 air, 2 sea. `fac` is who is walking — it decides which doors are
       open. `breach` only loosens the goal: a besieger may aim at the
       wall itself. Nothing walks through it. `cap` overrides the
       expansion limit. */
    astar(sx, sy, gx, gy, layer, fac, breach, cap) {
      layer = layer || 0;
      if (layer === 1) return [{ x: gx, y: gy }];
      const who = fac === undefined ? -1 : fac;
      let stx = R.clamp((sx / TILE) | 0, 0, MAPW - 1),
        sty = R.clamp((sy / TILE) | 0, 0, MAPH - 1);
      let gtx = R.clamp((gx / TILE) | 0, 0, MAPW - 1),
        gty = R.clamp((gy / TILE) | 0, 0, MAPH - 1);

      const grid = layer === 2 ? this.blockS : layer === 3 ? this.blockR : this.blockG;
      // the goal itself may be occupied (you clicked a tank): take the
      // nearest open tile to it instead
      if (!this.open(gtx, gty, layer, who)) {
        // with breach allowed we are happy to aim at the wall itself —
        // that is the point of a siege. Trains do not breach; they simply
        // cannot be where you clicked.
        if (!(breach && layer !== 2 && layer !== 3 && this.bFac[gty * MAPW + gtx] >= 0)) {
          const alt = this.nearestOpen(gtx, gty, 8, layer, who);
          if (!alt) return null;
          gtx = alt.tx;
          gty = alt.ty;
        }
      }
      const si = sty * MAPW + stx,
        ti = gty * MAPW + gtx;
      if (si === ti) return [{ x: gx, y: gy }];

      // cache: a squad walking to the same place shares one search. The
      // faction is part of the key — my route home is not your route in.
      const key = (si * N + ti) * 16 + (who + 1) * 2 + (breach ? 1 : 0);
      const hit = this.cache.get(key);
      if (hit) {
        // refresh LRU
        this.cache.delete(key);
        this.cache.set(key, hit);
        return hit.slice();
      }

      const straight = Math.hypot(gtx - stx, gty - sty);
      // a route that has to walk round a base to reach its gate is far
      // longer than the straight line — the budget allows for the detour
      const base = R.clamp(straight * 90 + 600, 1500, 12000);
      const limit = cap || (breach ? base * 7 : base);

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
          const step = DIRS[d][2];
          if (grid[ni] !== 0) {
            if (d >= 4) continue; // no squeezing diagonally through a wall
            if (layer === 3) continue; // the rail does not negotiate
            if (!this.passTile(ni, who)) continue; // the wall does not open
          }
          if (d >= 4) {
            // no cutting a diagonal past a corner
            if (grid[iy * MAPW + nx] !== 0 || grid[ny * MAPW + ix] !== 0) continue;
          }
          const ng = gi + step;
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

    nearestOpen(tx, ty, r, layer, fac) {
      const who = fac === undefined ? -1 : fac;
      if (this.open(tx, ty, layer, who)) return { tx, ty };
      for (let rr = 1; rr <= (r || 8); rr++) {
        const n = Math.max(8, rr * 8);
        for (let k = 0; k < n; k++) {
          const an = (k / n) * R.TAU;
          const x = Math.round(tx + Math.cos(an) * rr),
            y = Math.round(ty + Math.sin(an) * rr);
          if (this.open(x, y, layer, who)) return { tx: x, ty: y };
        }
      }
      return null;
    }

    // a random open tile near (tx,ty) — rally points, scatter, retreats
    randomOpenNear(tx, ty, r, layer, rnd, fac) {
      rnd = rnd || Math.random;
      const who = fac === undefined ? -1 : fac;
      for (let k = 0; k < 24; k++) {
        const an = rnd() * R.TAU,
          rr = rnd() * r;
        const x = Math.round(tx + Math.cos(an) * rr),
          y = Math.round(ty + Math.sin(an) * rr);
        if (this.open(x, y, layer, who)) return { tx: x, ty: y };
      }
      return this.nearestOpen(tx, ty, r, layer, who) || { tx, ty };
    }
  }

  R.Nav = Nav;
})();
