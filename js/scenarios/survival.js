/* The Village — broken village zombie survival.
   A tile-based survival built on the Hold engine: villagers you assign to
   scavenge / lumber / farm / build / guard, a ruined settlement to rebuild,
   and the 90s night horde that tests it. Design covers P1-P6 end-to-end.
   Reuses: ZS.Tiles, ZS.Blocks, ZS.Nav, sketch boil primitives. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const SAVE_KEY = "zs.survival.v1";
  const T = ZS.Tiles;

  const BAL = {
    SCRAP0: 80,
    WOOD0: 50,
    FOOD0: 160,
    CLICK_SCRAP: 1,
    CLICK_WOOD: 1,
    DIG0: 22,
    DIG_GROW: 5,
    DIG_CAP: 50,
    DIG_COST: 5,
    NIGHT_LEN: window.ZS_NIGHT_LEN || 90,
    DUSK: 3,
    DAWN: 1.5,
    KILL_SCRAP: 2,
    CLEAR_BONUS: 0.1,
    FAIL_SCRAP: 0.4,
    FAIL_WOOD: 0.3,
    FAIL_FOOD: 0.3,
    CLICK_DMG: 1,
    COMBO_WIN: 1.2,
    COMBO_MAX: 5,
    COST: {
      wall: { scrap: 12, wood: 5, c: 1 },
      gate: { scrap: 25, wood: 12, c: 1 },
      house: { scrap: 35, wood: 25, c: 1.1 },
      yard: { scrap: 30, wood: 8, c: 1.12 },
      lumber: { scrap: 30, wood: 8, c: 1.12 },
      farm: { scrap: 35, wood: 12, c: 1.12 },
      barracks: { scrap: 80, wood: 45, c: 1.15 },
      turret: { scrap: 90, wood: 55, c: 1.15 },
      workshop: { scrap: 120, wood: 75, c: 1.1 },
    },
    WORKSHOP_DISC: 0.85,
    YIELD: { yard: 0.35, lumber: 0.4, farm: 0.45 },
    WORK_BONUS: { yard: 0.7, lumber: 0.7, farm: 0.6 },
    UPKEEP: 0.04,
    REGEN: 2,
    TRAIN_TIME: 10,
    CAP0: 6,
    HOUSE_CAP: 4,
    BAR_CAP: 6,
    RING_R: 120,
    REPAIR_RATE: 10,
    Z_SPD: 118,
    Z_DMG: 4,
    Z_ATK_CD: 1,
    Z_REACH: 22,
    Z_PERC: 260,
    Z_HP: 30,
    VILL_HP: 40,
  };

  const WEAPONS = [
    { name: "club", dmg: 3, range: 40, rate: 0.8 },
    { name: "machete", dmg: 6, range: 52, rate: 1 },
    { name: "pistol", dmg: 10, range: 120, rate: 1.4 },
    { name: "shotgun", dmg: 14, range: 128, rate: 0.9, splash: 120 },
    { name: "SMG", dmg: 18, range: 140, rate: 2.5 },
  ];
  const UPG = {
    gloves: { name: "gloves", base: 25, max: 5 },
    weapon: { name: "weapon", base: 150, max: 5 },
    armor: { name: "armor", base: 120, max: 3 },
    training: { name: "training", base: 100, max: 5 },
    morale: { name: "morale", base: 90, max: 3 },
    reinforced: { name: "reinforced", base: 150, max: 3 },
  };
  const RETREAT = [0.5, 0.3, 0.15, 0];
  const REINF = [1, 1.5, 2.5, 4];
  const MODS = [
    { name: "FOG", desc: "zombie sight −25%", sight: 0.75 },
    { name: "RAIN", desc: "guard fire −15%", rate: 0.85 },
    { name: "STENCH", desc: "zombies +10% speed", spd: 1.1 },
    { name: "CALM", desc: "kill scrap +10%", kill: 1.1 },
  ];
  const TURRET = { dmg: 22, rate: 1, range: T.TILE * 3.5 };

  const ST = { VILLAGER: 1, ZOMBIE: 2 };
  const JOB = { IDLE: 0, SCAV: 1, LUMBER: 2, FARM: 3, BUILD: 4, GUARD: 5 };
  const JOB_NAME = {
    0: "idle",
    1: "scavenger",
    2: "lumberjack",
    3: "farmer",
    4: "builder",
    5: "guard",
  };
  const JOB_SHORT = { 0: "idle", 1: "scav", 2: "wood", 3: "farm", 4: "build", 5: "guard" };
  const BUILD_KINDS = [
    "wall",
    "gate",
    "house",
    "yard",
    "lumber",
    "farm",
    "barracks",
    "turret",
    "workshop",
  ];
  const UNLOCK = {
    wall: 1,
    gate: 1,
    house: 1,
    yard: 1,
    lumber: 1,
    farm: 1,
    barracks: 1,
    turret: 1,
    workshop: 1,
  };
  const DIG_TOOLS = [T.WATER, T.SAND, T.ROAD, T.GRASS];
  const TOOL_NAME = { 0: "clear", 1: "water", 2: "sand", 3: "road" };
  const H = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const rectDist = (b, px, py) => {
    const dx = Math.max(b.x0 - px, 0, px - b.x1);
    const dy = Math.max(b.y0 - py, 0, py - b.by);
    return Math.hypot(dx, dy);
  };

  // extend Blocks catalog for the Village-only buildings
  const ensureBlocksCatalog = () => {
    if (!ZS.Blocks || !ZS.Blocks.CAT) return;
    const C = ZS.Blocks.CAT;
    if (!C.house) C.house = { hp: 100, nav: 0 };
    if (!C.lumber) C.lumber = { hp: 80, nav: 0 };
    if (!C.yard) C.yard = { hp: 60, nav: 0 };
    if (!C.farm) C.farm = { hp: 80, nav: 0 };
    // ensure village buildings obey open-sky rule where sensible
    const G = ZS.Blocks.GENS;
    if (G && !G.includes("house")) G.push("house");
    if (G && !G.includes("lumber")) G.push("lumber");
  };

  class ScenarioSurvival {
    constructor() {
      ensureBlocksCatalog();
      this.saved = this._load();
      this.day = 1;
      this.scrap = BAL.SCRAP0;
      this.wood = BAL.WOOD0;
      this.food = BAL.FOOD0;
      this.dig = BAL.DIG0;
      this.phase = "day";
      this.phaseT = 0;
      this.nightT = 0;
      this.paused = false;
      this.card = null;
      this.combo = { n: 0, t: -9, x: 0, y: 0 };
      this._n = null;
      this._sq = [];
      this._coreEase = 0;
      this.tool = null;
      this.tiles = null;
      this.blocks = null;
      this.hover = null;
      this.px = 0;
      this.py = 0;
      this.toastTxt = "";
      this.toastT = 0;
      this.saveT = 0;
      this._brows = {};
      this._drows = {};
      this._urows = {};
      this.up = { gloves: 0, weapon: 0, armor: 0, training: 0, morale: 0, reinforced: 0 };
      this.selectedVillager = null;
      this._recruitT = 0;

      window.addEventListener("keydown", (e) => {
        if (e.key >= "1" && e.key <= "4") this._selectTool(DIG_TOOLS[+e.key - 1]);
        else if (e.key === "0" || e.key === "Escape") this._selectTool(null);
        else if (e.key === "b") this._selectTool("wall");
        else if (e.key === "g") this._selectTool("gate");
        else if (e.key === "h") this._selectTool("house");
        else if (e.key === "y") this._selectTool("yard");
        else if (e.key === "u") this._selectTool("lumber");
        else if (e.key === "v") this._selectTool("farm");
        else if (e.key === "f") this._selectTool("barracks");
        else if (e.key === "t") this._selectTool("turret");
        else if (e.key === "w") this._selectTool("workshop");
      });
      const cv = document.getElementById("c");
      if (cv) {
        cv.addEventListener("mousemove", (e) => {
          const cam = window.ZS.debug && window.ZS.debug.cam;
          if (!cam) return;
          this.hover = cam.toWorld(e.clientX, e.clientY, cv.clientWidth, cv.clientHeight);
          // highlight villager under cursor
          if (this.phase === "day") {
            let best = null,
              bd = 22;
            for (const a of ZS.Sim.agents || []) {
              if (a.st !== ST.VILLAGER || a.dead) continue;
              const d = Math.hypot(a.x - this.hover.x, a.y - this.hover.y);
              if (d < bd) {
                bd = d;
                best = a;
              }
            }
            cv.style.cursor = best ? "pointer" : "";
          }
        });
        cv.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          const cam = window.ZS.debug && window.ZS.debug.cam;
          if (!cam) return;
          const p = cam.toWorld(e.clientX, e.clientY, cv.clientWidth, cv.clientHeight);
          // RMB on villager cycles job
          let hit = null,
            bd = 24;
          for (const a of ZS.Sim.agents || []) {
            if (a.st !== ST.VILLAGER || a.dead) continue;
            const d = Math.hypot(a.x - p.x, a.y - p.y);
            if (d < bd) {
              bd = d;
              hit = a;
            }
          }
          if (hit) this._cycleVillagerJob(hit);
          else this._rightRemove(p.x, p.y);
        });
      }
      window.addEventListener("beforeunload", () => this.save());
      this._panel();
      // first-run tutorial: 3 toasts that teach the broken village
      if (!this.saved) {
        setTimeout(() => this.toast("village in ruins — assign workers, rebuild!"), 900);
        setTimeout(
          () => this.toast("click villager → RMB cycles job · click pile for scrap/wood"),
          4200,
        );
        setTimeout(() => this.toast("build walls & houses, then press darkness falls"), 7600);
      }
    }

    tickEmpty() {
      return true;
    }

    terrain(world, nav) {
      ensureBlocksCatalog();
      this.nav = nav;
      const tiles = (this.tiles = new T(world, nav));
      const s = this.saved;
      if (s && s.tiles) for (const [tx, ty, tv] of s.tiles) tiles.set(tx, ty, tv);
      const blocks = (this.blocks = new ZS.Blocks(world, nav, tiles));
      world.blocks = blocks;
      blocks.placeCore();
      // ruined core starts wounded to sell the fantasy
      if (blocks.core) {
        blocks.core.hp = s && s.coreHp ? s.coreHp : 620;
        blocks.core.maxHp = 1000;
        const f = blocks.core.hp / blocks.core.maxHp;
        blocks.core.cracks = f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3;
      }
      // the broken village: a few ruined walls, a yard, a patch of water, and starter buildings
      if (!s) {
        const rng = ZS.rng32(world.seed ^ 0x71a);
        const cx = (tiles.cols / 2) | 0,
          cy = (tiles.rows / 2) | 0;
        const ruins = [
          [cx - 4, cy - 4, "wall"],
          [cx + 3, cy - 4, "wall"],
          [cx - 4, cy + 3, "wall"],
          [cx + 3, cy + 3, "wall"],
        ];
        for (const [tx, ty, k] of ruins) {
          if (rng() < 0.6) {
            const r = blocks.place(tx, ty, k, REINF[0]);
            if (r.ok && rng() < 0.5) {
              r.b.hp = Math.round(r.b.maxHp * (0.35 + rng() * 0.3));
              r.b.cracks = 2;
            }
          }
        }
        // starter buildings — a ruined scrap yard, lumber camp and a small field plus a house
        const starters = [
          [cx + 2, cy + 1, "yard", 0.6],
          [cx - 3, cy + 1, "lumber", 0.6],
          [cx + 1, cy - 3, "farm", 0.55],
          [cx - 2, cy - 3, "house", 0.7],
        ];
        for (const [tx, ty, k, hpF] of starters) {
          const r = blocks.place(tx, ty, k);
          if (r.ok) {
            r.b.hp = Math.round(r.b.maxHp * hpF);
            const f = r.b.hp / r.b.maxHp;
            r.b.cracks = f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3;
          }
        }
        // a couple of water scars and sand patches for flavor
        for (let i = 0; i < 2; i++) {
          const tx = (rng() * tiles.cols) | 0,
            ty = (rng() * tiles.rows) | 0;
          if (Math.hypot(tx - cx, ty - cy) < 7) continue;
          if (rng() < 0.5) tiles.set(tx, ty, T.WATER);
          else if (rng() < 0.3) tiles.set(tx, ty, T.SAND);
        }
        // a few trees for the lumber flavor (tile worlds have no forest by default)
        for (let i = 0; i < 8; i++) {
          const tx = cx + ((rng() * 10 - 5) | 0),
            ty = cy + ((rng() * 10 - 5) | 0);
          if (Math.hypot(tx - cx, ty - cy) < 3) continue;
          if (tx < 2 || ty < 2 || tx >= tiles.cols - 2 || ty >= tiles.rows - 2) continue;
          // use world tree api if available
          if (world.placeTree) {
            const x = tx * T.TILE + 20,
              y = ty * T.TILE + 20;
            world.placeTree(x, y, rng);
          }
        }
      }
      if (s && s.blocks)
        for (const [tx, ty, kind, hp] of s.blocks) {
          const r = blocks.place(tx, ty, kind);
          if (r.ok && hp !== undefined) r.b.hp = hp;
        }
      this.day = (s && s.day) || 1;
      this.scrap = s && typeof s.scrap === "number" ? s.scrap : BAL.SCRAP0;
      this.wood = s && typeof s.wood === "number" ? s.wood : BAL.WOOD0;
      this.food = s && typeof s.food === "number" ? s.food : BAL.FOOD0;
      this.dig = s && typeof s.dig === "number" ? s.dig : BAL.DIG0;
      if (s && s.up) Object.assign(this.up, s.up);
      if (s && s.coreHp && blocks.core) blocks.core.hp = s.coreHp;
      this._restored = s && s.villagers ? s.villagers : null;
    }

    init(agents) {
      if (this._restored && this._restored.length) {
        for (const [x, y, hp, job] of this._restored) {
          const a = this.makeAgent(x, y, ST.VILLAGER);
          a.job = job;
          a.maxHp = this.villagerMaxHp();
          a.hp = Math.min(hp, a.maxHp);
          agents.push(a);
        }
        this._restored = null;
        this._reflowJobs();
      } else if (!this.saved) {
        // fresh village: 6 villagers around the core
        const c = this.blocks.core;
        const cx = (c.x0 + c.x1) / 2,
          cy = (c.y0 + c.by) / 2;
        const jobs = [JOB.IDLE, JOB.SCAV, JOB.LUMBER, JOB.FARM, JOB.BUILD, JOB.GUARD];
        for (let i = 0; i < 6; i++) {
          const an = (i / 6) * Math.PI * 2;
          const a = this.makeAgent(
            cx + Math.cos(an) * 70 + ZS.rnd(-12, 12),
            cy + Math.sin(an) * 70 + ZS.rnd(-12, 12),
            ST.VILLAGER,
          );
          a.job = jobs[i % jobs.length];
          if (i === 5) a.job = JOB.GUARD;
          agents.push(a);
        }
      } else if (agents.length === 0) {
        // loaded save had zero villagers (edge): give 3
        const c = this.blocks.core;
        const cx = (c.x0 + c.x1) / 2,
          cy = (c.y0 + c.by) / 2;
        for (let i = 0; i < 3; i++) {
          const a = this.makeAgent(cx + ZS.rnd(-40, 40), cy + ZS.rnd(-40, 40), ST.VILLAGER);
          a.job = JOB.IDLE;
          agents.push(a);
        }
      }
    }

    counts(agents) {
      let v = 0,
        g = 0;
      for (const a of agents)
        if (a.st === ST.VILLAGER && !a.dead) {
          v++;
          if (a.job === JOB.GUARD) g++;
        }
      return { n: agents.length, v, g };
    }

    left(_agents) {
      return 1;
    }

    hostile(a) {
      return a.st === ST.ZOMBIE;
    }

    walkBlocked(a) {
      return a.st === ST.ZOMBIE;
    }

    maxSpeed(a) {
      if (a.st === ST.ZOMBIE) return this._zspd();
      if (a.job === JOB.GUARD) return 110;
      if (a.job === JOB.BUILD) return 95;
      return 90;
    }

    makeAgent(x, y, st) {
      const a = {
        x,
        y,
        a: ZS.rnd(0, 6.28),
        vx: 0,
        vy: 0,
        st,
        hp: st === ST.ZOMBIE ? BAL.Z_HP : BAL.VILL_HP,
        maxHp: st === ST.ZOMBIE ? BAL.Z_HP : BAL.VILL_HP,
        seed: Math.random() * 997,
        gait: ZS.rnd(0, 6.28),
        flash: 0,
        ph: ZS.rnd(0, 6.28),
        tx: null,
        ty: null,
        tAge: 99,
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
        job: st === ST.VILLAGER ? JOB.IDLE : 0,
        atkT: ZS.rnd(0, 0.6),
        muz: 0,
        workT: 0,
      };
      if (st === ST.VILLAGER) {
        a.maxHp = this.villagerMaxHp();
        a.hp = a.maxHp;
      }
      return a;
    }

    maintain(agents, dt, _world, _vw, _vh) {
      if (this.card) return;
      this.phaseT += dt;
      if (this.phase === "dusk") {
        if (this.phaseT < 1.6) this._easeCore(dt, 2.5);
        if (this.phaseT >= BAL.DUSK) {
          this.phase = "night";
          this.phaseT = 0;
          this.nightT = 0;
        }
      } else if (this.phase === "night") {
        this.nightT += dt;
        while (this._sq.length && this._sq[0].t <= this.nightT) {
          const s = this._sq.shift();
          this._spawnWalker();
          if (s.surge !== null && this._n && !this._n.surged[s.surge]) {
            this._n.surged[s.surge] = true;
            this.toast("they're coming — " + (s.surge === 1 ? "second" : "third") + " wave!");
          }
        }
        if (!this.blocks.core) return this._endNight(false, true);
        if (this.nightT >= BAL.NIGHT_LEN) return this._endNight(false, false);
        if (!this._sq.length) {
          let alive = 0;
          for (const a of agents) if (a.st === ST.ZOMBIE && !a.dead) alive++;
          if (alive === 0) return this._endNight(true, false);
        }
      } else if (this.phase === "dawn" && !this.card && this.phaseT >= BAL.DAWN) {
        this._newDay();
      }
      if (this._coreEase > 0) {
        this._coreEase = Math.max(0, this._coreEase - dt);
        this._easeCore(dt, 4);
      }
      // passive generation from buildings (small)
      const yc = this._count("yard"),
        lc = this._count("lumber"),
        fc = this._count("farm");
      if (yc) this.scrap += BAL.YIELD.yard * yc * dt * 0.5;
      if (lc) this.wood += BAL.YIELD.lumber * lc * dt * 0.5;
      if (fc) this.food += BAL.YIELD.farm * fc * dt * 0.5;

      // villager work bonuses (must be near building)
      const villagers = this._villagers(agents);
      for (const v of villagers) {
        if (v.dead) continue;
        const b = this._nearestWorkBuilding(v);
        const near = b && Math.hypot(v.x - (b.x0 + b.x1) / 2, v.y - (b.y0 + b.by) / 2) < 52;
        if (v.job === JOB.SCAV && near && b.kind === "yard") this.scrap += BAL.WORK_BONUS.yard * dt;
        else if (v.job === JOB.LUMBER && near && b.kind === "lumber")
          this.wood += BAL.WORK_BONUS.lumber * dt;
        else if (v.job === JOB.FARM && near && b.kind === "farm")
          this.food += BAL.WORK_BONUS.farm * dt;
        else if (v.job === JOB.BUILD && near) {
          // repair
          if (b.hp < b.maxHp) {
            b.hp = Math.min(b.maxHp, b.hp + BAL.REPAIR_RATE * dt);
            const f = b.hp / b.maxHp;
            b.cracks = f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3;
            v.workT += dt;
            if (v.workT > 1.2) {
              v.workT = 0;
              this.fx.push({ t: 0.6, x: b.x0 + 8, y: b.y0 + 8, kind: "repair" });
            }
          }
        }
      }
      // idle villagers forage slowly
      let idleCount = 0;
      for (const v of villagers) if (v.job === JOB.IDLE && !v.dead) idleCount++;
      if (idleCount) {
        this.scrap += 0.08 * idleCount * dt;
        this.wood += 0.05 * idleCount * dt;
      }
      // food upkeep day only
      if (this.phase === "day" && villagers.length) {
        this.food = Math.max(0, this.food - BAL.UPKEEP * villagers.length * dt);
        if (this.food > 0)
          for (const a of villagers)
            if (a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + BAL.REGEN * dt);
      }
      // auto-recruit dwell handled via button, not passive

      // damaged core rebuild if destroyed during day (test zombies)
      if (this.blocks && !this.blocks.core && this.phase === "day") {
        this.blocks.placeCore();
        if (this.blocks.core) {
          this.blocks.core.hp = 600;
          this.blocks.core.cracks = 1;
        }
        this.toast("the core is rebuilt");
      }

      this.toastT = Math.max(0, this.toastT - dt);
      this.saveT += dt;
      if (this.saveT >= 10) {
        this.saveT = 0;
        this.save();
      }
      const bg = this.phase === "day" ? "#efe8d8" : this.phase === "dawn" ? "#e2dac6" : "#1e2438";
      if (document.body.style.background !== bg) document.body.style.background = bg;
      if (document.body.style.background === "#1e2438") document.body.style.color = "#efe8d8";
    }

    update(a, dt, t, _grid, nav, _world, _buildings, _wave) {
      if (a.st === ST.ZOMBIE) this._zombie(a, dt, t, _grid, nav);
      else if (a.st === ST.VILLAGER) this._villager(a, dt, t, _grid, nav);
    }

    frame(agents, dt, _t, grid) {
      for (const a of agents) if (a.muz > 0) a.muz = Math.max(0, a.muz - dt);
      // turrets (watchtowers)
      for (const b of this.blocks.list) {
        if (b.kind !== "turret") continue;
        b.atkT = (b.atkT || 0) - dt;
        const cx = (b.x0 + b.x1) / 2,
          cy = (b.y0 + b.by) / 2;
        let bz = null,
          bd = 1e9;
        grid.query(cx, cy, TURRET.range, (o) => {
          if (o.st !== ST.ZOMBIE || o.dead) return;
          const d = Math.hypot(o.x - cx, o.y - cy);
          if (d < bd) {
            bd = d;
            bz = o;
          }
        });
        if (bz) {
          b.aim = Math.atan2(bz.y - cy, bz.x - cx);
          if (b.atkT <= 0) {
            b.atkT = 1 / TURRET.rate;
            this._hitZombie(bz, TURRET.dmg);
            this.fx.push({ t: 0.18, x: cx, y: cy, kind: "muzzle", a: b.aim });
          }
        } else if (b.aim !== undefined) b.aim += dt * 0.3;
      }
    }

    attachStains(_s) {}

    drawGround(c, world, _t) {
      this.tiles.drawAll(c);
      if (this.phase === "day" && this.hover && typeof this.tool === "string") {
        const [tx, ty] = this.tiles.tileAt(this.hover.x, this.hover.y);
        const ok = this.blocks.checkPlace(tx, ty, this.tool).ok;
        c.fillStyle = ok ? "rgba(112,148,72,0.22)" : "rgba(150,60,40,0.22)";
        c.fillRect(tx * T.TILE, ty * T.TILE, T.TILE, T.TILE);
        c.strokeStyle = ok ? "rgba(92,122,58,0.9)" : "rgba(150,60,40,0.9)";
        c.lineWidth = 1.5;
        ZS.sketchRect(c, tx * T.TILE + 2, ty * T.TILE + 2, T.TILE - 4, T.TILE - 4);
      }
      // selection highlight for villager
      if (this.selectedVillager && !this.selectedVillager.dead) {
        const a = this.selectedVillager;
        c.strokeStyle = "rgba(90,140,70,0.9)";
        c.lineWidth = 1.8;
        ZS.wcirc(c, a.x, a.y - 6, 18, a.seed + 99, 1.2);
      }
      const al =
        this.phase === "dusk"
          ? 0.45 * Math.min(1, this.phaseT / BAL.DUSK)
          : this.phase === "night"
            ? 0.45
            : this.phase === "dawn"
              ? 0.45 * Math.max(0, 1 - this.phaseT / BAL.DAWN)
              : 0;
      if (al > 0.01) {
        c.fillStyle = "rgba(28,32,50," + al.toFixed(3) + ")";
        c.fillRect(0, 0, world.w, world.h);
      }
    }

    draw(c, a, t) {
      if (a.st === ST.VILLAGER) {
        this._villagerDraw(c, a, t);
        return;
      }
      if (a.st !== ST.ZOMBIE) return;
      const s = a.seed;
      const moving = Math.hypot(a.vx, a.vy);
      const sway = Math.sin(t * 3 + s) * 1.6 * 0.5;
      const hx = a.x + sway,
        hy = a.y - 15;
      const g = Math.sin(a.gait) * 3.2 * Math.min(1, moving / 25 + 0.3);
      c.strokeStyle = "rgba(40,35,25,0.14)";
      c.lineWidth = 1.2;
      ZS.wcirc(c, a.x, a.y + 6.5, 5.5, s + 3, 1.4);
      c.strokeStyle = "rgba(150,40,30," + (0.1 + 0.06 * Math.sin(t * 2 + a.ph)).toFixed(3) + ")";
      c.lineWidth = 1;
      ZS.wcirc(c, a.x, a.y - 4, 17, s + 9, 2.5);
      c.strokeStyle = "rgb(72,102,58)";
      c.lineWidth = 1.5;
      c.lineCap = "round";
      ZS.wline(c, a.x, a.y - 1, a.x + g + ZS.sjit(s) * 0.5, a.y + 6, s + 11, 1.2);
      ZS.wline(c, a.x, a.y - 1, a.x - g + ZS.sjit(s + 1) * 0.5, a.y + 6, s + 17, 1.2);
      ZS.wline(c, hx, hy + 4, a.x, a.y - 1, s + 23, 1.1);
      ZS.wcirc(c, hx, hy, 4.6, s + 29, 0.9);
      const shx = hx,
        shy = hy + 6;
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
      c.lineWidth = 1.1;
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
    }

    _villagerDraw(c, a, t) {
      const s = a.seed;
      const moving = Math.hypot(a.vx, a.vy);
      const sway = Math.sin(t * 3 + s) * 1.6 * 0.5;
      const hx = a.x + sway,
        hy = a.y - 15;
      const g = Math.sin(a.gait) * 3.2 * Math.min(1, moving / 25 + 0.3);
      c.strokeStyle = "rgba(40,35,25,0.14)";
      c.lineWidth = 1.2;
      ZS.wcirc(c, a.x, a.y + 6.5, 5.5, s + 3, 1.4);
      // low hp flash
      let hpFrac = a.hp / a.maxHp;
      // body color by job
      let col = "rgb(112,118,86)";
      if (a.job === JOB.FARM) col = "rgb(110,140,80)";
      else if (a.job === JOB.LUMBER) col = "rgb(120,90,60)";
      else if (a.job === JOB.SCAV) col = "rgb(128,112,76)";
      else if (a.job === JOB.BUILD) col = "rgb(130,120,95)";
      else if (a.job === JOB.GUARD) col = "rgb(100,110,90)";
      c.strokeStyle = col;
      c.lineWidth = 1.5;
      c.lineCap = "round";
      ZS.wline(c, a.x, a.y - 1, a.x + g + ZS.sjit(s) * 0.5, a.y + 6, s + 11, 1.2);
      ZS.wline(c, a.x, a.y - 1, a.x - g + ZS.sjit(s + 1) * 0.5, a.y + 6, s + 17, 1.2);
      ZS.wline(c, hx, hy + 4, a.x, a.y - 1, s + 23, 1.1);
      ZS.wcirc(c, hx, hy, 4.6, s + 29, 0.9);
      const shx = hx,
        shy = hy + 6;
      const reach = 10 + Math.sin(t * 4 + a.ph) * 2;
      // job-specific arm/tool
      if (a.job === JOB.GUARD) {
        ZS.wline(
          c,
          shx,
          shy,
          shx - Math.cos(a.a) * 3 + sway,
          shy + Math.sin(a.a) * 3 * 0.4 + 3,
          s + 31,
          1.3,
        );
        const wl = [7, 9, 12][Math.min(2, this.up.weapon)];
        ZS.wline(
          c,
          shx,
          shy,
          shx + Math.cos(a.a) * reach + sway,
          shy + Math.sin(a.a) * reach * 0.4 - 3,
          s + 37,
          1.3,
        );
        ZS.wline(
          c,
          shx + Math.cos(a.a) * (reach - 4),
          shy + Math.sin(a.a) * (reach - 4) * 0.4 - 3,
          shx + Math.cos(a.a) * (reach - 4 + wl),
          shy + Math.sin(a.a) * (reach - 4 + wl) * 0.4 - 3,
          s + 39,
          1.4,
        );
        if (a.muz > 0) {
          c.strokeStyle = "rgba(190,150,60," + ((0.9 * a.muz) / 0.12).toFixed(2) + ")";
          c.lineWidth = 1.3;
          const wl2 = wl;
          const fx = shx + Math.cos(a.a) * (reach - 2 + wl2),
            fy = shy + Math.sin(a.a) * (reach - 2 + wl2) * 0.4 - 3;
          ZS.wline(c, fx, fy, fx + Math.cos(a.a) * 6, fy + Math.sin(a.a) * 3 - 2, s + 40, 0.5);
          c.strokeStyle = col;
          c.lineWidth = 1.5;
        }
      } else if (a.job === JOB.LUMBER) {
        // axe
        ZS.wline(
          c,
          shx,
          shy,
          shx + Math.cos(a.a) * reach + sway,
          shy + Math.sin(a.a) * reach * 0.4 - 3,
          s + 37,
          1.3,
        );
        // axe head
        c.strokeStyle = "rgba(90,90,95,0.9)";
        c.lineWidth = 1.4;
        ZS.wline(
          c,
          shx + Math.cos(a.a) * (reach + 1),
          shy + Math.sin(a.a) * (reach + 1) * 0.4 - 3,
          shx + Math.cos(a.a) * (reach + 4) + Math.cos(a.a + 1.2) * 4,
          shy + Math.sin(a.a) * (reach + 4) * 0.4 - 3 + Math.sin(a.a + 1.2) * 4,
          s + 41,
          0.5,
        );
        c.strokeStyle = col;
        c.lineWidth = 1.5;
        ZS.wline(
          c,
          shx,
          shy,
          shx - Math.cos(a.a) * 2 + sway,
          shy + Math.sin(a.a) * 2 * 0.4 + 2,
          s + 31,
          1.3,
        );
      } else if (a.job === JOB.FARM) {
        // hoe
        ZS.wline(
          c,
          shx,
          shy,
          shx + Math.cos(a.a) * reach + sway,
          shy + Math.sin(a.a) * reach * 0.4 - 3,
          s + 37,
          1.3,
        );
        c.lineWidth = 1.1;
        ZS.wline(
          c,
          shx + Math.cos(a.a) * reach,
          shy + Math.sin(a.a) * reach * 0.4 - 3,
          shx + Math.cos(a.a) * reach + 5,
          shy + Math.sin(a.a) * reach * 0.4 - 3 + 4,
          s + 42,
          0.6,
        );
        c.lineWidth = 1.5;
        ZS.wline(
          c,
          shx,
          shy,
          shx - Math.cos(a.a) * 2 + sway,
          shy + Math.sin(a.a) * 2 * 0.4 + 2,
          s + 31,
          1.3,
        );
      } else if (a.job === JOB.BUILD) {
        // hammer
        ZS.wline(
          c,
          shx,
          shy,
          shx + Math.cos(a.a) * reach + sway,
          shy + Math.sin(a.a) * reach * 0.4 - 3,
          s + 37,
          1.3,
        );
        c.fillStyle = "rgba(90,80,70,0.9)";
        c.fillRect(shx + Math.cos(a.a) * reach - 3, shy + Math.sin(a.a) * reach * 0.4 - 6, 6, 4);
        ZS.wline(
          c,
          shx,
          shy,
          shx - Math.cos(a.a) * 2 + sway,
          shy + Math.sin(a.a) * 2 * 0.4 + 2,
          s + 31,
          1.3,
        );
      } else {
        // idle / scav
        ZS.wline(
          c,
          shx,
          shy,
          shx + Math.cos(a.a - 0.5) * 7 + sway,
          shy + Math.sin(a.a - 0.5) * 7 * 0.4 - 1,
          s + 31,
          1.3,
        );
        ZS.wline(
          c,
          shx,
          shy,
          shx + Math.cos(a.a + 0.5) * 7 + sway,
          shy + Math.sin(a.a + 0.5) * 7 * 0.4 - 1,
          s + 37,
          1.3,
        );
        if (a.job === JOB.SCAV) {
          // small pack
          c.fillStyle = "rgba(110,100,80,0.5)";
          c.fillRect(shx - 4, shy - 2, 8, 6);
        }
      }
      // face
      c.lineWidth = 1.1;
      c.fillStyle = hpFrac < 0.35 ? "#c06a5a" : "#8c6b5a";
      const ex = Math.cos(a.a),
        ey = Math.sin(a.a) * 0.5;
      c.beginPath();
      c.arc(hx - 1.7 + ex, hy - 0.5 + ey, 1, 0, 6.29);
      c.fill();
      c.beginPath();
      c.arc(hx + 1.7 + ex, hy - 0.5 + ey, 1, 0, 6.29);
      c.fill();
      ZS.wline(c, hx - 1.5, hy + 2, hx + 1.5, hy + 2.5, s + 41, 0.5);
      // hat by job
      if (a.job === JOB.FARM) {
        c.fillStyle = "rgba(180,160,90,0.85)";
        c.beginPath();
        c.ellipse(hx, hy - 3.2, 5.2, 2.2, 0, 0, 6.29);
        c.fill();
      } else if (a.job === JOB.GUARD) {
        c.fillStyle = "rgba(90,100,85,0.9)";
        c.beginPath();
        c.arc(hx, hy - 1.4, 4.4, Math.PI, 0);
        c.closePath();
        c.fill();
        c.strokeStyle = "rgba(60,50,40,0.7)";
        c.lineWidth = 1;
        ZS.wline(c, hx - 4.8, hy - 1.4, hx + 4.8, hy - 1.4, s + 43, 0.4);
      } else if (a.job === JOB.LUMBER) {
        c.fillStyle = "rgba(120,70,40,0.85)";
        c.beginPath();
        c.arc(hx, hy - 2, 4, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "rgba(60,40,20,0.6)";
        c.lineWidth = 1;
        ZS.wcirc(c, hx, hy - 2, 4, s + 45, 0.4);
      }
      // flash
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
      // job label small
      if (a.job !== JOB.IDLE && hpFrac > 0) {
        c.fillStyle = "rgba(60,50,40,0.55)";
        c.font = "italic 9px 'Segoe Script','Comic Sans MS',cursive";
        c.textAlign = "center";
        c.fillText(JOB_SHORT[a.job], a.x, a.y + 16);
        c.textAlign = "left";
      }
    }

    drawBlock(c, b, _t) {
      switch (b.kind) {
        case "wall":
        case "gate":
          this._wall(c, b, b.kind === "gate");
          break;
        case "yard":
          this._pile(c, b);
          break;
        case "lumber":
          this._lumber(c, b);
          break;
        case "farm":
          this._farm(c, b);
          break;
        case "house":
          this._house(c, b);
          break;
        case "barracks":
        case "workshop":
          this._hut(c, b, b.kind === "workshop");
          break;
        case "turret":
          this._turret(c, b);
          break;
        case "core":
          this._core(c, b);
          break;
      }
      const s0 = b.tx * 13.1 + b.ty * 7.7;
      c.strokeStyle = "rgba(60,50,40,0.6)";
      c.lineWidth = 1.2;
      for (let i = 0; i < b.cracks; i++) {
        const s = s0 + i * 31;
        const x = b.x0 + (b.x1 - b.x0) * (0.15 + 0.3 * H(s)),
          y = b.y0 + (b.by - b.y0) * (0.15 + 0.3 * H(s + 5));
        ZS.wline(c, x, y, x + 7 + ZS.sjit(s) * 3, y + 9 + ZS.sjit(s + 1) * 3, s, 1);
        ZS.wline(c, x + 3, y + 2, x + 1, y + 8, s + 2, 0.8);
      }
      // occupancy dot for houses (reserved)
      if (b.kind === "house") {
        // reserved for future housing indicator
      }
    }

    drawFX(c, fx) {
      const HAND = '"Segoe Print","Bradley Hand","Comic Sans MS",cursive';
      for (const f of fx) {
        if (f.kind === "x") {
          const k = 1 - f.t / 20;
          c.strokeStyle = "rgba(60,50,40," + (0.7 * (1 - k)).toFixed(2) + ")";
          c.lineWidth = 2;
          const r = 5 + k * 4;
          ZS.wline(c, f.x - r, f.y - r, f.x + r, f.y + r, f.x * 0.31, 0.8);
          ZS.wline(c, f.x + r, f.y - r, f.x - r, f.y + r, f.y * 0.29, 0.8);
          continue;
        }
        if (f.kind === "puff") {
          const k = 1 - f.t / 0.5;
          c.strokeStyle = "rgba(90,80,60," + (0.55 * (1 - k)).toFixed(2) + ")";
          c.lineWidth = 1.2;
          ZS.wcirc(c, f.x, f.y, 4 + k * 12, f.x * 0.31, 1.1);
          continue;
        }
        if (f.kind === "gain") {
          const k = 1 - f.t / 1.2;
          c.fillStyle = "rgba(92,60,28," + (0.95 * (1 - k)).toFixed(2) + ")";
          c.font = "italic 13px " + HAND;
          c.textAlign = "center";
          c.fillText(f.txt, f.x, f.y - k * 22);
          c.textAlign = "left";
          continue;
        }
        if (f.kind === "combo") {
          const k = 1 - f.t / BAL.COMBO_WIN;
          c.strokeStyle = "rgba(150,40,30," + (0.8 * (1 - k)).toFixed(2) + ")";
          c.lineWidth = 1.3;
          for (let i = 0; i < f.n; i++)
            ZS.wline(
              c,
              f.x - 6 + i * 3.4,
              f.y + 2 + ZS.sjit(f.x + i) * 1.5,
              f.x - 6 + i * 3.4 + 1.5,
              f.y - 8,
              f.x * 0.37 + i,
              0.5,
            );
          continue;
        }
        if (f.kind === "repair") {
          const k = 1 - f.t / 0.6;
          c.strokeStyle = "rgba(90,110,70," + (0.6 * (1 - k)).toFixed(2) + ")";
          c.lineWidth = 1.2;
          ZS.wline(c, f.x - 4, f.y - 4, f.x + 4, f.y + 4, f.x * 0.4, 0.5);
          ZS.wline(c, f.x + 4, f.y - 4, f.x - 4, f.y + 4, f.y * 0.4, 0.5);
          continue;
        }
        if (f.kind === "muzzle") {
          const k = 1 - f.t / 0.18;
          c.strokeStyle = "rgba(190,150,60," + (0.8 * (1 - k)).toFixed(2) + ")";
          c.lineWidth = 1.6;
          ZS.wline(c, f.x, f.y, f.x + Math.cos(f.a) * 8, f.y + Math.sin(f.a) * 8, f.x * 0.5, 0.5);
          continue;
        }
        if (f.kind !== "hit") continue;
        const k = 1 - f.t / 0.25;
        c.strokeStyle = "rgba(90,40,30," + (0.7 * (1 - k)).toFixed(2) + ")";
        c.lineWidth = 1.2;
        for (let i = 0; i < 3; i++)
          ZS.wline(c, f.x - 3 + i * 3, f.y + 2, f.x - 6 + i * 5, f.y - 4 - i, f.x * 0.37 + i, 0.6);
      }
    }

    tap(_agents, _world, x, y, e) {
      if (e && e.button === 2) return;
      // click on villager selects
      let hit = null,
        bd = 22;
      for (const a of ZS.Sim.agents) {
        if (a.st !== ST.VILLAGER || a.dead) continue;
        const d = Math.hypot(a.x - x, a.y - y);
        if (d < bd) {
          bd = d;
          hit = a;
        }
      }
      if (hit) {
        this.selectedVillager = hit;
        this.toast(JOB_NAME[hit.job] + " selected — RMB cycles job");
        this._refresh();
        return;
      }
      // else tap does dig/place if day
      if (this.phase !== "day" || !this.tiles) return;
      if (typeof this.tool === "string") this._placeAt(x, y);
      else if (typeof this.tool === "number") this.digTo(x, y, null);
      else {
        // deselect
        this.selectedVillager = null;
        this._refresh();
      }
    }

    pointerDown(x, y, e) {
      if (this.card) {
        this._dismissCard();
        return true;
      }
      if (this.phase === "night" || this.phase === "dusk") return this._combatClick(x, y, e);
      if (this.phase !== "day" || typeof this.tool !== "number") {
        // check if clicking villager claims gesture
        let hit = null,
          bd = 24;
        for (const a of ZS.Sim.agents || []) {
          if (a.st !== ST.VILLAGER || a.dead) continue;
          const d = Math.hypot(a.x - x, a.y - y);
          if (d < bd) {
            bd = d;
            hit = a;
          }
        }
        if (hit) {
          this.selectedVillager = hit;
          this.toast(JOB_NAME[hit.job] + " — RMB to reassign");
          this._refresh();
          return true;
        }
        return false;
      }
      const n = this.digTo(x, y, null);
      this.px = x;
      this.py = y;
      return n > 0;
    }

    _combatClick(x, y, _e) {
      let bz = null,
        bd = 1e9;
      for (const o of ZS.Sim.agents) {
        if (o.st !== ST.ZOMBIE || o.dead) continue;
        const d = Math.hypot(o.x - x, o.y - y);
        if (d < bd) {
          bd = d;
          bz = o;
        }
      }
      if (!bz || bd > 24) return false;
      const now = performance.now() / 1000;
      this.combo.n =
        now - this.combo.t <= BAL.COMBO_WIN ? Math.min(BAL.COMBO_MAX, this.combo.n + 1) : 1;
      this.combo.t = now;
      this._hitZombie(bz, BAL.CLICK_DMG * this.combo.n);
      this.fx.push({ t: BAL.COMBO_WIN, x: bz.x, y: bz.y - 12, kind: "combo", n: this.combo.n });
      return true;
    }

    pointerMove(x, y) {
      if (this.phase !== "day") return;
      if (typeof this.tool === "number") {
        this.digTo(x, y, { x: this.px, y: this.py });
        this.px = x;
        this.py = y;
      }
    }

    pointerUp(_x, _y) {}

    _selectTool(t) {
      if (typeof t === "string" && UNLOCK[t] && this.day < UNLOCK[t]) {
        this.toast("unlocks day " + UNLOCK[t]);
        return;
      }
      this.tool = t;
      this._refresh();
    }

    _placeAt(x, y) {
      const [tx, ty] = this.tiles.tileAt(x, y);
      const kind = this.tool;
      const un = UNLOCK[kind];
      if (un && this.day < un) {
        this.toast("unlocks day " + un);
        return;
      }
      const c = this._cost(kind);
      if (this.scrap < c.scrap || this.wood < c.wood) {
        this.toast("need " + c.scrap + " scrap " + c.wood + " wood");
        return;
      }
      const r = this.blocks.place(tx, ty, kind, REINF[this.up.reinforced]);
      if (!r.ok) {
        this.toast(r.err);
        return;
      }
      this.scrap -= c.scrap;
      this.wood -= c.wood;
      this.toast(kind + " built");
      this.save();
      this._refresh();
    }

    _rightRemove(x, y) {
      if (this.phase !== "day" || !this.tiles) return;
      const [tx, ty] = this.tiles.tileAt(x, y);
      const b = this.blocks.at(tx, ty);
      if (!b || b.kind === "core") return;
      const c = this._cost(b.kind);
      const refundS = Math.floor(c.scrap / 2),
        refundW = Math.floor(c.wood / 2);
      this.blocks.remove(b);
      this.scrap += refundS;
      this.wood += refundW;
      this.toast("dismantled · +" + refundS + " scrap +" + refundW + " wood");
      this.save();
      this._refresh();
    }

    digTo(x, y, from) {
      if (typeof this.tool !== "number" || !this.tiles || this.dig < BAL.DIG_COST) return 0;
      const n = from
        ? this.tiles.stroke(from.x, from.y, x, y, this.tool)
        : this.tiles.set(Math.floor(x / T.TILE), Math.floor(y / T.TILE), this.tool);
      if (n > 0) this.dig = Math.max(0, this.dig - n * BAL.DIG_COST);
      if (n > 0) this._refresh();
      return n;
    }

    _villagers(agents) {
      const a = agents || ZS.Sim.agents || [];
      const out = [];
      for (const o of a) if (o.st === ST.VILLAGER && !o.dead) out.push(o);
      return out;
    }

    jobCounts() {
      const c = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const v of this._villagers()) c[v.job] = (c[v.job] || 0) + 1;
      return c;
    }

    popCap() {
      return (
        BAL.CAP0 + BAL.HOUSE_CAP * this._count("house") + BAL.BAR_CAP * this._count("barracks")
      );
    }

    villagerMaxHp() {
      return [BAL.VILL_HP, 70, 120][this.up.armor];
    }

    guardCap() {
      return BAL.BAR_CAP * this._count("barracks") + 2;
    }

    _count(kind) {
      let n = 0;
      for (const b of this.blocks.list) if (b.kind === kind) n++;
      return n;
    }

    _cost(kind) {
      const c = BAL.COST[kind];
      if (!c) return { scrap: 9999, wood: 9999 };
      const owned = this._count(kind);
      const disc = Math.pow(BAL.WORKSHOP_DISC, this._count("workshop"));
      return {
        scrap: Math.ceil(c.scrap * Math.pow(c.c, owned) * disc),
        wood: Math.ceil(c.wood * Math.pow(c.c, owned) * disc),
      };
    }

    _upCost(k) {
      const u = UPG[k];
      return Math.ceil(u.base * Math.pow(this.day, 0.9));
    }

    _buyUp(k) {
      const u = UPG[k];
      if (this.up[k] >= u.max) return;
      const cost = this._upCost(k);
      if (this.scrap < cost) {
        this.toast("need " + cost + " scrap");
        return;
      }
      this.scrap -= cost;
      this.up[k]++;
      if (k === "armor") {
        const nh = this.villagerMaxHp();
        for (const a of this._villagers()) {
          const gain = nh - a.maxHp;
          a.maxHp = nh;
          a.hp = Math.min(nh, a.hp + Math.max(0, gain));
        }
      }
      this.toast(u.name + " → lvl " + this.up[k]);
      this._refresh();
      this.save();
    }

    _upLabel(k) {
      const n = this.up[k] + 1;
      switch (k) {
        case "gloves":
          return (
            "click +" + BAL.CLICK_SCRAP * Math.pow(2, n) + "/+" + BAL.CLICK_WOOD * Math.pow(2, n)
          );
        case "weapon":
          return WEAPONS[n].name + " · " + WEAPONS[n].dmg + " dmg";
        case "armor":
          return "villager HP " + [40, 70, 120][n];
        case "training":
          return "+" + 15 * n + "% dmg";
        case "morale":
          return "hold to " + Math.round(RETREAT[n] * 100) + "% HP";
        default:
          return "block HP ×" + REINF[n];
      }
    }

    _digMax() {
      return Math.min(BAL.DIG_CAP, BAL.DIG0 + (this.day - 1) * BAL.DIG_GROW);
    }

    toast(txt) {
      this.toastTxt = txt;
      this.toastT = 2.5;
      this._refresh();
    }

    startNight() {
      if (this.phase !== "day") return;
      // need at least 1 guard or walls?
      this._planNight();
      this.phase = "dusk";
      this.phaseT = 0;
      this.toast("night " + this.day + " comes…");
      this.save();
      this._refresh();
    }

    _planNight() {
      const day = this.day;
      const total = Math.round(10 + day * 4 + Math.pow(day, 1.4));
      const spread = Math.round(total * 0.65);
      const surges = 2 + (H(day * 3.3) < 0.5 ? 0 : 1);
      const surgeN = Math.max(1, Math.floor((total - spread) / surges));
      const q = [];
      for (let i = 0; i < spread; i++)
        q.push({ t: ((i + 0.5) / spread) * BAL.NIGHT_LEN, surge: null });
      for (let s = 0; s < surges; s++) {
        const t0 = (0.2 + 0.55 * H(day * 7.1 + s * 2.3)) * BAL.NIGHT_LEN;
        for (let i = 0; i < surgeN; i++) q.push({ t: t0 + i * 0.22, surge: s });
      }
      q.sort((a, b) => a.t - b.t);
      this._sq = q;
      this._n = {
        kills: 0,
        blocks: 0,
        down: 0,
        scrap: 0,
        wood: 0,
        food: 0,
        scrap0: this.scrap,
        wood0: this.wood,
        food0: this.food,
        surged: {},
      };
    }

    _spawnWalker() {
      const p = this._spawnPoint();
      const z = this.makeAgent(p.x, p.y, ST.ZOMBIE);
      const hp = BAL.Z_HP * (1 + this.day * 0.12);
      z.hp = z.maxHp = hp;
      ZS.Sim.agents.push(z);
    }

    _spawnPoint() {
      const c = this.blocks.core,
        w = this.tiles.cols * T.TILE,
        h = this.tiles.rows * T.TILE;
      const cx = c ? (c.x0 + c.x1) / 2 : w / 2,
        cy = c ? (c.y0 + c.by) / 2 : h / 2;
      for (let i = 0; i < 40; i++) {
        const an = ZS.rnd(0, 6.283),
          r = ZS.rnd(320, 620);
        const x = cx + Math.cos(an) * r,
          y = cy + Math.sin(an) * r;
        if (x < 40 || y < 40 || x > w - 40 || y > h - 40) continue;
        if (this.nav.isWalkable(x, y, true)) return { x, y };
      }
      return { x: cx + 340, y: cy + 340 };
    }

    _endNight(early, lost) {
      for (const a of ZS.Sim.agents)
        if (a.st === ST.ZOMBIE && !a.dead) {
          a.dead = true;
          this.fx.push({ t: 0.5, x: a.x, y: a.y, kind: "puff" });
        }
      this._sq = [];
      const n = this._n || {
        kills: 0,
        blocks: 0,
        down: 0,
        scrap: 0,
        scrap0: this.scrap,
        wood0: this.wood,
        food0: this.food,
      };
      if (early && !lost) {
        const bS = Math.round(n.scrap * BAL.CLEAR_BONUS),
          bW = Math.round(n.wood * BAL.CLEAR_BONUS);
        if (bS) this.scrap += bS;
        if (bW) this.wood += bW;
      }
      if (lost) {
        this.scrap = Math.floor(this.scrap * (1 - BAL.FAIL_SCRAP));
        this.wood = Math.floor(this.wood * (1 - BAL.FAIL_WOOD));
        this.food = Math.max(0, this.food * (1 - BAL.FAIL_FOOD));
        this.blocks.placeCore();
        if (this.blocks.core) {
          this.blocks.core.hp = 600;
          this.blocks.core.cracks = 1;
        }
      }
      const mod = this._nightMod(this.day + 1);
      this.card = {
        title: lost ? "night " + this.day + " lost" : "night " + this.day + " survived",
        lost,
        lines: [
          "kills " + n.kills + (early && !lost ? " · cleared early" : ""),
          "blocks lost " + n.blocks + " · villagers down " + n.down,
          "scrap " +
            (this.scrap - n.scrap0 >= 0 ? "+" : "") +
            Math.round(this.scrap - n.scrap0) +
            " · wood " +
            (this.wood - n.wood0 >= 0 ? "+" : "") +
            Math.round(this.wood - n.wood0) +
            " · food " +
            (this.food - n.food0 >= 0 ? "+" : "") +
            Math.round(this.food - n.food0),
          this._nextUnlock() || "",
          mod ? "tomorrow: " + mod.name + " (" + mod.desc + ")" : "tomorrow: clear skies",
        ].filter(Boolean),
      };
      this.phase = "dawn";
      this.phaseT = 0;
      this.paused = true;
      this.save();
      this._refresh();
    }

    _dismissCard() {
      this.card = null;
      this.paused = false;
      this._newDay();
    }

    _easeCore(dt, k) {
      const cam = ZS.debug && ZS.debug.cam,
        c = this.blocks && this.blocks.core;
      if (!cam || !c) return;
      const cx = (c.x0 + c.x1) / 2,
        cy = (c.y0 + c.by) / 2,
        f = Math.min(1, dt * k);
      cam.x += (cx - cam.x) * f;
      cam.y += (cy - cam.y) * f;
    }

    _newDay() {
      this.day += 1;
      this.dig = this._digMax();
      this.phase = "day";
      this.phaseT = 0;
      this._n = null;
      this._sq = [];
      // heal villagers a bit at dawn if food
      if (this.food > 0) {
        for (const v of this._villagers()) if (v.hp < v.maxHp) v.hp = Math.min(v.maxHp, v.hp + 10);
      }
      this.toast("day " + this.day + " — dig " + this.dig + " · assign work!");
      this.save();
      this._refresh();
    }

    _nightMod(n) {
      if (n < 3 || (n - 3) % 3 !== 0) return null;
      return MODS[Math.floor(H(n * 7.77) * MODS.length)];
    }

    _zspd() {
      const m = this._nightMod(this.day);
      return BAL.Z_SPD * (m && m.spd ? m.spd : 1);
    }

    _srate(w) {
      const m = this._nightMod(this.day);
      return w.rate * (m && m.rate ? m.rate : 1);
    }

    _nextUnlock() {
      let best = null;
      for (const k of BUILD_KINDS)
        if (UNLOCK[k] > this.day && (!best || UNLOCK[k] < UNLOCK[best])) best = k;
      return best ? "next: " + best + " (day " + UNLOCK[best] + ")" : null;
    }

    save() {
      if (this._wiped || !this.tiles || !this.blocks) return;
      const t = this.tiles,
        b = this.blocks;
      const tiles = [];
      for (let ty = 0; ty < t.rows; ty++)
        for (let tx = 0; tx < t.cols; tx++) {
          const tv = t.typeAt(tx, ty);
          if (tv !== 0) tiles.push([tx, ty, tv]);
        }
      const blocks = [];
      for (const bl of b.list) if (bl.kind !== "core") blocks.push([bl.tx, bl.ty, bl.kind, bl.hp]);
      try {
        localStorage.setItem(
          SAVE_KEY,
          JSON.stringify({
            v: 1,
            day: this.day,
            dig: Math.ceil(this.dig),
            scrap: Math.floor(this.scrap),
            wood: Math.floor(this.wood),
            food: Math.floor(this.food),
            coreHp: b.core ? b.core.hp : 0,
            tiles,
            blocks,
            up: this.up,
            villagers: this._villagers().map((a) => [
              Math.round(a.x),
              Math.round(a.y),
              Math.round(a.hp),
              a.job,
            ]),
          }),
        );
      } catch {}
    }

    _load() {
      try {
        const s = JSON.parse(localStorage.getItem(SAVE_KEY));
        return s && s.v === 1 ? s : null;
      } catch {
        return null;
      }
    }

    debugSpawnZombie(x, y) {
      const a = this.makeAgent(x, y, ST.ZOMBIE);
      ZS.Sim.agents.push(a);
      return a;
    }

    debugSpawnSoldier(x, y) {
      const a = this.makeAgent(x, y, ST.VILLAGER);
      a.job = JOB.GUARD;
      a.maxHp = this.villagerMaxHp();
      a.hp = a.maxHp;
      ZS.Sim.agents.push(a);
      return a;
    }

    _zombie(a, dt, t, _grid, nav) {
      const B = this.blocks;
      const mod = this._nightMod(this.day);
      const perc = BAL.Z_PERC * (mod && mod.sight ? mod.sight : 1);
      const spd = this._zspd();
      let best = null,
        prey = null,
        bd = 1e9;
      for (const b of B.list) {
        const d = rectDist(b, a.x, a.y);
        if (d < bd) {
          bd = d;
          best = b;
          prey = null;
        }
      }
      for (const o of ZS.Sim.agents) {
        if (o.st !== ST.VILLAGER || o.dead) continue;
        const d = Math.hypot(o.x - a.x, o.y - a.y);
        if (d < bd) {
          bd = d;
          best = null;
          prey = o;
        }
      }
      if ((!best && !prey) || bd >= perc) {
        const c = B.core;
        if (c) {
          const ap = this._approach(a, c, nav);
          if (ap) {
            ZS.planAndFollow(a, ap, true, spd, dt, t, nav);
            return;
          }
        }
        ZS.wander(a, dt);
        return;
      }
      const cx = prey ? prey.x : (best.x0 + best.x1) / 2,
        cy = prey ? prey.y : (best.y0 + best.by) / 2;
      a.a = Math.atan2(cy - a.y, cx - a.x);
      if (bd <= BAL.Z_REACH) {
        a.wantMove = false;
        a.atkT -= dt;
        if (a.atkT <= 0) {
          a.atkT = BAL.Z_ATK_CD;
          this.fx.push({ t: 0.25, x: a.x, y: a.y - 6, kind: "hit" });
          if (prey) this._hitVillager(prey);
          else {
            const dead = B.damage(best, BAL.Z_DMG);
            if (dead) {
              if (best.kind === "core") this.toast("the core has fallen…");
              else if (this.phase === "night" && this._n) this._n.blocks++;
            }
          }
        }
        return;
      }
      if (prey) {
        ZS.planAndFollow(a, { x: prey.x, y: prey.y }, true, spd, dt, t, nav);
        return;
      }
      const ap = this._approach(a, best, nav);
      if (ap) ZS.planAndFollow(a, ap, true, spd, dt, t, nav);
      else a.wantMove = false;
    }

    _approach(a, b, nav) {
      let best = null,
        bs = 1e9;
      for (let ty = b.ty - 1; ty <= b.ty + b.h; ty++)
        for (let tx = b.tx - 1; tx <= b.tx + b.w; tx++) {
          if (tx >= b.tx && tx < b.tx + b.w && ty >= b.ty && ty < b.ty + b.h) continue;
          if (!this.blocks.inGrid(tx, ty)) continue;
          const x = (tx + 0.5) * T.TILE,
            y = (ty + 0.5) * T.TILE;
          if (!nav.isWalkable(x, y, true)) continue;
          const rd = rectDist(b, x, y);
          const wd = Math.hypot(x - a.x, y - a.y);
          const score = (rd <= BAL.Z_REACH ? 0 : 1000) + wd + rd;
          if (score < bs) {
            bs = score;
            best = { x, y };
          }
        }
      return best;
    }

    _nearestWorkBuilding(v) {
      let best = null,
        bd = 1e9;
      const kindMap = { 1: "yard", 2: "lumber", 3: "farm" };
      const want = kindMap[v.job];
      if (want) {
        for (const b of this.blocks.list) {
          if (b.kind !== want) continue;
          const d = Math.hypot((b.x0 + b.x1) / 2 - v.x, (b.y0 + b.by) / 2 - v.y);
          if (d < bd) {
            bd = d;
            best = b;
          }
        }
        if (best) return best;
      }
      if (v.job === JOB.BUILD) {
        // nearest damaged
        for (const b of this.blocks.list) {
          if (b.hp >= b.maxHp) continue;
          const d = Math.hypot((b.x0 + b.x1) / 2 - v.x, (b.y0 + b.by) / 2 - v.y);
          if (d < bd) {
            bd = d;
            best = b;
          }
        }
        if (best) return best;
      }
      return null;
    }

    slotPos(i, n) {
      const c = this.blocks.core;
      const cx = (c.x0 + c.x1) / 2,
        cy = (c.y0 + c.by) / 2,
        an = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + Math.cos(an) * BAL.RING_R, y: cy + Math.sin(an) * BAL.RING_R };
    }

    freeGuardSlot() {
      const guards = this._villagers().filter((v) => v.job === JOB.GUARD);
      const used = new Set(guards.map((a) => a.slot));
      const cap = this.guardCap();
      for (let i = 0; i < cap; i++) if (!used.has(i)) return i;
      return 0;
    }

    _villager(a, dt, t, grid, nav) {
      // guard combat has priority
      if (a.job === JOB.GUARD) {
        this._guardAI(a, dt, t, grid, nav);
        return;
      }
      // builder repair if damaged building nearby
      if (a.job === JOB.BUILD) {
        const b = this._nearestWorkBuilding(a);
        if (b) {
          const cx = (b.x0 + b.x1) / 2,
            cy = (b.y0 + b.by) / 2;
          const d = Math.hypot(cx - a.x, cy - a.y);
          if (d <= 42) {
            a.wantMove = false;
            a.a = Math.atan2(cy - a.y, cx - a.x);
            return;
          }
          ZS.planAndFollow(a, { x: cx, y: cy }, false, 90, dt, t, nav);
          return;
        }
      }
      // worker jobs: go to workplace
      if (a.job === JOB.SCAV || a.job === JOB.LUMBER || a.job === JOB.FARM) {
        const b = this._nearestWorkBuilding(a);
        if (b) {
          const cx = (b.x0 + b.x1) / 2,
            cy = (b.y0 + b.by) / 2;
          const d = Math.hypot(cx - a.x, cy - a.y);
          if (d <= 44) {
            a.wantMove = false;
            // work anim angle
            a.a = Math.atan2(cy - a.y, cx - a.x) + Math.sin(t * 2 + a.seed) * 0.2;
            return;
          }
          ZS.planAndFollow(a, { x: cx, y: cy }, false, 85, dt, t, nav);
          return;
        }
      }
      // idle / no workplace: wander near core
      const c = this.blocks.core;
      if (c) {
        const cx = (c.x0 + c.x1) / 2,
          cy = (c.y0 + c.by) / 2;
        const d = Math.hypot(cx - a.x, cy - a.y);
        if (d > 180) {
          ZS.planAndFollow(
            a,
            { x: cx + ZS.rnd(-60, 60), y: cy + ZS.rnd(-60, 60) },
            false,
            70,
            dt,
            t,
            nav,
          );
          return;
        }
      }
      // small wander
      if (!a.wx || a.wt <= 0) {
        const w = ZS.wanderTarget(a, nav, false, []);
        a.wx = w.x;
        a.wy = w.y;
        a.wt = 3 + Math.random() * 3;
      }
      a.wt -= dt;
      ZS.planAndFollow(a, { x: a.wx, y: a.wy }, false, 60, dt, t, nav);
    }

    _guardAI(a, dt, t, grid, nav) {
      const w = WEAPONS[this.up.weapon];
      const ret = RETREAT[this.up.morale];
      const wounded = ret > 0 && a.hp / a.maxHp <= ret;
      // find nearest zombie
      let bz = null,
        bd = 1e9;
      grid.query(a.x, a.y, 360, (o) => {
        if (o.st !== ST.ZOMBIE || o.dead) return;
        const d = Math.hypot(o.x - a.x, o.y - a.y);
        if (d < bd) {
          bd = d;
          bz = o;
        }
      });
      if (bz && bd <= w.range + (wounded ? 0 : 24)) {
        a.a = Math.atan2(bz.y - a.y, bz.x - a.x);
        if (bd > w.range) {
          ZS.planAndFollow(a, { x: bz.x, y: bz.y }, false, 100, dt, t, nav);
        } else {
          a.wantMove = false;
          a.atkT -= dt;
          if (a.atkT <= 0) {
            a.atkT = 1 / this._srate(w);
            a.muz = 0.12;
            this._hitZombie(bz, w.dmg * (1 + 0.15 * this.up.training), w.splash);
          }
        }
        return;
      }
      // hold ring
      if (a.slot === undefined) a.slot = this.freeGuardSlot();
      const cap = this.guardCap();
      // clamp slot within cap
      if (a.slot >= cap) a.slot = a.slot % cap;
      const p = this.slotPos(a.slot, cap);
      if (Math.hypot(p.x - a.x, p.y - a.y) > 10) ZS.planAndFollow(a, p, false, 85, dt, t, nav);
      else a.wantMove = false;
      if (bz) a.a = Math.atan2(bz.y - a.y, bz.x - a.x);
    }

    _hitZombie(z, dmg, splash) {
      this.fx.push({ t: 0.25, x: z.x, y: z.y - 6, kind: "hit" });
      const kill = (o, d) => {
        o.hp -= d;
        o.flash = 1;
        if (o.hp <= 0 && !o.dead) this._killZombie(o);
      };
      kill(z, dmg);
      if (splash) {
        const r2 = splash * splash;
        for (const o of ZS.Sim.agents) {
          if (o === z || o.st !== ST.ZOMBIE || o.dead) continue;
          const dx = o.x - z.x,
            dy = o.y - z.y;
          if (dx * dx + dy * dy <= r2) kill(o, dmg);
        }
      }
    }

    _killZombie(o) {
      o.dead = true;
      this.fx.push({ t: 20, x: o.x, y: o.y, kind: "x" });
      const m = this._nightMod(this.day);
      const mult = m && m.kill ? m.kill : 1;
      // scrap + occasional wood
      const rewardS = Math.round(2 * mult);
      const rewardW = Math.random() < 0.4 ? 1 : 0;
      this.scrap += rewardS;
      this.wood += rewardW;
      const txt = rewardW ? "+" + rewardS + "s +" + rewardW + "w" : "+" + rewardS;
      this.fx.push({ t: 1.2, x: o.x, y: o.y - 16, kind: "gain", txt });
      if (this.phase === "night" && this._n) {
        this._n.kills++;
        this._n.scrap += rewardS;
        this._n.wood += rewardW;
      }
    }

    _hitVillager(s) {
      s.hp -= BAL.Z_DMG;
      s.flash = 1;
      if (s.hp <= 0 && !s.dead) {
        s.dead = true;
        this.fx.push({ t: 20, x: s.x, y: s.y, kind: "x" });
        if (this.phase === "night" && this._n) this._n.down++;
        // if guard, slot freed
      }
    }

    _wall(c, b, gate) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const x = b.x0 + 2,
        y = b.y0 + 2,
        w = b.x1 - b.x0 - 4,
        h = b.by - b.y0 - 4;
      c.fillStyle = "rgba(150,142,122,0.28)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = "rgba(60,50,40,0.8)";
      c.lineWidth = 2;
      ZS.sketchRect(c, x, y, w, h);
      c.lineWidth = 1.1;
      ZS.wline(c, x + 3, y + h * 0.5, x + w - 3, y + h * 0.5, s + 3, 0.8);
      if (gate) {
        const dw = 14,
          dx = x + (w - dw) / 2;
        c.fillStyle = "rgba(50,42,34,0.4)";
        c.fillRect(dx, y + h - 16, dw, 16);
        c.strokeStyle = "rgba(60,50,40,0.8)";
        c.lineWidth = 1.4;
        c.beginPath();
        c.arc(dx + dw / 2, y + h - 16, dw / 2, Math.PI, 0);
        c.stroke();
      }
    }

    _pile(c, b) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const cx = (b.x0 + b.x1) / 2,
        cy = (b.y0 + b.by) / 2;
      c.fillStyle = "rgba(140,130,110,0.22)";
      c.beginPath();
      c.ellipse(cx, cy + 4, 13, 9, 0, 0, 6.29);
      c.fill();
      c.strokeStyle = "rgba(70,60,45,0.7)";
      c.lineWidth = 1.4;
      ZS.wcirc(c, cx - 5, cy + 3, 5.5, s + 1, 0.8);
      ZS.wcirc(c, cx + 5, cy + 4, 5, s + 2, 0.8);
      ZS.wcirc(c, cx, cy - 2, 5.5, s + 3, 0.8);
      ZS.wline(c, cx - 13, cy + 11, cx + 13, cy + 11, s + 4, 0.8);
    }

    _lumber(c, b) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const cx = (b.x0 + b.x1) / 2,
        cy = (b.y0 + b.by) / 2;
      c.fillStyle = "rgba(130,110,80,0.22)";
      c.fillRect(b.x0 + 4, b.y0 + 6, b.x1 - b.x0 - 8, b.by - b.y0 - 12);
      c.strokeStyle = "rgba(80,60,40,0.75)";
      c.lineWidth = 1.5;
      ZS.sketchRect(c, b.x0 + 4, b.y0 + 6, b.x1 - b.x0 - 8, b.by - b.y0 - 12);
      // logs
      c.strokeStyle = "rgba(90,70,45,0.8)";
      c.lineWidth = 1.3;
      ZS.wline(c, cx - 10, cy - 2, cx + 10, cy - 2, s + 1, 0.6);
      ZS.wline(c, cx - 10, cy + 3, cx + 10, cy + 3, s + 2, 0.6);
      c.fillStyle = "rgba(90,70,45,0.9)";
      // small axe icon
      ZS.wline(c, cx + 12, cy - 8, cx + 14, cy - 12, s + 3, 0.5);
    }

    _farm(c, b) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const x = b.x0 + 4,
        y = b.y0 + 4,
        w = b.x1 - b.x0 - 8,
        h = b.by - b.y0 - 8;
      c.fillStyle = "rgba(122,148,84,0.25)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = "rgba(60,50,40,0.7)";
      c.lineWidth = 1.4;
      ZS.sketchRect(c, x, y, w, h);
      c.lineWidth = 1.1;
      c.strokeStyle = "rgba(95,120,60,0.8)";
      for (let i = 1; i <= 3; i++)
        ZS.wline(c, x + 3, y + (h * i) / 4, x + w - 3, y + (h * i) / 4, s + i, 0.7);
      c.fillStyle = "rgba(160,145,115,0.5)";
      c.fillRect(x, y, 9, 7);
      c.lineWidth = 1.2;
      c.strokeStyle = "rgba(60,50,40,0.8)";
      ZS.sketchRect(c, x, y, 9, 7);
    }

    _house(c, b) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const x = b.x0 + 4,
        y = b.y0 + 8,
        w = b.x1 - b.x0 - 8,
        h = b.by - b.y0 - 12;
      c.fillStyle = "rgba(165,150,125,0.32)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = "rgba(60,50,40,0.8)";
      c.lineWidth = 1.6;
      ZS.sketchRect(c, x, y, w, h);
      c.lineWidth = 1.6;
      ZS.wline(c, x - 2, y, x + w / 2, y - 7, s + 1, 1);
      ZS.wline(c, x + w / 2, y - 7, x + w + 2, y, s + 2, 1);
      // door
      c.fillStyle = "rgba(80,60,40,0.55)";
      c.fillRect(x + w / 2 - 4, y + h - 10, 8, 10);
      c.strokeStyle = "rgba(60,50,40,0.7)";
      c.lineWidth = 1.1;
      ZS.wline(c, x + w / 2 - 4, y + h - 10, x + w / 2 - 4, y + h, s + 3, 0.5);
      ZS.wline(c, x + w / 2 + 4, y + h - 10, x + w / 2 + 4, y + h, s + 4, 0.5);
      // window
      c.strokeStyle = "rgba(60,50,40,0.6)";
      c.lineWidth = 1.1;
      ZS.wline(c, x + 4, y + 8, x + 10, y + 8, s + 5, 0.4);
      ZS.wline(c, x + 4, y + 12, x + 10, y + 12, s + 6, 0.4);
      ZS.wline(c, x + 7, y + 8, x + 7, y + 12, s + 7, 0.4);
    }

    _hut(c, b, workshop) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const x = b.x0 + 6,
        y = b.y0 + 10,
        w = b.x1 - b.x0 - 12,
        h = b.by - b.y0 - 16;
      c.fillStyle = "rgba(160,145,115,0.3)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = "rgba(60,50,40,0.8)";
      c.lineWidth = 1.6;
      ZS.sketchRect(c, x, y, w, h);
      c.lineWidth = 1.8;
      ZS.wline(c, x - 3, y, x + w / 2, y - 8, s + 1, 1);
      ZS.wline(c, x + w / 2, y - 8, x + w + 3, y, s + 2, 1);
      c.fillStyle = "rgba(50,42,34,0.35)";
      c.fillRect(x + w / 2 - 4, y + h - 11, 8, 11);
      if (workshop) {
        c.strokeStyle = "rgba(60,50,40,0.7)";
        c.lineWidth = 1.3;
        ZS.wline(c, x + 6, y + 9, x + 13, y + 3, s + 3, 0.5);
        c.fillStyle = "rgba(60,50,40,0.5)";
        c.fillRect(x + 10, y, 4, 5);
      } else {
        // barracks flag
        c.fillStyle = "rgba(120,60,40,0.7)";
        c.fillRect(x + w - 7, y - 6, 6, 4);
      }
    }

    _turret(c, b) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const cx = (b.x0 + b.x1) / 2,
        cy = (b.y0 + b.by) / 2;
      c.fillStyle = "rgba(150,142,122,0.3)";
      c.fillRect(cx - 9, cy - 7, 18, 14);
      c.strokeStyle = "rgba(60,50,40,0.8)";
      c.lineWidth = 1.5;
      ZS.wcirc(c, cx, cy, 9, s + 1, 1);
      c.lineWidth = 2.2;
      ZS.wline(c, cx, cy, cx + Math.cos(b.aim) * 15, cy + Math.sin(b.aim) * 15, s + 4, 0.5);
      // sandbags
      c.strokeStyle = "rgba(90,80,65,0.6)";
      c.lineWidth = 1;
      ZS.wcirc(c, cx - 6, cy + 7, 3, s + 5, 0.4);
      ZS.wcirc(c, cx + 6, cy + 7, 3, s + 6, 0.4);
    }

    _core(c, b) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const x = b.x0 + 4,
        y = b.y0 + 4,
        w = b.x1 - b.x0 - 8,
        h = b.by - b.y0 - 8;
      c.fillStyle = "rgba(160,150,128,0.3)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = b.hp < 400 ? "rgba(140,50,40,0.9)" : "rgba(50,42,34,0.9)";
      c.lineWidth = 3;
      ZS.sketchRect(c, x, y, w, h);
      c.lineWidth = 1.2;
      ZS.sketchRect(c, x + 6, y + 6, w - 12, h - 12);
      c.fillStyle = "rgba(50,42,34,0.9)";
      for (let i = 0; i < 3; i++) c.fillRect(x + w * (0.15 + 0.32 * i) - 3, y - 5, 6, 5);
      c.strokeStyle = "rgba(50,42,34,0.9)";
      c.lineWidth = 1.4;
      ZS.wline(c, x + w - 9, y, x + w - 9, y - 14, s + 3, 0.5);
      c.fillStyle = "rgba(120,60,40,0.75)";
      c.beginPath();
      c.moveTo(x + w - 9, y - 14);
      c.lineTo(x + w + 1, y - 11);
      c.lineTo(x + w - 9, y - 8);
      c.closePath();
      c.fill();
      // hp bar small
      const f = b.hp / b.maxHp;
      c.fillStyle = "rgba(60,50,40,0.25)";
      c.fillRect(x, y + h + 4, w, 4);
      c.fillStyle =
        f > 0.5 ? "rgba(90,160,70,0.9)" : f > 0.25 ? "rgba(190,150,40,0.9)" : "rgba(180,60,40,0.9)";
      c.fillRect(x, y + h + 4, w * f, 4);
    }

    _panel() {
      const ui = document.getElementById("ui");
      if (!ui) return;
      ui.innerHTML =
        '<div class="pile" id="pile">scrap 0 · wood 0 · food 0</div>' +
        '<div class="day" id="dayrow"></div>' +
        '<button id="nightBtn">darkness falls ▸</button>' +
        '<button id="recruitBtn">+ recruit villager (25s 40f 10w)</button>' +
        '<button id="coreBtn">⌂ core</button>' +
        '<button id="resetBtn">↻ start over</button>' +
        '<div class="lbl">villagers <span class="keys">click=select RMB=cycle</span></div>' +
        '<div id="jobs"></div>' +
        '<div class="lbl">build <span class="keys">b g h y u v f t w</span></div>' +
        '<div id="brows"></div>' +
        '<div class="lbl">upgrades</div>' +
        '<div id="urows"></div>' +
        '<div class="lbl">dig <span class="keys">1-4</span></div>' +
        '<div id="drows"></div>' +
        '<div class="hint">LMB: dig / place · RMB: dismantle / cycle job<br>0/esc: pan · night: LMB hit walkers (combo)<br>click villager to select, RMB cycles job</div>' +
        '<div class="toast" id="toast"></div>';
      const brows = ui.querySelector("#brows");
      const drows = ui.querySelector("#drows");
      const urows = ui.querySelector("#urows");
      const jobs = ui.querySelector("#jobs");
      for (const k of BUILD_KINDS) {
        const d = document.createElement("div");
        d.className = "row";
        d.dataset.kind = k;
        d.innerHTML =
          "<span>" +
          k +
          "</span><span class='cnt'></span><span class='prod'></span><span class='cost'></span>";
        d.onclick = () => this._selectTool(k);
        brows.appendChild(d);
        this._brows[k] = d;
      }
      for (const k of Object.keys(UPG)) {
        const d = document.createElement("div");
        d.className = "row";
        d.dataset.up = k;
        d.innerHTML =
          "<span>" + UPG[k].name + "</span><span class='prod'></span><span class='cost'></span>";
        d.onclick = () => this._buyUp(k);
        urows.appendChild(d);
        this._urows[k] = d;
      }
      DIG_TOOLS.forEach((tt, i) => {
        const d = document.createElement("div");
        d.className = "row";
        d.dataset.tool = tt;
        d.innerHTML = "<span>" + (i + 1) + " · " + TOOL_NAME[tt] + "</span>";
        d.onclick = () => this._selectTool(tt);
        drows.appendChild(d);
        this._drows[tt] = d;
      });
      // job rows
      this._jobRows = {};
      for (const j of [0, 1, 2, 3, 4, 5]) {
        const d = document.createElement("div");
        d.className = "jobrow";
        d.innerHTML =
          "<span class='jname'>" +
          JOB_NAME[j] +
          "</span><button class='jbtn' data-j='" +
          j +
          "' data-d='-1'>−</button><span class='jcnt' id='jc" +
          j +
          "'>0</span><button class='jbtn' data-j='" +
          j +
          "' data-d='1'>+</button>";
        jobs.appendChild(d);
        this._jobRows[j] = d;
      }
      jobs.addEventListener("click", (e) => {
        const b = e.target.closest(".jbtn");
        if (!b) return;
        const j = +b.dataset.j,
          d = +b.dataset.d;
        this._adjustJob(j, d);
      });
      this._el = {
        pile: ui.querySelector("#pile"),
        dayrow: ui.querySelector("#dayrow"),
        night: ui.querySelector("#nightBtn"),
        recruit: ui.querySelector("#recruitBtn"),
        core: ui.querySelector("#coreBtn"),
        reset: ui.querySelector("#resetBtn"),
        toast: ui.querySelector("#toast"),
      };
      this._el.night.onclick = () => this.startNight();
      this._el.recruit.onclick = () => this._recruit();
      this._el.core.onclick = () => {
        this._coreEase = 2.5;
      };
      this._el.reset.onclick = () => {
        const b = this._el.reset;
        if (b.classList.contains("warn")) {
          this._wiped = true;
          try {
            localStorage.removeItem(SAVE_KEY);
          } catch {}
          location.reload();
          return;
        }
        b.classList.add("warn");
        b.textContent = "really? click again";
        clearTimeout(this._resetT);
        this._resetT = setTimeout(() => {
          b.classList.remove("warn");
          b.textContent = "↻ start over";
        }, 2500);
      };
      this._el.pile.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const g = this.up.gloves;
        this.scrap += BAL.CLICK_SCRAP * Math.pow(2, g);
        this.wood += BAL.CLICK_WOOD * Math.max(1, Math.pow(1.5, g) | 0);
        // farm click gives food too
        if (g >= 1) this.food += Math.pow(1.5, g - 1) | 0;
        this._pulse();
        this._refresh();
      });
      setInterval(() => this._refresh(), 140);
    }

    _adjustJob(job, delta) {
      const villagers = this._villagers();
      if (delta > 0) {
        // need idle to assign
        const idle = villagers.find((v) => v.job === JOB.IDLE);
        if (!idle) {
          this.toast("no idle villagers");
          return;
        }
        // guard cap check
        if (job === JOB.GUARD) {
          const guards = villagers.filter((v) => v.job === JOB.GUARD).length;
          if (guards >= this.guardCap()) {
            this.toast("need more barracks for guards");
            return;
          }
          idle.slot = this.freeGuardSlot();
        }
        idle.job = job;
        this.toast(JOB_NAME[job] + " +1");
      } else {
        const v = villagers.find((x) => x.job === job);
        if (!v) {
          this.toast("none assigned");
          return;
        }
        v.job = JOB.IDLE;
        this.toast(JOB_NAME[job] + " → idle");
      }
      this._reflowJobs();
      this._refresh();
      this.save();
    }

    _cycleVillagerJob(a) {
      if (!a || a.dead) return;
      const order = [JOB.IDLE, JOB.SCAV, JOB.LUMBER, JOB.FARM, JOB.BUILD, JOB.GUARD];
      let idx = order.indexOf(a.job);
      idx = (idx + 1) % order.length;
      // guard cap
      if (order[idx] === JOB.GUARD) {
        const guards = this._villagers().filter((v) => v.job === JOB.GUARD).length;
        if (a.job !== JOB.GUARD && guards >= this.guardCap()) {
          this.toast("barracks needed for more guards");
          idx = (idx + 1) % order.length;
        } else if (a.job !== JOB.GUARD) a.slot = this.freeGuardSlot();
      }
      a.job = order[idx];
      this.selectedVillager = a;
      this.toast("→ " + JOB_NAME[a.job]);
      this._refresh();
    }

    _reflowJobs() {
      // ensure guard slots valid
      const cap = this.guardCap();
      let slot = 0;
      for (const v of this._villagers())
        if (v.job === JOB.GUARD) {
          if (v.slot === undefined || v.slot >= cap) v.slot = slot % cap;
          slot++;
        }
    }

    _recruit() {
      const cap = this.popCap();
      const cur = this._villagers().length;
      if (cur >= cap) {
        this.toast("need houses (cap " + cap + ")");
        return;
      }
      if (this.scrap < 25 || this.food < 40 || this.wood < 10) {
        this.toast("need 25 scrap 40 food 10 wood");
        return;
      }
      this.scrap -= 25;
      this.food -= 40;
      this.wood -= 10;
      const c = this.blocks.core;
      const cx = (c.x0 + c.x1) / 2,
        cy = (c.y0 + c.by) / 2;
      const a = this.makeAgent(cx + ZS.rnd(-30, 30), cy + ZS.rnd(-30, 30), ST.VILLAGER);
      a.job = JOB.IDLE;
      ZS.Sim.agents.push(a);
      this.toast("villager joined!");
      this._refresh();
      this.save();
    }

    _refresh() {
      const el = this._el;
      if (!el || !this.tiles) return;
      const vs = this._villagers();
      const cap = this.popCap();
      el.pile.textContent =
        "scrap " +
        Math.floor(this.scrap) +
        " · wood " +
        Math.floor(this.wood) +
        " · food " +
        Math.floor(this.food) +
        " · pop " +
        vs.length +
        "/" +
        cap;
      if (this.selectedVillager && !this.selectedVillager.dead)
        el.pile.textContent += " · sel:" + JOB_SHORT[this.selectedVillager.job];
      el.pile.classList.toggle("sq", false);
      if (this.phase !== "day") {
        let left = this._sq.length;
        for (const a of ZS.Sim.agents) if (a.st === ST.ZOMBIE && !a.dead) left++;
        const s = Math.max(0, Math.ceil(BAL.NIGHT_LEN - this.nightT));
        const mod = this._nightMod(this.day);
        el.dayrow.textContent =
          "night " +
          this.day +
          " · left " +
          left +
          " · " +
          Math.floor(s / 60) +
          ":" +
          String(s % 60).padStart(2, "0") +
          " · kills " +
          (this._n ? this._n.kills : 0) +
          " · down " +
          (this._n ? this._n.down : 0) +
          (mod ? " · " + mod.name : "");
        el.night.textContent = "night in progress…";
      } else {
        const tn =
          this.tool === null
            ? "pan"
            : typeof this.tool === "string"
              ? this.tool
              : TOOL_NAME[this.tool];
        const jc = this.jobCounts();
        el.dayrow.textContent =
          "day " +
          this.day +
          " · dig " +
          Math.max(0, Math.ceil(this.dig)) +
          "/" +
          this._digMax() +
          " · " +
          tn +
          " · idle " +
          (jc[0] || 0);
        el.night.textContent = "darkness falls ▸";
      }
      el.night.disabled = this.phase !== "day";
      el.recruit.disabled = this.phase !== "day" || vs.length >= cap;
      el.recruit.style.opacity = el.recruit.disabled ? "0.45" : "1";
      for (const k of BUILD_KINDS) {
        const row = this._brows[k];
        if (!row) continue;
        const un = UNLOCK[k] && this.day < UNLOCK[k];
        const c = this._cost(k);
        const costEl = row.querySelector(".cost");
        costEl.textContent = un ? "day " + UNLOCK[k] : c.scrap + "s " + c.wood + "w";
        costEl.className =
          "cost" + (!un && (this.scrap < c.scrap || this.wood < c.wood) ? " no" : "");
        row.querySelector(".cnt").textContent = "×" + this._count(k);
        const cnt = this._count(k);
        let prod = "";
        if (k === "yard" && cnt) prod = "+" + (BAL.YIELD.yard * cnt * 0.5).toFixed(1) + "/s";
        else if (k === "lumber" && cnt)
          prod = "+" + (BAL.YIELD.lumber * cnt * 0.5).toFixed(1) + "/s";
        else if (k === "farm" && cnt) prod = "+" + (BAL.YIELD.farm * cnt * 0.5).toFixed(1) + "/s";
        else if (k === "house" && cnt) prod = "cap+" + BAL.HOUSE_CAP * cnt;
        row.querySelector(".prod").textContent = prod;
        row.className = "row" + (un ? " lock" : "") + (this.tool === k ? " on" : "");
      }
      for (const tt of DIG_TOOLS)
        if (this._drows[tt]) this._drows[tt].className = "row" + (this.tool === tt ? " on" : "");
      for (const k of Object.keys(UPG)) {
        const u = UPG[k],
          row = this._urows[k];
        if (!row) continue;
        const maxed = this.up[k] >= u.max;
        row.querySelector(".prod").textContent = maxed ? "max" : this._upLabel(k);
        const cost = this._upCost(k);
        const costEl = row.querySelector(".cost");
        costEl.textContent = maxed ? "" : String(cost);
        costEl.className = "cost" + (!maxed && this.scrap < cost ? " no" : "");
        row.className = "row" + (maxed ? " lock" : "");
      }
      // jobs
      const jc = this.jobCounts();
      for (const j of [0, 1, 2, 3, 4, 5]) {
        const elc = document.getElementById("jc" + j);
        if (elc) elc.textContent = jc[j] || 0;
        if (this._jobRows[j]) {
          const isSel = this.selectedVillager && this.selectedVillager.job === j;
          this._jobRows[j].style.background = isSel ? "rgba(112,148,72,0.18)" : "";
        }
      }
      el.toast.textContent = this.toastT > 0 ? this.toastTxt : "";
    }

    _pulse() {
      const p = this._el && this._el.pile;
      if (!p) return;
      p.classList.remove("sq");
      void p.offsetWidth;
      p.classList.add("sq");
    }

    hud(_agents, _wave) {
      const mod = this.phase !== "day" ? this._nightMod(this.day) : null;
      return {
        hidden: true,
        hint:
          this.phase !== "day"
            ? "LMB: hit walkers (combo) · drag: pan · wheel: zoom"
            : "click pile: scrap/wood · click villager: select · RMB: cycle job / dismantle · keys: 1-4 dig b/g/h/y/u/v/f/t/w build",
        overlay: () => {
          if (this.card) return { card: this.card };
          if (this.phase === "dusk")
            return {
              main: "NIGHT " + this.day,
              sub: mod ? mod.name + " — " + mod.desc : "darkness falls…",
              big: true,
            };
          if (this.phase === "night" && this.nightT < 4)
            return {
              main: "NIGHT " + this.day,
              sub: mod ? mod.name : "",
              fade: 1 - this.nightT / 4,
            };
          if (this.phase === "dawn")
            return { main: "dawn", sub: "day " + (this.day + 1) + " — dig refreshed" };
          return null;
        },
      };
    }
  }

  ZS.ScenarioSurvival = ScenarioSurvival;
})();
