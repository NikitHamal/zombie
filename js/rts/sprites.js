/* Desert Order — the drawing of things.

   Same ink as the village: every line is a boiling stroke from
   js/sketch.js, the same wobble, the same paper palette. What changes is
   the craft — these are drawn to be *correct*:

   - a tank is a hull with tracks that run, a turret that turns on its
     own bearing, and a gun that jumps back when it fires and settles;
   - a helicopter has a rotor you can see turning and a shadow on the
     ground the right distance below it;
   - infantry walk — the legs actually alternate — and face the way they
     are looking, not the way they are moving;
   - a wall joins its neighbours, so a ring reads as a ring and not as
     forty separate posts;
   - everything has a silhouette you can identify at four hundred units
     away, because that is what an RTS is actually played at.

   Detail is traded for frames on purpose: the renderer sets the level of
   detail from the zoom, and below it a tank becomes its silhouette. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE;

  /* ---------- detail level, set by the renderer ----------
     2 = everything, 1 = no fine detail, 0 = silhouette only */
  let LOD = 2;

  function setLOD(z) {
    LOD = z >= 0.72 ? 2 : z >= 0.42 ? 1 : 0;
  }

  /* ---------- small helpers ---------- */

  function ink(c, col, w, cap) {
    c.strokeStyle = col;
    c.lineWidth = w || 1.4;
    c.lineCap = cap || "round";
    c.lineJoin = "round";
  }
  function facetTint(fac, a) {
    const f = R.FACTIONS[fac] || R.FACTIONS[0];
    return (
      "rgba(" + f.ink[0] + "," + f.ink[1] + "," + f.ink[2] + "," + (a === undefined ? 0.3 : a) + ")"
    );
  }

  // a closed shape, stroked and filled, in the sketch wobble
  function shape(c, pts, seed, fillCol, strokeCol, w, amp) {
    ZS.wpoly(c, pts, seed, amp === undefined ? 1.1 : amp, true);
    if (fillCol) {
      c.fillStyle = fillCol;
      c.fill();
    }
    if (strokeCol) {
      c.strokeStyle = strokeCol;
      c.lineWidth = w || 1.4;
      c.stroke();
    }
  }

  // four corners rotated around a centre: the basis of every hull
  function boxPts(x, y, w, h, ang, offX, offY) {
    const c = Math.cos(ang),
      s = Math.sin(ang);
    const ox = offX || 0,
      oy = offY || 0;
    const pts = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ];
    return pts.map((p) => ({
      x: x + (p[0] + ox) * c - (p[1] + oy) * s,
      y: y + (p[0] + ox) * s + (p[1] + oy) * c,
    }));
  }

  // a run of wheels or roadwheels along a hull side
  function wheels(c, x, y, ang, n, span, gap, r, seed) {
    const cA = Math.cos(ang),
      sA = Math.sin(ang);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * span;
      for (const side of [-1, 1]) {
        const px = x + t * cA - side * gap * sA;
        const py = y + t * sA + side * gap * cA;
        ZS.wcirc(c, px, py, r, seed + i * 3 + (side + 1) * 40, r * 0.2);
      }
    }
  }

  // a track run with tread links that move with the vehicle
  function tracks(c, x, y, ang, len, gap, wid, phase, seed) {
    const cA = Math.cos(ang),
      sA = Math.sin(ang);
    for (const side of [-1, 1]) {
      const cx = x - side * gap * sA,
        cy = y + side * gap * cA;
      const pts = [
        {
          x: cx + (-len / 2) * cA - side * (wid / 2) * sA,
          y: cy + (-len / 2) * sA + side * (wid / 2) * cA,
        },
        {
          x: cx + (len / 2) * cA - side * (wid / 2) * sA,
          y: cy + (len / 2) * sA + side * (wid / 2) * cA,
        },
        {
          x: cx + (len / 2) * cA + side * (wid / 2) * sA,
          y: cy + (len / 2) * sA - side * (wid / 2) * cA,
        },
        {
          x: cx + (-len / 2) * cA + side * (wid / 2) * sA,
          y: cy + (-len / 2) * sA - side * (wid / 2) * cA,
        },
      ];
      shape(c, pts, seed + side * 17, "rgba(74,68,58,0.55)", "rgba(40,36,30,0.85)", 1.5, 0.7);
      if (LOD < 2) continue;
      // the links: a row of ticks that scrolls with the tread
      const n = Math.max(4, Math.round(len / 5));
      for (let i = 0; i < n; i++) {
        const f = (((i / n + phase) % 1) + 1) % 1;
        const t = (f - 0.5) * len;
        const px = cx + t * cA,
          py = cy + t * sA;
        const hx = -side * (wid / 2) * sA,
          hy = side * (wid / 2) * cA;
        c.strokeStyle = "rgba(40,36,30,0.5)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(px - hx, py - hy);
        c.lineTo(px + hx, py + hy);
        c.stroke();
      }
    }
  }

  // a gun: barrel out of a mount, with recoil and a flash
  function gun(c, x, y, ang, len, thick, recoil, flash, seed) {
    const back = recoil * 6;
    const x0 = x - Math.cos(ang) * back,
      y0 = y - Math.sin(ang) * back;
    const x1 = x0 + Math.cos(ang) * (len - back),
      y1 = y0 + Math.sin(ang) * (len - back);
    ink(c, "rgba(46,42,36,0.95)", thick || 3.2);
    ZS.wline(c, x0, y0, x1, y1, seed, 0.5);
    // the muzzle brake
    if (LOD >= 2 && len > 14) {
      const bx = x1,
        by = y1;
      ink(c, "rgba(46,42,36,0.9)", thick ? thick * 1.5 : 5);
      ZS.wline(
        c,
        bx - Math.cos(ang) * 2,
        by - Math.sin(ang) * 2,
        bx + Math.cos(ang) * 2.5,
        by + Math.sin(ang) * 2.5,
        seed + 3,
        0.3,
      );
    }
    if (flash > 0) {
      const f = flash / 0.08;
      c.save();
      c.globalAlpha = R.clamp(f, 0, 1);
      shape(
        c,
        [
          { x: x1, y: y1 },
          { x: x1 + Math.cos(ang - 0.45) * 13 * f, y: y1 + Math.sin(ang - 0.45) * 13 * f },
          { x: x1 + Math.cos(ang) * 22 * f, y: y1 + Math.sin(ang) * 22 * f },
          { x: x1 + Math.cos(ang + 0.45) * 13 * f, y: y1 + Math.sin(ang + 0.45) * 13 * f },
        ],
        seed + 91,
        "rgba(250,214,120,0.9)",
        "rgba(214,122,52,0.9)",
        1.2,
        0.6,
      );
      c.restore();
    }
  }

  function shadow(c, x, y, w, h, a) {
    c.fillStyle = "rgba(60,52,40," + (a === undefined ? 0.16 : a) + ")";
    c.beginPath();
    c.ellipse(x, y + 2, w, h, 0, 0, R.TAU);
    c.fill();
  }

  /* =====================================================================
     INFANTRY
     Small, upright, and actually walking. A squad is several men in a
     loose file, each with his own phase so they do not march in step.
     ===================================================================== */

  function man(c, x, y, ang, gait, fac, seed, armed, scale) {
    const s = scale || 1;
    const h = 11 * s;
    // which way is he looking? four directions, so he never looks wrong
    const a = ((ang % R.TAU) + R.TAU) % R.TAU;
    const back = a > Math.PI * 0.35 && a < Math.PI * 1.65;
    const side = !back;
    const flip = a > Math.PI * 0.5 && a < Math.PI * 1.5;
    const sw = Math.sin(gait) * 3.4 * s;
    const bob = Math.abs(Math.cos(gait)) * 0.8 * s;

    c.save();
    c.translate(x, y);
    if (flip) c.scale(-1, 1);
    const tint = facetTint(fac, 0.55);

    // legs
    ink(c, "rgba(58,50,42,0.95)", 1.7 * s);
    ZS.wline(c, 0, -h * 0.42, -sw, 0, seed + 1, 0.4);
    ZS.wline(c, 0, -h * 0.42, sw, 0, seed + 2, 0.4);

    // torso: a little filled wedge so he reads at distance
    shape(
      c,
      [
        { x: -2.1 * s, y: -h * 0.86 },
        { x: 2.1 * s, y: -h * 0.86 },
        { x: 1.7 * s, y: -h * 0.4 },
        { x: -1.7 * s, y: -h * 0.4 },
      ],
      seed + 3,
      tint,
      "rgba(46,40,34,0.95)",
      1.3 * s,
      0.35,
    );

    // head and helmet
    const hy = -h * 0.86 - bob;
    c.strokeStyle = "rgba(46,40,34,0.95)";
    c.lineWidth = 1.3 * s;
    c.fillStyle = "rgba(212,196,168,0.95)";
    c.beginPath();
    c.arc(0, hy - 1.7 * s, 1.7 * s, 0, R.TAU);
    c.fill();
    c.stroke();
    if (side) {
      // the helmet brim
      c.strokeStyle = "rgba(74,66,52,0.95)";
      c.lineWidth = 1.5 * s;
      c.beginPath();
      c.arc(0, hy - 1.9 * s, 2.1 * s, Math.PI * 1.08, Math.PI * 1.95);
      c.stroke();
    }

    // weapon
    if (armed !== false) {
      ink(c, "rgba(50,44,36,0.95)", 1.3 * s);
      const wy = -h * 0.72;
      ZS.wline(c, 1.2 * s, wy, 5.6 * s, wy - 2.4 * s, seed + 7, 0.3);
      if (LOD >= 2) ZS.wline(c, 1.2 * s, wy + 0.8 * s, 3.2 * s, wy - 1.2 * s, seed + 8, 0.3);
    }
    // pack, for silhouette
    if (LOD >= 2 && side) {
      shape(
        c,
        [
          { x: -1.4 * s, y: -h * 0.8 },
          { x: -3.2 * s, y: -h * 0.76 },
          { x: -3.0 * s, y: -h * 0.5 },
          { x: -1.4 * s, y: -h * 0.52 },
        ],
        seed + 11,
        "rgba(120,104,76,0.5)",
        "rgba(60,52,42,0.7)",
        1,
        0.3,
      );
    }
    c.restore();
  }

  function infantry(c, u, _t) {
    const n = u.def.squad || 1;
    const spread = n === 1 ? 0 : 6;
    const cos = Math.cos(u.va + Math.PI / 2),
      sin = Math.sin(u.va + Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spread;
      const back = (i % 2) * 4;
      const x = u.x + cos * off - Math.cos(u.va) * back;
      const y = u.y + sin * off - Math.sin(u.va) * back;
      shadow(c, x, y, 3.4, 1.6, 0.15);
      man(c, x, y, u.va, u.gait + i * 1.9, u.fac, u.seed + i * 13, true, 1);
    }
    // a crewed weapon sits on the ground in front of the team
    if (u.def.crew && LOD >= 1) {
      const wx = u.x + Math.cos(u.va) * 10,
        wy = u.y + Math.sin(u.va) * 10;
      ink(c, "rgba(46,42,36,0.9)", 1.6);
      ZS.wline(
        c,
        wx - Math.cos(u.va) * 5,
        wy - Math.sin(u.va) * 5,
        wx + Math.cos(u.va) * 12,
        wy + Math.sin(u.va) * 12,
        u.seed + 41,
        0.4,
      );
      ZS.wline(c, wx - 3, wy + 1, wx + 3, wy + 1, u.seed + 42, 0.4);
    }
    if (u.flash > 0) {
      const f = u.flash / 0.08;
      c.fillStyle = "rgba(250,220,140," + (0.7 * f).toFixed(2) + ")";
      c.beginPath();
      c.arc(u.x + Math.cos(u.va) * 8, u.y + Math.sin(u.va) * 8 - 6, 4 * f, 0, R.TAU);
      c.fill();
    }
  }

  /* =====================================================================
     WHEELED AND TRACKED VEHICLES
     ===================================================================== */

  function carBody(c, x, y, ang, L, W, seed, fac, _kind) {
    // a little narrower at the nose, which is what makes it read as
    // pointing somewhere
    const pts = [
      { x: -L / 2, y: -W / 2 },
      { x: L * 0.3, y: -W / 2 },
      { x: L / 2, y: -W / 2 + W * 0.16 },
      { x: L / 2, y: W / 2 - W * 0.16 },
      { x: L * 0.3, y: W / 2 },
      { x: -L / 2, y: W / 2 },
    ].map((p) => ({
      x: x + p.x * Math.cos(ang) - p.y * Math.sin(ang),
      y: y + p.x * Math.sin(ang) + p.y * Math.cos(ang),
    }));
    shape(c, pts, seed, facetTint(fac, 0.34), "rgba(44,38,32,0.92)", 1.7, 0.7);
    return pts;
  }

  function scout(c, u, _t) {
    shadow(c, u.x, u.y + 2, 14, 6, 0.17);
    wheels(c, u.x, u.y, u.va, 2, 18, 7, 3.4, u.seed);
    carBody(c, u.x, u.y, u.va, 26, 13, u.seed, u.fac);
    // a small open turret with a machine gun
    const tx = u.x - Math.cos(u.va) * 2,
      ty = u.y - Math.sin(u.va) * 2;
    ink(c, "rgba(44,38,32,0.95)", 1.4);
    ZS.wcirc(c, tx, ty, 4.4, u.seed + 21, 0.5);
    gun(c, tx, ty, u.va, 13, 2.2, u.recoil, u.flash, u.seed + 31);
  }

  function truck(c, u, _t) {
    shadow(c, u.x, u.y + 2, 18, 7, 0.17);
    wheels(c, u.x, u.y, u.va, 2, 24, 7.5, 4, u.seed);
    const cos = Math.cos(u.va),
      sin = Math.sin(u.va);
    // cab at the front, bed behind
    const cab = [
      { x: 6, y: -7 },
      { x: 17, y: -6 },
      { x: 17, y: 6 },
      { x: 6, y: 7 },
    ].map((p) => ({ x: u.x + p.x * cos - p.y * sin, y: u.y + p.x * sin + p.y * cos }));
    shape(c, cab, u.seed + 2, facetTint(u.fac, 0.42), "rgba(44,38,32,0.92)", 1.6, 0.5);
    const bed = [
      { x: -17, y: -7.5 },
      { x: 5, y: -7.5 },
      { x: 5, y: 7.5 },
      { x: -17, y: 7.5 },
    ].map((p) => ({ x: u.x + p.x * cos - p.y * sin, y: u.y + p.x * sin + p.y * cos }));
    shape(c, bed, u.seed + 5, "rgba(198,178,142,0.75)", "rgba(44,38,32,0.92)", 1.6, 0.6);
    // a windscreen, so you can tell which end is the front
    ink(c, "rgba(70,84,92,0.7)", 1.2);
    const w1 = { x: u.x + 16 * cos - 5 * sin, y: u.y + 16 * sin + 5 * cos };
    const w2 = { x: u.x + 16 * cos + 5 * sin, y: u.y + 16 * sin - 5 * cos };
    ZS.wline(c, w1.x, w1.y, w2.x, w2.y, u.seed + 9, 0.3);
    if (u.def.capture && LOD >= 1) {
      // a conquest truck flies a flag: it is the one that takes ground
      const fx = u.x - 12 * cos,
        fy = u.y - 12 * sin;
      ink(c, "rgba(60,52,42,0.9)", 1.3);
      ZS.wline(c, fx, fy, fx, fy - 14, u.seed + 13, 0.3);
      shape(
        c,
        [
          { x: fx, y: fy - 14 },
          { x: fx + 11, y: fy - 11.5 },
          { x: fx, y: fy - 8 },
        ],
        u.seed + 15,
        R.factionTint[u.fac],
        "rgba(44,38,32,0.8)",
        1.1,
        0.3,
      );
    }
  }

  function halftrack(c, u, _t) {
    shadow(c, u.x, u.y + 2, 20, 8, 0.18);
    tracks(c, u.x - Math.cos(u.va) * 4, u.y - Math.sin(u.va) * 4, u.va, 26, 7, 7, u.tread, u.seed);
    wheels(
      c,
      u.x + Math.cos(u.va) * 12,
      u.y + Math.sin(u.va) * 12,
      u.va,
      1,
      0,
      6.5,
      3.6,
      u.seed + 5,
    );
    carBody(c, u.x, u.y, u.va, 36, 15, u.seed, u.fac);
    // an open top with a gun ring
    const tx = u.x,
      ty = u.y;
    ink(c, "rgba(44,38,32,0.9)", 1.3);
    ZS.wcirc(c, tx, ty, 5.2, u.seed + 21, 0.5);
    gun(c, tx, ty, u.va, 12, 2, u.recoil, u.flash, u.seed + 31);
  }

  /* The tank: hull, tracks, turret on its own bearing, gun with recoil. */
  function tank(c, u, _t) {
    const big = u.def.big;
    const L = big ? 46 : u.def.key === "mtank" ? 40 : 34;
    const W = big ? 24 : u.def.key === "mtank" ? 21 : 18;
    const trW = W * 0.36;

    shadow(c, u.x + 1.5, u.y + 3, L * 0.5, W * 0.42, 0.2);
    // tracks first: they are under the hull
    tracks(c, u.x, u.y, u.va, L * 0.92, W / 2 - trW / 2 + 1, trW, u.tread, u.seed + 3);

    // hull: a flat slab, nose tapered
    const cos = Math.cos(u.va),
      sin = Math.sin(u.va);
    const hull = [
      { x: -L / 2, y: -W / 2 },
      { x: L * 0.32, y: -W / 2 },
      { x: L / 2, y: -W * 0.3 },
      { x: L / 2, y: W * 0.3 },
      { x: L * 0.32, y: W / 2 },
      { x: -L / 2, y: W / 2 },
    ].map((p) => ({ x: u.x + p.x * cos - p.y * sin, y: u.y + p.x * sin + p.y * cos }));
    shape(c, hull, u.seed + 7, facetTint(u.fac, 0.4), "rgba(40,35,29,0.95)", 1.9, 0.8);

    // the glacis line and a hatch, so the hull is not a bare box
    if (LOD >= 2) {
      ink(c, "rgba(40,35,29,0.5)", 1);
      const g1 = { x: u.x + L * 0.3 * cos - (W / 2) * sin, y: u.y + L * 0.3 * sin + (W / 2) * cos };
      const g2 = { x: u.x + L * 0.3 * cos + (W / 2) * sin, y: u.y + L * 0.3 * sin - (W / 2) * cos };
      ZS.wline(c, g1.x, g1.y, g2.x, g2.y, u.seed + 12, 0.4);
    }

    // the turret turns on its own bearing, which is the whole point
    const tOff = -L * 0.04;
    const tx = u.x + tOff * cos,
      ty = u.y + tOff * sin;
    const ta = u.turretA !== undefined ? u.turretA : u.va;
    const tL = big ? 20 : 16,
      tW = big ? 17 : 14;
    const turret = [
      { x: -tL / 2, y: -tW / 2 },
      { x: tL * 0.34, y: -tW / 2 },
      { x: tL / 2, y: -tW * 0.26 },
      { x: tL / 2, y: tW * 0.26 },
      { x: tL * 0.34, y: tW / 2 },
      { x: -tL / 2, y: tW / 2 },
    ].map((p) => ({
      x: tx + p.x * Math.cos(ta) - p.y * Math.sin(ta),
      y: ty + p.x * Math.sin(ta) + p.y * Math.cos(ta),
    }));
    shape(c, turret, u.seed + 31, facetTint(u.fac, 0.62), "rgba(40,35,29,0.95)", 1.8, 0.6);
    if (LOD >= 2) {
      // a cupola
      ink(c, "rgba(40,35,29,0.8)", 1.1);
      ZS.wcirc(c, tx - Math.cos(ta) * 3, ty - Math.sin(ta) * 3, 2.6, u.seed + 37, 0.3);
    }
    // the gun: long, thick, and it kicks
    const barrel = big ? 26 : u.def.key === "mtank" ? 22 : 18;
    gun(
      c,
      tx + Math.cos(ta) * (tL / 2),
      ty + Math.sin(ta) * (tL / 2),
      ta,
      barrel,
      big ? 4.2 : 3.4,
      u.recoil,
      u.flash,
      u.seed + 41,
    );
  }

  function artillery(c, u, _t) {
    shadow(c, u.x, u.y + 2, 21, 8, 0.18);
    tracks(c, u.x, u.y, u.va, 32, 7.5, 6.5, u.tread, u.seed + 3);
    carBody(c, u.x, u.y, u.va, 38, 17, u.seed, u.fac);
    // a long tube, raised, with the recoil running backwards
    const ta = u.turretA !== undefined ? u.turretA : u.va;
    const tx = u.x - Math.cos(u.va) * 2,
      ty = u.y - Math.sin(u.va) * 2;
    ink(c, "rgba(44,38,32,0.95)", 4.6);
    const bx = tx + Math.cos(ta) * 14,
      by = ty + Math.sin(ta) * 14;
    ZS.wline(c, tx, ty, bx, by, u.seed + 51, 0.6);
    // muzzle brake
    ink(c, "rgba(44,38,32,0.95)", 6.4);
    ZS.wline(c, bx, by, bx + Math.cos(ta) * 3.4, by + Math.sin(ta) * 3.4, u.seed + 53, 0.2);
    // a spade at the back: it is dug in when it fires
    ink(c, "rgba(44,38,32,0.8)", 2.2);
    ZS.wline(
      c,
      u.x - Math.cos(u.va) * 19,
      u.y - Math.sin(u.va) * 19 - 6,
      u.x - Math.cos(u.va) * 19,
      u.y - Math.sin(u.va) * 19 + 6,
      u.seed + 55,
      0.4,
    );
    if (u.flash > 0) gun(c, bx, by, ta, 1, 0.1, 0, u.flash, u.seed + 57);
  }

  function flak(c, u, _t) {
    shadow(c, u.x, u.y + 2, 19, 8, 0.18);
    tracks(c, u.x, u.y, u.va, 30, 7, 6.5, u.tread, u.seed + 3);
    carBody(c, u.x, u.y, u.va, 34, 16, u.seed, u.fac);
    // twin barrels on a rotating mount, tipped up
    const ta = u.turretA !== undefined ? u.turretA : u.va;
    const tx = u.x,
      ty = u.y;
    ink(c, "rgba(44,38,32,0.95)", 1.4);
    ZS.wcirc(c, tx, ty, 5.6, u.seed + 61, 0.5);
    const bl = 17;
    for (const off of [-2.2, 2.2]) {
      const ox = -Math.sin(ta) * off,
        oy = Math.cos(ta) * off;
      ink(c, "rgba(46,42,36,0.95)", 2.6);
      ZS.wline(
        c,
        tx + ox - Math.cos(ta) * 4,
        ty + oy - Math.sin(ta) * 4,
        tx + ox + Math.cos(ta) * bl,
        ty + oy + Math.sin(ta) * bl,
        u.seed + 63 + off,
        0.3,
      );
    }
    if (u.flash > 0)
      gun(c, tx + Math.cos(ta) * bl, ty + Math.sin(ta) * bl, ta, 1, 0.1, 0, u.flash, u.seed + 67);
  }

  /* =====================================================================
     AIRCRAFT
     A shadow on the ground at the right offset sells the altitude.
     ===================================================================== */

  function heli(c, u, t) {
    const alt = u.alt;
    // an airframe on rotors is never quite still: a shallow hover weave
    // that grows with altitude and stops dead once it is on the ground.
    // Seeded per unit so a flight of them does not pulse as one.
    const hover = alt > 1.5 ? Math.sin(t * 2.6 + u.seed) * (0.5 + alt * 0.018) : 0;
    const y = u.y - alt * 0.55 + hover;
    shadow(c, u.x, u.y + 3, 16, 6, R.clamp(0.2 - alt * 0.0016, 0.07, 0.2));

    c.save();
    c.translate(u.x, y);
    c.rotate(u.va + (alt > 1.5 ? Math.sin(t * 1.9 + u.seed * 0.6) * 0.022 : 0));
    const wide = u.def.wide;
    const L = wide ? 30 : 24,
      W = wide ? 11 : 9;
    // tail boom
    ink(c, "rgba(46,40,34,0.95)", wide ? 4.2 : 3.6);
    ZS.wline(c, -L * 0.28, 0, -L * 0.95, 0, u.seed + 3, 0.4);
    // tail fin and tail rotor
    ink(c, "rgba(46,40,34,0.9)", 2);
    ZS.wline(c, -L * 0.9, -4, -L * 0.86, 5, u.seed + 5, 0.3);
    if (alt > 1) {
      const tr = Math.abs(Math.sin(u.rotor * 2.2));
      ink(c, "rgba(70,64,56,0.5)", 1.2);
      ZS.wline(c, -L * 0.9, -tr * 6, -L * 0.9, tr * 6, u.seed + 7, 0.2);
    }
    // fuselage
    shape(
      c,
      [
        { x: -L * 0.3, y: -W / 2 },
        { x: L * 0.3, y: -W / 2 },
        { x: L * 0.5, y: 0 },
        { x: L * 0.3, y: W / 2 },
        { x: -L * 0.3, y: W / 2 },
      ],
      u.seed + 9,
      facetTint(u.fac, 0.5),
      "rgba(42,36,30,0.95)",
      1.7,
      0.5,
    );
    // cockpit glass
    if (LOD >= 1) {
      shape(
        c,
        [
          { x: L * 0.12, y: -W / 2 + 1 },
          { x: L * 0.4, y: -W / 6 },
          { x: L * 0.4, y: W / 6 },
          { x: L * 0.12, y: W / 2 - 1 },
        ],
        u.seed + 13,
        "rgba(120,150,166,0.55)",
        "rgba(42,36,30,0.8)",
        1,
        0.25,
      );
    }
    // skids
    if (LOD >= 2) {
      ink(c, "rgba(46,40,34,0.8)", 1.4);
      ZS.wline(c, -L * 0.2, W / 2 + 3, L * 0.22, W / 2 + 3, u.seed + 17, 0.2);
      ZS.wline(c, -L * 0.2, -W / 2 - 3, L * 0.22, -W / 2 - 3, u.seed + 18, 0.2);
    }
    c.restore();

    // the rotor: a blurred disc when it is turning, two blades when it
    // is nearly stopped, which is how you read a helicopter at a glance
    if (alt > 1 || u.rotor > 0) {
      const rr = (wide ? 21 : 17) * (u.def.wide ? 1.1 : 1);
      c.save();
      c.translate(u.x, y);
      const spin = u.rotor;
      const fast = alt > 6;
      if (fast) {
        c.globalAlpha = 0.28;
        ink(c, "rgba(70,64,56,0.8)", 1.2);
        ZS.wcirc(c, 0, 0, rr, u.seed + 21, 0.8);
        c.globalAlpha = 1;
      }
      ink(c, "rgba(50,44,38,0.9)", fast ? 2 : 2.6);
      for (let i = 0; i < 2; i++) {
        const a = spin * (fast ? 1 : 0.2) + i * Math.PI;
        ZS.wline(
          c,
          -Math.cos(a) * rr,
          -Math.sin(a) * rr * 0.55,
          Math.cos(a) * rr,
          Math.sin(a) * rr * 0.55,
          u.seed + 23 + i,
          0.6,
        );
      }
      c.restore();
    }
    // rocket pods firing
    if (u.flash > 0 && LOD >= 1) {
      const f = u.flash / 0.08;
      c.fillStyle = "rgba(252,214,130," + (0.8 * f).toFixed(2) + ")";
      c.beginPath();
      c.arc(u.x + Math.cos(u.va) * 14, y + Math.sin(u.va) * 14, 5 * f, 0, R.TAU);
      c.fill();
    }
  }

  function jet(c, u, t) {
    const alt = u.alt;
    const y = u.y - alt * 0.55;
    shadow(c, u.x, u.y + 4, 18, 6, R.clamp(0.18 - alt * 0.0014, 0.06, 0.18));
    c.save();
    c.translate(u.x, y);
    c.rotate(u.va);
    const wide = u.def.wide;
    const L = wide ? 40 : 34,
      span = wide ? 34 : 26;
    // swept wings
    shape(
      c,
      [
        { x: -L * 0.1, y: -2 },
        { x: -L * 0.42, y: -span / 2 },
        { x: -L * 0.28, y: -span / 2 },
        { x: L * 0.06, y: -2 },
        { x: L * 0.06, y: 2 },
        { x: -L * 0.28, y: span / 2 },
        { x: -L * 0.42, y: span / 2 },
        { x: -L * 0.1, y: 2 },
      ],
      u.seed + 3,
      facetTint(u.fac, 0.42),
      "rgba(42,36,30,0.95)",
      1.6,
      0.6,
    );
    // fuselage
    shape(
      c,
      [
        { x: -L * 0.5, y: -4.4 },
        { x: L * 0.3, y: -3.4 },
        { x: L * 0.5, y: 0 },
        { x: L * 0.3, y: 3.4 },
        { x: -L * 0.5, y: 4.4 },
      ],
      u.seed + 7,
      facetTint(u.fac, 0.6),
      "rgba(42,36,30,0.95)",
      1.7,
      0.4,
    );
    // tailplane
    shape(
      c,
      [
        { x: -L * 0.5, y: -2 },
        { x: -L * 0.36, y: -11 },
        { x: -L * 0.28, y: -11 },
        { x: -L * 0.34, y: -2 },
      ],
      u.seed + 11,
      facetTint(u.fac, 0.42),
      "rgba(42,36,30,0.95)",
      1.3,
      0.3,
    );
    shape(
      c,
      [
        { x: -L * 0.5, y: 2 },
        { x: -L * 0.36, y: 11 },
        { x: -L * 0.28, y: 11 },
        { x: -L * 0.34, y: 2 },
      ],
      u.seed + 13,
      facetTint(u.fac, 0.42),
      "rgba(42,36,30,0.95)",
      1.3,
      0.3,
    );
    // canopy
    if (LOD >= 1)
      shape(
        c,
        [
          { x: L * 0.12, y: -2.6 },
          { x: L * 0.34, y: -1.2 },
          { x: L * 0.34, y: 1.2 },
          { x: L * 0.12, y: 2.6 },
        ],
        u.seed + 17,
        "rgba(120,150,166,0.6)",
        "rgba(42,36,30,0.8)",
        1,
        0.2,
      );
    // engine glow
    if (alt > 4) {
      const gl = 0.5 + 0.5 * Math.abs(Math.sin(t * 8 + u.seed));
      c.fillStyle = "rgba(250,170,80," + (0.5 + gl * 0.4).toFixed(2) + ")";
      c.beginPath();
      c.moveTo(-L * 0.5, -2.6);
      c.lineTo(-L * 0.5 - 8 - gl * 6, 0);
      c.lineTo(-L * 0.5, 2.6);
      c.closePath();
      c.fill();
    }
    c.restore();
    if (u.flash > 0) {
      const f = u.flash / 0.08;
      c.fillStyle = "rgba(252,220,140," + (0.8 * f).toFixed(2) + ")";
      c.beginPath();
      c.arc(u.x + Math.cos(u.va) * 16, y + Math.sin(u.va) * 16, 4 * f, 0, R.TAU);
      c.fill();
    }
  }

  /* =====================================================================
     SHIPS
     ===================================================================== */

  function boat(c, u, t) {
    const L = u.def.key === "destroyer" ? 68 : u.def.key === "gunboat" ? 46 : u.def.wide ? 42 : 34;
    const W = u.def.key === "destroyer" ? 15 : u.def.wide ? 15 : 12;
    shadow(c, u.x, u.y + 4, L * 0.5, W * 0.5, 0.14);
    // a hull rides the swell: a slow bob and a slower roll about its own
    // centre. Both come off the clock and off the unit's own seed, so a
    // fleet at anchor never heaves in lockstep.
    const bob = Math.sin(t * 1.7 + u.seed) * 0.9;
    const roll = Math.sin(t * 1.15 + u.seed * 0.7) * 0.03;
    c.save();
    c.translate(u.x, u.y);
    c.rotate(roll);
    c.translate(-u.x, -u.y + bob);
    const cos = Math.cos(u.va),
      sin = Math.sin(u.va);
    // hull: pointed at the bow, square at the stern
    const hull = [
      { x: -L / 2, y: -W / 2 },
      { x: L * 0.3, y: -W / 2 },
      { x: L / 2, y: 0 },
      { x: L * 0.3, y: W / 2 },
      { x: -L / 2, y: W / 2 },
    ].map((p) => ({ x: u.x + p.x * cos - p.y * sin, y: u.y + p.x * sin + p.y * cos }));
    shape(c, hull, u.seed + 3, facetTint(u.fac, 0.38), "rgba(40,35,29,0.95)", 1.8, 0.7);
    // deck line
    if (LOD >= 2) {
      ink(c, "rgba(196,178,146,0.6)", 1.2);
      const d1 = {
        x: u.x + L * 0.34 * cos - (W / 2 - 1) * sin,
        y: u.y + L * 0.34 * sin + (W / 2 - 1) * cos,
      };
      const d2 = { x: u.x - (L / 2 - 1) * cos, y: u.y - (L / 2 - 1) * sin };
      ZS.wline(c, d1.x, d1.y, d2.x, d2.y, u.seed + 9, 0.4);
    }
    // superstructure
    const sx = u.x - L * 0.08 * cos,
      sy = u.y - L * 0.08 * sin;
    shape(
      c,
      boxPts(sx, sy, L * 0.24, W * 0.62, u.va, 0, 0),
      u.seed + 13,
      "rgba(206,190,158,0.9)",
      "rgba(42,36,30,0.9)",
      1.5,
      0.4,
    );
    // funnel
    if (LOD >= 2) {
      const fx = u.x - L * 0.2 * cos,
        fy = u.y - L * 0.2 * sin;
      ink(c, "rgba(42,36,30,0.9)", 1.3);
      ZS.wcirc(c, fx, fy, 3, u.seed + 17, 0.3);
    }
    // guns
    const ta = u.turretA !== undefined ? u.turretA : u.va;
    const tx = u.x + L * 0.24 * cos,
      ty = u.y + L * 0.24 * sin;
    if (!u.def.unarmed) {
      ink(c, "rgba(42,36,30,0.95)", 1.3);
      ZS.wcirc(c, tx, ty, 4.6, u.seed + 21, 0.4);
      gun(c, tx, ty, ta, u.def.key === "destroyer" ? 20 : 14, 3, u.recoil, u.flash, u.seed + 23);
    }
    // destroyers carry flak as well, on their own mount
    if (u.def.w2 && LOD >= 1) {
      const ax = u.x - L * 0.3 * cos,
        ay = u.y - L * 0.3 * sin;
      ink(c, "rgba(42,36,30,0.9)", 1.2);
      ZS.wcirc(c, ax, ay, 3.4, u.seed + 27, 0.3);
      ink(c, "rgba(46,42,36,0.9)", 2);
      ZS.wline(c, ax, ay, ax + Math.cos(ta) * 11, ay + Math.sin(ta) * 11, u.seed + 29, 0.3);
    }
    c.restore();
  }

  /* =====================================================================
     THE ROT
     Five silhouettes, all wrong in the same way: too tall, too low, and
     moving when they should be still.
     ===================================================================== */

  function zed(c, u, _t) {
    const key = u.key;
    const big = u.def.big;
    const s = big ? 1.7 : 1;
    const gait = u.gait;
    const sw = Math.sin(gait) * (key === "zrunner" ? 5 : 3) * s;
    const lurch = Math.sin(gait * 0.5) * 2.2 * s;
    shadow(c, u.x, u.y + 2, 4 * s, 2 * s, 0.16);

    c.save();
    c.translate(u.x, u.y);
    c.rotate(Math.sin(gait * 0.4) * 0.12); // the stagger
    const flip = Math.cos(u.va) < 0;
    if (flip) c.scale(-1, 1);
    const h = 12 * s;
    const tint =
      key === "zhulk"
        ? "rgba(96,110,78,0.75)"
        : key === "zbrute"
          ? "rgba(122,116,84,0.7)"
          : "rgba(124,126,102,0.65)";

    // legs, dragging
    ink(c, "rgba(64,58,48,0.95)", 1.8 * s);
    ZS.wline(c, 0, -h * 0.44, -sw - 1, 0, u.seed + 1, 0.5);
    ZS.wline(c, 0, -h * 0.44, sw + 1, 0, u.seed + 2, 0.5);
    // torso
    shape(
      c,
      [
        { x: -2.4 * s, y: -h * 0.88 },
        { x: 2.6 * s, y: -h * 0.84 },
        { x: 2 * s, y: -h * 0.4 },
        { x: -2 * s, y: -h * 0.42 },
      ],
      u.seed + 3,
      tint,
      "rgba(48,42,36,0.95)",
      1.4 * s,
      0.45,
    );
    // arms out front: the classic reach
    ink(c, "rgba(64,58,48,0.95)", 1.7 * s);
    const armY = -h * 0.78 + lurch;
    ZS.wline(c, 0.6 * s, armY, 6.4 * s, armY + 2.6 * s, u.seed + 5, 0.5);
    ZS.wline(c, 0.6 * s, armY, 6.0 * s, armY - 1.4 * s, u.seed + 6, 0.5);
    // head, hanging
    const hy = -h * 0.9 + lurch * 0.4;
    c.fillStyle = "rgba(168,170,142,0.95)";
    c.strokeStyle = "rgba(48,42,36,0.95)";
    c.lineWidth = 1.3 * s;
    c.beginPath();
    c.arc(1.4 * s, hy, 2 * s, 0, R.TAU);
    c.fill();
    c.stroke();
    // an eye, because it should look at you
    if (LOD >= 2) {
      c.fillStyle = "rgba(104,74,112,0.95)";
      c.beginPath();
      c.arc(2.2 * s, hy - 0.5 * s, 0.6 * s, 0, R.TAU);
      c.fill();
    }
    c.restore();
  }

  /* =====================================================================
     BUILDINGS
     A footprint, a body with height, and the thing that makes it what it
     is: a chimney, a runway, a slipway, a gun.
     ===================================================================== */

  // a slab with a top face and a front face: the cheapest honest height
  function slab(c, x, y, w, h, ht, seed, bodyCol, topCol, stroke) {
    const top = [
      { x: x - w / 2, y: y - h / 2 - ht },
      { x: x + w / 2, y: y - h / 2 - ht },
      { x: x + w / 2, y: y + h / 2 - ht },
      { x: x - w / 2, y: y + h / 2 - ht },
    ];
    const front = [
      { x: x - w / 2, y: y + h / 2 - ht },
      { x: x + w / 2, y: y + h / 2 - ht },
      { x: x + w / 2, y: y + h / 2 },
      { x: x - w / 2, y: y + h / 2 },
    ];
    shape(c, front, seed + 3, "rgba(148,128,98,0.85)", stroke || "rgba(52,45,37,0.9)", 1.5, 0.8);
    shape(c, top, seed, topCol || bodyCol, stroke || "rgba(52,45,37,0.95)", 1.6, 0.9);
    return top;
  }

  function factory(c, b, _t) {
    const s = b.size * TILE;
    const w = s * 0.86,
      h = s * 0.72,
      ht = 16 + b.lvl * 3;
    const col = facetTint(b.fac, 0.16);
    slab(c, b.x, b.y, w, h, ht, b.seed, col, "rgba(214,198,166,0.95)");
    const x = b.x,
      y = b.y - ht;
    // a sawtooth roof: the thing that makes a factory a factory
    ink(c, "rgba(52,45,37,0.75)", 1.2);
    const n = Math.max(2, Math.round(w / (s * 0.22)));
    for (let i = 0; i < n; i++) {
      const px = x - w / 2 + ((i + 0.5) / n) * w;
      ZS.wline(c, px, y - h / 2 + 3, px, y + h / 2 - 3, b.seed + 10 + i, 0.5);
    }
    // chimney, smoking if it is working
    const chx = x + w / 2 - s * 0.14,
      chy = y - h / 2 + s * 0.16;
    shape(
      c,
      [
        { x: chx - 5, y: chy - 22 },
        { x: chx + 5, y: chy - 22 },
        { x: chx + 4, y: chy + 4 },
        { x: chx - 4, y: chy + 4 },
      ],
      b.seed + 31,
      "rgba(168,142,110,0.95)",
      "rgba(52,45,37,0.95)",
      1.4,
      0.5,
    );
    if (b.built && LOD >= 1 && Math.random() < 0.22) R.FX.smoke(null, chx, chy - 24, 0.8);
    // level pips: how deep this plant goes
    if (LOD >= 1 && b.lvl > 1) {
      c.fillStyle = "rgba(58,90,54,0.9)";
      for (let i = 0; i < b.lvl - 1; i++) {
        c.beginPath();
        c.arc(x - w / 2 + 8 + i * 6, y + h / 2 - 8, 1.9, 0, R.TAU);
        c.fill();
      }
    }
  }

  function hq(c, b, t) {
    const s = b.size * TILE;
    const w = s * 0.8,
      h = s * 0.66,
      ht = 26 + b.lvl * 4;
    slab(c, b.x, b.y, w, h, ht, b.seed, facetTint(b.fac, 0.2), "rgba(224,210,180,0.96)");
    const x = b.x,
      y = b.y - ht;
    // a second storey and a tower
    slab(
      c,
      x,
      y + h * 0.1,
      w * 0.56,
      h * 0.56,
      16,
      b.seed + 9,
      facetTint(b.fac, 0.26),
      "rgba(216,202,172,0.96)",
    );
    shape(
      c,
      [
        { x: x - 7, y: y - h * 0.22 - 30 },
        { x: x + 7, y: y - h * 0.22 - 30 },
        { x: x + 7, y: y - h * 0.22 + 6 },
        { x: x - 7, y: y - h * 0.22 + 6 },
      ],
      b.seed + 17,
      facetTint(b.fac, 0.34),
      "rgba(52,45,37,0.95)",
      1.6,
      0.5,
    );
    // the flag: this is the building you are defending
    ink(c, "rgba(52,45,37,0.95)", 1.4);
    ZS.wline(c, x, y - h * 0.22 - 30, x, y - h * 0.22 - 46, b.seed + 21, 0.3);
    const fw = Math.sin(t * 2.2 + b.seed) * 2;
    shape(
      c,
      [
        { x: x, y: y - h * 0.22 - 46 },
        { x: x + 16, y: y - h * 0.22 - 42 + fw },
        { x: x, y: y - h * 0.22 - 36 },
      ],
      b.seed + 23,
      R.factionTint[b.fac],
      "rgba(52,45,37,0.9)",
      1.3,
      0.4,
    );
    // a radio mast
    if (LOD >= 2) {
      ink(c, "rgba(52,45,37,0.6)", 1);
      ZS.wline(c, x + w * 0.3, y - h * 0.1, x + w * 0.3 + 6, y - h * 0.1 - 26, b.seed + 27, 0.3);
    }
  }

  function barracks(c, b, _t) {
    const s = b.size * TILE;
    const w = s * 0.84,
      h = s * 0.62,
      ht = 14;
    slab(c, b.x, b.y, w, h, ht, b.seed, facetTint(b.fac, 0.14), "rgba(206,186,150,0.95)");
    // a pitched roof
    const x = b.x,
      y = b.y - ht;
    shape(
      c,
      [
        { x: x - w / 2, y: y + h / 2 },
        { x, y: y - h * 0.42 },
        { x: x + w / 2, y: y + h / 2 },
      ],
      b.seed + 5,
      "rgba(164,142,110,0.95)",
      "rgba(52,45,37,0.95)",
      1.6,
      0.8,
    );
    // a parade of doorways
    ink(c, "rgba(52,45,37,0.8)", 1.2);
    for (let i = 0; i < 3; i++) {
      const px = x - w / 3 + i * (w / 3);
      ZS.wline(c, px - 4, y + h / 2, px - 4, y + h / 2 - 11, b.seed + 11 + i, 0.3);
      ZS.wline(c, px + 4, y + h / 2, px + 4, y + h / 2 - 11, b.seed + 15 + i, 0.3);
      ZS.wline(c, px - 4, y + h / 2 - 11, px + 4, y + h / 2 - 11, b.seed + 19 + i, 0.3);
    }
  }

  function airfield(c, b, t) {
    const s = b.size * TILE;
    // a runway, drawn on the ground, with the tower beside it
    const w = s * 0.9,
      h = s * 0.9;
    shape(
      c,
      [
        { x: b.x - w / 2, y: b.y - h / 2 },
        { x: b.x + w / 2, y: b.y - h / 2 },
        { x: b.x + w / 2, y: b.y + h / 2 },
        { x: b.x - w / 2, y: b.y + h / 2 },
      ],
      b.seed,
      "rgba(198,186,164,0.7)",
      "rgba(70,62,52,0.7)",
      1.4,
      0.9,
    );
    // the centre line and the threshold bars
    ink(c, "rgba(236,230,214,0.85)", 1.6);
    for (let i = 0; i < 5; i++) {
      const py = b.y - h / 2 + ((i + 0.5) / 5) * h;
      ZS.wline(c, b.x - 6, py, b.x + 6, py, b.seed + 3 + i, 0.4);
    }
    // the control tower
    const tx = b.x + w / 2 - s * 0.16,
      ty = b.y - h / 2 + s * 0.16;
    slab(
      c,
      tx,
      ty,
      s * 0.2,
      s * 0.2,
      30,
      b.seed + 21,
      facetTint(b.fac, 0.28),
      "rgba(216,204,180,0.96)",
    );
    if (LOD >= 1) {
      shape(
        c,
        [
          { x: tx - s * 0.14, y: ty - 30 - s * 0.1 },
          { x: tx + s * 0.14, y: ty - 30 - s * 0.1 },
          { x: tx + s * 0.11, y: ty - 30 },
          { x: tx - s * 0.11, y: ty - 30 },
        ],
        b.seed + 25,
        "rgba(140,158,168,0.9)",
        "rgba(52,45,37,0.95)",
        1.4,
        0.4,
      );
      // a turning radar, because it is an airfield
      const a = t * 0.5 + b.seed;
      ink(c, "rgba(52,45,37,0.8)", 1.6);
      ZS.wline(
        c,
        tx,
        ty - 30 - s * 0.1 - 6,
        tx + Math.cos(a) * 12,
        ty - 30 - s * 0.1 - 6 + Math.sin(a) * 4,
        b.seed + 29,
        0.3,
      );
    }
  }

  function shipyard(c, b, _t) {
    const s = b.size * TILE;
    // a slipway running into the water and a crane over it
    shape(
      c,
      [
        { x: b.x - s * 0.44, y: b.y - s * 0.3 },
        { x: b.x + s * 0.44, y: b.y - s * 0.3 },
        { x: b.x + s * 0.44, y: b.y + s * 0.3 },
        { x: b.x - s * 0.44, y: b.y + s * 0.3 },
      ],
      b.seed,
      "rgba(176,166,146,0.8)",
      "rgba(60,54,46,0.85)",
      1.5,
      0.8,
    );
    ink(c, "rgba(70,62,52,0.6)", 1.2);
    for (let i = 0; i < 4; i++) {
      const px = b.x - s * 0.34 + i * s * 0.22;
      ZS.wline(c, px, b.y - s * 0.3, px, b.y + s * 0.3, b.seed + 3 + i, 0.4);
    }
    // the gantry
    const gy = b.y - s * 0.3;
    ink(c, "rgba(52,45,37,0.95)", 2.4);
    ZS.wline(c, b.x - s * 0.4, gy, b.x + s * 0.4, gy, b.seed + 11, 0.5);
    ink(c, "rgba(52,45,37,0.95)", 2);
    ZS.wline(c, b.x - s * 0.4, gy, b.x - s * 0.4, gy + s * 0.6, b.seed + 13, 0.4);
    ZS.wline(c, b.x + s * 0.4, gy, b.x + s * 0.4, gy + s * 0.6, b.seed + 15, 0.4);
    // a hull on the slip, if something is being built
    if (b.queue.length) {
      const f = 1 - b.queue[0].t / b.queue[0].total;
      shape(
        c,
        [
          { x: b.x - s * 0.3, y: b.y - s * 0.1 },
          { x: b.x + s * 0.24 * f + s * 0.04, y: b.y - s * 0.1 },
          { x: b.x + s * 0.34 * f + s * 0.04, y: b.y },
          { x: b.x + s * 0.24 * f + s * 0.04, y: b.y + s * 0.1 },
          { x: b.x - s * 0.3, y: b.y + s * 0.1 },
        ],
        b.seed + 21,
        facetTint(b.fac, 0.4),
        "rgba(52,45,37,0.95)",
        1.6,
        0.5,
      );
    }
  }

  function depot(c, b, _t) {
    const s = b.size * TILE;
    slab(
      c,
      b.x,
      b.y,
      s * 0.8,
      s * 0.66,
      10,
      b.seed,
      facetTint(b.fac, 0.14),
      "rgba(202,190,164,0.95)",
    );
    // a row of crates and a fuel drum
    const y = b.y - 10;
    for (let i = 0; i < 3; i++) {
      const px = b.x - s * 0.26 + i * s * 0.26;
      shape(
        c,
        boxPts(px, y + s * 0.16, s * 0.18, s * 0.18, 0.2, 0, 0),
        b.seed + 5 + i * 4,
        "rgba(186,158,118,0.9)",
        "rgba(52,45,37,0.9)",
        1.3,
        0.5,
      );
    }
    ink(c, "rgba(52,45,37,0.9)", 1.4);
    ZS.wcirc(c, b.x + s * 0.3, y + s * 0.18, s * 0.08, b.seed + 21, 0.6);
    if (b.def.heal && LOD >= 1) {
      // a red cross band, because it mends
      ink(c, "rgba(150,64,48,0.85)", 2.4);
      ZS.wline(c, b.x - 7, y - s * 0.18, b.x + 7, y - s * 0.18, b.seed + 25, 0.3);
      ZS.wline(c, b.x, y - s * 0.18 - 7, b.x, y - s * 0.18 + 7, b.seed + 27, 0.3);
    }
  }

  function radar(c, b, t) {
    const s = b.size * TILE;
    slab(
      c,
      b.x,
      b.y,
      s * 0.6,
      s * 0.55,
      8,
      b.seed,
      facetTint(b.fac, 0.2),
      "rgba(206,196,172,0.95)",
    );
    // the dish turns, slowly, always
    const a = t * 0.62 + b.seed;
    const dx = b.x,
      dy = b.y - 8;
    ink(c, "rgba(52,45,37,0.95)", 1.8);
    ZS.wline(c, dx, dy, dx, dy - s * 0.22, b.seed + 3, 0.4);
    c.save();
    c.translate(dx, dy - s * 0.22);
    shape(
      c,
      [
        { x: -s * 0.2, y: -s * 0.16 },
        { x: s * 0.2, y: -s * 0.1 },
        { x: s * 0.2, y: s * 0.1 },
        { x: -s * 0.2, y: s * 0.16 },
      ],
      b.seed + 7,
      "rgba(222,214,196,0.95)",
      "rgba(52,45,37,0.95)",
      1.5,
      0.4,
    );
    c.restore();
    // the sweep line
    ink(c, "rgba(58,90,54,0.5)", 1.2);
    ZS.wline(
      c,
      dx,
      dy - s * 0.22,
      dx + Math.cos(a) * s * 0.34,
      dy - s * 0.22 + Math.sin(a) * s * 0.26,
      b.seed + 11,
      0.5,
    );
  }

  /* ---- walls: they join their neighbours ---- */

  function wall(c, b, t, g) {
    const s = TILE;
    const x = b.x,
      y = b.y;
    const lvl = b.lvl;
    const ht = 9 + lvl * 3;
    // which neighbours are also wall? the joints depend on it
    const near = (dx, dy) => {
      if (!g) return false;
      const o = g.buildingAt(b.tx + dx, b.ty + dy);
      return !!(o && o.def.wall);
    };
    const n = near(0, -1),
      sN = near(0, 1),
      e = near(1, 0),
      wN = near(-1, 0);
    const half = s / 2;
    const wRun = (x0, y0, x1, y1, seed) => {
      ink(c, "rgba(52,45,37,0.95)", 2);
      ZS.wline(c, x0, y0, x1, y1, seed, 0.6);
    };
    // the face, raised
    shape(
      c,
      [
        { x: x - half, y: y - half },
        { x: x + half, y: y - half },
        { x: x + half, y: y + half },
        { x: x - half, y: y + half },
      ],
      b.seed,
      "rgba(206,190,158,0.92)",
      "rgba(52,45,37,0.9)",
      1.5,
      0.8,
    );
    // the top, offset up for height, with crenellations on an upgraded wall
    const ty = y - ht;
    shape(
      c,
      [
        { x: x - half, y: ty - half * 0.5 },
        { x: x + half, y: ty - half * 0.5 },
        { x: x + half, y: ty + half * 0.5 },
        { x: x - half, y: ty + half * 0.5 },
      ],
      b.seed + 3,
      "rgba(222,208,178,0.95)",
      "rgba(52,45,37,0.95)",
      1.4,
      0.6,
    );
    // the corners, drawn up to the top face
    wRun(x - half, y - half, x - half, ty - half * 0.5, b.seed + 7);
    wRun(x + half, y - half, x + half, ty - half * 0.5, b.seed + 9);
    wRun(x - half, y + half, x - half, ty + half * 0.5, b.seed + 11);
    wRun(x + half, y + half, x + half, ty + half * 0.5, b.seed + 13);
    // the top edge
    wRun(x - half, ty - half * 0.5, x + half, ty - half * 0.5, b.seed + 15);
    wRun(x - half, ty + half * 0.5, x + half, ty + half * 0.5, b.seed + 17);
    // if there is no neighbour on a side, cap it so it reads as an end
    if (!n) wRun(x - half, ty - half * 0.5, x + half, ty - half * 0.5, b.seed + 19);
    if (!sN) wRun(x - half, y + half, x + half, y + half, b.seed + 21);
    if (!wN) wRun(x - half, ty - half * 0.5, x - half, y - half, b.seed + 23);
    if (!e) wRun(x + half, ty - half * 0.5, x + half, y - half, b.seed + 25);
    // crenellations from level two
    if (lvl >= 2 && LOD >= 1) {
      ink(c, "rgba(52,45,37,0.9)", 1.6);
      for (let i = 0; i < 3; i++) {
        const px = x - half + ((i + 0.5) / 3) * s;
        ZS.wline(c, px - 3, ty - half * 0.5, px - 3, ty - half * 0.5 - 5, b.seed + 31 + i, 0.3);
        ZS.wline(c, px + 3, ty - half * 0.5, px + 3, ty - half * 0.5 - 5, b.seed + 41 + i, 0.3);
        ZS.wline(c, px - 3, ty - half * 0.5 - 5, px + 3, ty - half * 0.5 - 5, b.seed + 51 + i, 0.3);
      }
    }
    if (b.def.gate) {
      // a gate has an opening: two leaves, drawn swung wide
      shape(
        c,
        [
          { x: x - half, y: ty - half * 0.5 },
          { x: x + half, y: ty - half * 0.5 },
          { x: x + half, y: ty + half * 0.5 },
          { x: x - half, y: ty + half * 0.5 },
        ],
        b.seed + 61,
        "rgba(120,110,92,0.5)",
        "rgba(52,45,37,0.9)",
        1.4,
        0.5,
      );
      ink(c, "rgba(146,110,64,0.95)", 2.6);
      ZS.wline(c, x - half, ty - half * 0.5, x - half - 6, ty - half * 0.5 - 8, b.seed + 63, 0.4);
      ZS.wline(c, x + half, ty - half * 0.5, x + half + 6, ty - half * 0.5 - 8, b.seed + 65, 0.4);
    }
  }

  /* A baby flak: a sandbag ring, a slab, and a short pair of barrels
     tipped up at the sky. Deliberately small — eight of them stand across
     the mouth of the yard, and they must not hide the base behind them. */
  function flaknest(c, b, _t) {
    const x = b.x,
      y = b.y,
      a = b.turretA;
    const s = TILE;
    // the pit: a low ring of earth, thrown up in a hurry
    shape(
      c,
      [
        { x: x - s * 0.4, y: y - s * 0.3 },
        { x: x + s * 0.38, y: y - s * 0.32 },
        { x: x + s * 0.4, y: y + s * 0.3 },
        { x: x - s * 0.36, y: y + s * 0.32 },
      ],
      b.seed,
      "rgba(198,182,150,0.85)",
      "rgba(52,45,37,0.85)",
      1.4,
      0.8,
    );
    // sandbags, three courses of them, counted in one at a time
    ink(c, "rgba(52,45,37,0.45)", 1);
    for (let i = 0; i < 3; i++) ZS.wcirc(c, x, y + 2, s * (0.18 + i * 0.07), b.seed + 21 + i, 0.3);
    // the mount the turret sits on
    shape(
      c,
      boxPts(x, y, s * 0.22, s * 0.19, 0, 0, 0),
      b.seed + 5,
      facetTint(b.fac, 0.34),
      "rgba(52,45,37,0.95)",
      1.5,
      0.5,
    );
    const mx = x,
      my = y - 3;
    ink(c, "rgba(52,45,37,0.95)", 1.2);
    ZS.wcirc(c, mx, my, 5, b.seed + 13, 0.4);
    // twin barrels, short, and pointed up at whatever is coming
    for (const off of [-2.2, 2.2]) {
      const ox = -Math.sin(a) * off,
        oy = Math.cos(a) * off;
      ink(c, "rgba(52,45,37,0.95)", 2.6);
      ZS.wline(
        c,
        mx + ox - Math.cos(a) * 4,
        my + oy - Math.sin(a) * 4,
        mx + ox + Math.cos(a) * 16,
        my + oy + Math.sin(a) * 16,
        b.seed + 17 + off,
        0.3,
      );
    }
    if (b.flash > 0) {
      const f = b.flash / 0.08;
      c.fillStyle = "rgba(252,220,140," + (0.85 * f).toFixed(2) + ")";
      c.beginPath();
      c.arc(mx + Math.cos(a) * 18, my + Math.sin(a) * 18, 4.5 * f, 0, R.TAU);
      c.fill();
    }
  }

  /* ---- defences: a pit, a shield, and a gun on a bearing ---- */

  function defence(c, b, _t) {
    const s = b.size * TILE;
    const key = b.key;
    // the works: a low ring of earth with a slab in it
    shape(
      c,
      [
        { x: b.x - s * 0.44, y: b.y - s * 0.36 },
        { x: b.x + s * 0.44, y: b.y - s * 0.4 },
        { x: b.x + s * 0.42, y: b.y + s * 0.38 },
        { x: b.x - s * 0.42, y: b.y + s * 0.34 },
      ],
      b.seed,
      "rgba(198,182,150,0.85)",
      "rgba(52,45,37,0.85)",
      1.5,
      0.9,
    );
    const x = b.x,
      y = b.y;
    // the mount: a slab that the turret sits on
    shape(
      c,
      boxPts(x, y, s * 0.34, s * 0.3, 0, 0, 0),
      b.seed + 5,
      facetTint(b.fac, 0.34),
      "rgba(52,45,37,0.95)",
      1.6,
      0.5,
    );
    const a = b.turretA;
    const recoil = b.recoil;
    const ca = Math.cos(a),
      sa = Math.sin(a);

    if (key === "mgnest") {
      // a shield with a slit, and a barrel poking out of it
      shape(
        c,
        [
          // two corners flared behind the slit, a nose out in front
          { x: x + ca * 12 - sa * 12, y: y + sa * 12 + ca * 12 },
          { x: x + ca * 16, y: y + sa * 16 },
          { x: x + ca * 12 + sa * 12, y: y + sa * 12 - ca * 12 },
        ],
        b.seed + 9,
        "rgba(150,146,132,0.9)",
        "rgba(52,45,37,0.95)",
        1.6,
        0.5,
      );
      gun(c, x + Math.cos(a) * 10, y + Math.sin(a) * 10, a, 20, 3, recoil, b.flash, b.seed + 13);
    } else if (key === "atgun") {
      // a long thin barrel on a split trail
      gun(c, x + Math.cos(a) * 8, y + Math.sin(a) * 8, a, 26, 3.4, recoil, b.flash, b.seed + 13);
      ink(c, "rgba(52,45,37,0.9)", 2);
      for (const side of [-1, 1]) {
        const ta = a + Math.PI + side * 0.5;
        ZS.wline(c, x, y, x + Math.cos(ta) * 15, y + Math.sin(ta) * 15, b.seed + 15 + side, 0.4);
      }
      shape(
        c,
        boxPts(x, y, 12, 10, a, 0, 0),
        b.seed + 19,
        "rgba(150,146,132,0.9)",
        "rgba(52,45,37,0.95)",
        1.4,
        0.4,
      );
    } else if (key === "flaktower") {
      // twin barrels, tipped up, on a tower that gets taller with level
      const ht = 10 + b.lvl * 4;
      shape(
        c,
        [
          { x: x - 11, y: y - 9 - ht },
          { x: x + 11, y: y - 9 - ht },
          { x: x + 9, y: y + 9 },
          { x: x - 9, y: y + 9 },
        ],
        b.seed + 9,
        facetTint(b.fac, 0.3),
        "rgba(52,45,37,0.95)",
        1.6,
        0.5,
      );
      const mx = x,
        my = y - 6 - ht;
      ink(c, "rgba(52,45,37,0.95)", 1.4);
      ZS.wcirc(c, mx, my, 7, b.seed + 13, 0.5);
      for (const off of [-2.6, 2.6]) {
        const ox = -Math.sin(a) * off,
          oy = Math.cos(a) * off;
        ink(c, "rgba(52,45,37,0.95)", 3);
        ZS.wline(
          c,
          mx + ox - Math.cos(a) * 5,
          my + oy - Math.sin(a) * 5,
          mx + ox + Math.cos(a) * 22,
          my + oy + Math.sin(a) * 22,
          b.seed + 17 + off,
          0.3,
        );
      }
      if (b.flash > 0) {
        const f = b.flash / 0.08;
        c.fillStyle = "rgba(252,220,140," + (0.85 * f).toFixed(2) + ")";
        c.beginPath();
        c.arc(mx + Math.cos(a) * 24, my + Math.sin(a) * 24, 6 * f, 0, R.TAU);
        c.fill();
      }
    } else if (key === "howitzer") {
      // a fat short tube, well back in its pit
      gun(c, x + Math.cos(a) * 6, y + Math.sin(a) * 6, a, 20, 5.4, recoil, b.flash, b.seed + 13);
      shape(
        c,
        boxPts(x, y, 16, 13, a, 0, 0),
        b.seed + 17,
        "rgba(150,146,132,0.9)",
        "rgba(52,45,37,0.95)",
        1.5,
        0.4,
      );
      // the pit walls
      ink(c, "rgba(52,45,37,0.7)", 1.4);
      for (const side of [-1, 1]) {
        ZS.wline(
          c,
          x + Math.cos(a + Math.PI / 2) * side * 16,
          y + Math.sin(a + Math.PI / 2) * side * 16,
          x + Math.cos(a + Math.PI / 2) * side * 16 - Math.cos(a) * 12,
          y + Math.sin(a + Math.PI / 2) * side * 16 - Math.sin(a) * 12,
          b.seed + 21 + side,
          0.4,
        );
      }
    } else if (key === "sam") {
      // a launcher with two missiles on rails, tipped up
      const mx = x,
        my = y - 2;
      shape(
        c,
        boxPts(mx, my, 18, 14, a, 0, 0),
        b.seed + 11,
        facetTint(b.fac, 0.3),
        "rgba(52,45,37,0.95)",
        1.5,
        0.4,
      );
      for (const off of [-4, 4]) {
        const ox = -Math.sin(a) * off,
          oy = Math.cos(a) * off;
        shape(
          c,
          [
            { x: mx + ox + Math.cos(a) * 6, y: my + oy + Math.sin(a) * 6 },
            { x: mx + ox + Math.cos(a) * 22, y: my + oy + Math.sin(a) * 22 },
            {
              x: mx + ox + Math.cos(a) * 22 - Math.sin(a) * 3,
              y: my + oy + Math.sin(a) * 22 + Math.cos(a) * 3,
            },
            {
              x: mx + ox + Math.cos(a) * 6 - Math.sin(a) * 3,
              y: my + oy + Math.sin(a) * 6 + Math.cos(a) * 3,
            },
          ],
          b.seed + 15 + off,
          "rgba(190,192,186,0.95)",
          "rgba(52,45,37,0.95)",
          1.4,
          0.3,
        );
      }
      if (b.flash > 0) R.FX.smoke(null, mx + Math.cos(a) * 20, my + Math.sin(a) * 20, 0.7);
    }
  }

  /* =====================================================================
     the dispatcher
     ===================================================================== */

  const UNIT_DRAW = {
    inf: infantry,
    car: scout,
    truck,
    half: halftrack,
    tank,
    artillery,
    flak,
    heli,
    jet,
    boat,
    zed,
  };

  const BLD_DRAW = {
    hq,
    concrete: factory,
    steelmill: factory,
    aluworks: factory,
    refinery: factory,
    power: factory,
    depot,
    barracks,
    works: factory,
    airfield,
    shipyard,
    repair: depot,
    radar,
    wall,
    gate: wall,
    flaknest,
    mgnest: defence,
    atgun: defence,
    flaktower: defence,
    howitzer: defence,
    sam: defence,
  };

  const Sprites = {
    setLOD,
    get lod() {
      return LOD;
    },

    unit(c, u, t, g) {
      const fn = UNIT_DRAW[u.def.shape] || infantry;
      fn(c, u, t, g);
      // the damage state: it smokes before it dies
      const hpf = u.hp / u.maxHp;
      if (hpf < 0.4 && Math.random() < 0.25)
        R.FX.smoke(null, u.x + (Math.random() - 0.5) * 8, u.y - 4, 0.6);
      if (u.dmgFlash > 0) {
        c.globalAlpha = R.clamp(u.dmgFlash * 2.4, 0, 0.7);
        c.fillStyle = "rgba(190,80,60,1)";
        c.beginPath();
        c.arc(u.x, u.y - (u.alt || 0) * 0.55, 12, 0, R.TAU);
        c.fill();
        c.globalAlpha = 1;
      }
    },

    building(c, b, t, g) {
      const fn = BLD_DRAW[b.key] || factory;
      if (!b.built) {
        // a scaffold: the outline of what is going up
        const s = b.size * TILE;
        c.save();
        c.globalAlpha = 0.75;
        shape(
          c,
          [
            { x: b.x - s * 0.44, y: b.y - s * 0.36 },
            { x: b.x + s * 0.44, y: b.y - s * 0.38 },
            { x: b.x + s * 0.42, y: b.y + s * 0.36 },
            { x: b.x - s * 0.42, y: b.y + s * 0.34 },
          ],
          b.seed,
          "rgba(228,216,190,0.5)",
          "rgba(90,80,66,0.8)",
          1.4,
          1.1,
        );
        // corner posts and a cross brace
        ink(c, "rgba(120,104,80,0.85)", 1.4);
        const f = 1 - b.buildT / Math.max(1, b.buildTotal);
        for (let i = 0; i < 4; i++) {
          const an = (i / 4) * R.TAU + 0.7;
          const px = b.x + Math.cos(an) * s * 0.4,
            py = b.y + Math.sin(an) * s * 0.33;
          ZS.wline(c, px, py, px, py - 26 * f, b.seed + 3 + i, 0.5);
        }
        ZS.wline(
          c,
          b.x - s * 0.4,
          b.y - s * 0.33 - 26 * f * 0.6,
          b.x + s * 0.4,
          b.y + s * 0.33 - 26 * f * 0.6,
          b.seed + 11,
          0.6,
        );
        c.restore();
        return;
      }
      fn(c, b, t, g);
      if (b.upgrading) {
        // a scaffold over the top while the level goes up
        const s = b.size * TILE;
        c.save();
        c.globalAlpha = 0.6;
        ink(c, "rgba(120,104,80,0.9)", 1.4);
        const f = 1 - b.upT / Math.max(1, b.upTotal);
        for (let i = 0; i < 4; i++) {
          const an = (i / 4) * R.TAU + 0.7;
          const px = b.x + Math.cos(an) * s * 0.42,
            py = b.y + Math.sin(an) * s * 0.35;
          ZS.wline(c, px, py, px, py - 34 * f, b.seed + 21 + i, 0.5);
        }
        c.restore();
      }
      // smoke when it is hurt
      const hpf = b.hp / b.maxHp;
      if (hpf < 0.45 && Math.random() < (0.45 - hpf) * 0.9)
        R.FX.smoke(null, b.x + (Math.random() - 0.5) * b.size * TILE * 0.6, b.y, 1);
      if (b.dmgFlash > 0) {
        c.globalAlpha = R.clamp(b.dmgFlash * 2, 0, 0.5);
        c.fillStyle = "rgba(190,80,60,1)";
        const s = b.size * TILE;
        c.fillRect(b.x - s / 2, b.y - s / 2, s, s);
        c.globalAlpha = 1;
      }
    },

    wreck(c, w, _t) {
      const d = w.def;
      c.save();
      c.globalAlpha = 0.85;
      c.translate(w.x, w.y);
      c.rotate(w.rot);
      if (d.cls === "air") {
        ink(c, "rgba(70,62,52,0.8)", 1.6);
        ZS.wline(c, -14, -3, 12, 4, w.seed, 0.8);
        ZS.wline(c, -6, -12, 4, 9, w.seed + 3, 0.8);
        if (LOD >= 1) {
          ink(c, "rgba(70,62,52,0.5)", 1.2);
          ZS.wcirc(c, 0, 0, 9, w.seed + 7, 1.4);
        }
      } else if (d.cls === "arm" || d.cls === "soft") {
        shape(
          c,
          [
            { x: -14, y: -8 },
            { x: 12, y: -10 },
            { x: 15, y: 7 },
            { x: -12, y: 9 },
          ],
          w.seed,
          "rgba(112,100,84,0.55)",
          "rgba(58,50,42,0.85)",
          1.5,
          0.9,
        );
        ink(c, "rgba(58,50,42,0.75)", 1.4);
        ZS.wline(c, -8, -6, 6, 5, w.seed + 3, 0.6);
        // a scorched ring under it
        c.globalAlpha = 0.3;
        ink(c, "rgba(70,60,50,0.9)", 1);
        ZS.wcirc(c, 0, 2, 17, w.seed + 11, 2);
      } else {
        // infantry leave almost nothing, which is the point
        ink(c, "rgba(74,64,54,0.7)", 1.4);
        ZS.wline(c, -5, 2, 6, -1, w.seed, 0.6);
        ZS.wline(c, 0, -4, 3, 4, w.seed + 3, 0.6);
      }
      c.restore();
    },

    // the ghost that follows the cursor while placing a building
    ghost(c, key, tx, ty, ok, g) {
      const def = R.BDEF[key];
      const s = def.size * TILE;
      const x = (tx + def.size / 2) * TILE,
        y = (ty + def.size / 2) * TILE;
      c.save();
      c.globalAlpha = 0.85;
      shape(
        c,
        [
          { x: x - s / 2, y: y - s / 2 },
          { x: x + s / 2, y: y - s / 2 },
          { x: x + s / 2, y: y + s / 2 },
          { x: x - s / 2, y: y + s / 2 },
        ],
        7.7,
        ok ? "rgba(112,148,72,0.22)" : "rgba(168,72,56,0.24)",
        ok ? "rgba(70,100,54,0.95)" : "rgba(168,72,56,0.95)",
        2,
        1.4,
      );
      // what it will look like, faintly
      c.globalAlpha = 0.35;
      const fn = BLD_DRAW[key] || factory;
      if (key === "wall" || key === "gate") {
        fn(
          c,
          { x, y, tx, ty, seed: 3.3, lvl: 1, def, size: def.size, turretA: 0, recoil: 0, flash: 0 },
          0,
          null,
        );
      } else {
        fn(
          c,
          {
            x,
            y,
            seed: 3.3,
            lvl: 1,
            def,
            size: def.size,
            built: true,
            turretA: 0,
            recoil: 0,
            flash: 0,
            fac: 0,
            queue: [],
          },
          0,
          g,
        );
      }
      c.restore();
    },

    /* ---- the little icons the build menu and the panel use ---- */

    icon(c, key, x, y, s) {
      c.save();
      c.translate(x, y);
      c.scale(s / 40, s / 40);
      c.lineJoin = "round";
      c.lineCap = "round";
      const D = BLD_DRAW[key];
      if (D && (key === "wall" || key === "gate")) {
        D(
          c,
          {
            x: 0,
            y: 0,
            tx: 0,
            ty: 0,
            seed: 2.2,
            lvl: 1,
            def: R.BDEF[key],
            size: 1,
            turretA: 0,
            recoil: 0,
            flash: 0,
          },
          0,
          null,
        );
      } else if (D) {
        D(
          c,
          {
            x: 0,
            y: 0,
            seed: 2.2,
            lvl: 1,
            def: R.BDEF[key],
            size: R.BDEF[key].size,
            built: true,
            turretA: -0.6,
            recoil: 0,
            flash: 0,
            fac: 0,
            queue: [],
          },
          0,
          null,
        );
      }
      c.restore();
    },

    unitIcon(c, key, x, y, s) {
      const def = R.UDEF[key];
      c.save();
      c.translate(x, y);
      const k = s / 46;
      c.scale(k, k);
      const fake = {
        x: 0,
        y: 0,
        va: -0.5,
        turretA: -0.5,
        fac: 0,
        seed: 4.4,
        gait: 1.2,
        tread: 0.3,
        rotor: 1.1,
        alt: def.cls === "air" ? 30 : 0,
        recoil: 0,
        flash: 0,
        def,
        key,
        hp: def.hp,
        maxHp: def.hp,
        dmgFlash: 0,
      };
      const fn = UNIT_DRAW[def.shape] || infantry;
      fn(c, fake, 0, null);
      c.restore();
    },
  };

  R.Sprites = Sprites;
})();
