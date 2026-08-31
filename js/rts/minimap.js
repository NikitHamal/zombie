/* Desert Order — the minimap.

   The whole 300x300-tile map in a square in the corner, at roughly one
   pixel per tile. Three layers, only one of which is redrawn often:

     ground    baked once from the terrain overview
     territory + fog   rebaked twice a second (they change slowly)
     dots      drawn every frame — units, buildings, the camera rect

   Left-click or drag to move the camera; the view rectangle shows where
   you are. Pings (an attack on your base, a nest waking up) flash here so
   you notice them while you are looking at something else. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const MAPW = R.MAPW,
    MAPH = R.MAPH;

  let baseCv = null,
    terrCv = null;
  let terrT = -1;
  let size = 240;

  const Minimap = {
    canvas: null,
    ctx: null,
    dragging: false,
    // where the map sits on screen; the UI writes this after layout
    rect: { x: 0, y: 0, w: 240, h: 240 },

    mount(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.resize(canvas.clientWidth || 240);
      return this;
    },

    resize(px) {
      size = Math.max(140, Math.round(px));
      if (!this.canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(size * dpr);
      this.canvas.height = Math.round(size * dpr);
      this.canvas.style.width = size + "px";
      this.canvas.style.height = size + "px";
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.rect.w = size;
      this.rect.h = size;
      baseCv = null; // force a rebake at the new size
    },

    place(x, y) {
      this.rect.x = x;
      this.rect.y = y;
    },

    /* ---------- the baked layers ---------- */

    bakeBase(g) {
      if (baseCv && baseCv.width === size) return;
      baseCv = document.createElement("canvas");
      baseCv.width = size;
      baseCv.height = size;
      const c = baseCv.getContext("2d");
      // the terrain, lightly brightened so ink reads on top of it
      c.imageSmoothingEnabled = true;
      c.drawImage(g.t.overview, 0, 0, size, size);
      c.globalAlpha = 0.12;
      c.fillStyle = "#efe7d5";
      c.fillRect(0, 0, size, size);
      c.globalAlpha = 1;
    },

    bakeTerritory(g) {
      if (!terrCv) {
        terrCv = document.createElement("canvas");
        terrCv.width = size;
        terrCv.height = size;
      } else if (terrCv.width !== size) {
        terrCv.width = size;
        terrCv.height = size;
      }
      const c = terrCv.getContext("2d");
      c.clearRect(0, 0, size, size);
      const img = c.createImageData(size, size);
      const d = img.data;
      const t = g.t;
      const kx = MAPW / size,
        ky = MAPH / size;
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const i = ((py * ky) | 0) * MAPW + ((px * kx) | 0);
          const o = (py * size + px) * 4;
          const ow = t.owner[i];
          const v = t.vis[i];
          let r = 0,
            gg = 0,
            b = 0,
            a = 0;
          if (ow >= 0) {
            const ink = R.FACTIONS[ow].ink;
            r = ink[0];
            gg = ink[1];
            b = ink[2];
            a = 60;
          }
          if (R.Render.showFog) {
            if (v === 0) {
              r = 44;
              gg = 40;
              b = 34;
              a = 214;
            } else if (v === 1) {
              a = Math.max(a, 96);
              r = (r * 0.4 + 74 * 0.6) | 0;
              gg = (gg * 0.4 + 70 * 0.6) | 0;
              b = (b * 0.4 + 62 * 0.6) | 0;
            }
          }
          d[o] = r;
          d[o + 1] = gg;
          d[o + 2] = b;
          d[o + 3] = a;
        }
      }
      c.putImageData(img, 0, 0);
      terrT = g.time;
    },

    /* ---------- the frame ---------- */

    draw(g, cam, vw, vh) {
      if (!this.ctx || !this.canvas || !this.canvas.isConnected) return;
      vw = vw || window.innerWidth;
      vh = vh || window.innerHeight;
      const c = this.ctx;
      this.bakeBase(g);
      if (g.time - terrT > 0.4) this.bakeTerritory(g);

      const k = size / MAPW; // map tiles -> minimap px
      const k2 = size / R.W; // world units -> minimap px

      c.clearRect(0, 0, size, size);
      c.drawImage(baseCv, 0, 0, size, size);
      c.imageSmoothingEnabled = true;
      c.drawImage(terrCv, 0, 0, size, size);
      c.imageSmoothingEnabled = false;

      /* --- settlement dots --- */
      for (const s of g.t.sites) {
        if (R.Render.showFog && g.visible(s.x, s.y) === 0) continue;
        const px = s.tx * k,
          py = s.ty * k;
        const owned = s.owner >= 0;
        c.fillStyle = owned ? R.factionTint[s.owner] : "rgba(120,108,88,0.85)";
        if (s.nest) {
          // a Rot nest reads as a hollow ring, not a settlement
          c.strokeStyle = R.factionTint[6];
          c.lineWidth = 1.6;
          c.beginPath();
          c.arc(px, py, 3.4, 0, R.TAU);
          c.stroke();
        } else {
          c.beginPath();
          c.arc(px, py, s.home ? 4.2 : 3, 0, R.TAU);
          c.fill();
          c.strokeStyle = "rgba(52,45,37,0.7)";
          c.lineWidth = 0.9;
          c.stroke();
        }
      }

      /* --- buildings: a square, brighter for your own --- */
      for (const b of g.buildings) {
        if (b.dead) continue;
        if (R.Render.showFog && b.fac !== 0 && g.visible(b.x, b.y) === 0) continue;
        const w = Math.max(2, b.size * k * 0.9);
        c.fillStyle = b.fac === 0 ? "#3a6a3e" : R.factionTint[b.fac];
        c.fillRect(b.tx * k, b.ty * k, w, w);
      }

      /* --- units: a dot, sized by how big the thing is --- */
      for (const u of g.units) {
        if (u.dead || u.inside) continue;
        if (R.Render.showFog && u.fac !== 0 && !g.visibleNow(u.x, u.y)) continue;
        const px = u.x * k2,
          py = u.y * k2;
        c.fillStyle = R.factionTint[u.fac];
        const r = u.def.cls === "air" ? 1.9 : u.def.big ? 2.2 : 1.4;
        c.beginPath();
        c.arc(px, py, r, 0, R.TAU);
        c.fill();
        if (u.def.cls === "air") {
          // aircraft get a hollow ring so they are not confused with tanks
          c.strokeStyle = "rgba(255,255,255,0.55)";
          c.lineWidth = 0.7;
          c.stroke();
        }
      }

      /* --- pings: something happened here, look at it --- */
      for (const m of R.FX.markers) {
        if (m.type !== "ping") continue;
        const f = 1 - m.t / m.life;
        c.strokeStyle =
          (m.kind === "good"
            ? "rgba(86,132,64,"
            : m.kind === "bad"
              ? "rgba(172,64,52,"
              : "rgba(190,140,44,") +
          (0.95 * f).toFixed(3) +
          ")";
        c.lineWidth = 1.8;
        c.beginPath();
        c.arc(m.x * k2, m.y * k2, 4 + (1 - f) * 16, 0, R.TAU);
        c.stroke();
      }

      /* --- where the camera is --- */
      const hw = vw / cam.zoom / 2,
        hh = vh / cam.zoom / 2;
      c.strokeStyle = "rgba(250,246,236,0.95)";
      c.lineWidth = 1.6;
      c.strokeRect((cam.x - hw) * k2, (cam.y - hh) * k2, hw * 2 * k2, hh * 2 * k2);
      c.strokeStyle = "rgba(52,45,37,0.55)";
      c.lineWidth = 0.8;
      c.strokeRect((cam.x - hw) * k2 - 1, (cam.y - hh) * k2 - 1, hw * 2 * k2 + 2, hh * 2 * k2 + 2);

      /* --- the frame --- */
      c.strokeStyle = "rgba(61,52,43,0.85)";
      c.lineWidth = 2;
      c.strokeRect(1, 1, size - 2, size - 2);
    },

    /* ---------- input ---------- */

    hitTest(px, py) {
      const r = this.rect;
      return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    },
  };

  R.Mini = Minimap;
})();
