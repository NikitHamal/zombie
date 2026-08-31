/* SANDSTORM — the renderer.

   Draws the world in painter order, back to front:

     ground  ->  territory  ->  settlement rings  ->  decor  ->  wrecks
     ->  buildings and units (y-sorted together)  ->  shots  ->  smoke
     ->  tracers  ->  order markers  ->  selection and health  ->  fog
     ->  the placement ghost  ->  night wash  ->  screen-space overlay

   Three things keep a 300x300-tile map at 60fps:

   GROUND CHUNKS. The desert is baked into 16x16-tile canvases on demand
   and kept in an LRU. A chunk is only ever redrawn when the map changes
   under it (you built something), which is rare.

   TWO TIERS. Zoomed out past 0.5 the ground is drawn from a single
   750x750 overview canvas instead — one blit instead of thirty. The decor
   still draws crisply on top, which is what your eye actually reads.

   FOG ON A TILE GRID. Fog and territory live on one 300x300 offscreen
   canvas, rewritten only when the fog is recomputed (a few times a
   second) and scaled up with smoothing, so the edge of what you can see
   is soft instead of a staircase.

   Nothing here allocates per frame: the draw list, the chunk map and the
   overlay canvas are all created once. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE,
    MAPW = R.MAPW,
    MAPH = R.MAPH;
  const T = R.T;
  const PAL = R.PAL;

  /* ---------- tunables ---------- */

  const CHUNK = 16; // tiles per chunk edge
  const CHUNK_PX = CHUNK * TILE; // world units per chunk edge
  const CHUNK_MAX = 40; // LRU size (~40 * 640 * 640 * 4B = 65MB worst case)
  const OVERVIEW_AT = 0.5; // zoom below which the overview takes over
  const DECOR_SKIP = 0.34; // zoom below which decor stops drawing

  /* ---------- state ---------- */

  const chunks = new Map(); // "cx,cy" -> {cv, dirty}
  let overlayCv = null,
    overlayCtx = null,
    overlayT = -1;
  const list = []; // the y-sorted draw list, reused
  let listN = 0;
  let lastZoomTier = -1;

  /* ==================================================================
     ground chunks
     ================================================================== */

  function chunkKey(cx, cy) {
    return cx * 1000 + cy;
  }

  // mark the chunks under a world rect dirty (a building went up)
  function dirtyRect(x0, y0, x1, y1) {
    const cx0 = ((x0 / CHUNK_PX) | 0) - 1,
      cx1 = ((x1 / CHUNK_PX) | 0) + 1;
    const cy0 = ((y0 / CHUNK_PX) | 0) - 1,
      cy1 = ((y1 / CHUNK_PX) | 0) + 1;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = chunks.get(chunkKey(cx, cy));
        if (c) c.dirty = true;
      }
  }

  function bakeChunk(g, cx, cy) {
    let c = chunks.get(chunkKey(cx, cy));
    if (!c) {
      if (chunks.size >= CHUNK_MAX) {
        // evict the oldest touched chunk
        let oldest = null,
          ok = null;
        for (const [k, v] of chunks)
          if (!oldest || v.t < oldest.t) {
            oldest = v;
            ok = k;
          }
        if (ok !== null) chunks.delete(ok);
      }
      const cv = document.createElement("canvas");
      cv.width = CHUNK_PX;
      cv.height = CHUNK_PX;
      c = { cv, ctx: cv.getContext("2d"), dirty: true, t: 0 };
      chunks.set(chunkKey(cx, cy), c);
    }
    if (!c.dirty) return c;
    c.dirty = false;
    c.t = g.time;

    const ctx = c.ctx;
    const t = g.t;
    ctx.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
    const tx0 = cx * CHUNK,
      ty0 = cy * CHUNK;

    for (let ty = ty0; ty < ty0 + CHUNK; ty++) {
      if (ty < 0 || ty >= MAPH) continue;
      for (let tx = tx0; tx < tx0 + CHUNK; tx++) {
        if (tx < 0 || tx >= MAPW) continue;
        const i = ty * MAPW + tx;
        const k = t.type[i];
        const sh = 0.84 + (t.shade[i] / 255) * 0.3;
        let col;
        if (k === T.WATER) col = PAL.water;
        else if (k === T.ROCK) col = PAL.rock;
        else if (k === T.SCRUB) col = PAL.scrub;
        else if (k === T.ROAD) col = PAL.road;
        else if (k === T.OIL) col = PAL.sand;
        else if (k === T.FIRM) col = PAL.firm;
        else col = PAL.sand;
        // water gets deeper as it goes south, so the sea reads as a sea
        let deep = 1;
        if (k === T.WATER) deep = 0.86 + (ty / MAPH) * 0.2;
        ctx.fillStyle =
          "rgb(" +
          R.clamp(col[0] * sh * deep, 0, 255).toFixed(0) +
          "," +
          R.clamp(col[1] * sh * deep, 0, 255).toFixed(0) +
          "," +
          R.clamp(col[2] * sh * deep, 0, 255).toFixed(0) +
          ")";
        ctx.fillRect((tx - tx0) * TILE, (ty - ty0) * TILE, TILE + 1, TILE + 1);
      }
    }

    /* --- the ink pass: dune crests, ridge hatching, water ripples ---
       This is what makes the ground read as drawn rather than printed. */
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let ty = ty0; ty < ty0 + CHUNK; ty++) {
      if (ty < 0 || ty >= MAPH) continue;
      for (let tx = tx0; tx < tx0 + CHUNK; tx++) {
        if (tx < 0 || tx >= MAPW) continue;
        const i = ty * MAPW + tx;
        const k = t.type[i];
        const px = (tx - tx0) * TILE,
          py = (ty - ty0) * TILE;
        const h = R.hash2(tx, ty, t.seed + 4242);

        if (k === T.ROCK) {
          // a mesa: hatch the face, and cap it with a hard crest
          ctx.strokeStyle = "rgba(112,96,74,0.55)";
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(px + 5, py + TILE - 4);
          ctx.lineTo(px + TILE - 6, py + 5);
          ctx.stroke();
          const up = ty > 0 && t.type[i - MAPW] !== T.ROCK;
          if (up) {
            ctx.strokeStyle = "rgba(88,76,58,0.85)";
            ctx.lineWidth = 2.1;
            ctx.beginPath();
            ctx.moveTo(px, py + 2);
            ctx.lineTo(px + TILE, py + 1);
            ctx.stroke();
          }
        } else if (k === T.WATER) {
          // two short ripples, offset by the hash so it never looks tiled
          ctx.strokeStyle = "rgba(72,108,132,0.42)";
          ctx.lineWidth = 1.5;
          const yy = py + TILE * (0.3 + h * 0.4);
          ctx.beginPath();
          ctx.moveTo(px + 6 + h * 8, yy);
          ctx.lineTo(px + 6 + h * 8 + 14 + h * 10, yy);
          ctx.stroke();
        } else if (k === T.SCRUB) {
          // a tuft, not a tree: three flicks and a shadow
          ctx.strokeStyle = "rgba(96,108,64,0.6)";
          ctx.lineWidth = 1.4;
          const bx = px + TILE * (0.28 + h * 0.44),
            by = py + TILE * (0.34 + R.hash2(tx, ty, t.seed + 9) * 0.34);
          for (let s = 0; s < 3; s++) {
            const an = -1.9 + s * 0.62 + h * 0.4;
            ctx.beginPath();
            ctx.moveTo(bx, by + 3);
            ctx.lineTo(bx + Math.cos(an) * 7, by + Math.sin(an) * 7 + 3);
            ctx.stroke();
          }
        } else if (k === T.ROAD) {
          // a dashed centre line, only where the road runs straight
          const horiz = t.type[i - 1] === T.ROAD && t.type[i + 1] === T.ROAD;
          const vert = ty > 0 && t.type[i - MAPW] === T.ROAD && t.type[i + MAPW] === T.ROAD;
          ctx.strokeStyle = "rgba(160,142,106,0.5)";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          if (horiz && !vert) {
            ctx.moveTo(px, py + TILE / 2);
            ctx.lineTo(px + TILE * 0.55, py + TILE / 2);
          } else if (vert && !horiz) {
            ctx.moveTo(px + TILE / 2, py);
            ctx.lineTo(px + TILE / 2, py + TILE * 0.55);
          }
          ctx.stroke();
        } else if (k === T.OIL) {
          // a natural hand-drawn sketch oil pool
          ctx.fillStyle = "rgba(50,42,32,0.65)";
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, TILE * 0.38, 0, R.TAU);
          ctx.fill();
          ctx.strokeStyle = "rgba(60,50,38,0.75)";
          ctx.lineWidth = 1.4;
          ZS.wcirc(ctx, px + TILE / 2, py + TILE / 2, TILE * 0.38, t.seed + i, 1.2);
        } else if (k === T.SAND) {
          // dune crest: one long wobbly line following the shade gradient
          const hr = R.hash2(tx, ty, t.seed + 77);
          if (hr > 0.82) {
            ctx.strokeStyle = "rgba(150,134,102,0.3)";
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(px + 2, py + TILE * (0.3 + hr * 0.3));
            ctx.quadraticCurveTo(
              px + TILE * 0.5,
              py + TILE * (0.1 + hr * 0.3),
              px + TILE - 2,
              py + TILE * (0.4 + hr * 0.3),
            );
            ctx.stroke();
          }
        }
      }
    }
    return c;
  }

  /* ==================================================================
     the fog + territory overlay (one tile per pixel)
     ================================================================== */

  function ensureOverlay() {
    if (overlayCv) return;
    overlayCv = document.createElement("canvas");
    overlayCv.width = MAPW;
    overlayCv.height = MAPH;
    overlayCtx = overlayCv.getContext("2d");
  }

  function bakeOverlay(g) {
    ensureOverlay();
    const c = overlayCtx;
    const img = c.createImageData(MAPW, MAPH);
    const d = img.data;
    const t = g.t;
    const vis = t.vis;
    for (let i = 0; i < MAPW * MAPH; i++) {
      const o = i * 4;
      const ow = t.owner[i];
      const v = vis[i];

      // --- territory: a faint wash in the owner's ink ---
      let r = 0,
        gr = 0,
        b = 0,
        a = 0;
      if (ow >= 0 && (Render.showFog ? v > 0 : true)) {
        const ink = R.FACTIONS[ow].ink;
        r = ink[0];
        gr = ink[1];
        b = ink[2];
        a = ow === 0 ? 24 : 18;
      }
      if (Render.showFog) {
        if (v === 0) {
          r = 40;
          gr = 34;
          b = 28;
          a = 150;
        } else if (v === 1) {
          a = Math.max(a, 35);
        }
      }
      d[o] = r;
      d[o + 1] = gr;
      d[o + 2] = b;
      d[o + 3] = a;
    }
    c.putImageData(img, 0, 0);
    overlayT = g.time;
  }

  /* ==================================================================
     small drawing helpers
     ================================================================== */

  // a health bar that does not get wider than the thing it belongs to
  function bar(c, x, y, w, h, f, col, back) {
    c.fillStyle = back || "rgba(52,45,37,0.55)";
    c.fillRect(x, y, w, h);
    c.fillStyle = col;
    c.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * f), h - 2);
  }

  function hpCol(f) {
    if (f > 0.66) return "#5d8a4a";
    if (f > 0.33) return "#b8902e";
    return "#a84a38";
  }

  /* ==================================================================
     the frame
     ================================================================== */

  const Render = {
    showFog: false,
    showTerritory: false,
    showGrid: false,
    ghost: null, // {key, tx, ty, ok, reason}
    box: null, // {x0,y0,x1,y1} screen-space selection box
    hover: null, // entity under the cursor

    init() {
      ensureOverlay();
      return this;
    },

    // a building went up or came down: the ground under it changed
    invalidate(x0, y0, x1, y1) {
      dirtyRect(x0, y0, x1, y1);
    },

    frame(g, cam, dt, vw, vh) {
      const c = g.ctx;
      const t = g.t;
      const zoom = cam.zoom;
      const view = cam.visible(vw, vh, 80);
      const sh = R.Cam.shakeOffset();
      const dpr = (g.app && g.app.dpr) || window.devicePixelRatio || 1;

      /* ---- clear to page ---- */
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = PAL.pageDark;
      c.fillRect(0, 0, vw, vh);

      c.save();
      cam.apply(c, vw, vh);
      if (sh) c.translate(sh.x / zoom, sh.y / zoom);

      const zoomTier = zoom >= OVERVIEW_AT ? 1 : 0;
      if (zoomTier !== lastZoomTier) {
        lastZoomTier = zoomTier;
        R.Sprites.setLOD(zoom > 1.1 ? 2 : zoom > 0.5 ? 1 : 0);
      }

      /* ---- 1. ground ---- */
      if (zoomTier === 1) {
        const cx0 = Math.floor(view.x0 / CHUNK_PX),
          cx1 = Math.floor(view.x1 / CHUNK_PX);
        const cy0 = Math.floor(view.y0 / CHUNK_PX),
          cy1 = Math.floor(view.y1 / CHUNK_PX);
        for (let cy = cy0; cy <= cy1; cy++)
          for (let cx = cx0; cx <= cx1; cx++) {
            if (cx < 0 || cy < 0 || cx * CHUNK >= MAPW || cy * CHUNK >= MAPH) continue;
            const ch = bakeChunk(g, cx, cy);
            c.drawImage(ch.cv, cx * CHUNK_PX, cy * CHUNK_PX);
          }
      } else if (t.overview) {
        c.imageSmoothingEnabled = true;
        c.drawImage(t.overview, 0, 0, R.W, R.H);
      }

      /* ---- 2. tile grid (a readability aid, off by default) ---- */
      if (this.showGrid && zoom > 0.7) {
        c.strokeStyle = "rgba(90,78,60,0.13)";
        c.lineWidth = 1 / zoom;
        const gx0 = Math.max(0, (view.x0 / TILE) | 0),
          gx1 = Math.min(MAPW, ((view.x1 / TILE) | 0) + 1);
        const gy0 = Math.max(0, (view.y0 / TILE) | 0),
          gy1 = Math.min(MAPH, ((view.y1 / TILE) | 0) + 1);
        c.beginPath();
        for (let x = gx0; x <= gx1; x++) {
          c.moveTo(x * TILE, view.y0);
          c.lineTo(x * TILE, view.y1);
        }
        for (let y = gy0; y <= gy1; y++) {
          c.moveTo(view.x0, y * TILE);
          c.lineTo(view.x1, y * TILE);
        }
        c.stroke();
      }

      /* ---- 3. territory + fog overlay (disabled for clean paper style) ---- */
      if (this.showFog) {
        if (overlayT < 0 || g.time - overlayT > 0.25) bakeOverlay(g);
        c.imageSmoothingEnabled = true;
        c.globalAlpha = 1;
        c.drawImage(overlayCv, 0, 0, R.W, R.H);
      }

      /* ---- 4. settlement rings ---- */
      this.drawSites(g, c, view, zoom);

      /* ---- 5. decor ---- */
      if (zoom > DECOR_SKIP) this.drawDecor(g, c, view, zoom);

      /* ---- 6. wrecks ---- */
      for (const w of R.FX.wrecks) {
        if (w.x < view.x0 - 40 || w.x > view.x1 + 40 || w.y < view.y0 - 40 || w.y > view.y1 + 40)
          continue;
        if (this.showFog && g.visible(w.x, w.y) === 0) continue;
        R.Sprites.wreck(c, w, g.time);
      }

      /* ---- 7. the y-sorted draw list ---- */
      listN = 0;
      for (const b of g.buildings) {
        if (b.dead) continue;
        if (
          b.x < view.x0 - 200 ||
          b.x > view.x1 + 200 ||
          b.y < view.y0 - 200 ||
          b.y > view.y1 + 200
        )
          continue;
        if (this.showFog && b.fac !== 0 && g.visible(b.x, b.y) === 0) continue;
        list[listN++] = b;
      }
      for (const u of g.units) {
        if (u.dead || u.inside) continue;
        if (
          u.x < view.x0 - 120 ||
          u.x > view.x1 + 120 ||
          u.y < view.y0 - 200 ||
          u.y > view.y1 + 200
        )
          continue;
        // a unit you cannot see is not drawn — that is the whole point
        if (this.showFog && u.fac !== 0 && !g.visibleNow(u.x, u.y)) continue;
        list[listN++] = u;
      }
      list.length = listN;
      list.sort(byY);
      for (let i = 0; i < listN; i++) {
        const e = list[i];
        if (e.kind === "b") {
          c.save();
          R.Sprites.building(c, e, g.time, g);
          c.restore();
        } else {
          c.save();
          R.Sprites.unit(c, e, g.time, g);
          c.restore();
        }
      }

      /* ---- 8. rally points and order lines ---- */
      this.drawOrders(g, c);

      /* ---- 9. shots ---- */
      this.drawShots(g, c, view);

      /* ---- 10. particles ---- */
      this.drawParticles(g, c, view);

      /* ---- 11. order/alert markers ---- */
      this.drawMarkers(g, c, view);

      /* ---- 12. selection rings and health bars ---- */
      this.drawChrome(g, c, view, zoom);

      /* ---- 13. the placement ghost ---- */
      if (this.ghost) {
        R.Sprites.ghost(c, this.ghost.key, this.ghost.tx, this.ghost.ty, this.ghost.ok, g);
      }

      /* ---- 14. the attack-line from a selected unit to its target ---- */
      this.drawTargetLines(g, c);

      c.restore();

      /* ---- 15. the selection box (screen space) ---- */
      if (this.box) {
        const b = this.box;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const x = Math.min(b.x0, b.x1),
          y = Math.min(b.y0, b.y1);
        const w = Math.abs(b.x1 - b.x0),
          h = Math.abs(b.y1 - b.y0);
        c.fillStyle = "rgba(90,124,60,0.13)";
        c.fillRect(x, y, w, h);
        c.strokeStyle = "rgba(74,102,52,0.9)";
        c.lineWidth = 1.4;
        c.setLineDash([6, 4]);
        c.strokeRect(x + 0.5, y + 0.5, w, h);
        c.setLineDash([]);
      }
    },

    /* ---------- settlement rings ---------- */

    drawSites(g, c, view, zoom) {
      const t = g.t;
      for (const s of t.sites) {
        if (
          s.x < view.x0 - 400 ||
          s.x > view.x1 + 400 ||
          s.y < view.y0 - 400 ||
          s.y > view.y1 + 400
        )
          continue;
        if (this.showFog && g.visible(s.x, s.y) === 0) continue;
        const r = (s.r + (s.tier - 1) * 3) * TILE;
        const owned = s.owner >= 0;
        const col = owned ? R.factionTint[s.owner] : "rgba(120,108,88,1)";
        c.save();
        // the territory disc: a soft wash inside the ring
        c.globalAlpha = owned ? 0.07 : 0.04;
        c.fillStyle = col;
        c.beginPath();
        c.arc(s.x, s.y, r, 0, R.TAU);
        c.fill();
        c.globalAlpha = 0.75;
        c.strokeStyle = col;
        c.lineWidth = 2.2 / Math.max(1, zoom * 0.9);
        c.setLineDash([14, 10]);
        c.beginPath();
        c.arc(s.x, s.y, r, 0, R.TAU);
        c.stroke();
        c.setLineDash([]);
        c.restore();

        // the name and the owner, big enough to read when zoomed out
        if (zoom > 0.32) {
          c.save();
          const fs = Math.max(11, 15 / Math.max(0.7, zoom));
          c.font = "600 " + fs + "px ui-sans-serif, system-ui, sans-serif";
          c.textAlign = "center";
          c.fillStyle = "rgba(58,50,42,0.72)";
          c.fillText(s.name, s.x, s.y - r + fs * 1.5);
          if (owned) {
            c.fillStyle = col;
            c.fillText(
              R.FACTIONS[s.owner].short +
                " · " +
                (R.BASE_TYPES[s.kind] ? R.BASE_TYPES[s.kind].name : "ground") +
                (s.open ? " — OPEN" : ""),
              s.x,
              s.y - r + fs * 2.9,
            );
          } else {
            c.fillStyle = "rgba(96,86,70,0.7)";
            c.fillText(
              "UNCLAIMED" + (R.BASE_TYPES[s.kind] ? " · " + R.BASE_TYPES[s.kind].name : ""),
              s.x,
              s.y - r + fs * 2.9,
            );
          }
          c.restore();
        }
      }
    },

    /* ---------- decor ---------- */

    drawDecor(g, c, view, zoom) {
      const d = g.t.decor;
      if (!d) return;
      const n = d.n;
      const lod = zoom > 0.9 ? 1 : 0;
      c.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const x = d.x[i],
          y = d.y[i];
        if (x < view.x0 - 30 || x > view.x1 + 30 || y < view.y0 - 30 || y > view.y1 + 30) continue;
        if (this.showFog && g.visible(x, y) === 0) continue;
        const k = d.k[i],
          s = d.s[i];
        const sc = d.r[i];
        switch (k) {
          case 0: // ripple: two short arcs in the sand
            c.strokeStyle = "rgba(158,142,110,0.4)";
            c.lineWidth = 1.1;
            c.beginPath();
            c.arc(x, y, 6 * sc, 0.2, 1.5);
            c.stroke();
            if (lod) {
              c.beginPath();
              c.arc(x + 3, y + 4, 9 * sc, 0.4, 1.9);
              c.stroke();
            }
            break;
          case 1: // pebble
            c.fillStyle = "rgba(138,124,98,0.55)";
            c.beginPath();
            c.ellipse(x, y, 2.4 * sc, 1.6 * sc, s * 3, 0, R.TAU);
            c.fill();
            break;
          case 2: // bush
            c.fillStyle = "rgba(118,128,74,0.5)";
            c.beginPath();
            c.arc(x, y, 5.5 * sc, 0, R.TAU);
            c.fill();
            if (lod) {
              c.strokeStyle = "rgba(86,98,54,0.6)";
              c.lineWidth = 1.2;
              for (let q = 0; q < 4; q++) {
                const an = s * 6 + q * 1.57;
                c.beginPath();
                c.moveTo(x, y);
                c.lineTo(x + Math.cos(an) * 7 * sc, y + Math.sin(an) * 5 * sc);
                c.stroke();
              }
            }
            break;
          case 3: // rock chunk: a little drawn boulder with a shadow side
            c.fillStyle = "rgba(154,138,110,0.72)";
            c.beginPath();
            c.moveTo(x - 6 * sc, y + 3 * sc);
            c.lineTo(x - 2 * sc, y - 5 * sc);
            c.lineTo(x + 5 * sc, y - 3 * sc);
            c.lineTo(x + 7 * sc, y + 3 * sc);
            c.closePath();
            c.fill();
            if (lod) {
              c.strokeStyle = "rgba(96,84,64,0.7)";
              c.lineWidth = 1.2;
              c.stroke();
              c.strokeStyle = "rgba(96,84,64,0.4)";
              c.beginPath();
              c.moveTo(x + 1 * sc, y - 3 * sc);
              c.lineTo(x + 2 * sc, y + 2 * sc);
              c.stroke();
            }
            break;
          case 5: // palm: a leaning trunk and six fronds
            c.strokeStyle = "rgba(112,96,70,0.75)";
            c.lineWidth = 2.4 * sc;
            c.beginPath();
            c.moveTo(x, y + 6);
            c.quadraticCurveTo(x + 3 * (s - 0.5) * 8, y - 8, x + 5 * (s - 0.5) * 8, y - 20 * sc);
            c.stroke();
            c.strokeStyle = "rgba(96,116,58,0.72)";
            c.lineWidth = 2;
            const tx = x + 5 * (s - 0.5) * 8,
              ty = y - 20 * sc;
            for (let q = 0; q < 6; q++) {
              const an = (q / 6) * R.TAU + s;
              c.beginPath();
              c.moveTo(tx, ty);
              c.quadraticCurveTo(
                tx + Math.cos(an) * 9,
                ty + Math.sin(an) * 6 - 3,
                tx + Math.cos(an) * 15,
                ty + Math.sin(an) * 8 + 3,
              );
              c.stroke();
            }
            break;
          case 6: // tyre tracks
            c.strokeStyle = "rgba(140,124,96,0.3)";
            c.lineWidth = 1.6;
            c.beginPath();
            c.moveTo(x - 10, y - 3);
            c.lineTo(x + 10, y + 3);
            c.stroke();
            break;
          case 7: // an old wreck by the road
            c.save();
            c.translate(x, y);
            c.rotate(s * R.TAU);
            c.fillStyle = "rgba(132,118,96,0.62)";
            c.beginPath();
            c.moveTo(-13, -6);
            c.lineTo(9, -8);
            c.lineTo(13, 5);
            c.lineTo(-10, 7);
            c.closePath();
            c.fill();
            c.strokeStyle = "rgba(78,68,54,0.75)";
            c.lineWidth = 1.4;
            c.stroke();
            c.restore();
            break;
        }
      }
    },

    /* ---------- orders, rally points ---------- */

    drawOrders(g, c) {
      c.save();
      c.lineWidth = 1.6;
      // rally points on selected (or hovered) production buildings
      for (const b of g.buildings) {
        if (b.dead || !b.rally || !b.built) continue;
        if (b.fac !== 0) continue;
        c.strokeStyle = "rgba(74,102,52,0.5)";
        c.setLineDash([8, 6]);
        c.beginPath();
        c.moveTo(b.x, b.y);
        c.lineTo(b.rally.x, b.rally.y);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = "rgba(74,102,52,0.75)";
        c.beginPath();
        c.arc(b.rally.x, b.rally.y, 5, 0, R.TAU);
        c.fill();
      }

      /* ---- shift-queued waypoints ----
         A unit with orders stacked behind it draws a dashed chain from
         where it is, through what it is doing now, to each waypoint in
         turn. Small hollow pips, so they read as "planned" rather than
         "happening". */
      for (let i = 0; i < listN; i++) {
        const e = list[i];
        if (!e.sel || e.kind !== "u" || !e.q || !e.q.length) continue;
        c.strokeStyle = "rgba(74,102,52,0.55)";
        c.lineWidth = 1.3;
        c.setLineDash([5, 5]);
        c.beginPath();
        c.moveTo(e.x, e.y);
        if (e.order && e.order.x !== undefined) c.lineTo(e.order.x, e.order.y);
        for (let k = 0; k < e.q.length; k++) {
          const q = e.q[k];
          if (q.x === undefined) continue;
          c.lineTo(q.x, q.y);
        }
        c.stroke();
        c.setLineDash([]);
        // the pips
        c.fillStyle = "rgba(74,102,52,0.8)";
        for (let k = 0; k < e.q.length; k++) {
          const q = e.q[k];
          if (q.x === undefined) continue;
          c.beginPath();
          c.arc(q.x, q.y, 3.2, 0, R.TAU);
          c.fill();
        }
      }
      c.restore();
    },

    /* ---------- shots ---------- */

    drawShots(g, c, view) {
      c.save();
      c.lineCap = "round";
      for (const s of g.shots) {
        if (s.x < view.x0 - 60 || s.x > view.x1 + 60 || s.y < view.y0 - 60 || s.y > view.y1 + 60)
          continue;
        if (this.showFog && s.fac !== 0 && g.visible(s.x, s.y) === 0) continue;
        const w = s.w;
        // the shadow of a shell in flight: how high it is
        const lift = (s.z || 0) * 0.55;
        const x = s.x,
          y = s.y - lift;
        if (w.kind === "bullet") {
          c.strokeStyle = "rgba(214,150,60,0.85)";
          c.lineWidth = 1.6;
          c.beginPath();
          c.moveTo(x - s.vx * 0.016, y - s.vy * 0.016);
          c.lineTo(x, y);
          c.stroke();
        } else if (w.kind === "missile") {
          c.strokeStyle = "rgba(70,64,56,0.9)";
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(x - Math.cos(s.a) * 9, y - Math.sin(s.a) * 9);
          c.lineTo(x, y);
          c.stroke();
          c.fillStyle = "rgba(214,122,52,0.9)";
          c.beginPath();
          c.arc(x + Math.cos(s.a) * 5, y + Math.sin(s.a) * 5, 2, 0, R.TAU);
          c.fill();
        } else if (w.kind === "bomb") {
          c.fillStyle = "rgba(58,52,44,0.9)";
          c.beginPath();
          c.ellipse(x, y, 4, 7, 0, 0, R.TAU);
          c.fill();
        } else if (w.kind === "torp") {
          c.strokeStyle = "rgba(120,132,124,0.8)";
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(x - s.vx * 0.03, y - s.vy * 0.03);
          c.lineTo(x, y);
          c.stroke();
        } else {
          // shell / rocket / grenade: a short dark streak with a hot head
          c.strokeStyle = "rgba(58,52,44,0.85)";
          c.lineWidth = w.kind === "shell" ? 4 : 3;
          c.beginPath();
          c.moveTo(x - s.vx * 0.02, y - s.vy * 0.02);
          c.lineTo(x, y);
          c.stroke();
          c.fillStyle = "rgba(226,140,58,0.9)";
          c.beginPath();
          c.arc(x, y, 2.2, 0, R.TAU);
          c.fill();
        }
        // the ground shadow of anything airborne
        if (lift > 6) {
          c.fillStyle = "rgba(60,52,42,0.18)";
          c.beginPath();
          c.ellipse(s.x, s.y, 5, 2.5, 0, 0, R.TAU);
          c.fill();
        }
      }
      c.restore();
    },

    /* ---------- particles ---------- */

    drawParticles(g, c, view) {
      const P = R.FX.parts;
      c.save();
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (!p.on) continue;
        if (p.x < view.x0 - 40 || p.x > view.x1 + 40 || p.y < view.y0 - 60 || p.y > view.y1 + 40)
          continue;
        const f = p.life / p.max;
        const y = p.y - p.z * 0.55;
        switch (p.k) {
          case 0: // dust
            c.fillStyle = "rgba(186,170,138," + (0.34 * f).toFixed(3) + ")";
            c.beginPath();
            c.arc(p.x, y, p.s * (5 + (1 - f) * 7), 0, R.TAU);
            c.fill();
            break;
          case 1: // smoke
            c.fillStyle = "rgba(126,118,106," + (0.3 * f).toFixed(3) + ")";
            c.beginPath();
            c.arc(p.x, y, p.s * (7 + (1 - f) * 13), 0, R.TAU);
            c.fill();
            break;
          case 2: // ember / flash
            c.fillStyle =
              "rgba(" +
              (226 - f * 40).toFixed(0) +
              "," +
              (140 * f + 60).toFixed(0) +
              ",52," +
              (0.85 * f).toFixed(3) +
              ")";
            c.beginPath();
            c.arc(p.x, y, p.s * (2 + f * 4), 0, R.TAU);
            c.fill();
            break;
          case 3: // spark
            c.strokeStyle = "rgba(232,180,90," + (0.9 * f).toFixed(3) + ")";
            c.lineWidth = 1.4;
            c.beginPath();
            c.moveTo(p.x, y);
            c.lineTo(p.x - p.vx * 0.02, y - p.vy * 0.02);
            c.stroke();
            break;
          case 4: // chunk of something
            c.save();
            c.translate(p.x, y);
            c.rotate(p.r);
            c.fillStyle = "rgba(104,92,76,0.85)";
            c.fillRect(-p.s * 2.5, -p.s * 1.6, p.s * 5, p.s * 3.2);
            c.restore();
            break;
          case 5: // blood — the Rot bleeds, and so does infantry
            c.fillStyle = "rgba(148,74,58," + (0.7 * f).toFixed(3) + ")";
            c.beginPath();
            c.arc(p.x, y, p.s * 2.6 * f, 0, R.TAU);
            c.fill();
            break;
          case 6: // wake
            c.strokeStyle = "rgba(216,228,234," + (0.5 * f).toFixed(3) + ")";
            c.lineWidth = 1.6;
            c.beginPath();
            c.arc(p.x, y, p.s * (4 + (1 - f) * 9), 0, R.TAU);
            c.stroke();
            break;
        }
      }
      c.restore();

      /* --- tracers --- */
      const TR = R.FX.tracers;
      c.save();
      c.lineCap = "round";
      for (let i = 0; i < TR.length; i++) {
        const t = TR[i];
        if (!t.on) continue;
        const f = t.life / t.max;
        if (t.big === 2) {
          // a claw slash
          c.strokeStyle = "rgba(150,86,120," + (0.8 * f).toFixed(3) + ")";
          c.lineWidth = 2.4;
        } else if (t.big === 1) {
          c.strokeStyle = "rgba(232,164,74," + (0.9 * f).toFixed(3) + ")";
          c.lineWidth = 2.6;
        } else {
          c.strokeStyle = "rgba(236,186,96," + (0.75 * f).toFixed(3) + ")";
          c.lineWidth = 1.3;
        }
        c.beginPath();
        c.moveTo(t.x1, t.y1);
        c.lineTo(t.x2, t.y2);
        c.stroke();
      }
      c.restore();
    },

    /* ---------- order markers, pings, scorches ---------- */

    drawMarkers(g, c, view) {
      c.save();
      for (const m of R.FX.markers) {
        if (m.x < view.x0 - 80 || m.x > view.x1 + 80 || m.y < view.y0 - 80 || m.y > view.y1 + 80)
          continue;
        const f = 1 - m.t / m.life;
        if (m.type === "scorch") {
          c.globalAlpha = 0.16 * Math.min(1, f * 2.2);
          c.fillStyle = "#4a4034";
          c.beginPath();
          c.arc(m.x, m.y, m.r * (0.8 + (1 - f) * 0.25), 0, R.TAU);
          c.fill();
          c.globalAlpha = 1;
        } else if (m.type === "attack") {
          c.strokeStyle = "rgba(178,68,48," + (0.9 * f).toFixed(3) + ")";
          c.lineWidth = 2.4;
          const r = 8 + (1 - f) * 22;
          c.beginPath();
          c.arc(m.x, m.y, r, 0, R.TAU);
          c.stroke();
          c.beginPath();
          c.moveTo(m.x - 6, m.y - 6);
          c.lineTo(m.x + 6, m.y + 6);
          c.moveTo(m.x + 6, m.y - 6);
          c.lineTo(m.x - 6, m.y + 6);
          c.stroke();
        } else if (m.type === "ping") {
          const col =
            m.kind === "good"
              ? "rgba(86,132,64,"
              : m.kind === "bad"
                ? "rgba(172,64,52,"
                : "rgba(190,140,44,";
          c.strokeStyle = col + (0.9 * f).toFixed(3) + ")";
          c.lineWidth = 3;
          c.beginPath();
          c.arc(m.x, m.y, 14 + (1 - f) * 60, 0, R.TAU);
          c.stroke();
        } else {
          c.strokeStyle = "rgba(88,120,68," + (0.9 * f).toFixed(3) + ")";
          c.lineWidth = 2;
          c.beginPath();
          c.arc(m.x, m.y, 8 + (1 - f) * 18, 0, R.TAU);
          c.stroke();
        }
      }
      c.restore();
    },

    /* ---------- selection rings, health bars, build progress ---------- */

    drawChrome(g, c, view, zoom) {
      c.save();
      const k = 1 / Math.max(0.45, zoom); // keep chrome legible at any zoom
      for (let i = 0; i < listN; i++) {
        const e = list[i];
        const air = e.kind === "u" && e.def.cls === "air";
        const ay = e.y - (air ? (e.alt || 0) * 0.55 + 10 : 0);

        /* --- selection --- */
        if (e.sel) {
          const r = e.kind === "b" ? e.size * TILE * 0.56 : e.def.big ? 26 : 17;
          c.strokeStyle = "rgba(74,124,58,0.95)";
          c.lineWidth = 2.2 * k;
          c.beginPath();
          c.ellipse(e.x, e.y + (e.kind === "b" ? r * 0.5 : 3), r, r * 0.5, 0, 0, R.TAU);
          c.stroke();
          // four little ticks, so a selected unit reads at a glance
          c.lineWidth = 2.6 * k;
          for (let q = 0; q < 4; q++) {
            const an = q * 1.5708 + 0.7854;
            c.beginPath();
            c.moveTo(e.x + Math.cos(an) * r * 0.82, e.y + 3 + Math.sin(an) * r * 0.41);
            c.lineTo(e.x + Math.cos(an) * r * 1.24, e.y + 3 + Math.sin(an) * r * 0.62);
            c.stroke();
          }
        }

        /* --- faction dot: who this belongs to --- */
        if (e.kind === "u" && zoom > 0.45) {
          const dy = ay - (e.def.cls === "air" ? 0 : 22);
          c.fillStyle = R.factionTint[e.fac];
          c.globalAlpha = 0.9;
          c.beginPath();
          c.arc(e.x - (e.def.big ? 12 : 8) * k, dy, 2.6 * k, 0, R.TAU);
          c.fill();
          c.globalAlpha = 1;
        }

        /* --- health bar: only when hurt, or when selected --- */
        const hpf = R.clamp(e.hp / e.maxHp, 0, 1);
        const showHp = hpf < 0.999 || e.sel;
        if (showHp) {
          const w = (e.kind === "b" ? e.size * TILE * 0.8 : e.def.big ? 40 : 28) * k;
          const h = 4 * k;
          const y = ay - (e.kind === "b" ? e.size * TILE * 0.55 : 30 * k);
          c.save();
          bar(c, e.x - w / 2, y, w, h, hpf, hpCol(hpf));
          c.restore();
        }

        /* --- build / upgrade progress --- */
        if (e.kind === "b" && (!e.built || e.upgrading)) {
          const w = e.size * TILE * 0.8;
          const f = e.built
            ? 1 - e.upT / Math.max(1, e.upTotal)
            : 1 - e.buildT / Math.max(1, e.buildTotal);
          const y = e.y - e.size * TILE * 0.62;
          bar(
            c,
            e.x - w / 2,
            y - 7,
            w,
            6,
            f,
            e.upgrading ? "rgba(96,120,168,0.95)" : "rgba(190,150,60,0.95)",
          );
          c.save();
          c.font = "600 " + 11 * Math.max(1, k * 0.9) + "px ui-sans-serif, system-ui, sans-serif";
          c.textAlign = "center";
          c.fillStyle = "rgba(58,50,42,0.85)";
          const left = e.built ? e.upT : e.buildT;
          c.fillText((e.upgrading ? "LVL " + (e.lvl + 1) + "  " : "") + R.mmss(left), e.x, y - 10);
          c.restore();
        }

        /* --- a unit carrying something, or capturing a site --- */
        if (e.kind === "u") {
          if (e.capturing) {
            const f = R.clamp(e.capT / 8, 0, 1);
            const w = 34 * k;
            bar(c, e.x - w / 2, ay - 40 * k, w, 5 * k, f, "rgba(96,120,168,0.95)");
            c.save();
            c.font = "600 " + 10 * Math.max(1, k) + "px ui-sans-serif, system-ui, sans-serif";
            c.textAlign = "center";
            c.fillStyle = "rgba(58,50,42,0.9)";
            c.fillText("CLAIMING", e.x, ay - 43 * k);
            c.restore();
          }
          if (e.carry && e.carry.length) {
            c.fillStyle = "rgba(74,102,52,0.9)";
            c.beginPath();
            c.arc(e.x + 10 * k, ay - 22 * k, 3 * k, 0, R.TAU);
            c.fill();
          }
        }

        /* --- a burning building --- */
        if (e.kind === "b" && e.hp / e.maxHp < 0.35 && Math.random() < 0.3)
          R.FX.ember(g, e.x + (Math.random() - 0.5) * e.size * TILE * 0.7, e.y);
      }
      c.restore();
    },

    /* ---------- the line from a selected unit to what it is shooting ---------- */

    drawTargetLines(g, c) {
      c.save();
      c.strokeStyle = "rgba(178,68,48,0.5)";
      c.lineWidth = 1.4;
      c.setLineDash([4, 5]);
      for (let i = 0; i < listN; i++) {
        const e = list[i];
        if (!e.sel || e.kind !== "u") continue;
        if (e.tgt && !e.tgt.dead) {
          c.beginPath();
          c.moveTo(e.x, e.y);
          c.lineTo(e.tgt.x, e.tgt.y);
          c.stroke();
        }
      }
      c.setLineDash([]);
      c.restore();
    },
  };

  function byY(a, b) {
    // ships sit on the water plane, aircraft float above everything
    const ay = a.kind === "u" && a.def.cls === "air" ? a.y + 4000 : a.y;
    const by = b.kind === "u" && b.def.cls === "air" ? b.y + 4000 : b.y;
    return ay - by;
  }

  R.Render = Render;
})();
