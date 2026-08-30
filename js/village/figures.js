/* The Hollow — the figures: villagers, guards, zombies.
   `draw` is FROZEN: a verbatim port of the original `ScenarioZombie.draw`
   from the repo's first single-file sim, kept character for character
   (AGENTS.md hard constraint 3). One deletion: the turret-agent branch at
   the top of the original (the village has no turret *agents*; the
   watchtower is a structure, drawn in structs.js).
   Everything under "VILLAGE EXTENSIONS" is new and additive: the tool in
   the hand, the load on the shoulder, job glyphs, the selection ring,
   health pips, names, zombie variants, and the mood layer. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const HAND = '"Segoe Script","Bradley Hand","Comic Sans MS",cursive';
  const C_SURV = [46, 44, 40];
  const C_INF = [146, 66, 42];

  const Figures = {
    /* ==================== VERBATIM PORT (do not edit) ==================== */
    draw(c, a, t) {
      let col;
      if (a.st === 2) col = "rgb(72,102,58)";
      else if (a.st === 1) col = ZS.lerpC(C_SURV, C_INF, 0.55 + 0.45 * Math.sin(t * 10 + a.ph));
      else col = ZS.lerpC(C_SURV, C_INF, ZS.clamp(a.inf, 0, 1));

      const s = a.seed;
      const moving = Math.hypot(a.vx, a.vy);
      const sway = Math.sin(t * 3 + s) * 1.6 * (a.st === 2 ? 0.5 : 1);
      const hx = a.x + sway,
        hy = a.y - 15;
      const g = Math.sin(a.gait) * 3.2 * Math.min(1, moving / 25 + 0.3);

      // shadow scribble
      c.strokeStyle = "rgba(40,35,25,0.14)";
      c.lineWidth = 1.2;
      ZS.wcirc(c, a.x, a.y + 6.5, 5.5, s + 3, 1.4);

      // infection aura for zombies
      if (a.st === 2) {
        c.strokeStyle = "rgba(150,40,30," + (0.1 + 0.06 * Math.sin(t * 2 + a.ph)).toFixed(3) + ")";
        c.lineWidth = 1;
        ZS.wcirc(c, a.x, a.y - 4, 17, s + 9, 2.5);
      }

      c.strokeStyle = col;
      c.lineWidth = 1.5;
      c.lineCap = "round";

      // legs
      ZS.wline(c, a.x, a.y - 1, a.x + g + ZS.sjit(s) * 0.5, a.y + 6, s + 11, 1.2);
      ZS.wline(c, a.x, a.y - 1, a.x - g + ZS.sjit(s + 1) * 0.5, a.y + 6, s + 17, 1.2);
      // body
      ZS.wline(c, hx, hy + 4, a.x, a.y - 1, s + 23, 1.1);
      // head
      ZS.wcirc(c, hx, hy, 4.6, s + 29, 0.9);

      // arms
      const shx = hx,
        shy = hy + 6;
      if (a.st === 2) {
        // arms outstretched toward prey
        const reach = 10 + Math.sin(t * 4 + a.ph) * 2;
        ZS.wline(
          c,
          shx,
          shy,
          shx + Math.cos(a.a - 0.5) * reach + sway,
          shy + Math.sin(a.a - 0.5) * reach * 0.4 - 3,
          s + 31,
          1.3,
        );
        ZS.wline(
          c,
          shx,
          shy,
          shx + Math.cos(a.a + 0.5) * reach + sway,
          shy + Math.sin(a.a + 0.5) * reach * 0.4 - 3,
          s + 37,
          1.3,
        );
      } else if (a.gun) {
        // both hands on the weapon, held toward the threat
        const ca = Math.cos(a.a),
          sa = Math.sin(a.a) * 0.4;
        const isSG = a.wep === "shotgun";
        const isFast = a.wep === "smg" || a.wep === "grenade";
        const bl = isSG ? 8 : isFast ? 9 : 11;
        ZS.wline(c, shx, shy, shx + ca * 4, shy + sa * 4 + 1, s + 31, 1.2);
        ZS.wline(
          c,
          shx,
          shy,
          shx + ca * (isSG ? 5.5 : 7),
          shy + sa * (isSG ? 5.5 : 7) + 1,
          s + 37,
          1.2,
        );
        c.lineWidth = isSG ? 1.8 : isFast ? 1.0 : 1.2; // the shotgun is a stout tube
        ZS.wline(c, shx - ca * 3, shy - sa * 3 + 1, shx + ca * bl, shy + sa * bl + 1, s + 65, 0.6);
        ZS.wline(
          c,
          shx - ca * 3,
          shy - sa * 3 + 1,
          shx - ca * 4.5,
          shy - sa * 4.5 + 3,
          s + 66,
          0.5,
        );
        if (isSG)
          ZS.wline(
            c,
            shx + ca * 2,
            shy + sa * 2 + 1,
            shx + ca * 2 - sa * 3.5,
            shy + sa * 2 + 1 + ca * 3.5,
            s + 67,
            0.5,
          ); // the pump
        if (isFast)
          ZS.wline(
            c,
            shx + ca * 2.5,
            shy + sa * 2.5 + 1,
            shx + ca * 4.5,
            shy + sa * 4.5 + 4,
            s + 68,
            0.5,
          ); // the fast gun's foregrip
      } else {
        ZS.wline(c, shx, shy, shx - 3 - g * 0.8, shy + 7, s + 31, 1.2);
        ZS.wline(c, shx, shy, shx + 3 + g * 0.8, shy + 7, s + 37, 1.2);
      }

      // face
      c.lineWidth = 1.1;
      if (a.st === 2) {
        c.fillStyle = "#8c2b1e";
        const ex = Math.cos(a.a),
          ey = Math.sin(a.a) * 0.5;
        c.beginPath();
        c.arc(hx - 1.7 + ex, hy - 0.5 + ey, 1, 0, 6.29);
        c.fill();
        c.beginPath();
        c.arc(hx + 1.7 + ex, hy - 0.5 + ey, 1, 0, 6.29);
        c.fill();
        ZS.wline(c, hx - 1.5, hy + 2, hx + 1.5, hy + 2.5, s + 41, 0.5);
      } else {
        c.fillStyle = col;
        c.beginPath();
        c.arc(hx - 1.6, hy - 0.6, 0.7, 0, 6.29);
        c.fill();
        c.beginPath();
        c.arc(hx + 1.6, hy - 0.6, 0.7, 0, 6.29);
        c.fill();
      }

      // the guard's kit: khaki cap (or a helmet on the SMG guns), coat hem,
      // bandolier — and a flash at the muzzle while firing (the cap keeps
      // them picked out of the crowd)
      if (a.gun) {
        c.lineWidth = 1.1;
        c.fillStyle = "rgba(128,112,76,0.45)";
        c.strokeStyle = col;
        if (a.wep === "smg") {
          // the fast guns wear a helmet: a wider dome instead of the cap
          const hp = [];
          for (let k = 0; k <= 6; k++) {
            const an = (k / 6) * Math.PI;
            hp.push({
              x: hx + Math.cos(an) * 5.6,
              y: hy - 0.8 - Math.sin(an) * 4.8,
            });
          }
          ZS.wpoly(c, hp, s + 61, 0.5, true);
          c.fill();
          c.stroke();
        } else {
          ZS.wpoly(
            c,
            [
              { x: hx - 5.4, y: hy - 4.3 },
              { x: hx - 2, y: hy - 5.1 },
              { x: hx + 2, y: hy - 5.1 },
              { x: hx + 5.4, y: hy - 4.3 },
              { x: hx + 2, y: hy - 3.5 },
              { x: hx - 2, y: hy - 3.5 },
            ],
            s + 61,
            0.5,
            true,
          );
          c.fill();
          c.stroke();
          ZS.wpoly(
            c,
            [
              { x: hx - 2, y: hy - 4.8 },
              { x: hx - 1.7, y: hy - 7.6 },
              { x: hx + 1.7, y: hy - 7.6 },
              { x: hx + 2, y: hy - 4.8 },
            ],
            s + 62,
            0.4,
            true,
          );
          c.fill();
          c.stroke();
        }
        // coat hem + bandolier
        ZS.wline(c, a.x - 2.5, a.y - 2, a.x - 4.6, a.y + 4.5, s + 63, 0.5);
        ZS.wline(c, a.x + 2.5, a.y - 2, a.x + 4.6, a.y + 4.5, s + 64, 0.5);
        ZS.wline(c, hx + 2.6, hy + 3, hx - 2.6, hy + 8, s + 65, 0.4);
        if (a.muzzle > 0) {
          const ca = Math.cos(a.a),
            sa = Math.sin(a.a) * 0.4;
          const n = a.wep === "shotgun" ? 5 : 3;
          const mx = shx + ca * (a.wep === "shotgun" ? 8 : 11),
            my = shy + sa * (a.wep === "shotgun" ? 8 : 11) + 1;
          c.strokeStyle = "rgba(176,110,40," + Math.min(1, a.muzzle / 0.12).toFixed(2) + ")";
          c.lineWidth = 1.3;
          for (let i = 0; i < n; i++) {
            const an = a.a + (i - (n - 1) / 2) * 0.4;
            ZS.wline(
              c,
              mx,
              my,
              mx + Math.cos(an) * (3.5 + i),
              my + Math.sin(an) * 1.8,
              s + 71 + i,
              0.4,
            );
          }
        }
      }

      // panic marks for fleeing survivors
      if (a.st === 0 && moving > 40) {
        c.strokeStyle = "rgba(60,55,45,0.5)";
        ZS.wline(
          c,
          hx + Math.cos(a.a) * 10,
          hy - 3 + ZS.jit(s) * 1.5,
          hx + Math.cos(a.a) * 15,
          hy - 4 + ZS.jit(s + 1) * 1.5,
          s + 47,
          0.7,
        );
        ZS.wline(
          c,
          hx + Math.cos(a.a) * 9,
          hy + 1 + ZS.jit(s + 2) * 1.5,
          hx + Math.cos(a.a) * 14,
          hy + 1 + ZS.jit(s + 3) * 1.5,
          s + 53,
          0.7,
        );
      }

      // transformation flash scribble
      if (a.flash > 0) {
        c.strokeStyle = "rgba(150,40,30," + Math.min(0.8, a.flash).toFixed(2) + ")";
        c.lineWidth = 1.3;
        const r = 8 + (1 - a.flash) * 16;
        for (let i = 0; i < 7; i++) {
          const an = (i / 7) * 6.283 + a.ph;
          ZS.wline(
            c,
            a.x + Math.cos(an) * r * 0.4,
            a.y - 6 + Math.sin(an) * r * 0.4,
            a.x + Math.cos(an) * r,
            a.y - 6 + Math.sin(an) * r,
            s + i * 3,
            0.8,
          );
        }
      }

      // a burning agent: a flickering crown of fire (additive — the figure
      // below is untouched)
      if (a.burn > 0) {
        const k = Math.min(1, a.burn); // fades out in the last second
        const fl = (s + ((t * 12) | 0) * 7) % 997; // ~12fps flicker
        c.lineWidth = 1.4;
        c.strokeStyle = "rgba(176,110,40," + (0.8 * k).toFixed(2) + ")";
        ZS.wline(
          c,
          a.x - 3,
          a.y - 2,
          a.x - 4 + ZS.sjit(fl) * 2,
          a.y - 15 - ZS.jit(fl) * 4,
          fl + 1,
          0.9,
        );
        c.strokeStyle = "rgba(150,40,30," + (0.7 * k).toFixed(2) + ")";
        ZS.wline(
          c,
          a.x + 1,
          a.y - 3,
          a.x + 1 + ZS.sjit(fl + 3) * 2.5,
          a.y - 18 - ZS.jit(fl + 3) * 4,
          fl + 4,
          0.9,
        );
        c.strokeStyle = "rgba(176,110,40," + (0.6 * k).toFixed(2) + ")";
        ZS.wline(
          c,
          a.x + 3.5,
          a.y - 2,
          a.x + 5 + ZS.sjit(fl + 6) * 2,
          a.y - 14 - ZS.jit(fl + 6) * 3,
          fl + 7,
          0.9,
        );
        // the bright core: a short flame in the middle
        c.strokeStyle = "rgba(214,164,74," + (0.8 * k).toFixed(2) + ")";
        c.lineWidth = 1.3;
        ZS.wline(
          c,
          a.x + ZS.sjit(fl + 8) * 1.5,
          a.y - 3,
          a.x + ZS.sjit(fl + 8) * 2.5,
          a.y - 10 - ZS.jit(fl + 8) * 2,
          fl + 8,
          0.7,
        );
        // a smoke wisp
        c.strokeStyle = "rgba(90,85,75," + (0.35 * k).toFixed(2) + ")";
        c.lineWidth = 1;
        ZS.wcirc(c, a.x, a.y - 16 - ZS.jit(fl + 9) * 2, 2.5, fl + 9, 0.8);
      }
    },
    /* ==================================================================== */

    /* ------------------------------------------------------------------
       VILLAGE EXTENSIONS — new art for the new game. `draw` above is the
       original figure, ported verbatim; everything below is additive: a
       tool in the hand, a load on the shoulder, a job glyph overhead, the
       selection ring, health pips and names. The frozen look is layered
       on, never edited.
       ------------------------------------------------------------------ */

    // per-frame switches the UI owns (hotkeys: J jobs, N names)
    opt: { jobs: true, names: true, zoom: 1 },

    // the figure's own frame (matches the body above exactly)
    frameOf(a, t) {
      const sway = Math.sin(t * 3 + a.seed) * 1.6 * (a.st === 2 ? 0.5 : 1);
      return { hx: a.x + sway, hy: a.y - 15, shx: a.x + sway, shy: a.y - 9 };
    },

    /* ---------- the tool in the hand ---------- */

    // a.tool: axe · pick · hoe · hammer · spear · bow · basket · pail · club
    // Guns keep the frozen `a.gun` kit in draw() above (rifle/shotgun/smg).
    tool(c, a, t) {
      const tl = a.tool;
      if (!tl || a.gun) return;
      const f = this.frameOf(a, t);
      const work = a.workT > 0 && a.swing;
      const ph = work ? Math.sin(a.swing) : 0;
      // idle: the tool hangs at the side. working: it swings overhead.
      const rest = tl === "spear" ? -1.45 : tl === "bow" ? -0.9 : 1.15;
      const ang = work ? -1.35 + ph * 0.95 : rest;
      const L = tl === "spear" ? 17 : tl === "bow" ? 9 : 12;
      const ca = Math.cos(ang),
        sa = Math.sin(ang) * 0.55;
      const hx = f.shx + ca * 3,
        hy = f.shy + sa * 3 + 1;
      const tx = f.shx + ca * L,
        ty = f.shy + sa * L + 1;
      c.lineCap = "round";
      c.strokeStyle = "rgba(104,78,44,0.9)"; // the handle: warm wood
      c.lineWidth = 1.3;
      ZS.wline(c, hx, hy, tx, ty, a.seed + 91, 0.4);
      const ink = "rgba(72,66,58,0.85)"; // iron
      switch (tl) {
        case "axe": {
          // a small wedge head, set across the handle's end
          const nx = -sa * 1.1,
            ny = ca * 1.1;
          ZS.wpoly(
            c,
            [
              { x: tx - ca * 2 + nx * 3.4, y: ty - sa * 2 + ny * 3.4 },
              { x: tx + ca * 1.5 + nx * 4.6, y: ty + sa * 1.5 + ny * 4.6 },
              { x: tx + ca * 3.4 + nx * 1, y: ty + sa * 3.4 + ny * 1 },
              { x: tx - ca * 1 + nx * 0.6, y: ty - sa * 1 + ny * 0.6 },
            ],
            a.seed + 93,
            0.35,
            true,
          );
          c.fillStyle = "rgba(122,124,128,0.75)";
          c.fill();
          c.strokeStyle = ink;
          c.lineWidth = 1.1;
          c.stroke();
          break;
        }
        case "pick": {
          c.strokeStyle = ink;
          c.lineWidth = 1.3;
          const nx = -sa * 0.9,
            ny = ca * 0.9;
          ZS.wline(
            c,
            tx - ca * 6 + nx * 3,
            ty - sa * 6 + ny * 3,
            tx + ca * 6,
            ty + sa * 6,
            a.seed + 94,
            0.4,
          );
          break;
        }
        case "hoe": {
          c.strokeStyle = ink;
          c.lineWidth = 1.2;
          const nx = -sa * 0.9,
            ny = ca * 0.9;
          ZS.wline(
            c,
            tx + nx * 5,
            ty + ny * 5,
            tx - ca * 2 - nx * 5,
            ty - sa * 2 - ny * 5,
            a.seed + 95,
            0.4,
          );
          break;
        }
        case "hammer": {
          const nx = -sa,
            ny = ca;
          ZS.wpoly(
            c,
            [
              { x: tx - ca * 1.6 + nx * 2.4, y: ty - sa * 1.6 + ny * 2.4 },
              { x: tx + ca * 1.6 + nx * 2.4, y: ty + sa * 1.6 + ny * 2.4 },
              { x: tx + ca * 1.6 - nx * 2.4, y: ty + sa * 1.6 - ny * 2.4 },
              { x: tx - ca * 1.6 - nx * 2.4, y: ty - sa * 1.6 - ny * 2.4 },
            ],
            a.seed + 96,
            0.3,
            true,
          );
          c.fillStyle = "rgba(112,114,118,0.7)";
          c.fill();
          c.strokeStyle = ink;
          c.lineWidth = 1.1;
          c.stroke();
          break;
        }
        case "spear": {
          ZS.wpoly(
            c,
            [
              { x: tx, y: ty },
              { x: tx - ca * 5 + sa * 2.4, y: ty - sa * 5 - ca * 2.4 },
              { x: tx - ca * 5 - sa * 2.4, y: ty - sa * 5 + ca * 2.4 },
            ],
            a.seed + 97,
            0.3,
            true,
          );
          c.fillStyle = "rgba(132,134,138,0.8)";
          c.fill();
          c.strokeStyle = ink;
          c.lineWidth = 1;
          c.stroke();
          break;
        }
        case "bow": {
          c.strokeStyle = "rgba(104,78,44,0.95)";
          c.lineWidth = 1.2;
          const nx = -sa * 1.4,
            ny = ca * 1.4;
          const pts = [];
          for (let k = 0; k <= 6; k++) {
            const q = k / 6;
            const bend = Math.sin(q * Math.PI) * 5.5;
            pts.push({
              x: hx + ca * (q * 16) + nx * bend,
              y: hy + sa * (q * 16) + ny * bend,
            });
          }
          ZS.wpoly(c, pts, a.seed + 98, 0.3, false);
          c.stroke();
          c.strokeStyle = "rgba(70,64,56,0.6)";
          c.lineWidth = 0.8;
          ZS.wline(c, pts[0].x, pts[0].y, pts[6].x, pts[6].y, a.seed + 99, 0.2);
          break;
        }
        case "club": {
          c.strokeStyle = "rgba(104,78,44,0.95)";
          c.lineWidth = 2.1;
          ZS.wline(c, hx, hy, tx + ca * 3, ty + sa * 3, a.seed + 92, 0.5);
          break;
        }
        case "basket": {
          // slung on the off hand: a shallow wobbly bowl
          c.strokeStyle = "rgba(150,124,70,0.9)";
          c.lineWidth = 1.1;
          const bx = f.shx + ca * 7 - sa * 4,
            by = f.shy + sa * 7 + ca * 4 + 2;
          ZS.wpoly(
            c,
            [
              { x: bx - 4.5, y: by - 2 },
              { x: bx + 4.5, y: by - 2 },
              { x: bx + 3, y: by + 4 },
              { x: bx - 3, y: by + 4 },
            ],
            a.seed + 89,
            0.3,
            true,
          );
          c.fillStyle = "rgba(178,152,96,0.55)";
          c.fill();
          c.stroke();
          break;
        }
        case "pail": {
          c.strokeStyle = "rgba(96,92,84,0.9)";
          c.lineWidth = 1.1;
          const bx = f.shx + ca * 8,
            by = f.shy + sa * 8 + 3;
          ZS.wpoly(
            c,
            [
              { x: bx - 3.4, y: by - 3 },
              { x: bx + 3.4, y: by - 3 },
              { x: bx + 2.6, y: by + 3.4 },
              { x: bx - 2.6, y: by + 3.4 },
            ],
            a.seed + 88,
            0.3,
            true,
          );
          c.fillStyle = "rgba(120,116,108,0.5)";
          c.fill();
          c.stroke();
          break;
        }
      }
    },

    /* ---------- the load on the shoulder ---------- */

    // a.carry = { kind: "wood"|"stone"|"food"|"scrap", n }
    load(c, a) {
      const k = a.carry;
      if (!k || !k.n) return;
      const n = Math.min(4, 1 + Math.floor(k.n / 5));
      const bx = a.x + Math.cos(a.a - 1.2) * 3 + ZS.jit(a.seed + 5) * 0.6;
      const by = a.y - 24;
      c.lineCap = "round";
      if (k.kind === "wood") {
        c.strokeStyle = "rgba(112,82,44,0.95)";
        c.lineWidth = 2.2;
        for (let i = 0; i < n; i++) {
          const oy = i * 3.2;
          ZS.wline(c, bx - 7, by + oy, bx + 7, by + oy - 1, a.seed + 120 + i, 0.5);
        }
        c.strokeStyle = "rgba(88,62,32,0.7)";
        c.lineWidth = 0.9;
        for (let i = 0; i < n; i++) ZS.wcirc(c, bx - 7, by + i * 3.2, 1.1, a.seed + 130 + i, 0.2);
      } else if (k.kind === "stone") {
        const pts = [];
        const m = 6;
        for (let i = 0; i < m; i++) {
          const an = (i / m) * Math.PI * 2;
          pts.push({ x: bx + Math.cos(an) * 6, y: by + 2 + Math.sin(an) * 4.2 });
        }
        ZS.wpoly(c, pts, a.seed + 140, 0.5, true);
        c.fillStyle = "rgba(140,136,126,0.6)";
        c.fill();
        c.strokeStyle = "rgba(78,74,66,0.85)";
        c.lineWidth = 1.1;
        c.stroke();
      } else if (k.kind === "food") {
        c.strokeStyle = "rgba(176,158,74,0.95)";
        c.lineWidth = 1.2;
        for (let i = 0; i < 5; i++) {
          const sp = (i - 2) * 0.32;
          ZS.wline(c, bx, by + 5, bx + sp * 7, by - 4 - Math.abs(sp) * -2, a.seed + 150 + i, 0.4);
        }
        c.strokeStyle = "rgba(120,104,48,0.8)";
        ZS.wline(c, bx - 3.4, by + 4, bx + 3.4, by + 4, a.seed + 155, 0.3);
      } else {
        // scrap: an angular lump of junk
        const pts = [];
        const m = 5;
        for (let i = 0; i < m; i++) {
          const an = (i / m) * Math.PI * 2 + 0.4;
          pts.push({ x: bx + Math.cos(an) * 5.4, y: by + 1 + Math.sin(an) * 4 });
        }
        ZS.wpoly(c, pts, a.seed + 160, 0.7, true);
        c.fillStyle = "rgba(120,116,108,0.5)";
        c.fill();
        c.strokeStyle = "rgba(72,68,60,0.85)";
        c.lineWidth = 1;
        c.stroke();
      }
      // a little count tick so a full load reads at a glance
      if (k.n >= 10) {
        c.strokeStyle = "rgba(70,64,52,0.55)";
        c.lineWidth = 1;
        ZS.wline(c, bx + 8, by + 1, bx + 11, by - 2, a.seed + 170, 0.3);
        ZS.wline(c, bx + 11, by - 2, bx + 8, by - 5, a.seed + 171, 0.3);
      }
    },

    /* ---------- job glyphs (the little icon over the head) ---------- */

    glyph(c, x, y, kind, s, seed) {
      const g = (col) => {
        c.strokeStyle = col;
        c.lineWidth = 1.2;
        c.lineCap = "round";
      };
      switch (kind) {
        case "wood":
          g("rgba(104,76,40,0.9)");
          ZS.wline(c, x - s, y + s * 0.5, x + s, y - s * 0.3, seed + 1, 0.4);
          ZS.wline(c, x - s + 1, y - s * 0.1, x - s + 1, y + s * 0.9, seed + 2, 0.3);
          break;
        case "stone":
          g("rgba(84,80,72,0.9)");
          ZS.wpoly(
            c,
            [
              { x: x - s * 0.9, y: y + s * 0.5 },
              { x: x - s * 0.4, y: y - s * 0.6 },
              { x: x + s * 0.7, y: y - s * 0.4 },
              { x: x + s * 0.9, y: y + s * 0.5 },
            ],
            seed + 3,
            0.4,
            true,
          );
          c.fillStyle = "rgba(132,128,118,0.35)";
          c.fill();
          c.stroke();
          break;
        case "food":
          g("rgba(150,132,60,0.95)");
          ZS.wline(c, x, y + s * 0.9, x, y - s * 0.5, seed + 4, 0.4);
          ZS.wline(c, x, y - s * 0.1, x - s * 0.8, y - s * 0.8, seed + 5, 0.4);
          ZS.wline(c, x, y - s * 0.3, x + s * 0.8, y - s * 0.9, seed + 6, 0.4);
          break;
        case "farm":
          g("rgba(96,132,58,0.95)");
          ZS.wline(c, x, y + s * 0.9, x, y - s * 0.4, seed + 7, 0.4);
          ZS.wline(c, x, y - s * 0.1, x - s * 0.9, y - s * 0.5, seed + 8, 0.4);
          ZS.wline(c, x, y - s * 0.35, x + s * 0.9, y - s * 0.75, seed + 9, 0.4);
          break;
        case "build":
          g("rgba(88,72,52,0.95)");
          ZS.wline(c, x - s * 0.9, y + s * 0.6, x + s * 0.6, y - s * 0.7, seed + 10, 0.4);
          ZS.wpoly(
            c,
            [
              { x: x + s * 0.2, y: y - s * 0.2 },
              { x: x + s * 0.9, y: y - s * 0.9 },
              { x: x + s * 1.1, y: y - s * 0.2 },
              { x: x + s * 0.4, y: y + s * 0.3 },
            ],
            seed + 11,
            0.3,
            true,
          );
          c.fillStyle = "rgba(120,116,108,0.5)";
          c.fill();
          c.stroke();
          break;
        case "repair":
          g("rgba(72,96,120,0.95)");
          ZS.wcirc(c, x, y, s * 0.7, seed + 12, 0.4);
          ZS.wline(c, x + s * 0.5, y + s * 0.5, x + s * 1.1, y + s * 1.1, seed + 13, 0.3);
          break;
        case "guard":
          g("rgba(70,84,104,0.95)");
          ZS.wpoly(
            c,
            [
              { x: x, y: y - s * 0.9 },
              { x: x + s * 0.8, y: y - s * 0.4 },
              { x: x + s * 0.5, y: y + s * 0.7 },
              { x: x - s * 0.5, y: y + s * 0.7 },
              { x: x - s * 0.8, y: y - s * 0.4 },
            ],
            seed + 14,
            0.35,
            true,
          );
          c.fillStyle = "rgba(112,128,148,0.35)";
          c.fill();
          c.stroke();
          break;
        case "heal":
          g("rgba(150,64,52,0.95)");
          ZS.wline(c, x - s * 0.7, y, x + s * 0.7, y, seed + 15, 0.4);
          ZS.wline(c, x, y - s * 0.7, x, y + s * 0.7, seed + 16, 0.4);
          break;
        case "idle":
          g("rgba(90,86,74,0.7)");
          ZS.wcirc(c, x, y, s * 0.4, seed + 17, 0.3);
          break;
        case "think":
          g("rgba(104,88,64,0.95)");
          ZS.wcirc(c, x, y - s * 0.2, s * 0.75, seed + 18, 0.4);
          ZS.wline(c, x - s * 0.2, y + s * 0.6, x + s * 0.2, y + s * 0.6, seed + 19, 0.3);
          break;
      }
    },

    jobGlyph(c, a) {
      if (!a.job || a.st === 2) return;
      const y = a.y - 33 - (Math.floor(a.seed) % 2) * 4;
      // a soft paper chip behind the glyph so it reads over the world
      c.save();
      c.globalAlpha = 0.9;
      c.fillStyle = "rgba(250,246,236,0.72)";
      c.beginPath();
      c.arc(a.x, y, 8.4, 0, 6.2832);
      c.fill();
      c.strokeStyle = "rgba(70,64,52,0.35)";
      c.lineWidth = 0.9;
      ZS.wcirc(c, a.x, y, 8.4, a.seed + 61, 0.8);
      this.glyph(c, a.x, y, a.jobGlyph || a.job, 5, a.seed + 200);
      c.restore();
    },

    /* ---------- selection, health, names, infection ---------- */

    ring(c, a, t) {
      c.save();
      c.translate(a.x, a.y + 6);
      c.scale(1, 0.42);
      c.strokeStyle = "rgba(64,96,52," + (0.75 + 0.2 * Math.sin(t * 4)).toFixed(2) + ")";
      c.lineWidth = 1.6;
      ZS.wcirc(c, 0, 0, 12 + Math.sin(t * 3) * 0.8, a.seed + 71, 1.1);
      c.restore();
      // four little ticks, so a selected villager reads at fit-zoom
      c.strokeStyle = "rgba(64,96,52,0.8)";
      c.lineWidth = 1.3;
      for (let i = 0; i < 4; i++) {
        const an = (i / 4) * Math.PI * 2 + t * 0.6;
        const r0 = 13,
          r1 = 17;
        ZS.wline(
          c,
          a.x + Math.cos(an) * r0,
          a.y + 6 + Math.sin(an) * r0 * 0.42,
          a.x + Math.cos(an) * r1,
          a.y + 6 + Math.sin(an) * r1 * 0.42,
          a.seed + 80 + i,
          0.4,
        );
      }
    },

    hp(c, a) {
      const w = 18,
        h = 3.2;
      const x = a.x - w / 2,
        y = a.y - 28;
      c.fillStyle = "rgba(250,246,236,0.8)";
      c.fillRect(x - 1, y - 1, w + 2, h + 2);
      c.strokeStyle = "rgba(70,64,52,0.55)";
      c.lineWidth = 0.8;
      c.strokeRect(x - 1, y - 1, w + 2, h + 2);
      const f = ZS.clamp(a.hp / a.maxHp, 0, 1);
      c.fillStyle =
        f > 0.5 ? "rgba(96,132,58,0.9)" : f > 0.25 ? "rgba(178,140,50,0.9)" : "rgba(158,58,42,0.9)";
      c.fillRect(x, y, w * f, h);
    },

    name(c, a) {
      c.save();
      c.font = "italic 10.5px " + HAND;
      c.textAlign = "center";
      c.fillStyle = "rgba(46,42,34,0.78)";
      c.fillText(a.name || "", a.x, a.y + 19);
      if (a.jobTitle) {
        c.font = "italic 9px " + HAND;
        c.fillStyle = "rgba(70,64,52,0.55)";
        c.fillText(a.jobTitle, a.x, a.y + 29);
      }
      c.restore();
    },

    infected(c, a, t) {
      const k = ZS.clamp(a.inf / 30, 0, 1);
      c.save();
      c.strokeStyle =
        "rgba(150,40,30," + (0.16 + 0.34 * k + 0.14 * Math.sin(t * 5)).toFixed(2) + ")";
      c.lineWidth = 1.1;
      ZS.wcirc(c, a.x, a.y - 12, 12, a.seed + 33, 1.6);
      c.fillStyle = "rgba(150,40,30,0.8)";
      c.font = "italic 10px " + HAND;
      c.textAlign = "center";
      c.fillText("~", a.x, a.y - 24);
      c.restore();
    },

    /* ---------- zombie variants (scale + additive marks) ---------- */

    zedMark(c, a, t) {
      if (a.zType === "runner") {
        // speed streaks trailing behind
        c.strokeStyle = "rgba(150,72,72,0.5)";
        c.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const d = 9 + i * 5;
          ZS.wline(
            c,
            a.x - Math.cos(a.a) * d,
            a.y - 4 - Math.sin(a.a) * d * 0.4 - i * 3,
            a.x - Math.cos(a.a) * (d + 7),
            a.y - 4 - Math.sin(a.a) * (d + 7) * 0.4 - i * 3,
            a.seed + 210 + i,
            0.4,
          );
        }
      } else if (a.zType === "brute") {
        // a heavy red aura and a thick shadow
        c.strokeStyle = "rgba(140,44,32," + (0.16 + 0.08 * Math.sin(t * 3 + a.ph)).toFixed(2) + ")";
        c.lineWidth = 2;
        ZS.wcirc(c, a.x, a.y - 6, 26, a.seed + 220, 2.4);
      } else if (a.zType === "crawler") {
        // what is left of the legs, dragged behind; and the wet it leaves
        c.strokeStyle = "rgba(122,38,30,0.55)";
        c.lineWidth = 1.4;
        const bk = Math.cos(a.a),
          bn = Math.sin(a.a);
        ZS.wline(
          c,
          a.x + 4,
          a.y + 1,
          a.x - bk * 15 + ZS.sjit(a.seed + 61) * 2,
          a.y - bn * 6 + 4,
          a.seed + 231,
          1.1,
        );
        ZS.wline(
          c,
          a.x - 4,
          a.y + 1,
          a.x - bk * 13 - 2 + ZS.sjit(a.seed + 62) * 2,
          a.y - bn * 6 + 6,
          a.seed + 237,
          1.1,
        );
        c.fillStyle = "rgba(112,34,26,0.13)";
        c.beginPath();
        c.ellipse(a.x, a.y + 5, 11, 4.2, 0, 0, 6.2832);
        c.fill();
        // one arm reaches; the other is gone
        c.strokeStyle = "rgba(72,102,58,0.9)";
        c.lineWidth = 1.5;
        const ph = Math.sin(t * 5 + a.seed) * 0.4;
        ZS.wline(
          c,
          a.x + 1,
          a.y - 8,
          a.x + bk * 11 + Math.cos(ph) * 3,
          a.y - 13 + bn * 4,
          a.seed + 241,
          1,
        );
      } else if (a.zType === "wailer") {
        // the mouth: open, and it does not close
        c.strokeStyle = "rgba(96,26,22,0.85)";
        c.lineWidth = 1.1;
        ZS.wcirc(c, a.x, a.y - 14, 3.6, a.seed + 251, 0.6);
        c.fillStyle = "rgba(70,18,14,0.8)";
        c.fill();
        // and the rings, growing as the scream gathers
        const st = a.screamT || 0;
        if (st < 2.2) {
          const k = 1 - st / 2.2;
          c.strokeStyle = "rgba(150,60,44," + (0.35 * k).toFixed(2) + ")";
          c.lineWidth = 1;
          for (let i = 0; i < 2; i++) {
            const r = 8 + (((1 - k) * 34 + i * 12) % 40);
            ZS.wcirc(c, a.x, a.y - 15, r, a.seed + 260 + i, 2);
          }
        }
        // a thin, tall thing: the ribs show
        c.strokeStyle = "rgba(72,102,58,0.55)";
        c.lineWidth = 1;
        for (let i = 0; i < 3; i++)
          ZS.wline(c, a.x - 4, a.y - 9 + i * 4, a.x + 4, a.y - 9 + i * 4, a.seed + 271 + i, 0.5);
      }
    },

    // a crawler is a body with the legs left off it: it rides low and
    // drags. Everything else keeps the frozen pose.
    zedPose(c, a) {
      if (a.st !== 2 || a.zType !== "crawler") return false;
      c.save();
      c.translate(a.x, a.y + 7);
      c.scale(1.18, 0.52);
      c.translate(-a.x, -a.y);
      return true;
    },

    /* ---------- mood: the small things the living do ---------- */

    // Grief, a hot meal, a cold morning, a child's short legs. All of it
    // is drawn on top of the frozen figure, never instead of it.
    mood(c, a, t) {
      const sc = ZS.scenario;
      const f = this.frameOf(a, t);
      // at a grave, with the village still raw: the head goes down
      if (sc && sc.grief > 0.12 && this.nearGrave(a)) {
        c.strokeStyle = "rgba(58,54,44,0.75)";
        c.lineWidth = 1.2;
        ZS.wline(c, f.hx - 3, f.hy - 3, f.hx + 3, f.hy - 2.2, a.seed + 301, 0.4);
        c.strokeStyle = "rgba(214,186,96,0.9)";
        c.lineWidth = 1.4;
        ZS.wline(c, a.x + 9, a.y + 6, a.x + 9, a.y - 3, a.seed + 302, 0.3);
        const fl = 1.6 + Math.sin(t * 9 + a.seed) * 0.6;
        c.fillStyle = "rgba(224,170,74,0.85)";
        c.beginPath();
        c.ellipse(a.x + 9, a.y - 4.4, 1.1, fl, 0, 0, 6.2832);
        c.fill();
        return;
      }
      // a feast: a bowl, and the steam off it
      if (sc && sc.haz && sc.haz.feastT > 0) {
        c.strokeStyle = "rgba(92,72,48,0.9)";
        c.lineWidth = 1.1;
        ZS.wline(c, f.shx - 5, f.shy + 3, f.shx + 5, f.shy + 3, a.seed + 311, 0.3);
        ZS.wline(c, f.shx - 4, f.shy + 3, f.shx - 2.5, f.shy + 6, a.seed + 312, 0.3);
        ZS.wline(c, f.shx + 4, f.shy + 3, f.shx + 2.5, f.shy + 6, a.seed + 313, 0.3);
        c.strokeStyle = "rgba(200,200,196,0.5)";
        c.lineWidth = 1;
        for (let i = 0; i < 2; i++) {
          const yy = f.shy - 2 - ((t * 9 + i * 1.4) % 3) * 2;
          ZS.wline(c, f.shx - 2 + i * 3, yy, f.shx - 1 + i * 3, yy - 4, a.seed + 320 + i, 0.7);
        }
        return;
      }
      // a cold morning: the breath hangs in the air, and they hunch
      if (sc && sc.haz && sc.haz.cold > 0.05) {
        c.strokeStyle = "rgba(190,206,214,0.42)";
        c.lineWidth = 1;
        const puff = (t * 0.7 + a.seed * 0.13) % 1;
        ZS.wline(
          c,
          f.hx + 5,
          f.hy + 1,
          f.hx + 8 + puff * 7,
          f.hy - 2 - puff * 5,
          a.seed + 331,
          0.5,
        );
      }
      // worn down: the shoulders come forward
      if (sc && sc.morale < 0.34) {
        c.strokeStyle = "rgba(58,54,44,0.35)";
        c.lineWidth = 1;
        ZS.wline(c, f.shx - 4, f.shy + 1, f.shx + 4, f.shy + 2.5, a.seed + 341, 0.4);
      }
    },

    // one of the Warrens: the same figure, but with a rag across the chest
    // and a club in the hand (additive — nothing in draw() is touched)
    raiderMark(c, a, t) {
      const f = this.frameOf(a, t);
      c.save();
      c.strokeStyle = "rgba(122,54,40,0.85)";
      c.lineWidth = 2.2;
      ZS.wline(c, f.shx - 5, f.shy - 3, f.shx + 5, f.shy + 3, a.seed + 71, 0.9);
      c.strokeStyle = "rgba(122,54,40,0.5)";
      c.lineWidth = 1.6;
      ZS.wline(c, f.shx - 5, f.shy + 2, f.shx + 4, f.shy - 4, a.seed + 77, 0.5);
      c.restore();
    },

    nearGrave(a) {
      const sc = ZS.scenario;
      if (!sc || !sc.props) return false;
      for (const p of sc.props) {
        if (p.kind !== "grave") continue;
        const dx = p.x - a.x,
          dy = p.y - a.y;
        if (dx * dx + dy * dy < 46 * 46) return true;
      }
      return false;
    },

    /* ---------- the village's per-agent render ---------- */

    render(c, a, t) {
      // a child is a small person, not a small adult: the legs are short
      // and the head is not
      const child = a.kin && a.kin.child;
      const k = a.scale || 1;
      const scaled = k !== 1 || child;
      if (scaled) {
        c.save();
        c.translate(a.x, a.y);
        // a child: shorter, but not a smaller person — the head stays big
        c.scale(k * (child ? 0.88 : 1), k * (child ? 0.72 : 1));
        c.translate(-a.x, -a.y);
      }
      const posed = this.zedPose(c, a);
      this.draw(c, a, t);
      if (posed) c.restore();
      if (scaled) c.restore();
      if (a.st === 2) {
        this.zedMark(c, a, t);
        if (a.inf === undefined) a.inf = 0;
        return;
      }
      this.mood(c, a, t);
      if (a.st === 3) this.raiderMark(c, a, t);
      this.tool(c, a, t);
      this.load(c, a, t);
      if (a.inf > 0) this.infected(c, a, t);
      if (a.hp < a.maxHp - 0.01) this.hp(c, a);
      if (this.opt.jobs && this.opt.zoom > 0.45) this.jobGlyph(c, a);
      if (this.opt.names && this.opt.zoom > 0.95) this.name(c, a);
      if (a.sel) this.ring(c, a, t);
    },
  };

  ZS.Figures = Figures;
})();
