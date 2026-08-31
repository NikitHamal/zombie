/* SANDSTORM — RTS core: the constants, the paper palette, the seeded
   noise, and the small maths everything else leans on.

   The whole world is a tile grid. Ground units walk tiles, ships hold the
   water, aircraft ignore the grid entirely. Everything that needs to know
   "how big is the map" asks this file. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});

  /* ---------- scale ---------- */

  const TILE = 40; // world units per tile — a tank is about one tile long
  const MAPW = 300,
    MAPH = 300; // tiles — 12000 x 12000 world units, "very vast"
  const W = MAPW * TILE,
    H = MAPH * TILE;

  R.TILE = TILE;
  R.MAPW = MAPW;
  R.MAPH = MAPH;
  R.W = W;
  R.H = H;

  /* ---------- terrain kinds ---------- */

  const T_SAND = 0; // open dunes: walkable, slow-ish
  const T_FIRM = 1; // packed ground: walkable, the good building land
  const T_ROCK = 2; // mesa ridges: nothing walks here, nothing sees through
  const T_WATER = 3; // river, lakes, sea: ships only
  const T_SCRUB = 4; // dry brush: walkable, breaks sight a little
  const T_OIL = 5; // an oil seep: a refinery here pays double
  const T_ROAD = 6; // highway: fast, and it leaves the map at the edges
  const T_RAIL = 7; // the rail line: walkable, and the only ground trains know

  R.T = {
    SAND: T_SAND,
    FIRM: T_FIRM,
    ROCK: T_ROCK,
    WATER: T_WATER,
    SCRUB: T_SCRUB,
    OIL: T_OIL,
    ROAD: T_ROAD,
    RAIL: T_RAIL,
  };

  // ground speed multiplier per tile kind (road is a highway, sand drags)
  const SPEED_BY_T = [0.86, 1, 0, 0, 0.78, 0.92, 1.28, 1];
  // can a ground unit stand here at all
  const OPEN_BY_T = [1, 1, 0, 0, 1, 1, 1, 1];

  R.SPEED_BY_T = SPEED_BY_T;
  R.OPEN_BY_T = OPEN_BY_T;

  /* ---------- movement layers ---------- */

  const L_GROUND = 0,
    L_AIR = 1,
    L_SEA = 2,
    L_TRAIN = 3;
  R.L = { GROUND: L_GROUND, AIR: L_AIR, SEA: L_SEA, TRAIN: L_TRAIN };

  /* ---------- the paper palette ----------
     Everything is drawn in ink on a warm page. The desert is a pale wash,
     the factions are ink tints strong enough to read at a glance when
     three armies are on the same tile. */

  const PAL = {
    page: "#efe7d5",
    pageDark: "#e3d9c3",
    ink: "#3d342b",
    inkSoft: "rgba(61,52,43,0.55)",
    inkFaint: "rgba(61,52,43,0.28)",

    sand: [232, 220, 192],
    sandDeep: [216, 201, 168],
    firm: [214, 198, 164],
    rock: [176, 158, 130],
    rockDark: [140, 124, 100],
    water: [130, 164, 186],
    waterDeep: [96, 132, 158],
    scrub: [150, 158, 104],
    oil: [72, 64, 54],
    road: [201, 184, 150],
    rail: [128, 112, 90],

    build: [196, 172, 132],
    buildDark: [148, 126, 94],
    metal: [138, 138, 132],
    steel: [122, 126, 128],
    rust: [150, 96, 62],

    fire: [214, 122, 52],
    smoke: [140, 132, 120],
    blood: [148, 74, 58],
  };
  R.PAL = PAL;

  // css strings, built once
  function rgb(a, alpha) {
    return alpha === undefined
      ? "rgb(" + a[0] + "," + a[1] + "," + a[2] + ")"
      : "rgba(" + a[0] + "," + a[1] + "," + a[2] + "," + alpha + ")";
  }
  R.rgb = rgb;
  R.css = {};
  for (const k in PAL) if (Array.isArray(PAL[k])) R.css[k] = rgb(PAL[k]);

  /* ---------- factions ----------
     id 0 is always the player. The rest are nations that want the same
     ground, and the horde, which wants all of it. */

  const FACTIONS = [
    {
      id: 0,
      key: "player",
      name: "Free Company",
      short: "FC",
      ink: [58, 106, 62],
      tint: "#3a6a3e",
      ally: false,
    },
    {
      id: 1,
      key: "iron",
      name: "Iron Pact",
      short: "IP",
      ink: [138, 74, 58],
      tint: "#8a4a3a",
      ally: false,
    },
    {
      id: 2,
      key: "azure",
      name: "Azure League",
      short: "AL",
      ink: [58, 90, 134],
      tint: "#3a5a86",
      ally: true,
    },
    {
      id: 3,
      key: "sand",
      name: "Sand Union",
      short: "SU",
      ink: [138, 106, 42],
      tint: "#8a6a2a",
      ally: true,
    },
    {
      id: 4,
      key: "crimson",
      name: "Crimson Front",
      short: "CF",
      ink: [138, 58, 74],
      tint: "#8a3a4a",
      ally: false,
    },
    {
      id: 5,
      key: "jade",
      name: "Jade Accord",
      short: "JA",
      ink: [46, 118, 104],
      tint: "#2e7668",
      ally: false,
    },
    {
      id: 6,
      key: "horde",
      name: "The Rot",
      short: "ROT",
      ink: [104, 74, 112],
      tint: "#684a70",
      ally: false,
    },
  ];
  R.FACTIONS = FACTIONS;
  R.NF = FACTIONS.length;
  // fast lookup: faction id -> css tint
  R.factionTint = FACTIONS.map((f) => rgb(f.ink));
  R.factionName = FACTIONS.map((f) => f.name);

  // who is at war with whom. The player's own diplomacy can change; this
  // is the opening state. The horde is at war with everybody, always.
  R.hostileTo = function (a, b) {
    if (a === b) return false;
    if (a === 6 || b === 6) return true; // the Rot eats everyone
    if (a === -1 || b === -1) return true; // neutral ground defends itself against all
    const A = R.diplo[a],
      B = R.diplo[b];
    return !(A.ally[b] || B.ally[a]);
  };
  // the same side: same flag, or a sworn ally. Gates answer to this — one
  // nation drives through its own door, and its friends go with it.
  R.sameTeam = function (a, b) {
    if (a === b) return true;
    if (a === 6 || b === 6) return false; // nobody shares a door with the Rot
    if (a === -1 || b === -1) return false; // and nobody shares a door with the sand
    const A = R.diplo[a],
      B = R.diplo[b];
    return !!(A.ally[b] || B.ally[a]);
  };
  R.diplo = FACTIONS.map((f, i) => ({
    id: i,
    ally: FACTIONS.map((g, j) => i === j),
    // a nation's standing word: how well it likes you, and how afraid
    trust: 0,
    fear: 0,
  }));
  // nations 2 and 3 open as the player's allies; 1, 4, 5 want the map
  R.diplo[0].ally[2] = R.diplo[2].ally[0] = true;
  R.diplo[0].ally[3] = R.diplo[3].ally[0] = true;
  R.diplo[0].ally[1] = R.diplo[1].ally[0] = false;
  R.diplo[0].ally[4] = R.diplo[4].ally[0] = false;
  R.diplo[0].ally[5] = R.diplo[5].ally[0] = false;
  R.diplo[6].ally = R.diplo[6].ally.map(() => false);
  R.diplo[6].ally[6] = true;

  /* ---------- maths ---------- */

  const TAU = Math.PI * 2;
  R.TAU = TAU;

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function dist2(ax, ay, bx, by) {
    const dx = bx - ax,
      dy = by - ay;
    return dx * dx + dy * dy;
  }
  function dist(ax, ay, bx, by) {
    return Math.sqrt(dist2(ax, ay, bx, by));
  }
  // shortest signed turn from a to b
  function angDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }
  function turnToward(cur, want, maxStep) {
    const d = angDiff(cur, want);
    return cur + clamp(d, -maxStep, maxStep);
  }
  R.clamp = clamp;
  R.lerp = lerp;
  R.dist2 = dist2;
  R.dist = dist;
  R.angDiff = angDiff;
  R.turnToward = turnToward;
  R.smooth = (t) => t * t * (3 - 2 * t);

  /* ---------- seeded noise ----------
     Value noise on a hashed lattice, smoothstepped, stacked into fBm.
     Same seed, same desert — every time. */

  function hash2(x, y, seed) {
    let h = x * 374761393 + y * 668265263 + seed * 1442695040;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  R.hash2 = hash2;

  function vnoise(x, y, seed) {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = x - xi,
      yf = y - yi;
    const u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed),
      b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed),
      d = hash2(xi + 1, yi + 1, seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  R.vnoise = vnoise;

  function fbm(x, y, seed, oct, gain) {
    oct = oct || 4;
    gain = gain || 0.5;
    let s = 0,
      amp = 1,
      tot = 0,
      f = 1;
    for (let i = 0; i < oct; i++) {
      s += vnoise(x * f, y * f, seed + i * 101) * amp;
      tot += amp;
      amp *= gain;
      f *= 2;
    }
    return s / tot;
  }
  R.fbm = fbm;

  // ridged noise: sharp crests, used for the mesa ridges
  function ridge(x, y, seed, oct) {
    let s = 0,
      amp = 1,
      tot = 0,
      f = 1;
    for (let i = 0; i < (oct || 4); i++) {
      const n = 1 - Math.abs(vnoise(x * f, y * f, seed + i * 71) * 2 - 1);
      s += n * n * amp;
      tot += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / tot;
  }
  R.ridge = ridge;

  /* ---------- ids ---------- */

  let _id = 1;
  R.nextId = () => _id++;

  /* ---------- formatting ---------- */

  function num(n) {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
    if (n >= 1e4) return Math.round(n / 1e3) + "k";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }
  R.num = num;

  function mmss(s) {
    s = Math.max(0, Math.ceil(s));
    const m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  }
  R.mmss = mmss;

  /* ---------- the game clock ----------
     An RTS day: the light turns over slowly, so a long game reads as a
     long game. Dawn, day, dusk, night — defences get a little better at
     night (searchlights are easier to see) and the Rot is worse. */

  const DAY_LEN = 300; // seconds of full daylight
  const DUSK = 40,
    NIGHT_LEN = 200,
    DAWN = 40;
  const CYCLE = DAY_LEN + DUSK + NIGHT_LEN + DAWN;

  R.CLOCK = { DAY_LEN, DUSK, NIGHT_LEN, DAWN, CYCLE };

  // 0 = deep night, 1 = full day
  R.daylight = function (t) {
    const c = t % CYCLE;
    if (c < DAWN) return 0.12 + 0.88 * R.smooth(c / DAWN);
    if (c < DAWN + DAY_LEN) return 1;
    if (c < DAWN + DAY_LEN + DUSK) return 1 - 0.88 * R.smooth((c - DAWN - DAY_LEN) / DUSK);
    return 0.12;
  };
  R.isNight = function (t) {
    return R.daylight(t) < 0.4;
  };
  R.clockLabel = function (t) {
    const c = t % CYCLE;
    const day = Math.floor(t / CYCLE) + 1;
    let phase = "night";
    let f = 0;
    if (c < DAWN) {
      phase = "dawn";
      f = c / DAWN;
    } else if (c < DAWN + DAY_LEN) {
      phase = "day";
      f = (c - DAWN) / DAY_LEN;
    } else if (c < DAWN + DAY_LEN + DUSK) {
      phase = "dusk";
      f = (c - DAWN - DAY_LEN) / DUSK;
    } else {
      phase = "night";
      f = (c - DAWN - DAY_LEN - DUSK) / NIGHT_LEN;
    }
    // map the phase onto a 24h clock face
    const hour =
      phase === "dawn"
        ? 4 + f * 3
        : phase === "day"
          ? 7 + f * 10
          : phase === "dusk"
            ? 17 + f * 3
            : 20 + f * 8;
    const hh = Math.floor(hour) % 24,
      mm = Math.floor((hour % 1) * 60);
    return "DAY " + day + " · " + String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
  };

  /* ---------- selection helpers used everywhere ---------- */

  R.aabb = function (o, x0, y0, x1, y1) {
    return o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1;
  };
})();
