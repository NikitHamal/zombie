/* SCENARIO PACK: The Hollow
 *
 * A zombie survival village. There is no player character: there are
 * villagers, and you tell them what to do. By day they chop, quarry, sow,
 * reap, build and repair. At night the dead come out of the treeline and
 * try to pull the village down. Rebuild the ruin, grow it, arm it, and
 * keep the hall standing — when the hall falls, the village falls.
 *
 * It runs on the core (the sketch primitives, the nav grid, the agent
 * pipeline, the camera, the sound cues), implements the scenario contract,
 * and reuses the frozen agent artwork (js/village/figures.js).
 *
 * The page is index.html. Its files:
 *   js/village/figures.js   the frozen figure + the village's layers
 *   js/village/structs.js   19 building kinds, their cost and their art
 *   js/village/art.js       props, livestock, weather, ground decoration
 *   js/village/kin.js       named people: traits, memory, birth, grief
 *   js/village/hazards.js   fire, fever, rats, cold, despair
 *   js/village/overworld.js the valley: eight places, parties, fog, loot
 *   js/village/chronicle.js the ledger and the three save slots
 *   js/village/perf.js      quality tiers, the frame budget, the counters
 *   js/village/ui.js        the paper overlay
 *   this one                the game
 * Design and mechanics: AGENTS.md.
 *
 * Contract (the core's scenario contract, as the village implements it):
 *   terrain · attachStains · init · counts · left · hostile · walkBlocked
 *   maxSpeed · frame · update · maintain · hud · camInterest · tap · draw
 *   drawFX — plus the village's own hooks: drawGround, drawBuildingDecor,
 *   drawOver, drawSprite, extraSprites, pointerDown/Move/Up, and the
 *   timeScale the clock runs at.
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
    START: { wood: 60, stone: 30, food: 90, scrap: 14, cloth: 0, arms: 0 },
    POP0: 4,
    STORE0: 260, // the hall's own corner, per good, before any storehouse
    HOMES0: 4,
    CARRY: 12, // a villager's load
    SPEED: { walk: 82, haul: 74, guard: 92, panic: 138 },
    WORK: { tree: 3.4, rock: 4.2, bush: 2.6, wreck: 3.6, plant: 2.6, tend: 2.2, reap: 3.2 },
    YIELD: { tree: 8, rock: 6, bush: 5, wreck: 4 },
    NODE: { tree: 24, rock: 30, bush: 12, wreck: 18 },
    BUSH_REGROW: 55, // seconds before a picked bush bears again
    TREE_REGROW: 70, // a sapling in the wood, so timber never runs out
    GROW: 46, // seconds a plot needs to ripen, before modifiers
    FARM_YIELD: 10,
    VILL_HP: 60,
    GUARD_HP: 90,
    FIST_DMG: 8,
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
    LEASH: 230, // how far a guard will follow the fight from the line
    INFECT_TIME: 80, // seconds a bite takes to turn someone
    INFECT_CHANCE: 0.13,
    RISE_CHANCE: 0.4, // the dead get up again...
    ZED: {
      walker: { hp: 24, dmg: 5, spd: 76, cd: 1.15, reach: 20, scrap: 1 },
      runner: { hp: 18, dmg: 4, spd: 146, cd: 0.85, reach: 18, scrap: 2 },
      brute: { hp: 110, dmg: 16, spd: 52, cd: 1.6, reach: 26, scrap: 5 },
      // dragged down but not finished: slow, low, and easy to step over —
      // until there are forty of them
      crawler: { hp: 14, dmg: 4, spd: 38, cd: 1.4, reach: 15, scrap: 1 },
      // stands at the back and screams: every scream pulls more of them in
      wailer: { hp: 34, dmg: 3, spd: 58, cd: 1.5, reach: 17, scrap: 3 },
    },
    ZED_HP_DAY: 2.5,
    NIGHT_N: (day) => Math.min(70, 1 + day * 0.95 + Math.floor(Math.pow(day, 1.15) * 0.16)),
    RUNNER_DAY: 5,
    BRUTE_DAY: 9,
    CRAWL_DAY: 3,
    WAIL_DAY: 10,
    WAIL_CALL: 1, // how many a wailer's scream pulls in
    SURGE: [0.42, 0.74], // the two late-night pushes, as a fraction of the night
  };

  // guard weapons, by research tier (the armed look is the frozen one)
  const WEAPONS = {
    club: { name: "clubs", dmg: 12, range: 26, rate: 0.85, melee: true, tool: "club" },
    spear: { name: "spears", dmg: 18, range: 38, rate: 1.05, melee: true, tool: "spear" },
    bow: { name: "bows", dmg: 15, range: 215, rate: 1.1, tool: "bow" },
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
    physic: {
      name: "the physic's chest",
      cost: { w: 20, s: 10, c: 14 },
      time: 45,
      desc: "herbs, instruments, a notebook: +healing, and a bite is a little less final",
    },
    serum1: {
      name: "what the physician saw",
      req: ["physic"],
      cost: { w: 40, c: 30 },
      time: 60,
      desc: "the ledger, read properly: the illness is a thing, and things can be answered",
    },
    serum2: {
      name: "the cold box",
      req: ["serum1"],
      cost: { w: 60, c: 44 },
      time: 75,
      desc: "glass, a cold box, and a sample that is still alive: the shape of a cure",
    },
    serum3: {
      name: "the course",
      req: ["serum2", "medicine"],
      cost: { w: 70, c: 60 },
      time: 120,
      desc: "brew it in a level-two infirmary, and a bite stops being a death sentence",
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
    gunpowder: {
      name: "powder that keeps",
      cost: { s: 50, c: 60 },
      time: 85,
      desc: "muskets and cannon · the village becomes a forge",
      req: ["rifles"],
    },
    mechanised: {
      name: "engines",
      cost: { s: 110, c: 110 },
      time: 110,
      desc: "machine guns, and a tank in the yard · the village becomes a foundry",
      req: ["gunpowder"],
    },
    flight: {
      name: "heavier than air",
      cost: { s: 140, c: 160 },
      time: 130,
      desc: "a machine that leaves the ground · the village becomes an airfield",
      req: ["mechanised"],
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
    douse: "fighting the fire",
    mourn: "at the grave",
    away: "out in the valley",
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

      /* ---------- the newer systems ---------- */
      this.props = []; // carts, barrels, graves, racks (js/village/art.js)
      this.critters = []; // chickens, sheep, dogs, crows, rats
      this.ow = null; // the valley beyond the clearing (js/village/overworld.js)
      this.haz = null; // fire, fever, rats, cold, despair (js/village/hazards.js)
      this.chron = []; // the ledger (js/village/chronicle.js)
      this.away = []; // everybody out on an expedition
      this.alerts = []; // what the overlay is shouting about
      this.fac = null; // the other people out there (js/village/people.js)
      this.cure = null; // the four steps of the cure (js/village/cure.js)
      this.raiders = []; // st === 3: living, hostile, and carrying things off
      this.raidersKilled = 0;
      this.cured = 0; // the plague is done in this valley
      this.grief = 0;
      this.morale = 0.7;
      this.bonus = { farm: 0 }; // things found out there that stay found
      this.winterWood = 0; // the day's burn, for the panel
      this.souls = 0; // candles on the shrine
      this.putDown = 0; // the dead put down, all through the run
      this.drag = null; // a line of barricades being dragged out
      this.seasonI = 0;
      this.army = null; // the field: who is under arms (js/village/army.js)
      this.nat = null; // the world beyond: the nations (js/village/nations.js)
      this._units = []; // today's roll of them, rebuilt each frame
      this.rallying = false; // clicking the ground to place the rally flag
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
          a.sick = p.s || 0;
          if (p.k) {
            const k = p.k;
            a.kin = {
              trait: k[0],
              age: k[1],
              child: !!k[2],
              grow: k[3] || 0,
              morale: k[4],
              mem: k[5] || [],
              kids: k[6] || 0,
              mother: k[7] || null,
              born: 1,
              worked: 0,
              nights: 0,
              kills: 0,
              saved: 0,
            };
          }
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
      // the people: a trait, an age, a temper
      for (const a of agents) {
        if (a.kin) continue;
        a.kin = ZS.Kin.make(Math.random, this.day);
        // the first four are the founders: each takes a house of their own
        if (ZS.Kin) {
          ZS.Kin.adopt(this, a);
          ZS.Kin.note(this, a);
        }
      }
      this._startSystems(s);
      if (ZS.Army) ZS.Army.load(this, s && s.army);
      this._recalc();
    }

    counts() {
      return { n: this.villagers().length };
    }

    left() {
      return 1; // the village stands or falls on its own terms (see _endNight)
    }

    hostile(a) {
      return a.st === 2 || a.st === 3 || (a.st === 4 && a.foe);
    }

    walkBlocked(a) {
      return a.st === 2;
    }

    maxSpeed(a) {
      if (a.st === 2) return a.spd;
      if (a.st === 4) {
        const d = ZS.Units.def(a.unit);
        let sp = d.spd * (0.9 + 0.2 * this.morale);
        if (a.hp < a.maxHp * 0.35) sp *= 0.78;
        if (a.sup <= 0) sp *= 0.8;
        return sp;
      }
      if (a.panic > 0) return BAL.SPEED.panic;
      let s =
        a.job === "guard"
          ? BAL.SPEED.guard
          : a.carry && a.carry.n
            ? BAL.SPEED.haul
            : BAL.SPEED.walk;
      if (ZS.Kin && a.kin) s *= ZS.Kin.speed(a);
      if (a.sick > 0) s *= 0.62; // a fever takes the legs first
      return s;
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
      this._tickSystems(agents, dt);
      // the steward's small looks round, between the dawns
      if (ZS.Autopilot) ZS.Autopilot.tick(this, dt);
      // and the watch: whether the clock can run on for a bit
      if (ZS.Watch) ZS.Watch.tick(this, dt);
      if (ZS.Army && this.army) ZS.Army.tick(this, dt);
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
        const nf = this.nightT / this._nightLen();
        const stage =
          nf < 0.12 ? "scouts" : nf < 0.4 ? "trickle" : nf < 0.72 ? "push" : "stragglers";
        if (stage !== this.stage) {
          this.stage = stage;
          if (stage === "push" && ZS.VillageUI) ZS.VillageUI.toast("here they come");
          if (stage === "stragglers" && ZS.VillageUI)
            ZS.VillageUI.toast("nearly light — the last of them");
        }
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
      const sh = this._shelter();
      // the roll: whoever is standing under arms on our side right now
      if (ZS.Army) {
        const u = this._units;
        u.length = 0;
        for (const a of agents)
          if (a.st === 4 && !a.foe && !a.dead && !ZS.Units.def(a.unit).fly) u.push(a);
      }
      for (const a of agents) {
        if (a.muzzle > 0) a.muzzle = Math.max(0, a.muzzle - dt);
        if (a.panic > 0) a.panic = Math.max(0, a.panic - dt);
        if (a.st !== 0 || a.dead) continue;
        if (a.hp < a.maxHp && this.phase === "day" && this.res.food > 0 && a.mode !== "rest")
          a.hp = Math.min(a.maxHp, a.hp + 1.2 * dt);
        // by night, with a roof over them and the door barred, they mend
        if (
          this.phase === "night" &&
          a.hp < a.maxHp &&
          a.sick <= 0 &&
          dist2(a.x, a.y, sh.x, sh.y) < BAL.SHELTER_R * BAL.SHELTER_R &&
          a.mode !== "fight"
        )
          a.hp = Math.min(a.maxHp, a.hp + 0.9 * dt * (ZS.Kin ? ZS.Kin.heal(a) : 1));
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
      if (!this._hoverBound) this._bindHover();
      for (const b of this.world.buildings) if (b.want && !b.mat && b.hp < b.maxHp) this._topUp(b);
      if (ZS.Figures) ZS.Figures.opt.zoom = ZS.debug && ZS.debug.cam ? ZS.debug.cam.zoom : 1;
      if (this.bellT > 0) this.bellT = Math.max(0, this.bellT - dt);
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
        if (b.workT > 0) b.workT = Math.max(0, b.workT - dt);
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
        if (a.inf <= 0 && !this._fightItOff(a)) this._turn(a);
      }
    }

    /* ================= the night ================= */

    _startNight(called) {
      if (this.phase !== "day" && this.phase !== "dusk") return;
      // the plague is done in this valley: the wood stays quiet
      if (this.cured) {
        this.phase = "night";
        this.nightT = 0;
        this.queue = [];
        this.stage = "quiet";
        if (ZS.VillageUI) ZS.VillageUI.toast("the wood is quiet · nothing is coming tonight");
        return;
      }
      this.phase = "dusk";
      this.phaseT = 0;
      this.nightT = 0;
      const n = Math.round(BAL.NIGHT_N(this.day) * (this.season.night || 1) * (called ? 0.85 : 1));
      // the schedule: most of them trickle in, two pushes late on
      const len = this._nightLen();
      this.queue = [];
      // The shape of a night: two or three drift in early while it is still
      // light enough to watch them come, the trickle through the dark, two
      // pushes in the small hours, and stragglers at first light.
      for (let i = 0; i < n; i++) {
        let t,
          k = "walker";
        const roll = Math.random();
        if (i < Math.min(3, 1 + (this.day > 4 ? 1 : 0) + (this.day > 9 ? 1 : 0))) {
          t = len * (0.03 + Math.random() * 0.1);
          k = "scout";
        } else if (roll < 0.2) t = len * (BAL.SURGE[0] + Math.random() * 0.06);
        else if (roll < 0.34) t = len * (BAL.SURGE[1] + Math.random() * 0.08);
        else if (roll < 0.42) {
          t = len * (0.9 + Math.random() * 0.09);
          k = "straggler";
        } else t = Math.random() * len * 0.8;
        this.queue.push({ t, k });
      }
      this.stage = "scouts";
      this.queue.sort((a, b) => a.t - b.t);
      this.nightLog = { n: 0, killed: 0, lost: [], built: 0, dmg: 0, called: !!called };
      if (ZS.sound) ZS.sound.event("horn", this.hall.x, this.hall.y);
      if (ZS.VillageUI) ZS.VillageUI.toast("night " + this.day + " is coming — get inside");
      for (const a of this.villagers()) this._breakOff(a, true);
    }

    // called early: the player rang the bell
    // the bell. N to ring it.
    ringBell() {
      if (this.over) return;
      if (this.phase === "night" || this.phase === "dusk") {
        this.bellT = 12;
        for (const a of this.villagers()) {
          a.panic = 0;
          if (a.kin) a.kin.morale = Math.min(1, a.kin.morale + 0.05);
        }
        this.fx.push({
          x: this.hall.x + this.hall.w / 2,
          y: this.hall.y - 30,
          t: 1.2,
          wail: 1,
          seed: 5,
        });
        if (ZS.sound) ZS.sound.event("v_bell", this.hall.x, this.hall.y);
        if (ZS.VillageUI) ZS.VillageUI.toast("the bell over the dark — it steadies them");
        return;
      }
      if (this.phase !== "day") return;
      // everyone home, now: work drops where it stands
      let n = 0;
      for (const a of this.villagers()) {
        if (a.st !== 0) continue;
        n++;
        this._breakOff(a, true);
        a.tgt = null;
        a.musterT = 9;
        a.mode = "idle";
      }
      this.bellT = 6;
      this.fx.push({
        x: this.hall.x + this.hall.w / 2,
        y: this.hall.y - 30,
        t: 1.2,
        wail: 1,
        seed: 5,
      });
      if (ZS.sound) ZS.sound.event("v_bell", this.hall.x, this.hall.y);
      if (ZS.VillageUI)
        ZS.VillageUI.toast(
          n ? "the bell — " + n + " of them are coming in" : "the bell rings over an empty green",
        );
    }

    // and the other thing a bell is for: calling the dark down early
    callNight() {
      if (this.phase !== "day") return;
      this._startNight(true);
      if (ZS.VillageUI) ZS.VillageUI.toast("the bell — you called the dark down early");
    }

    _muster(a, dt, t, nav) {
      const sh = this._shelter();
      if (dist2(a.x, a.y, sh.x, sh.y) < 58 * 58) {
        a.vx *= 0.86;
        a.vy *= 0.86;
        return;
      }
      a.wantMove = true;
      ZS.planAndFollow(a, sh, false, this.maxSpeed(a) * 1.15, dt, t, nav);
    }

    _spawnZed(e) {
      const p = (e && e.at) || this._spawnPoint();
      if (!p) return;
      const day = this.day;
      let type = "walker";
      const kind = e && e.k ? e.k : "walker";
      if (kind === "scout")
        type = day >= BAL.RUNNER_DAY && Math.random() < 0.4 ? "runner" : "walker";
      else if (day >= BAL.BRUTE_DAY && Math.random() < 0.16 + day * 0.006) type = "brute";
      else if (day >= BAL.RUNNER_DAY && Math.random() < 0.24 + day * 0.01) type = "runner";
      else if (day >= BAL.CRAWL_DAY && Math.random() < 0.14) type = "crawler";
      if (day >= BAL.WAIL_DAY && Math.random() < 0.05) type = "wailer";
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
        screamT: type === "wailer" ? 3 + Math.random() * 3 : 0,
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
      // a bad night is heard of: an ally may put riders on the road
      if (ZS.Nations && this.nat && (log.lost.length || log.dmg > 220)) ZS.Nations.help(this);
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
      // the dead that were still out there are gone with the light, and so
      // are the Warrens, whatever they are carrying
      for (const a of agents) if (a.st === 2 || a.st === 3) a.gone = true;
      this.raiders.length = 0;
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
      // the people: grief, birth, coming of age
      if (ZS.Kin) ZS.Kin.daily(this);
      // everything else that can go wrong, rolled at dawn
      if (ZS.Hazards && this.haz) ZS.Hazards.daily(this);
      // the army eats before anybody else does
      if (ZS.Army && this.army) ZS.Army.dawn(this);
      // the other people out there: opinions, caravans, demands, raids
      if (ZS.Factions && this.fac) ZS.Factions.daily(this);
      // and the nations beyond them: envoys, wagons, and wars
      if (ZS.Nations && this.nat) ZS.Nations.daily(this);
      // and the cure, if the village has the makings of it
      if (ZS.Cure && this.cure) ZS.Cure.daily(this);
      // the steward: the day's work, thought about once
      if (ZS.Autopilot) ZS.Autopilot.dawn(this);
      // and one thing worth knowing, when its moment has come
      if (ZS.Coach) ZS.Coach.daily(this);
      this._recalc();
      const si = Math.floor((this.day - 1) / 8) % 4;
      if (si !== this.seasonI) {
        this.seasonI = si;
        this.logLine(SEASONS[si].name + " — " + SEASONS[si].desc);
      }
      if (ZS.Chronicle) ZS.Chronicle.autosave(this);
      if (ZS.VillageUI)
        ZS.VillageUI.toast("day " + this.day + " · " + this.season.name + ", " + this.weather.name);
    }

    // the cure is finished: the last night that is not a night
    curedEnding() {
      this.cured = 1;
      if (ZS.Chronicle)
        ZS.Chronicle.add(
          this,
          "the plague is finished in this valley. The hollow goes on.",
          "cure",
        );
      this.card = {
        title: "the last night",
        lines: [
          "the course is poured, and the last of the dead are put down",
          "nothing came out of the wood tonight",
          "",
          "the hollow is yours now — build it, and keep it",
        ],
      };
    }

    _upkeep() {
      let gran = 0;
      for (const b of this.world.buildings)
        if (b.kind === "granary" && b.built && !b.ruined) gran += b.lvl;
      const keep = 1 - Math.min(0.28, gran * 0.09);
      return (
        this.villagers().length *
        BAL.UPKEEP *
        (this.season.upkeep || 1) *
        (this.weather.upkeep || 1) *
        keep
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
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
      } catch {
        /* private browsing, a full disk: the game still plays */
      }
    }

    _load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw);
        return s && (s.v === 1 || s.v === 2) ? s : null;
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

    // the newer systems, all on the village's clock
    _tickSystems(agents, dt) {
      if (ZS.Kin) ZS.Kin.tick(this, dt);
      if (ZS.Hazards && this.haz) ZS.Hazards.tick(this, dt);
      if (ZS.Overworld && this.ow) ZS.Overworld.tick(this.ow, dt, this);
      if (ZS.Art && this.critters.length) {
        const threat = this.phase === "night" || this.phase === "dusk" ? this._zeds(agents) : null;
        ZS.Art.tickCritters(this.critters, dt, this.t, this.nav, threat);
      }
      for (let i = this.alerts.length - 1; i >= 0; i--) {
        this.alerts[i].t -= dt;
        if (this.alerts[i].t <= 0) this.alerts.splice(i, 1);
      }
      // the raid ends when the last of them is down or off the map
      if (ZS.Factions && this.fac && this.fac.raidT && !this.raiders.length) ZS.Factions.over(this);
      let sick = 0;
      for (const a of this.villagers()) if (a.sick > 0) sick++;
      if (this.haz) this.haz.sick = sick;
      // rain, snow, leaves, embers: only in the rectangle you are looking at
      if (ZS.Art) {
        ZS.Art.setWeather(this.weather.id, 0.4);
        const cam = ZS.debug && ZS.debug.cam;
        if (cam) {
          const vw = window.innerWidth || 1280,
            vh = window.innerHeight || 720;
          ZS.Art.tickWeather(dt, this.t, cam.visible(vw, vh, 80), this._env || { night: 0 });
        }
      }
    }

    /* ============== the wider world: the valley, the weather, the people ============== */

    _startSystems(s) {
      this.ow = s && s.ow ? s.ow : ZS.Overworld.create(this.world.seed);
      this.ow.parties = this.ow.parties || [];
      this.haz = ZS.Hazards.create();
      if (s && s.haz) {
        this.haz.rats = s.haz.rats || 0;
        this.haz.despair = s.haz.despair || 0;
        this.haz.cold = s.haz.cold || 0;
        this.haz.feastT = s.haz.feastT || 0;
        this.haz.sick = 0;
      }
      // parties that were out when the record was written come back with it
      if (this.ow && this.ow.parties && this.ow.parties.length) {
        for (const p of this.ow.parties) {
          const mem = [];
          for (const m of p.members || []) {
            const a = this.makeAgent(
              this.hall.x + this.hall.w / 2,
              this.hall.y + this.hall.h / 2,
              0,
            );
            a.name = m.n;
            a.job = m.j;
            a.hp = m.hp || 20;
            a.kin = m.k
              ? {
                  trait: m.k[0],
                  age: m.k[1],
                  child: !!m.k[2],
                  grow: 0,
                  morale: m.k[3],
                  mem: [],
                  kids: 0,
                  born: 1,
                  worked: 0,
                  nights: 0,
                  kills: 0,
                  saved: 0,
                  mother: null,
                }
              : ZS.Kin.make(Math.random, this.day);
            this._dress(a);
            a.away = true;
            a.gone = false;
            this.away.push(a);
            mem.push(a);
          }
          p.members = mem;
          p.scouting = !!p.scouting;
        }
      }
      this.pilot = ZS.Autopilot ? ZS.Autopilot.load(this, s && s.pilot) : null;
      this.coach = ZS.Coach ? ZS.Coach.load(this, s && s.coach) : null;
      this.watch = ZS.Watch ? ZS.Watch.load(this, s && s.watch) : null;
      this.fac = s && s.fac ? s.fac : ZS.Factions.create(this.world.seed);
      if (ZS.Nations) this.nat = ZS.Nations.load(this, s && s.nat);
      this.cure = s && s.cure ? s.cure : ZS.Cure.create();
      this.raiders = []; // a raid in progress is not saved; it ends with the reload
      this.raidersKilled = 0;
      this.cured = (s && s.cured) || 0;
      this.chron = (s && s.chron) || [];
      this.grief = (s && s.grief) || 0;
      this.bonus = (s && s.bonus) || { farm: 0 };
      this.souls = (s && s.souls) || 0;
      this.putDown = (s && s.putDown) || 0;
      this.line = (s && s.line) || []; // the book of the families
      if (s && s.props)
        this.props = s.props.map(([kind, x, y, seed]) => ZS.Art.prop(kind, x, y, seed));
      else if (!this.props.length) this.spawnProps();
      if (s && s.crit)
        this.critters = s.crit.map(([kind, x, y]) => {
          const c = ZS.Art.critter(kind, x, y);
          c.home = { x, y };
          return c;
        });
      else if (!this.critters.length) {
        this.spawnCritters("chicken", 3, this.center.x + 40, this.center.y + 110);
        this.spawnCritters("crow", 2, this.center.x - 150, this.center.y - 120);
        this.spawnCritters("sheep", 2, this.center.x + 220, this.center.y + 40);
      }
      if (!s) this._opening();
      // grass, pebbles, ruts: painted once into the persistent stain layer
      if (ZS.Art && this.stains && !this._deco) {
        this._deco = 1;
        ZS.Art.decorate(
          this.stains,
          this.world,
          this.nav,
          this.center.x,
          this.center.y,
          this.world.seed,
        );
      }
    }

    // the first morning: what you have to do, said once
    _opening() {
      if (this.hall && this.hall.ruined) {
        if (ZS.VillageUI) ZS.VillageUI.toast("the hall is a ruin — mend the roof before dark");
        if (ZS.Chronicle) ZS.Chronicle.add(this, "we came back to the hollow", "life");
      }
    }

    // the furniture of the place, set down once at the start
    spawnProps() {
      const cx = this.center.x,
        cy = this.center.y;
      const put = (kind, dx, dy) => this.addProp(kind, cx + dx, cy + dy);
      put("cart", 128, 118);
      put("barrel", 62, 86);
      put("crate", 100, 92);
      put("sack", 38, 112);
      put("woodpile", 152, 56);
      put("signpost", -176, 44);
      put("banner", -58, 126);
      put("torch", 26, 148);
      put("torch", -144, 116);
      put("logs", -124, -64);
      put("stones", 206, 126);
    }

    addProp(kind, x, y) {
      if (!ZS.Art) return null;
      const p = ZS.Art.prop(kind, x, y, Math.random() * 997);
      this.props.push(p);
      return p;
    }

    spawnCritters(kind, n, x, y) {
      if (!ZS.Art) return;
      for (let i = 0; i < n; i++) {
        const p = this.nav.nearestWalkable(
          x + (Math.random() - 0.5) * 100,
          y + (Math.random() - 0.5) * 80,
          220,
          false,
        );
        if (p) this.critters.push(ZS.Art.critter(kind, p.x, p.y));
      }
    }

    // a structure finished: what comes with it
    onBuilt(b) {
      const cx = b.x + b.w / 2,
        cy = b.y + b.h / 2;
      if (b.kind === "kennel") this.spawnCritters("dog", 2, cx, cy + 30);
      else if (b.kind === "mill") this.spawnCritters("sheep", 2, cx + 60, cy + 40);
      else if (b.kind === "farm") {
        this.addProp("scarecrow", cx - 30, cy + 20);
        this.addProp("hive", cx + 46, cy + 14);
      } else if (b.kind === "granary") {
        this.addProp("sack", cx - 20, cy + 30);
        this.addProp("sack", cx + 16, cy + 34);
      } else if (b.kind === "store") {
        this.addProp("crate", cx - 30, cy + 26);
        this.addProp("barrel", cx + 30, cy + 26);
      } else if (b.kind === "hut") {
        this.addProp("barrel", cx + 34, cy + 22);
      } else if (b.kind === "shrine") {
        b.souls = this.souls || 1;
        this.logLine("the shrine is raised — the village has somewhere to grieve");
      } else if (b.kind === "well") {
        this.addProp("pump", cx + 30, cy + 16);
      } else if (b.kind === "smith") {
        this.logLine("the forge is lit");
      }
      if (ZS.Chronicle) ZS.Chronicle.add(this, ZS.Structs.CAT[b.kind].name + " built", "build");
    }

    /* ---------- the expedition's hooks (see js/village/overworld.js) ---------- */

    // who could be spared: adults at home, the fittest first, guards last
    partyPool(n) {
      const pool = this.villagers().filter((a) => !(a.kin && a.kin.child) && !a.away);
      pool.sort((a, b) => {
        const sa =
          (a.job === "guard" ? -1 : 0) + a.hp / a.maxHp + (a.kin ? a.kin.morale : 0.7) * 0.2;
        const sb =
          (b.job === "guard" ? -1 : 0) + b.hp / b.maxHp + (b.kin ? b.kin.morale : 0.7) * 0.2;
        return sb - sa;
      });
      return pool.slice(0, n);
    }

    sendAway(a) {
      a.away = true;
      const i = this.agents.indexOf(a);
      if (i >= 0) this.agents.splice(i, 1);
      this.away.push(a);
      if (this.sel && this.sel.o === a) this.sel = null;
    }

    bringBack(a, lost, bitten) {
      const i = this.away.indexOf(a);
      if (i >= 0) this.away.splice(i, 1);
      a.away = false;
      if (lost) {
        // they are not coming back
        if (ZS.Kin) ZS.Kin.mourn(this, a);
        if (ZS.Chronicle) ZS.Chronicle.add(this, a.name + " — lost in the valley", "death");
        this.souls++;
        this.grave(a);
        return;
      }
      const p =
        this.nav.nearestWalkable(
          this.hall.x + this.hall.w / 2 + (Math.random() - 0.5) * 140,
          this.hall.y + this.hall.h / 2 + 110,
          240,
          false,
        ) || this.hall;
      a.x = p.x || this.hall.x;
      a.y = p.y || this.hall.y;
      a.vx = 0;
      a.vy = 0;
      a.tgt = null;
      a.mode = "idle";
      a.task = TASK.idle;
      a.path = null;
      a.gx = null;
      a.carry = null;
      a.hp = Math.max(4, a.hp * 0.7);
      if (bitten) {
        a.inf = BAL.INFECT_TIME;
        if (ZS.VillageUI) ZS.VillageUI.toast(a.name + " came home bitten");
      }
      this.agents.push(a);
    }

    weaponTier() {
      const o = WEP_ORDER.indexOf(this.weaponKey ? this.weaponKey() : "club");
      return o < 0 ? 0 : o;
    }

    grantResearch(id) {
      if (this.done[id]) return;
      this.done[id] = true;
      this._recalc();
      if (id === "serum3" && ZS.Cure) ZS.Cure.brewed(this);
      if (ZS.VillageUI) ZS.VillageUI.toast("learned: " + RESEARCH[id].name);
      if (ZS.Chronicle) ZS.Chronicle.add(this, "learned " + RESEARCH[id].name, "note");
    }

    // a party came home (js/village/overworld.js calls this)
    onExpeditionReturn(p, _got) {
      if (ZS.Cure && p && p.site && !p.scouting) ZS.Cure.onReturn(this, p.site);
      // the valley's own line is in the record already (Overworld.say)
    }

    // a new face: from the wood, from a birth, or from the far side of the river
    joinVillager(fromOutside, kinRec) {
      const hx = this.hall.x + this.hall.w / 2,
        hy = this.hall.y + this.hall.h / 2;
      const p = this.nav.nearestWalkable(
        hx + (Math.random() - 0.5) * 120,
        hy + 90 + Math.random() * 60,
        200,
        false,
      ) || { x: hx, y: hy };
      const a = this.makeAgent(p.x, p.y, 0);
      const used = {};
      for (const v of this.agents) if (v.name) used[v.name] = 1;
      let free = null;
      for (let i = 0; i < 10 && !free; i++) {
        const n = NAMES[(Math.random() * NAMES.length) | 0];
        if (!used[n]) free = n;
      }
      if (!free) {
        let i = 2;
        while (used[(free = NAMES[0] + " " + i)]) i++;
      }
      a.name = free;
      a.kin = kinRec || ZS.Kin.make(Math.random, this.day);
      this._dress(a);
      this.agents.push(a);
      if (fromOutside && ZS.Chronicle)
        ZS.Chronicle.add(this, a.name + " joined the village", "note");
      this._recalc();
      return a;
    }

    /* ---------- death, and the record ---------- */

    killVillager(v, cause) {
      if (v.dead) return;
      this._killVillager(v);
      this.souls++;
      this.grave(v);
      if (ZS.Kin) ZS.Kin.mourn(this, v);
      if (ZS.Chronicle) ZS.Chronicle.add(this, v.name + " — " + (cause || "lost"), "death");
      for (const b of this.world.buildings)
        if (b.kind === "shrine" && b.built) b.souls = this.souls;
    }

    // they get a grave, in a row, on the far side of the hall
    grave(v) {
      if (!ZS.Art) return;
      const n = this.props.filter((p) => p.kind === "grave").length;
      const bx = this.center.x - 250 + (n % 6) * 26,
        by = this.center.y + 190 + Math.floor(n / 6) * 22;
      const p = ZS.Art.prop("grave", bx, by, v.seed === undefined ? Math.random() * 997 : v.seed);
      p.who = ZS.Kin ? ZS.Kin.full(v) : v.name;
      if (ZS.Kin) ZS.Kin.bury(this, v);
      this.props.push(p);
    }

    logLine(txt) {
      if (ZS.Chronicle) ZS.Chronicle.add(this, txt, "note");
      if (ZS.VillageUI) ZS.VillageUI.toast(txt);
    }

    // the overlay's shout: fire, fever, cold, despair
    alarm(kind, txt) {
      for (const a of this.alerts)
        if (a.kind === kind) {
          a.txt = txt;
          a.t = 12;
          return;
        }
      this.alerts.push({ kind, txt, t: 12 });
      if (ZS.VillageUI) ZS.VillageUI.toast(txt);
    }

    dayLen() {
      return BAL.DAY_LEN + this._nightLen();
    }

    /* ---------- what the newer buildings do ---------- */

    // the windmill grinds: every level is a quarter more from the harvest
    farmMul() {
      let m = 1 + (this.bonus.farm || 0);
      for (const b of this.world.buildings)
        if (b.kind === "mill" && b.built && !b.ruined) m += 0.25 * b.lvl;
      return m;
    }
    // the smithy sharpens everything, and the guns need one standing
    smithMul() {
      let m = 1;
      for (const b of this.world.buildings)
        if (b.kind === "smith" && b.built && !b.ruined) m += 0.1 * b.lvl;
      return m;
    }
    hasSmith() {
      for (const b of this.world.buildings)
        if (b.kind === "smith" && b.built && !b.ruined && b.lvl >= 1) return true;
      return false;
    }
    // the dogs: they smell the dead before anyone sees them
    dogSight() {
      let m = 1;
      for (const b of this.world.buildings)
        if (b.kind === "kennel" && b.built && !b.ruined) m += 0.18 * b.lvl;
      return m;
    }
    shrineMul() {
      let m = 1;
      for (const b of this.world.buildings)
        if (b.kind === "shrine" && b.built && !b.ruined) m += 0.12;
      return m;
    }

    /* ---------- serialize ---------- */

    serialize() {
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
      return {
        v: 2,
        day: this.day,
        seed: this.world.seed,
        hallHp: this.hall ? Math.round(this.hall.hp) : 0,
        res: this.res,
        done: this.done,
        pop: this.villagers().map((a) => ({
          x: Math.round(a.x),
          y: Math.round(a.y),
          n: a.name,
          j: a.job,
          hp: Math.round(a.hp),
          i: Math.round(a.inf),
          s: a.sick | 0,
          k: a.kin
            ? [
                a.kin.trait,
                Math.round(a.kin.age * 100) / 100,
                a.kin.child ? 1 : 0,
                a.kin.grow | 0,
                Math.round(a.kin.morale * 100) / 100,
                a.kin.mem.slice(-4),
                a.kin.kids | 0,
                a.kin.mother || "",
              ]
            : null,
        })),
        bs,
        nodes: this.nodes.map((n) => [n.kind, Math.round(n.x), Math.round(n.y), Math.round(n.amt)]),
        ow: this.ow
          ? {
              seed: this.ow.seed,
              sites: this.ow.sites,
              // a party in the field goes into the record with its people,
              // so closing the browser does not strand anybody out there
              parties: this.ow.parties.map((p) => ({
                id: p.id,
                site: p.site,
                scouting: p.scouting ? 1 : 0,
                phase: p.phase,
                t: Math.round(p.t),
                total: Math.round(p.total),
                out: Math.round(p.out),
                work: Math.round(p.work),
                danger: p.danger,
                members: p.members.map((a) => ({
                  n: a.name,
                  j: a.job,
                  hp: Math.round(a.hp),
                  k: a.kin ? [a.kin.trait, a.kin.age, a.kin.child ? 1 : 0, a.kin.morale] : null,
                })),
              })),
              next: this.ow.next,
              log: this.ow.log.slice(0, 20),
            }
          : null,
        chron: (this.chron || []).slice(0, 60),
        haz: this.haz
          ? {
              rats: this.haz.rats,
              despair: this.haz.despair,
              cold: this.haz.cold,
              feastT: this.haz.feastT,
            }
          : null,
        grief: Math.round(this.grief * 100) / 100,
        bonus: this.bonus,
        souls: this.souls,
        putDown: this.putDown || 0,
        line: this.line || [],
        props: this.props.map((p) => [
          p.kind,
          Math.round(p.x),
          Math.round(p.y),
          Math.round(p.seed),
        ]),
        crit: this.critters.map((c) => [c.kind, Math.round(c.x), Math.round(c.y)]),
        fac: this.fac,
        cure: this.cure,
        cured: this.cured,
        army: ZS.Army ? ZS.Army.save(this) : null,
        nat: ZS.Nations ? ZS.Nations.save(this) : null,
        pilot: ZS.Autopilot ? ZS.Autopilot.save(this) : null,
        coach: ZS.Coach ? ZS.Coach.save(this) : null,
        watch: ZS.Watch ? ZS.Watch.save(this) : null,
      };
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
                  : a.job === "build" || a.job === "repair" || a.job === "smith"
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
      else if (a.st === 3) this._updateRaider(a, dt, t, grid, nav);
      else if (a.st === 4) ZS.Army.update(this, a, dt, t, grid, nav);
      else if (a.job === "guard") this._updateGuard(a, dt, t, grid, nav);
      else this._updateVillager(a, dt, t, grid, nav);
    }

    // the core lifts the fallen from the field: clear the selection, and
    // make sure the night's tally knows their name
    onDead(a) {
      if (this.sel && this.sel.o === a) this.sel = null;
      // the dead put down, for the run card at the end of it
      if (a.st === 2) this.putDown = (this.putDown || 0) + 1;
      if (a.st !== 0 || !this.nightLog) return;
      if (a.name && this.nightLog.lost.indexOf(a.name) < 0) this.nightLog.lost.push(a.name);
    }

    _updateVillager(a, dt, t, grid, nav) {
      const dark = this.phase === "night" || this.phase === "dusk";
      const inf = this.has("infirm");
      // the bell is ringing: drop it and come in
      if (a.musterT > 0) {
        a.musterT -= dt;
        a.task = "coming in";
        this._muster(a, dt, t, nav);
        return;
      }
      // the bitten run for the infirmary; the wounded stagger there
      if (a.inf > 0 && inf) {
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

    _workSpeed(a) {
      let s = 1;
      if (this.done.tools1) s += 0.3;
      if (this.done.tools2) s += 0.3;
      s *= this.weather.work || 1;
      if (this.res.food <= 0) s *= 0.5;
      s *= this.shrineMul();
      s *= 0.86 + (this.morale === undefined ? 0.6 : this.morale) * 0.28;
      if (a) {
        if (ZS.Kin && a.kin) s *= ZS.Kin.work(a);
        if (a.sick > 0) s *= 0.5;
      }
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
      const str = (s, sub, work, cont) =>
        !s
          ? null // nothing there to work on (a plot with no ground under it)
          : {
              kind: "struct",
              o: s,
              x: s.x + s.w / 2,
              y: s.y + s.h / 2,
              sub,
              work: work || 0,
              cont: !!cont,
            };
      const room = (k) => this.res[k] < this.storeCap(k) - 1;
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
      // a fire outranks every job in the village
      if (this.haz && this.haz.fire.length) {
        let hot = null,
          hd = 1e18;
        for (const f of this.haz.fire) {
          if (!f.s) continue;
          const d = dist2(a.x, a.y, f.s.x + f.s.w / 2, f.s.y + f.s.h / 2);
          if (d < hd) {
            hd = d;
            hot = f.s;
          }
        }
        if (hot) return str(hot, "douse", 0, true);
      }
      // grief: one of them goes and stands at the grave for a while
      if (this.grief > 0.18 && this.props && this.props.length) {
        const grave = this.props.find((p) => p.kind === "grave");
        const already = this.villagers().some((v) => v.tgt && v.tgt.sub === "mourn");
        if (grave && !already) return str(grave, "mourn", 9);
      }
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
      if (job === "smith") {
        // scrap into arms: a forge takes one a time, a foundry takes two
        const fires = this.world.buildings.filter(
          (b) =>
            (b.kind === "smith" || b.kind === "foundry") &&
            b.built &&
            !b.ruined &&
            busy(b) < 2 &&
            this.res.scrap >= (b.kind === "foundry" ? 2 : 1) &&
            this.res.arms < this.storeCap("arms") - 0.5,
        );
        if (fires.length) {
          const b = this._nearest(a, fires);
          return str(b, b.kind === "foundry" ? "cast" : "forge", 0, true);
        }
        // nothing to make it from: go and find some
        const n = room("scrap") ? this._nearestNode(a, "wreck") : null;
        return n ? node(n, "wreck") : null;
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
      const wantW = Math.min(this.storeCap("wood"), 80 + pop * 10);
      const wantS = Math.min(this.storeCap("stone"), 60 + pop * 8);
      const wantC = Math.min(this.storeCap("scrap"), 40 + pop * 6);
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
          this.onBuilt(b);
          a.mode = "idle";
          a.tgt = null;
        }
        return;
      }
      if (tg.sub === "mourn") {
        // they stand there. There is nothing to show for it when it ends.
        a.vx *= 0.86;
        a.vy *= 0.86;
        a.mode = "work";
        a.task = TASK.mourn;
        a.workT += dt * sp;
        if (a.workT < tg.work) return;
        a.workT = 0;
        a.mode = "idle";
        a.tgt = null;
        return;
      }
      if (tg.sub === "douse") {
        const b = tg.o;
        if (!b || !b.burning) {
          a.mode = "idle";
          a.tgt = null;
          return;
        }
        // a bucket from the well, over and over. The fire gives way because
        // hazards.js counts how many hands are on it.
        a.swing += dt * 14;
        if (Math.random() < dt * 1.4)
          this.fx.push({
            x: b.x + b.w / 2,
            y: b.y + 8,
            t: 0.25,
            splash: 1,
            seed: a.seed + this.fx.length,
          });
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
      if (tg.sub === "forge" || tg.sub === "cast") {
        const b = tg.o;
        const take = tg.sub === "cast" ? 2 : 1;
        const make = tg.sub === "cast" ? 3 : 1;
        const room = Math.floor(this.storeCap("arms") - this.res.arms);
        if (!b.built || b.ruined || this.res.scrap < take || room < 1) {
          a.mode = "idle";
          a.tgt = null;
          return;
        }
        b.workT = 1.2; // the fire is up: sparks, and the pour glows
        a.workT += dt * sp;
        if (a.workT < (tg.sub === "cast" ? 3.4 : 4.6)) return;
        a.workT = 0;
        this.res.scrap -= take;
        const got = this._add("arms", make);
        if (!got) {
          this.res.scrap += take;
          a.mode = "idle";
          a.tgt = null;
          return;
        }
        this._pop(b.x + b.w / 2, b.y, "+" + got + " arms", "#6f7681");
        if (Math.random() < 0.25)
          this.fx.push({ x: b.x + b.w / 2, y: b.y + 6, t: 0.4, chip: 1, seed: a.seed });
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
      if (this.done.spears) w = "spear";
      if (this.done.bows) w = "bow";
      // powder and shot need a forge and an anvil to keep them in order
      if (this.hasSmith()) {
        if (this.done.rifles) w = "rifle";
        if (this.done.shotguns) w = "shotgun";
        if (this.done.smgs) w = "smg";
      }
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

    // is there a lit beacon near this spot? the dead will not come to it
    lightAt(x, y) {
      for (const s of this.world.buildings) {
        if (s.kind !== "beacon" || !s.built || s.ruined || s.lit === false) continue;
        const dx = s.x + s.w / 2 - x,
          dy = s.y + s.h / 2 - y;
        if (dx * dx + dy * dy < 165 * 165) return true;
      }
      return false;
    }

    _sight(a) {
      let s = BAL.GUARD_SIGHT * (this.weather.sight || 1);
      for (const b of this.world.buildings)
        if (b.kind === "tower" && b.built && !b.ruined && ZS.Structs.dist(b, a.x, a.y) < 200) {
          s *= 1.35;
          break;
        }
      if (this.done.towers2) s *= 1.4;
      s *= this.dogSight();
      return s;
    }

    _updateGuard(a, dt, t, grid, nav) {
      // badly hurt: fall back through the door and let somebody else have
      // the wall. A dead guard holds nothing.
      if (a.hp < a.maxHp * 0.32) {
        a.task = TASK.flee;
        a.mode = "seek";
        a.panic = Math.max(a.panic, 0.6);
        a.wantMove = true;
        ZS.planAndFollow(a, this._shelter(), false, this.maxSpeed(a) * 1.1, dt, t, nav);
        if (a.sayT <= 0 && Math.random() < dt * 0.4) this._say(a, "I'm hurt!", 1.4);
        return;
      }
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
      const sh = this._shelter();
      const home = this.has("post") || this.has("tower") ? this._shield() : sh;
      // there is a line, and a guard does not leave it
      if (Math.hypot(a.x - home.x, a.y - home.y) > BAL.LEASH) {
        a.task = TASK.patrol;
        a.wantMove = true;
        ZS.planAndFollow(a, home, false, BAL.SPEED.guard, dt, t, nav);
        return;
      }
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
      const mul =
        this.smithMul() *
        (ZS.Kin ? ZS.Kin.fight(a) : 1) *
        (this.bellT > 0 && this.phase !== "day" ? 1.25 : 1);
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
      for (let i = 0; i < shots; i++) this._hitZombie(a, z, (w.dmg / (w.pellets ? 1.6 : 1)) * mul);
    }

    /* ---------- other people (js/village/people.js) ---------- */

    // they come in from the treeline like anybody else, and they are not
    // the dead: they want the granary, and they want to go home
    spawnRaiders(n) {
      const B = ZS.Factions.BAL;
      for (let i = 0; i < n; i++) {
        const p = this._spawnPoint();
        if (!p) return;
        const a = this.makeAgent(p.x, p.y, 3);
        a.hp = B.RAID_HP;
        a.maxHp = B.RAID_HP;
        a.job = "raider";
        a.tool = "club";
        a.atkT = 0;
        a.stealT = 0;
        a.fleeing = 0;
        a.name = null;
        this.agents.push(a);
        this.raiders.push(a);
      }
    }

    _updateRaider(a, dt, t, grid, nav) {
      const B = ZS.Factions.BAL;
      a.atkT -= dt;
      // hurt enough: drop it and run for the road
      if (!a.fleeing && a.hp < a.maxHp * B.FLEE_AT) {
        a.fleeing = 1;
        this._pop(a.x, a.y - 26, "running", "#a04030");
      }
      if (a.fleeing || (a.carry && a.carry.n)) {
        const edge = this._edgeFor(a);
        a.wantMove = true;
        ZS.planAndFollow(a, edge, false, B.RAID_SPD, dt, t, nav);
        if (this._offMap(a)) {
          if (a.carry) ZS.Factions.escaped(this, a);
          a.gone = true;
          this._dropRaider(a);
        }
        return;
      }
      // somebody within reach: a club is not a bite, but it ends the same
      const reach = B.RAID_REACH + 14;
      const v = this._nearestPrey(a, reach, grid);
      if (v && a.atkT <= 0) {
        a.atkT = B.RAID_CD;
        a.swing = 0;
        a.a = Math.atan2(v.y - a.y, v.x - a.x);
        this._wound(v, B.RAID_DMG, a);
        return;
      }
      // nothing in the way: the granary, then the road
      const box = this._lootTarget(a);
      if (!box) {
        a.fleeing = 1;
        return;
      }
      if (dist2(a.x, a.y, box.x, box.y) < 52 * 52) {
        a.stealT += dt;
        a.a = Math.atan2(box.y - a.y, box.x - a.x);
        if (a.stealT >= B.STEAL_T) {
          a.stealT = 0;
          const kind =
            this.res.food > 14
              ? "food"
              : this.res.scrap > 10
                ? "scrap"
                : this.res.wood > 10
                  ? "wood"
                  : null;
          if (kind) {
            const n = Math.min(B.STEAL, Math.floor(this.res[kind]));
            if (n > 0) {
              this.res[kind] -= n;
              a.carry = { kind, n };
              this._pop(a.x, a.y - 24, "-" + n + " " + kind, "#a04030");
            }
          }
          a.fleeing = 1;
        }
        return;
      }
      a.wantMove = true;
      ZS.planAndFollow(a, box, false, B.RAID_SPD, dt, t, nav);
    }

    // the nearest living person who is not one of them (the line counts)
    _nearestPrey(a, r, grid) {
      let best = null,
        bd = r * r;
      const f = (o) => {
        if (o.dead || o.gone) return;
        if (o.st !== 0 && !(o.st === 4 && !o.foe)) return;
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

    // where the food is kept
    _lootTarget(a) {
      let best = null,
        bd = 1e18;
      for (const b of this.world.buildings) {
        if (!b.built || b.ruined) continue;
        if (b.kind !== "store" && b.kind !== "granary" && b.kind !== "hall") continue;
        const x = b.x + b.w / 2,
          y = b.y + b.h / 2;
        const d = dist2(a.x, a.y, x, y);
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
      return best || { x: this.hall.x + this.hall.w / 2, y: this.hall.y + this.hall.h / 2 };
    }

    // the shortest way off the map from here
    _edgeFor(a) {
      const w = this.world;
      const dl = a.x,
        dr = w.w - a.x,
        du = a.y,
        dd = w.h - a.y;
      const m = Math.min(dl, dr, du, dd);
      if (m === dl) return { x: -20, y: a.y };
      if (m === dr) return { x: w.w + 20, y: a.y };
      if (m === du) return { x: a.x, y: -20 };
      return { x: a.x, y: w.h + 20 };
    }

    _offMap(a) {
      const w = this.world;
      return a.x < 24 || a.y < 24 || a.x > w.w - 24 || a.y > w.h - 24;
    }

    _dropRaider(a) {
      const i = this.raiders.indexOf(a);
      if (i >= 0) this.raiders.splice(i, 1);
    }

    _killRaider(a, by) {
      if (a.counted) return;
      a.counted = 1;
      this._dropRaider(a);
      this.raidersKilled++;
      if (this.stains) this.stains.corpse(a);
      if (ZS.Factions) ZS.Factions.killed(this);
      if (by && by.st === 0) {
        if (by.kin) {
          by.kin.kills++;
          by.kin.morale = Math.min(1, by.kin.morale + 0.03);
        }
        this._pop(by.x, by.y - 30, "down", "#5a7a3a");
        if (ZS.sound) ZS.sound.event("v_callout", by.x, by.y);
      }
      if (ZS.Chronicle)
        ZS.Chronicle.add(this, "one of the Warrens will not be going home", "people");
    }

    // a club, a knife, a fist: it hurts, but it does not spread
    _wound(v, dmg, by) {
      if (v.dead) return;
      v.hp -= dmg;
      v.flash = 0.3;
      v.panic = Math.max(v.panic, 2.6);
      this.fx.push({ x: v.x, y: v.y - 8, t: 0.3, blood: 2, seed: v.seed });
      if (this.stains) this.stains.splat(v.x, v.y + 2, "blood", v.seed + Math.random() * 99);
      if (ZS.sound) ZS.sound.event("v_gasp", v.x, v.y);
      this._pop(v.x, v.y - 28, "-" + Math.round(dmg), "#a04030");
      if (v.hp <= 0) this.killVillager(v, "killed by the Warrens");
      else if (ZS.Kin && v.kin && by) ZS.Kin.remember(v, "the Warrens set on " + v.name);
    }

    /* ---------- the dead ---------- */

    _nearestZed(a, r, grid) {
      let best = null,
        bd = r * r;
      const f = (o) => {
        if ((o.st !== 2 && o.st !== 3) || o.dead || o.gone || o.flee) return;
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
      const folk = this._unt || (this._unt = []);
      folk.length = 0;
      for (const v of this.villagers()) folk.push(v);
      if (this._units) for (const v of this._units) folk.push(v);
      for (const v of folk) {
        const d = dist2(a.x, a.y, v.x, v.y);
        if (d > sight * sight || d >= bd) continue;
        if (!nav.los(a.x, a.y, v.x, v.y, true)) continue;
        // somebody pressed up against the hall in the dark keeps their head
        // down — they are only found when the dead are nearly on them
        // pressed up against the hall in the dark, with the door barred:
        // they are only found when the dead are nearly on them
        if (dist2(v.x, v.y, sh.x, sh.y) < 108 * 108 && d > 74 * 74) continue;
        bd = d;
        prey = v;
      }
      // ...but the door is barred. Whoever is pressed up against the hall
      // is behind it, and the dead have to go through the timber first.
      const hall = this.hall;
      const barred = hall && hall.built && !hall.ruined && hall.hp > hall.maxHp * 0.28;
      if (prey && barred && dist2(prey.x, prey.y, sh.x, sh.y) < 104 * 104) prey = null;
      // they always know where the hall is: the light, the smoke, the noise
      const goal = prey || { x: this.hall.x + this.hall.w / 2, y: this.hall.y + this.hall.h / 2 };
      const d = Math.hypot(goal.x - a.x, goal.y - a.y);
      a.a = Math.atan2(goal.y - a.y, goal.x - a.x);
      if (d > (prey ? 16 : 40)) {
        a.wantMove = true;
        // firelight: they still come, but slower, and they hate every step
        const shy = this.lightAt(a.x, a.y) ? 0.62 : 1;
        ZS.planAndFollow(a, goal, true, a.spd * shy, dt, t, nav);
      }
      // what stands in the way gets pulled at
      if ((a.stuckT > 0.8 || d < 44) && !prey) this._gnaw(a, dt);
      else if (a.stuckT > 0.8) this._gnaw(a, dt);
      // a wailer keeps its distance and screams: every scream brings more
      if (a.zType === "wailer") {
        a.screamT -= dt;
        if (prey && d < 200) {
          a.a = Math.atan2(a.y - goal.y, a.x - goal.x);
          a.vx += Math.cos(a.a) * a.spd * dt * 2;
          a.vy += Math.sin(a.a) * a.spd * dt * 2;
        }
        if (a.screamT <= 0 && (a.screams || 0) < 3) {
          a.screamT = 7 + Math.random() * 4;
          a.screams = (a.screams || 0) + 1;
          for (let i = 0; i < BAL.WAIL_CALL; i++) {
            const q = this.nav.nearestWalkable(
              a.x + (Math.random() - 0.5) * 170,
              a.y + (Math.random() - 0.5) * 170,
              220,
              true,
            );
            if (q) this._spawnZed({ k: "walker", at: q });
          }
          this.fx.push({ x: a.x, y: a.y - 16, t: 0.7, wail: 1, seed: a.seed });
          if (ZS.sound) ZS.sound.event("v_shout", a.x, a.y);
          if (ZS.VillageUI) ZS.VillageUI.toast("something out there is screaming");
        }
        return;
      }
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
      // plate and padding: what is under arms does not catch the plague
      if (v.st === 4) {
        if (v.hp <= 0) v.dead = true;
        return;
      }
      if (v.hp <= 0) {
        this.killVillager(v, "taken by the dead");
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
      if (z.st === 3) return this._killRaider(z, a);
      if (this.stains) this.stains.corpse(z);
      if (this.nightLog) this.nightLog.killed++;
      const sc = BAL.ZED[z.zType].scrap;
      if (sc) {
        const got = this._add("scrap", sc);
        if (got) this._pop(z.x, z.y - 18, "+" + got + " scrap", "#6f7681");
      }
      if (a && a.st === 0) {
        if (a.kin) {
          a.kin.kills++;
          a.kin.morale = Math.min(1, a.kin.morale + 0.02);
        }
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

    // Most bites kill. Some do not — and the village remembers it either way.
    _fightItOff(a) {
      const inf = this._first("infirm");
      if (inf && dist2(a.x, a.y, inf.x + inf.w / 2, inf.y + inf.h / 2) < 80 * 80) {
        a.inf = 0;
        a.hp = Math.max(8, a.maxHp * 0.35);
        this._pop(a.x, a.y - 26, "pulled through", "#5a7a3a");
        if (ZS.Chronicle) ZS.Chronicle.add(this, a.name + " — pulled through", "life");
        return true;
      }
      let chance = 0.4 + (this.done.medicine ? 0.25 : 0);
      if (a.kin && a.kin.trait === "steady") chance += 0.15;
      if (ZS.Kin && a.kin) chance += (ZS.Kin.hp(a) - 1) * 0.3;
      if (Math.random() < chance) {
        a.inf = 0;
        a.hp = Math.max(6, a.hp * 0.3);
        this._pop(a.x, a.y - 26, "beat the fever", "#5a7a3a");
        if (ZS.Chronicle) ZS.Chronicle.add(this, a.name + " — beat the bite", "life");
        if (ZS.VillageUI) ZS.VillageUI.toast(a.name + " beat the bite — but only just");
        return true;
      }
      return false;
    }

    // a bite that runs its course
    _turn(v) {
      v.dead = true;
      this.souls++;
      this.grave(v);
      if (ZS.Kin) ZS.Kin.mourn(this, v);
      if (ZS.Chronicle) ZS.Chronicle.add(this, v.name + " — turned", "death");
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
      const raised = this.world.buildings.filter((b) => b.built && !b.ruined).length;
      const lines = [
        "the village lasted " + this.day + (this.day === 1 ? " day" : " days"),
        "souls lost: " + (this.souls || 0) + " · dead put down: " + (this.putDown || 0),
        "raised: " +
          raised +
          " buildings · " +
          Object.keys(this.done || {}).length +
          " things learned",
        "walls standing: " +
          this.world.buildings.filter((b) => b.kind === "wall" && b.built).length,
      ];
      if (this.army && (this.army.kills || this.army.trained))
        lines.push(
          "the field: " +
            (this.army.trained || 0) +
            " trained · " +
            (this.army.kills || 0) +
            " of theirs put down · " +
            (this.army.lost || 0) +
            " lost",
        );
      if (this.cured) lines.push("and the plague was ended, in the end");
      // and the last of the ledger, so the run reads like a run
      for (const e of (this.chron || []).slice(0, 3)) lines.push("day " + e.day + " — " + e.txt);
      lines.push("it starts again from the ruin");
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
        this.res.wood >= (c.w || 0) &&
        this.res.stone >= (c.s || 0) &&
        this.res.scrap >= (c.c || 0) &&
        this.res.arms >= (c.a || 0)
      );
    }

    pay(c) {
      this.res.wood -= c.w || 0;
      this.res.stone -= c.s || 0;
      this.res.scrap -= c.c || 0;
      this.res.arms -= c.a || 0;
    }

    _add(kind, n) {
      const room = Math.max(0, this.storeCap(kind) - this.res[kind]);
      const got = Math.min(n, room);
      this.res[kind] += got;
      return got;
    }

    // how much of any one good the village can hold (food also keeps in a
    // granary, and better than it keeps anywhere else)
    storeCap(kind) {
      let c = BAL.STORE0 + (this.hall.lvl - 1) * 140;
      for (const b of this.world.buildings) {
        if (!b.built || b.ruined) continue;
        if (b.kind === "store") c += 150 * b.lvl;
        else if (b.kind === "granary" && kind === "food") c += 220 * b.lvl;
        else if (b.kind === "barracks" && kind === "arms") c += 40 * b.lvl;
        else if (b.kind === "foundry" && kind === "arms") c += 90 * b.lvl;
      }
      // arms are kept in a rack, not a shed: half of what the stores hold
      if (kind === "arms") c = Math.round(c * 0.5);
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
      let c = 4;
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

    setJob(a, job, quiet) {
      if (job === "guard" && a.job !== "guard" && this.guards().length >= this.guardCap()) {
        if (!quiet && ZS.VillageUI) ZS.VillageUI.toast("no room in the guard — build a guard post");
        return;
      }
      a.job = job;
      this._dress(a);
      this._breakOff(a, false);
      // a hand set by the player is their own until the next dawn
      if (!quiet) a.hand = this.day;
      if (!quiet && ZS.VillageUI) ZS.VillageUI.refresh(true);
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
      a.kin = ZS.Kin.make(Math.random, this.day);
      if (ZS.Kin) {
        ZS.Kin.adopt(this, a);
        ZS.Kin.note(this, a);
      }
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

    openWorld() {
      this.mode = "world";
      this.sel = null;
    }

    openChron() {
      this.mode = "chron";
      this.sel = null;
    }

    openVillagers() {
      this.mode = "villagers";
      this.armed = null;
    }

    openArmy() {
      this.mode = "army";
      this.sel = null;
      this.armed = null;
    }

    openNations() {
      this.mode = "nations";
      this.sel = null;
      this.armed = null;
    }

    cancelMode() {
      this.mode = null;
      this.armed = null;
      this.rallying = false;
    }

    clearSel() {
      if (this.sel) {
        if (this.sel.k === "v") this.sel.o.sel = false;
        else if (this.sel.k === "u" && ZS.Army) for (const u of ZS.Army.units(this)) u.sel = false;
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

    selectUnit(a) {
      this.clearSel();
      this.sel = { k: "u", o: a };
      for (const u of ZS.Army.units(this)) u.sel = u === a;
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
    }

    unitByUid(uid) {
      for (const a of ZS.Army.units(this)) if (a.uid === +uid) return a;
      return null;
    }

    armBuild(kind) {
      this.drag = null;
      const cat = ZS.Structs.CAT[kind];
      if (cat && cat.age && ZS.Ages && !ZS.Ages.at(this, cat.age)) {
        if (ZS.VillageUI)
          ZS.VillageUI.toast("not until the village is " + ZS.Ages.def(cat.age).name);
        return;
      }
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

    _placeAt(x, y, quiet) {
      const kind = this.armed;
      const chk = ZS.Structs.canPlace(this.world, this.nav, kind, x, y);
      if (!chk.ok) {
        if (!quiet && ZS.VillageUI) ZS.VillageUI.toast(chk.err);
        return false;
      }
      const cost = this.buildCost(kind);
      if (!this.canPay(cost)) {
        if (!quiet && ZS.VillageUI)
          ZS.VillageUI.toast("not enough: " + ZS.VillageUI.costText(cost));
        return false;
      }
      this.pay(cost);
      const r = ZS.Structs.place(this.world, this.nav, kind, x, y, { built: false, prog: 0 });
      if (!r.ok) return false;
      const s = r.s;
      s.hp = Math.round(s.maxHp * 0.12);
      if (kind === "wall" && this.done.stonewall) {
        s.lvl = 2;
        s.maxHp = Math.round(s.maxHp * 2);
        s.hp = s.maxHp * 0.12;
      }
      if (!quiet) {
        if (ZS.sound) ZS.sound.event("turret", s.x, s.y);
        if (ZS.VillageUI) {
          ZS.VillageUI.toast(ZS.Structs.CAT[kind].name + " marked out");
          ZS.VillageUI.refresh(true);
        }
      }
      return true;
    }

    /* ---------- pointing at the ground ---------- */

    // a site is armed: the gesture is ours, so the camera does not pan
    pointerDown(x, y) {
      if (this.rallying) {
        this.drag = { x0: x, y0: y, x, y, line: false };
        this._hoverAt(x, y);
        return true;
      }
      if (!this.armed) return false;
      const linish = this.armed === "barricade" || this.armed === "wall";
      this.drag = { x0: x, y0: y, x, y, line: linish };
      this._hoverAt(x, y);
      return true;
    }

    pointerMove(x, y) {
      this._hoverAt(x, y);
      if (this.drag) {
        this.drag.x = x;
        this.drag.y = y;
      }
    }

    pointerUp(x, y) {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      d.x = x;
      d.y = y;
      if (this.rallying) {
        this.rallying = false;
        if (ZS.Army) ZS.Army.command(this, x, y);
        return;
      }
      if (d.line && Math.hypot(x - d.x0, y - d.y0) > 40) this._placeLine(this.armed, d);
      else this._placeAt(x, y);
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

    // what the workshop can study: what it has the learning for, and what
    // the village has actually found out there
    researchList() {
      const out = [];
      for (const id in RESEARCH) {
        if (this.done[id] || (this.research && this.research.id === id)) continue;
        const def = RESEARCH[id];
        if (def.req && !def.req.every((r) => this.done[r])) continue;
        if (ZS.Cure && !ZS.Cure.gate(this, id).ok) continue;
        out.push({ id, def });
      }
      return out;
    }

    // and why the thing you cannot study is grey: for the workshop panel
    researchLocked() {
      const out = [];
      if (!ZS.Cure) return out;
      for (const id in RESEARCH) {
        if (this.done[id] || (this.research && this.research.id === id)) continue;
        const def = RESEARCH[id];
        if (def.req && !def.req.every((r) => this.done[r])) continue;
        const gate = ZS.Cure.gate(this, id);
        if (!gate.ok) out.push({ id, def, err: gate.err });
      }
      return out;
    }

    startResearch(id) {
      const def = RESEARCH[id];
      if (!def || this.done[id] || this.research) return;
      if (ZS.Cure) {
        const gate = ZS.Cure.gate(this, id);
        if (!gate.ok) {
          if (ZS.VillageUI) ZS.VillageUI.toast(gate.err);
          return;
        }
      }
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
      if (r.id === "serum3" && ZS.Cure) ZS.Cure.brewed(this);
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
      // the army takes its orders from a click on the ground
      if (this.rallying) {
        this.rallying = false;
        if (ZS.Army) ZS.Army.command(this, x, y);
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
      if (!best && this.agents) {
        for (const a of this.agents) {
          if (a.st !== 4 || a.dead) continue;
          const d = dist2(x, y, a.x, a.y - 12);
          if (d < bd) {
            bd = d;
            best = a;
          }
        }
      }
      if (best) {
        if (best.st === 4) this.selectUnit(best);
        else this.selectVillager(best);
        return;
      }
      const s = ZS.Structs.pick(this.world.buildings, x, y);
      if (s) {
        this.selectStruct(s);
        return;
      }
      this.clearSel();
    }

    _hoverAt(x, y) {
      if (!this.hover) this.hover = { x: 0, y: 0 };
      this.hover.x = x;
      this.hover.y = y;
    }

    _bindHover() {
      this._hoverBound = 1;
      const cv = document.getElementById("c");
      if (!cv) return;
      const at = (e) => {
        const cam = ZS.debug && ZS.debug.cam;
        if (!cam) return;
        const p = cam.toWorld(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
        this._hoverAt(p.x, p.y);
      };
      cv.addEventListener("pointermove", at, { passive: true });
      cv.addEventListener("pointerleave", () => (this.hover = null));
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

    villagerByUid(uid) {
      for (const a of this.villagers()) if (a.uid === +uid) return a;
      return null;
    }

    // bring somebody into view without dragging the camera off the village
    focusOn(x, y) {
      const cam = ZS.debug.cam;
      cam.auto = false;
      cam.x = x;
      cam.y = y;
      cam.clamp(window.innerWidth, window.innerHeight);
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

    camInterest(_dt) {
      // watching: whatever is happening, before anything else
      if (ZS.Watch && ZS.Watch.on(this)) {
        const p = ZS.Watch.point(this);
        if (p) return { x: p.x, y: p.y, zoom: p.zoom, ease: ZS.Watch.BAL.EASE };
      }
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
          if (this.phase === "night") {
            const st = this.stage;
            const sub =
              st === "scouts"
                ? "one or two at the treeline"
                : st === "trickle"
                  ? "they are filtering in"
                  : st === "push"
                    ? "the push — all of them at once"
                    : "first light · the stragglers";
            return { main: "night " + this.day, sub, fade: 0.34 };
          }
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
      const lesson = ZS.Coach ? ZS.Coach.line(this) : null;
      if (lesson) return lesson;
      const bits = ["V the roster", "B build", "T workshop", "H the hall", "space pause"];
      return bits.join("  ·  ");
    }

    /* ================= drawing ================= */

    draw(c, a, t) {
      if (a.st === 4) ZS.Units.render(c, a, t);
      else ZS.Figures.render(c, a, t);
    }

    // the ground pass: the rock, the brambles and the wreckage
    drawGround(c, _world, t) {
      this._env = { night: this._dark() };
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
      // where the army has been told to stand
      if (ZS.Army && this.army) ZS.Army.drawFlag(c, this, t);
      // the placement ghost: the site itself, drawn in the sketch hand, so
      // what sits under the cursor is what the builders will raise
      if (this.armed && this.hover) {
        const kind = this.armed;
        const line = this.drag && this.drag.line ? this._lineSpots(kind, this.drag) : null;
        if (line) {
          for (const sp of line) this._ghostAt(c, kind, sp.x, sp.y, t, sp.label);
        } else this._ghostAt(c, kind, this.hover.x, this.hover.y, t, null);
      }
    }

    // one ghost: the building itself, drawn where it would stand
    _ghostAt(c, kind, x, y, t, label) {
      const cat = ZS.Structs.CAT[kind];
      const chk = ZS.Structs.canPlace(this.world, this.nav, kind, x, y);
      const g =
        this._ghost ||
        (this._ghost = {
          lvl: 1,
          built: false,
          ruined: false,
          prog: 0,
          seed: 3,
          hp: 1,
          maxHp: 1,
          plot: null,
          kind: kind,
          x: 0,
          y: 0,
          w: 0,
          h: 0,
        });
      g.kind = kind;
      g.w = cat.w;
      g.h = cat.h;
      g.x = x - cat.w / 2;
      g.y = y - cat.h / 2;
      const cost = ZS.Structs.CAT[kind].cost;
      let err = label;
      if (err === undefined) {
        err = !chk.ok
          ? chk.err || "it will not go here"
          : !this.canPay(cost)
            ? "not enough: " + ZS.VillageUI.costText(cost)
            : null;
      }
      const ok = !err;
      c.save();
      c.globalAlpha = 0.55;
      ZS.Structs.draw(c, g, t, { night: 0, t: t });
      c.restore();
      c.save();
      // the footprint: green where it may stand, red where it may not
      ZS.wpoly(
        c,
        [
          { x: g.x, y: g.y },
          { x: g.x + cat.w, y: g.y },
          { x: g.x + cat.w, y: g.y + cat.h },
          { x: g.x, y: g.y + cat.h },
        ],
        17,
        1.3,
        true,
      );
      c.fillStyle = ok ? "rgba(112,148,72,0.16)" : "rgba(150,60,40,0.18)";
      c.fill();
      c.strokeStyle = ok ? "rgba(92,122,58,0.9)" : "rgba(150,60,40,0.9)";
      c.lineWidth = 1.8;
      c.stroke();
      // the price, or the reason it cannot stand here
      c.font = 'italic 11px "Segoe Script","Bradley Hand","Comic Sans MS",cursive';
      c.textAlign = "center";
      c.fillStyle = ok ? "rgba(64,84,44,0.92)" : "rgba(150,60,40,0.92)";
      c.fillText(ok ? ZS.VillageUI.costText(cost) : err, x, g.y - 7);
      c.restore();
    }

    // a dragged line of palisade or barricade: where each piece would go,
    // what it would cost, and how far the stores stretch
    _lineSpots(kind, d) {
      const cat = ZS.Structs.CAT[kind];
      const dx = d.x - d.x0,
        dy = d.y - d.y0;
      const len = Math.hypot(dx, dy);
      const step = cat.w + 3;
      const n = Math.min(30, Math.max(1, Math.round(len / step)));
      const cost = cat.cost;
      const out = [];
      let w = this.res.wood,
        s = this.res.stone,
        c = this.res.scrap;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const x = d.x0 + dx * f,
          y = d.y0 + dy * f;
        const chk = ZS.Structs.canPlace(this.world, this.nav, kind, x, y);
        let label = chk.ok ? null : chk.err || "no room";
        if (!label && (w < (cost.w || 0) || s < (cost.s || 0) || c < (cost.c || 0)))
          label = "out of stores";
        if (!label) {
          w -= cost.w || 0;
          s -= cost.s || 0;
          c -= cost.c || 0;
        }
        out.push({ x, y, label });
      }
      return out;
    }

    // set the line down, piece by piece, for as long as the stores last
    _placeLine(kind, d) {
      let n = 0;
      for (const sp of this._lineSpots(kind, d)) {
        if (sp.label) continue;
        if (this._placeAt(sp.x, sp.y, true)) n++;
      }
      if (n && ZS.VillageUI)
        ZS.VillageUI.toast(n + " " + ZS.Structs.CAT[kind].name + (n > 1 ? "s" : "") + " set out");
      else if (!n && ZS.VillageUI) ZS.VillageUI.toast("no room along that line");
      return n;
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
    drawOver(c, world, t, vis) {
      const night = this._dark();
      if (ZS.Hazards) ZS.Hazards.draw(c, this, t);
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
      if (this.weather.id === "fog" || this.weather.id === "storm") {
        c.fillStyle =
          this.weather.id === "fog" ? "rgba(226,222,208,0.22)" : "rgba(120,126,136,0.14)";
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
      // rain, snow, the leaves coming off the wood, the embers off a fire
      if (ZS.Art) ZS.Art.drawSky(c, vis, t, { night });
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

    // everything in the village that is neither a building nor a person
    extraSprites(vis) {
      const out = this._sprites || (this._sprites = []);
      out.length = 0;
      if (!ZS.Art) return out;
      for (const p of this.props)
        if (p.x > vis.x0 - 40 && p.x < vis.x1 + 40 && p.y > vis.y0 - 60 && p.y < vis.y1 + 30)
          out.push({ y: p.y, kp: 1, o: p });
      for (const a of this.critters)
        if (a.x > vis.x0 - 40 && a.x < vis.x1 + 40 && a.y > vis.y0 - 60 && a.y < vis.y1 + 30)
          out.push({ y: a.y, kp: 0, o: a });
      return out;
    }

    drawSprite(c, o, t) {
      const env = this._env || { night: 0 };
      c.save();
      if (o.kp) {
        const f = ZS.Art.PROP[o.kind];
        if (f) f(c, o, t, env);
      } else {
        const f = ZS.Art.CRIT[o.kind];
        if (f) f(c, o, t, env);
      }
      c.restore();
    }

    drawFX(c, fx) {
      for (const f of fx) {
        // the field's own noise claims its shapes first
        if (ZS.Fx && ZS.Fx.draw(c, f)) continue;
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
        } else if (f.wail) {
          const r = 20 + (0.7 - f.t) * 90;
          c.strokeStyle = "rgba(150,60,44," + (f.t * 0.9).toFixed(2) + ")";
          c.lineWidth = 2;
          ZS.wcirc(c, f.x, f.y - 16, r, f.seed, 3);
          c.strokeStyle = "rgba(150,60,44," + (f.t * 0.5).toFixed(2) + ")";
          ZS.wcirc(c, f.x, f.y - 16, r * 0.6, f.seed + 3, 2);
        } else if (f.splash) {
          c.strokeStyle = "rgba(96,132,150,0.7)";
          c.lineWidth = 1.2;
          for (let i = 0; i < 3; i++)
            ZS.wline(c, f.x - 6 + i * 6, f.y, f.x - 8 + i * 6, f.y + 8, f.seed + i, 0.6);
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
