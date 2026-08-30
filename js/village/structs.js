/* The Hollow — the village's structures: the catalog (size, cost, what each
   one does) and the sketch art for every kind — whole, ruined, under
   construction, and battle-damaged. Everything is drawn with the boiling
   primitives in js/sketch.js on the paper palette, the same way the town in
   js/draw.js is: a footprint, walls, a roof, and hatching.

   A structure record is pushed onto world.buildings so the core y-sorts it
   with the trees and the agents (sort key: the footprint's bottom edge) and
   calls Structs.draw through the scenario's drawBuildingDecor hook. Its nav
   cells are marked blocked, so nobody walks through a wall — including the
   horde, which is why walls are worth building. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const INK = "rgba(74,62,46,0.9)";
  const INK2 = "rgba(74,62,46,0.5)";
  const FLOOR = "rgba(198,182,150,0.24)";
  const WOOD = "rgba(160,118,68,0.34)";
  const THATCH = "rgba(158,124,64,0.26)";
  const STONEF = "rgba(142,138,128,0.34)";
  const GOLD = "rgba(186,158,66,0.9)";
  const LEAF = "rgba(96,132,58,0.85)";
  const EMBER = "rgba(176,110,40,";
  const RUST = "rgba(150,40,30,";

  /* ---------- the catalog ---------- */

  // cost: { w: wood, s: stone, c: scrap } · time: seconds of villager work
  // lvlMax: upgrade steps · key: the build-menu hotkey
  const CAT = {
    hut: {
      name: "hut",
      w: 84,
      h: 62,
      hp: 220,
      cost: { w: 30, s: 6 },
      time: 20,
      lvlMax: 2,
      key: "1",
      desc: "+2 homes per level",
    },
    farm: {
      name: "farm plot",
      w: 104,
      h: 62,
      hp: 130,
      cost: { w: 18 },
      time: 14,
      lvlMax: 3,
      key: "2",
      desc: "grow food · richer soil each level",
    },
    wall: {
      name: "palisade",
      w: 62,
      h: 16,
      hp: 340,
      cost: { w: 12 },
      time: 9,
      lvlMax: 2,
      key: "3",
      desc: "holds the line · level 2 is stone",
    },
    shed: {
      name: "woodshed",
      w: 80,
      h: 56,
      hp: 200,
      cost: { w: 26, s: 8 },
      time: 22,
      lvlMax: 3,
      key: "4",
      desc: "+30% wood per level",
    },
    quarry: {
      name: "quarry",
      w: 92,
      h: 64,
      hp: 220,
      cost: { w: 24, s: 16 },
      time: 26,
      lvlMax: 3,
      key: "5",
      desc: "+30% stone per level",
    },
    store: {
      name: "storehouse",
      w: 96,
      h: 70,
      hp: 260,
      cost: { w: 40, s: 18 },
      time: 30,
      lvlMax: 3,
      key: "6",
      desc: "+200 storage per level",
    },
    tower: {
      name: "watchtower",
      w: 54,
      h: 54,
      hp: 300,
      cost: { w: 34, s: 26 },
      time: 34,
      lvlMax: 3,
      key: "7",
      desc: "guards see and shoot farther",
    },
    post: {
      name: "guard post",
      w: 78,
      h: 58,
      hp: 280,
      cost: { w: 44, s: 16 },
      time: 32,
      lvlMax: 2,
      key: "8",
      desc: "+2 guards per level",
    },
    shop: {
      name: "workshop",
      w: 92,
      h: 68,
      hp: 280,
      cost: { w: 55, s: 30, c: 8 },
      time: 40,
      lvlMax: 2,
      key: "9",
      desc: "unlocks research · level 2 studies faster",
    },
    infirm: {
      name: "infirmary",
      w: 82,
      h: 62,
      hp: 220,
      cost: { w: 45, s: 22, c: 6 },
      time: 36,
      lvlMax: 2,
      key: "i",
      desc: "heals the wounded, cures the bitten",
    },
    well: {
      name: "well",
      w: 50,
      h: 50,
      hp: 170,
      cost: { w: 14, s: 20 },
      time: 18,
      lvlMax: 1,
      key: "w",
      desc: "farms near it grow +30% faster",
    },
    beacon: {
      name: "beacon",
      w: 48,
      h: 48,
      hp: 130,
      cost: { w: 22, c: 4 },
      time: 16,
      lvlMax: 1,
      key: "b",
      desc: "light and warmth through the night",
    },
    hall: {
      name: "the hall",
      w: 152,
      h: 104,
      hp: 720,
      cost: { w: 0, s: 0, c: 0 },
      time: 30,
      lvlMax: 3,
      key: "h",
      desc: "+2 homes, +150 storage per level · if it falls, the village falls",
    },
  };
  // the build menu's order (the hall is never built, only repaired)
  const ORDER = [
    "hut",
    "farm",
    "wall",
    "shed",
    "quarry",
    "store",
    "tower",
    "post",
    "shop",
    "infirm",
    "well",
    "beacon",
  ];

  /* ---------- little shared strokes ---------- */

  function seg(c, x1, y1, x2, y2, seed, lw, col) {
    c.strokeStyle = col || INK;
    c.lineWidth = lw || 2;
    c.lineCap = "round";
    ZS.wline(c, x1, y1, x2, y2, seed, 0.9);
  }

  // a wall run, broken up: the ruin's silhouette
  function rseg(c, x1, y1, x2, y2, seed) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      if (ZS.hash(seed + i * 3.3) < 0.34) continue; // a gap
      const t0 = i / n,
        t1 = (i + 0.82) / n;
      seg(
        c,
        x1 + (x2 - x1) * t0,
        y1 + (y2 - y1) * t0,
        x1 + (x2 - x1) * t1,
        y1 + (y2 - y1) * t1,
        seed + i * 7.7,
        1.8,
      );
    }
  }

  function floor(c, s, fill) {
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h;
    ZS.wpoly(
      c,
      [
        { x: x + 3, y: y + 3 },
        { x: x + w - 3, y: y + 2 },
        { x: x + w - 2, y: y + h - 3 },
        { x: x + 2, y: y + h - 2 },
      ],
      s.seed + 3,
      1.1,
      true,
    );
    c.fillStyle = fill || FLOOR;
    c.fill();
  }

  // a gabled roof: eaves on the top wall, ridge above it
  function gable(c, s, lift, col) {
    const x = s.x,
      y = s.y,
      w = s.w;
    const ey = y + 2,
      rh = 18 + w * 0.1;
    const cx = x + w / 2,
      ry = ey - rh + (lift || 0);
    ZS.wpoly(
      c,
      [
        { x: x - 5, y: ey },
        { x: cx, y: ry },
        { x: x + w + 5, y: ey },
        { x: x + w + 1, y: ey + 5 },
        { x: x - 1, y: ey + 5 },
      ],
      s.seed + 11,
      1.2,
      true,
    );
    c.fillStyle = col || THATCH;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.8;
    c.stroke();
    // the ridge cap + shingle rows
    seg(c, cx - 5, ry + 1, cx + 5, ry + 1, s.seed + 13, 1.4, INK2);
    const rows = 3;
    for (let i = 1; i <= rows; i++) {
      const f = i / (rows + 1);
      const yl = ry + (ey - ry) * f;
      const half = (w / 2 + 5) * f;
      seg(c, cx - half, yl, cx - half * 0.35, yl, s.seed + 20 + i, 0.9, INK2);
      seg(c, cx + half * 0.35, yl, cx + half, yl, s.seed + 30 + i, 0.9, INK2);
    }
    return { cx, ry };
  }

  // the front wall: a plank door, dead centre on the bottom edge
  function door(c, s, wdt, hgt, col) {
    const x = s.x + s.w / 2,
      yb = s.y + s.h;
    ZS.wpoly(
      c,
      [
        { x: x - wdt / 2, y: yb - 1 },
        { x: x - wdt / 2, y: yb - hgt },
        { x: x + wdt / 2, y: yb - hgt },
        { x: x + wdt / 2, y: yb - 1 },
      ],
      s.seed + 41,
      0.8,
      true,
    );
    c.fillStyle = col || WOOD;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.stroke();
    seg(
      c,
      x - wdt / 2 + 2,
      yb - hgt * 0.62,
      x + wdt / 2 - 2,
      yb - hgt * 0.62,
      s.seed + 42,
      0.9,
      INK2,
    );
    seg(c, x, yb - hgt + 2, x, yb - 3, s.seed + 43, 0.9, INK2);
    c.strokeStyle = INK;
    c.lineWidth = 1.1;
    ZS.wcirc(c, x + wdt / 2 - 4, yb - hgt * 0.45, 1.3, s.seed + 44, 0.2);
  }

  function windowLit(c, x, y, seed, night) {
    ZS.wpoly(
      c,
      [
        { x: x - 6, y: y - 6 },
        { x: x + 6, y: y - 6 },
        { x: x + 6, y: y + 6 },
        { x: x - 6, y: y + 6 },
      ],
      seed,
      0.5,
      true,
    );
    c.fillStyle =
      night > 0.15
        ? "rgba(224,170,74," + (0.25 + 0.45 * night).toFixed(2) + ")"
        : "rgba(120,110,90,0.16)";
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.2;
    c.stroke();
    seg(c, x, y - 6, x, y + 6, seed + 1, 0.8, INK2);
    seg(c, x - 6, y, x + 6, y, seed + 2, 0.8, INK2);
  }

  function smoke(c, x, y, t, seed, n) {
    c.fillStyle = "rgba(110,104,94,0.15)";
    for (let i = 0; i < (n || 3); i++) {
      const k = (t * 0.24 + i * 0.37 + ZS.hash(seed + i)) % 1;
      c.beginPath();
      c.arc(x + ZS.jit(seed + 20 + i) * 3 + k * 4, y - k * 26, 2.5 + k * 4.5, 0, 7);
      c.fill();
    }
  }

  function flames(c, x, y, t, seed, k) {
    const fl = (seed + ((t * 12) | 0) * 7) % 997;
    const a = (v) => (v * k).toFixed(2);
    c.lineCap = "round";
    c.strokeStyle = EMBER + a(0.85) + ")";
    c.lineWidth = 1.5;
    ZS.wline(c, x - 3, y, x - 4 + ZS.sjit(fl) * 2, y - 13 - ZS.jit(fl) * 4, fl + 1, 0.9);
    c.strokeStyle = RUST + a(0.7) + ")";
    ZS.wline(c, x + 1, y, x + 1 + ZS.sjit(fl + 3) * 2.5, y - 17 - ZS.jit(fl + 3) * 4, fl + 4, 0.9);
    c.strokeStyle = EMBER + a(0.7) + ")";
    ZS.wline(c, x + 3.5, y, x + 5 + ZS.sjit(fl + 6) * 2, y - 12 - ZS.jit(fl + 6) * 3, fl + 7, 0.9);
    c.strokeStyle = "rgba(214,164,74," + a(0.85) + ")";
    c.lineWidth = 1.3;
    ZS.wline(
      c,
      x + ZS.sjit(fl + 8) * 1.5,
      y,
      x + ZS.sjit(fl + 8) * 2.5,
      y - 9 - ZS.jit(fl + 8) * 2,
      fl + 8,
      0.7,
    );
  }

  function rubble(c, x, y, seed, n) {
    c.strokeStyle = "rgba(96,88,78,0.6)";
    c.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const px = x + (ZS.hash(seed + i * 2.1) - 0.5) * 26;
      const py = y + (ZS.hash(seed + i * 3.7) - 0.5) * 12;
      ZS.wcirc(c, px, py, 1.4 + ZS.hash(seed + i) * 2.2, seed + i * 5, 0.4);
    }
  }

  function blob(c, x, y, r, seed, fill, col) {
    const n = 6;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const an = (i / n) * Math.PI * 2;
      const rr = r * (0.78 + ZS.hash(seed + i) * 0.44);
      pts.push({ x: x + Math.cos(an) * rr, y: y + Math.sin(an) * rr * 0.8 });
    }
    ZS.wpoly(c, pts, seed, 0.5, true);
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = col || INK;
    c.lineWidth = 1.3;
    c.stroke();
  }

  // battle damage: hatch cracks that deepen with the hurt
  function cracks(c, s) {
    const f = s.hp / s.maxHp;
    if (f > 0.72) return;
    const k = f > 0.42 ? 2 : f > 0.2 ? 4 : 6;
    c.strokeStyle = f > 0.2 ? "rgba(70,58,44,0.55)" : "rgba(60,44,32,0.8)";
    c.lineWidth = f > 0.2 ? 1 : 1.4;
    for (let i = 0; i < k; i++) {
      const px = s.x + 6 + ZS.hash(s.seed + i * 5.1) * (s.w - 12);
      const py = s.y + 4 + ZS.hash(s.seed + i * 7.3 + 1) * (s.h - 8);
      const len = 5 + ZS.hash(s.seed + i * 3.9) * 9;
      const an = ZS.hash(s.seed + i * 2.7) * 6.28;
      ZS.wline(
        c,
        px,
        py,
        px + Math.cos(an) * len,
        py + Math.sin(an) * len * 0.6,
        s.seed + 200 + i * 4,
        0.7,
      );
    }
  }

  /* ---------- per-kind art ---------- */

  // a plain cottage: footprint walls, a gable, a door, two windows
  function cottage(c, s, t, env, opt) {
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h,
      yb = y + h;
    floor(c, s, (opt && opt.floor) || FLOOR);
    seg(c, x, yb, x, y, s.seed + 1, 2);
    seg(c, x + w, yb, x + w, y, s.seed + 2, 2);
    seg(c, x, y, x + w, y, s.seed + 3, 1.7);
    seg(c, x, yb, x + w, yb, s.seed + 4, 1.7);
    gable(c, s, opt && opt.lift, opt && opt.roof);
    door(c, s, opt && opt.dw ? opt.dw : 22, Math.min(30, h * 0.5));
    windowLit(c, x + w * 0.22, y + h * 0.42, s.seed + 51, env.night);
    windowLit(c, x + w * 0.78, y + h * 0.42, s.seed + 55, env.night);
  }

  function drawHall(c, s, t, env) {
    floor(c, s, "rgba(198,182,150,0.3)");
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h,
      yb = y + h;
    seg(c, x, yb, x, y, s.seed + 1, 2.4);
    seg(c, x + w, yb, x + w, y, s.seed + 2, 2.4);
    seg(c, x, y, x + w, y, s.seed + 3, 1.9);
    seg(c, x, yb, x + w, yb, s.seed + 4, 1.9);
    const g = gable(c, s, 6, "rgba(150,116,60,0.32)");
    // the chimney, behind the ridge
    seg(c, x + w - 26, y - 4, x + w - 26, y - 30, s.seed + 61, 1.6);
    seg(c, x + w - 16, y - 2, x + w - 16, y - 28, s.seed + 62, 1.6);
    seg(c, x + w - 28, y - 30, x + w - 14, y - 30, s.seed + 63, 1.6);
    smoke(c, x + w - 21, y - 32, t, s.seed + 64, 3);
    // a wide double door + a stone step
    door(c, s, 34, Math.min(44, h * 0.44), "rgba(150,108,58,0.4)");
    seg(c, x + w / 2 - 22, yb + 3, x + w / 2 + 22, yb + 3, s.seed + 65, 1.4, INK2);
    windowLit(c, x + w * 0.2, y + h * 0.35, s.seed + 66, env.night);
    windowLit(c, x + w * 0.8, y + h * 0.35, s.seed + 70, env.night);
    // the banner pole and the flag (a pip per level)
    const px = x + 10,
      py = yb + 2;
    seg(c, px, py, px, py - 46, s.seed + 71, 1.5);
    ZS.wpoly(
      c,
      [
        { x: px + 1, y: py - 46 },
        { x: px + 20, y: py - 41 },
        { x: px + 1, y: py - 34 },
      ],
      s.seed + 72,
      0.8,
      true,
    );
    c.fillStyle = "rgba(140,74,52,0.55)";
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    c.stroke();
    // the weathervane
    seg(c, g.cx, g.ry, g.cx, g.ry - 12, s.seed + 73, 1.2, INK2);
    seg(c, g.cx - 6, g.ry - 9, g.cx + 6, g.ry - 11, s.seed + 74, 1.1, INK2);
  }

  function drawHut(c, s, t, env) {
    cottage(c, s, t, env, {});
    if (s.lvl >= 2) {
      // a lean-to woodshed on the shadow side
      const x = s.x - 4,
        y = s.y + s.h;
      seg(c, x, y, x - 16, y + 4, s.seed + 81, 1.4, INK2);
      seg(c, x, y - 22, x - 16, y - 14, s.seed + 82, 1.4, INK2);
      seg(c, x - 16, y + 4, x - 16, y - 14, s.seed + 83, 1.3, INK2);
    }
  }

  function drawFarm(c, s, _t, _env) {
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h,
      yb = y + h;
    floor(c, s, "rgba(150,116,74,0.22)");
    // the tilled rows
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const ry = y + 12 + (r * (h - 22)) / (rows - 1 || 1);
      seg(c, x + 8, ry, x + w - 8, ry, s.seed + 10 + r * 4, 1.1, "rgba(122,92,56,0.55)");
    }
    // the crop: empty · sprouts · growing · ripe
    const st = s.plot ? s.plot.stage : 0;
    const per = 6;
    for (let r = 0; r < rows; r++) {
      const ry = y + 12 + (r * (h - 22)) / (rows - 1 || 1);
      for (let i = 0; i < per; i++) {
        const px = x + 14 + (i * (w - 28)) / (per - 1);
        const sd = s.seed + r * 31 + i * 7;
        if (st === 1) {
          c.strokeStyle = LEAF;
          c.lineWidth = 1;
          ZS.wline(c, px - 2, ry, px - 3.5, ry - 4, sd, 0.3);
          ZS.wline(c, px + 2, ry, px + 3.5, ry - 4, sd + 1, 0.3);
        } else if (st === 2) {
          c.strokeStyle = LEAF;
          c.lineWidth = 1.1;
          ZS.wline(c, px, ry, px + ZS.sjit(sd) * 1.5, ry - 9, sd + 2, 0.4);
          ZS.wline(c, px, ry - 4, px - 4, ry - 7, sd + 3, 0.3);
        } else if (st >= 3) {
          c.strokeStyle = "rgba(120,110,50,0.9)";
          c.lineWidth = 1.1;
          ZS.wline(c, px, ry, px + ZS.sjit(sd) * 1.5, ry - 11, sd + 4, 0.4);
          c.strokeStyle = GOLD;
          c.lineWidth = 1.6;
          ZS.wline(c, px - 2, ry - 11, px + 2, ry - 14, sd + 5, 0.3);
        }
      }
    }
    // the fence: posts and two rails
    for (let i = 0; i <= 4; i++) {
      const px = x + (i * w) / 4;
      seg(c, px, yb, px, yb - 9, s.seed + 60 + i * 3, 1.2, INK2);
      seg(c, px, y, px, y - 7, s.seed + 80 + i * 3, 1.2, INK2);
    }
    seg(c, x, yb - 4, x + w, yb - 4, s.seed + 90, 1, INK2);
    seg(c, x, y - 4, x + w, y - 4, s.seed + 91, 1, INK2);
    // watered: a damp shimmer on the soil
    if (s.plot && s.plot.wet > 0) {
      c.strokeStyle = "rgba(96,138,166,0.35)";
      c.lineWidth = 1;
      for (let i = 0; i < 4; i++)
        ZS.wline(c, x + 12 + i * 22, yb - 8, x + 20 + i * 22, yb - 10, s.seed + 120 + i, 0.6);
    }
  }

  function drawWall(c, s, _t, _env) {
    const x = s.x,
      yb = s.y + s.h,
      w = s.w;
    if (s.lvl >= 2) {
      // the stone version: a low block wall with brick courses
      ZS.wpoly(
        c,
        [
          { x, y: yb },
          { x, y: yb - 20 },
          { x: x + w, y: yb - 20 },
          { x: x + w, y: yb },
        ],
        s.seed + 1,
        1,
        true,
      );
      c.fillStyle = STONEF;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 1.6;
      c.stroke();
      for (let i = 1; i < 5; i++) {
        const px = x + (i * w) / 5;
        seg(c, px, yb, px, yb - 20, s.seed + 10 + i, 0.9, INK2);
      }
      seg(c, x, yb - 10, x + w, yb - 10, s.seed + 20, 0.9, INK2);
      return;
    }
    // the palisade: sharpened stakes and two rails
    const n = 6;
    for (let i = 0; i < n; i++) {
      const px = x + 4 + (i * (w - 8)) / (n - 1);
      const sd = s.seed + i * 6.1;
      seg(c, px, yb, px, yb - 22 + ZS.sjit(sd) * 1.5, sd, 2, "rgba(112,84,48,0.9)");
      seg(c, px, yb - 22, px - 3, yb - 16, sd + 1, 1, "rgba(112,84,48,0.9)");
      seg(c, px, yb - 22, px + 3, yb - 16, sd + 2, 1, "rgba(112,84,48,0.9)");
    }
    seg(c, x, yb - 6, x + w, yb - 6, s.seed + 40, 1.5, "rgba(96,74,44,0.8)");
    seg(c, x, yb - 16, x + w, yb - 16, s.seed + 41, 1.5, "rgba(96,74,44,0.8)");
  }

  function drawShed(c, s, _t, _env) {
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h,
      yb = y + h;
    floor(c, s, "rgba(170,140,96,0.2)");
    // the lean-to: a slanted roof on two posts
    seg(c, x, yb, x, y + 12, s.seed + 1, 2);
    seg(c, x + w * 0.55, yb, x + w * 0.55, y + 20, s.seed + 2, 1.8);
    ZS.wpoly(
      c,
      [
        { x: x - 6, y: y + 10 },
        { x: x + w + 4, y: y + 22 },
        { x: x + w + 4, y: y + 27 },
        { x: x - 6, y: y + 15 },
      ],
      s.seed + 3,
      1.1,
      true,
    );
    c.fillStyle = THATCH;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.6;
    c.stroke();
    // the log pile + the chopping block with the axe
    for (let i = 0; i < 3; i++) {
      const px = x + 12 + i * 2,
        py = yb - 6 - i * 8;
      c.strokeStyle = "rgba(112,84,48,0.9)";
      c.lineWidth = 1.4;
      ZS.wcirc(c, px, py, 5.5, s.seed + 20 + i, 0.6);
      ZS.wcirc(c, px, py, 2.4, s.seed + 30 + i, 0.3);
    }
    blob(c, x + w - 16, yb - 8, 8, s.seed + 40, "rgba(150,112,60,0.35)", "rgba(104,76,40,0.85)");
    seg(c, x + w - 16, yb - 14, x + w - 8, yb - 26, s.seed + 41, 1.4, "rgba(104,76,40,0.95)");
    seg(c, x + w - 10, yb - 24, x + w - 4, yb - 22, s.seed + 42, 1.2, "rgba(112,114,118,0.9)");
  }

  function drawQuarry(c, s, _t, _env) {
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h,
      yb = y + h;
    floor(c, s, "rgba(140,132,118,0.22)");
    // the pit: a wobbly hollow
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2;
      pts.push({
        x: x + w / 2 + Math.cos(an) * (w * 0.36),
        y: y + h / 2 + Math.sin(an) * (h * 0.32),
      });
    }
    ZS.wpoly(c, pts, s.seed + 1, 1.4, true);
    c.fillStyle = "rgba(96,88,76,0.22)";
    c.fill();
    c.strokeStyle = "rgba(88,80,68,0.7)";
    c.lineWidth = 1.4;
    c.stroke();
    for (let i = 0; i < 5; i++)
      seg(
        c,
        x + 12,
        y + 12 + i * 8,
        x + w - 14,
        y + 16 + i * 8,
        s.seed + 20 + i,
        0.9,
        "rgba(96,88,76,0.5)",
      );
    blob(c, x + 12, yb - 10, 7, s.seed + 30, STONEF, "rgba(88,84,74,0.85)");
    blob(c, x + w - 12, yb - 12, 9, s.seed + 34, STONEF, "rgba(88,84,74,0.85)");
    blob(c, x + w - 30, y + 10, 6, s.seed + 38, STONEF, "rgba(88,84,74,0.85)");
    // the cart
    seg(c, x + w * 0.6, yb - 6, x + w - 6, yb - 10, s.seed + 50, 1.4);
    seg(c, x + w - 6, yb - 10, x + w - 4, yb - 20, s.seed + 51, 1.4);
    seg(c, x + w * 0.6, yb - 6, x + w * 0.58, yb - 18, s.seed + 52, 1.4);
    seg(c, x + w - 4, yb - 20, x + w * 0.58, yb - 18, s.seed + 53, 1.3);
    c.lineWidth = 1.2;
    ZS.wcirc(c, x + w - 14, yb - 6, 4.5, s.seed + 54, 0.5);
    ZS.wcirc(c, x + w * 0.7, yb - 3, 4.5, s.seed + 55, 0.5);
    // a pick leaning on the rim
    seg(c, x + 6, yb - 4, x + 18, y + 6, s.seed + 60, 1.3, "rgba(104,78,44,0.95)");
  }

  function drawStore(c, s, t, env) {
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h,
      yb = y + h;
    floor(c, s, "rgba(180,158,120,0.24)");
    seg(c, x, yb, x, y, s.seed + 1, 2.2);
    seg(c, x + w, yb, x + w, y, s.seed + 2, 2.2);
    seg(c, x, y, x + w, y, s.seed + 3, 1.8);
    seg(c, x, yb, x + w, yb, s.seed + 4, 1.8);
    gable(c, s, 4, "rgba(146,118,66,0.28)");
    // the big barn door, X-braced
    door(c, s, 34, Math.min(40, h * 0.55), "rgba(150,112,60,0.34)");
    seg(c, x + w / 2 - 15, yb - 32, x + w / 2 + 15, yb - 4, s.seed + 45, 1.1, INK2);
    seg(c, x + w / 2 + 15, yb - 32, x + w / 2 - 15, yb - 4, s.seed + 46, 1.1, INK2);
    // crates and sacks outside
    const bx = x + w + 6,
      by = yb - 4;
    ZS.wpoly(
      c,
      [
        { x: bx, y: by },
        { x: bx + 16, y: by - 2 },
        { x: bx + 15, y: by - 14 },
        { x: bx + 1, y: by - 13 },
      ],
      s.seed + 50,
      0.7,
      true,
    );
    c.fillStyle = WOOD;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    c.stroke();
    seg(c, bx + 1, by - 13, bx + 15, by - 2, s.seed + 51, 0.9, INK2);
    blob(c, bx + 26, by - 6, 7, s.seed + 55, "rgba(178,168,140,0.45)", "rgba(110,102,84,0.8)");
    // a lantern by the door
    c.fillStyle = "rgba(224,170,74," + (0.25 + 0.6 * env.night).toFixed(2) + ")";
    c.beginPath();
    c.arc(x + w / 2 + 24, yb - 26, 3.4, 0, 7);
    c.fill();
  }

  function drawTower(c, s, t, env) {
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h,
      yb = y + h;
    const H = 40 + s.lvl * 9;
    floor(c, s, "rgba(170,150,120,0.16)");
    // four splayed legs with cross braces
    const inset = 7;
    const legs = [
      [x, yb, x + inset, yb - H],
      [x + w, yb, x + w - inset, yb - H],
      [x + w * 0.5, yb - 4, x + w * 0.5 + inset * 0.4, yb - H],
      [x + w * 0.72, yb - 4, x + w * 0.72 - inset * 0.4, yb - H],
    ];
    for (let i = 0; i < legs.length; i++) {
      const L = legs[i];
      seg(c, L[0], L[1], L[2], L[3], s.seed + i * 4, 1.8, "rgba(108,82,50,0.95)");
    }
    for (let k = 1; k <= 2; k++) {
      const f = k / 3;
      seg(
        c,
        x + inset * f,
        yb - H * f,
        x + w - inset * f,
        yb - H * f,
        s.seed + 30 + k * 4,
        1.2,
        INK2,
      );
    }
    seg(c, x + inset, yb - H * 0.5, x + w - inset, yb - H, s.seed + 40, 1, INK2);
    seg(c, x + w - inset, yb - H * 0.5, x + inset, yb - H, s.seed + 41, 1, INK2);
    // the platform + railing + a little roof
    seg(c, x - 4, yb - H, x + w + 4, yb - H, s.seed + 50, 2.2);
    for (let i = 0; i <= 3; i++) {
      const px = x - 2 + (i * (w + 4)) / 3;
      seg(c, px, yb - H, px, yb - H - 9, s.seed + 60 + i * 3, 1.2, INK2);
    }
    seg(c, x - 3, yb - H - 9, x + w + 3, yb - H - 9, s.seed + 70, 1.2, INK2);
    ZS.wpoly(
      c,
      [
        { x: x - 8, y: yb - H - 9 },
        { x: x + w / 2, y: yb - H - 24 },
        { x: x + w + 8, y: yb - H - 9 },
      ],
      s.seed + 71,
      1,
      true,
    );
    c.fillStyle = THATCH;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.stroke();
    // the ladder
    seg(c, x + w * 0.2, yb, x + w * 0.28, yb - H, s.seed + 80, 1.2, INK2);
    seg(c, x + w * 0.3, yb, x + w * 0.38, yb - H, s.seed + 81, 1.2, INK2);
    for (let i = 1; i < 6; i++) {
      const f = i / 6;
      seg(
        c,
        x + w * 0.2 + w * 0.08 * f,
        yb - H * f,
        x + w * 0.3 + w * 0.08 * f,
        yb - H * f,
        s.seed + 90 + i,
        0.9,
        INK2,
      );
    }
    if (env.night > 0.2) {
      c.fillStyle = "rgba(224,170,74," + (0.18 + 0.4 * env.night).toFixed(2) + ")";
      c.beginPath();
      c.arc(x + w / 2, yb - H - 4, 4, 0, 7);
      c.fill();
    }
  }

  function drawPost(c, s, t, env) {
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h,
      yb = y + h;
    floor(c, s, "rgba(170,150,120,0.18)");
    cottage(c, s, t, env, { lift: -6, dw: 20, roof: "rgba(140,116,70,0.28)" });
    // the rack: three spears, crossed
    for (let i = 0; i < 3; i++) {
      const px = x + w + 8 + i * 5;
      seg(c, px, yb, px + 3, yb - 34, s.seed + 20 + i * 3, 1.3, "rgba(108,84,52,0.95)");
      ZS.wpoly(
        c,
        [
          { x: px + 3, y: yb - 34 },
          { x: px + 6, y: yb - 27 },
          { x: px + 0.5, y: yb - 28 },
        ],
        s.seed + 30 + i,
        0.3,
        true,
      );
      c.fillStyle = "rgba(126,128,132,0.75)";
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 1;
      c.stroke();
    }
    // the shield on the wall
    ZS.wpoly(
      c,
      [
        { x: x + w * 0.3, y: y + h * 0.25 },
        { x: x + w * 0.42, y: y + h * 0.32 },
        { x: x + w * 0.36, y: y + h * 0.62 },
        { x: x + w * 0.24, y: y + h * 0.62 },
        { x: x + w * 0.18, y: y + h * 0.32 },
      ],
      s.seed + 40,
      0.6,
      true,
    );
    c.fillStyle = "rgba(112,128,148,0.4)";
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    c.stroke();
    // the pennant
    seg(c, x + 6, yb, x + 6, yb - 40, s.seed + 50, 1.4);
    ZS.wpoly(
      c,
      [
        { x: x + 7, y: yb - 40 },
        { x: x + 22, y: yb - 35 },
        { x: x + 7, y: yb - 29 },
      ],
      s.seed + 51,
      0.7,
      true,
    );
    c.fillStyle = "rgba(72,96,120,0.55)";
    c.fill();
    c.stroke();
  }

  function drawShop(c, s, t, env) {
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h,
      yb = y + h;
    cottage(c, s, t, env, { floor: "rgba(180,158,120,0.22)", roof: "rgba(140,112,62,0.28)" });
    // the chimney + the forge smoke
    seg(c, x + w - 16, y + 4, x + w - 16, y - 22, s.seed + 60, 1.6);
    seg(c, x + w - 8, y + 6, x + w - 8, y - 20, s.seed + 61, 1.6);
    seg(c, x + w - 18, y - 22, x + w - 6, y - 22, s.seed + 62, 1.5);
    smoke(c, x + w - 12, y - 24, t, s.seed + 63, 3);
    if (s.workT > 0) {
      // sparks while the shop is turning something out
      c.fillStyle = "rgba(214,164,74,0.7)";
      for (let i = 0; i < 3; i++) {
        const k = (t * 2.2 + i * 0.4) % 1;
        c.beginPath();
        c.arc(x + 8 + k * 12, yb - 6 - k * 14, 1.1, 0, 7);
        c.fill();
      }
    }
    // the grindstone
    c.strokeStyle = "rgba(104,100,92,0.9)";
    c.lineWidth = 1.3;
    ZS.wcirc(c, x + w + 14, yb - 12, 9, s.seed + 70, 0.6);
    ZS.wcirc(c, x + w + 14, yb - 12, 3, s.seed + 71, 0.3);
    seg(c, x + w + 14, yb - 12, x + w + 22, yb - 18, s.seed + 72, 1.1, INK2);
  }

  function drawInfirm(c, s, t, env) {
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h,
      yb = y + h;
    cottage(c, s, t, env, { floor: "rgba(200,190,170,0.26)" });
    // the red cross over the door
    const cx = x + w / 2,
      cy = yb - 22;
    c.strokeStyle = "rgba(158,58,42,0.9)";
    c.lineWidth = 2.6;
    seg(c, cx - 7, cy, cx + 7, cy, s.seed + 60, 0.4, "rgba(158,58,42,0.9)");
    seg(c, cx, cy - 6, cx, cy + 6, s.seed + 61, 0.4, "rgba(158,58,42,0.9)");
    // the herb bundle + a water barrel
    c.strokeStyle = LEAF;
    c.lineWidth = 1.1;
    for (let i = 0; i < 4; i++)
      ZS.wline(c, x + w + 6, y + 12, x + w + 2 + i * 3, y + 24, s.seed + 70 + i, 0.4);
    blob(c, x - 12, yb - 8, 7, s.seed + 80, "rgba(150,112,60,0.3)", "rgba(104,76,40,0.85)");
    seg(c, x - 16, yb - 10, x - 8, yb - 10, s.seed + 81, 1, INK2);
  }

  function drawWell(c, s, _t, _env) {
    const cx = s.x + s.w / 2,
      cy = s.y + s.h / 2;
    floor(c, s, "rgba(150,146,136,0.2)");
    // the stone ring
    ZS.wpoly(
      c,
      [
        { x: cx - 16, y: cy + 8 },
        { x: cx - 10, y: cy - 10 },
        { x: cx + 10, y: cy - 10 },
        { x: cx + 16, y: cy + 8 },
        { x: cx, y: cy + 14 },
      ],
      s.seed + 1,
      0.8,
      true,
    );
    c.fillStyle = STONEF;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.6;
    c.stroke();
    ZS.wcirc(c, cx, cy - 2, 9, s.seed + 2, 0.7);
    c.fillStyle = "rgba(96,138,166,0.28)";
    c.fill();
    // the posts, the crossbar, the little roof, the bucket
    seg(c, cx - 12, cy - 8, cx - 12, cy - 30, s.seed + 3, 1.6);
    seg(c, cx + 12, cy - 8, cx + 12, cy - 30, s.seed + 4, 1.6);
    seg(c, cx - 14, cy - 30, cx + 14, cy - 30, s.seed + 5, 1.5);
    ZS.wpoly(
      c,
      [
        { x: cx - 18, y: cy - 30 },
        { x: cx, y: cy - 42 },
        { x: cx + 18, y: cy - 30 },
      ],
      s.seed + 6,
      0.9,
      true,
    );
    c.fillStyle = THATCH;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.stroke();
    seg(c, cx, cy - 30, cx, cy - 20, s.seed + 7, 1, INK2);
    ZS.wpoly(
      c,
      [
        { x: cx - 4, y: cy - 20 },
        { x: cx + 4, y: cy - 20 },
        { x: cx + 3, y: cy - 13 },
        { x: cx - 3, y: cy - 13 },
      ],
      s.seed + 8,
      0.4,
      true,
    );
    c.fillStyle = "rgba(150,112,60,0.5)";
    c.fill();
    c.stroke();
  }

  function drawBeacon(c, s, t, env) {
    const cx = s.x + s.w / 2,
      cy = s.y + s.h / 2 + 6;
    floor(c, s, "rgba(90,80,64,0.16)");
    // the stone ring
    for (let i = 0; i < 7; i++) {
      const an = (i / 7) * Math.PI * 2 + 0.3;
      ZS.wcirc(c, cx + Math.cos(an) * 15, cy + Math.sin(an) * 8, 3.4, s.seed + i * 3, 0.4);
    }
    // the crossed logs
    for (let i = 0; i < 3; i++) {
      const an = 0.6 + i * 1.1;
      seg(
        c,
        cx - Math.cos(an) * 11,
        cy - Math.sin(an) * 6,
        cx + Math.cos(an) * 11,
        cy + Math.sin(an) * 6,
        s.seed + 20 + i * 3,
        2,
        "rgba(112,84,48,0.95)",
      );
    }
    const k = s.lit === false ? 0 : 1;
    if (k) flames(c, cx, cy, t, s.seed + 40, 0.55 + 0.45 * env.night);
  }

  /* ---------- ruins and building sites ---------- */

  function drawRuin(c, s, _t, _env) {
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h,
      yb = y + h;
    floor(c, s, "rgba(150,140,124,0.2)");
    // three broken walls, a gap where the door was
    rseg(c, x, yb, x, y, s.seed + 1);
    rseg(c, x + w, yb, x + w, y, s.seed + 2);
    rseg(c, x, y, x + w, y, s.seed + 3);
    rseg(c, x, yb, x + w * 0.36, yb, s.seed + 4);
    rseg(c, x + w * 0.64, yb, x + w, yb, s.seed + 5);
    // the collapsed roof: two fallen beams inside the footprint
    seg(c, x + 6, y + 8, x + w * 0.6, yb - 8, s.seed + 10, 1.6, "rgba(104,80,48,0.8)");
    seg(c, x + w * 0.35, y + 6, x + w - 8, yb - 12, s.seed + 11, 1.6, "rgba(104,80,48,0.8)");
    seg(c, x + w * 0.2, yb - 6, x + w * 0.5, y + 12, s.seed + 12, 1.2, "rgba(104,80,48,0.6)");
    // a leaning post and the rubble
    seg(c, x + w - 6, yb, x + w - 14, y + 6, s.seed + 13, 1.8, "rgba(104,80,48,0.9)");
    rubble(c, x + w * 0.3, yb - 4, s.seed + 20, 5);
    rubble(c, x + w * 0.7, yb - 2, s.seed + 30, 4);
    // weeds in the doorway
    c.strokeStyle = "rgba(104,124,62,0.6)";
    c.lineWidth = 1;
    for (let i = 0; i < 4; i++)
      ZS.wline(
        c,
        x + w * 0.44 + i * 5,
        yb,
        x + w * 0.44 + i * 5 + ZS.jit(s.seed + i) * 2,
        yb - 8,
        s.seed + 40 + i,
        0.8,
      );
  }

  function drawSite(c, s, _t, _env) {
    const x = s.x,
      y = s.y,
      w = s.w,
      h = s.h,
      yb = y + h;
    // the marked-out footprint: dashed, hand-drawn
    c.strokeStyle = "rgba(96,116,72,0.75)";
    c.lineWidth = 1.2;
    const dash = (x1, y1, x2, y2, sd) => {
      const n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 12));
      for (let i = 0; i < n; i += 2) {
        const t0 = i / n,
          t1 = Math.min(1, (i + 1) / n);
        ZS.wline(
          c,
          x1 + (x2 - x1) * t0,
          y1 + (y2 - y1) * t0,
          x1 + (x2 - x1) * t1,
          y1 + (y2 - y1) * t1,
          sd + i,
          0.7,
        );
      }
    };
    dash(x, y, x + w, y, s.seed + 1);
    dash(x + w, y, x + w, yb, s.seed + 2);
    dash(x + w, yb, x, yb, s.seed + 3);
    dash(x, yb, x, y, s.seed + 4);
    // corner stakes + the material pile
    for (let i = 0; i < 4; i++) {
      const px = i < 2 ? x : x + w,
        py = i % 2 ? yb : y;
      seg(
        c,
        px,
        py,
        px + (i < 2 ? 3 : -3),
        py - 12,
        s.seed + 10 + i * 3,
        1.4,
        "rgba(112,84,48,0.9)",
      );
    }
    const p = s.prog || 0;
    if (p < 0.9) {
      for (let i = 0; i < 3; i++) {
        const px = x + w * 0.5 + (i - 1) * 7;
        c.strokeStyle = "rgba(112,84,48,0.9)";
        c.lineWidth = 1.6;
        ZS.wcirc(c, px, yb - 8 - (i === 1 ? 6 : 0), 5, s.seed + 30 + i, 0.5);
      }
    }
    // the frame rises as the work does
    if (p > 0.35) {
      c.strokeStyle = "rgba(120,96,62,0.85)";
      c.lineWidth = 1.6;
      const up = Math.min(1, (p - 0.35) / 0.5) * (h - 6);
      seg(c, x, yb, x, yb - up, s.seed + 40, 1.6, "rgba(120,96,62,0.85)");
      seg(c, x + w, yb, x + w, yb - up, s.seed + 41, 1.6, "rgba(120,96,62,0.85)");
      if (p > 0.6) seg(c, x, yb - up, x + w, yb - up, s.seed + 42, 1.5, "rgba(120,96,62,0.85)");
    }
    // the progress arc over the site
    c.strokeStyle = "rgba(96,132,58,0.9)";
    c.lineWidth = 2.2;
    c.beginPath();
    c.arc(x + w / 2, y + h / 2, 13, -Math.PI / 2, -Math.PI / 2 + 6.2832 * ZS.clamp(p, 0, 1));
    c.stroke();
  }

  const ART = {
    hall: drawHall,
    hut: drawHut,
    farm: drawFarm,
    wall: drawWall,
    shed: drawShed,
    quarry: drawQuarry,
    store: drawStore,
    tower: drawTower,
    post: drawPost,
    shop: drawShop,
    infirm: drawInfirm,
    well: drawWell,
    beacon: drawBeacon,
  };

  /* ---------- the module ---------- */

  const Structs = {
    CAT,
    ORDER,

    make(kind, x, y, seed, opt) {
      const c = CAT[kind];
      const s = {
        kind,
        x: Math.round(x - c.w / 2),
        y: Math.round(y - c.h / 2),
        w: c.w,
        h: c.h,
        hp: c.hp,
        maxHp: c.hp,
        lvl: 1,
        seed: seed === undefined ? Math.random() * 997 : seed,
        prog: 1,
        built: true,
        ruined: false,
        lit: true,
        workT: 0,
        inCount: 0,
        survCount: 0,
        runs: [], // the core's wall runs: the village draws its own walls
        rooms: [], // ...and skips the pre-rendered floor wash
        door: null,
      };
      s.cx = s.x + s.w / 2;
      s.cy = s.y + s.h / 2;
      if (kind === "farm") s.plot = { stage: 0, growth: 0, wet: 0, tend: 0 };
      if (opt) Object.assign(s, opt);
      return s;
    },

    // a ruin: standing, but only just (repair, don't build)
    ruin(kind, x, y, seed) {
      const s = this.make(kind, x, y, seed);
      s.ruined = true;
      s.hp = Math.round(s.maxHp * 0.22);
      if (s.plot) s.plot = { stage: 0, growth: 0, wet: 0, tend: 0 };
      return s;
    },

    // every nav cell under the footprint must be open land
    footprintClear(world, nav, x, y, w, h, skip) {
      if (x < 40 || y < 40 || x + w > world.w - 40 || y + h > world.h - 40) return false;
      for (let py = y + 4; py < y + h; py += 12)
        for (let px = x + 4; px < x + w; px += 12) if (nav.cellAt(px, py) !== 1) return false;
      for (const b of world.buildings) {
        if (b === skip) continue;
        const pad = b.kind === "wall" || w <= 20 ? 2 : 8;
        if (x < b.x + b.w + pad && x + w + pad > b.x && y < b.y + b.h + pad && y + h + pad > b.y)
          return false;
      }
      return true;
    },

    canPlace(world, nav, kind, x, y) {
      const c = CAT[kind];
      if (!c) return { ok: false, err: "unknown" };
      const bx = Math.round(x - c.w / 2),
        by = Math.round(y - c.h / 2);
      if (!this.footprintClear(world, nav, bx, by, c.w, c.h))
        return { ok: false, err: "no room here" };
      return { ok: true, x: bx, y: by };
    },

    place(world, nav, kind, x, y, opt) {
      const chk = this.canPlace(world, nav, kind, x, y);
      if (!chk.ok) return chk;
      const s = this.make(kind, chk.x + CAT[kind].w / 2, chk.y + CAT[kind].h / 2, undefined, opt);
      if (opt && opt.ruined) {
        s.ruined = true;
        s.hp = Math.round(s.maxHp * 0.22);
      }
      nav.markRect(s.x, s.y, s.w, s.h, 0);
      nav.version++;
      world.buildings.push(s);
      return { ok: true, s };
    },

    remove(world, nav, s) {
      const i = world.buildings.indexOf(s);
      if (i >= 0) world.buildings.splice(i, 1);
      nav.markRect(s.x, s.y, s.w, s.h, 1);
      nav.version++;
    },

    // the topmost structure whose footprint holds (x, y)
    pick(list, x, y) {
      let best = null;
      for (const s of list) {
        const pad = s.kind === "wall" ? 10 : 4;
        if (x < s.x - pad || x > s.x + s.w + pad || y < s.y - pad || y > s.y + s.h + pad) continue;
        if (!best || s.y + s.h > best.y + best.h) best = s;
      }
      return best;
    },

    // distance from a point to the structure's edge
    dist(s, x, y) {
      const dx = Math.max(s.x - x, 0, x - (s.x + s.w));
      const dy = Math.max(s.y - y, 0, y - (s.y + s.h));
      return Math.hypot(dx, dy);
    },

    draw(c, s, t, env) {
      c.save();
      if (!s.built) drawSite(c, s, t, env);
      else if (s.ruined) drawRuin(c, s, t, env);
      else (ART[s.kind] || drawHut)(c, s, t, env);
      if (s.built) cracks(c, s);
      // level pips, bottom-right of the footprint
      if (s.built && !s.ruined && s.lvl > 1) {
        for (let i = 0; i < s.lvl; i++) {
          c.fillStyle = "rgba(96,132,58,0.9)";
          c.beginPath();
          c.arc(s.x + s.w + 7, s.y + s.h - 6 - i * 7, 2.2, 0, 7);
          c.fill();
        }
      }
      c.restore();
    },

    // the beacon glow, painted over the world at night (drawn by the scenario)
    glow(c, s, t, night) {
      if (s.kind !== "beacon" || !s.built || s.ruined || s.lit === false) return;
      const cx = s.x + s.w / 2,
        cy = s.y + s.h / 2 + 4;
      const r = 150 + Math.sin(t * 3 + s.seed) * 6;
      const g = c.createRadialGradient(cx, cy, 8, cx, cy, r);
      g.addColorStop(0, "rgba(232,178,84," + (0.2 * night).toFixed(3) + ")");
      g.addColorStop(1, "rgba(232,178,84,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(cx, cy, r, 0, 7);
      c.fill();
    },
  };

  ZS.Structs = Structs;
})();
