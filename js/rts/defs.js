/* Desert Order — the tables.

   Everything with numbers in it lives here: what a thing costs, how long
   it takes to build, how hard it hits, what it hits, how far it sees, and
   how the sprite should be drawn. Balance changes are made in this file
   and nowhere else.

   The damage model is the Desert Order one, deliberately:

   - a weapon that cannot shoot upward simply cannot hit aircraft, and an
     aircraft can shoot down at anything that cannot answer (that is why
     you build flak);
   - armour is a number, penetration is a number, and the gap between them
     scales the hit;
   - flak towers and command centres are *hard targets*: the more guns
     shoot one, the less each individual gun does. One hundred Bredas hit
     three times as hard as ten, not ten times. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});

  /* =======================================================================
     RESOURCES
     ======================================================================= */

  R.RES = [
    {
      key: "concrete",
      name: "Concrete",
      short: "CON",
      ink: [150, 146, 132],
      cap: 1000,
      base: 1000000,
    },
    { key: "steel", name: "Steel", short: "STL", ink: [110, 118, 126], cap: 300, base: 500000 },
    { key: "alu", name: "Aluminium", short: "ALU", ink: [158, 162, 168], cap: 100, base: 250000 },
    { key: "fuel", name: "Fuel", short: "FUE", ink: [166, 122, 58], cap: 30, base: 50000 },
  ];
  R.RES_KEYS = R.RES.map((r) => r.key);
  R.RES_NAME = {};
  R.RES_SHORT = {};
  R.RES_INK = {};
  R.RES.forEach((r) => {
    R.RES_NAME[r.key] = r.name;
    R.RES_SHORT[r.key] = r.short;
    R.RES_INK[r.key] = R.rgb(r.ink);
  });

  /* =======================================================================
     WEAPONS
     dmg    damage before armour and multipliers
     rof    shots per second
     range  world units (one tile is 40)
     pen    armour penetration
     vs     multiplier per target class (inf/soft/arm/air/sea/bld)
     aa     can engage aircraft
     as     can engage surface targets
     kind   how the shot travels: bullet shell rocket missile bomb torp claw acid
     splash world-unit radius of the blast (0 = single target)
     arc    the shot is lobbed (howitzers): longer flight, hits anything
     ======================================================================= */

  const W = {
    rifle: {
      dmg: 9,
      rof: 1.5,
      range: 215,
      pen: 4,
      speed: 1500,
      kind: "bullet",
      vs: { inf: 1.35, soft: 0.8, arm: 0.2, bld: 0.32 },
    },
    smg: {
      dmg: 6,
      rof: 5,
      range: 165,
      pen: 3,
      speed: 1400,
      kind: "bullet",
      vs: { inf: 1.2, soft: 0.6, arm: 0.12, bld: 0.25 },
    },
    mg: {
      dmg: 7,
      rof: 6.5,
      range: 250,
      pen: 6,
      speed: 1600,
      kind: "bullet",
      vs: { inf: 1.7, soft: 1.15, arm: 0.13, bld: 0.3 },
    },
    hmg: {
      dmg: 11,
      rof: 4.5,
      range: 275,
      pen: 9,
      speed: 1700,
      kind: "bullet",
      vs: { inf: 1.5, soft: 1.4, arm: 0.28, bld: 0.4 },
    },
    at: {
      dmg: 62,
      rof: 0.5,
      range: 270,
      pen: 30,
      speed: 420,
      kind: "rocket",
      vs: { arm: 1.55, soft: 1.05, bld: 0.72, inf: 0.45 },
    },
    sniper: {
      dmg: 46,
      rof: 0.45,
      range: 430,
      pen: 14,
      speed: 1900,
      kind: "bullet",
      vs: { inf: 2.4, soft: 0.55, arm: 0.14, bld: 0.2 },
    },
    cannon_l: {
      dmg: 34,
      rof: 1.15,
      range: 305,
      pen: 22,
      speed: 900,
      kind: "shell",
      splash: 26,
      vs: { arm: 1.1, soft: 1.25, bld: 0.8, inf: 0.7 },
    },
    cannon_m: {
      dmg: 64,
      rof: 0.85,
      range: 345,
      pen: 34,
      speed: 980,
      kind: "shell",
      splash: 34,
      vs: { arm: 1.4, soft: 1.1, bld: 1.0, inf: 0.6 },
    },
    cannon_h: {
      dmg: 112,
      rof: 0.58,
      range: 385,
      pen: 46,
      speed: 1050,
      kind: "shell",
      splash: 44,
      vs: { arm: 1.65, soft: 1.0, bld: 1.2, inf: 0.5 },
    },
    howitzer: {
      dmg: 132,
      rof: 0.27,
      range: 780,
      pen: 30,
      speed: 620,
      kind: "shell",
      splash: 92,
      arc: true,
      vs: { bld: 1.5, arm: 1.0, soft: 1.1, inf: 1.15 },
    },
    flak: {
      dmg: 15,
      rof: 5.5,
      range: 335,
      pen: 12,
      speed: 1300,
      kind: "bullet",
      aa: true,
      as: true,
      vs: { air: 1.7, inf: 1.05, soft: 0.85, arm: 0.3, bld: 0.35 },
    },
    flak_hv: {
      dmg: 26,
      rof: 3.4,
      range: 400,
      pen: 20,
      speed: 1250,
      kind: "shell",
      splash: 40,
      aa: true,
      as: true,
      vs: { air: 1.9, inf: 1.1, soft: 0.9, arm: 0.4, bld: 0.5 },
    },
    sam: {
      dmg: 92,
      rof: 0.5,
      range: 540,
      pen: 18,
      speed: 700,
      kind: "missile",
      splash: 46,
      aa: true,
      as: false,
      vs: { air: 2.1 },
    },
    acannon: {
      dmg: 12,
      rof: 8,
      range: 280,
      pen: 14,
      speed: 1500,
      kind: "bullet",
      vs: { arm: 0.9, soft: 1.3, air: 1.2, inf: 0.9, bld: 0.3 },
    },
    rocket: {
      dmg: 24,
      rof: 2.6,
      range: 315,
      pen: 32,
      speed: 560,
      kind: "rocket",
      splash: 36,
      vs: { arm: 1.25, soft: 1.3, bld: 0.85, inf: 0.8 },
    },
    bomb: {
      dmg: 168,
      rof: 0.28,
      range: 120,
      pen: 40,
      speed: 0,
      kind: "bomb",
      splash: 116,
      vs: { bld: 1.65, arm: 1.05, soft: 1.2, inf: 1.25, sea: 0.9 },
    },
    naval_gun: {
      dmg: 72,
      rof: 0.7,
      range: 520,
      pen: 36,
      speed: 850,
      kind: "shell",
      splash: 54,
      vs: { bld: 1.15, arm: 1.05, soft: 1.1, inf: 0.85, sea: 1.0 },
    },
    naval_aa: {
      dmg: 13,
      rof: 4.2,
      range: 370,
      pen: 10,
      speed: 1250,
      kind: "bullet",
      aa: true,
      as: true,
      vs: { air: 1.5, inf: 0.9, soft: 0.7 },
    },
    torpedo: {
      dmg: 158,
      rof: 0.35,
      range: 430,
      pen: 44,
      speed: 380,
      kind: "torp",
      splash: 60,
      vs: { sea: 1.9, bld: 0.6 },
    },
    claws: {
      dmg: 20,
      rof: 1.25,
      range: 30,
      pen: 6,
      speed: 0,
      kind: "claw",
      vs: { inf: 1.4, soft: 0.9, arm: 0.5, bld: 0.7 },
    },
    claws_hv: {
      dmg: 62,
      rof: 0.85,
      range: 38,
      pen: 18,
      speed: 0,
      kind: "claw",
      splash: 30,
      vs: { inf: 1.5, soft: 1.1, arm: 0.8, bld: 1.1 },
    },
    acid: {
      dmg: 26,
      rof: 0.8,
      range: 190,
      pen: 8,
      speed: 520,
      kind: "rocket",
      splash: 44,
      vs: { inf: 1.5, soft: 0.9, arm: 0.35, bld: 0.5 },
    },
  };
  for (const k in W) W[k].key = k;
  R.WDEF = W;

  /* =======================================================================
     UNITS
     cls     inf | soft | arm | air | sea   (drives weapon multipliers)
     shape   which sprite routine draws it
     hp/arm  hit points and armour
     speed   world units per second on open ground
     sight   how far it sees (world units)
     cost    resources to build
     time    seconds to build
     pop     army cap it uses
     cap     special abilities
     ======================================================================= */

  const U = {
    /* ---- vehicles ---- */
    scout: {
      name: "Scout Car",
      short: "SCT",
      cls: "soft",
      shape: "car",
      hp: 268,
      arm: 6,
      speed: 168,
      sight: 440,
      w: "hmg",
      pop: 2,
      time: 13,
      cost: { steel: 130, fuel: 62 },
      from: "works",
      fast: true,
      role: "Eyes and teeth. Fast enough to run, too thin to stay.",
    },
    apc: {
      name: "Halftrack",
      short: "APC",
      cls: "soft",
      shape: "half",
      hp: 440,
      arm: 9,
      speed: 122,
      sight: 350,
      w: "mg",
      pop: 3,
      time: 18,
      cost: { steel: 210, fuel: 110 },
      from: "works",
      carry: 4,
      role: "Carries four men. The machine gun is for show; the men are not.",
    },
    ltank: {
      name: "Light Tank",
      short: "LT",
      cls: "arm",
      shape: "tank",
      hp: 640,
      arm: 17,
      speed: 120,
      sight: 350,
      w: "cannon_l",
      pop: 3,
      time: 22,
      cost: { steel: 330, fuel: 125 },
      from: "works",
      role: "The workhorse. Fast, cheap, outclassed by anything heavier.",
    },
    mtank: {
      name: "Medium Tank",
      short: "MT",
      cls: "arm",
      shape: "tank",
      hp: 1000,
      arm: 25,
      speed: 98,
      sight: 370,
      w: "cannon_m",
      pop: 5,
      time: 31,
      cost: { steel: 640, alu: 130, fuel: 210 },
      from: "works",
      role: "The line. What you fight a war with.",
    },
    htank: {
      name: "Heavy Tank",
      short: "HT",
      cls: "arm",
      shape: "tank",
      big: true,
      hp: 1560,
      arm: 34,
      speed: 74,
      sight: 370,
      w: "cannon_h",
      pop: 8,
      time: 44,
      cost: { steel: 1150, alu: 320, fuel: 350 },
      from: "works",
      role: "Slow, expensive, and it does not care what you shoot at it.",
    },
    arty: {
      name: "Self-Propelled Gun",
      short: "SPG",
      cls: "soft",
      shape: "artillery",
      hp: 430,
      arm: 8,
      speed: 78,
      sight: 430,
      w: "howitzer",
      pop: 5,
      time: 32,
      cost: { steel: 500, alu: 145, fuel: 185 },
      from: "works",
      indirect: true,
      role: "Outranges every tower on the map. Cannot shoot what it cannot see.",
    },
    mflak: {
      name: "Mobile Flak",
      short: "FLAK",
      cls: "soft",
      shape: "flak",
      hp: 540,
      arm: 13,
      speed: 102,
      sight: 390,
      w: "flak",
      pop: 4,
      time: 27,
      cost: { steel: 415, alu: 110, fuel: 155 },
      from: "works",
      role: "Bring your own sky. An army without this is an air force's target practice.",
    },
    truck: {
      name: "Conquest Truck",
      short: "CQT",
      cls: "soft",
      shape: "truck",
      hp: 350,
      arm: 6,
      speed: 132,
      sight: 330,
      pop: 3,
      time: 19,
      cost: { steel: 205, fuel: 95 },
      from: "works",
      capture: true,
      unarmed: true,
      role: "Takes ground. Drive it onto a settlement and hold it to claim the base.",
    },
    supply: {
      name: "Supply Truck",
      short: "SUP",
      cls: "soft",
      shape: "truck",
      hp: 390,
      arm: 6,
      speed: 120,
      sight: 310,
      pop: 2,
      time: 17,
      cost: { steel: 185, fuel: 82 },
      from: "works",
      repair: 42,
      unarmed: true,
      role: "Follows the army and mends it between fights.",
    },

    /* ---- air ---- */
    rheli: {
      name: "Scout Helicopter",
      short: "RECCE",
      cls: "air",
      shape: "heli",
      hp: 330,
      arm: 4,
      speed: 195,
      sight: 540,
      w: "smg",
      pop: 3,
      time: 20,
      cost: { steel: 260, alu: 150, fuel: 180 },
      from: "airfield",
      alt: 42,
      role: "Fast, quiet, sees everything. Unarmed enough to regret a fight.",
    },
    aheli: {
      name: "Gunship",
      short: "GUN",
      cls: "air",
      shape: "heli",
      hp: 540,
      arm: 11,
      speed: 168,
      sight: 500,
      w: "rocket",
      pop: 5,
      time: 30,
      cost: { steel: 480, alu: 320, fuel: 300 },
      from: "airfield",
      alt: 46,
      role: "Eats tanks. Anything with flak eats it.",
    },
    fighter: {
      name: "Fighter",
      short: "FIG",
      cls: "air",
      shape: "jet",
      hp: 580,
      arm: 8,
      speed: 305,
      sight: 580,
      w: "acannon",
      pop: 5,
      time: 28,
      cost: { steel: 520, alu: 420, fuel: 380 },
      from: "airfield",
      alt: 60,
      air: 1,
      role: "Owns the sky, and only the sky. It cannot touch a tank.",
    },
    bomber: {
      name: "Bomber",
      short: "BMB",
      cls: "air",
      shape: "jet",
      wide: true,
      hp: 790,
      arm: 13,
      speed: 212,
      sight: 500,
      w: "bomb",
      pop: 7,
      time: 40,
      cost: { steel: 720, alu: 520, fuel: 520 },
      from: "airfield",
      alt: 66,
      ground: 1,
      role: "Levels a base. Loses to a fighter, every time.",
    },
    theli: {
      name: "Transport Helicopter",
      short: "TLFT",
      cls: "air",
      shape: "heli",
      wide: true,
      hp: 620,
      arm: 9,
      speed: 162,
      sight: 460,
      pop: 4,
      time: 32,
      cost: { steel: 420, alu: 260, fuel: 320 },
      from: "airfield",
      carry: 6,
      alt: 50,
      unarmed: true,
      role: "Puts infantry anywhere on the map. Six at a time.",
    },

    /* ---- sea ---- */
    pboat: {
      name: "Patrol Boat",
      short: "PT",
      cls: "sea",
      shape: "boat",
      hp: 350,
      arm: 6,
      speed: 136,
      sight: 400,
      w: "hmg",
      pop: 2,
      time: 16,
      cost: { steel: 190, fuel: 90 },
      from: "shipyard",
      role: "Cheap hull on the water. Keeps the river yours.",
    },
    gunboat: {
      name: "Gunboat",
      short: "GB",
      cls: "sea",
      shape: "boat",
      hp: 640,
      arm: 13,
      speed: 114,
      sight: 470,
      w: "naval_gun",
      pop: 5,
      time: 30,
      cost: { steel: 560, alu: 120, fuel: 190 },
      from: "shipyard",
      indirect: true,
      role: "Outranges every tower near the shore, and shells it from the water.",
    },
    destroyer: {
      name: "Destroyer",
      short: "DD",
      cls: "sea",
      shape: "ship",
      hp: 1080,
      arm: 19,
      speed: 130,
      sight: 540,
      w: "naval_gun",
      w2: "naval_aa",
      pop: 8,
      time: 46,
      cost: { steel: 980, alu: 380, fuel: 420 },
      from: "shipyard",
      indirect: true,
      role: "The sea, held. Guns for the shore, flak for the sky.",
    },
    lcraft: {
      name: "Landing Craft",
      short: "LC",
      cls: "sea",
      shape: "boat",
      wide: true,
      hp: 720,
      arm: 12,
      speed: 98,
      sight: 380,
      pop: 4,
      time: 28,
      cost: { steel: 420, fuel: 160 },
      from: "shipyard",
      carry: 4,
      unarmed: true,
      role: "Four tanks across the water, onto a beach nobody is watching.",
    },
  };
  for (const k in U) U[k].key = k;
  R.UDEF = U;
  R.UKEYS = Object.keys(U);

  // what each military building can produce, in menu order
  R.PRODUCES = {
    works: ["scout", "apc", "ltank", "mtank", "htank", "arty", "mflak", "truck", "supply"],
    airfield: ["rheli", "aheli", "fighter", "bomber", "theli"],
    shipyard: ["pboat", "gunboat", "destroyer", "lcraft"],
  };

  /* =======================================================================
     BUILDINGS
     size  footprint in tiles
     hp/arm
     cost/time
     max   how many this faction may own (Desert Order caps buildings)
     up    per-level: what another level buys (hp x, rate x, cost)
     ======================================================================= */

  const B = {
    hq: {
      name: "Command Centre",
      short: "HQ",
      cat: "core",
      size: 4,
      hp: 7000,
      arm: 26,
      cost: { concrete: 2500, steel: 1200, alu: 400 },
      time: 90,
      max: 1,
      hard: true,
      sight: 520,
      cap: 20,
      build: 0,
      desc: "The heart of it. Lose this and the company is finished.",
    },
    concrete: {
      name: "Concrete Plant",
      short: "CP",
      cat: "econ",
      size: 3,
      hp: 2300,
      arm: 12,
      cost: { concrete: 420, steel: 160 },
      time: 30,
      max: 14,
      makes: "concrete",
      rate: 62,
      desc: "Pours concrete and raises the concrete store.",
    },
    steelmill: {
      name: "Steelworks",
      short: "SW",
      cat: "econ",
      size: 3,
      hp: 2500,
      arm: 14,
      cost: { concrete: 640, steel: 210 },
      time: 42,
      max: 14,
      makes: "steel",
      rate: 34,
      desc: "Steel, and a bigger steel store.",
    },
    aluworks: {
      name: "Aluminium Works",
      short: "AW",
      cat: "econ",
      size: 3,
      hp: 2350,
      arm: 13,
      cost: { concrete: 820, steel: 430, alu: 80 },
      time: 52,
      max: 12,
      makes: "alu",
      rate: 21,
      desc: "Aircraft need aluminium. So do the heavier tanks.",
    },
    refinery: {
      name: "Oil Refinery",
      short: "OR",
      cat: "econ",
      size: 3,
      hp: 2250,
      arm: 12,
      cost: { concrete: 720, steel: 370 },
      time: 46,
      max: 12,
      makes: "fuel",
      rate: 17,
      onOil: 2.2,
      desc: "Fuel. Build it on a seep and it pays more than double.",
    },
    power: {
      name: "Power Station",
      short: "PW",
      cat: "econ",
      size: 3,
      hp: 2000,
      arm: 10,
      cost: { concrete: 520, steel: 320 },
      time: 36,
      max: 6,
      boost: 0.09,
      desc: "Every plant on the map runs a little faster.",
    },
    depot: {
      name: "Depot",
      short: "DP",
      cat: "econ",
      size: 3,
      hp: 1900,
      arm: 10,
      cost: { concrete: 560, steel: 190 },
      time: 32,
      max: 8,
      store: 0.18,
      desc: "More room to keep what you make.",
    },

    works: {
      name: "Vehicle Works",
      short: "VW",
      cat: "mil",
      size: 4,
      hp: 3100,
      arm: 18,
      cost: { concrete: 1150, steel: 620, alu: 90 },
      time: 58,
      max: 5,
      cap: 10,
      desc: "Builds everything with tracks.",
    },
    airfield: {
      name: "Airfield",
      short: "AF",
      cat: "mil",
      size: 4,
      hp: 2900,
      arm: 16,
      cost: { concrete: 1350, steel: 720, alu: 210 },
      time: 68,
      max: 4,
      cap: 8,
      desc: "Rotary and fixed wing. Needs aluminium and a lot of fuel.",
    },
    shipyard: {
      name: "Shipyard",
      short: "SY",
      cat: "mil",
      size: 3,
      hp: 2700,
      arm: 16,
      cost: { concrete: 1050, steel: 520 },
      time: 52,
      max: 3,
      cap: 6,
      water: true,
      desc: "Must sit on water. Builds everything that floats.",
    },
    repair: {
      name: "Repair Depot",
      short: "RD",
      cat: "mil",
      size: 3,
      hp: 2100,
      arm: 12,
      cost: { concrete: 640, steel: 380, alu: 60 },
      time: 40,
      max: 4,
      heal: 34,
      healR: 320,
      desc: "Mends anything parked next to it, for fuel.",
    },
    radar: {
      name: "Radar Station",
      short: "RS",
      cat: "mil",
      size: 2,
      hp: 1300,
      arm: 8,
      cost: { concrete: 480, steel: 340, alu: 140 },
      time: 34,
      max: 4,
      sight: 1000,
      desc: "Sees a long way. Sees aircraft coming, which is the point.",
    },

    wall: {
      name: "Wall",
      short: "WL",
      cat: "def",
      size: 1,
      hp: 950,
      arm: 22,
      cost: { concrete: 95 },
      time: 6,
      max: 400,
      wall: true,
      desc: "One tile of wall. Cheap, and it is what an attack breaks on.",
    },
    gate: {
      name: "Gate",
      short: "GT",
      cat: "def",
      size: 1,
      hp: 820,
      arm: 20,
      cost: { concrete: 150, steel: 60 },
      time: 8,
      max: 40,
      wall: true,
      gate: true,
      desc: "Your own units drive through. Everybody else has to break it.",
    },
    mgnest: {
      name: "Machine Gun Nest",
      short: "MG",
      cat: "def",
      size: 2,
      hp: 1500,
      arm: 20,
      cost: { concrete: 275, steel: 190 },
      time: 19,
      max: 60,
      w: "mg",
      turret: 1,
      desc: "Long burst, infantry only. Pairs with an anti-tank gun.",
    },
    atgun: {
      name: "Anti-Tank Gun",
      short: "AT",
      cat: "def",
      size: 2,
      hp: 1550,
      arm: 22,
      cost: { concrete: 330, steel: 330 },
      time: 25,
      max: 60,
      w: "at",
      turret: 1,
      desc: "The cheap answer to armour, bolted down.",
    },
    flaktower: {
      name: "Flak Tower",
      short: "FLAK",
      cat: "def",
      size: 2,
      hp: 1850,
      arm: 26,
      cost: { concrete: 395, steel: 430 },
      time: 29,
      max: 60,
      w: "flak",
      turret: 1,
      hard: true,
      desc: "Ground and air. A hard target: the more guns shoot it, the less each one does.",
    },
    howitzer: {
      name: "Howitzer Pit",
      short: "HOW",
      cat: "def",
      size: 2,
      hp: 1350,
      arm: 16,
      cost: { concrete: 520, steel: 500 },
      time: 35,
      max: 40,
      w: "howitzer",
      turret: 1,
      indirect: true,
      desc: "Outranges a mobile gun by a little, costs less than a tank.",
    },
    sam: {
      name: "Missile Battery",
      short: "SAM",
      cat: "def",
      size: 2,
      hp: 1500,
      arm: 18,
      cost: { concrete: 540, steel: 300, alu: 270 },
      time: 37,
      max: 40,
      w: "sam",
      turret: 1,
      desc: "Aircraft only, at a very long range. Useless against a tank.",
    },
  };
  for (const k in B) B[k].key = k;
  R.BDEF = B;
  R.BKEYS = Object.keys(B);

  // the build menu, in the order it is drawn
  R.BUILD_MENU = [
    {
      key: "econ",
      name: "Industry",
      keys: ["concrete", "steelmill", "aluworks", "refinery", "power", "depot"],
    },
    {
      key: "mil",
      name: "Military",
      keys: ["works", "airfield", "shipyard", "repair", "radar"],
    },
    {
      key: "def",
      name: "Defence",
      keys: ["wall", "gate", "mgnest", "atgun", "flaktower", "howitzer", "sam"],
    },
  ];

  /* Level scaling. Level 1 is what you build; 2, 3 and 4 are upgrades.
     hp and rate grow, cost grows a little faster, and the top level of a
     plant is what actually fills a store. */
  R.upCost = function (def, from) {
    const f = [1, 1.85, 3.1, 4.8][from - 1] || 1;
    const o = {};
    for (const k in def.cost) o[k] = Math.round(def.cost[k] * f * 0.85);
    o.alu = Math.round((o.alu || 0) + (def.cost.steel || 0) * 0.12 * from);
    return o;
  };
  R.upTime = function (def, from) {
    return Math.round(def.time * [1, 1.5, 2.1, 2.9][from - 1] * 0.9);
  };
  R.levelHp = function (def, lvl) {
    return Math.round(def.hp * [1, 1.7, 2.6, 3.8][lvl - 1]);
  };
  R.levelRate = function (def, lvl) {
    return (def.rate || 0) * [1, 2.3, 4.1, 6.4][lvl - 1];
  };
  R.MAXLEVEL = 4;
  R.MAXLEVEL_DEF = 3;

  /* =======================================================================
     THE HARD-TARGET RULE (Desert Order flak)
     n guns shooting one flak tower do n^0.48 times the damage one gun
     does — so a hundred hit three times as hard as ten, not ten times.
     Each shot is scaled by n^-0.52.
     ======================================================================= */
  R.hardScale = function (n) {
    if (n <= 1) return 1;
    return Math.pow(n, -0.52);
  };

  /* Armour: the gap between penetration and armour scales the hit. */
  R.armorMul = function (pen, arm) {
    return R.clamp(1 + (pen - arm) * 0.035, 0.18, 2.1);
  };

  /* =======================================================================
     NATION PERSONALITIES
     How an AI nation plays: what it builds, what it attacks with, and how
     quickly it comes for you.
     ======================================================================= */

  R.PERSONA = {
    rusher: {
      name: "Blitz",
      eco: 0.55,
      army: 1.35,
      air: 0.4,
      sea: 0.3,
      aggro: 1.0,
      first: 150,
      wave: 105,
      mix: [
        ["ltank", 4],
        ["scout", 3],
        ["mtank", 4],
        ["arty", 1],
      ],
    },
    boomer: {
      name: "Industry",
      eco: 1.5,
      army: 0.85,
      air: 0.7,
      sea: 0.5,
      aggro: 0.35,
      first: 420,
      wave: 175,
      mix: [
        ["mtank", 6],
        ["htank", 4],
        ["mflak", 3],
        ["arty", 3],
      ],
    },
    airpower: {
      name: "Air Force",
      eco: 0.95,
      army: 0.7,
      air: 1.8,
      sea: 0.4,
      aggro: 0.7,
      first: 300,
      wave: 140,
      mix: [
        ["aheli", 4],
        ["fighter", 3],
        ["bomber", 3],
        ["mflak", 2],
      ],
    },
    navy: {
      name: "Naval",
      eco: 1.0,
      army: 0.75,
      air: 0.5,
      sea: 2.0,
      aggro: 0.6,
      first: 340,
      wave: 155,
      mix: [
        ["gunboat", 4],
        ["destroyer", 3],
        ["lcraft", 2],
        ["mtank", 3],
        ["scout", 2],
      ],
    },
    turtler: {
      name: "Fortress",
      eco: 1.15,
      army: 0.7,
      air: 0.6,
      sea: 0.5,
      aggro: 0.25,
      first: 520,
      wave: 220,
      mix: [
        ["mtank", 5],
        ["htank", 4],
        ["arty", 4],
        ["mflak", 2],
      ],
      turret: 2.2,
    },
    spread: {
      name: "Expansionist",
      eco: 1.1,
      army: 1.0,
      air: 0.8,
      sea: 0.7,
      aggro: 0.55,
      first: 250,
      wave: 125,
      mix: [
        ["scout", 4],
        ["ltank", 4],
        ["mtank", 4],
        ["aheli", 2],
      ],
      expand: 2.0,
    },
  };

  // who plays what
  R.NATION_SETUP = {
    1: { persona: "rusher", name: "Iron Pact" },
    2: { persona: "boomer", name: "Azure League" },
    3: { persona: "spread", name: "Sand Union" },
    4: { persona: "airpower", name: "Crimson Front" },
    5: { persona: "navy", name: "Jade Accord" },
  };

  /* =======================================================================
     THE ROT
     Infested ground, somewhere on the map. It sends waves at whoever is
     nearest — including the other nations.
     ======================================================================= */

  R.HORDE = {
    startAfter: 210, // seconds before the first stirring
    waveEvery: 165, // and between waves after that
    growth: 0.14, // each wave is this much bigger
    mix: [
      { key: "zwalker", w: 10, min: 0 },
      { key: "zrunner", w: 5, min: 1 },
      { key: "zspitter", w: 3, min: 2 },
      { key: "zbrute", w: 3, min: 3 },
      { key: "zhulk", w: 1.2, min: 6 },
    ],
    nests: 3, // infested sites at the start
  };
})();
