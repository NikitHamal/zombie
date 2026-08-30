/* SCENARIO PACK: The Hollow
 *
 * A zombie survival village. There is no player character: there are
 * villagers, and you tell them what to do. By day they chop, quarry, sow,
 * reap, build and repair. At night the dead come out of the treeline and
 * try to pull the village down. Rebuild the ruin, grow it, arm it, and
 * keep the hall standing — when the hall falls, the village falls.
 *
 * It runs on the same core as the outbreak (the sketch primitives, the
 * nav grid, the agent pipeline, the camera, the sound cues), implements
 * the same scenario contract, and reuses the frozen agent artwork
 * (js/village/figures.js) — the guards wear the same caps and carry the
 * same rifles as the town's defense corps. New files:
 * village.html · js/village/figures.js · js/village/structs.js ·
 * js/village/ui.js · this one. Design: VILLAGE-DESIGN.md.
 *
 * Contract (see js/scenarios/zombie.js for the canonical list):
 *   terrain · attachStains · init · counts · left · hostile · walkBlocked
 *   maxSpeed · frame · update · maintain · hud · camInterest · tap · draw
 *   drawFX — plus the village's own hooks: drawGround, drawBuildingDecor,
 *   drawOver, pointerMove, and the timeScale the clock runs at.
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const SAVE_KEY = "zs.hollow.v1";

  /* ---------- tunables: every number in the game lives here ---------- */
  const BAL = {
    DAY_LEN: 120, // seconds of daylight (06:00 → 19:00)
    DUSK: 9, // the warning: the horn, the sky, everyone home
    NIGHT_LEN: 70, // 19:00 → 06:00
    DAWN: 3,
    START: { wood: 45, stone: 25, food: 70, scrap: 14 },
    POP0: 4,
    STORE0: 260, // the hall's own corner, per good, before any storehouse
    HOMES0: 2,
    CARRY: 12, // a villager's load
    SPEED: { walk: 82, haul: 74, guard: 92, panic: 138 },
    WORK: { tree: 3.4, rock: 4.2, bush: 2.6, wreck: 3.6, plant: 2.6, tend: 2.2, reap: 3.2 },
    YIELD: { tree: 8, rock: 6, bush: 5, wreck: 4 },
    NODE: { tree: 24, rock: 30, bush: 12, wreck: 18 },
    BUSH_REGROW: 55, // seconds before a picked bush bears again
    TREE_REGROW: 70, // a sapling in the wood, so timber never runs out
    GROW: 46, // seconds a plot needs to ripen, before modifiers
    FARM_YIELD: 10,
    VILL_HP: 55,
    GUARD_HP: 78,
    FIST_DMG: 7,
    FIST_RATE: 0.95,
    SUN_DPS: 2.2, // daylight finishes the dead that linger after a night
    UPKEEP: 3, // food per villager, charged at dawn
    STARVE_DPS: 0.5,
    REGEN: 1.6, // hp/s while resting at the infirmary
    HEAL_RATE: 3.4,
    REPAIR_RATE: 9, // hp/s a repairer puts back
    REPAIR_COST: { w: 0.16, s: 0.05 }, // per second
    BUILDERS: 3, // how many can work one site at once
    RECRUIT: { food: 25, wood: 12 },
    WANDER_CHANCE: 0.35,
    PERC: 300, // a zombie's sight
    GUARD_SIGHT: 280,
    VILL_FIGHT: 34, // a cornered villager swings back from this far
    FLEE: 130, // a villager bolts when the dead are this close
    SHELTER_R: 90, // how close to the hall the village huddles
    INFECT_TIME: 45, // seconds a bite takes to turn someone
    INFECT_CHANCE: 0.35,
    RISE_CHANCE: 0.4, // the dead get up again...
    ZED: {
      walker: { hp: 24, dmg: 5, spd: 76, cd: 1.15, reach: 20, scrap: 1 },
      runner: { hp: 18, dmg: 4, spd: 146, cd: 0.85, reach: 18, scrap: 2 },
      brute: { hp: 110, dmg: 16, spd: 52, cd: 1.6, reach: 26, scrap: 5 },
    },
    ZED_HP_DAY: 2.5,
    NIGHT_N: (day) => Math.min(70, 1 + day * 1.05 + Math.floor(Math.pow(day, 1.2) * 0.2)),
    RUNNER_DAY: 5,
    BRUTE_DAY: 9,
    SURGE: [0.42, 0.74], // the two late-night pushes, as a fraction of the night
  };

  // guard weapons, by research tier (the armed look is the frozen one)
  const WEAPONS = {
    club: { name: "clubs", dmg: 10, range: 26, rate: 1, melee: true, tool: "club" },
    spear: { name: "spears", dmg: 16, range: 38, rate: 1.05, melee: true, tool: "spear" },
    bow: { name: "bows", dmg: 13, range: 215, rate: 1.1, tool: "bow" },
    rifle: { name: "rifles", dmg: 17, range: 300, rate: 0.95, gun: "rifle" },
    shotgun: { name: "shotguns", dmg: 30, range: 170, rate: 1.35, gun: "shotgun", pellets: 3 },
    smg: { name: "SMGs", dmg: 11, range: 250, rate: 0.28, gun: "smg" },
  };
  const WEP_ORDER = ["club", "spear", "bow", "rifle", "shotgun", "smg"];

  // the workshop's tree: id -> { name, cost, time, desc, req }
  const RESEARCH = {
    tools1: { name: "sharp tools", cost: { w: 30, c: 4 }, time: 30, desc: "+30% work speed" },
    spears: {
      name: "spears",
      cost: { w: 20, s: 10, c: 2 },
      time: 30,
      desc: "guards fight with spears",
    },
    stonewall: {
      name: "stone walls",
      cost: { s: 60, c: 6 },
      time: 40,
      desc: "palisades can go up in stone",
    },
    bows: {
      name: "bows",
      cost: { w: 40, c: 6 },
      time: 40,
      desc: "guards shoot from a distance",
      req: ["spears"],
    },
    farm1: { name: "crop rotation", cost: { w: 20, c: 8 }, time: 40, desc: "+30% farm yield" },
    tools2: {
      name: "saw and sledge",
      cost: { w: 50, s: 20, c: 12 },
      time: 55,
      desc: "+30% work speed again",
      req: ["tools1"],
    },
    armor1: {
      name: "boiled leather",
      cost: { s: 30, c: 10 },
      time: 45,
      desc: "+40% health",
      req: ["spears"],
    },
    rifles: {
      name: "rifles",
      cost: { s: 40, c: 26 },
      time: 60,
      desc: "guards carry rifles",
      req: ["bows"],
    },
    farm2: {
      name: "irrigation",
      cost: { w: 60, s: 40, c: 14 },
      time: 55,
      desc: "+30% farm yield, plots hold water",
      req: ["farm1"],
    },
    armor2: {
      name: "plate and mail",
      cost: { s: 80, c: 30 },
      time: 70,
      desc: "+40% health again",
      req: ["armor1", "rifles"],
    },
    towers2: {
      name: "signal towers",
      cost: { w: 80, s: 60, c: 20 },
      time: 65,
      desc: "+40% guard range and sight",
      req: ["bows"],
    },
    medicine: {
      name: "medicine",
      cost: { w: 40, c: 18 },
      time: 50,
      desc: "the infirmary cures the bitten",
      req: ["farm1"],
    },
    shotguns: {
      name: "shotguns",
      cost: { s: 60, c: 44 },
      time: 75,
      desc: "guards carry shotguns",
      req: ["rifles"],
    },
    reinforce: {
      name: "reinforce the hall",
      cost: { w: 120, s: 120, c: 40 },
      time: 80,
      desc: "the hall's health doubles",
      req: ["stonewall", "armor1"],
    },
    smgs: {
      name: "submachine guns",
      cost: { s: 90, c: 70 },
      time: 90,
      desc: "guards carry SMGs",
      req: ["shotguns"],
    },
  };

  const WEATHER = [
    {
      id: "clear",
      name: "clear",
      desc: "a fair day — nothing in the way",
      work: 1,
      farm: 1,
      sight: 1,
    },
    {
      id: "still",
      name: "dead calm",
      desc: "an uneasy quiet · +10% work",
      work: 1.1,
      farm: 1,
      sight: 1.05,
    },
    {
      id: "fog",
      name: "fog",
      desc: "the dead lose the scent — and so do your lookouts",
      work: 1,
      farm: 1,
      sight: 0.7,
    },
    {
      id: "rain",
      name: "rain",
      desc: "the plots drink · −10% work",
      work: 0.9,
      farm: 1.35,
      sight: 0.9,
      wet: 1,
    },
    {
      id: "storm",
      name: "storm",
      desc: "nobody works well in this",
      work: 0.75,
      farm: 1.2,
      sight: 0.6,
      wet: 1,
    },
    {
      id: "cold",
      name: "cold snap",
      desc: "the village eats more to keep warm",
      work: 0.95,
      farm: 0.6,
      upkeep: 1.35,
      sight: 0.95,
    },
  ];
  const SEASONS = [
    { id: "spring", name: "spring", desc: "the ground wakes up", farm: 1.15, upkeep: 1 },
    { id: "summer", name: "summer", desc: "long days, quick harvests", farm: 1.25, upkeep: 1 },
    { id: "autumn", name: "autumn", desc: "the last of the bounty", farm: 0.9, upkeep: 1 },
    {
      id: "winter",
      name: "winter",
      desc: "nothing grows · the nights are longer",
      farm: 0.15,
      upkeep: 1.4,
      night: 1.25,
    },
  ];

  const NAMES = [
    "mara",
    "tomas",
    "ilse",
    "brandt",
    "kessa",
    "orin",
    "willa",
    "jory",
    "pellen",
    "asa",
    "gunnel",
    "hobb",
    "sura",
    "merek",
    "nella",
    "otis",
    "briar",
    "cass",
    "dara",
    "elki",
    "ferro",
    "gale",
    "halla",
    "ivo",
    "josa",
    "kel",
    "lyra",
    "moss",
    "nix",
    "olla",
    "perrin",
    "quill",
    "runa",
    "sable",
    "tarn",
    "ulla",
    "vesper",
    "wren",
    "ylva",
    "zeb",
  ];

  const TASK = {
    idle: "looking for work",
    seek: "on the way",
    work: "working",
    haul: "carrying it home",
    rest: "resting",
    fight: "fighting",
    flee: "running",
    patrol: "on watch",
  };

  /* ---------- helpers ---------- */

  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  const rectDist = (b, px, py) => {
    const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
    const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
    return Math.hypot(dx, dy);
  };
  // a standing spot just outside a structure's footprint, on our side
  function outside(s, x, y, pad) {
    const cx = s.x + s.w / 2,
      cy = s.y + s.h / 2;
    let dx = x - cx,
      dy = y - cy;
    const m = Math.hypot(dx, dy) || 1;
    dx /= m;
    dy /= m;
    const r = Math.max(s.w, s.h) / 2 + (pad === undefined ? 20 : pad);
    return { x: cx + dx * r, y: cy + dy * r };
  }

  class ScenarioVillage {
    constructor() {
      this.world = null;
      this.nav = null;
      this.agents = null;
      this.fx = null; // main.js hands over the core's effect array
      this.stains = null;
      this.uid = 1;

      this.day = 1;
      this.phase = "day"; // day → dusk → night → dawn
      this.phaseT = 0;
      this.nightT = 0;
      this.res = Object.assign({}, BAL.START);
      this.done = {}; // research
      this.research = null; // { id, def, p }
      this.speed = 1;
      this.muted = false;
      this.hungry = 0;
      this.over = null; // { title, lines }
      this.card = null; // the dawn report (canvas-drawn)
      this.nightLog = null;
      this.hall = null;

      this.nodes = []; // rocks, bushes, wrecks
      this.pops = []; // floating +N / damage ticks
      this.queue = []; // tonight's spawn schedule
      this.regrow = []; // saplings waiting to come back
      this.sel = null; // { k: "v"|"s", o }
      this.mode = null; // "build" | "research"
      this.armed = null; // the kind waiting to be placed
      this.hover = null; // world point under the cursor
      this.t = 0;
      this.saveT = 0;
      this.moanT = 0;
      this.warned = {};
      this.starveT = 0;
      this.loaded = this._load();
    }

    get paused() {
      return !this.speed || !!this.card || !!this.over;
    }
    get timeScale() {
      return this.paused ? 0 : this.speed;
    }

    /* ================= the map ================= */

    // A broken village in a clearing: a river on the west, the wood to the
    // north (where they come from), a pond to the north-east, and the ruin
    // itself — a hall, two huts, a choked plot, a dry well, a broken
    // palisade — with rock, bramble and wreckage scattered around it.
    terrain(world, nav) {
      this.world = world;
      this.nav = nav;
      const W = world.w,
        H = world.h;
      world.water({ riverBaseX: 170, lake: { x: W * 0.8, y: H * 0.3, r: 165 } });
      nav.markWater();
      world.forest = { x: W * 0.5, y: 300, r: 400 };
      world.placeAllTrees({
        grovePos: [
          { x: W * 0.2, y: H * 0.78 },
          { x: W * 0.82, y: H * 0.8 },
          { x: W * 0.66, y: H * 0.42 },
        ],
      });
      for (const tr of world.trees) tr.amt = BAL.NODE.tree;
      world.buildings = [];

      const rng = ZS.rng32(world.seed ^ 0x5011);
      this.center = { x: W * 0.48, y: H * 0.66 };
      const cx = this.center.x,
        cy = this.center.y;

      // the ruin
      const hall = ZS.Structs.ruin("hall", cx, cy, rng() * 997);
      world.buildings.push(hall);
      nav.markRect(hall.x, hall.y, hall.w, hall.h, 0);
      this.hall = hall;
      const ring = [
        ["hut", -230, -70],
        ["hut", 205, 40],
        ["hut", -120, 150],
        ["farm", 235, -150],
        ["well", -80, -175],
        ["beacon", 120, 165],
        ["wall", -300, -230],
        ["wall", -150, -270],
        ["wall", 30, -280],
        ["wall", 210, -265],
      ];
      for (const [kind, dx, dy] of ring) {
        const s = ZS.Structs.ruin(kind, cx + dx, cy + dy, rng() * 997);
        if (!ZS.Structs.footprintClear(world, nav, s.x, s.y, s.w, s.h)) continue;
        world.buildings.push(s);
        nav.markRect(s.x, s.y, s.w, s.h, 0);
      }
      if (this.loaded) this._applySavedMap(world, nav);

      // rock, bramble, wreckage
      const scatter = (n, kind, r0, r1, amt) => {
        let placed = 0;
        for (let i = 0; i < n * 30 && placed < n; i++) {
          const an = rng() * Math.PI * 2;
          const r = r0 + rng() * (r1 - r0);
          const x = cx + Math.cos(an) * r,
            y = cy + Math.sin(an) * r * 0.8;
          if (x < 80 || y < 80 || x > W - 80 || y > H - 80) continue;
          if (nav.cellAt(x, y) !== 1) continue;
          if (nav.cellAt(x + 14, y) !== 1 || nav.cellAt(x - 14, y) !== 1) continue;
          let clash = false;
          for (const b of world.buildings)
            if (
              Math.abs(b.x + b.w / 2 - x) < b.w / 2 + 26 &&
              Math.abs(b.y + b.h / 2 - y) < b.h / 2 + 26
            )
              clash = true;
          for (const o of this.nodes) if (Math.hypot(o.x - x, o.y - y) < 60) clash = true;
          if (clash) continue;
          this.nodes.push({
            kind,
            x,
            y,
            amt,
            max: amt,
            seed: rng() * 997,
            r: kind === "rock" ? 15 : 13,
          });
          placed++;
        }
      };
      scatter(9, "rock", 320, 900, BAL.NODE.rock);
      scatter(6, "rock", 180, 340, BAL.NODE.rock);
      scatter(11, "bush", 150, 620, BAL.NODE.bush);
      scatter(6, "wreck", 200, 780, BAL.NODE.wreck);
      nav.version++;
      this.trees0 = world.trees.length;
    }

    /* ================= persistent marks ================= */

    attachStains(st) {
      this.stains = st;
      st.register("blood", (sc, x, y, seed) => {
        st.fillBlob(x, y, 4 + ZS.hash(seed) * 3, seed, "rgba(122,42,36,0.42)");
        const n = 4 + Math.floor(ZS.hash(seed + 1) * 4);
        for (let i = 0; i < n; i++) {
          const ang = ZS.hash(seed + 10 + i) * Math.PI * 2;
          const d = ZS.hash(seed + 20 + i) * 13;
          st.fillBlob(
            x + Math.cos(ang) * d,
            y + Math.sin(ang) * d,
            0.7 + ZS.hash(seed + 30 + i),
            seed + i,
            "rgba(92,30,26,0.4)",
          );
        }
      });
      st.register("chip", (sc, x, y, seed) => {
        // wood chips where a tree came down
        for (let i = 0; i < 5; i++) {
          const ang = ZS.hash(seed + i) * Math.PI * 2;
          const d = 4 + ZS.hash(seed + i * 3) * 14;
          st.fillBlob(
            x + Math.cos(ang) * d,
            y + Math.sin(ang) * d,
            1.4,
            seed + i * 7,
            "rgba(126,96,54,0.35)",
          );
        }
      });
      st.register("rubble", (sc, x, y, seed) => {
        st.fillBlob(x, y, 16 + ZS.hash(seed) * 10, seed, "rgba(96,88,76,0.20)");
        for (let i = 0; i < 9; i++) {
          const ang = ZS.hash(seed + i * 5) * Math.PI * 2;
          const d = ZS.hash(seed + i * 3) * 22;
          st.fillBlob(
            x + Math.cos(ang) * d,
            y + Math.sin(ang) * d,
            1.6 + ZS.hash(seed + i) * 2.4,
            seed + i,
            "rgba(86,80,70,0.32)",
          );
        }
      });
      st.register("corpse", (sc, a) => {
        // a small dark scribble where somebody fell
        sc.strokeStyle = "rgba(70,50,40,0.5)";
        sc.lineWidth = 1.6;
        ZS.wline(sc, a.x - 7, a.y + 2, a.x + 7, a.y - 1, a.seed + 1, 1.4);
        ZS.wline(sc, a.x - 3, a.y + 5, a.x + 4, a.y + 6, a.seed + 2, 1);
        if (a.st === 2) return;
        st.fillBlob(a.x, a.y, 7, a.seed + 9, "rgba(122,42,36,0.22)");
      });
    }

    /* ================= the contract ================= */

    tickEmpty() {
      return true; // the clock runs even with nobody left
    }

    init(agents) {
      this.agents = agents;
      const s = this.loaded;
      const n = s && s.pop ? s.pop.length : BAL.POP0;
      const cx = this.hall.x + this.hall.w / 2,
        cy = this.hall.y + this.hall.h / 2;
      if (s && s.pop) {
        for (const p of s.pop) {
          const a = this.makeAgent(p.x, p.y, 0);
          a.name = p.n;
          a.job = p.j;
          a.hp = p.hp;
          a.inf = p.i || 0;
          agents.push(a);
        }
      } else {
        for (let i = 0; i < n; i++) {
          const an = (i / n) * Math.PI * 2 + 0.6;
          const a = this.makeAgent(cx + Math.cos(an) * 90, cy + Math.sin(an) * 60, 0);
          a.name = NAMES[(Math.random() * NAMES.length) | 0];
          agents.push(a);
        }
        agents[0].job = "guard"; // somebody has to hold a stick
      }
      if (s) {
        this.day = s.day || 1;
        this.res = Object.assign({}, BAL.START, s.res);
        this.done = s.done || {};
        if (s.hallHp) this.hall.hp = Math.min(this.hall.maxHp, s.hallHp);
      }
      this.loaded = null;
      for (const a of agents) this._dress(a);
      this._recalc();
    }

    counts() {
      return { n: this.villagers().length };
    }

    left() {
      return 1; // the village stands or falls on its own terms (see _endNight)
    }

    hostile(a) {
      return a.st === 2;
    }

    walkBlocked(a) {
      return a.st === 2;
    }

    maxSpeed(a) {
      if (a.st === 2) return a.spd;
      if (a.panic > 0) return BAL.SPEED.panic;
      if (a.job === "guard") return BAL.SPEED.guard;
      if (a.carry && a.carry.n) return BAL.SPEED.haul;
      return BAL.SPEED.walk;
    }

    makeAgent(x, y, st, extra) {
      const a = {
        x,
        y,
        a: ZS.rnd(0, 6.28),
        vx: 0,
        vy: 0,
        st,
        seed: Math.random() * 997,
        gait: ZS.rnd(0, 6.28),
        flash: 0,
        ph: ZS.rnd(0, 6.28),
        path: null,
        pi: 0,
        gx: null,
        gy: null,
        navV0: 0,
        planFailT: 0,
        stuckT: 0,
        wx: null,
        wt: 0,
        bld: -1,
        px: 0,
        py: 0,
        wantMove: false,
        say: null,
        sayT: 0,
        sayMax: 0,
        id: 0,
        uid: this.uid++,
        scale: 1,
        inf: 0,
        muzzle: 0,
        atkT: 0,
        workT: 0,
        swing: 0,
        panic: 0,
        carry: null,
        mode: "idle",
        task: TASK.idle,
        tgt: null,
        job: "labourer",
        tool: null,
        gun: false,
        wep: null,
        sel: false,
        hp: BAL.VILL_HP,
        maxHp: BAL.VILL_HP,
      };
      if (extra) Object.assign(a, extra);
      return a;
    }

    /* ================= the clock ================= */

    // 06:00 → 19:00 across the day, 19:00 → 06:00 across the night
    clockMins() {
      const dayFrac =
        this.phase === "day" ? this.phaseT / BAL.DAY_LEN : this.phase === "dusk" ? 1 : 0;
      if (this.phase === "day") return 6 * 60 + dayFrac * 13 * 60;
      if (this.phase === "dusk") return 19 * 60;
      const f = ZS.clamp(this.nightT / this._nightLen(), 0, 1);
      return (19 + f * 11) * 60;
    }

    clockText() {
      const m = Math.floor(this.clockMins()) % 1440;
      const hh = Math.floor(m / 60),
        mm = Math.floor(m % 60);
      return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
    }

    _nightLen() {
      return BAL.NIGHT_LEN * (this.season.night || 1);
    }

    get season() {
      return SEASONS[Math.floor((this.day - 1) / 8) % 4];
    }

    get weather() {
      if (this.day < 3) return WEATHER[0];
      return WEATHER[(this.day * 7 + (this.world.seed | 0)) % WEATHER.length];
    }

    maintain(agents, dt) {
      this.t += dt;
      this.phaseT += dt;
      this._shT = Math.max(0, (this._shT || 0) - dt);
      this._sdT = Math.max(0, (this._sdT || 0) - dt);
      this._tickResearch(dt);
      if (this.phase === "day") {
        if (this.phaseT >= BAL.DAY_LEN) this._startNight(false);
      } else if (this.phase === "dusk") {
        if (this.phaseT >= BAL.DUSK) {
          this.phase = "night";
          this.phaseT = 0;
          this.nightT = 0;
        }
      } else if (this.phase === "night") {
        this.nightT += dt;
        while (this.queue.length && this.queue[0].t <= this.nightT)
          this._spawnZed(this.queue.shift());
        if (this.nightT >= this._nightLen() || (!this.queue.length && !this._zeds(agents).length))
          this._endNight(agents);
      } else if (this.phase === "dawn") {
        if (this.phaseT >= BAL.DAWN) this._newDay(agents);
      }
      // the plots ripen, the brambles come back, the wounded mend
      this._tickWorld(agents, dt);
      this.saveT += dt;
      if (this.saveT > 10) {
        this.saveT = 0;
        this.save(agents);
      }
    }

    frame(agents, dt, _t, _grid, _nav) {
      for (const a of agents) {
        if (a.muzzle > 0) a.muzzle = Math.max(0, a.muzzle - dt);
        if (a.panic > 0) a.panic = Math.max(0, a.panic - dt);
        if (
          a.st === 0 &&
          a.hp < a.maxHp &&
          this.phase === "day" &&
          this.res.food > 0 &&
          a.mode !== "rest"
        )
          a.hp = Math.min(a.maxHp, a.hp + 1.2 * dt);
      }
      // the light finishes whatever the night left behind
      if (this.phase === "day") {
        for (const a of agents) {
          if (a.st !== 2 || a.dead || a.gone) continue;
          a.hp -= BAL.SUN_DPS * dt;
          if (a.hp <= 0) {
            a.dead = true;
            a.gone = true;
            if (this.stains) this.stains.corpse(a);
          }
        }
      }
      // an empty larder costs flesh, and the weak feel it first
      if (this.res.food <= 0.5 && this.villagers().length) {
        for (const a of agents) if (a.st === 0 && !a.dead) a.hp -= BAL.STARVE_DPS * dt;
        this.starveT += dt;
        if (this.starveT > 20) {
          this.starveT = 0;
          if (ZS.VillageUI) ZS.VillageUI.toast("the village is starving — find food");
        }
      } else this.starveT = 0;
      for (let i = this.pops.length - 1; i >= 0; i--) {
        const p = this.pops[i];
        p.t -= dt;
        p.y -= dt * 14;
        if (p.t <= 0) this.pops.splice(i, 1);
      }
      // the moan, rate-limited across the whole horde
      this.moanT -= dt;
      if (this.moanT <= 0 && this.phase === "night") {
        let z = null;
        for (const a of agents) if (a.st === 2 && !a.dead) z = a;
        if (z) {
          this.moanT = 1.6 + Math.random() * 2.4;
          if (ZS.sound) ZS.sound.event("moan", z.x, z.y);
        }
      }
      for (const b of this.world.buildings) if (b.want && !b.mat && b.hp < b.maxHp) this._topUp(b);
      if (ZS.Figures) ZS.Figures.opt.zoom = ZS.debug && ZS.debug.cam ? ZS.debug.cam.zoom : 1;
      if (ZS.VillageUI) {
        ZS.VillageUI.tick(dt);
        ZS.VillageUI.refresh();
      }
    }

    // plots, brambles, saplings, the bitten, the beacon
    _tickWorld(agents, dt) {
      const wf = this.weather.farm * this.season.farm;
      const well = this.has("well");
      for (const b of this.world.buildings) {
        if (b.kind === "farm" && b.plot && b.built && !b.ruined) {
          const p = b.plot;
          if (p.wet > 0) p.wet = Math.max(0, p.wet - dt);
          if (p.stage === 1 || p.stage === 2) {
            let rate = (1 / BAL.GROW) * wf;
            if (p.wet > 0) rate *= 1.25;
            if (well && ZS.Structs.dist(b, well.x + well.w / 2, well.y + well.h / 2) < 320)
              rate *= 1.3;
            else if (this.has("farm2")) rate *= 1.1;
            p.growth += rate * dt;
            if (p.growth > 0.34 && p.stage === 1) p.stage = 2;
            if (p.growth >= 1) {
              p.growth = 1;
              p.stage = 3;
            }
          }
        }
      }
      for (const n of this.nodes) {
        if (n.kind === "bush" && n.amt < n.max) {
          n.cool = (n.cool || 0) - dt;
          if (n.cool <= 0) n.amt = n.max;
        }
      }
      for (let i = this.regrow.length - 1; i >= 0; i--) {
        this.regrow[i].t -= dt;
        if (this.regrow[i].t > 0) continue;
        const g = this.regrow.splice(i, 1)[0];
        if (this.nav.cellAt(g.x, g.y) !== 1) continue;
        const r = 11 + Math.random() * 8;
        const pts = [];
        for (let k = 0; k < 8; k++) pts.push(r * (0.82 + Math.random() * 0.36));
        const tr = { x: g.x, y: g.y, r, seed: Math.random() * 997, pts, amt: BAL.NODE.tree };
        this.world.trees.push(tr);
        this.fx.push({ x: g.x, y: g.y, t: 0.6, sprout: 1, seed: tr.seed });
      }
      // the bitten turn
      for (const a of agents) {
        if (a.st !== 0 || a.inf <= 0) continue;
        a.inf -= dt;
        if (a.inf <= 0) this._turn(a);
      }
    }

    /* ================= the night ================= */

    _startNight(called) {
      if (this.phase !== "day" && this.phase !== "dusk") return;
      this.phase = "dusk";
      this.phaseT = 0;
      this.nightT = 0;
      const n = Math.round(BAL.NIGHT_N(this.day) * (this.season.night || 1) * (called ? 0.85 : 1));
      // the schedule: most of them trickle in, two pushes late on
      const len = this._nightLen();
      this.queue = [];
      for (let i = 0; i < n; i++) {
        let t;
        const roll = Math.random();
        if (roll < 0.22) t = len * (BAL.SURGE[0] + Math.random() * 0.06);
        else if (roll < 0.36) t = len * (BAL.SURGE[1] + Math.random() * 0.08);
        else t = Math.random() * len * 0.8;
        this.queue.push({ t });
      }
      this.queue.sort((a, b) => a.t - b.t);
      this.nightLog = { n: 0, killed: 0, lost: [], built: 0, dmg: 0, called: !!called };
      if (ZS.sound) ZS.sound.event("horn", this.hall.x, this.hall.y);
      if (ZS.VillageUI) ZS.VillageUI.toast("night " + this.day + " is coming — get inside");
      for (const a of this.villagers()) this._breakOff(a, true);
    }

    // called early: the player rang the bell
    callNight() {
      if (this.phase !== "day") return;
      this._startNight(true);
      if (ZS.VillageUI) ZS.VillageUI.toast("the bell — you called the dark down early");
    }

    _spawnZed() {
      const p = this._spawnPoint();
      if (!p) return;
      const day = this.day;
      let type = "walker";
      if (day >= BAL.BRUTE_DAY && Math.random() < 0.16 + day * 0.006) type = "brute";
      else if (day >= BAL.RUNNER_DAY && Math.random() < 0.24 + day * 0.01) type = "runner";
      const z = BAL.ZED[type];
      const hp = z.hp + day * BAL.ZED_HP_DAY * (type === "brute" ? 3 : 1);
      const a = this.makeAgent(p.x, p.y, 2, {
        zType: type,
        hp,
        maxHp: hp,
        spd: z.spd * (1 + day * 0.006),
        dmg: z.dmg,
        atkT: ZS.rnd(0, 0.8),
        scale: type === "brute" ? 1.65 : type === "runner" ? 0.92 : 1,
        name: null,
      });
      this.agents.push(a);
      if (this.nightLog) this.nightLog.n++;
    }

    // out of the wood: an arc to the north and east of the village
    _spawnPoint() {
      const w = this.world,
        nav = this.nav;
      const cx = this.hall.x + this.hall.w / 2,
        cy = this.hall.y + this.hall.h / 2;
      for (let i = 0; i < 80; i++) {
        const an = -1.9 + Math.random() * 2.3; // north round to south-east
        const r = 540 + Math.random() * 240;
        const x = ZS.clamp(cx + Math.cos(an) * r, 60, w.w - 60);
        const y = ZS.clamp(cy + Math.sin(an) * r, 60, w.h - 60);
        if (dist2(x, y, cx, cy) < 500 * 500) continue;
        const p = nav.nearestWalkable(x, y, 140, true);
        if (p && dist2(p.x, p.y, cx, cy) > 460 * 460) return p;
      }
      return nav.randLand();
    }

    _endNight(agents) {
      // whatever is still standing out there slinks back into the wood
      for (const a of agents) if (a.st === 2 && !a.dead) a.flee = 1;
      this.phase = "dawn";
      this.phaseT = 0;
      const log = this.nightLog || { n: 0, killed: 0, lost: [], built: 0, dmg: 0 };
      const lines = [];
      lines.push("the dead came: " + log.n + " · put down: " + log.killed);
      const lost = log.lost.length;
      lines.push(lost ? "lost: " + log.lost.join(", ") : "nobody lost — the village held");
      const up = Math.round(this._upkeep());
      lines.push(
        "the village eats " + up + " food · " + Math.floor(this.res.food) + " in the larder",
      );
      if (this.res.food < up) lines.push("that is not enough — someone will go hungry");
      lines.push(this._tomorrowLine());
      this.card = { title: "dawn · day " + (this.day + 1), lines, lost: lost > 0 };
    }

    _newDay(agents) {
      // the dead that were still out there are gone with the light
      for (const a of agents) if (a.st === 2) a.gone = true;
      this.card = null;
      this.day++;
      this.phase = "day";
      this.phaseT = 0;
      const up = this._upkeep();
      if (this.res.food >= up) {
        this.res.food -= up;
        this.hungry = 0;
      } else {
        const short = up - this.res.food;
        this.res.food = 0;
        this.hungry = short;
        if (ZS.VillageUI) ZS.VillageUI.toast("the larder is empty — the village is hungry");
      }
      // a wanderer, if there is a bed and a bite to eat
      const free = this.popCap() - this.villagers().length;
      if (free > 0 && this.res.food > 40 && Math.random() < BAL.WANDER_CHANCE) {
        const a = this._joinVillager();
        if (ZS.VillageUI) ZS.VillageUI.toast(a.name + " came out of the wood");
      }
      this._event();
      for (const a of this.villagers()) {
        a.panic = 0;
        this._breakOff(a, false);
      }
      this._recalc();
      if (ZS.VillageUI)
        ZS.VillageUI.toast("day " + this.day + " · " + this.season.name + ", " + this.weather.name);
    }

    _upkeep() {
      return (
        this.villagers().length *
        BAL.UPKEEP *
        (this.season.upkeep || 1) *
        (this.weather.upkeep || 1)
      );
    }

    _tomorrowLine() {
      const w = WEATHER[((this.day + 1) * 7 + (this.world.seed | 0)) % WEATHER.length];
      const nx = Math.round(BAL.NIGHT_N(this.day + 1));
      let s =
        "tomorrow: " + (this.day + 1 < 3 ? "clear" : w.name) + " · " + nx + " expected after dark";
      if (this.day + 1 === BAL.RUNNER_DAY) s += " · something faster is out there";
      if (this.day + 1 === BAL.BRUTE_DAY) s += " · and something heavier";
      return s;
    }

    // small things that happen at dawn, from day three on
    _event() {
      if (this.day < 3 || Math.random() > 0.28) return;
      const rolls = [
        () => {
          this.res.scrap += 18;
          this.res.wood += 25;
          return "a cache in the wreckage: +18 scrap, +25 wood";
        },
        () => {
          this.res.food += 22;
          return "a good morning's foraging: +22 food";
        },
        () => {
          const v = this.villagers();
          if (!v.length) return null;
          const a = v[(Math.random() * v.length) | 0];
          a.hp = Math.max(4, a.hp * 0.5);
          return a.name + " woke up feverish";
        },
        () => {
          const walls = this.world.buildings.filter((b) => b.kind === "wall" && b.built);
          if (!walls.length) return null;
          const b = walls[(Math.random() * walls.length) | 0];
          b.hp = Math.max(6, b.hp - b.maxHp * 0.4);
          return "part of the palisade came down in the night";
        },
        () => {
          const rocks = this.nodes.filter((n) => n.kind === "rock");
          if (!rocks.length) return null;
          for (const n of rocks) n.amt = n.max;
          return "a fresh fall of rock — the quarry is full again";
        },
      ];
      const r = rolls[(Math.random() * rolls.length) | 0]();
      if (r && ZS.VillageUI) ZS.VillageUI.toast(r);
    }

    /* ================= save / load ================= */

    save(_agents) {
      if (!this.hall) return;
      try {
        const pop = this.villagers().map((a) => ({
          x: Math.round(a.x),
          y: Math.round(a.y),
          n: a.name,
          j: a.job,
          hp: Math.round(a.hp),
          i: Math.round(a.inf),
        }));
        const bs = this.world.buildings.map((b) => [
          b.kind,
          Math.round(b.x),
          Math.round(b.y),
          b.lvl,
          Math.round(b.hp),
          b.built ? 1 : 0,
          b.ruined ? 1 : 0,
          b.prog === undefined ? 1 : Math.round(b.prog * 100) / 100,
        ]);
        localStorage.setItem(
          SAVE_KEY,
          JSON.stringify({
            v: 1,
            day: this.day,
            seed: this.world.seed,
            res: this.res,
            done: this.done,
            pop,
            bs,
            nodes: this.nodes.map((n) => [
              n.kind,
              Math.round(n.x),
              Math.round(n.y),
              Math.round(n.amt),
            ]),
          }),
        );
      } catch {
        /* private browsing, a full disk: the game still plays */
      }
    }

    _load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw);
        return s && s.v === 1 ? s : null;
      } catch {
        return null;
      }
    }

    // the saved map is laid over the generated one (terrain runs first)
    _applySavedMap(world, nav) {
      const s = this.loaded;
      if (!s || !s.bs) return;
      world.buildings.length = 0;
      this.hall = null;
      for (const b of world.trees) b.amt = BAL.NODE.tree;
      for (const [kind, x, y, lvl, hp, built, ruined, prog] of s.bs) {
        const st = ZS.Structs.make(
          kind,
          x + ZS.Structs.CAT[kind].w / 2,
          y + ZS.Structs.CAT[kind].h / 2,
        );
        st.lvl = lvl;
        st.hp = hp;
        st.built = !!built;
        st.ruined = !!ruined;
        st.prog = prog;
        world.buildings.push(st);
        nav.markRect(st.x, st.y, st.w, st.h, 0);
        if (kind === "hall") this.hall = st;
      }
      if (!this.hall) this.hall = world.buildings[0];
      this.nodes = (s.nodes || []).map(([kind, x, y, amt]) => ({
        kind,
        x,
        y,
        amt,
        max: BAL.NODE[kind === "rock" ? "rock" : kind === "bush" ? "bush" : "wreck"],
        seed: Math.random() * 997,
        r: kind === "rock" ? 15 : 13,
      }));
    }

    reset() {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {
        /* nothing saved, nothing to clear */
      }
      location.reload();
    }

    /* ================= the people ================= */

    villagers() {
      const out = [];
      if (!this.agents) return out;
      for (const a of this.agents) if (a.st === 0 && !a.dead && !a.gone) out.push(a);
      return out;
    }

    guards() {
      return this.villagers().filter((a) => a.job === "guard");
    }

    _zeds(agents) {
      const out = [];
      for (const a of agents || this.agents) if (a.st === 2 && !a.dead && !a.gone) out.push(a);
      return out;
    }

    // the job's kit: a tool, or the frozen armed look for the gun tiers
    _dress(a) {
      const w = WEAPONS[this.weapon()];
      a.gun = false;
      a.wep = null;
      a.tool = null;
      if (a.job === "guard") {
        a.maxHp = Math.round(BAL.GUARD_HP * this._armor());
        if (w.gun) {
          a.gun = true;
          a.wep = w.gun;
        } else a.tool = w.tool;
        a.jobGlyph = "guard";
      } else {
        a.maxHp = Math.round(BAL.VILL_HP * this._armor());
        a.jobGlyph = a.job;
        a.tool =
          a.job === "wood"
            ? "axe"
            : a.job === "stone"
              ? "pick"
              : a.job === "food"
                ? "basket"
                : a.job === "farm"
                  ? "hoe"
                  : a.job === "build" || a.job === "repair"
                    ? "hammer"
                    : a.job === "heal"
                      ? "pail"
                      : null;
      }
      a.hp = Math.min(a.hp, a.maxHp);
    }

    _recalc() {
      for (const a of this.villagers()) this._dress(a);
      if (this.hall) {
        const base = ZS.Structs.CAT.hall.hp * (this.done.reinforce ? 2 : 1);
        const f = this.hall.hp / this.hall.maxHp;
        this.hall.maxHp = base;
        this.hall.hp = ZS.clamp(base * f, 1, base);
      }
    }

    // drop whatever they were doing (the bell, a new job, first dark)
    _breakOff(a, night) {
      if (a.mode === "haul" && a.carry && a.carry.n && !night) return; // finish the errand
      a.mode = "idle";
      a.tgt = null;
      a.path = null;
      a.workT = 0;
      a.fail = 0;
      a.task = TASK.idle;
    }

    update(a, dt, t, grid, nav) {
      a.noPush = false; // set by the states that hold a spot (see js/agents.js)
      if (a.st === 2) this._updateZombie(a, dt, t, grid, nav);
      else if (a.job === "guard") this._updateGuard(a, dt, t, grid, nav);
      else this._updateVillager(a, dt, t, grid, nav);
    }

    // the core lifts the fallen from the field: clear the selection, and
    // make sure the night's tally knows their name
    onDead(a) {
      if (this.sel && this.sel.o === a) this.sel = null;
      if (a.st !== 0 || !this.nightLog) return;
      if (a.name && this.nightLog.lost.indexOf(a.name) < 0) this.nightLog.lost.push(a.name);
    }

    _updateVillager(a, dt, t, grid, nav) {
      const dark = this.phase === "night" || this.phase === "dusk";
      const inf = this.has("infirm");
      // the bitten run for the infirmary; the wounded stagger there
      if (a.inf > 0 && inf && !dark) {
        const s = this._first("infirm");
        this._goto(a, outside(s, a.x, a.y, 24), dt, t, nav, this.maxSpeed(a), () => {
          a.mode = "rest";
          a.task = "being tended";
        });
        return;
      }
      if (a.hp < a.maxHp * 0.4 && inf && !dark && this.phase === "day") {
        const s = this._first("infirm");
        this._goto(a, outside(s, a.x, a.y, 24), dt, t, nav, this.maxSpeed(a), () => {
          a.mode = "rest";
          a.task = TASK.rest;
        });
        return;
      }
      if (dark) return this._nightFear(a, dt, t, grid, nav);
      if (this._dayFear(a, dt, t, grid, nav)) return;
      // the light is going: whatever they are doing out there, they start back
      if (this.phase === "day" && a.mode !== "haul" && BAL.DAY_LEN - this.phaseT < 22) {
        const sh = this._shelter();
        if (dist2(a.x, a.y, sh.x, sh.y) > 300 * 300) {
          this._breakOff(a, false);
          a.task = "heading home";
          a.wantMove = true;
          ZS.planAndFollow(a, sh, false, BAL.SPEED.walk * 1.2, dt, t, nav);
          return;
        }
      }

      switch (a.mode) {
        case "rest": {
          const s = this._first("infirm");
          if (!s || a.hp >= a.maxHp - 0.5) {
            a.mode = "idle";
            break;
          }
          const rate = BAL.HEAL_RATE * (s.lvl >= 2 ? 1.6 : 1) * (this.done.medicine ? 2 : 1);
          a.hp = Math.min(a.maxHp, a.hp + rate * dt);
          a.vx *= 0.85;
          a.vy *= 0.85;
          if (a.inf > 0 && this.done.medicine) {
            a.inf = Math.max(0, a.inf - dt * 3);
            if (a.inf === 0) this._pop(a.x, a.y - 26, "cured", "#5a7a3a");
          }
          break;
        }
        case "seek":
          this._doSeek(a, dt, t, nav);
          break;
        case "work":
          this._doWork(a, dt, t, nav);
          break;
        case "haul":
          this._doHaul(a, dt, t, nav);
          break;
        default:
          if (!this._nextTask(a)) this._loiter(a, dt, t, nav);
      }
    }

    // by day the dead are rare, but one loose in the village still clears
    // the street: drop the work and make for the hall
    _dayFear(a, dt, t, grid, nav) {
      const z = this._nearestZed(a, BAL.FLEE + 40, grid);
      if (!z) {
        a.fleeT = 0;
        return false;
      }
      const d = Math.hypot(z.x - a.x, z.y - a.y);
      a.fleeT += dt;
      if (a.sayT <= 0 && Math.random() < dt * 0.5) this._say(a, "one of them is still up!", 1.6);
      // cornered, or chased long enough: turn and swing
      if (d < BAL.VILL_FIGHT || a.fleeT > 9) {
        a.a = Math.atan2(z.y - a.y, z.x - a.x);
        a.vx *= 0.7;
        a.vy *= 0.7;
        a.task = TASK.fight;
        a.atkT -= dt;
        if (a.atkT <= 0) {
          a.atkT = BAL.FIST_RATE;
          a.swing = 0;
          this._hitZombie(a, z, BAL.FIST_DMG);
        }
        return true;
      }
      a.panic = Math.max(a.panic, 0.8);
      this._breakOff(a, true);
      a.task = TASK.flee;
      a.wantMove = true;
      ZS.planAndFollow(a, this._shelter(), false, BAL.SPEED.panic, dt, t, nav);
      return true;
    }

    // night falls: everyone who isn't a guard makes for the hall
    _nightFear(a, dt, t, grid, nav) {
      const z = this._nearestZed(a, 320, grid);
      // with their backs to the hall they stand and swing rather than bolt
      const atSh = dist2(a.x, a.y, this._shelter().x, this._shelter().y) < 95 * 95;
      if (z) {
        const d = Math.hypot(z.x - a.x, z.y - a.y);
        if (d < BAL.FLEE) {
          a.panic = 1.4;
          if (a.sayT <= 0 && Math.random() < dt * 0.5) this._say(a, "they're here!", 1.6);
        }
        if (d < (atSh ? BAL.VILL_FIGHT * 1.9 : BAL.VILL_FIGHT)) {
          a.a = Math.atan2(z.y - a.y, z.x - a.x);
          a.vx *= 0.7;
          a.vy *= 0.7;
          a.task = TASK.fight;
          a.atkT -= dt;
          if (a.atkT <= 0) {
            a.atkT = BAL.FIST_RATE;
            a.swing = 0;
            this._hitZombie(a, z, BAL.FIST_DMG);
          }
          return;
        }
      }
      if (a.panic > 0 && z && !atSh) {
        // bolt away from the dead, toward the hall if the hall is that way
        const sh = this._shelter();
        const away = { x: a.x + (a.x - z.x) * 2, y: a.y + (a.y - z.y) * 2 };
        const toSh = Math.hypot(sh.x - a.x, sh.y - a.y);
        const goal = toSh < 420 ? sh : away;
        a.wantMove = true;
        ZS.planAndFollow(a, goal, false, BAL.SPEED.panic, dt, t, nav);
        a.task = TASK.flee;
        return;
      }
      const sh = this._shelter();
      if (Math.hypot(sh.x - a.x, sh.y - a.y) > 34) {
        a.task = "heading home";
        a.wantMove = true;
        ZS.planAndFollow(a, sh, false, BAL.SPEED.walk, dt, t, nav);
      } else {
        a.vx *= 0.9;
        a.vy *= 0.9;
        a.task = "huddled by the hall";
      }
    }

    // where the watch stands: between the horde and the hall
    _shield() {
      if (this._sdT > 0 && this._sd) return this._sd;
      this._sdT = 1.4;
      const hx = this.hall.x + this.hall.w / 2,
        hy = this.hall.y + this.hall.h / 2;
      let zx = 0,
        zy = 0,
        n = 0;
      for (const a of this.agents) {
        if (a.st !== 2 || a.dead) continue;
        zx += a.x;
        zy += a.y;
        n++;
      }
      if (!n) return { x: hx, y: hy + this.hall.h / 2 + 110 };
      const dx = zx / n - hx,
        dy = zy / n - hy;
      const m = Math.hypot(dx, dy) || 1;
      this._sd = {
        x: hx + (dx / m) * (this.hall.w / 2 + 120),
        y: hy + (dy / m) * (this.hall.h / 2 + 120),
      };
      return this._sd;
    }

    // where the village huddles: the far side of the hall from the horde
    _shelter() {
      if (this._shT > 0 && this._sh) return this._sh;
      this._shT = 1.4;
      const hx = this.hall.x + this.hall.w / 2,
        hy = this.hall.y + this.hall.h / 2;
      let zx = 0,
        zy = 0,
        n = 0;
      for (const a of this.agents) {
        if (a.st !== 2 || a.dead) continue;
        zx += a.x;
        zy += a.y;
        n++;
      }
      let dx = n ? hx - zx / n : 0,
        dy = n ? hy - zy / n : 1;
      const m = Math.hypot(dx, dy) || 1;
      this._sh = {
        x: hx + (dx / m) * (this.hall.w / 2 + BAL.SHELTER_R),
        y: hy + (dy / m) * (this.hall.h / 2 + BAL.SHELTER_R),
      };
      return this._sh;
    }

    /* ---------- work ---------- */

    _workSpeed(_a) {
      let s = 1;
      if (this.done.tools1) s += 0.3;
      if (this.done.tools2) s += 0.3;
      s *= this.weather.work || 1;
      if (this.res.food <= 0) s *= 0.5;
      return s;
    }

    // the next thing this villager should be doing
    _nextTask(a) {
      const t = this._findWork(a);
      if (!t) return false;
      a.tgt = t;
      a.mode = "seek";
      a.task = TASK.seek;
      a.workT = 0;
      a.fail = 0;
      a.path = null;
      a.gx = null;
      return true;
    }

    _findWork(a) {
      const job = a.job;
      const str = (s, sub, work, cont) => ({
        kind: "struct",
        o: s,
        x: s.x + s.w / 2,
        y: s.y + s.h / 2,
        sub,
        work: work || 0,
        cont: !!cont,
      });
      const room = (k) => this.res[k] < this.storeCap() - 1;
      const node = (n, sub) => ({ kind: "node", o: n, x: n.x, y: n.y, sub, work: BAL.WORK[sub] });
      const tree = (tr) => ({
        kind: "tree",
        o: tr,
        x: tr.x,
        y: tr.y,
        sub: "tree",
        work: BAL.WORK.tree,
      });

      // how many are already on a structure?
      const busy = (o) => {
        let n = 0;
        for (const v of this.villagers()) if (v !== a && v.tgt && v.tgt.o === o) n++;
        return n;
      };
      const sites = this.world.buildings.filter((b) => !b.built && busy(b) < BAL.BUILDERS);
      const hurtAll = this.world.buildings.filter((b) => b.built && b.hp < b.maxHp - 1);
      const hurt = hurtAll.filter(
        (b) => (b.mat || (!b.ruined && b.hp < b.maxHp * 0.6)) && busy(b) < 2,
      );
      const plots = this.world.buildings.filter(
        (b) => b.kind === "farm" && b.built && !b.ruined && b.plot && busy(b) < 1,
      );
      const ripe = plots.filter((b) => b.plot.stage === 3);
      const fallow = plots.filter((b) => b.plot.stage === 0);
      const growing = plots.filter(
        (b) => (b.plot.stage === 1 || b.plot.stage === 2) && !(b.plot.wet > 0),
      );

      if (job === "heal") {
        const patients = this.villagers().filter(
          (v) => v !== a && (v.hp < v.maxHp * 0.85 || v.inf > 0) && v.job !== "heal",
        );
        if (!this.has("infirm")) return null;
        if (!patients.length) return null;
        patients.sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp);
        return {
          kind: "aid",
          o: patients[0],
          x: patients[0].x,
          y: patients[0].y,
          sub: "heal",
          cont: true,
        };
      }
      if (job === "build") {
        if (sites.length) return str(this._nearest(a, sites), "build", 0, true);
        return null;
      }
      if (job === "repair") {
        // only where timber has been set aside, or where the night did damage
        if (hurt.length) {
          hurt.sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp);
          return str(hurt[0], "repair", 0, true);
        }
        if (sites.length) return str(this._nearest(a, sites), "build", 0, true);
        return null;
      }
      if (job === "farm") {
        if (ripe.length) return str(this._nearest(a, ripe), "reap", BAL.WORK.reap);
        if (fallow.length && this.season.farm > 0.2 && room("food"))
          return str(this._nearest(a, fallow), "plant", BAL.WORK.plant);
        if (growing.length) return str(this._nearest(a, growing), "tend", BAL.WORK.tend);
        // no plots yet: go berry picking rather than stand about
        const n = room("food") ? this._nearestNode(a, "bush") : null;
        return n ? node(n, "bush") : null;
      }
      if (job === "wood") {
        const tr = room("wood") ? this._nearestTree(a) : null;
        if (tr) return tree(tr);
        const n = room("scrap") ? this._nearestNode(a, "wreck") : null;
        return n ? node(n, "wreck") : null;
      }
      if (job === "stone") {
        const n = room("stone") ? this._nearestNode(a, "rock") : null;
        if (n) return node(n, "rock");
        const w = room("scrap") ? this._nearestNode(a, "wreck") : null;
        return w ? node(w, "wreck") : null;
      }
      if (job === "food") {
        const n = room("food") ? this._nearestNode(a, "bush") : null;
        if (n) return node(n, "bush");
        if (ripe.length) return str(this._nearest(a, ripe), "reap", BAL.WORK.reap);
        return null;
      }
      if (job === "idle") return null;
      // the labourer: whatever the village needs most, and food before all else
      const pop = this.villagers().length;
      const feed = this._upkeep() * 2.5;
      if (this.res.food < feed) {
        if (ripe.length) return str(this._nearest(a, ripe), "reap", BAL.WORK.reap);
        const n = room("food") ? this._nearestNode(a, "bush") : null;
        if (n) return node(n, "bush");
        if (fallow.length && this.season.farm > 0.2)
          return str(this._nearest(a, fallow), "plant", BAL.WORK.plant);
        if (growing.length) return str(this._nearest(a, growing), "tend", BAL.WORK.tend);
      }
      if (sites.length) return str(this._nearest(a, sites), "build", 0, true);
      if (hurt.length && (this.res.wood > 4 || hurt[0].kind === "wall"))
        return str(hurt[0], "repair", 0, true);
      if (ripe.length) return str(this._nearest(a, ripe), "reap", BAL.WORK.reap);
      if (fallow.length && this.season.farm > 0.2 && room("food"))
        return str(this._nearest(a, fallow), "plant", BAL.WORK.plant);
      // a growing village wants a growing pile
      const wantW = Math.min(this.storeCap(), 80 + pop * 10);
      const wantS = Math.min(this.storeCap(), 60 + pop * 8);
      const wantC = Math.min(this.storeCap(), 40 + pop * 6);
      if (this.res.wood < wantW && room("wood")) {
        const tr = this._nearestTree(a);
        if (tr) return tree(tr);
      }
      if (this.res.stone < wantS && room("stone")) {
        const n = this._nearestNode(a, "rock");
        if (n) return node(n, "rock");
      }
      if (this.res.scrap < wantC && room("scrap")) {
        const n = this._nearestNode(a, "wreck");
        if (n) return node(n, "wreck");
      }
      if (growing.length) return str(this._nearest(a, growing), "tend", BAL.WORK.tend);
      // nothing pressing: bring in whatever there is still room for
      const any =
        (room("wood") && this._nearestTree(a)) ||
        (room("food") && this._nearestNode(a, "bush")) ||
        (room("stone") && this._nearestNode(a, "rock")) ||
        (room("scrap") && this._nearestNode(a, "wreck")) ||
        null;
      if (any) return any.kind === "tree" ? tree(any) : node(any, any.kind);
      return null;
    }

    _nearest(a, list) {
      let best = null,
        bd = 1e18;
      for (const o of list) {
        const d = dist2(a.x, a.y, o.x + (o.w || 0) / 2, o.y + (o.h || 0) / 2);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      return best;
    }

    // somebody is already on their way to this one
    _claimed(o, n, a) {
      let c = 0;
      for (const v of this.villagers()) {
        if (v === a || !v.tgt || v.tgt.o !== o) continue;
        if (++c >= n) return true;
      }
      return false;
    }

    _nearestTree(a) {
      let best = null,
        bd = 1e18;
      for (const tr of this.world.trees) {
        if (!(tr.amt > 0) || (tr.no && tr.no > this.t) || this._claimed(tr, 1, a)) continue;
        const d = dist2(a.x, a.y, tr.x, tr.y);
        if (d < bd) {
          bd = d;
          best = tr;
        }
      }
      return best;
    }

    _nearestNode(a, kind) {
      let best = null,
        bd = 1e18;
      for (const n of this.nodes) {
        if (n.kind !== kind || !(n.amt > 0) || (n.no && n.no > this.t) || this._claimed(n, 1, a))
          continue;
        const d = dist2(a.x, a.y, n.x, n.y);
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      return best;
    }

    _nearestStore(a) {
      let best = this.hall,
        bd = 1e18;
      for (const b of this.world.buildings) {
        if (b.kind !== "store" || !b.built || b.ruined) continue;
        const d = dist2(a.x, a.y, b.x + b.w / 2, b.y + b.h / 2);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      return best;
    }

    // the spot to stand at while working a node or a structure
    _workPoint(a, tg) {
      if (tg.kind === "tree") {
        const dx = a.x - tg.o.x,
          dy = a.y - tg.o.y;
        const m = Math.hypot(dx, dy) || 1;
        return { x: tg.o.x + (dx / m) * (tg.o.r + 12), y: tg.o.y + (dy / m) * (tg.o.r + 10) };
      }
      if (tg.kind === "node") {
        const dx = a.x - tg.o.x,
          dy = a.y - tg.o.y;
        const m = Math.hypot(dx, dy) || 1;
        return { x: tg.o.x + (dx / m) * 20, y: tg.o.y + (dy / m) * 16 };
      }
      if (tg.kind === "aid") return { x: tg.o.x + 14, y: tg.o.y + 6 };
      return outside(tg.o, a.x, a.y, 22);
    }

    _goto(a, p, dt, t, nav, sp, onArrive) {
      a.wantMove = true;
      const r = ZS.planAndFollow(a, p, false, sp, dt, t, nav);
      if (r === "arrived") {
        a.path = null;
        onArrive();
        return true;
      }
      if (r === "fail" || r === "blocked") {
        a.fail = (a.fail || 0) + dt;
        if (a.fail > 1.5) {
          a.fail = 0;
          const tg = a.tgt;
          if (tg && (tg.kind === "tree" || tg.kind === "node") && tg.o) tg.o.no = this.t + 45;
          a.mode = "idle";
          a.tgt = null;
        }
      } else a.fail = 0;
      return false;
    }

    _doSeek(a, dt, t, nav) {
      const tg = a.tgt;
      if (
        !tg ||
        !tg.o ||
        tg.o.dead ||
        (tg.kind === "tree" && tg.o.amt <= 0) ||
        (tg.kind === "node" && tg.o.amt <= 0)
      ) {
        a.mode = "idle";
        a.tgt = null;
        return;
      }
      if (tg.kind === "struct" && tg.o.ruined && tg.sub !== "repair") {
        a.mode = "idle";
        a.tgt = null;
        return;
      }
      this._goto(a, this._workPoint(a, tg), dt, t, nav, this.maxSpeed(a), () => {
        a.mode = "work";
        a.task = TASK.work;
        a.workT = 0;
      });
      a.task = TASK.seek;
    }

    _doWork(a, dt, _t, _nav) {
      const tg = a.tgt;
      if (!tg || !tg.o) {
        a.mode = "idle";
        return;
      }
      const p = this._workPoint(a, tg);
      if (dist2(a.x, a.y, p.x, p.y) > 52 * 52) {
        a.mode = "seek";
        return;
      }
      a.a = Math.atan2(tg.y - a.y, tg.x - a.x);
      a.vx *= 0.8;
      a.vy *= 0.8;
      a.noPush = true; // hold the spot while the work gets done
      a.swing += dt * 9;
      const sp = this._workSpeed(a);

      if (tg.sub === "build") {
        const b = tg.o;
        if (b.built) {
          a.mode = "idle";
          a.tgt = null;
          return;
        }
        b.prog += (dt * sp) / ZS.Structs.CAT[b.kind].time;
        if (b.prog >= 1) {
          b.prog = 1;
          b.built = true;
          b.hp = b.maxHp;
          if (b.kind === "farm") b.plot = { stage: 0, growth: 0, wet: 0 };
          this._pop(b.x + b.w / 2, b.y, ZS.Structs.CAT[b.kind].name + " up", "#5a7a3a");
          if (ZS.sound) ZS.sound.event("v_callout", b.x, b.y);
          a.mode = "idle";
          a.tgt = null;
        }
        return;
      }
      if (tg.sub === "repair") {
        const b = tg.o;
        if (b.hp >= b.maxHp) {
          if (b.ruined) {
            b.ruined = false;
            if (b.kind === "farm" && !b.plot) b.plot = { stage: 0, growth: 0, wet: 0 };
          }
          b.mat = null;
          b.want = false;
          a.mode = "idle";
          a.tgt = null;
          this._pop(b.x + b.w / 2, b.y, "mended", "#5a7a3a");
          return;
        }
        // timber and stone: from what the player set aside first, then
        // straight out of the stores
        const take = (k, rate) => {
          const want = rate * dt;
          if (b.mat && b.mat[k] > 0) {
            const got = Math.min(b.mat[k], want);
            b.mat[k] -= got;
            return got / want;
          }
          if (this.res[k] > 0) {
            this.res[k] = Math.max(0, this.res[k] - want);
            return 1;
          }
          return 0;
        };
        const ok = take("wood", BAL.REPAIR_COST.w) > 0 || take("stone", BAL.REPAIR_COST.s) > 0;
        if (b.mat && b.mat.wood <= 0.01 && b.mat.stone <= 0.01) b.mat = null; // spent: ask for more
        if (!ok) {
          if (!this.warned.nomat || this.t - this.warned.nomat > 20) {
            this.warned.nomat = this.t;
            if (ZS.VillageUI) ZS.VillageUI.toast("no timber or stone to repair with");
          }
          a.mode = "idle";
          a.tgt = null;
          return;
        }
        b.hp = Math.min(b.maxHp, b.hp + BAL.REPAIR_RATE * sp * dt);
        if (b.ruined && b.hp >= b.maxHp * 0.45) {
          b.ruined = false;
          if (b.kind === "farm" && !b.plot) b.plot = { stage: 0, growth: 0, wet: 0 };
          this._pop(b.x + b.w / 2, b.y, "standing again", "#5a7a3a");
        }
        return;
      }
      if (tg.sub === "plant" || tg.sub === "tend" || tg.sub === "reap") {
        const b = tg.o;
        if (!b.plot || b.ruined) {
          a.mode = "idle";
          a.tgt = null;
          return;
        }
        a.workT += dt * sp;
        if (a.workT < tg.work) return;
        a.workT = 0;
        if (tg.sub === "plant") {
          if (b.plot.stage !== 0) {
            a.mode = "idle";
            a.tgt = null;
            return;
          }
          b.plot = { stage: 1, growth: 0, wet: 0, tend: 0 };
          this._pop(b.x + b.w / 2, b.y, "sown", "#5a7a3a");
        } else if (tg.sub === "tend") {
          b.plot.wet = 70;
          b.plot.tend = (b.plot.tend || 0) + 1;
          this._pop(b.x + b.w / 2, b.y, "watered", "#5a7a3a");
        } else {
          if (b.plot.stage !== 3) {
            a.mode = "idle";
            a.tgt = null;
            return;
          }
          const n = Math.max(
            2,
            Math.round(
              BAL.FARM_YIELD *
                (b.lvl >= 2 ? 1.5 : 1) *
                Math.max(0.25, this.season.farm) *
                (1 + (b.plot.tend || 0) * 0.08),
            ),
          );
          b.plot = { stage: 0, growth: 0, wet: 0, tend: 0 };
          a.carry = { kind: "food", n };
          a.mode = "haul";
          a.task = TASK.haul;
          a.haulT = 0;
          a.haulF = 0;
          this._pop(b.x + b.w / 2, b.y, "+" + n + " food", "#b1963e");
          if (ZS.sound) ZS.sound.event("v_callout", b.x, b.y);
          return;
        }
        a.mode = "idle";
        a.tgt = null;
        return;
      }
      if (tg.sub === "heal") {
        const v = tg.o;
        if (v.dead || v.hp >= v.maxHp) {
          a.mode = "idle";
          a.tgt = null;
          return;
        }
        v.hp = Math.min(v.maxHp, v.hp + BAL.HEAL_RATE * dt);
        if (v.inf > 0) v.inf = Math.max(0, v.inf - dt * 2);
        return;
      }
      // everything else is a cycle: work, then carry it home
      a.workT += dt * sp;
      if (a.workT < tg.work) return;
      this._finishWork(a, tg);
    }

    _finishWork(a, tg) {
      a.workT = 0;
      if (tg.kind !== "tree" && tg.kind !== "node") {
        a.mode = "idle";
        a.tgt = null;
        return;
      }
      if (tg.kind === "tree") {
        const tr = tg.o;
        const n = Math.min(BAL.CARRY, BAL.YIELD.tree, tr.amt);
        tr.amt -= n;
        if (this.stains) this.stains.splat(tr.x, tr.y + 4, "chip", tr.seed);
        if (tr.amt <= 0) {
          const i = this.world.trees.indexOf(tr);
          if (i >= 0) this.world.trees.splice(i, 1);
          this._pop(tr.x, tr.y - 20, "+" + n + " wood", "#8a6a3a");
          if (ZS.sound) ZS.sound.event("turret", tr.x, tr.y);
          // a sapling, somewhere back in the wood
          const f = this.world.forest;
          if (f && this.world.trees.length < this.trees0) {
            const an = Math.random() * Math.PI * 2,
              rr = Math.sqrt(Math.random()) * f.r * 0.9;
            this.regrow.push({
              x: f.x + Math.cos(an) * rr,
              y: f.y + Math.sin(an) * rr * 0.9,
              t: BAL.TREE_REGROW,
            });
          }
        }
        a.carry = { kind: "wood", n };
        a.mode = "haul";
        a.task = TASK.haul;
        a.haulT = 0;
        a.haulF = 0;
        return;
      }
      const n = tg.o;
      const kind = tg.sub === "rock" ? "stone" : tg.sub === "wreck" ? "scrap" : "food";
      const got = Math.min(BAL.CARRY, BAL.YIELD[tg.sub], n.amt);
      n.amt -= got;
      if (n.amt <= 0) {
        if (n.kind === "bush") {
          n.amt = 0;
          n.cool = BAL.BUSH_REGROW;
        } else {
          const i = this.nodes.indexOf(n);
          if (i >= 0) this.nodes.splice(i, 1);
        }
      }
      this._pop(
        n.x,
        n.y - 16,
        "+" + got + " " + kind,
        kind === "stone" ? "#7a7669" : kind === "food" ? "#b1963e" : "#6f7681",
      );
      a.carry = { kind, n: got };
      a.mode = "haul";
      a.task = TASK.haul;
      a.haulT = 0;
      a.haulF = 0;
      return;
    }

    _doHaul(a, dt, t, nav) {
      if (!a.carry || !(a.carry.n > 0)) {
        a.carry = null;
        a.mode = "idle";
        return;
      }
      const st = this._nearestStore(a);
      const p = outside(st, a.x, a.y, 24);
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      a.haulT = (a.haulT || 0) + dt;
      if (d > 40) {
        a.wantMove = true;
        const r = ZS.planAndFollow(a, p, false, this.maxSpeed(a), dt, t, nav);
        if (r === "fail" || r === "blocked") a.haulF = (a.haulF || 0) + dt;
        else a.haulF = 0;
        a.task = TASK.haul;
        // the gate is shut, or the way round is long: hand the load over
        // where they stand rather than shuffle outside the palisade
        if (a.haulF > 3.5 || a.haulT > 26) return this._deposit(a, st, true);
        return;
      }
      this._deposit(a, st, false);
    }

    _deposit(a, st, gate) {
      const got = this._add(a.carry.kind, a.carry.n);
      if (got > 0)
        this._pop(
          gate ? a.x : st.x + st.w / 2,
          (gate ? a.y : st.y) - 6,
          "+" + got + " " + a.carry.kind,
          "#5a7a3a",
        );
      else if (!this.warned.full || this.t - this.warned.full > 45) {
        this.warned.full = this.t;
        if (ZS.VillageUI) ZS.VillageUI.toast("the stores are full — build a storehouse");
      }
      a.carry = null;
      a.mode = "idle";
      a.tgt = null;
      a.haulT = 0;
      a.haulF = 0;
    }

    // nothing to do: drift about the village green
    _loiter(a, dt, t, nav) {
      a.task = TASK.idle;
      if (!a.wx || a.wt <= 0 || dist2(a.x, a.y, a.wx, a.wy) < 30 * 30) {
        a.wt = 3 + Math.random() * 4;
        const an = Math.random() * Math.PI * 2;
        const r = 60 + Math.random() * 160;
        const p = nav.nearestWalkable(
          this.hall.x + this.hall.w / 2 + Math.cos(an) * r,
          this.hall.y + this.hall.h / 2 + Math.sin(an) * r,
          160,
          false,
        );
        a.wx = p ? p.x : a.x;
        a.wy = p ? p.y : a.y;
      }
      a.wt -= dt;
      a.wantMove = true;
      ZS.planAndFollow(a, { x: a.wx, y: a.wy }, false, 44, dt, t, nav);
    }

    /* ---------- guards ---------- */

    weapon() {
      let w = "club";
      for (const k of WEP_ORDER) if (this.done[k === "club" ? "club" : k]) w = k;
      if (this.done.spears) w = "spear";
      if (this.done.bows) w = "bow";
      if (this.done.rifles) w = "rifle";
      if (this.done.shotguns) w = "shotgun";
      if (this.done.smgs) w = "smg";
      return w;
    }

    weaponName() {
      return "armed with " + WEAPONS[this.weapon()].name;
    }

    armorName() {
      const a = this._armor();
      return a > 1.6 ? "mail and plate" : a > 1.2 ? "boiled leather" : "no armour";
    }

    _armor() {
      return 1 + (this.done.armor1 ? 0.4 : 0) + (this.done.armor2 ? 0.4 : 0);
    }

    _sight(a) {
      let s = BAL.GUARD_SIGHT * (this.weather.sight || 1);
      for (const b of this.world.buildings)
        if (b.kind === "tower" && b.built && !b.ruined && ZS.Structs.dist(b, a.x, a.y) < 200) {
          s *= 1.35;
          break;
        }
      if (this.done.towers2) s *= 1.4;
      return s;
    }

    _updateGuard(a, dt, t, grid, nav) {
      const w = WEAPONS[this.weapon()];
      const sight = this._sight(a);
      const z = this._nearestZed(a, sight, grid) || this._nearestZed(a, 70, grid);
      if (!z) {
        if (a.hp < a.maxHp * 0.3 && this.has("infirm") && this.phase !== "night") {
          const s = this._first("infirm");
          this._goto(a, outside(s, a.x, a.y, 24), dt, t, nav, this.maxSpeed(a), () => {
            a.mode = "rest";
            a.task = TASK.rest;
          });
          return;
        }
        if (a.mode === "rest") {
          a.hp = Math.min(a.maxHp, a.hp + BAL.HEAL_RATE * dt);
          if (a.hp >= a.maxHp - 0.5) a.mode = "idle";
          a.vx *= 0.85;
          a.vy *= 0.85;
          return;
        }
        // the watch: the posts and the towers, then the green
        const posts = this.world.buildings.filter(
          (b) => (b.kind === "post" || b.kind === "tower") && b.built && !b.ruined,
        );
        a.task = TASK.patrol;
        if (!posts.length && (this.phase === "night" || this.phase === "dusk")) {
          // no post yet: the watch forms a line between the hall and the wood
          const sp = this._shield();
          if (dist2(a.x, a.y, sp.x, sp.y) > 44 * 44) {
            a.wantMove = true;
            ZS.planAndFollow(a, sp, false, 64, dt, t, nav);
          } else {
            a.vx *= 0.85;
            a.vy *= 0.85;
            const z2 = this._nearestZed(a, 400, grid);
            if (z2) a.a = Math.atan2(z2.y - a.y, z2.x - a.x);
          }
          return;
        }
        if (posts.length) {
          const p = posts[(a.uid + Math.floor(this.t / 12)) % posts.length];
          const spot = outside(p, a.x, a.y, 26);
          if (dist2(a.x, a.y, spot.x, spot.y) > 46 * 46) {
            a.wantMove = true;
            ZS.planAndFollow(a, spot, false, 62, dt, t, nav);
          } else {
            a.vx *= 0.85;
            a.vy *= 0.85;
            a.a += dt * 0.5;
          }
        } else this._loiter(a, dt, t, nav);
        return;
      }
      const d = Math.hypot(z.x - a.x, z.y - a.y);
      a.a = Math.atan2(z.y - a.y, z.x - a.x);
      a.task = TASK.fight;
      if (!w.melee) {
        const near = w.range * 0.4;
        if (d > w.range * 0.82) {
          a.wantMove = true;
          ZS.planAndFollow(a, { x: z.x, y: z.y }, false, BAL.SPEED.guard, dt, t, nav);
        } else if (d < near) {
          // back off, but keep the muzzle on them
          a.wantMove = true;
          ZS.planAndFollow(
            a,
            { x: a.x + (a.x - z.x), y: a.y + (a.y - z.y) },
            false,
            BAL.SPEED.guard * 0.7,
            dt,
            t,
            nav,
          );
        } else {
          a.vx *= 0.8;
          a.vy *= 0.8;
        }
        a.atkT -= dt;
        if (a.atkT <= 0 && d <= w.range && nav.los(a.x, a.y, z.x, z.y, false)) {
          a.atkT = w.rate;
          this._fire(a, z, w);
        }
        return;
      }
      // melee: close and swing
      if (d > w.range * 0.7) {
        a.wantMove = true;
        ZS.planAndFollow(a, { x: z.x, y: z.y }, false, BAL.SPEED.guard, dt, t, nav);
      } else {
        a.vx *= 0.8;
        a.vy *= 0.8;
      }
      a.atkT -= dt;
      if (a.atkT <= 0 && d <= w.range + 8) {
        a.atkT = w.rate;
        a.swing = 0;
        a.workT = 0.2;
        this._hitZombie(a, z, w.dmg, true);
      }
    }

    _fire(a, z, w) {
      a.muzzle = 0.12;
      this.fx.push({
        x0: a.x,
        y0: a.y - 10,
        x1: z.x,
        y1: z.y - 8,
        t: 0.09,
        tracer: 1,
        seed: a.seed,
      });
      if (ZS.sound)
        ZS.sound.event(
          "shot_" + (w.gun === "rifle" ? "rifle" : w.gun === "smg" ? "smg" : "shotgun"),
          a.x,
          a.y,
        );
      const shots = w.pellets || 1;
      for (let i = 0; i < shots; i++) this._hitZombie(a, z, w.dmg / (w.pellets ? 1.6 : 1));
    }

    /* ---------- the dead ---------- */

    _nearestZed(a, r, grid) {
      let best = null,
        bd = r * r;
      const f = (o) => {
        if (o.st !== 2 || o.dead || o.gone || o.flee) return;
        const d = dist2(a.x, a.y, o.x, o.y);
        if (d < bd) {
          bd = d;
          best = o;
        }
      };
      if (grid) grid.query(a.x, a.y, r, f);
      else for (const o of this.agents) f(o);
      return best;
    }

    _updateZombie(a, dt, t, grid, nav) {
      // first light: whatever is left slinks back into the wood
      if (a.flee) {
        const w = this.world;
        const g = { x: a.x < w.w / 2 ? 60 : w.w - 60, y: a.y < w.h / 2 ? 60 : w.h - 60 };
        a.wantMove = true;
        ZS.planAndFollow(a, g, true, a.spd * 1.2, dt, t, nav);
        if (a.x < 110 || a.x > w.w - 110 || a.y < 110 || a.y > w.h - 110) a.gone = true;
        return;
      }
      const sight = BAL.PERC * (this.weather.sight || 1);
      const sh = this._shelter();
      let prey = null,
        bd = 1e18;
      for (const v of this.villagers()) {
        const d = dist2(a.x, a.y, v.x, v.y);
        if (d > sight * sight || d >= bd) continue;
        if (!nav.los(a.x, a.y, v.x, v.y, true)) continue;
        // somebody pressed up against the hall in the dark keeps their head
        // down — they are only found when the dead are nearly on them
        if (dist2(v.x, v.y, sh.x, sh.y) < 80 * 80 && d > 95 * 95) continue;
        bd = d;
        prey = v;
      }
      // they always know where the hall is: the light, the smoke, the noise
      const goal = prey || { x: this.hall.x + this.hall.w / 2, y: this.hall.y + this.hall.h / 2 };
      const d = Math.hypot(goal.x - a.x, goal.y - a.y);
      a.a = Math.atan2(goal.y - a.y, goal.x - a.x);
      if (d > (prey ? 16 : 40)) {
        a.wantMove = true;
        ZS.planAndFollow(a, goal, true, a.spd, dt, t, nav);
      }
      // what stands in the way gets pulled at
      if ((a.stuckT > 0.8 || d < 44) && !prey) this._gnaw(a, dt);
      else if (a.stuckT > 0.8) this._gnaw(a, dt);
      // the bite
      if (prey && d < BAL.ZED[a.zType].reach + 10) {
        a.atkT -= dt;
        if (a.atkT <= 0) {
          a.atkT = BAL.ZED[a.zType].cd;
          this._bite(a, prey);
        }
      }
    }

    // chewing on whatever is between them and the hall
    _gnaw(a, dt) {
      let best = null,
        bd = 1e18;
      for (const b of this.world.buildings) {
        const d = rectDist(b, a.x, a.y);
        if (d > 46 || d >= bd) continue;
        bd = d;
        best = b;
      }
      if (!best) return;
      const dps = BAL.ZED[a.zType].dmg * (a.zType === "brute" ? 2.4 : 1);
      a.vx *= 0.7;
      a.vy *= 0.7;
      a.a = Math.atan2(best.y + best.h / 2 - a.y, best.x + best.w / 2 - a.x);
      a.atkT -= dt;
      if (a.atkT > 0) return;
      a.atkT = 0.5;
      this._damageStruct(best, dps * 0.5);
      if (Math.random() < 0.5)
        this.fx.push({ x: a.x, y: a.y - 6, t: 0.3, chip: 1, seed: a.seed + this.fx.length });
    }

    _bite(a, v) {
      const z = BAL.ZED[a.zType];
      v.hp -= z.dmg;
      v.flash = 0.3;
      this.fx.push({ x: v.x, y: v.y - 8, t: 0.3, blood: 2, seed: v.seed });
      if (this.stains) this.stains.splat(v.x, v.y + 2, "blood", v.seed + Math.random() * 99);
      if (ZS.sound) ZS.sound.event("v_gasp", v.x, v.y);
      if (v.hp <= 0) {
        this._killVillager(v);
        return;
      }
      if (v.inf <= 0 && Math.random() < BAL.INFECT_CHANCE) {
        v.inf = BAL.INFECT_TIME;
        this._pop(v.x, v.y - 28, "bitten!", "#a04030");
        if (ZS.VillageUI) ZS.VillageUI.toast(v.name + " was bitten");
      }
    }

    _hitZombie(a, z, dmg, _melee) {
      z.hp -= dmg;
      z.flash = 0.22;
      this.fx.push({ x: z.x, y: z.y - 8, t: 0.25, blood: 2, seed: z.seed + this.fx.length });
      if (this.stains) this.stains.splat(z.x, z.y + 2, "blood", z.seed + Math.random() * 99);
      if (z.hp > 0) return;
      z.dead = true;
      if (this.stains) this.stains.corpse(z);
      if (this.nightLog) this.nightLog.killed++;
      const sc = BAL.ZED[z.zType].scrap;
      if (sc) {
        const got = this._add("scrap", sc);
        if (got) this._pop(z.x, z.y - 18, "+" + got + " scrap", "#6f7681");
      }
      if (a && a.st === 0) {
        this._pop(a.x, a.y - 30, "down", "#5a7a3a");
        if (ZS.sound) ZS.sound.event("v_callout", a.x, a.y);
      }
    }

    _damageStruct(b, amt) {
      if (b.dead) return;
      b.hp -= amt;
      if (this.nightLog) this.nightLog.dmg += amt;
      if (b.hp > 0) return;
      b.hp = 0;
      b.dead = true;
      if (this.stains) this.stains.splat(b.x + b.w / 2, b.y + b.h / 2, "rubble", b.seed);
      if (ZS.sound) ZS.sound.event("door_break", b.x, b.y);
      this._pop(b.x + b.w / 2, b.y - 10, ZS.Structs.CAT[b.kind].name + " down", "#a04030");
      if (b === this.hall) {
        this._gameOver("the hall is down");
        return;
      }
      ZS.Structs.remove(this.world, this.nav, b);
      // whoever was working there picks something else
      for (const v of this.villagers()) if (v.tgt && v.tgt.o === b) this._breakOff(v, false);
    }

    _killVillager(v) {
      v.dead = true;
      v.carry = null;
      if (this.stains) this.stains.corpse(v);
      if (this.nightLog) this.nightLog.lost.push(v.name);
      if (ZS.sound) ZS.sound.event("v_shout", v.x, v.y);
      if (this.sel && this.sel.o === v) this.sel = null;
      // some of them get up again, but not in daylight
      if (Math.random() < BAL.RISE_CHANCE && this.phase !== "day") {
        const z = this.makeAgent(v.x, v.y, 2, {
          zType: "walker",
          hp: 16 + this.day * 2,
          maxHp: 16 + this.day * 2,
          spd: BAL.ZED.walker.spd * 1.05,
          dmg: BAL.ZED.walker.dmg,
          atkT: 0.6,
          scale: 1,
        });
        z.flash = 0.9;
        this.agents.push(z);
      }
      if (!this.villagers().length) this._gameOver("silence — there is nobody left");
    }

    // a bite that runs its course
    _turn(v) {
      v.dead = true;
      if (this.stains) this.stains.corpse(v);
      if (this.nightLog) this.nightLog.lost.push(v.name);
      if (ZS.VillageUI) ZS.VillageUI.toast(v.name + " turned in the night");
      const z = this.makeAgent(v.x, v.y, 2, {
        zType: "walker",
        hp: 24 + this.day * 3,
        maxHp: 24 + this.day * 3,
        spd: BAL.ZED.walker.spd,
        dmg: BAL.ZED.walker.dmg,
        atkT: 0.6,
        scale: 1,
      });
      z.flash = 0.9;
      this.agents.push(z);
      if (!this.villagers().length) this._gameOver("silence — there is nobody left");
    }

    _gameOver(reason) {
      if (this.over) return;
      const lines = [
        "the village lasted " + this.day + (this.day === 1 ? " day" : " days"),
        "villagers left: " + this.villagers().length,
        "walls standing: " +
          this.world.buildings.filter((b) => b.kind === "wall" && b.built).length,
        "dead put down: " + (this.nightLog ? this.nightLog.killed : 0),
        "it starts again from the ruin",
      ];
      this.over = { title: reason, lines };
      this.card = { title: reason, lines, lost: true };
      if (ZS.sound) ZS.sound.event("boom", this.hall.x, this.hall.y);
    }

    /* ================= economy ================= */

    has(kind) {
      for (const b of this.world.buildings)
        if (b.kind === kind && b.built && !b.ruined) return true;
      return false;
    }

    _first(kind) {
      for (const b of this.world.buildings) if (b.kind === kind && b.built && !b.ruined) return b;
      return null;
    }

    count(kind) {
      let n = 0;
      for (const b of this.world.buildings) if (b.kind === kind && b.built && !b.ruined) n++;
      return n;
    }

    canPay(c) {
      return (
        this.res.wood >= (c.w || 0) && this.res.stone >= (c.s || 0) && this.res.scrap >= (c.c || 0)
      );
    }

    pay(c) {
      this.res.wood -= c.w || 0;
      this.res.stone -= c.s || 0;
      this.res.scrap -= c.c || 0;
    }

    _add(kind, n) {
      const room = Math.max(0, this.storeCap() - this.res[kind]);
      const got = Math.min(n, room);
      this.res[kind] += got;
      return got;
    }

    // how much of any one good the village can hold
    storeCap() {
      let c = BAL.STORE0 + (this.hall.lvl - 1) * 140;
      for (const b of this.world.buildings)
        if (b.kind === "store" && b.built && !b.ruined) c += 150 * b.lvl;
      return c;
    }

    storeTotal() {
      return this.res.wood + this.res.stone + this.res.food + this.res.scrap;
    }

    popCap() {
      let c = BAL.HOMES0 + this.hall.lvl * 2;
      for (const b of this.world.buildings)
        if (b.kind === "hut" && b.built && !b.ruined) c += 2 * b.lvl;
      return c;
    }

    guardCap() {
      let c = 3;
      for (const b of this.world.buildings) {
        if (!b.built || b.ruined) continue;
        if (b.kind === "post" || b.kind === "tower") c += 2 * b.lvl;
      }
      return c;
    }

    buildCost(kind) {
      return Object.assign({}, ZS.Structs.CAT[kind].cost);
    }

    recruitCost() {
      return Object.assign({}, BAL.RECRUIT);
    }

    upgradeCost(s) {
      const c = ZS.Structs.CAT[s.kind].cost;
      const k = s.lvl * 1.1;
      return {
        w: Math.round((c.w || 0) * k) || 0,
        s: Math.round((c.s || 0) * k) || 0,
        c: Math.round((c.c || 0) * k) || 0,
      };
    }

    // timber and stone for the hp that is missing
    repairCost(s) {
      const miss = s.maxHp - s.hp;
      return { w: Math.ceil(miss / 9), s: s.kind === "wall" ? 0 : Math.ceil(miss / 30) };
    }

    // keep a rebuilding reserve topped up as timber comes in, so one click
    // on "rebuild" is enough to see a ruin through to whole again
    _topUp(s) {
      if (!s.want || s.hp >= s.maxHp || s.mat) return;
      this.repair(s, true);
    }

    /* ================= actions ================= */

    setJob(a, job) {
      if (job === "guard" && a.job !== "guard" && this.guards().length >= this.guardCap()) {
        if (ZS.VillageUI) ZS.VillageUI.toast("no room in the guard — build a guard post");
        return;
      }
      a.job = job;
      this._dress(a);
      this._breakOff(a, false);
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
    }

    _joinVillager() {
      const hx = this.hall.x + this.hall.w / 2,
        hy = this.hall.y + this.hall.h / 2;
      const p = this.nav.nearestWalkable(
        hx + (Math.random() - 0.5) * 120,
        hy + 90 + Math.random() * 60,
        200,
        false,
      );
      const a = this.makeAgent(p ? p.x : hx, p ? p.y : hy, 0);
      const used = {};
      for (const v of this.agents) if (v.name) used[v.name] = 1;
      let free = null;
      for (let i = 0; i < 8 && !free; i++) {
        const n = NAMES[(Math.random() * NAMES.length) | 0];
        if (!used[n]) free = n;
      }
      if (!free) {
        // every name in the book is taken: number the newcomer
        let i = 2;
        while (used[(free = NAMES[0] + " " + i)]) i++;
      }
      a.name = free;
      this._dress(a);
      this.agents.push(a);
      return a;
    }

    recruit() {
      if (this.villagers().length >= this.popCap()) {
        if (ZS.VillageUI) ZS.VillageUI.toast("no beds — build or upgrade a hut");
        return;
      }
      if (!this.canPay(BAL.RECRUIT)) {
        if (ZS.VillageUI)
          ZS.VillageUI.toast("a newcomer needs " + ZS.VillageUI.costText(BAL.RECRUIT));
        return;
      }
      this.pay(BAL.RECRUIT);
      const a = this._joinVillager();
      if (ZS.VillageUI) ZS.VillageUI.toast(a.name + " joined the village");
      return a;
    }

    openBuild() {
      this.mode = "build";
      this.sel = null;
    }

    openResearch() {
      this.mode = "research";
      this.sel = null;
    }

    cancelMode() {
      this.mode = null;
      this.armed = null;
    }

    clearSel() {
      if (this.sel) {
        if (this.sel.k === "v") this.sel.o.sel = false;
        this.sel = null;
      }
    }

    selectVillager(a) {
      this.clearSel();
      this.sel = { k: "v", o: a };
      for (const v of this.villagers()) v.sel = v === a;
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
    }

    selectStruct(s) {
      this.clearSel();
      this.sel = { k: "s", o: s };
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
    }

    armBuild(kind) {
      if (kind === "wall" && this.done.stonewall && this.armed !== "wall2") {
        // the stone version is the same row, toggled by pressing it again
      }
      const cost = this.buildCost(kind);
      if (!this.canPay(cost)) {
        if (ZS.VillageUI) ZS.VillageUI.toast("not enough: " + ZS.VillageUI.costText(cost));
        return;
      }
      this.armed = kind;
      this.mode = "build";
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
    }

    _placeAt(x, y) {
      const kind = this.armed;
      const chk = ZS.Structs.canPlace(this.world, this.nav, kind, x, y);
      if (!chk.ok) {
        if (ZS.VillageUI) ZS.VillageUI.toast(chk.err);
        return;
      }
      const cost = this.buildCost(kind);
      if (!this.canPay(cost)) {
        if (ZS.VillageUI) ZS.VillageUI.toast("not enough: " + ZS.VillageUI.costText(cost));
        return;
      }
      this.pay(cost);
      const r = ZS.Structs.place(this.world, this.nav, kind, x, y, { built: false, prog: 0 });
      if (!r.ok) return;
      const s = r.s;
      s.hp = Math.round(s.maxHp * 0.12);
      if (kind === "wall" && this.done.stonewall) {
        s.lvl = 2;
        s.maxHp = Math.round(s.maxHp * 2);
        s.hp = s.maxHp * 0.12;
      }
      if (ZS.sound) ZS.sound.event("turret", s.x, s.y);
      if (ZS.VillageUI) {
        ZS.VillageUI.toast(ZS.Structs.CAT[kind].name + " marked out");
        ZS.VillageUI.refresh(true);
      }
    }

    upgrade(s) {
      if (s.kind === "wall") {
        if (s.lvl >= 2) return;
        if (!this.done.stonewall) {
          if (ZS.VillageUI) ZS.VillageUI.toast("research stone walls first");
          return;
        }
      }
      const c = this.upgradeCost(s);
      if (s.lvl >= ZS.Structs.CAT[s.kind].lvlMax) return;
      if (!this.canPay(c)) {
        if (ZS.VillageUI) ZS.VillageUI.toast("not enough: " + ZS.VillageUI.costText(c));
        return;
      }
      this.pay(c);
      s.lvl++;
      const f = s.hp / s.maxHp;
      s.maxHp = Math.round(s.maxHp * (s.kind === "wall" ? 2 : 1.35));
      s.hp = Math.max(1, s.maxHp * f);
      this._pop(s.x + s.w / 2, s.y - 6, "level " + s.lvl, "#5a7a3a");
      if (ZS.sound) ZS.sound.event("turret", s.x, s.y);
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
    }

    // pay the timber and stone up front; a repairer will come and use it.
    // Whatever the stores cannot spare yet is set aside as they fill.
    repair(s, quiet) {
      if (s.hp >= s.maxHp) {
        s.want = false;
        return;
      }
      s.want = true;
      const c = this.repairCost(s);
      const w = Math.min(c.w, Math.floor(this.res.wood));
      const st = Math.min(c.s, Math.floor(this.res.stone));
      if (w + st <= 0) {
        if (!quiet && ZS.VillageUI) ZS.VillageUI.toast("no timber or stone to spare just now");
        return;
      }
      this.pay({ w: w, s: st, c: 0 });
      s.mat = { wood: w, stone: st };
      if (!quiet && ZS.VillageUI) {
        ZS.VillageUI.toast(ZS.Structs.CAT[s.kind].name + ": timber set aside");
        ZS.VillageUI.refresh(true);
      }
    }

    demolish(s) {
      const c = ZS.Structs.CAT[s.kind].cost;
      const back = {
        w: Math.floor((c.w || 0) / 2),
        s: Math.floor((c.s || 0) / 2),
        c: Math.floor((c.c || 0) / 2),
      };
      this._add("wood", back.w);
      this._add("stone", back.s);
      this._add("scrap", back.c);
      for (const v of this.villagers()) if (v.tgt && v.tgt.o === s) this._breakOff(v, false);
      ZS.Structs.remove(this.world, this.nav, s);
      this.clearSel();
      if (ZS.VillageUI) ZS.VillageUI.toast("dismantled · +" + ZS.VillageUI.costText(back));
    }

    researchList() {
      const out = [];
      for (const id in RESEARCH) {
        if (this.done[id] || (this.research && this.research.id === id)) continue;
        const def = RESEARCH[id];
        if (def.req && !def.req.every((r) => this.done[r])) continue;
        out.push({ id, def });
      }
      return out;
    }

    startResearch(id) {
      const def = RESEARCH[id];
      if (!def || this.done[id] || this.research) return;
      if (!this.has("shop")) {
        if (ZS.VillageUI) ZS.VillageUI.toast("build a workshop first");
        return;
      }
      if (!this.canPay(def.cost)) {
        if (ZS.VillageUI) ZS.VillageUI.toast("not enough: " + ZS.VillageUI.costText(def.cost));
        return;
      }
      this.pay(def.cost);
      this.research = { id, def, p: 0 };
      if (ZS.VillageUI) {
        ZS.VillageUI.toast("studying " + def.name);
        ZS.VillageUI.refresh(true);
      }
    }

    _tickResearch(dt) {
      const r = this.research;
      if (!r) return;
      if (!this.has("shop")) return; // the workshop burned: the work stops
      const shopLvl = this._first("shop").lvl;
      const rate = (shopLvl >= 2 ? 1.35 : 1) * this._workSpeed({});
      r.p += (dt * rate) / r.def.time;
      if (r.p < 1) return;
      this.done[r.id] = true;
      this.research = null;
      this._recalc();
      this._pop(this.hall.x + this.hall.w / 2, this.hall.y - 10, r.def.name, "#5a7a3a");
      if (ZS.VillageUI) {
        ZS.VillageUI.toast("learned: " + r.def.name);
        ZS.VillageUI.refresh(true);
      }
      if (ZS.sound) ZS.sound.event("v_callout", this.hall.x, this.hall.y);
    }

    /* ================= input ================= */

    tap(agents, world, x, y) {
      if (this.over || this.card) {
        this.dismissCard();
        return;
      }
      if (this.armed) {
        this._placeAt(x, y);
        return;
      }
      let best = null,
        bd = 30 * 30;
      for (const a of this.villagers()) {
        const d = dist2(x, y, a.x, a.y - 8);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      if (best) {
        this.selectVillager(best);
        return;
      }
      const s = ZS.Structs.pick(this.world.buildings, x, y);
      if (s) {
        this.selectStruct(s);
        return;
      }
      this.clearSel();
    }

    pointerMove(x, y) {
      this.hover = { x, y };
    }

    dismissCard() {
      if (this.over) {
        this.reset();
        return;
      }
      if (this.card) {
        this.card = null;
        if (this.phase === "dawn") this._newDay(this.agents);
      }
    }

    setSpeed(n) {
      this.speed = n;
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
    }

    focusHall() {
      const cam = ZS.debug.cam;
      cam.auto = false;
      cam.x = this.hall.x + this.hall.w / 2;
      cam.y = this.hall.y + this.hall.h / 2;
      cam.zoom = ZS.clamp(1.05, cam.minZoom, cam.maxZoom);
      cam.clamp(window.innerWidth, window.innerHeight);
    }

    fitView() {
      const cam = ZS.debug.cam;
      cam.auto = false;
      cam.fit(window.innerWidth, window.innerHeight);
      cam.clamp(window.innerWidth, window.innerHeight);
    }

    toggleSound() {
      this.muted = !this.muted;
      if (ZS.sound) ZS.sound.enabled = !this.muted;
      if (ZS.VillageUI) ZS.VillageUI.toast(this.muted ? "sound off" : "sound on");
    }

    cycleVillager(d) {
      const v = this.villagers();
      if (!v.length) return;
      const cur = this.sel && this.sel.k === "v" ? this.sel.o : null;
      let i = cur ? v.indexOf(cur) + d : 0;
      i = ((i % v.length) + v.length) % v.length;
      this.selectVillager(v[i]);
    }

    /* ================= camera ================= */

    camInterest() {
      const hx = this.hall.x + this.hall.w / 2,
        hy = this.hall.y + this.hall.h / 2;
      let x = hx,
        y = hy,
        zoom = 1.05;
      if (this.phase === "night" || this.phase === "dusk") {
        let zx = 0,
          zy = 0,
          n = 0;
        for (const a of this.agents) {
          if (a.st !== 2 || a.dead) continue;
          zx += a.x;
          zy += a.y;
          n++;
        }
        if (n) {
          x = hx + (zx / n - hx) * 0.55;
          y = hy + (zy / n - hy) * 0.55;
          zoom = 0.95;
        }
      } else {
        // by day, drift toward whoever is working farthest from home
        let fx = 0,
          fy = 0,
          n = 0;
        for (const a of this.villagers()) {
          if (dist2(a.x, a.y, hx, hy) < 260 * 260) continue;
          fx += a.x;
          fy += a.y;
          n++;
        }
        if (n) {
          x = hx + (fx / n - hx) * 0.4;
          y = hy + (fy / n - hy) * 0.4;
        }
      }
      return { x, y, zoom, ease: 2.4 };
    }

    /* ================= words ================= */

    _say(a, txt, dur) {
      if (!txt) return;
      a.say = txt;
      a.sayT = dur || 2;
      a.sayMax = a.sayT;
    }

    _pop(x, y, txt, col) {
      this.pops.push({ x, y, txt, t: 1.3, col: col || "rgba(60,52,40,0.9)" });
      if (this.pops.length > 40) this.pops.shift();
    }

    hud() {
      return {
        title: "",
        stats: "",
        hidden: true,
        hint: this._hint(),
        legend: () => {},
        overlay: () => {
          if (this.over)
            return { card: { title: this.over.title, lines: this.over.lines, lost: true } };
          if (this.card) return { card: this.card };
          if (this.phase === "dusk")
            return {
              main: "night " + this.day,
              sub: "they are coming out of the wood",
              fade: 0.85,
            };
          if (this.phase === "dawn") return null;
          return null;
        },
      };
    }

    _hint() {
      if (this.over) return "click to start again";
      if (this.card) return "click to begin the day";
      if (this.armed)
        return (
          "click the ground to place the " + ZS.Structs.CAT[this.armed].name + " · esc to cancel"
        );
      if (this.phase === "night") return "the dead are in the village · space to pause";
      const bits = [
        "click a villager to give them work",
        "B build",
        "T workshop",
        "H the hall",
        "space pause",
      ];
      return bits.join("  ·  ");
    }

    /* ================= drawing ================= */

    draw(c, a, t) {
      ZS.Figures.render(c, a, t);
    }

    // the ground pass: the rock, the brambles and the wreckage
    drawGround(c, _world, _t) {
      for (const n of this.nodes) {
        if (n.amt <= 0 && n.kind !== "bush") continue;
        const s = n.seed;
        if (n.kind === "rock") {
          const f = 0.55 + 0.45 * (n.amt / n.max);
          ZS.wpoly(
            c,
            [
              { x: n.x - 13, y: n.y + 7 },
              { x: n.x - 8, y: n.y - 8 * f },
              { x: n.x + 5, y: n.y - 11 * f },
              { x: n.x + 13, y: n.y + 1 },
              { x: n.x + 7, y: n.y + 8 },
              { x: n.x - 4, y: n.y + 8 },
            ],
            s,
            0.7,
            true,
          );
          c.fillStyle = "rgba(142,138,128,0.5)";
          c.fill();
          c.strokeStyle = "rgba(78,74,66,0.85)";
          c.lineWidth = 1.4;
          c.stroke();
          c.strokeStyle = "rgba(78,74,66,0.4)";
          c.lineWidth = 0.9;
          ZS.wline(c, n.x - 6, n.y - 2, n.x + 3, n.y + 3, s + 3, 0.5);
        } else if (n.kind === "bush") {
          if (n.amt <= 0) {
            c.strokeStyle = "rgba(120,120,90,0.5)";
            c.lineWidth = 1;
            ZS.wline(c, n.x - 6, n.y, n.x + 6, n.y - 2, s, 0.6);
            continue;
          }
          ZS.wcirc(c, n.x - 5, n.y - 4, 6, s, 1);
          ZS.wcirc(c, n.x + 5, n.y - 5, 5.5, s + 7, 1);
          ZS.wcirc(c, n.x, n.y - 9, 5, s + 13, 1);
          c.fillStyle = "rgba(112,148,72,0.35)";
          c.fill();
          c.strokeStyle = "rgba(74,108,48,0.8)";
          c.lineWidth = 1.2;
          c.stroke();
          c.fillStyle = "rgba(158,58,42,0.85)";
          const b = Math.min(4, n.amt / 3);
          for (let i = 0; i < b; i++) {
            c.beginPath();
            c.arc(n.x - 5 + ZS.hash(s + i) * 11, n.y - 3 + ZS.hash(s + i * 3) * 9, 1.5, 0, 7);
            c.fill();
          }
        } else {
          // a wreck: a cart on its side, a wheel in the air
          c.strokeStyle = "rgba(84,76,66,0.9)";
          c.lineWidth = 1.5;
          ZS.wpoly(
            c,
            [
              { x: n.x - 14, y: n.y + 4 },
              { x: n.x - 6, y: n.y - 10 },
              { x: n.x + 12, y: n.y - 6 },
              { x: n.x + 8, y: n.y + 7 },
            ],
            s,
            0.8,
            true,
          );
          c.fillStyle = "rgba(120,112,98,0.4)";
          c.fill();
          c.stroke();
          ZS.wcirc(c, n.x + 13, n.y + 2, 6, s + 5, 0.8);
          ZS.wline(c, n.x + 13, n.y - 4, n.x + 13, n.y + 8, s + 6, 0.6);
          ZS.wline(c, n.x + 7, n.y + 2, n.x + 19, n.y + 2, s + 7, 0.6);
          c.strokeStyle = "rgba(84,76,66,0.6)";
          c.lineWidth = 1;
          ZS.wline(c, n.x - 12, n.y - 4, n.x + 6, n.y - 8, s + 8, 0.6);
        }
      }
      // the placement ghost
      if (this.armed && this.hover) {
        const kind = this.armed;
        const cat = ZS.Structs.CAT[kind];
        const chk = ZS.Structs.canPlace(this.world, this.nav, kind, this.hover.x, this.hover.y);
        const x = this.hover.x - cat.w / 2,
          y = this.hover.y - cat.h / 2;
        c.save();
        c.globalAlpha = 0.9;
        ZS.wpoly(
          c,
          [
            { x, y },
            { x: x + cat.w, y },
            { x: x + cat.w, y: y + cat.h },
            { x, y: y + cat.h },
          ],
          17,
          1.4,
          true,
        );
        c.fillStyle = chk.ok ? "rgba(112,148,72,0.2)" : "rgba(150,60,40,0.2)";
        c.fill();
        c.strokeStyle = chk.ok ? "rgba(92,122,58,0.95)" : "rgba(150,60,40,0.95)";
        c.lineWidth = 2;
        c.stroke();
        c.restore();
      }
    }

    drawBuildingDecor(c, s, t) {
      ZS.Structs.draw(c, s, t, { night: this._dark(), t });
    }

    _dark() {
      if (this.phase === "day") return 0;
      if (this.phase === "dusk") return ZS.clamp(this.phaseT / BAL.DUSK, 0, 1);
      if (this.phase === "dawn") return ZS.clamp(1 - this.phaseT / BAL.DAWN, 0, 1);
      return 1;
    }

    // the last pass over the world: night, light, rain, marks and numbers
    drawOver(c, world, t) {
      const night = this._dark();
      if (night > 0.01) {
        c.fillStyle =
          "rgba(26,30,48," + (night * (this.season.night ? 0.5 : 0.44)).toFixed(3) + ")";
        c.fillRect(0, 0, world.w, world.h);
        // firelight: the beacons, then the lit windows
        for (const s of world.buildings) ZS.Structs.glow(c, s, t, night);
        c.save();
        c.globalCompositeOperation = "lighter";
        for (const s of world.buildings) {
          if (!s.built || s.ruined) continue;
          const r = s.kind === "hall" ? 46 : 30;
          const g = c.createRadialGradient(
            s.x + s.w / 2,
            s.y + s.h * 0.6,
            4,
            s.x + s.w / 2,
            s.y + s.h * 0.6,
            r,
          );
          g.addColorStop(0, "rgba(224,170,74," + (0.1 * night).toFixed(3) + ")");
          g.addColorStop(1, "rgba(224,170,74,0)");
          c.fillStyle = g;
          c.beginPath();
          c.arc(s.x + s.w / 2, s.y + s.h * 0.6, r, 0, 7);
          c.fill();
        }
        c.restore();
      }
      // rain and storm: slanted sketch streaks over everything
      if (this.weather.id === "rain" || this.weather.id === "storm") {
        const n = this.weather.id === "storm" ? 220 : 120;
        const cam = ZS.debug.cam;
        const vis = cam.visible(window.innerWidth, window.innerHeight, 60);
        c.strokeStyle =
          this.weather.id === "storm" ? "rgba(120,140,170,0.35)" : "rgba(120,140,170,0.25)";
        c.lineWidth = 1;
        for (let i = 0; i < n; i++) {
          const px = vis.x0 + ZS.hash(i * 3.1 + Math.floor(t * 6)) * (vis.x1 - vis.x0);
          const py = vis.y0 + ((ZS.hash(i * 7.7) + t * 0.9) % 1) * (vis.y1 - vis.y0);
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(px - 5, py + 13);
          c.stroke();
        }
      }
      if (this.weather.id === "fog") {
        const cam = ZS.debug.cam;
        const vis = cam.visible(window.innerWidth, window.innerHeight, 60);
        c.fillStyle = "rgba(226,222,208,0.22)";
        c.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, vis.y1 - vis.y0);
      }
      // the selection: a ring round the structure, and the villager's errand
      if (this.sel) {
        if (this.sel.k === "s") {
          const s = this.sel.o;
          c.strokeStyle = "rgba(64,96,52,0.9)";
          c.lineWidth = 2;
          ZS.wpoly(
            c,
            [
              { x: s.x - 4, y: s.y - 4 },
              { x: s.x + s.w + 4, y: s.y - 4 },
              { x: s.x + s.w + 4, y: s.y + s.h + 4 },
              { x: s.x - 4, y: s.y + s.h + 4 },
            ],
            s.seed + 5,
            1.2,
            true,
          );
          c.stroke();
        } else {
          const a = this.sel.o;
          if (a.tgt) {
            c.strokeStyle = "rgba(64,96,52,0.55)";
            c.lineWidth = 1.2;
            ZS.wcirc(c, a.tgt.x, a.tgt.y, 13, a.seed + 7, 1.4);
            ZS.wline(c, a.x, a.y, a.tgt.x, a.tgt.y, a.seed + 8, 1.6);
          }
        }
      }
      // floating numbers
      c.textAlign = "center";
      c.font = 'italic 12px "Segoe Script","Bradley Hand","Comic Sans MS",cursive';
      for (const p of this.pops) {
        c.save();
        c.globalAlpha = ZS.clamp(p.t / 0.6, 0, 1);
        c.fillStyle = p.col;
        c.fillText(p.txt, p.x, p.y);
        c.restore();
      }
      c.textAlign = "left";
    }

    /* ---------- transient effects ---------- */

    drawFX(c, fx) {
      for (const f of fx) {
        if (f.tracer) {
          c.strokeStyle = "rgba(196,150,70,0.85)";
          c.lineWidth = 1.4;
          ZS.wline(c, f.x0, f.y0, f.x1, f.y1, f.seed, 0.8);
        } else if (f.blood) {
          const n = f.blood >= 2 ? 5 : 3;
          c.strokeStyle = "rgba(140,44,32,0.8)";
          c.lineWidth = 1.1;
          for (let i = 0; i < n; i++) {
            const an = ZS.hash(f.seed + i) * 6.283;
            const d = 3 + ZS.hash(f.seed + i * 3) * 8;
            ZS.wline(c, f.x, f.y, f.x + Math.cos(an) * d, f.y + Math.sin(an) * d, f.seed + i, 0.5);
          }
        } else if (f.chip) {
          c.strokeStyle = "rgba(126,96,54,0.8)";
          c.lineWidth = 1.2;
          for (let i = 0; i < 4; i++) {
            const an = ZS.hash(f.seed + i) * 6.283;
            ZS.wline(c, f.x, f.y, f.x + Math.cos(an) * 7, f.y + Math.sin(an) * 5, f.seed + i, 0.4);
          }
        } else if (f.sprout) {
          c.strokeStyle = "rgba(96,132,58,0.9)";
          c.lineWidth = 1.4;
          ZS.wline(c, f.x, f.y, f.x + ZS.jit(f.seed) * 2, f.y - 10, f.seed, 0.7);
          ZS.wline(c, f.x, f.y - 5, f.x - 4, f.y - 8, f.seed + 1, 0.5);
        }
      }
    }
  }

  ScenarioVillage.RESEARCH = RESEARCH;
  ZS.ScenarioVillage = ScenarioVillage;
})();
