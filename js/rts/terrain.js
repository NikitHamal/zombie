/* Desert Order — the ground.

   A 300x300 tile desert (12000 x 12000 world units): dunes, packed flats,
   mesa ridges nothing can climb, a river that runs to a southern sea, oil
   seeps, brush, a highway network, and thirty-odd settlement sites worth
   fighting over.

   The map is generated once from a seed and then never changes except
   where you build on it. Two things are kept for the renderer: a small
   overview canvas (drawn once, used when the camera is far out) and a
   decor list (rocks, bushes, ripples) that is culled and drawn per frame
   so it stays crisp at every zoom. There is no per-tile memory beyond
   four flat arrays, and no allocation after worldgen. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE,
    MAPW = R.MAPW,
    MAPH = R.MAPH,
    N = MAPW * MAPH;
  const T = R.T;

  const DECOR_MAX = 26000;

  class Terrain {
    constructor(seed) {
      this.seed = seed >>> 0;
      this.w = MAPW;
      this.h = MAPH;
      this.type = new Uint8Array(N);
      this.shade = new Uint8Array(N); // dune light/shadow, 0..255
      this.occ = new Int16Array(N); // building index +1, or 0 for empty
      this.owner = new Int8Array(N); // territory: -1 nobody, else faction
      this.vis = new Uint8Array(N); // fog for the player: 0/1/2
      this.visFade = new Float32Array(N); // smoothed fog, for drawing
      this.roadBonus = new Uint8Array(N);
      this.nodes = []; // oil seeps
      this.sites = []; // capturable settlement sites
      this.decor = null;
      this.overview = null;
      this.version = 0; // bumped when occupancy changes — nav listens

      this.generate();
    }

    /* ---------- generation ---------- */

    generate() {
      const seed = this.seed;
      const type = this.type,
        shade = this.shade;
      const rnd = ZS.rng32(seed ^ 0x9e3779b9);

      // --- base: elevation + dunes -------------------------------------
      for (let ty = 0; ty < MAPH; ty++) {
        for (let tx = 0; tx < MAPW; tx++) {
          const i = ty * MAPW + tx;
          const e = R.fbm(tx * 0.018, ty * 0.018, seed, 4);
          const dune = R.fbm(tx * 0.09 + 40, ty * 0.09, seed + 7, 3);
          const relief = R.ridge(tx * 0.022, ty * 0.022, seed + 300, 4);
          shade[i] = R.clamp(((dune * 0.55 + e * 0.45) * 255) | 0, 0, 255);
          // the ridge crests become rock: sharp, winding, unclimbable
          if (relief > 0.74 && e > 0.42) type[i] = T.ROCK;
          else if (dune > 0.62 || e > 0.62) type[i] = T.FIRM;
          else type[i] = T.SAND;
        }
      }

      // --- the sea: the southern edge ----------------------------------
      const seaLine = MAPH - 34;
      for (let tx = 0; tx < MAPW; tx++) {
        const wob = (R.fbm(tx * 0.03, 11.5, seed + 91, 3) - 0.5) * 26;
        const edge = Math.round(seaLine + wob);
        for (let ty = Math.max(0, edge); ty < MAPH; ty++) type[ty * MAPW + tx] = T.WATER;
        // a wet margin that reads as a shoreline
        for (let k = 1; k <= 2; k++) {
          const ty = edge - k;
          if (ty >= 0 && type[ty * MAPW + tx] !== T.ROCK) type[ty * MAPW + tx] = T.FIRM;
        }
      }

      // --- the river: north to the sea ---------------------------------
      this.carveRiver(seed);

      // --- oasis lakes --------------------------------------------------
      const lakes = 4 + ((rnd() * 4) | 0);
      for (let k = 0; k < lakes; k++) {
        const cx = 24 + rnd() * (MAPW - 48);
        const cy = 24 + rnd() * (MAPH - 70);
        const rad = 3.5 + rnd() * 5;
        this.blob(cx, cy, rad, T.WATER, 0.55 + rnd() * 0.3);
        this.blob(cx, cy, rad + 2.6, T.SCRUB, 0.6);
      }

      // --- brush: wherever there is water, and on the flats -------------
      for (let ty = 0; ty < MAPH; ty++) {
        for (let tx = 0; tx < MAPW; tx++) {
          const i = ty * MAPW + tx;
          if (type[i] !== T.SAND && type[i] !== T.FIRM) continue;
          const s = R.fbm(tx * 0.055, ty * 0.055, seed + 555, 3);
          if (s > 0.63) type[i] = T.SCRUB;
        }
      }

      // --- oil seeps ----------------------------------------------------
      let tries = 0;
      while (this.nodes.length < 16 && tries++ < 6000) {
        const tx = 12 + ((rnd() * (MAPW - 24)) | 0);
        const ty = 12 + ((rnd() * (MAPH - 60)) | 0);
        const i = ty * MAPW + tx;
        if (type[i] !== T.SAND && type[i] !== T.FIRM) continue;
        if (this.nearNode(tx, ty, 22)) continue;
        this.blob(tx, ty, 2.2, T.OIL, 0.9);
        this.nodes.push({ tx, ty, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
      }

      // --- settlement sites --------------------------------------------
      this.placeSites(rnd);

      // --- highways ------------------------------------------------------
      this.layRoads();

      // --- shoreline scrub pass (after water is final) -------------------
      for (let ty = 1; ty < MAPH - 1; ty++) {
        for (let tx = 1; tx < MAPW - 1; tx++) {
          const i = ty * MAPW + tx;
          if (type[i] !== T.SAND && type[i] !== T.FIRM) continue;
          let wet = 0;
          if (this.tWater(tx + 1, ty)) wet++;
          if (this.tWater(tx - 1, ty)) wet++;
          if (this.tWater(tx, ty + 1)) wet++;
          if (this.tWater(tx, ty - 1)) wet++;
          if (wet >= 1 && R.hash2(tx, ty, seed + 4) > 0.45) type[i] = T.SCRUB;
        }
      }

      // --- decor ---------------------------------------------------------
      this.buildDecor(rnd);
      this.renderOverview();
      this.version++;
    }

    tWater(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return false;
      return this.type[ty * MAPW + tx] === T.WATER;
    }

    blob(cx, cy, rad, kind, wobble) {
      const r0 = Math.ceil(rad + 1);
      for (let dy = -r0; dy <= r0; dy++) {
        for (let dx = -r0; dx <= r0; dx++) {
          const tx = (cx + dx) | 0,
            ty = (cy + dy) | 0;
          if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) continue;
          const d = Math.hypot(dx, dy) / rad;
          if (d > 1) continue;
          const n = R.hash2(tx * 13, ty * 17, this.seed + 99) * (wobble || 0.4);
          if (d > 1 - n * 0.55) continue;
          const i = ty * MAPW + tx;
          if (this.type[i] === T.OIL) continue;
          this.type[i] = kind;
        }
      }
    }

    carveRiver(seed) {
      // a meandering channel from the north edge down to the sea
      let x = 40 + R.hash2(1, 2, seed + 12) * (MAPW - 80);
      const pts = [];
      for (let ty = 0; ty < MAPH; ty++) {
        const n = R.fbm(ty * 0.045, 3.3, seed + 707, 3) - 0.5;
        const n2 = R.fbm(ty * 0.011, 8.8, seed + 808, 2) - 0.5;
        x += n * 3.4 + n2 * 6;
        x = R.clamp(x, 14, MAPW - 14);
        pts.push({ tx: x, ty });
      }
      const width = 2.1;
      for (const p of pts) {
        const w = width + R.fbm(p.ty * 0.07, 1.1, seed + 909, 2) * 1.6;
        for (let d = -w; d <= w; d += 0.5) {
          const tx = Math.round(p.tx + d);
          if (tx < 0 || tx >= MAPW) continue;
          const i = p.ty * MAPW + tx;
          this.type[i] = T.WATER;
        }
        // green banks
        for (let d = -w - 3; d <= w + 3; d += 0.5) {
          const tx = Math.round(p.tx + d);
          if (tx < 0 || tx >= MAPW) continue;
          const i = p.ty * MAPW + tx;
          if (this.type[i] === T.SAND || this.type[i] === T.FIRM) {
            if (R.hash2(tx, p.ty, seed + 3) > 0.5) this.type[i] = T.SCRUB;
          }
        }
      }
      this.river = pts;
    }

    nearNode(tx, ty, r) {
      for (const n of this.nodes) if (Math.hypot(n.tx - tx, n.ty - ty) < r) return true;
      return false;
    }

    // flat, dry, and roomy: a place an army could hold
    flatScore(tx, ty, r) {
      let bad = 0,
        n = 0,
        water = 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = tx + dx,
            y = ty + dy;
          if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return -1;
          const t = this.type[y * MAPW + x];
          n++;
          if (t === T.ROCK) bad += 3;
          else if (t === T.WATER) {
            bad += 2;
            water++;
          } else if (t === T.SCRUB) bad += 0.4;
        }
      if (water > n * 0.18) return -1;
      return 1 - bad / (n * 1.6);
    }

    placeSites(rnd) {
      const want = 34;
      const minGap = 26;
      let guard = 0;
      while (this.sites.length < want && guard++ < 9000) {
        const tx = 16 + ((rnd() * (MAPW - 32)) | 0);
        const ty = 12 + ((rnd() * (MAPH - 52)) | 0);
        if (this.flatScore(tx, ty, 4) < 0.55) continue;
        let ok = true;
        for (const s of this.sites) if (Math.hypot(s.tx - tx, s.ty - ty) < minGap) ok = false;
        if (!ok) continue;
        this.sites.push({
          id: this.sites.length,
          tx,
          ty,
          x: (tx + 0.5) * TILE,
          y: (ty + 0.5) * TILE,
          r: 11, // territory radius in tiles
          owner: -1,
          garrison: 0,
          tier: 1,
          name: null,
        });
      }
      // the biggest, most central site is the player's home
      let best = null,
        bestS = -1;
      const cx = MAPW * 0.5,
        cy = MAPH * 0.42;
      for (const s of this.sites) {
        const sc = this.flatScore(s.tx, s.ty, 5) - Math.hypot(s.tx - cx, s.ty - cy) / MAPW;
        if (sc > bestS) {
          bestS = sc;
          best = s;
        }
      }
      if (best) {
        best.home = true;
        best.owner = 0;
        best.tier = 2;
        this.homeSite = best;
      }
      const NAMES = [
        "Al-Kharit",
        "Dune Watch",
        "Salt Flats",
        "Red Mesa",
        "Half Well",
        "Far Oasis",
        "Iron Gulch",
        "Sirocco Post",
        "Broken Convoy",
        "White Ridge",
        "Ghaddar",
        "Palm Hollow",
        "Gravel End",
        "Sun Station",
        "The Narrows",
        "Copper Bend",
        "Last Pump",
        "Mirage",
        "Scorpion Flats",
        "Azraq",
        "Tannery",
        "Black Rocks",
        "Cistern",
        "Windmill",
        "Sabkha",
        "Qasr",
        "Bitter Lake",
        "Fuel Stop",
        "Kiln",
        "Telegraph Hill",
        "Camel Run",
        "Ashen Ford",
        "Deep Sand",
        "Signal Post",
      ];
      this.sites.forEach((s, i) => (s.name = NAMES[i % NAMES.length]));
    }

    layRoads() {
      const road = (x0, y0, x1, y1, w) => {
        const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.6);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          // a lazy S so the roads read as roads, not as rulers
          const bx = R.lerp(x0, x1, t) + Math.sin(t * 6.283) * 1.6;
          const by = R.lerp(y0, y1, t) + Math.cos(t * 5.1) * 1.2;
          for (let dy = -w; dy <= w; dy++)
            for (let dx = -w; dx <= w; dx++) {
              const tx = Math.round(bx + dx),
                ty = Math.round(by + dy);
              if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) continue;
              const i = ty * MAPW + tx;
              const tt = this.type[i];
              if (tt === T.ROCK || tt === T.WATER || tt === T.OIL) continue;
              this.type[i] = T.ROAD;
            }
        }
      };

      // site-to-site: everyone links to their nearest two neighbours
      for (const s of this.sites) {
        const near = this.sites
          .filter((o) => o !== s)
          .sort(
            (a, b) => Math.hypot(a.tx - s.tx, a.ty - s.ty) - Math.hypot(b.tx - s.tx, b.ty - s.ty),
          )
          .slice(0, 2);
        for (const o of near) road(s.tx, s.ty, o.tx, o.ty, 0);
      }
      // a ring road around the map and four highways out through the
      // middle of each edge (the Desert Order way off the map)
      const edges = [
        { x: MAPW / 2, y: 1 },
        { x: MAPW / 2, y: MAPH - 40 },
        { x: 1, y: MAPH / 2 },
        { x: MAPW - 2, y: MAPH / 2 },
      ];
      for (const e of edges) {
        let best = this.sites[0],
          bs = 1e9;
        for (const s of this.sites) {
          const d = Math.hypot(s.tx - e.x, s.ty - e.y);
          if (d < bs) {
            bs = d;
            best = s;
          }
        }
        road(best.tx, best.ty, e.x, e.y, 0);
        this.highways = this.highways || [];
        this.highways.push({ x: (e.x + 0.5) * TILE, y: (e.y + 0.5) * TILE });
      }
      // oil seeps get a spur so a refinery is worth driving to
      for (const n of this.nodes) {
        let best = this.sites[0],
          bs = 1e9;
        for (const s of this.sites) {
          const d = Math.hypot(s.tx - n.tx, s.ty - n.ty);
          if (d < bs) {
            bs = d;
            best = s;
          }
        }
        road(best.tx, best.ty, n.tx, n.ty, 0);
      }
    }

    buildDecor(rnd) {
      const dx = new Float32Array(DECOR_MAX),
        dy = new Float32Array(DECOR_MAX),
        dk = new Uint8Array(DECOR_MAX),
        ds = new Float32Array(DECOR_MAX),
        dr = new Float32Array(DECOR_MAX);
      let n = 0;
      // kinds: 0 ripple, 1 pebble, 2 bush, 3 rock chunk, 4 bones, 5 palm,
      // 6 tyre track, 7 wreck
      for (let ty = 0; ty < MAPH && n < DECOR_MAX - 8; ty++) {
        for (let tx = 0; tx < MAPW && n < DECOR_MAX - 8; tx++) {
          const i = ty * MAPW + tx;
          const t = this.type[i];
          const h = R.hash2(tx, ty, this.seed + 4242);
          let kind = -1,
            chance = 0;
          if (t === T.SAND) {
            chance = 0.3;
            kind = h > 0.72 ? 3 : h > 0.3 ? 0 : 1;
          } else if (t === T.FIRM) {
            chance = 0.16;
            kind = h > 0.66 ? 3 : h > 0.4 ? 1 : 0;
          } else if (t === T.SCRUB) {
            chance = 0.72;
            kind = h > 0.9 ? 5 : 2;
          } else if (t === T.ROCK) {
            chance = 0.55;
            kind = 3;
          } else if (t === T.ROAD) {
            chance = 0.1;
            kind = 6;
          }
          if (kind < 0) continue;
          // hash-driven thinning: keep the desert sparse but never empty
          if (R.hash2(tx * 3, ty * 7, this.seed + 55) > chance) continue;
          const jx = R.hash2(tx, ty, this.seed + 61) - 0.5;
          const jy = R.hash2(tx, ty, this.seed + 62) - 0.5;
          dx[n] = (tx + 0.5 + jx * 0.8) * TILE;
          dy[n] = (ty + 0.5 + jy * 0.8) * TILE;
          dk[n] = kind;
          ds[n] = R.hash2(tx, ty, this.seed + 63);
          dr[n] = 0.5 + R.hash2(tx, ty, this.seed + 64) * 0.9;
          n++;
        }
      }
      // a handful of old wrecks along the roads, for company
      for (let k = 0; k < 40 && n < DECOR_MAX; k++) {
        const tx = 6 + ((rnd() * (MAPW - 12)) | 0);
        const ty = 6 + ((rnd() * (MAPH - 12)) | 0);
        const i = ty * MAPW + tx;
        if (this.type[i] !== T.ROAD && this.type[i] !== T.SAND) continue;
        dx[n] = (tx + 0.5) * TILE;
        dy[n] = (ty + 0.5) * TILE;
        dk[n] = 7;
        ds[n] = rnd();
        dr[n] = 1;
        n++;
      }
      this.decor = { n, x: dx, y: dy, k: dk, s: ds, r: dr };
    }

    /* ---------- the overview: one small canvas, drawn once ---------- */

    renderOverview() {
      // keep the overview cheap: one pixel per 16 world units = 750x750 for
      // the whole map. It is only ever shown zoomed far out, where those
      // 16 units are well under a screen pixel.
      const step = 16;
      const ow = Math.ceil(R.W / step),
        oh = Math.ceil(R.H / step);
      const cv = this.overview || (this.overview = document.createElement("canvas"));
      cv.width = ow;
      cv.height = oh;
      const c = cv.getContext("2d");
      const img = c.createImageData(ow, oh);
      const d = img.data;
      const pal = R.PAL;
      for (let ty = 0; ty < oh; ty++) {
        for (let tx = 0; tx < ow; tx++) {
          // sample the tile under this overview pixel
          const sx = Math.min(MAPW - 1, ((tx * step) / TILE) | 0);
          const sy = Math.min(MAPH - 1, ((ty * step) / TILE) | 0);
          const i = sy * MAPW + sx;
          const t = this.type[i];
          let col;
          if (t === T.WATER) col = pal.water;
          else if (t === T.ROCK) col = pal.rock;
          else if (t === T.SCRUB) col = pal.scrub;
          else if (t === T.ROAD) col = pal.road;
          else if (t === T.OIL) col = pal.oil;
          else if (t === T.FIRM) col = pal.firm;
          else col = pal.sand;
          const sh = 0.82 + (this.shade[i] / 255) * 0.3;
          const o = (ty * ow + tx) * 4;
          d[o] = R.clamp(col[0] * sh, 0, 255);
          d[o + 1] = R.clamp(col[1] * sh, 0, 255);
          d[o + 2] = R.clamp(col[2] * sh, 0, 255);
          d[o + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
      this.overviewScale = step;
    }

    /* ---------- queries ---------- */

    idx(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return -1;
      return ty * MAPW + tx;
    }
    at(x, y) {
      return this.idx((x / TILE) | 0, (y / TILE) | 0);
    }
    typeAt(x, y) {
      const i = this.at(x, y);
      return i < 0 ? T.ROCK : this.type[i];
    }
    tx(x) {
      return (x / TILE) | 0;
    }
    ty(y) {
      return (y / TILE) | 0;
    }
    cx(tx) {
      return (tx + 0.5) * TILE;
    }
    cy(ty) {
      return (ty + 0.5) * TILE;
    }

    // open for a ground unit, ignoring buildings
    openTile(tx, ty) {
      const i = this.idx(tx, ty);
      return i >= 0 && R.OPEN_BY_T[this.type[i]] === 1;
    }
    // open and nobody is standing there
    freeTile(tx, ty) {
      const i = this.idx(tx, ty);
      return i >= 0 && R.OPEN_BY_T[this.type[i]] === 1 && this.occ[i] === 0;
    }
    // water for ships
    seaTile(tx, ty) {
      const i = this.idx(tx, ty);
      return i >= 0 && this.type[i] === T.WATER;
    }
    openAt(x, y) {
      return this.openTile((x / TILE) | 0, (y / TILE) | 0);
    }
    speedAt(x, y) {
      const i = this.at(x, y);
      return i < 0 ? 0 : R.SPEED_BY_T[this.type[i]];
    }

    // can a building of `size` tiles have its top-left at (tx, ty)?
    canBuild(tx, ty, size, opts) {
      opts = opts || {};
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) {
          const i = this.idx(tx + dx, ty + dy);
          if (i < 0) return false;
          const t = this.type[i];
          if (opts.water) {
            if (t !== T.WATER) return false;
          } else {
            if (t === T.ROCK || t === T.WATER) return false;
          }
          if (this.occ[i] !== 0) return false;
        }
      return true;
    }

    markBuilding(tx, ty, size, id) {
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) {
          const i = this.idx(tx + dx, ty + dy);
          if (i >= 0) this.occ[i] = id;
        }
      this.version++;
    }
    clearBuilding(tx, ty, size) {
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) {
          const i = this.idx(tx + dx, ty + dy);
          if (i >= 0) this.occ[i] = 0;
        }
      this.version++;
    }

    // the nearest spot a building of this size could go, searched outward
    findSpot(tx, ty, size, maxR, opts) {
      if (this.canBuild(tx, ty, size, opts)) return { tx, ty };
      for (let r = 1; r <= (maxR || 18); r++) {
        const n = Math.max(8, r * 6);
        for (let k = 0; k < n; k++) {
          const an = (k / n) * R.TAU + r * 0.7;
          const x = Math.round(tx + Math.cos(an) * r);
          const y = Math.round(ty + Math.sin(an) * r);
          if (this.canBuild(x, y, size, opts)) return { tx: x, ty: y };
        }
      }
      return null;
    }

    // is this tile inside territory owned by faction f (or nobody)?
    claim(tx, ty, f) {
      const i = this.idx(tx, ty);
      if (i < 0) return -1;
      this.owner[i] = f;
    }
    ownerAt(x, y) {
      const i = this.at(x, y);
      return i < 0 ? -1 : this.owner[i];
    }
  }

  R.Terrain = Terrain;
})();
