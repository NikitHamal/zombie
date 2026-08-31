/* The theatre. One vast sheet of paper, five nations on it, and the dead
   in the broken places between. This is the scenario pack: it owns the map
   (terrain in `terrain()`, the bases in `init()`), the clock (day, night,
   the surge at nightfall), the money (derricks pay the war), the orders
   (drag a box, right-click the ground), the combat (every shot, every
   splash, every wall that comes down), and the ending (the last enemy hall
   falls, or yours does).

   The core engine (agents.js, sim.js, draw.js) runs the clock, the
   separation, the nav and the painter's list; everything that knows what a
   side is, or what a derrick is for, lives here and in js/rts/.

   Controls live in the overlay (js/rts/ui.js) and in the pointer handlers
   below: left drags a box, right gives the order, walls drag out in a
   line the way they always did. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const BAL = {
    DAY_LEN: 150, // seconds of daylight
    NIGHT_LEN: 70, // ...and of dark
    SIGHT: 320, // how far a unit looks for trouble on its own
    AGGRO: 280, // ...and how far attack-move reaches out
    CLAIM_R: 300, // how far from what is yours the build line runs
    FLAG_R: 430, // an outpost flag pushes it out to here
    CAP_T: 5, // seconds of standing on a derrick to take it
    REPAIR_COST: 11, // funds a second of repair takes
    REPAIR_HP: 34, // ...and what it buys
    START_CARS: 5, // scout cars the player starts with
    START_TANKS: 2, // ...and the tanks
    AI_CARS: 3, // what a nation starts with
    FUNDS_CAP: 9999,
    WP_LEN: 760, // long orders are walked in legs this long
    FORM: 40, // how far apart guns stand in a block
  };

  // the ground the bases stand on: picked in terrain() so camSetup and
  // init() both know it. player at the centre, the rest at the compass

  function dist2(ax, ay, bx, by) {
    return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  }

  class ScenarioRTS {
    constructor() {
      this.paused = false;
      this.timeScale = 1;
      this.over = null; // 'won' | 'lost'
      this.t = 0;
      this.day = 1;
      this.night = false;
      this.clock = 0;
      this.sel = [];
      this.selB = null;
      this.build = null; // the armed build kind
      this.drag = null; // the wall line being dragged out
      this.markers = [];
      this.shots = [];
      this.alerts = [];
      this.kills = 0;
      this.lost = 0;
      this._pingT = 0;
      this._gateT = 0;
      this.randT = 0;
      this.keys = {};
      this.mouse = { x: -1, y: -1 };
      this.beatT = 99999; // the round machinery is never used
    }

    /* ---------- the scenario's own dice ---------- */

    seedRand(seed) {
      this._rng = ZS.rng32(seed ^ 0x5152);
    }
    rand() {
      this._rng = this._rng || ZS.rng32(0x5152);
      return this._rng();
    }

    /* ---------- the map ---------- */

    terrain(world, nav) {
      world.water();
      nav.markWater();
      world.layoutForest();
      this.seedRand(world.seed);
      // the bases want dry, open ground: the player near the middle, the
      // nations at the compass, each well off the water
      this.bases = [];
      const spots = [
        { x: world.w * 0.5, y: world.h * 0.5 },
        { x: world.w * 0.24, y: world.h * 0.72 },
        { x: world.w * 0.24, y: world.h * 0.26 },
        { x: world.w * 0.76, y: world.h * 0.72 },
        { x: world.w * 0.76, y: world.h * 0.26 },
      ];
      for (let i = 0; i < spots.length; i++) {
        const p = this._drySpot(world, nav, spots[i].x, spots[i].y);
        this.bases.push({ x: p.x, y: p.y, fac: i });
      }
      // the oil: eleven seeps — one near each base, the rest contested
      this.oilSpots = [];
      for (let i = 0; i < this.bases.length; i++) {
        const b = this.bases[i];
        const an = this.rand() * 6.283;
        const rr = 620 + this.rand() * 220;
        const p = this._drySpot(world, nav, b.x + Math.cos(an) * rr, b.y + Math.sin(an) * rr, 1);
        this.oilSpots.push({ x: p.x, y: p.y, used: false, home: i });
      }
      for (let i = 0; i < 6; i++) {
        const x = world.w * (0.2 + this.rand() * 0.6);
        const y = world.h * (0.2 + this.rand() * 0.6);
        const p = this._drySpot(world, nav, x, y, 1);
        this.oilSpots.push({ x: p.x, y: p.y, used: false, home: -1 });
      }
      // the wood and the scattered trees, placed by hand so the bases keep
      // their sightlines (the world's own tree pass is skipped for custom
      // terrain)
      const rng = ZS.rng32(world.seed ^ 0x7ee5);
      const clear = (x, y) => {
        for (const b of this.bases) if (dist2(x, y, b.x, b.y) < 460 * 460) return false;
        return true;
      };
      const f = world.forest;
      if (f)
        for (let i = 0; i < 80; i++) {
          const an = rng() * 6.283,
            rr = Math.sqrt(rng()) * f.r * 0.92;
          const x = f.x + Math.cos(an) * rr,
            y = f.y + Math.sin(an) * rr * 0.9;
          if (clear(x, y)) world.placeTree(x, y, rng);
        }
      for (let g = 0; g < 8; g++) {
        const gx = 220 + rng() * (world.w - 440),
          gy = 220 + rng() * (world.h - 440);
        if (!clear(gx, gy)) continue;
        const n = 6 + Math.floor(rng() * 8);
        for (let k = 0; k < n; k++)
          world.placeTree(gx + (rng() - 0.5) * 300, gy + (rng() - 0.5) * 260, rng);
      }
      for (let i = 0; i < 26; i++) {
        const x = 120 + rng() * (world.w - 240),
          y = 120 + rng() * (world.h - 240);
        if (clear(x, y)) world.placeTree(x, y, rng);
      }
    }

    // nearest dry, open point to (x, y): walks outward in a spiral until
    // the ground holds a whole base footprint clear of water
    _drySpot(world, nav, x, y, small) {
      const pad = small ? 90 : 380;
      if (this._dry(world, nav, x, y, pad)) return { x, y };
      for (let r = 90; r <= 1400; r += 90) {
        const n = Math.max(8, (r / 60) | 0);
        for (let k = 0; k < n; k++) {
          const an = (k / n) * 6.283 + r * 0.011;
          const px = ZS.clamp(x + Math.cos(an) * r, 420, world.w - 420);
          const py = ZS.clamp(y + Math.sin(an) * r, 420, world.h - 420);
          if (this._dry(world, nav, px, py, pad)) return { x: px, y: py };
        }
      }
      return { x: world.w / 2, y: world.h / 2 };
    }

    _dry(world, nav, x, y, pad) {
      if (!nav.isWalkable(x, y, false)) return false;
      if (world.nearRiver(x, y, pad * 0.5 + 70)) return false;
      if (world.inLake(x, y, -pad)) return false;
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * 6.283;
        const px = x + Math.cos(an) * pad,
          py = y + Math.sin(an) * pad;
        if (!nav.isWalkable(px, py, false)) return false;
        if (world.nearRiver(px, py, 60)) return false;
      }
      return true;
    }

    camSetup(cam, W, H) {
      const b = this.bases[0];
      cam.x = b.x;
      cam.y = b.y;
      cam.zoom = ZS.clamp(Math.min(W, H) / 900, 0.7, 1.15);
      cam.minZoom = 0.14;
      cam.maxZoom = 2.8;
      cam.clamp(W, H);
    }

    attachStains(st) {
      this.stains = st;
      st.register("blood", (sc, x, y, seed) => {
        st.fillBlob(x, y, 6 + ZS.hash(seed) * 5, seed, "rgba(128,52,38,0.28)");
      });
      st.register("scorch", (sc, x, y, seed) => {
        st.fillBlob(x, y, 9 + ZS.hash(seed) * 10, seed, "rgba(52,48,42,0.2)");
      });
      st.register("corpse", (sc, a) => {
        sc.strokeStyle = "rgba(52,46,38,0.5)";
        sc.lineWidth = 1.6;
        ZS.wline(sc, a.x - 5, a.y - 2, a.x + 5, a.y + 3, a.seed, 0.5);
        ZS.wline(sc, a.x - 4, a.y + 4, a.x + 4, a.y - 3, a.seed + 2, 0.5);
      });
      st.register("wreck", (sc, x, y, seed) => {
        st.fillBlob(x, y, 13, seed, "rgba(48,46,42,0.3)");
        sc.strokeStyle = "rgba(58,54,46,0.6)";
        sc.lineWidth = 1.8;
        ZS.wline(sc, x - 9, y - 3, x + 8, y + 2, seed + 3, 0.6);
        ZS.wline(sc, x - 6, y + 5, x + 6, y - 5, seed + 4, 0.6);
      });
    }

    /* ---------- opening the game ---------- */

    init(agents, world, _vw, _vh) {
      this.agents = agents;
      this.world = world;
      this.nav = world.nav;
      agents.length = 0;
      this.t = 0;
      this.day = 1;
      this.night = false;
      this.clock = 0;
      this.over = null;
      this.paused = false;
      this.sel = [];
      this.selB = null;
      this.build = null;
      this.drag = null;
      this.markers = [];
      this.shots = [];
      this.alerts = [];
      this.kills = 0;
      this.lost = 0;
      this.repairB = null;
      this.seedRand(world.seed);
      world.buildings.length = 0;

      this.facs = ZS.RtsNations.create(this);
      // the five bases: the hollow is bigger, all of them are walled
      for (let i = 0; i < this.bases.length; i++) {
        const b = this.bases[i];
        this._buildBase(b.fac, b.x, b.y, b.fac === 0);
      }
      // one neutral derrick on each home seep
      for (const spot of this.oilSpots) {
        if (spot.home < 0) continue;
        const r = ZS.Structs.place(world, world.nav, "oil", spot.x, spot.y, {});
        if (r.ok) {
          r.s.fac = -1;
          spot.used = true;
        }
      }
      ZS.Horde.create(this);

      // starting armies — the war is machines, and they muster inside the
      // walls, on clear ground: the scout cars on the gate road south of
      // the gun nests, the tanks in the open column between them
      const home = this.bases[0];
      for (let i = 0; i < BAL.START_CARS; i++) {
        const a = this.spawnUnit(0, "scout", home.x - 100 + i * 50, home.y + 190);
        if (a) a.ord = null;
      }
      for (let k = 0; k < BAL.START_TANKS; k++)
        this.spawnUnit(0, "tank", home.x - 10 + k * 20, home.y + 150);
      for (let i = 1; i <= 4; i++) {
        const b = this.bases[i];
        for (let k = 0; k < BAL.AI_CARS; k++)
          this.spawnUnit(i, "scout", b.x - 52 + k * 52, b.y + 170);
      }
    }

    // a walled square: the hall in the middle, the houses and the
    // production inside, the guns at the gate and outside the wire
    _buildBase(fac, cx, cy, big) {
      const R = big ? 240 : 200;
      const put = (kind, x, y, opt) => {
        const r = ZS.Structs.place(this.world, this.nav, kind, x, y, opt || {});
        if (r.ok) {
          r.s.fac = fac;
          r.s.queue = [];
          if (kind === "oil") r.s.workT = 1;
        }
        return r.ok ? r.s : null;
      };
      const hq = put("hall", cx, cy);
      put("hut", cx - R * 0.45, cy - R * 0.4);
      put("hut", cx + R * 0.45, cy - R * 0.4);
      if (big) {
        // the foundry is 116 wide: the west lane between the wall and the
        // hall is the only ground inside the ring that holds it
        put("foundry", cx - R * 0.64, cy + R * 0.25);
        put("hut", cx + R * 0.48, cy + R * 0.34);
      } else {
        put("hut", cx + R * 0.48, cy + R * 0.36);
      }
      // the wall ring, with a gate south (and north, for the big bases)
      this._wallRing(fac, cx, cy, R, big ? 2 : 1);
      // the guns: one turret either side of the south gate, outside the
      // wire, and a nest inside covering the door
      put("turret", cx - R - 60, cy + R * 0.55);
      put("turret", cx + R + 60, cy + R * 0.55);
      put("gunNest", cx + R * 0.22, cy + R * 0.62);
      if (big) put("gunNest", cx - R * 0.22, cy + R * 0.62);
      return hq;
    }

    _wallRing(fac, cx, cy, R, gates) {
      const place = (kind, x, y, rot) => {
        const s = ZS.Structs.make(kind, x, y);
        if (rot) {
          s.rot = 1;
          const t = s.w;
          s.w = s.h;
          s.h = t;
          // make() centred off the un-swapped sizes; re-centre the top-left
          s.x = Math.round(x - s.w / 2);
          s.y = Math.round(y - s.h / 2);
          s.cx = s.x + s.w / 2;
          s.cy = s.y + s.h / 2;
        }
        ZS.Structs.mark(this.nav, s, 0);
        this.world.buildings.push(s);
        s.fac = fac;
        s.queue = [];
        return s;
      };
      // south run with the gate in its middle; north run (with a gate on
      // the big bases); east and west runs whole
      const segLen = ZS.Structs.CAT.wall.w;
      const runH = (y, withGate) => {
        const n = Math.round((R * 2) / (segLen - 4));
        const x0 = cx - R;
        for (let i = 0; i <= n; i++) {
          const x = x0 + i * (segLen - 4);
          if (x > cx + R) break;
          if (withGate && Math.abs(x - cx) < 44) continue;
          place("wall", x, y, false);
        }
        if (withGate) place("gate", cx, y);
      };
      const runV = (x) => {
        const n = Math.round((R * 2) / (segLen - 4));
        const y0 = cy - R;
        for (let i = 0; i <= n; i++) {
          const y = y0 + i * (segLen - 4);
          if (y > cy + R) break;
          place("wall", x, y, true);
        }
      };
      runH(cy + R, true);
      runH(cy - R, gates > 1);
      runV(cx - R);
      runV(cx + R);
    }

    /* ---------- the engine contract ---------- */

    left() {
      return 1; // the round machinery never turns; endings are this.over
    }
    counts() {
      return { l: this.agents.length };
    }
    hostile(a) {
      return a.fac !== 0; // the nations and the dead get the A* budget first
    }
    walkBlocked() {
      return false;
    }
    maxSpeed(a) {
      if (a.st === 2) return a.spd || 50;
      const d = ZS.Units.CAT[a.unit];
      return d ? d.spd : 80;
    }

    makeAgent(x, y, st, extra) {
      const a = {
        x,
        y,
        vx: 0,
        vy: 0,
        a: 0,
        st,
        seed: Math.random() * 997,
        hp: 10,
        maxHp: 10,
        flash: 0,
        sayT: 0,
        say: "",
        sayMax: 0,
        gait: 0,
        stuckT: 0,
        px: x,
        py: y,
        wantMove: false,
        path: null,
        pi: 0,
        gx: null,
        gy: null,
        navV0: -1,
        planFailT: 0,
        bld: -1,
        move: 0,
        kick: 0,
        swing: 0,
        muzzle: 0,
        atkT: 0,
        turn: 0,
        sel: false,
        ord: null,
        fac: 0,
        free: 0,
        dead: false,
        gone: false,
      };
      if (extra) Object.assign(a, extra);
      return a;
    }

    /* ---------- spawning ---------- */

    spawnUnit(fac, id, x, y) {
      const d = ZS.Units.CAT[id];
      if (!d) return null;
      const p =
        d.fly || d.water ? { x, y } : this.nav.nearestWalkable(x, y, 120, false) || { x, y };
      const a = this.makeAgent(p.x, p.y, 4, {
        unit: id,
        fac,
        foe: fac === 0 ? 0 : 1,
        hp: d.hp,
        maxHp: d.hp,
        free: d.fly ? 1 : d.water ? 1 : 0,
        kick: 0,
        swing: 0,
        atkT: 0,
        move: 0,
        turn: 0,
        retarget: 0,
        scale: 1,
      });
      this.agents.push(a);
      if (fac === 0) {
        this._pop(a.x, a.y - 30, d.name, "#5a7a3a");
      }
      return a;
    }

    spawnZombie(type, x, y, tgt) {
      const T = ZS.Horde.TYPES[type] || ZS.Horde.TYPES.walker;
      const p = this.nav.nearestWalkable(x, y, 90, false) || { x, y };
      const a = this.makeAgent(p.x, p.y, 2, {
        fac: -1,
        foe: 1,
        hp: T.hp,
        maxHp: T.hp,
        spd: T.spd,
        dmg: T.dmg,
        rate: T.rate,
        zType: T.z || "",
        tgt: null,
        tgtB: null,
        retarget: 0,
        swing: 0,
        scale: type === "brute" ? 1.25 : 1,
      });
      if (tgt) a.ord = { k: "horde", x: tgt.x, y: tgt.y };
      this.agents.push(a);
      if (ZS.sound && Math.random() < 0.3) ZS.sound.event("moan", x, y);
      return a;
    }

    /* ---------- queries the modules call ---------- */

    bldsOf(fac, kind) {
      const out = [];
      for (const b of this.world.buildings)
        if (b.fac === fac && (!kind || b.kind === kind)) out.push(b);
      return out;
    }

    unitsOf(fac) {
      const out = [];
      for (const a of this.agents) if (a.st === 4 && a.fac === fac && !a.dead) out.push(a);
      return out;
    }

    idleUnits(fac) {
      const out = [];
      for (const a of this.agents)
        if (a.st === 4 && a.fac === fac && !a.dead && (!a.ord || a.ord.k === "idle")) out.push(a);
      return out;
    }

    supMax(fac) {
      let n = ZS.Roster.SUP_START;
      for (const b of this.world.buildings) {
        if (b.fac !== fac || b.ruined || !b.built) continue;
        const bd = ZS.Roster.BUILD[b.kind];
        if (bd && bd.sup) n += bd.sup * (b.lvl || 1);
      }
      return Math.min(ZS.Roster.SUP_CAP, n);
    }

    supUsed(fac) {
      let n = 0;
      for (const a of this.agents)
        if (a.st === 4 && a.fac === fac && !a.dead) n += ZS.Units.CAT[a.unit].sup || 1;
      return n;
    }

    nearestNeutralDerrick(x, y, maxR) {
      let best = null,
        bd = maxR * maxR;
      for (const b of this.world.buildings) {
        if (b.kind !== "oil" || b.fac !== -1 || b.ruined) continue;
        const dd = dist2(x, y, b.cx, b.cy);
        if (dd < bd) {
          bd = dd;
          best = b;
        }
      }
      return best;
    }

    /* ---------- the clock ---------- */

    maintain(agents, dt, world, vw, vh) {
      if (this.over) return;
      this.t += dt;
      this.vw = vw;
      this.vh = vh;
      this.clock += dt;
      if (!this.night && this.clock >= BAL.DAY_LEN) {
        this.night = true;
        this.toast("dark falls — the nests are waking");
        if (ZS.RtsUI && ZS.RtsUI.setNight) ZS.RtsUI.setNight(true);
        ZS.Horde.surge(this);
      } else if (this.night && this.clock >= BAL.DAY_LEN + BAL.NIGHT_LEN) {
        this.night = false;
        this.clock = 0;
        this.day++;
        this.toast("day " + this.day);
        if (ZS.RtsUI && ZS.RtsUI.setNight) ZS.RtsUI.setNight(false);
      }
      // the money
      for (const f of this.facs) {
        if (f.dead && f.i !== 0) continue;
        const inc = f.i === 0 ? this.playerIncome() : ZS.RtsNations.income(this, f);
        f.funds = Math.min(BAL.FUNDS_CAP, f.funds + inc * dt);
      }
      // the nations think
      ZS.RtsNations.tick(this, dt);
      // the dead leak
      ZS.Horde.tick(this, dt);
      // construction, production, capture, gates, repair
      this._buildTick(dt);
      this._produceTick(dt);
      this._captureTick(dt);
      this._gateTick(dt);
      this._repairTick(dt);
      // the camera under the player's keys
      this._camTick(dt, vw, vh);
      // the warnings age out
      for (let i = this.alerts.length - 1; i >= 0; i--) {
        this.alerts[i].t -= dt;
        if (this.alerts[i].t <= 0) this.alerts.splice(i, 1);
      }
      // what is over
      this._endCheck();
    }

    playerIncome() {
      let inc = 2;
      const hq = this.bldsOf(0, "hall")[0];
      if (!hq || hq.ruined) inc = 0.5;
      for (const b of this.world.buildings)
        if (b.kind === "oil" && b.fac === 0 && b.built && !b.ruined) inc += 5;
      return inc;
    }

    frame(_agents, dt, _t, grid, _nav) {
      this.grid = grid;
      // what is in the air
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const s = this.shots[i];
        s.t -= dt;
        if (s.t > 0) continue;
        this.shots.splice(i, 1);
        this._land(s);
      }
      // the order markers fade
      for (let i = this.markers.length - 1; i >= 0; i--) {
        this.markers[i].t -= dt;
        if (this.markers[i].t <= 0) this.markers.splice(i, 1);
      }
      // the defensive guns
      this._gunsTick(dt, grid);
    }

    /* ---------- the economy ---------- */

    pay(fac, money) {
      const f = this.facs[fac];
      if (f.funds < money) return false;
      f.funds -= money;
      return true;
    }

    trainUnit(fac, b, id, quiet) {
      const d = ZS.Units.CAT[id];
      if (!d || b.ruined || !b.built) return { ok: false, err: "it stands broken" };
      if ((b.queue || []).length >= 5) return { ok: false, err: "the queue is full" };
      if (this.supUsed(fac) + (d.sup || 1) > this.supMax(fac))
        return { ok: false, err: "no room under arms — build houses" };
      if (!this.pay(fac, d.money)) return { ok: false, err: "not enough funds" };
      b.queue.push({ id, p: 0 });
      if (fac === 0 && !quiet) this.toast(d.name + " — " + d.money + " funds");
      return { ok: true };
    }

    _produceTick(dt) {
      for (const b of this.world.buildings) {
        if (!b.queue || !b.queue.length || b.ruined || !b.built) continue;
        const q = b.queue[0];
        const d = ZS.Units.CAT[q.id];
        const mul = 1 + 0.12 * ((b.lvl || 1) - 1);
        q.p += (dt * mul) / d.train;
        if (q.p < 1) continue;
        b.queue.shift();
        this._muster(b, q.id);
      }
    }

    _muster(b, id) {
      const d = ZS.Units.CAT[id];
      const cx = b.x + b.w / 2,
        cy = b.y + b.h / 2;
      let at = (b.rally && { x: b.rally.x, y: b.rally.y }) || null;
      if (!at) at = { x: cx, y: b.y + b.h + 30 };
      if (d.water) {
        // the nearest water the slipway can reach
        let best = null,
          bd = 1e18;
        for (let i = 0; i < 40; i++) {
          const an = (i / 40) * 6.283;
          for (let r = 30; r <= 320; r += 40) {
            const px = cx + Math.cos(an) * r,
              py = cy + Math.sin(an) * r;
            if (!this.nav.isWater(px, py)) continue;
            const dd = r;
            if (dd < bd) {
              bd = dd;
              best = { x: px, y: py };
            }
            break;
          }
        }
        if (best) at = best;
      }
      const a = this.spawnUnit(b.fac, id, at.x, at.y);
      if (a && !d.fly && !d.water) {
        const p = this.nav.nearestWalkable(at.x, at.y, 80, false);
        if (p) {
          a.x = p.x;
          a.y = p.y;
        }
      }
    }

    _buildTick(dt) {
      for (const b of this.world.buildings) {
        if (b.built || b.ruined) continue;
        const bd = ZS.Roster.BUILD[b.kind];
        b.prog += dt / (bd ? bd.time : 20);
        if (b.prog >= 1) {
          b.prog = 1;
          b.built = true;
          if (b.kind === "oil") b.workT = 1;
          if (b.fac === 0) this.toast(ZS.Structs.CAT[b.kind].name + " stands");
        }
      }
    }

    _captureTick(dt) {
      for (const b of this.world.buildings) {
        if (b.kind !== "oil" || b.ruined) continue;
        // who is standing on it
        const here = {};
        for (const a of this.agents) {
          if (a.st !== 4 || a.dead) continue;
          const d = ZS.Units.CAT[a.unit];
          if (d.fly) continue;
          if (dist2(a.x, a.y, b.cx, b.cy) > 62 * 62) continue;
          here[a.fac] = (here[a.fac] || 0) + 1;
        }
        const facs = Object.keys(here);
        if (facs.length !== 1) {
          b.capP = Math.max(0, (b.capP || 0) - dt * 0.4);
          b.capFac = facs.length ? b.capFac : undefined;
          continue;
        }
        const fac = +facs[0];
        if (b.fac === fac) continue;
        if (b.capFac !== fac) {
          b.capFac = fac;
          b.capP = 0;
        }
        b.capP = (b.capP || 0) + dt / BAL.CAP_T;
        if (b.capP < 1) continue;
        b.capP = 0;
        const was = b.fac;
        b.fac = fac;
        b.workT = 1;
        if (fac === 0) this.toast("the derrick is ours");
        else if (was === 0) this.alarm("a derrick has been taken");
        if (ZS.sound) ZS.sound.event("horn", b.cx, b.cy);
      }
    }

    _gateTick(dt) {
      this._gateT -= dt;
      if (this._gateT > 0) return;
      this._gateT = 0.35;
      for (const b of this.world.buildings) {
        if (b.kind !== "gate" || b.ruined) continue;
        let near = false;
        for (const a of this.agents) {
          if (a.st !== 4 || a.fac !== b.fac || a.dead) continue;
          if (dist2(a.x, a.y, b.cx, b.cy) < 84 * 84) {
            near = true;
            break;
          }
        }
        if (near === !!b.open) continue;
        b.open = near;
        ZS.Structs.mark(this.nav, b, near ? 1 : 0);
      }
    }

    _repairTick(dt) {
      const b = this.repairB;
      if (!b) return;
      if (b.hp >= b.maxHp && !b.ruined) {
        this.repairB = null;
        return;
      }
      const f = this.facs[0];
      const cost = BAL.REPAIR_COST * dt;
      if (f.funds < cost) {
        this.toast("out of funds — the repair stalls");
        this.repairB = null;
        return;
      }
      f.funds -= cost;
      b.hp = Math.min(b.maxHp, b.hp + BAL.REPAIR_HP * dt);
      if (b.ruined && b.hp > b.maxHp * 0.3) b.ruined = false;
      if (Math.random() < dt * 6)
        ZS.Fx.spark(
          this,
          b.cx + (Math.random() - 0.5) * b.w * 0.6,
          b.y + b.h * 0.5,
          (b.seed + this.t * 9) | 0,
          3,
        );
    }

    /* ---------- buildings: damage, upgrades, placement ---------- */

    damageStruct(b, dmg, _by) {
      if (!b || b.hp <= 0) return;
      b.hp -= dmg;
      b.flashT = 0.2;
      const fac = b.fac;
      if (fac >= 0 && fac < this.facs.length) {
        const f = this.facs[fac];
        f.hot = { x: b.cx, y: b.cy };
        f.hotT = this.t;
        if (fac === 0)
          this._ping("something is hitting the " + ZS.Structs.CAT[b.kind].name, b.cx, b.cy);
      }
      if (b.hp > 0) return;
      if (!b.ruined) {
        // it comes down: a ruin with a little strength left in it
        b.ruined = true;
        b.hp = Math.round(b.maxHp * 0.25);
        b.queue = [];
        ZS.Fx.burst(this, b.cx, b.cy, Math.min(60, b.w * 0.6), b.seed);
        ZS.Fx.smoke(this, b.cx, b.cy - 10, b.w * 0.3, b.seed + 7);
        if (ZS.sound) ZS.sound.event("boom", b.cx, b.cy);
        if (b.kind === "hall") {
          this.toast(
            ZS.FACPAINT[fac] ? ZS.FACPAINT[fac].name + "'s hall has fallen" : "the hall has fallen",
          );
          if (fac >= 1 && fac <= 4) this.facs[fac].dead = true;
        }
        if (fac === 0) this.alarm("the " + ZS.Structs.CAT[b.kind].name + " is down");
      } else {
        b.hp = 0; // dust
        ZS.Fx.smoke(this, b.cx, b.cy, b.w * 0.4, b.seed + 9);
      }
      if (this.selB === b && b.hp <= 0) this.selB = null;
    }

    upgrade(b) {
      const c = ZS.Structs.CAT[b.kind];
      const bd = ZS.Roster.BUILD[b.kind];
      if (!b.built || b.ruined) return this.toast("it stands broken — repair it first");
      if (b.lvl >= c.lvlMax) return this.toast("it is already at its height");
      const cost = Math.round((bd ? bd.money : 200) * 0.7 * b.lvl);
      if (!this.pay(0, cost)) return this.toast("not enough funds");
      b.lvl++;
      b.maxHp = Math.round(b.maxHp * 1.35);
      b.hp = b.maxHp;
      this._pop(b.cx, b.y - 10, "level " + b.lvl, "#5a7a3a");
      if (ZS.sound) ZS.sound.event("horn", b.cx, b.cy);
    }

    sell(b) {
      const bd = ZS.Roster.BUILD[b.kind];
      const back = Math.round(((bd ? bd.money : 100) * (b.lvl || 1)) / 2);
      this.facs[0].funds = Math.min(BAL.FUNDS_CAP, this.facs[0].funds + back);
      ZS.Structs.remove(this.world, this.nav, b);
      if (this.stains) this.stains.splat(b.cx, b.cy, "scorch", b.seed);
      this.toast("+" + back + " funds");
      if (this.selB === b) this.selB = null;
    }

    // can a faction raise this here: the ground, the territory, the water,
    // the seeps
    canBuildAt(fac, kind, x, y) {
      const bd = ZS.Roster.BUILD[kind];
      if (!bd) return { ok: false, err: "unknown" };
      if (kind === "oil") {
        let spot = null;
        for (const s of this.oilSpots) if (!s.used && dist2(x, y, s.x, s.y) < 46 * 46) spot = s;
        if (!spot) return { ok: false, err: "a derrick stands on an oil seep" };
        x = spot.x;
        y = spot.y;
      }
      if (kind === "dock") {
        let water = false;
        for (let i = 0; i < 16 && !water; i++) {
          const an = (i / 16) * 6.283;
          for (let r = 30; r <= 130; r += 30) {
            if (this.nav.isWater(x + Math.cos(an) * r, y + Math.sin(an) * r)) {
              water = true;
              break;
            }
          }
        }
        if (!water) return { ok: false, err: "a dock needs water beside it" };
      }
      // the territory: nothing is raised farther than the claim from what
      // is already yours
      let claimed = false;
      for (const b of this.world.buildings) {
        if (b.fac !== fac || b.ruined) continue;
        const r = b.kind === "flag" ? BAL.FLAG_R : BAL.CLAIM_R;
        if (dist2(x, y, b.cx, b.cy) < r * r) {
          claimed = true;
          break;
        }
      }
      if (!claimed) return { ok: false, err: "beyond your reach — push a flag out" };
      const chk = ZS.Structs.canPlace(this.world, this.nav, kind, x, y);
      if (!chk.ok) return chk;
      return {
        ok: true,
        x: chk.x + ZS.Structs.CAT[kind].w / 2,
        y: chk.y + ZS.Structs.CAT[kind].h / 2,
      };
    }

    placeBuild(fac, kind, x, y) {
      const chk = this.canBuildAt(fac, kind, x, y);
      if (!chk.ok) return chk;
      const bd = ZS.Roster.BUILD[kind];
      if (!this.pay(fac, bd.money)) return { ok: false, err: "not enough funds" };
      const r = ZS.Structs.place(this.world, this.nav, kind, chk.x, chk.y, {});
      if (!r.ok) {
        this.facs[fac].funds += bd.money;
        return r;
      }
      r.s.fac = fac;
      r.s.built = false;
      r.s.prog = 0;
      r.s.queue = [];
      if (kind === "oil") {
        for (const s of this.oilSpots) if (dist2(chk.x, chk.y, s.x, s.y) < 46 * 46) s.used = true;
      }
      if (kind === "flag") r.s.flagCol = (ZS.FACPAINT[fac] || {}).cloth;
      if (fac === 0) {
        this.toast(bd.name + " — " + bd.money + " funds");
        if (ZS.sound) ZS.sound.event("v_grunt", x, y);
      }
      return r;
    }

    // the AI's hand: find somewhere to raise a kind, toward the enemy for
    // guns, around the hall for everything else
    aiBuild(fac, kind) {
      const hq = this.bldsOf(fac, "hall")[0];
      if (!hq) return false;
      const bd = ZS.Roster.BUILD[kind];
      if (this.facs[fac].funds < bd.money) return false;
      const hx = hq.x + hq.w / 2,
        hy = hq.y + hq.h / 2;
      let face = this.rand() * 6.283;
      if (kind === "turret" || kind === "gunNest") {
        // the guns look the way the war is
        let best = null,
          bd2 = 1e18;
        for (const b of this.world.buildings) {
          if (b.fac === fac || b.fac < 0 || b.ruined) continue;
          const dd = dist2(hx, hy, b.cx, b.cy);
          if (dd < bd2) {
            bd2 = dd;
            best = b;
          }
        }
        if (best) face = Math.atan2(best.cy - hy, best.cx - hx);
      }
      for (let i = 0; i < 26; i++) {
        const an = face + (this.rand() - 0.5) * (kind === "turret" ? 1.2 : 6.283);
        const rr = kind === "turret" ? 250 + this.rand() * 90 : 130 + this.rand() * 210;
        const x = hx + Math.cos(an) * rr,
          y = hy + Math.sin(an) * rr;
        const r = this.placeBuild(fac, kind, x, y);
        if (r.ok) return true;
      }
      return false;
    }

    /* ---------- the guns that stand still ---------- */

    _gunsTick(dt, grid) {
      for (const b of this.world.buildings) {
        if ((b.kind !== "turret" && b.kind !== "gunNest") || !b.built || b.ruined) continue;
        b.cd = (b.cd || 0) - dt;
        b.flash = Math.max(0, (b.flash || 0) - dt);
        const lvl = b.lvl || 1;
        const turret = b.kind === "turret";
        const range = turret ? 300 + 26 * (lvl - 1) : 215 + 18 * (lvl - 1);
        let best = null,
          bd = range * range;
        grid.query(b.cx, b.cy, range, (o) => {
          if (o.dead || o.gone || o.fac === b.fac) return;
          if (o.st === 4) {
            const d = ZS.Units.CAT[o.unit];
            if (d.fly && !turret) return; // the nest cannot reach the sky
          }
          const dd = dist2(b.cx, b.cy, o.x, o.y);
          if (dd < bd) {
            bd = dd;
            best = o;
          }
        });
        if (!best) continue;
        b.tAng = Math.atan2(best.y - (b.cy - 12), best.x - b.cx);
        if (b.cd > 0) continue;
        if (!this.nav.los(b.cx, b.cy - 12, best.x, best.y, false) && !turret) continue;
        if (turret) {
          b.cd = 1.9;
          b.flash = 0.22;
          const dmg = 36 * (1 + 0.25 * (lvl - 1));
          ZS.Fx.shell(
            this,
            b.cx + Math.cos(b.tAng) * 22,
            b.cy - 30 + Math.sin(b.tAng) * 12,
            best.x,
            best.y,
            0,
            (b.seed + this.t * 13) | 0,
          );
          this.shots.push({
            t: 0.45,
            x: best.x,
            y: best.y,
            dmg,
            splash: 26,
            siege: 1.6,
            fac: b.fac,
            seed: (b.seed + this.t * 13) | 0,
          });
          if (ZS.sound) ZS.sound.event("turret", b.cx, b.cy);
        } else {
          b.cd = 0.28;
          b.flash = 0.12;
          const dmg = 7 * (1 + 0.2 * (lvl - 1));
          this.fx.push({
            x0: b.cx + Math.cos(b.tAng) * 14,
            y0: b.cy - 12 + Math.sin(b.tAng) * 8,
            x1: best.x,
            y1: best.y - 8,
            t: 0.08,
            tracer: 1,
            seed: b.seed,
          });
          this.hurt(best, dmg, { fac: b.fac, st: 4 }, false);
          if (ZS.sound) ZS.sound.event("shot_smg", b.cx, b.cy);
        }
      }
    }

    /* ---------- orders ---------- */

    orderUnit(a, ord) {
      a.ord = ord;
      a.path = null;
      a.gx = null;
      a.stuckT = 0;
    }

    orderAmove(a, x, y) {
      this.orderUnit(a, { k: "amove", wps: this._legs(a.x, a.y, x, y), i: 0 });
    }

    // long walks are broken into legs so A* is never asked for the whole
    // theatre at once
    _legs(x0, y0, x1, y1) {
      const d = Math.hypot(x1 - x0, y1 - y0);
      if (d <= BAL.WP_LEN) return [{ x: x1, y: y1 }];
      const n = Math.ceil(d / BAL.WP_LEN);
      const out = [];
      for (let i = 1; i <= n; i++)
        out.push({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n });
      return out;
    }

    issueMove(units, x, y, mode) {
      if (!units.length) return;
      // the slots: a block facing the way it is going
      const n = units.length;
      const per = Math.max(1, Math.ceil(Math.sqrt(n)));
      units.sort((a, b) => a.x - b.x);
      const gap = BAL.FORM;
      const ang = Math.atan2(y - units[0].y, x - units[0].x);
      const ca = Math.cos(ang),
        sa = Math.sin(ang);
      for (let i = 0; i < n; i++) {
        const col = i % per,
          row = (i / per) | 0;
        const inRow = Math.min(per, n - row * per);
        const ox = (col - (inRow - 1) / 2) * gap;
        // the block stands across the march, rank behind rank
        const sx = x - ca * (row * gap) - sa * ox;
        const sy = y - sa * (row * gap) + ca * ox;
        const a = units[i];
        const wps = this._legs(a.x, a.y, sx, sy);
        this.orderUnit(a, { k: mode || "move", wps, i: 0, ang });
      }
      this.markers.push({ x, y, t: 1.4, kind: mode === "amove" ? "atk" : "move", fac: 0 });
      if (ZS.sound) ZS.sound.event("v_callout", x, y);
    }

    issueAttack(units, tgt) {
      for (const a of units) {
        this.orderUnit(a, { k: "atk", tgt });
      }
      const px = tgt.x !== undefined ? tgt.x : tgt.cx;
      const py = tgt.y !== undefined ? tgt.y : tgt.cy;
      this.markers.push({ x: px, y: py, t: 1.4, kind: "atk", fac: 0 });
      if (ZS.sound) ZS.sound.event("v_shout", px, py);
    }

    /* ---------- one soldier, one frame ---------- */

    update(a, dt, t, grid, nav) {
      if (a.dead) return;
      if (a.st === 2) return this.updateZombie(a, dt, t, grid, nav);
      const d = ZS.Units.CAT[a.unit];
      a.atkT = Math.max(0, a.atkT - dt);
      a.kick = Math.max(0, a.kick - dt * 2.4);
      a.swing = Math.max(0, a.swing - dt * 2.6);
      a.muzzle = Math.max(0, a.muzzle - dt);
      a.retarget = (a.retarget || 0) - dt;
      const sp = d.spd;
      if (d.fly) return this.updateFlyer(a, d, dt, grid, nav);
      if (d.water) return this.updateBoat(a, d, dt, nav);
      const ord = a.ord;
      if (!ord) {
        // standing to: look out, and fight what comes close
        const o = this._findFoe(a, BAL.SIGHT, grid, d);
        if (o) this.engage(a, o, d, dt, t, nav);
        else {
          a.vx *= 0.86;
          a.vy *= 0.86;
        }
        return;
      }
      if (ord.k === "move" || ord.k === "amove") {
        const wp = ord.wps[ord.i];
        if (!wp) {
          a.ord = null;
          return;
        }
        if (ord.k === "amove") {
          const o = this._findFoe(a, BAL.AGGRO, grid, d);
          if (o) {
            this.engage(a, o, d, dt, t, nav);
            return;
          }
        }
        a.wantMove = true;
        const r = ZS.planAndFollow(a, wp, false, sp, dt, t, nav);
        if (r === "arrived") {
          ord.i++;
          a.path = null;
          if (ord.i >= ord.wps.length) a.ord = null;
        }
        this._trail(a, d, dt);
        return;
      }
      if (ord.k === "hold") {
        a.vx *= 0.84;
        a.vy *= 0.84;
        const o = this._findFoe(a, BAL.SIGHT, grid, d);
        if (o) this.engage(a, o, d, dt, t, nav, true);
        return;
      }
      if (ord.k === "capture") {
        const b = ord.tgt;
        if (!b || b.hp <= 0 || b.fac === a.fac) {
          a.ord = null;
          return;
        }
        if (dist2(a.x, a.y, b.cx, b.cy) > 44 * 44) {
          a.wantMove = true;
          ZS.planAndFollow(a, { x: b.cx, y: b.cy + 30 }, false, sp, dt, t, nav);
        } else {
          a.vx *= 0.8;
          a.vy *= 0.8;
        }
        return;
      }
      if (ord.k === "atk") {
        const tgt = ord.tgt;
        // a building stands still; a unit may not
        if (tgt && tgt.hp !== undefined && tgt.unit === undefined) {
          if (tgt.hp <= 0) {
            a.ord = null;
            return;
          }
          const dd = ZS.Structs.dist(tgt, a.x, a.y);
          const reach = Math.max(40, (d.rng || 30) * 0.9);
          if (dd > reach) {
            a.wantMove = true;
            ZS.planAndFollow(a, { x: tgt.cx, y: tgt.cy }, false, sp, dt, t, nav);
          } else {
            a.vx *= 0.8;
            a.vy *= 0.8;
            a.a = Math.atan2(tgt.cy - a.y, tgt.cx - a.x);
            this.fireStruct(a, tgt, d);
          }
          return;
        }
        if (!tgt || tgt.dead || tgt.gone) {
          a.ord = null;
          return;
        }
        this.engage(a, tgt, d, dt, t, nav);
        return;
      }
    }

    // the flyer's frame: it goes where it is pointed and nothing stands in
    // its way; fighters never stop, helicopters hover
    updateFlyer(a, d, dt, grid, _nav) {
      const ord = a.ord;
      let tx = null,
        ty = null;
      let quarry = null; // a thing to shoot, agent or building
      if (ord && (ord.k === "move" || ord.k === "amove")) {
        const wp = ord.wps[ord.i];
        if (wp) {
          tx = wp.x;
          ty = wp.y;
          if (dist2(a.x, a.y, tx, ty) < 30 * 30) {
            ord.i++;
            if (ord.i >= ord.wps.length) a.ord = null;
          }
        } else a.ord = null;
      } else if (ord && ord.k === "atk") {
        const tgt = ord.tgt;
        const gone = !tgt || (tgt.unit !== undefined ? tgt.dead || tgt.gone : tgt.hp <= 0);
        if (gone) a.ord = null;
        else {
          quarry = tgt;
          tx = tgt.x !== undefined ? tgt.x : tgt.cx;
          ty = tgt.y !== undefined ? tgt.y : tgt.cy;
        }
      }
      // targets of opportunity while it flies
      if (!quarry) {
        const o = this._findFoe(a, ord && ord.k === "move" ? 130 : BAL.SIGHT, grid, d);
        if (o) quarry = o;
      }
      if (quarry) {
        tx = quarry.x !== undefined ? quarry.x : quarry.cx;
        ty = quarry.x !== undefined ? quarry.y : quarry.cy;
        const dd = Math.hypot(tx - a.x, ty - a.y);
        this._turnTo(a, Math.atan2(ty - a.y, tx - a.x), dt, 2.6);
        if (dd < (d.rng || 200) * 0.9 && a.atkT <= 0) {
          if (quarry.unit !== undefined) this.fireAgent(a, quarry, d);
          else this.fireStruct(a, quarry, d);
        }
        a.vx = Math.cos(a.a) * d.spd;
        a.vy = Math.sin(a.a) * d.spd;
        if (dd < 110) a.a += dt * 1.5; // swing around the quarry, don't stall on it
        a.move = d.spd;
        this._trail(a, d, dt);
        return;
      }
      if (tx === null) {
        if (d.spd > 200) {
          // fighters hold a wide wheel over their last ground
          a.a += dt * 0.55;
          a.vx = Math.cos(a.a) * d.spd * 0.8;
          a.vy = Math.sin(a.a) * d.spd * 0.8;
        } else {
          a.vx *= 0.9;
          a.vy *= 0.9; // helicopters hover
        }
        a.move = Math.hypot(a.vx, a.vy);
        this._trail(a, d, dt);
        return;
      }
      this._turnTo(a, Math.atan2(ty - a.y, tx - a.x), dt, 2.6);
      a.vx = Math.cos(a.a) * d.spd;
      a.vy = Math.sin(a.a) * d.spd;
      a.move = d.spd;
      this._trail(a, d, dt);
    }

    _turnTo(a, an, dt, rate) {
      const diff = ((an - a.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const step = ZS.clamp(diff, -rate * dt, rate * dt);
      a.a += step;
      a.turn = ZS.clamp(a.turn * 0.9 + diff * 0.3, -1, 1);
    }

    // the gunboat's frame: it steers like a flyer but must stay on the
    // water — feel ahead, and turn toward the deep when the bank comes up
    updateBoat(a, d, dt, nav) {
      const ord = a.ord;
      let tx = null,
        ty = null;
      if (ord && (ord.k === "move" || ord.k === "amove")) {
        const wp = ord.wps[ord.i];
        if (wp) {
          tx = wp.x;
          ty = wp.y;
          if (dist2(a.x, a.y, tx, ty) < 26 * 26) {
            ord.i++;
            if (ord.i >= ord.wps.length) a.ord = null;
          }
        } else a.ord = null;
      } else if (ord && ord.k === "atk") {
        const tgt = ord.tgt;
        const gone = !tgt || (tgt.unit !== undefined ? tgt.dead || tgt.gone : tgt.hp <= 0);
        if (gone) a.ord = null;
        else {
          tx = tgt.x !== undefined ? tgt.x : tgt.cx;
          ty = tgt.x !== undefined ? tgt.y : tgt.cy;
          // in range of the quarry: stop and work at it
          const dd = Math.hypot(tx - a.x, ty - a.y);
          if (dd < (d.rng || 200) * 0.95) {
            a.a = Math.atan2(ty - a.y, tx - a.x);
            if (a.atkT <= 0) {
              if (tgt.unit !== undefined) this.fireAgent(a, tgt, d);
              else this.fireStruct(a, tgt, d);
            }
            a.vx *= 0.9;
            a.vy *= 0.9;
            a.move = Math.hypot(a.vx, a.vy);
            return;
          }
        }
      }
      // boats shoot what comes to the water's edge
      if (this.grid) {
        const o = this._findFoe(a, BAL.SIGHT, this.grid, d);
        if (o) {
          const dd = Math.hypot(o.x - a.x, o.y - a.y);
          a.a = Math.atan2(o.y - a.y, o.x - a.x);
          if (dd < (d.rng || 200) && a.atkT <= 0) this.fireAgent(a, o, d);
          if (!tx) {
            a.vx *= 0.92;
            a.vy *= 0.92;
            a.move = Math.hypot(a.vx, a.vy);
            return;
          }
        }
      }
      if (tx === null) {
        a.vx *= 0.92;
        a.vy *= 0.92;
        a.move = Math.hypot(a.vx, a.vy);
        return;
      }
      let an = Math.atan2(ty - a.y, tx - a.x);
      // feel for the bank
      const fx = a.x + Math.cos(an) * 34,
        fy = a.y + Math.sin(an) * 34;
      if (!nav.isWater(fx, fy)) {
        const left = an - 1.1,
          right = an + 1.1;
        const lw = nav.isWater(a.x + Math.cos(left) * 34, a.y + Math.sin(left) * 34);
        const rw = nav.isWater(a.x + Math.cos(right) * 34, a.y + Math.sin(right) * 34);
        if (lw && !rw) an = left;
        else if (rw) an = right;
        else {
          a.vx *= 0.5;
          a.vy *= 0.5;
          a.move = 0;
          return;
        }
      }
      this._turnTo(a, an, dt, 1.9);
      a.vx = Math.cos(a.a) * d.spd;
      a.vy = Math.sin(a.a) * d.spd;
      a.move = d.spd;
      if (Math.random() < dt * 4)
        ZS.Fx.wash(this, a.x - Math.cos(a.a) * 16, a.y, (a.seed + this.t * 5) | 0);
    }

    _trail(a, d, dt) {
      a.dustT = (a.dustT || 0) - dt;
      if (a.dustT > 0) return;
      const moving = Math.hypot(a.vx, a.vy) > 12;
      if (d.fly) {
        a.dustT = 0.5;
        ZS.Fx.wash(this, a.x, a.y + 6, (a.seed + this.t) | 0);
        return;
      }
      if (!moving) {
        a.dustT = 0.3;
        return;
      }
      a.dustT = d.hp > 100 ? 0.3 : 0.45;
      ZS.Fx.dust(this, a.x, a.y + 4, (a.seed + this.t * 7) | 0);
    }

    /* ---------- the dead, one frame ---------- */

    updateZombie(a, dt, t, grid, nav) {
      a.atkT = Math.max(0, a.atkT - dt);
      a.swing = Math.max(0, a.swing - dt * 2.2);
      a.retarget = (a.retarget || 0) - dt;
      const spd = a.spd * (this.night ? 1.12 : 1);
      // find something alive: a person first, then a wall to pull down
      let tgt = a.tgt;
      if (!tgt || tgt.dead || tgt.gone || a.retarget <= 0) {
        tgt = this._nearestLiving(a, grid);
        a.tgt = tgt || null;
        a.tgtB = null;
        a.retarget = 1.6 + this.rand() * 0.8;
        if (!tgt) {
          let best = null,
            bd = 1e18;
          for (const b of this.world.buildings) {
            if (b.fac < 0 || b.ruined) continue;
            const dd = dist2(a.x, a.y, b.cx, b.cy);
            if (dd < bd) {
              bd = dd;
              best = b;
            }
          }
          a.tgtB = best;
        }
      }
      if (tgt) {
        const dd = Math.hypot(tgt.x - a.x, tgt.y - a.y);
        a.a = Math.atan2(tgt.y - a.y, tgt.x - a.x);
        if (dd > 20) {
          a.wantMove = true;
          ZS.planAndFollow(a, { x: tgt.x, y: tgt.y }, false, spd, dt, t, nav);
        } else {
          a.vx *= 0.7;
          a.vy *= 0.7;
          if (a.atkT <= 0) {
            a.atkT = a.rate;
            a.swing = 0.5;
            this.hurt(tgt, a.dmg, a, false);
            if (ZS.sound && Math.random() < 0.4) ZS.sound.event("v_chomp", a.x, a.y);
          }
        }
        return;
      }
      const b = a.tgtB;
      if (b) {
        const dd = ZS.Structs.dist(b, a.x, a.y);
        if (dd > 14) {
          a.wantMove = true;
          ZS.planAndFollow(a, { x: b.cx, y: b.cy }, false, spd, dt, t, nav);
        } else {
          a.vx *= 0.6;
          a.vy *= 0.6;
          a.a = Math.atan2(b.cy - a.y, b.cx - a.x);
          if (a.atkT <= 0) {
            a.atkT = a.rate;
            a.swing = 0.5;
            this.damageStruct(b, a.dmg, a);
            if (Math.random() < 0.3)
              ZS.Fx.spark(this, b.cx, b.y + b.h * 0.5, (a.seed + t * 7) | 0, 3);
          }
        }
        return;
      }
      // nothing left in reach: drift toward the noise of the surge point
      if (a.ord && a.ord.k === "horde") {
        a.wantMove = true;
        const r = ZS.planAndFollow(a, { x: a.ord.x, y: a.ord.y }, false, spd, dt, t, nav);
        if (r === "arrived") a.ord = null;
      } else {
        ZS.wander(a, dt);
      }
    }

    _nearestLiving(a, grid) {
      let best = null,
        bd = 640 * 640;
      grid.query(a.x, a.y, 640, (o) => {
        if (o === a || o.dead || o.gone || o.st === 2) return;
        if (o.st === 4 && ZS.Units.CAT[o.unit].fly) return; // the dead cannot reach the sky
        const dd = dist2(a.x, a.y, o.x, o.y);
        if (dd < bd) {
          bd = dd;
          best = o;
        }
      });
      return best;
    }

    /* ---------- fighting ---------- */

    _findFoe(a, r, grid, d) {
      let best = null,
        bd = r * r;
      grid.query(a.x, a.y, r, (o) => {
        if (o === a || o.dead || o.gone || o.fac === a.fac) return;
        if (o.st === 2) {
          if (d.fly && !d.vsAir) return;
        } else if (o.st === 4) {
          const od = ZS.Units.CAT[o.unit];
          if (od.fly && !d.vsAir) return;
          if (d.water && !od.water && od.fly) return;
        }
        const dd = dist2(a.x, a.y, o.x, o.y);
        if (dd < bd) {
          bd = dd;
          best = o;
        }
      });
      return best;
    }

    engage(a, o, d, dt, t, nav, standOnly) {
      const dd = Math.hypot(o.x - a.x, o.y - a.y);
      a.a = Math.atan2(o.y - a.y, o.x - a.x);
      const rng = d.rng || 26;
      const sp = d.spd;
      if (!standOnly) {
        if (rng > 40) {
          if (dd > rng * 0.92) {
            a.wantMove = true;
            ZS.planAndFollow(a, { x: o.x, y: o.y }, false, sp, dt, t, nav);
          } else if (dd < rng * 0.5) {
            a.wantMove = true;
            ZS.planAndFollow(
              a,
              { x: a.x + (a.x - o.x), y: a.y + (a.y - o.y) },
              false,
              sp * 0.8,
              dt,
              t,
              nav,
            );
          } else {
            a.vx *= 0.86;
            a.vy *= 0.86;
          }
        } else if (dd > rng * 0.8) {
          a.wantMove = true;
          ZS.planAndFollow(a, { x: o.x, y: o.y }, false, sp, dt, t, nav);
        } else {
          a.vx *= 0.84;
          a.vy *= 0.84;
        }
      } else {
        a.vx *= 0.84;
        a.vy *= 0.84;
      }
      if (a.atkT > 0) return;
      if (dd > rng + 8) return;
      a.atkT = d.rate;
      a.kick = 0.35;
      a.muzzle = 0.12;
      if (rng <= 40) {
        a.swing = 0.4;
        this.hurt(o, d.dmg, a, !!d.ap);
        return;
      }
      this.fireAgent(a, o, d);
    }

    fireAgent(a, o, d) {
      a.atkT = d.rate;
      a.kick = 0.35;
      a.muzzle = 0.12;
      const y0 = a.y - (d.fly ? 44 : 14);
      const seed = (a.seed + this.t * 11) | 0;
      if (d.shot === "ball") {
        this.fx.push({ x0: a.x, y0, x1: o.x, y1: o.y - 8, t: 0.09, tracer: 1, seed: a.seed });
        this.hurt(o, d.dmg, a, !!d.ap);
        if (ZS.sound) ZS.sound.event("shot_rifle", a.x, a.y);
        return;
      }
      if (d.shot === "burst") {
        this.fx.push({ x0: a.x, y0, x1: o.x, y1: o.y - 8, t: 0.07, tracer: 1, seed: a.seed });
        ZS.Fx.spark(this, o.x, o.y - 10, seed, 3);
        this.hurt(o, d.dmg, a, !!d.ap);
        if (ZS.sound) ZS.sound.event("shot_smg", a.x, a.y);
        return;
      }
      if (d.shot === "shell") {
        const big = d.splash > 30 ? 1 : 0;
        if (d.rng > 250) ZS.Fx.shell(this, a.x, y0, o.x, o.y, big, seed);
        else {
          this.fx.push({ x0: a.x, y0, x1: o.x, y1: o.y - 8, t: 0.1, tracer: 1, seed: a.seed });
          ZS.Fx.smoke(this, a.x + Math.cos(a.a) * 12, y0, 5, seed);
        }
        if (d.splash) {
          if (ZS.sound) ZS.sound.event("boom", a.x, a.y);
          this.shots.push({
            t: d.rng > 250 ? 0.55 : 0.22,
            x: o.x,
            y: o.y,
            dmg: d.dmg,
            splash: d.splash,
            siege: d.siege || 0,
            ap: d.ap ? 1 : 0,
            fac: a.fac,
            from: a,
            seed,
          });
        } else {
          this.hurt(o, d.dmg, a, !!d.ap);
          if (ZS.sound) ZS.sound.event("shot_rifle", a.x, a.y);
        }
        return;
      }
      if (d.shot === "bomb") {
        ZS.Fx.bomb(this, a.x, y0 - 20, o.x, o.y, seed);
        if (ZS.sound) ZS.sound.event("boom", a.x, a.y);
        this.shots.push({
          t: 0.7,
          x: o.x,
          y: o.y,
          dmg: d.dmg,
          splash: d.splash || 50,
          siege: d.siege || 0,
          fac: a.fac,
          from: a,
          seed,
        });
        return;
      }
      // melee fallback
      this.hurt(o, d.dmg, a, !!d.ap);
    }

    fireStruct(a, b, d) {
      if (a.atkT > 0) return;
      const dd = ZS.Structs.dist(b, a.x, a.y);
      if (dd > Math.max(46, d.rng || 30) + 10) return;
      a.atkT = d.rate;
      a.kick = 0.35;
      a.muzzle = 0.12;
      const y0 = a.y - (d.fly ? 44 : 14);
      const seed = (a.seed + this.t * 11) | 0;
      const dmg = d.dmg * (d.siege ? 1 : 0.55); // rifles chip, guns open walls
      if (d.shot === "shell" || d.shot === "bomb") {
        if (d.shot === "bomb") ZS.Fx.bomb(this, a.x, y0 - 20, b.cx, b.cy, seed);
        else ZS.Fx.shell(this, a.x, y0, b.cx, b.cy, d.splash > 30 ? 1 : 0, seed);
        if (ZS.sound) ZS.sound.event("boom", a.x, a.y);
        this.shots.push({
          t: d.shot === "bomb" ? 0.7 : 0.4,
          x: b.cx,
          y: b.cy,
          dmg: d.dmg,
          splash: d.splash || 26,
          siege: d.siege || 1,
          ap: d.ap ? 1 : 0,
          fac: a.fac,
          from: a,
          seed,
        });
        return;
      }
      this.fx.push({
        x0: a.x,
        y0,
        x1: b.cx,
        y1: b.y + b.h * 0.5,
        t: 0.08,
        tracer: 1,
        seed: a.seed,
      });
      ZS.Fx.spark(this, b.cx + (this.rand() - 0.5) * b.w * 0.5, b.y + b.h * 0.5, seed, 3);
      this.damageStruct(b, dmg, a);
      if (ZS.sound) ZS.sound.event(d.shot === "burst" ? "shot_smg" : "shot_rifle", a.x, a.y);
    }

    _land(s) {
      ZS.Fx.burst(this, s.x, s.y, s.splash || 26, s.seed);
      ZS.Fx.smoke(this, s.x, s.y, (s.splash || 26) * 0.4, s.seed + 7);
      const r = s.splash || 26;
      for (const o of this.agents) {
        if (o.dead || o.gone || o.fac === s.fac) continue;
        if (o.st !== 2 && o.st !== 4) continue;
        const dd = Math.hypot(o.x - s.x, o.y - s.y);
        if (dd > r) continue;
        this.hurt(o, s.dmg * (1 - (dd / r) * 0.55), s.from, !!s.ap);
      }
      if (s.siege)
        for (const b of this.world.buildings) {
          if (b.fac === s.fac || b.fac < 0) continue;
          const dd = ZS.Structs.dist(b, s.x, s.y);
          if (dd > r) continue;
          this.damageStruct(b, s.dmg * s.siege * (1 - (dd / r) * 0.5), s.from);
        }
    }

    hurt(o, dmg, by, ap) {
      if (!o || o.dead || o.gone) return;
      if (o.st === 4) {
        const d = ZS.Units.CAT[o.unit];
        o.hp -= dmg * (ap ? 1 : 1 - (d.armour || 0));
        o.flash = 0.3;
        this.fx.push({ x: o.x, y: o.y - 10, t: 0.22, blood: 1, seed: o.seed });
        if (o.hp <= 0) this.kill(o, by);
        return;
      }
      if (o.st === 2) {
        o.hp -= dmg;
        o.flash = 0.3;
        this.fx.push({ x: o.x, y: o.y - 8, t: 0.25, blood: 1, seed: o.seed });
        if (this.stains && Math.random() < 0.3)
          this.stains.splat(o.x, o.y + 2, "blood", (o.seed + this.rand() * 99) | 0);
        if (o.hp <= 0) this.kill(o, by);
      }
    }

    kill(o, by) {
      if (o.dead) return;
      o.dead = true;
      if (o.st === 4) {
        if (this.stains)
          this.stains.splat(
            o.x,
            o.y,
            ZS.Units.CAT[o.unit].crew >= 2 || ZS.Units.CAT[o.unit].hp > 100 ? "wreck" : "corpse",
            (o.seed + 3) | 0,
          );
        if (ZS.sound) ZS.sound.event("boom", o.x, o.y);
        if (o.fac === 0) {
          this.lost++;
          this._ping(ZS.Units.CAT[o.unit].name + " is down", o.x, o.y);
        } else if (by && by.fac === 0) {
          this.kills++;
        }
        if (this.sel.indexOf(o) >= 0) {
          this.sel = this.sel.filter((x) => x !== o);
        }
      } else {
        if (this.stains) this.stains.splat(o.x, o.y, "blood", (o.seed + 5) | 0);
        if (by && by.fac === 0) this.kills++;
      }
    }

    /* ---------- the pointer ---------- */

    pointerDown(x, y, e) {
      if (this.over) return true;
      const b = e.button;
      if (b === 1) {
        // the middle button pans
        this._panning = { x: e.clientX, y: e.clientY };
        return true;
      }
      if (b === 2) {
        this._command(x, y, e);
        return true;
      }
      // left: a build is armed, or a box begins
      if (this.build) {
        const kind = this.build;
        if (kind === "wall" || kind === "barricade") {
          this.drag = { kind, x0: x, y0: y, x1: x, y1: y, list: [] };
          this._wallDrag(x, y);
        } else {
          const r = this.placeBuild(0, kind, x, y);
          if (!r.ok) this.toast(r.err || "it will not stand there");
          else if (!e.shiftKey) this.build = null;
        }
        return true;
      }
      this._box = { x0: x, y0: y, x1: x, y1: y, shift: e.shiftKey };
      return true;
    }

    pointerMove(x, y, e) {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this._panning) {
        const cam = ZS.debug && ZS.debug.cam;
        if (cam)
          cam.panBy(
            e.clientX - this._panning.x,
            e.clientY - this._panning.y,
            this.vw || 800,
            this.vh || 600,
          );
        this._panning = { x: e.clientX, y: e.clientY };
        return;
      }
      if (this.drag) {
        this._wallDrag(x, y);
        return;
      }
      if (this._box) {
        this._box.x1 = x;
        this._box.y1 = y;
      }
    }

    pointerUp(x, y, e) {
      if (this.over) {
        location.reload();
        return;
      }
      if (this._panning) {
        this._panning = null;
        return;
      }
      if (this.drag) {
        let placed = 0;
        for (const g of this.drag.list) {
          if (!g.ok) continue;
          const r = this.placeBuild(0, this.drag.kind, g.x, g.y);
          if (r.ok) placed++;
        }
        if (placed)
          this.toast(placed + (this.drag.kind === "wall" ? " walls" : " barricades") + " raised");
        this.drag = null;
        return;
      }
      if (this._box) {
        const bx = this._box;
        this._box = null;
        const w = Math.abs(bx.x1 - bx.x0),
          h = Math.abs(bx.y1 - bx.y0);
        if (w < 8 && h < 8) this._clickSelect(x, y, e.shiftKey);
        else this._boxSelect(bx, e.shiftKey);
      }
    }

    _wallDrag(x, y) {
      const d = this.drag;
      d.x1 = x;
      d.y1 = y;
      d.list = [];
      const dx = x - d.x0,
        dy = y - d.y0;
      const horiz = Math.abs(dx) >= Math.abs(dy);
      const seg = ZS.Structs.CAT[d.kind].w - 4;
      const n = Math.min(40, Math.floor((horiz ? Math.abs(dx) : Math.abs(dy)) / seg));
      let funds = this.facs[0].funds;
      const cost = ZS.Roster.BUILD[d.kind].money;
      for (let i = 0; i <= n; i++) {
        const px = horiz ? d.x0 + Math.sign(dx) * i * seg : d.x0;
        const py = horiz ? d.y0 : d.y0 + Math.sign(dy) * i * seg;
        const chk = this.canBuildAt(0, d.kind, px, py);
        const ok = chk.ok && funds >= cost;
        if (ok) funds -= cost;
        d.list.push({ x: px, y: py, ok });
      }
    }

    _clickSelect(x, y, shift) {
      // a unit first, then a building
      let best = null,
        bd = 28 * 28;
      for (const a of this.agents) {
        if (a.dead || a.fac !== 0) continue;
        const dd = dist2(x, y, a.x, a.y);
        if (dd < bd) {
          bd = dd;
          best = a;
        }
      }
      if (best) {
        if (shift) {
          if (this.sel.indexOf(best) < 0) {
            best.sel = true;
            this.sel.push(best);
          }
        } else {
          for (const a of this.sel) a.sel = false;
          best.sel = true;
          this.sel = [best];
        }
        this.selB = null;
        this._selSig = -1;
        return;
      }
      const b = ZS.Structs.pick(this.world.buildings, x, y);
      if (b) {
        this.selB = b;
        for (const a of this.sel) a.sel = false;
        this.sel = [];
        this._selSig = -1;
        return;
      }
      if (!shift) {
        for (const a of this.sel) a.sel = false;
        this.sel = [];
        this.selB = null;
        this._selSig = -1;
      }
    }

    _boxSelect(bx, shift) {
      const x0 = Math.min(bx.x0, bx.x1),
        x1 = Math.max(bx.x0, bx.x1),
        y0 = Math.min(bx.y0, bx.y1),
        y1 = Math.max(bx.y0, bx.y1);
      if (!shift) {
        for (const a of this.sel) a.sel = false;
        this.sel = [];
      }
      for (const a of this.agents) {
        if (a.dead || a.fac !== 0 || a.sel) continue;
        if (a.x < x0 || a.x > x1 || a.y < y0 || a.y > y1) continue;
        a.sel = true;
        this.sel.push(a);
      }
      this.selB = null;
      this._selSig = -1;
      if (this.sel.length && ZS.sound) ZS.sound.event("v_mumble", (x0 + x1) / 2, (y0 + y1) / 2);
    }

    // the right button: an order for whatever is selected
    _command(x, y, e) {
      const units = this.sel;
      if (!units.length) {
        // nothing selected: a building's rally, or a gate's toggle
        const b = ZS.Structs.pick(this.world.buildings, x, y);
        if (b && b.fac === 0) {
          if (b.kind === "gate") {
            b.open = !b.open;
            this.nav.markRect(b.x, b.y, b.w, b.h, b.open ? 1 : 0);
            this.nav.version++;
            return;
          }
        }
        return;
      }
      // an enemy under the cursor?
      let tgtA = null,
        bd = 26 * 26;
      for (const a of this.agents) {
        if (a.dead || a.fac === 0) continue;
        const dd = dist2(x, y, a.x, a.y);
        if (dd < bd) {
          bd = dd;
          tgtA = a;
        }
      }
      if (tgtA) {
        this.issueAttack(units, tgtA);
        return;
      }
      const b = ZS.Structs.pick(this.world.buildings, x, y);
      if (b) {
        if (b.fac !== 0 && b.fac !== -1) {
          this.issueAttack(units, b);
          return;
        }
        if (b.fac === -1 && b.kind === "oil") {
          for (const a of units) this.orderUnit(a, { k: "capture", tgt: b });
          this.markers.push({ x: b.cx, y: b.cy, t: 1.4, kind: "move", fac: 0 });
          return;
        }
        if (b.fac === 0) {
          if (ZS.Roster.TRAIN[b.kind]) {
            b.rally = { x, y };
            this.toast("they will gather there");
            this.markers.push({ x, y, t: 1.2, kind: "move", fac: 0 });
          } else if (b.kind === "gate") {
            b.open = !b.open;
            this.nav.markRect(b.x, b.y, b.w, b.h, b.open ? 1 : 0);
            this.nav.version++;
          }
          return;
        }
      }
      // open ground: go there
      this.issueMove(units, x, y, e.ctrlKey ? "amove" : "move");
    }

    /* ---------- the camera under keys and edges ---------- */

    _camTick(dt, vw, vh) {
      const cam = ZS.debug && ZS.debug.cam;
      if (!cam) return;
      const k = this.keys;
      const sp = (620 / cam.zoom) * dt;
      if (k.ArrowLeft || k.a) cam.x -= sp;
      if (k.ArrowRight || k.d) cam.x += sp;
      if (k.ArrowUp || k.w) cam.y -= sp;
      if (k.ArrowDown || k.s) cam.y += sp;
      // the edge of the screen pulls
      const m = this.mouse,
        EDGE = 26;
      if (m.x >= 0) {
        if (m.x < EDGE) cam.x -= sp * 0.8;
        if (m.x > vw - EDGE) cam.x += sp * 0.8;
        if (m.y < EDGE) cam.y -= sp * 0.8;
        if (m.y > vh - EDGE) cam.y += sp * 0.8;
      }
      cam.clamp(vw, vh);
    }

    /* ---------- endings ---------- */

    _endCheck() {
      if (this.over) return;
      const halls = {};
      for (const b of this.world.buildings) if (b.kind === "hall") halls[b.fac] = b.ruined ? 0 : 1;
      const enemyLeft = (halls[2] || 0) + (halls[3] || 0) + (halls[4] || 0);
      if (!enemyLeft) {
        this.over = "won";
        this.paused = true;
        return;
      }
      const ourHall = halls[0] || 0;
      if (!ourHall && this.unitsOf(0).length === 0) {
        this.over = "lost";
        this.paused = true;
      }
    }

    onDead(_a) {}

    /* ---------- voices ---------- */

    toast(txt) {
      if (ZS.RtsUI) ZS.RtsUI.toast(txt);
    }
    alarm(txt) {
      this.alerts.push({ txt, t: 9 });
      if (this.alerts.length > 4) this.alerts.shift();
      if (ZS.RtsUI) ZS.RtsUI.toast(txt);
    }
    toastFac(fac, txt) {
      if (fac === 0) this.toast(txt);
      else if (ZS.RtsUI && this.day) ZS.RtsUI.note(txt);
    }
    _ping(txt, x, y) {
      if (this.t - this._pingT < 3) return;
      this._pingT = this.t;
      this.alarm(txt);
      if (ZS.sound) ZS.sound.event("horn", x, y);
    }
    _pop(x, y, txt, col) {
      this.fx.push({ x, y, t: 1.1, pop: 1, txt, col: col || "#5a7a3a" });
    }

    /* ---------- the picture ---------- */

    draw(c, a, t) {
      if (a.st === 2) ZS.Figures.render(c, a, t);
      else ZS.Units.render(c, a, t);
    }

    drawFX(c, fx) {
      for (const f of fx) {
        if (ZS.Fx.draw(c, f)) continue;
        if (f.tracer) {
          c.strokeStyle = "rgba(232,196,110," + (f.t * 8).toFixed(2) + ")";
          c.lineWidth = 1.4;
          ZS.wline(c, f.x0, f.y0, f.x1, f.y1, f.seed, 0.4);
        } else if (f.blood) {
          c.fillStyle = "rgba(148,58,40," + (f.t * 2.6).toFixed(2) + ")";
          c.beginPath();
          c.arc(f.x, f.y, 2.4, 0, 6.2832);
          c.fill();
        } else if (f.pop) {
          const k = 1 - f.t / 1.1;
          c.save();
          c.globalAlpha = Math.max(0, 1 - k * 1.2);
          c.font = 'italic 12px "Segoe Script","Bradley Hand","Comic Sans MS",cursive';
          c.textAlign = "center";
          c.fillStyle = f.col;
          c.fillText(f.txt, f.x, f.y - k * 22);
          c.restore();
          c.textAlign = "left";
        }
      }
    }

    drawGround(c) {
      // the roads between the halls, in pencil
      c.strokeStyle = "rgba(96,86,66,0.16)";
      c.lineWidth = 5;
      c.setLineDash([14, 22]);
      const b0 = this.bases[0];
      for (let i = 1; i < this.bases.length; i++) {
        c.beginPath();
        c.moveTo(b0.x, b0.y);
        c.lineTo(this.bases[i].x, this.bases[i].y);
        c.stroke();
      }
      c.setLineDash([]);
      // the oil seeps: a dark bloom on the paper
      for (const s of this.oilSpots) {
        if (s.used) continue;
        c.fillStyle = "rgba(52,48,42,0.16)";
        c.beginPath();
        c.ellipse(s.x, s.y, 22, 9, 0, 0, 6.2832);
        c.fill();
        c.strokeStyle = "rgba(52,48,42,0.3)";
        c.lineWidth = 1.2;
        ZS.wcirc(c, s.x, s.y, 8, s.x * 0.13 + s.y, 1);
      }
    }

    drawOver(c, _world, t, vis) {
      // the night wash
      if (this.night) {
        c.fillStyle = "rgba(38,42,56,0.17)";
        c.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, vis.y1 - vis.y0);
      }
      // the territories, while a build is armed
      if (this.build) {
        c.strokeStyle = "rgba(90,122,58,0.14)";
        c.lineWidth = 2;
        for (const b of this.world.buildings) {
          if (b.fac !== 0 || b.ruined) continue;
          if (
            b.cx < vis.x0 - 500 ||
            b.cx > vis.x1 + 500 ||
            b.cy < vis.y0 - 500 ||
            b.cy > vis.y1 + 500
          )
            continue;
          const r = b.kind === "flag" ? BAL.FLAG_R : BAL.CLAIM_R;
          ZS.wcirc(c, b.cx, b.cy, r, b.seed + 90, 8);
        }
      }
      // buildings: damage bars, capture arcs, the selected frame
      for (const b of this.world.buildings) {
        if (b.cx < vis.x0 || b.cx > vis.x1 || b.cy < vis.y0 || b.cy > vis.y1) continue;
        if (b.flashT > 0) b.flashT -= 0.016;
        if (b.hp < b.maxHp && b.hp > 0 && b.fac >= 0) {
          const w = Math.min(60, b.w);
          const x = b.cx - w / 2,
            y = b.y - 8;
          c.fillStyle = "rgba(250,246,236,0.8)";
          c.fillRect(x - 1, y - 1, w + 2, 4);
          c.fillStyle = b.fac === 0 ? "rgba(96,132,58,0.9)" : "rgba(158,58,42,0.9)";
          c.fillRect(x, y, w * ZS.clamp(b.hp / b.maxHp, 0, 1), 3);
        }
        if (b.kind === "oil" && b.capP > 0) {
          const paint = (ZS.FACPAINT[b.capFac] || {}).cloth || "#5a7a3a";
          c.strokeStyle = paint;
          c.lineWidth = 2.4;
          c.beginPath();
          c.arc(b.cx, b.y - 16, 7, -Math.PI / 2, -Math.PI / 2 + b.capP * 6.283);
          c.stroke();
        }
        if (!b.built && !b.ruined) {
          // raising: a thin bar of progress
          const w = Math.min(46, b.w);
          c.fillStyle = "rgba(96,132,58,0.55)";
          c.fillRect(b.cx - w / 2, b.y + b.h + 4, w * (b.prog || 0), 2.6);
        }
        if (b === this.selB) {
          c.strokeStyle = "rgba(64,96,52,0.9)";
          c.lineWidth = 1.8;
          ZS.sketchRect(c, b.x - 5, b.y - 5, b.w + 10, b.h + 10);
        }
        // the flag of the one who owns it
        if (b.fac >= 0 && (b.kind === "hall" || b.kind === "oil")) {
          const paint = (ZS.FACPAINT[b.fac] || {}).cloth || "#5a7a3a";
          const fx = b.x + b.w - 6,
            fy = b.y - 2;
          c.strokeStyle = "rgba(78,68,52,0.85)";
          c.lineWidth = 1.3;
          ZS.wline(c, fx, fy, fx, fy - 20, b.seed + 77, 0.3);
          const wv = Math.sin(t * 2.2 + b.seed) * 1.6;
          c.strokeStyle = paint;
          c.lineWidth = 1.5;
          ZS.wpoly(
            c,
            [
              { x: fx, y: fy - 20 },
              { x: fx + 12, y: fy - 17 + wv },
              { x: fx, y: fy - 13 },
            ],
            b.seed + 78,
            0.4,
            true,
          );
        }
      }
      // the order markers
      for (const m of this.markers) {
        const al = Math.min(1, m.t);
        c.save();
        c.globalAlpha = al;
        if (m.kind === "move") {
          c.strokeStyle = "rgba(90,122,58,0.9)";
          c.lineWidth = 1.6;
          ZS.wline(c, m.x, m.y, m.x + 1, m.y - 16, 41, 0.3);
          ZS.wpoly(
            c,
            [
              { x: m.x + 1, y: m.y - 16 },
              { x: m.x + 11, y: m.y - 13 },
              { x: m.x + 1, y: m.y - 10 },
            ],
            42,
            0.4,
            true,
          );
          c.stroke();
          ZS.wcirc(c, m.x, m.y, 8, 43, 1.4);
        } else {
          c.strokeStyle = "rgba(160,64,48,0.95)";
          c.lineWidth = 2;
          ZS.wline(c, m.x - 8, m.y - 8, m.x + 8, m.y + 8, 44, 0.4);
          ZS.wline(c, m.x - 8, m.y + 8, m.x + 8, m.y - 8, 45, 0.4);
          ZS.wcirc(c, m.x, m.y, 12, 46, 1.4);
        }
        c.restore();
      }
      // the selection box
      if (this._box) {
        const bx = this._box;
        c.strokeStyle = "rgba(90,122,58,0.85)";
        c.fillStyle = "rgba(112,148,72,0.08)";
        c.lineWidth = 1.4;
        const x = Math.min(bx.x0, bx.x1),
          y = Math.min(bx.y0, bx.y1),
          w = Math.abs(bx.x1 - bx.x0),
          h = Math.abs(bx.y1 - bx.y0);
        c.fillRect(x, y, w, h);
        ZS.sketchRect(c, x, y, w, h);
      }
      // the wall line being dragged out
      if (this.drag) {
        for (const g of this.drag.list) {
          const cat = ZS.Structs.CAT[this.drag.kind];
          c.fillStyle = g.ok ? "rgba(112,148,72,0.25)" : "rgba(160,64,48,0.25)";
          c.strokeStyle = g.ok ? "rgba(90,122,58,0.8)" : "rgba(160,64,48,0.8)";
          c.lineWidth = 1.4;
          c.fillRect(g.x - cat.w / 2, g.y - cat.h / 2, cat.w, cat.h);
          c.strokeRect(g.x - cat.w / 2, g.y - cat.h / 2, cat.w, cat.h);
        }
      }
      // the armed build's ghost under the cursor
      if (this.build && !this.drag) {
        const cam = ZS.debug && ZS.debug.cam;
        if (cam && this.mouse.x >= 0) {
          const p = cam.toWorld(this.mouse.x, this.mouse.y, this.vw || 800, this.vh || 600);
          const chk = this.canBuildAt(0, this.build, p.x, p.y);
          const cat = ZS.Structs.CAT[this.build];
          const gx = chk.ok ? chk.x : p.x,
            gy = chk.ok ? chk.y : p.y;
          c.fillStyle = chk.ok ? "rgba(112,148,72,0.22)" : "rgba(160,64,48,0.22)";
          c.fillRect(gx - cat.w / 2, gy - cat.h / 2, cat.w, cat.h);
          const ghost = ZS.Structs.make(this.build, gx, gy, 77);
          c.save();
          c.globalAlpha = 0.75;
          ZS.Structs.draw(c, ghost, t, { night: this.night ? 1 : 0 });
          c.restore();
          if (!chk.ok && chk.err) {
            c.font = 'italic 12px "Segoe Script","Bradley Hand","Comic Sans MS",cursive';
            c.fillStyle = "rgba(140,60,40,0.9)";
            c.textAlign = "center";
            c.fillText(chk.err, gx, gy + cat.h / 2 + 16);
            c.textAlign = "left";
          }
        }
      }
    }

    hud(_agents) {
      return {
        hidden: true,
        title: "",
        stats: "",
        legend() {},
        hint: "drag a box to gather your guns · right-click to send them",
        overlay: () => {
          if (!this.over) return null;
          const won = this.over === "won";
          return {
            card: {
              title: won ? "the theatre is quiet" : "the hollow has fallen",
              lost: !won,
              lines: [
                "day " + this.day + (this.night ? ", in the dark" : ""),
                "the dead put down: " + this.kills,
                "your guns lost: " + this.lost,
                won ? "every enemy hall stands broken" : "the last of the line is gone",
              ],
            },
          };
        },
      };
    }

    tap() {}
  }

  ZS.ScenarioRTS = ScenarioRTS;
})();
