/* SANDSTORM — high-detail tactical military canvas renderer (Desert Order style).
   Renders fortified base compounds, multi-tier flak towers, industrial factories,
   camouflage tanks with rotating turrets, aircraft, warships, and trains. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE;

  /* ---------- detail level ---------- */
  let LOD = 2; // 2 = full, 1 = medium, 0 = low

  function setLOD(z) {
    LOD = z >= 0.72 ? 2 : z >= 0.42 ? 1 : 0;
  }

  /* ---------- color & drawing primitives ---------- */

  function factionCol(fac, alpha) {
    const f = (R.FACTIONS && R.FACTIONS[fac]) ||
      (R.FACTIONS && R.FACTIONS[0]) || { ink: [80, 110, 60] };
    const a = alpha === undefined ? 1 : alpha;
    return `rgba(${f.ink[0]}, ${f.ink[1]}, ${f.ink[2]}, ${a})`;
  }

  function shadow(c, x, y, rx, ry, alpha) {
    c.save();
    c.fillStyle = `rgba(32, 28, 22, ${alpha === undefined ? 0.22 : alpha})`;
    c.beginPath();
    c.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, R.TAU);
    c.fill();
    c.restore();
  }

  // Draw a 3D isometric/shaded slab with top face and front/side bevels
  function drawSlab(c, x, y, w, h, depth, topCol, frontCol) {
    const hw = w / 2,
      hh = h / 2;
    const d = depth || 10;

    // Front face
    c.fillStyle = frontCol || "#a39276";
    c.beginPath();
    c.moveTo(x - hw, y + hh);
    c.lineTo(x + hw, y + hh);
    c.lineTo(x + hw, y + hh + d);
    c.lineTo(x - hw, y + hh + d);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(42, 36, 28, 0.7)";
    c.lineWidth = 1.2;
    c.stroke();

    // Top face
    c.fillStyle = topCol || "#d8caa8";
    c.beginPath();
    c.rect(x - hw, y - hh, w, h);
    c.fill();
    c.stroke();
  }

  /* =====================================================================
     UNIT SPRITES: TANKS, SPGs, AA, TRUCKS, PLANES, SHIPS, TRAINS
     ===================================================================== */

  // Tank tread track assembly with rotating roadwheels and tread links
  function drawTracks(c, x, y, ang, len, gap, wid, treadPhase) {
    const cos = Math.cos(ang),
      sin = Math.sin(ang);
    const hw = wid / 2;
    const hl = len / 2;

    for (const side of [-1, 1]) {
      const cx = x - side * gap * sin;
      const cy = y + side * gap * cos;

      c.save();
      c.translate(cx, cy);
      c.rotate(ang);

      // Track rubber/metal band
      c.fillStyle = "#2d2a26";
      c.strokeStyle = "#1b1916";
      c.lineWidth = 1.2;
      c.beginPath();
      c.roundRect(-hl, -hw, len, wid, 3);
      c.fill();
      c.stroke();

      // Roadwheels
      const numWheels = Math.max(3, Math.round(len / 8));
      for (let i = 0; i < numWheels; i++) {
        const wx = -hl + (i + 0.5) * (len / numWheels);
        c.fillStyle = "#4a453e";
        c.strokeStyle = "#1b1916";
        c.lineWidth = 1;
        c.beginPath();
        c.arc(wx, 0, hw * 0.72, 0, R.TAU);
        c.fill();
        c.stroke();
        c.fillStyle = "#8a8072";
        c.beginPath();
        c.arc(wx, 0, hw * 0.3, 0, R.TAU);
        c.fill();
      }

      // Tread links
      if (LOD >= 1) {
        c.strokeStyle = "rgba(18, 16, 14, 0.75)";
        c.lineWidth = 1.2;
        const numTicks = Math.max(5, Math.round(len / 4));
        for (let i = 0; i < numTicks; i++) {
          const f = (((i / numTicks + (treadPhase || 0)) % 1) + 1) % 1;
          const tx = -hl + f * len;
          c.beginPath();
          c.moveTo(tx, -hw);
          c.lineTo(tx, hw);
          c.stroke();
        }
      }

      c.restore();
    }
  }

  // Heavy tank cannon barrel with recoil kick and muzzle brake
  function drawGun(c, x, y, ang, len, thick, recoil, flash) {
    const rOffset = (recoil || 0) * 6;
    const startX = x - Math.cos(ang) * rOffset;
    const startY = y - Math.sin(ang) * rOffset;
    const endX = startX + Math.cos(ang) * (len - rOffset);
    const endY = startY + Math.sin(ang) * (len - rOffset);

    // Barrel
    c.strokeStyle = "#2e2b26";
    c.lineWidth = thick || 3.4;
    c.lineCap = "butt";
    c.beginPath();
    c.moveTo(startX, startY);
    c.lineTo(endX, endY);
    c.stroke();

    // Muzzle brake
    const perpX = -Math.sin(ang) * ((thick || 3.4) * 0.85);
    const perpY = Math.cos(ang) * ((thick || 3.4) * 0.85);
    c.strokeStyle = "#1b1916";
    c.lineWidth = (thick || 3.4) * 1.1;
    c.beginPath();
    c.moveTo(endX - Math.cos(ang) * 3 + perpX, endY - Math.sin(ang) * 3 + perpY);
    c.lineTo(endX - Math.cos(ang) * 3 - perpX, endY - Math.sin(ang) * 3 - perpY);
    c.stroke();

    // Muzzle flash burst
    if (flash > 0) {
      const f = flash / 0.08;
      c.save();
      c.fillStyle = `rgba(255, 230, 130, ${0.9 * f})`;
      c.beginPath();
      c.arc(endX + Math.cos(ang) * 6, endY + Math.sin(ang) * 6, 7 * f, 0, R.TAU);
      c.fill();
      c.fillStyle = `rgba(255, 255, 255, ${0.95 * f})`;
      c.beginPath();
      c.arc(endX + Math.cos(ang) * 7, endY + Math.sin(ang) * 7, 3.5 * f, 0, R.TAU);
      c.fill();
      c.restore();
    }
  }

  /* ------------------- TANK ------------------- */
  function tank(c, u, _t) {
    const big = u.def.big;
    const L = big ? 48 : u.def.key === "mtank" ? 40 : 34;
    const W = big ? 26 : u.def.key === "mtank" ? 22 : 19;
    const trW = W * 0.35;

    // Shadow
    shadow(c, u.x + 2, u.y + 4, L * 0.52, W * 0.45, 0.25);

    // Tracks
    drawTracks(c, u.x, u.y, u.va, L * 0.94, W / 2 - trW / 2 + 1, trW, u.tread);

    // Hull
    c.save();
    c.translate(u.x, u.y);
    c.rotate(u.va);

    // Camo hull body
    const hw = W / 2 - 1,
      hl = L / 2;
    c.fillStyle = u.fac === 0 ? "#7b8764" : u.fac === 1 ? "#8a7a60" : "#6c7784";
    c.strokeStyle = "#25221d";
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(-hl, -hw);
    c.lineTo(hl * 0.4, -hw);
    c.lineTo(hl, -hw * 0.6);
    c.lineTo(hl, hw * 0.6);
    c.lineTo(hl * 0.4, hw);
    c.lineTo(-hl, hw);
    c.closePath();
    c.fill();
    c.stroke();

    // Front sloped glacis plate highlight
    c.fillStyle = "rgba(255, 255, 255, 0.15)";
    c.beginPath();
    c.moveTo(hl * 0.4, -hw);
    c.lineTo(hl, -hw * 0.6);
    c.lineTo(hl, hw * 0.6);
    c.lineTo(hl * 0.4, hw);
    c.closePath();
    c.fill();

    // Engine deck vents & spare tracks
    if (LOD >= 1) {
      c.fillStyle = "#38342d";
      c.fillRect(-hl * 0.85, -hw * 0.7, hl * 0.5, hw * 1.4);
      c.strokeStyle = "#1b1916";
      c.lineWidth = 0.8;
      for (let i = -hw * 0.5; i <= hw * 0.5; i += 3) {
        c.beginPath();
        c.moveTo(-hl * 0.85, i);
        c.lineTo(-hl * 0.38, i);
        c.stroke();
      }
    }
    c.restore();

    // Rotating Turret
    const ta = u.turretA !== undefined ? u.turretA : u.va;
    const turretRadius = big ? 11 : 8.5;
    const barrelLen = big ? 28 : 20;
    const barrelThick = big ? 4.2 : 3.2;

    // Cannon
    drawGun(c, u.x, u.y, ta, barrelLen, barrelThick, u.recoil, u.flash);

    // Turret body
    c.save();
    c.translate(u.x, u.y);
    c.rotate(ta);

    c.fillStyle = u.fac === 0 ? "#889670" : u.fac === 1 ? "#9a8a70" : "#7b8898";
    c.strokeStyle = "#25221d";
    c.lineWidth = 1.3;
    c.beginPath();
    c.roundRect(
      -turretRadius * 1.1,
      -turretRadius * 0.85,
      turretRadius * 2.2,
      turretRadius * 1.7,
      4,
    );
    c.fill();
    c.stroke();

    // Mantlet
    c.fillStyle = "#3f3c36";
    c.fillRect(turretRadius * 0.7, -turretRadius * 0.5, turretRadius * 0.5, turretRadius * 1.0);
    c.strokeRect(turretRadius * 0.7, -turretRadius * 0.5, turretRadius * 0.5, turretRadius * 1.0);

    // Commander Cupola
    c.fillStyle = "#2d2a25";
    c.beginPath();
    c.arc(-turretRadius * 0.3, -turretRadius * 0.35, turretRadius * 0.35, 0, R.TAU);
    c.fill();
    c.stroke();

    c.restore();
  }

  /* ------------------- SPG / ARTILLERY ------------------- */
  function spg(c, u, _t) {
    const big = u.def.big;
    const L = big ? 48 : 38;
    const W = big ? 25 : 20;

    shadow(c, u.x + 2, u.y + 4, L * 0.52, W * 0.45, 0.25);
    drawTracks(c, u.x, u.y, u.va, L * 0.94, W / 2 - 4, 7, u.tread);

    c.save();
    c.translate(u.x, u.y);
    c.rotate(u.va);

    // Hull
    c.fillStyle = u.fac === 0 ? "#7b8764" : "#8a7a60";
    c.strokeStyle = "#25221d";
    c.lineWidth = 1.4;
    c.beginPath();
    c.roundRect(-L / 2, -W / 2, L, W, 4);
    c.fill();
    c.stroke();

    // Open fighting compartment
    c.fillStyle = "#38332b";
    c.fillRect(-L * 0.35, -W * 0.4, L * 0.6, W * 0.8);
    c.strokeRect(-L * 0.35, -W * 0.4, L * 0.6, W * 0.8);
    c.restore();

    // Heavy artillery gun
    const ta = u.turretA !== undefined ? u.turretA : u.va;
    const gunX = u.x + Math.cos(u.va) * (L * 0.1);
    const gunY = u.y + Math.sin(u.va) * (L * 0.1);
    drawGun(c, gunX, gunY, ta, big ? 32 : 24, big ? 5.2 : 4.4, u.recoil, u.flash);

    // Blast shield
    c.save();
    c.translate(gunX, gunY);
    c.rotate(ta);
    c.fillStyle = "#5a5347";
    c.strokeStyle = "#25221d";
    c.lineWidth = 1.2;
    c.beginPath();
    c.rect(-4, -W * 0.45, 8, W * 0.9);
    c.fill();
    c.stroke();
    c.restore();
  }

  /* ------------------- TANK DESTROYER ------------------- */
  function td(c, u, _t) {
    const big = u.def.big;
    const L = big ? 48 : 40;
    const W = big ? 25 : 21;

    shadow(c, u.x + 2, u.y + 4, L * 0.52, W * 0.45, 0.25);
    drawTracks(c, u.x, u.y, u.va, L * 0.94, W / 2 - 4, 7, u.tread);

    c.save();
    c.translate(u.x, u.y);
    c.rotate(u.va);

    // Casemate hull
    c.fillStyle = u.fac === 0 ? "#73805c" : "#827258";
    c.strokeStyle = "#25221d";
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(-L / 2, -W / 2);
    c.lineTo(L * 0.2, -W / 2);
    c.lineTo(L / 2, -W * 0.25);
    c.lineTo(L / 2, W * 0.25);
    c.lineTo(L * 0.2, W / 2);
    c.lineTo(-L / 2, W / 2);
    c.closePath();
    c.fill();
    c.stroke();

    // Casemate sloped roof
    c.fillStyle = "rgba(255, 255, 255, 0.12)";
    c.beginPath();
    c.moveTo(-L * 0.2, -W * 0.35);
    c.lineTo(L * 0.3, -W * 0.3);
    c.lineTo(L * 0.3, W * 0.3);
    c.lineTo(-L * 0.2, W * 0.35);
    c.closePath();
    c.fill();
    c.restore();

    // Heavy fixed cannon
    const ta = u.turretA !== undefined ? u.turretA : u.va;
    const gunX = u.x + Math.cos(u.va) * (L * 0.35);
    const gunY = u.y + Math.sin(u.va) * (L * 0.35);
    drawGun(c, gunX, gunY, ta, big ? 30 : 24, big ? 4.8 : 3.8, u.recoil, u.flash);
  }

  /* ------------------- TRUCK / APC / POLUTORKA ------------------- */
  function truck(c, u, _t) {
    const L = 38,
      W = 18;
    shadow(c, u.x + 2, u.y + 4, L * 0.5, W * 0.5, 0.22);

    c.save();
    c.translate(u.x, u.y);
    c.rotate(u.va);

    // Wheels
    c.fillStyle = "#252320";
    for (const wx of [-L * 0.35, -L * 0.12, L * 0.32]) {
      for (const wy of [-W / 2 - 1, W / 2 + 1]) {
        c.beginPath();
        c.roundRect(wx - 4, wy - 2, 8, 4, 1.5);
        c.fill();
      }
    }

    // Cab
    c.fillStyle = u.fac === 0 ? "#7b8764" : "#8a7a60";
    c.strokeStyle = "#25221d";
    c.lineWidth = 1.3;
    c.beginPath();
    c.roundRect(L * 0.1, -W / 2 + 1, L * 0.38, W - 2, 3);
    c.fill();
    c.stroke();

    // Windshield glass
    c.fillStyle = "#4a6878";
    c.fillRect(L * 0.28, -W / 2 + 3, L * 0.12, W - 6);

    // Cargo Bed
    c.fillStyle = "#9a8c72";
    c.beginPath();
    c.roundRect(-L / 2 + 2, -W / 2, L * 0.58, W, 2);
    c.fill();
    c.stroke();

    // Cargo contents: Flag if conquest APC, gold bars if polutorka, ammo crates if ammo
    if (u.def.capture) {
      // Conquest APC Flag
      c.fillStyle = factionCol(u.fac, 1);
      c.beginPath();
      c.moveTo(-L * 0.2, -W * 0.3);
      c.lineTo(-L * 0.4, -W * 0.3 - 14);
      c.lineTo(-L * 0.2, -W * 0.3 - 9);
      c.closePath();
      c.fill();
      c.strokeStyle = "#1b1916";
      c.lineWidth = 1.2;
      c.stroke();
    } else if (u.def.key === "polutorka" || u.def.goldTruck) {
      // Gold export crates
      c.fillStyle = "#e5b838";
      c.fillRect(-L * 0.38, -W * 0.3, L * 0.35, W * 0.6);
      c.strokeStyle = "#8a6818";
      c.strokeRect(-L * 0.38, -W * 0.3, L * 0.35, W * 0.6);
    }

    c.restore();
  }

  /* ------------------- SCOUT CAR / JEEP ------------------- */
  function scout(c, u, _t) {
    const L = 28,
      W = 15;
    shadow(c, u.x + 2, u.y + 3, L * 0.5, W * 0.5, 0.2);

    c.save();
    c.translate(u.x, u.y);
    c.rotate(u.va);

    // 4 Wheels
    c.fillStyle = "#252320";
    for (const wx of [-L * 0.28, L * 0.28]) {
      for (const wy of [-W / 2 - 1, W / 2 + 1]) {
        c.beginPath();
        c.roundRect(wx - 3.5, wy - 1.5, 7, 3, 1);
        c.fill();
      }
    }

    // Chassis
    c.fillStyle = u.fac === 0 ? "#7b8764" : "#8a7a60";
    c.strokeStyle = "#25221d";
    c.lineWidth = 1.2;
    c.beginPath();
    c.roundRect(-L / 2 + 2, -W / 2 + 1, L - 4, W - 2, 3);
    c.fill();
    c.stroke();

    // Windshield
    c.fillStyle = "#4a6878";
    c.fillRect(L * 0.05, -W / 2 + 3, 3, W - 6);

    c.restore();

    // Mounted Machine gun
    drawGun(c, u.x, u.y, u.va, 14, 2.2, u.recoil, u.flash);
  }

  /* ------------------- HALFTRACK ------------------- */
  function halftrack(c, u, _t) {
    const L = 36,
      W = 17;
    shadow(c, u.x + 2, u.y + 4, L * 0.5, W * 0.5, 0.22);

    // Rear tracks, front wheels
    drawTracks(c, u.x - Math.cos(u.va) * 5, u.y - Math.sin(u.va) * 5, u.va, 24, 7.5, 6, u.tread);

    c.save();
    c.translate(u.x, u.y);
    c.rotate(u.va);

    // Front wheels
    c.fillStyle = "#252320";
    for (const wy of [-W / 2 - 1, W / 2 + 1]) {
      c.beginPath();
      c.roundRect(L * 0.32 - 3.5, wy - 1.5, 7, 3, 1);
      c.fill();
    }

    // Armored body
    c.fillStyle = u.fac === 0 ? "#7b8764" : "#8a7a60";
    c.strokeStyle = "#25221d";
    c.lineWidth = 1.3;
    c.beginPath();
    c.roundRect(-L / 2 + 2, -W / 2 + 1, L - 4, W - 2, 3);
    c.fill();
    c.stroke();

    c.restore();

    // Gun mount (AA or howitzer)
    const ta = u.turretA !== undefined ? u.turretA : u.va;
    drawGun(c, u.x - Math.cos(u.va) * 2, u.y - Math.sin(u.va) * 2, ta, 16, 2.8, u.recoil, u.flash);
  }

  /* ------------------- INFANTRY ------------------- */
  function infantry(c, u, _t) {
    const n = u.def.squad || 1;
    const spread = n === 1 ? 0 : 8;
    const cos = Math.cos(u.va + Math.PI / 2),
      sin = Math.sin(u.va + Math.PI / 2);

    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spread;
      const back = (i % 2) * 5;
      const x = u.x + cos * off - Math.cos(u.va) * back;
      const y = u.y + sin * off - Math.sin(u.va) * back;

      shadow(c, x, y + 2, 4.5, 2.5, 0.2);

      c.save();
      c.translate(x, y);

      // Body & Helmet
      c.fillStyle = u.fac === 0 ? "#6e7a56" : "#7c6c50";
      c.strokeStyle = "#25221d";
      c.lineWidth = 1;
      c.beginPath();
      c.arc(0, -6, 3.8, 0, R.TAU); // Helmet
      c.fill();
      c.stroke();

      c.fillStyle = "#3c3830";
      c.fillRect(-2.5, -3, 5, 6); // Torso

      c.restore();

      // Gun
      const gx = x + Math.cos(u.va) * 3;
      const gy = y + Math.sin(u.va) * 3 - 2;
      drawGun(c, gx, gy, u.va, 10, 1.8, u.recoil, u.flash);
    }
  }

  /* ------------------- HELICOPTER ------------------- */
  function heli(c, u, t) {
    const alt = u.alt || 18;
    const y = u.y - alt * 0.7;

    // Ground Shadow below helicopter
    shadow(c, u.x + 8, u.y + 12, 22, 10, 0.25);

    c.save();
    c.translate(u.x, y);
    c.rotate(u.va);

    // Fuselage
    c.fillStyle = u.fac === 0 ? "#6c7855" : "#7d6e56";
    c.strokeStyle = "#201d18";
    c.lineWidth = 1.3;
    c.beginPath();
    c.ellipse(0, 0, 18, 8, 0, 0, R.TAU);
    c.fill();
    c.stroke();

    // Tail boom
    c.beginPath();
    c.moveTo(-12, -2);
    c.lineTo(-32, -1);
    c.lineTo(-32, 1);
    c.lineTo(-12, 2);
    c.closePath();
    c.fill();
    c.stroke();

    // Cockpit canopy glass
    c.fillStyle = "#3b586e";
    c.beginPath();
    c.ellipse(8, 0, 7, 5, 0, 0, R.TAU);
    c.fill();

    // Spinning Main Rotor Blade Disc
    const rotorAngle = t * 35;
    c.fillStyle = "rgba(40, 36, 30, 0.28)";
    c.beginPath();
    c.ellipse(0, 0, 32, 32, 0, 0, R.TAU);
    c.fill();
    c.strokeStyle = "rgba(30, 28, 24, 0.65)";
    c.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) {
      const a = rotorAngle + (i * R.TAU) / 3;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * 32, Math.sin(a) * 32);
      c.stroke();
    }

    c.restore();

    // Weapon fire
    if (u.flash > 0) {
      drawGun(
        c,
        u.x + Math.cos(u.va) * 12,
        y + Math.sin(u.va) * 12,
        u.va,
        12,
        2.5,
        u.recoil,
        u.flash,
      );
    }
  }

  /* ------------------- AIRPLANE / BOMBER / JET ------------------- */
  function plane(c, u, _t) {
    const alt = u.alt || 26;
    const y = u.y - alt * 0.75;
    const big = u.def.big || u.def.cls === "aircraft";
    const L = big ? 52 : 36;
    const span = big ? 56 : 38;

    // Ground Shadow
    shadow(c, u.x + 12, u.y + 16, span * 0.45, L * 0.4, 0.22);

    c.save();
    c.translate(u.x, y);
    c.rotate(u.va);

    // Wings
    c.fillStyle = u.fac === 0 ? "#6c7855" : "#7d6e56";
    c.strokeStyle = "#201d18";
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(L * 0.1, 0);
    c.lineTo(-L * 0.2, -span / 2);
    c.lineTo(-L * 0.35, -span / 2);
    c.lineTo(-L * 0.2, 0);
    c.lineTo(-L * 0.35, span / 2);
    c.lineTo(-L * 0.2, span / 2);
    c.closePath();
    c.fill();
    c.stroke();

    // Fuselage
    c.beginPath();
    c.ellipse(0, 0, L / 2, big ? 6.5 : 4.5, 0, 0, R.TAU);
    c.fill();
    c.stroke();

    // Cockpit
    c.fillStyle = "#3b586e";
    c.beginPath();
    c.ellipse(L * 0.2, 0, 6, 3, 0, 0, R.TAU);
    c.fill();

    // Tail plane
    c.fillStyle = u.fac === 0 ? "#6c7855" : "#7d6e56";
    c.beginPath();
    c.moveTo(-L * 0.35, -span * 0.2);
    c.lineTo(-L * 0.48, -span * 0.2);
    c.lineTo(-L * 0.48, span * 0.2);
    c.lineTo(-L * 0.35, span * 0.2);
    c.closePath();
    c.fill();
    c.stroke();

    c.restore();

    if (u.flash > 0) {
      drawGun(
        c,
        u.x + Math.cos(u.va) * (L * 0.4),
        y + Math.sin(u.va) * (L * 0.4),
        u.va,
        14,
        2.5,
        u.recoil,
        u.flash,
      );
    }
  }

  function jet(c, u, t) {
    plane(c, u, t);
  }

  /* ------------------- NAVAL / BOATS / SHIPS ------------------- */
  function boat(c, u, _t) {
    const L = 36,
      W = 14;
    c.save();
    c.translate(u.x, u.y);
    c.rotate(u.va);

    // Water wake
    c.strokeStyle = "rgba(230, 245, 255, 0.65)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(L * 0.4, 0);
    c.lineTo(-L * 0.6, -W);
    c.moveTo(L * 0.4, 0);
    c.lineTo(-L * 0.6, W);
    c.stroke();

    // Hull
    c.fillStyle = "#63707d";
    c.strokeStyle = "#1e242b";
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(-L / 2, -W / 2);
    c.lineTo(L * 0.2, -W / 2);
    c.lineTo(L / 2, 0);
    c.lineTo(L * 0.2, W / 2);
    c.lineTo(-L / 2, W / 2);
    c.closePath();
    c.fill();
    c.stroke();

    // Cabin
    c.fillStyle = "#8a96a3";
    c.fillRect(-L * 0.2, -W * 0.35, L * 0.4, W * 0.7);
    c.strokeRect(-L * 0.2, -W * 0.35, L * 0.4, W * 0.7);

    c.restore();

    // Gun
    const ta = u.turretA !== undefined ? u.turretA : u.va;
    drawGun(c, u.x + Math.cos(u.va) * 6, u.y + Math.sin(u.va) * 6, ta, 16, 2.8, u.recoil, u.flash);
  }

  function ship(c, u, _t) {
    const big = u.def.big;
    const L = big ? 96 : 64,
      W = big ? 22 : 16;
    c.save();
    c.translate(u.x, u.y);
    c.rotate(u.va);

    // Wake
    c.strokeStyle = "rgba(235, 248, 255, 0.7)";
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(L * 0.45, 0);
    c.lineTo(-L * 0.7, -W * 1.3);
    c.moveTo(L * 0.45, 0);
    c.lineTo(-L * 0.7, W * 1.3);
    c.stroke();

    // Hull
    c.fillStyle = "#5c6875";
    c.strokeStyle = "#1a2026";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-L / 2, -W / 2);
    c.lineTo(L * 0.25, -W / 2);
    c.lineTo(L / 2, 0);
    c.lineTo(L * 0.25, W / 2);
    c.lineTo(-L / 2, W / 2);
    c.closePath();
    c.fill();
    c.stroke();

    // Superstructure
    c.fillStyle = "#7c8996";
    c.fillRect(-L * 0.25, -W * 0.35, L * 0.5, W * 0.7);
    c.strokeRect(-L * 0.25, -W * 0.35, L * 0.5, W * 0.7);

    c.restore();

    // Fore & Aft Turrets
    const ta = u.turretA !== undefined ? u.turretA : u.va;
    for (const offset of [L * 0.25, -L * 0.3]) {
      const gx = u.x + Math.cos(u.va) * offset;
      const gy = u.y + Math.sin(u.va) * offset;
      drawGun(c, gx, gy, ta, 20, 3.4, u.recoil, u.flash);
    }
  }

  function sub(c, u, _t) {
    const L = 48,
      W = 12;
    c.save();
    c.translate(u.x, u.y);
    c.rotate(u.va);

    // Submerged hull
    c.fillStyle = "#333d45";
    c.strokeStyle = "#141a1f";
    c.lineWidth = 1.3;
    c.beginPath();
    c.roundRect(-L / 2, -W / 2, L, W, 6);
    c.fill();
    c.stroke();

    // Conning tower
    c.fillStyle = "#4a555f";
    c.fillRect(-4, -W * 0.25, 12, W * 0.5);
    c.strokeRect(-4, -W * 0.25, 12, W * 0.5);

    c.restore();
  }

  /* ------------------- TRAINS ------------------- */
  function train(c, u, _t) {
    const L = 56,
      W = 16;
    c.save();
    c.translate(u.x, u.y);
    c.rotate(u.va);

    // Armored Car body
    c.fillStyle = "#4a4f56";
    c.strokeStyle = "#1b1e22";
    c.lineWidth = 1.4;
    c.beginPath();
    c.roundRect(-L / 2, -W / 2, L, W, 3);
    c.fill();
    c.stroke();

    // Bogies / Wheels
    c.fillStyle = "#202226";
    for (const bx of [-L * 0.35, L * 0.35]) {
      c.fillRect(bx - 6, -W / 2 - 2, 12, 2);
      c.fillRect(bx - 6, W / 2, 12, 2);
    }

    c.restore();

    // Gun Turret
    const ta = u.turretA !== undefined ? u.turretA : u.va;
    drawGun(c, u.x, u.y, ta, 22, 3.6, u.recoil, u.flash);
  }

  /* =====================================================================
     BUILDINGS & BASE VISUALS: FORTRESS WALLS, FLAKS, FACTORIES, HQ
     ===================================================================== */

  /* ------------------- BASE WALL ------------------- */
  function wall(c, b, _t, g) {
    const s = TILE;
    const x = b.x,
      y = b.y;
    const lvl = b.lvl || 1;
    const ht = 14 + lvl * 3;

    // Check neighbors
    const isW = (dx, dy) => {
      if (!g) return false;
      const o = g.buildingAt(b.tx + dx, b.ty + dy);
      return !!(o && (o.def.wall || o.def.gate));
    };
    const n = isW(0, -1),
      sN = isW(0, 1),
      e = isW(1, 0),
      wN = isW(-1, 0);

    const hw = s / 2;
    const hh = s / 2;

    // 3D Front drop (draw only on southern exposed faces)
    if (!sN) {
      c.fillStyle = "#8a7e68";
      c.fillRect(x - hw, y - hh, s, s + ht);
      c.strokeStyle = "#2e281f";
      c.lineWidth = 1.4;
      c.strokeRect(x - hw, y - hh, s, s + ht);
    }

    // Top parapet walkway
    c.fillStyle = "#d2c5a8";
    c.fillRect(x - hw, y - hh - ht, s, s);

    // Stroke only boundary edges
    c.strokeStyle = "#383228";
    c.lineWidth = 1.4;
    c.beginPath();
    if (!n) {
      c.moveTo(x - hw, y - hh - ht);
      c.lineTo(x + hw, y - hh - ht);
    }
    if (!sN) {
      c.moveTo(x - hw, y + hh - ht);
      c.lineTo(x + hw, y + hh - ht);
    }
    if (!wN) {
      c.moveTo(x - hw, y - hh - ht);
      c.lineTo(x - hw, y + hh - ht);
    }
    if (!e) {
      c.moveTo(x + hw, y - hh - ht);
      c.lineTo(x + hw, y + hh - ht);
    }
    c.stroke();

    // Steel cap plate along outer exposed edges
    c.fillStyle = "#5c5446";
    if (!n) c.fillRect(x - hw, y - hh - ht, s, 3);
    if (!sN) c.fillRect(x - hw, y + hh - ht - 3, s, 3);
    if (!wN) c.fillRect(x - hw, y - hh - ht, 3, s);
    if (!e) c.fillRect(x + hw - 3, y - hh - ht, 3, s);

    // Corner pillar if this is a corner
    if ((!n && !wN) || (!n && !e) || (!sN && !wN) || (!sN && !e)) {
      c.fillStyle = "#736855";
      c.fillRect(x - 5, y - hh - ht - 4, 10, 8);
      c.strokeStyle = "#252018";
      c.strokeRect(x - 5, y - hh - ht - 4, 10, 8);
    }
  }

  /* ------------------- OPEN PERIMETER GATEWAY ------------------- */
  function gate(_c, _b, _t, _g) {
    // Kept completely open and clean — the natural opening in the perimeter wall
  }

  /* ------------------- FLAK DEFENSE TOWERS (L1, L2, L3) ------------------- */
  function flakTower(c, b, t, g) {
    const f = b.fac >= 0 && g ? g.factions[b.fac] : null;
    const l2 = f && f.flakL2;
    const l3 = f && f.flakL3;
    const x = b.x,
      y = b.y;

    // Ground Shadow
    shadow(c, x + 2, y + 4, 22, 18, 0.28);

    // 1. Heavy Concrete Gun Revetment / Emplacement Pit
    const baseR = l3 ? 20 : l2 ? 18 : 16;
    c.fillStyle = "#a89b82";
    c.strokeStyle = "#2b251d";
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(x, y, baseR, 0, R.TAU);
    c.fill();
    c.stroke();

    // Emplacement beveled rim & steel traverse floor ring
    c.fillStyle = "#4a443b";
    c.beginPath();
    c.arc(x, y, baseR - 3.5, 0, R.TAU);
    c.fill();
    c.strokeStyle = "rgba(20, 18, 15, 0.6)";
    c.lineWidth = 1;
    c.stroke();

    // Radial track rivets on traverse ring
    if (LOD >= 1) {
      c.fillStyle = "#8a7e6b";
      for (let i = 0; i < 8; i++) {
        const a = (i * R.TAU) / 8;
        c.beginPath();
        c.arc(x + Math.cos(a) * (baseR - 5.5), y + Math.sin(a) * (baseR - 5.5), 1.2, 0, R.TAU);
        c.fill();
      }
    }

    // 2. Turret Mount & Gun Carriage (Smoothly rotates to face target or idle sweeps)
    const ta = b.turretA !== undefined ? b.turretA : Math.sin(t * 0.7 + b.seed) * 0.8 - Math.PI / 2;

    if (l3) {
      // ===== L3: FORTRESS HEAVY FLAK 128mm & RADAR TOWER =====
      // Heavy twin 128mm cannons
      for (const off of [-4.5, 4.5]) {
        const ox = -Math.sin(ta) * off;
        const oy = Math.cos(ta) * off;
        drawGun(c, x + ox, y + oy, ta, 32, 4.4, b.recoil, b.flash);
      }

      // Heavy armored turret cupola
      c.save();
      c.translate(x, y);
      c.rotate(ta);

      c.fillStyle = "#4e5661";
      c.strokeStyle = "#1b2026";
      c.lineWidth = 1.4;
      c.beginPath();
      c.roundRect(-11, -9, 22, 18, 4);
      c.fill();
      c.stroke();

      // Armor mantlet
      c.fillStyle = "#2d333b";
      c.fillRect(4, -6, 6, 12);
      c.strokeRect(4, -6, 6, 12);

      c.restore();

      // Motorized rotating radar dish on mast
      const radarAngle = t * 2.8;
      c.strokeStyle = "#3888cc";
      c.lineWidth = 2.2;
      c.beginPath();
      c.arc(x, y - 2, 9, radarAngle - 0.7, radarAngle + 0.7);
      c.stroke();

      // Blinking red warning lamp
      const blink = Math.sin(t * 7) > 0;
      c.fillStyle = blink ? "#ff2222" : "#550000";
      c.beginPath();
      c.arc(x - 6, y - 6, 2, 0, R.TAU);
      c.fill();
    } else if (l2) {
      // ===== L2: ARMORED HEAVY FLAK 88 =====
      // Twin heavy 88mm cannons
      for (const off of [-3.5, 3.5]) {
        const ox = -Math.sin(ta) * off;
        const oy = Math.cos(ta) * off;
        drawGun(c, x + ox, y + oy, ta, 27, 3.6, b.recoil, b.flash);
      }

      // Armored turret housing
      c.save();
      c.translate(x, y);
      c.rotate(ta);

      c.fillStyle = "#635e54";
      c.strokeStyle = "#201d18";
      c.lineWidth = 1.3;
      c.beginPath();
      c.roundRect(-9, -8, 18, 16, 3);
      c.fill();
      c.stroke();

      // Sloped front shield
      c.fillStyle = "#3e3a34";
      c.fillRect(3, -5, 5, 10);

      // Searchlight pod
      c.fillStyle = "#e0f0ff";
      c.beginPath();
      c.arc(-4, -6, 2.5, 0, R.TAU);
      c.fill();

      c.restore();
    } else {
      // ===== L1: LIGHT FLAK 20mm/37mm QUAD BATTERY =====
      // Quad auto-cannon barrels
      for (const off of [-4.2, 4.2]) {
        const ox = -Math.sin(ta) * off;
        const oy = Math.cos(ta) * off;
        for (const dd of [-0.08, 0.08]) {
          drawGun(c, x + ox, y + oy, ta + dd, 22, 2.2, b.recoil, b.flash);
        }
      }

      // Gun carriage & Turntable
      c.save();
      c.translate(x, y);
      c.rotate(ta);

      // Turntable center plate
      c.fillStyle = "#4a4e54";
      c.strokeStyle = "#1b1d20";
      c.lineWidth = 1.3;
      c.beginPath();
      c.arc(0, 0, 7.5, 0, R.TAU);
      c.fill();
      c.stroke();

      // Gunner curved front armor shield
      c.fillStyle = "#6e7565";
      c.strokeStyle = "#252820";
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(0, 0, 8.5, -Math.PI * 0.45, Math.PI * 0.45);
      c.lineTo(3, 0);
      c.closePath();
      c.fill();
      c.stroke();

      // Dual brass ammo feed drums on outer sides
      c.fillStyle = "#b88832";
      c.strokeStyle = "#4a320c";
      c.lineWidth = 1;
      c.fillRect(-4, -9, 5, 3.5);
      c.strokeRect(-4, -9, 5, 3.5);
      c.fillRect(-4, 5.5, 5, 3.5);
      c.strokeRect(-4, 5.5, 5, 3.5);

      c.restore();
    }
  }

  /* ------------------- INDUSTRIAL FACTORIES ------------------- */
  function plant(c, b, t) {
    const s = b.size * TILE;
    const x = b.x,
      y = b.y;
    const key = b.key;

    // Industrial Foundation Slab
    drawSlab(c, x, y, s * 0.92, s * 0.85, 12, "#d5c8ab", "#9e9176");

    if (key === "concrete") {
      // Cylindrical Cement Silos & Mixer
      for (let i = -1; i <= 1; i += 2) {
        const sx = x + i * (s * 0.26);
        const sy = y - s * 0.1;
        // Silo body
        c.fillStyle = "#b8b09e";
        c.strokeStyle = "#38342a";
        c.lineWidth = 1.3;
        c.beginPath();
        c.roundRect(sx - 10, sy - 24, 20, 32, 4);
        c.fill();
        c.stroke();
        // Silo dome top
        c.fillStyle = "#d0c8b6";
        c.beginPath();
        c.arc(sx, sy - 24, 10, Math.PI, 0);
        c.fill();
        c.stroke();
      }
      // Rotating mixer drum
      const mx = x,
        my = y + s * 0.12;
      c.fillStyle = "#6e6656";
      c.beginPath();
      c.arc(mx, my, 12, 0, R.TAU);
      c.fill();
      c.stroke();
      c.strokeStyle = "#e5b838";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(mx, my, 8, t * 2, t * 2 + 1.8);
      c.stroke();
    } else if (key === "steel") {
      // Blast Furnace, Foundry Hall & Smelting Chimney
      c.fillStyle = "#635b4f";
      c.strokeStyle = "#2a2620";
      c.lineWidth = 1.4;
      c.fillRect(x - s * 0.35, y - s * 0.25, s * 0.7, s * 0.5);
      c.strokeRect(x - s * 0.35, y - s * 0.25, s * 0.7, s * 0.5);

      // Glowing furnace mouth
      const glow = 0.6 + 0.4 * Math.sin(t * 3);
      c.fillStyle = `rgba(255, 120, 30, ${glow})`;
      c.fillRect(x - 8, y + s * 0.08, 16, 10);

      // Chimney stack pouring smoke & embers
      c.fillStyle = "#3f3a32";
      c.fillRect(x - s * 0.25, y - s * 0.45, 12, s * 0.35);
      c.strokeRect(x - s * 0.25, y - s * 0.45, 12, s * 0.35);

      // Smoke puff
      c.fillStyle = "rgba(80, 75, 70, 0.45)";
      c.beginPath();
      c.arc(x - s * 0.25 + 6, y - s * 0.48 - ((t * 8) % 16), 6 + ((t * 4) % 8), 0, R.TAU);
      c.fill();
    } else if (key === "alu") {
      // Aluminum Potline Smelter Hall with Roof Monitors
      c.fillStyle = "#8a96a3";
      c.strokeStyle = "#252e36";
      c.lineWidth = 1.3;
      c.fillRect(x - s * 0.38, y - s * 0.28, s * 0.76, s * 0.56);
      c.strokeRect(x - s * 0.38, y - s * 0.28, s * 0.76, s * 0.56);

      // Roof cooling monitors
      c.fillStyle = "#6b7782";
      c.fillRect(x - s * 0.3, y - s * 0.22, s * 0.6, 6);
      c.fillRect(x - s * 0.3, y - s * 0.05, s * 0.6, 6);
    } else if (key === "oil") {
      // Spherical LPG storage tanks & distillation towers
      // Sphere 1
      c.fillStyle = "#dce4eb";
      c.strokeStyle = "#38424a";
      c.lineWidth = 1.3;
      c.beginPath();
      c.arc(x - s * 0.18, y - s * 0.05, 14, 0, R.TAU);
      c.fill();
      c.stroke();
      // Sphere specular highlight
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.arc(x - s * 0.18 - 4, y - s * 0.05 - 4, 4, 0, R.TAU);
      c.fill();

      // Fractionating distillation column tower
      c.fillStyle = "#7a8794";
      c.fillRect(x + s * 0.15, y - s * 0.4, 10, s * 0.55);
      c.strokeRect(x + s * 0.15, y - s * 0.4, 10, s * 0.55);

      // Flare stack flame
      const fl = Math.sin(t * 8) * 3;
      c.fillStyle = "#ff6a18";
      c.beginPath();
      c.moveTo(x + s * 0.2, y - s * 0.4);
      c.lineTo(x + s * 0.2 + 3 + fl, y - s * 0.4 - 14);
      c.lineTo(x + s * 0.2 - 3, y - s * 0.4);
      c.fill();
    }
  }

  /* ------------------- MILITARY FACTORY / TANK WORKS ------------------- */
  function factory(c, b, _t) {
    const s = b.size * TILE;
    const x = b.x,
      y = b.y;

    drawSlab(c, x, y, s * 0.94, s * 0.88, 14, "#c8baa0", "#8e8068");

    // Sawtooth industrial roof
    c.fillStyle = "#7d7362";
    c.strokeStyle = "#2e281f";
    c.lineWidth = 1.3;
    const numBays = 3;
    for (let i = 0; i < numBays; i++) {
      const bx = x - s * 0.4 + i * ((s * 0.8) / numBays);
      c.beginPath();
      c.moveTo(bx, y - s * 0.35);
      c.lineTo(bx + (s * 0.8) / numBays, y - s * 0.35);
      c.lineTo(bx + ((s * 0.8) / numBays) * 0.7, y - s * 0.1);
      c.lineTo(bx, y - s * 0.1);
      c.closePath();
      c.fill();
      c.stroke();
    }

    // Heavy Roll-up Bay Door
    c.fillStyle = "#2c2720";
    c.fillRect(x - s * 0.2, y + s * 0.05, s * 0.4, s * 0.28);
    c.strokeRect(x - s * 0.2, y + s * 0.05, s * 0.4, s * 0.28);
  }

  /* ------------------- HQ COMMAND BUNKER ------------------- */
  function hq(c, b, t) {
    const s = b.size * TILE;
    const x = b.x,
      y = b.y;

    // Hardened Bunker Base
    drawSlab(c, x, y, s * 0.94, s * 0.88, 16, "#b8aa8e", "#7e7058");

    // Command Tower Annex
    c.fillStyle = factionCol(b.fac, 0.85);
    c.strokeStyle = "#252019";
    c.lineWidth = 1.4;
    c.fillRect(x - s * 0.25, y - s * 0.3, s * 0.5, s * 0.35);
    c.strokeRect(x - s * 0.25, y - s * 0.3, s * 0.5, s * 0.35);

    // Rotating Radar Dish on roof
    const radAngle = t * 1.8;
    c.strokeStyle = "#3888cc";
    c.lineWidth = 2.2;
    c.beginPath();
    c.arc(x + s * 0.2, y - s * 0.2, 10, radAngle - 0.8, radAngle + 0.8);
    c.stroke();

    // Radio Mast with blinking red beacon
    c.strokeStyle = "#2c2822";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x - s * 0.2, y - s * 0.3);
    c.lineTo(x - s * 0.2, y - s * 0.6);
    c.stroke();

    // Blinking LED beacon
    const blink = Math.sin(t * 6) > 0;
    c.fillStyle = blink ? "#ff2222" : "#551111";
    c.beginPath();
    c.arc(x - s * 0.2, y - s * 0.62, 3, 0, R.TAU);
    c.fill();
  }

  /* ------------------- AIRFIELD & HANGAR ------------------- */
  function airfield(c, b, _t) {
    const s = b.size * TILE;
    const x = b.x,
      y = b.y;

    // Asphalt Runway Strip with Threshold Bars
    c.fillStyle = "#4a4f56";
    c.strokeStyle = "#22252a";
    c.lineWidth = 1.3;
    c.fillRect(x - s * 0.45, y - s * 0.45, s * 0.9, s * 0.9);
    c.strokeRect(x - s * 0.45, y - s * 0.45, s * 0.9, s * 0.9);

    // White Runway Markings
    c.fillStyle = "#ffffff";
    for (let i = 0; i < 4; i++) {
      c.fillRect(x - 3, y - s * 0.35 + i * (s * 0.22), 6, s * 0.12);
    }

    // Aircraft Hangar
    c.fillStyle = "#6a7682";
    c.beginPath();
    c.roundRect(x - s * 0.4, y - s * 0.4, s * 0.35, s * 0.35, 4);
    c.fill();
    c.stroke();
  }

  /* ------------------- HELIPAD ------------------- */
  function heliPad(c, b, _t) {
    const s = b.size * TILE;
    const x = b.x,
      y = b.y;

    drawSlab(c, x, y, s * 0.9, s * 0.8, 8, "#b5a88e", "#82755c");

    // Octagonal landing circle
    c.strokeStyle = "#e5b838";
    c.lineWidth = 2.4;
    c.beginPath();
    c.arc(x, y, s * 0.28, 0, R.TAU);
    c.stroke();

    // Bold 'H' Marking
    c.fillStyle = "#ffffff";
    c.font = `bold ${Math.round(s * 0.32)}px sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("H", x, y);
  }

  /* ------------------- SHIPYARD ------------------- */
  function shipyard(c, b, _t) {
    const s = b.size * TILE;
    const x = b.x,
      y = b.y;

    // Drydock Wharf
    c.fillStyle = "#9a8e78";
    c.fillRect(x - s * 0.45, y - s * 0.4, s * 0.9, s * 0.8);
    c.strokeStyle = "#383228";
    c.lineWidth = 1.3;
    c.strokeRect(x - s * 0.45, y - s * 0.4, s * 0.9, s * 0.8);

    // Gantry Crane
    c.strokeStyle = "#e59828";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x - s * 0.35, y - s * 0.3);
    c.lineTo(x + s * 0.35, y - s * 0.3);
    c.stroke();
  }

  /* ------------------- TRAINYARD ------------------- */
  function trainYard(c, b, _t) {
    const s = b.size * TILE;
    const x = b.x,
      y = b.y;

    drawSlab(c, x, y, s * 0.92, s * 0.85, 12, "#b8aa90", "#80725a");

    // Dual Tracks
    c.strokeStyle = "#3e4247";
    c.lineWidth = 2;
    for (const ty of [y - s * 0.15, y + s * 0.15]) {
      c.beginPath();
      c.moveTo(x - s * 0.44, ty - 3);
      c.lineTo(x + s * 0.44, ty - 3);
      c.moveTo(x - s * 0.44, ty + 3);
      c.lineTo(x + s * 0.44, ty + 3);
      c.stroke();
    }
  }

  /* ------------------- SPECIAL TOWERS ------------------- */
  function crane(c, b, t) {
    const s = b.size * TILE;
    drawSlab(c, b.x, b.y, s * 0.7, s * 0.6, 8, "#b8aa90", "#80725a");

    // Tall Steel Truss Gantry Arm
    const an = b.craneA !== undefined ? b.craneA : t * 0.5;
    c.strokeStyle = "#d49022";
    c.lineWidth = 3.2;
    c.beginPath();
    c.moveTo(b.x, b.y - 10);
    c.lineTo(b.x + Math.cos(an) * s * 0.6, b.y - 10 + Math.sin(an) * s * 0.4);
    c.stroke();
  }

  function radar(c, b, t) {
    const s = b.size * TILE;
    drawSlab(c, b.x, b.y, s * 0.6, s * 0.55, 8, "#b5a88e", "#82755c");

    const a = t * 1.2 + b.seed;
    c.strokeStyle = "#25221d";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(b.x, b.y);
    c.lineTo(b.x, b.y - 28);
    c.stroke();

    // Spinning Dish
    c.strokeStyle = "#3888cc";
    c.lineWidth = 2.4;
    c.beginPath();
    c.arc(b.x, b.y - 28, 12, a - 0.7, a + 0.7);
    c.stroke();
  }

  function jammerTower(c, b, t) {
    const s = b.size * TILE;
    drawSlab(c, b.x, b.y, s * 0.6, s * 0.55, 8, "#636d78", "#3e464f");

    // EW Mast
    c.strokeStyle = "#25221d";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(b.x, b.y);
    c.lineTo(b.x, b.y - 32);
    c.stroke();

    // Concentric jamming pulse
    const p = (t * 0.7 + b.seed) % 1;
    c.strokeStyle = `rgba(140, 160, 220, ${0.7 * (1 - p)})`;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(b.x, b.y - 32, 6 + p * 38, 0, R.TAU);
    c.stroke();
  }

  function detectorTower(c, b, t) {
    radar(c, b, t);
  }

  function commandTower(c, b, _t) {
    const s = b.size * TILE;
    drawSlab(c, b.x, b.y, s * 0.75, s * 0.7, 14, "#d8ca9a", "#9a8c5e");

    // Gold emblem
    c.fillStyle = "#e5b838";
    c.strokeStyle = "#7a5c12";
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(b.x, b.y - 8, 10, 0, R.TAU);
    c.fill();
    c.stroke();
  }

  function defence(c, b, _t) {
    drawSlab(c, b.x, b.y, 28, 24, 8, "#b5a88e", "#82755c");
    drawGun(c, b.x, b.y, b.turretA || 0, 18, 3, b.recoil, b.flash);
  }

  /* =====================================================================
     DISPATCH TABLES & EXPORTS
     ===================================================================== */

  const UNIT_DRAW = {
    inf: infantry,
    car: scout,
    truck,
    half: halftrack,
    tank,
    spg,
    td,
    artillery: spg,
    flak: halftrack,
    heli,
    jet,
    plane,
    boat,
    ship,
    sub,
    train,
  };

  const BLD_DRAW = {
    hq,
    concrete: plant,
    steel: plant,
    alu: plant,
    oil: plant,
    works: factory,
    airfield,
    heli: heliPad,
    shipyard,
    trainyard: trainYard,
    flak: flakTower,
    wall,
    gate,
    mg: defence,
    atgun: defence,
    howitzer: defence,
    crane,
    sight: radar,
    jammer: jammerTower,
    detector: detectorTower,
    maxpower: commandTower,
    maxmil: commandTower,
    maxoffice: commandTower,
    maxcommand: commandTower,
    maxextend: commandTower,
    maxgroup: commandTower,
  };

  const Sprites = {
    setLOD,
    get lod() {
      return LOD;
    },

    unit(c, u, t, g) {
      const fn = UNIT_DRAW[u.def.shape] || tank;
      fn(c, u, t, g);

      // Smokes when heavily damaged
      const hpf = u.hp / u.maxHp;
      if (hpf < 0.35 && Math.random() < 0.25) {
        R.FX.smoke(null, u.x + (Math.random() - 0.5) * 8, u.y - 4, 0.6);
      }
    },

    building(c, b, t, g) {
      const fn = BLD_DRAW[b.key] || factory;
      if (!b.built) {
        // Scaffolding when under construction
        const s = b.size * TILE;
        c.save();
        c.strokeStyle = "rgba(180, 140, 60, 0.8)";
        c.lineWidth = 1.4;
        c.strokeRect(b.x - s * 0.45, b.y - s * 0.45, s * 0.9, s * 0.9);
        c.fillStyle = "rgba(220, 200, 150, 0.3)";
        c.fillRect(b.x - s * 0.45, b.y - s * 0.45, s * 0.9, s * 0.9);
        c.restore();
        return;
      }
      fn(c, b, t, g);
    },

    ghost(c, key, tx, ty, ok, _g) {
      const def = R.BDEF[key];
      if (!def) return;
      const s = def.size * TILE;
      const x = (tx + def.size / 2) * TILE;
      const y = (ty + def.size / 2) * TILE;
      c.save();
      c.fillStyle = ok ? "rgba(80, 200, 80, 0.4)" : "rgba(220, 60, 60, 0.45)";
      c.strokeStyle = ok ? "rgba(40, 160, 40, 0.9)" : "rgba(180, 30, 30, 0.95)";
      c.lineWidth = 2;
      c.fillRect(x - s / 2, y - s / 2, s, s);
      c.strokeRect(x - s / 2, y - s / 2, s, s);
      c.restore();
    },

    wreck(c, w, _t) {
      shadow(c, w.x + 2, w.y + 3, 16, 10, 0.3);
      c.fillStyle = "#3a342d";
      c.strokeStyle = "#1b1814";
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(w.x, w.y, 10, 0, R.TAU);
      c.fill();
      c.stroke();
    },
  };

  R.Sprites = Sprites;
})();
