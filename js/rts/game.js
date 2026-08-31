/* Desert war RTS — the state of the war.

   One object holds everything: the terrain, the navigation grid, every
   unit and building, every faction's books, the selection and the
   orders. The systems (entity, base, combat, economy, ai, horde) all
   take this object and do their piece of the frame; nothing else holds
   game state.

   The rule that shapes the whole war is the capture rule, and it is
   worth stating before anything else, because it decides what a base
   is:

     A base is held by its FLAKS, not by its wall and not by its flag.
     Destroy every flak that stands on it and the base is ownerless —
     half its industry is gone with the flag, its command buildings
     are ash (recoverable in gold). Drive a Conquest Truck onto the
     ground and hold it, and the base is yours, with two fresh flaks
     standing in the door. If you come to that fight with no base on
     the map at all, the sand gives you a truck. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE;

  const GRID_CELL = 150;

  // the opening purse: enough to raise a real base, not enough to win
  const START_RES = { concrete: 350000, steel: 250000, alu: 120000, fuel: 150000 };
  const AI_RES = { concrete: 320000, steel: 220000, alu: 100000, fuel: 130000 };
  const START_GOLD = 30;

  class Game {
    constructor(seed) {
      this.seed = seed >>> 0;
      this.t = new R.Terrain(seed);
      this.nav = new R.Nav(this.t);
      this.nav.game = this;
      this.units = [];
      this.buildings = [];
      this.shots = [];
      this.grid = new ZS.Grid(GRID_CELL);
      this.time = 0;
      this.wave = 0;
      this.speed = 1;
      this.paused = false;
      this.over = false;
      this.log = [];
      this.alerts = [];
      this.stats = { lost: 0, killed: 0, built: 0, captured: 0, bredaBuilt: 0, flakBroken: 0 };
      this.questDone = Object.create(null);
      this.fogT = 0;
      this.nextFog = 0;
      this._squadSeq = 1;

      this.factions = R.FACTIONS.map((f) => {
        const fac = { id: f.id, def: f };
        R.Economy.initFaction(fac, f.id === 0 ? START_GOLD : 10);
        fac.res = Object.assign({}, f.id === 0 ? START_RES : AI_RES);
        return fac;
      });
      this.vis = this.t.vis;
      this.visFade = this.t.visFade;
    }

    /* ==================================================================
       setup
       ================================================================== */

    start() {
      this.placeHome();
      this.placeNations();
      if (R.AI) R.AI.setup(this);
      if (R.Horde) R.Horde.setup(this);
      this.buildNeutralSites();
      // the books are balanced before the opening garrison is raised, so
      // the squad cap is what it should be when the trucks are built
      for (let i = 0; i < 6; i++) R.Economy.recompute(this, this.factions[i]);
      this.buildStartBase();
      this.recomputeFog(true);
      for (let i = 0; i < 6; i++) R.Economy.recompute(this, this.factions[i]);
      return this;
    }

    // every base type on the map gets at least one site at map birth;
    // the player's home is the one at the centre of the world
    placeHome() {
      const site = this.t.homeSite;
      site.kind = "home";
      site.owner = 0;
      site.tier = 2;
      site.home = true;
      this.claimSite(site, 0);
      this.factions[0].hqSite = site;
    }

    // each nation gets a home as far from the player as the map allows,
    // of the kind its doctrine needs, and a second ground to grow into
    placeNations() {
      const home = this.t.homeSite;
      // the farthest ground of the kind the doctrine needs, distance
      // breaking ties; the navy must have a coast, the rail a line
      const need = { 1: "tank", 2: "air", 3: "tank", 4: "air", 5: "naval" };
      const second = { 1: "copter", 2: "air", 3: "train", 4: "naval", 5: "copter" };
      const pool = this.t.sites
        .filter((s) => s !== home)
        .sort(
          (a, b) => R.dist2(a.tx, a.ty, home.tx, home.ty) - R.dist2(b.tx, b.ty, home.tx, home.ty),
        );
      const used = new Set();
      // the pool runs near-to-far, so walk it backwards: the nations open
      // on the far corners of the map and the player gets time to grow
      const take = (want) => {
        for (let k = pool.length - 1; k >= 0; k--) {
          const s = pool[k];
          if (used.has(s)) continue;
          if (s.kind === want) {
            used.add(s);
            return s;
          }
        }
        for (let k = pool.length - 1; k >= 0; k--) {
          const s = pool[k];
          if (used.has(s)) continue;
          used.add(s);
          return s;
        }
        return null;
      };
      for (let i = 1; i <= 5; i++) {
        const s1 = take(need[i]);
        s1.home = true;
        this.claimSite(s1, i);
        this.factions[i].hqSite = s1;
        this.factions[i].home = s1;
        const s2 = take(second[i]);
        if (s2) this.claimSite(s2, i);
      }
    }

    // the yellow bases: no flag, no owner, two flaks and no more. They
    // hold their own; the capture that turns them is a player's work
    buildNeutralSites() {
      for (const s of this.t.sites) {
        if (s.owner >= 0) continue;
        const put = (key, dx, dy) => this.addBuilding(key, -1, s.tx + dx, s.ty + dy, 1, true);
        put("concrete", -3, -2);
        put("steel", 2, -3);
        put("flak", 0, -4);
        put("flak", 3, 2);
        s.open = false;
      }
    }

    /* ---------- the home base ----------
       The Desert Order shape: a walled yard whose wall is an arch — a
       square with its corners pulled round — that opens at its down-left
       corner. The road runs out of the corner, eight flaks stand in an
       arc OUTSIDE the wall around it, and the small gate sits in between
       them — the gate the trained troops march out of. The industry
       crowds the back of the yard, away from the door. */

    buildStartBase() {
      const site = this.t.homeSite;
      const f = 0;
      const cx = site.tx,
        cy = site.ty;

      const R0 = 10; // the clear yard, in tiles from the centre
      const A = R0 + 1; // the arch reaches this far on its axes
      // the ground is cleared and packed first: the arch, the gate and
      // the flak arc all stand exactly where they are drawn
      R.clearBaseGround(this.t, cx, cy, A + 5);
      const FLAKS = 8;
      const FLAK_ARC = 1.57; // the arc sweeps from the south wall round to the west
      const APPROACH = 18;
      const ux = -1,
        uy = 1; // the bearing out of the yard: down and to the left
      const bl = Math.hypot(ux, uy);
      const bx = ux / bl,
        by = uy / bl;

      // walk the arch: a tile is wall when the superellipse curve crosses
      // one of its edges — that rings the yard with no gap a column
      // could slip through. The tiles facing the bearing, through the
      // full thickness of the wall, are the small gate.
      const GATE_COS = 0.995;
      const wallTiles = [];
      const gateTiles = [];
      const vAt = (dx, dy) => R.wallRing(dx, dy, A) - 1;
      for (let dy = -A - 2; dy <= A + 2; dy++)
        for (let dx = -A - 2; dx <= A + 2; dx++) {
          const v = vAt(dx, dy);
          const crossed =
            v === 0 ||
            vAt(dx + 1, dy) * v < 0 ||
            vAt(dx - 1, dy) * v < 0 ||
            vAt(dx, dy + 1) * v < 0 ||
            vAt(dx, dy - 1) * v < 0;
          if (!crossed) continue;
          const h = Math.hypot(dx, dy) || 1;
          const cos = (dx * bx + dy * by) / h;
          if (cos > GATE_COS) gateTiles.push([dx, dy]);
          else wallTiles.push([dx, dy]);
        }

      // just outside the gate, on the road — where the troops muster
      const gx = Math.round(cx + bx * (A + 4)),
        gy = Math.round(cy + by * (A + 4));
      site.gateX = (gx + 0.5) * TILE;
      site.gateY = (gy + 0.5) * TILE;
      site.ux = ux;
      site.uy = uy;

      const kk = (dx, dy) => dx + ":" + dy;
      const reserved = new Set();
      for (const [dx, dy] of gateTiles) reserved.add(kk(dx, dy));

      // the flak arc. Each gun marches straight out from the centre until
      // it is clear of the arch, so the arc hugs the outside of the wall
      // round the gate — never inside the yard.
      const flakTiles = [];
      for (let i = 0; i < FLAKS; i++) {
        const th = -FLAK_ARC / 2 + (FLAK_ARC * i) / (FLAKS - 1);
        const dxn = bx * Math.cos(th) - by * Math.sin(th);
        const dyn = by * Math.cos(th) + bx * Math.sin(th);
        let dx = 0,
          dy = 0;
        for (let r = A + 1; r < A * 2.4; r += 0.5) {
          dx = Math.round(cx + dxn * r) - cx;
          dy = Math.round(cy + dyn * r) - cy;
          if (R.wallRing(dx, dy, A) > 1.45 && !reserved.has(kk(dx, dy))) break;
        }
        if (R.wallRing(dx, dy, A) <= 1.45 || reserved.has(kk(dx, dy))) continue;
        reserved.add(kk(dx, dy));
        flakTiles.push([dx, dy]);
      }

      // the industry, at the back of the yard — the corner round the
      // gate is left open for the muster
      const PLAN = [
        ["hq", 2, -5, 1],
        ["concrete", -6, -6, 2],
        ["steel", 0, -7, 2],
        ["works", 6, 0, 1],
        ["oil", 6, 5, 1],
        ["alu", -6, 0, 1],
      ];
      const put = (key, dx, dy, lvl) => {
        const size = R.BDEF[key].size;
        const tx0 = Math.round(cx + dx - size / 2),
          ty0 = Math.round(cy + dy - size / 2);
        for (let r = 0; r <= 5; r++) {
          for (let s = 0; s < (r ? r * 8 : 1); s++) {
            const an = (s / (r ? r * 8 : 1)) * R.TAU;
            const tx = Math.round(tx0 + (r ? Math.cos(an) * r : 0)),
              ty = Math.round(ty0 + (r ? Math.sin(an) * r : 0));
            if (!this.yardClear(tx, ty, size, cx, cy, A, reserved)) continue;
            return this.addBuilding(key, f, tx, ty, lvl || 1, true);
          }
        }
        return null;
      };
      for (const [key, dx, dy, lvl] of PLAN) put(key, dx, dy, lvl);

      for (const [dx, dy] of flakTiles) this.addBuilding("flak", f, cx + dx, cy + dy, 1, true);

      const seen = new Set();
      for (const [dx, dy] of wallTiles) {
        const k = kk(dx, dy);
        if (seen.has(k)) continue;
        seen.add(k);
        this.addBuilding("wall", f, cx + dx, cy + dy, 1, true);
      }
      for (const [dx, dy] of gateTiles) this.addBuilding("gate", f, cx + dx, cy + dy, 1, true);

      // the drive runs out of the gate, down and to the left
      this.t.paintRoad(gx, gy, Math.round(gx + bx * APPROACH), Math.round(gy + by * APPROACH), 1);

      // the opening garrison, mustered inside the gate
      const spots = [];
      for (let dy = 2; dy <= 6; dy++)
        for (let dx = -6; dx <= -2; dx++) {
          const x = (cx + dx + 0.5) * TILE,
            y = (cy + dy + 0.5) * TILE;
          if (this.nav.openAt(x, y, 0, f)) spots.push({ x, y });
        }
      const give = (key, n) => {
        for (let i = 0; i < n; i++) {
          if (!spots.length) break;
          const p = spots[(i * 3 + 1) % spots.length];
          const u = this.addUnit(key, f, p.x, p.y);
          if (u) R.Entity.setOrder(this, u, { type: "hold", x: p.x, y: p.y });
        }
      };
      give("stonehammer", 2);
      give("lynx", 3);
      give("strider", 1);
      give("apc", 1);

      this.say(
        0,
        "Eight flaks stand outside the arch at " +
          site.name +
          ", round the gate. Hold them and the base holds.",
        "good",
      );
      this.say(0, "A Conquest Truck takes ground: kill the flaks, then drive it in.", "");
    }

    yardClear(tx, ty, size, cx, cy, A, reserved) {
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) {
          const x = tx + dx,
            y = ty + dy;
          // inside the arch, and clear of the wall band itself
          if (R.wallRing(x - cx, y - cy, A) > 0.85) return false;
          if (Math.abs(x - cx) >= A || Math.abs(y - cy) >= A) return false;
          if (reserved && reserved.has(x - cx + ":" + (y - cy))) return false;
          if (!this.t.canBuild(tx, ty, size, {})) return false;
        }
      return true;
    }

    /* ==================================================================
       spawning
       ================================================================== */

    addUnit(key, fac, x, y) {
      const def = R.UDEF[key];
      if (!def) return null;
      const layer = def.train ? 3 : def.cls === "air" ? 1 : def.cls === "sea" ? 2 : 0;
      // the squad book: a unit joins a living squad of its kind. When
      // the squads of its kind are full, the gate closes — you widen
      // the groups with a command building, or you spend the group on
      // something else. When no squad of its kind stands, a new one
      // opens, while the company may command another.
      const f = fac >= 0 ? this.factions[fac] : null;
      let squad = null;
      if (f) {
        let nSquads = 0;
        for (const id in f.squads) {
          const s = f.squads[id];
          nSquads++;
          if (s.key === key && s.n < def.grp && !squad) squad = s;
        }
        if (!squad) {
          // the books may not be balanced yet: fall back to the live rule
          const cap = Math.max(
            1,
            f.squadCap || Math.floor(R.groupLimit(Math.max(1, f.sites))) + (f.counts.maxgroup || 0),
          );
          if (nSquads >= cap) return null; // the group limit is the group limit
          squad = { id: this._squadSeq++, key, n: 0 };
          f.squads[squad.id] = squad;
        }
      }
      const u = {
        id: R.nextId(),
        kind: "u",
        key,
        def,
        w: def.w ? Object.assign({}, def.w) : null,
        w2: def.w2 ? Object.assign({}, def.w2) : null,
        fac,
        x,
        y,
        a: Math.random() * R.TAU,
        va: 0,
        vx: 0,
        vy: 0,
        layer,
        hp: def.hp,
        maxHp: def.hp,
        speed: def.speed,
        sight: def.sight,
        path: null,
        pi: 0,
        goal: null,
        order: null,
        tgt: null,
        tgtT: 0,
        cd: 0,
        cd2: 0,
        sel: false,
        dead: false,
        seed: Math.random() * 1000,
        gait: Math.random() * 10,
        tread: 0,
        rotor: Math.random() * 10,
        flash: 0,
        recoil: 0,
        alt: def.alt || 0,
        altW: def.alt || 0,
        stuck: 0,
        sayT: 0,
        say: "",
        home: null,
        carry: [],
        cap: def.carry || 0,
        repairing: null,
        capturing: null,
        capT: 0,
        lastHit: -99,
        attackers: 0,
        attackerT: 0,
        dmgFlash: 0,
        vet: 0,
        bornT: this.time,
        squad: null,
        ammo: def.ammo || 0,
        ammoMax: def.ammo || 0,
        lastMove: -99,
        lastFire: -99,
        detected: false,
        lastSeen: -99,
        fuel: 100,
        fuelMax: 100,
        landed: null,
        landing: null,
      };
      u.va = u.a;
      if (def.cls === "air") {
        u.alt = u.altW = 0;
      }
      if (fac >= 0 && f) {
        if (squad) {
          squad.n++;
          u.squad = squad;
        }
        if (def.polu) f.poluToday++;
      }
      this.nav.legalize(this, u);
      this.units.push(u);
      return u;
    }

    addBuilding(key, fac, tx, ty, lvl, instant) {
      const def = R.BDEF[key];
      if (!def) return null;
      const size = def.size;
      if (!this.t.canBuild(tx, ty, size, { water: def.water })) {
        const spot = this.t.findSpot(tx, ty, size, 10, { water: def.water });
        if (!spot) return null;
        tx = spot.tx;
        ty = spot.ty;
      }
      // which settlement does this stand in? everything per-site hangs
      // off it: the kind of military building allowed, the one base
      // extension, the flak defence
      let site = null,
        bd = 1e18;
      for (const s of this.t.sites) {
        const d = (s.tx - (tx + size / 2)) ** 2 + (s.ty - (ty + size / 2)) ** 2;
        const r = (s.r + 4) ** 2;
        if (d < r && d < bd) {
          bd = d;
          site = s;
        }
      }
      const st = def.flak
        ? R.flakStats(
            fac >= 0 && this.factions[fac] ? this.factions[fac].flakL2 : false,
            fac >= 0 && this.factions[fac] ? this.factions[fac].flakL3 : false,
          )
        : null;
      const b = {
        id: R.nextId(),
        kind: "b",
        key,
        def,
        fac,
        tx,
        ty,
        size,
        x: (tx + size / 2) * TILE,
        y: (ty + size / 2) * TILE,
        lvl: lvl || 1,
        hp: def.flak ? st.hp : R.levelHp(def, lvl || 1),
        maxHp: def.flak ? st.hp : R.levelHp(def, lvl || 1),
        arm: def.flak ? st.arm : def.arm,
        built: !!instant,
        buildT: instant ? 0 : def.time,
        buildTotal: instant ? 0 : def.time,
        queue: [],
        rally: null,
        cd: 0,
        tgt: null,
        tgtT: 0,
        turretA: Math.random() * R.TAU,
        turretW: Math.random() * R.TAU,
        sel: false,
        dead: false,
        seed: Math.random() * 1000,
        smoke: 0,
        fire: 0,
        flash: 0,
        recoil: 0,
        onFire: 0,
        w: def.w
          ? def.flak
            ? Object.assign({}, def.w, { dmg: st.dmg, rof: st.rof, range: st.range, pen: st.pen })
            : Object.assign({}, def.w)
          : null,
        sight: def.key === "sight" ? 500 + 200 * (lvl || 1) : def.sight || 300,
        site: site,
        lastHit: -99,
        attackers: 0,
        attackerT: 0,
        dmgFlash: 0,
        upT: 0,
        upgrading: 0,
        boosted: 0,
      };
      if (def.key === "maxextend" && site) site.extend = true;
      if (def.onOil) {
        let on = 0;
        for (let dy = 0; dy < size; dy++)
          for (let dx = 0; dx < size; dx++) {
            const i = this.t.idx(tx + dx, ty + dy);
            if (i >= 0 && this.t.type[i] === R.T.OIL) on++;
          }
        b.onOil = on;
      }
      // the Desert Order habit: a works on a gated yard musters its
      // troops outside the wall — every fresh crew marches out of the
      // gate. The steward's own rally (Y) overrides it.
      if (def.cat === "mil" && site && site.gateX !== undefined && fac === site.owner)
        b.rally = { x: site.gateX, y: site.gateY };
      if (fac >= 0) {
        const f = this.factions[fac];
        f.counts[key] = (f.counts[key] || 0) + 1;
        if (key === "hq") f.hq = b;
      }
      this.buildings.push(b);
      this.t.markBuilding(tx, ty, size, b.id);
      this.nav.markFootprint(tx, ty, size, true, fac, !!def.gate, def.gate ? site : null);
      return b;
    }

    removeBuilding(b, silent) {
      if (b.dead) return;
      b.dead = true;
      this.t.clearBuilding(b.tx, b.ty, b.size);
      this.nav.markFootprint(b.tx, b.ty, b.size, false, b.fac, !!b.def.gate, null);
      if (b.fac >= 0) {
        const f = this.factions[b.fac];
        f.counts[b.key] = Math.max(0, (f.counts[b.key] || 1) - 1);
        if (b.key === "hq") {
          f.alive = false;
          f.hq = null;
          if (b.fac === 0) this.finish(false, "The command centre has fallen.");
          else this.say(b.fac, R.factionName[b.fac] + " has lost its command centre.");
        }
      }
      if (!silent) {
        if (R.FX) R.FX.explode(this, b.x, b.y, b.size * 22, 1);
        if (ZS.sound) ZS.sound.event("boom", b.x, b.y);
        if (R.Cam) R.Cam.shake(6 + b.size * 2);
        if (b.fac >= 0) {
          this.factions[b.fac].lost++;
          if (b.fac === 0) this.stats.lost++;
        }
      }
      // the command books remember what a fall burns
      if (b.fac >= 0 && (b.def.recover || b.def.flak)) {
        const had = b.fac;
        R.Economy.recoverLost(this.factions[had], b, true);
      }
      // a flak falling is the capture rule working
      if (b.def.flak && b.site) this.siteLostFlak(b.site, b);
      if (b.def.flak && b.fac !== 0 && b.fac >= 0) this.stats.flakBroken++;
    }

    killUnit(u, silent) {
      if (u.dead) return;
      u.dead = true;
      if (u.fac >= 0) {
        this.factions[u.fac].lost++;
        if (u.fac === 0) this.stats.lost++;
        const sq = u.squad;
        if (sq) {
          sq.n--;
          if (sq.n <= 0) delete this.factions[u.fac].squads[sq.id];
        }
      }
      for (const c of u.carry) this.killUnit(c, true);
      u.carry.length = 0;
      if (!silent) {
        if (R.FX)
          R.FX.explode(
            this,
            u.x,
            u.y,
            u.def.cls === "air" ? 46 : u.def.cls === "arm" ? 40 : u.def.train ? 44 : 24,
            u.def.cls === "air" ? 1.2 : 0.8,
          );
        if (R.FX) R.FX.wreck(this, u.x, u.y, u.def, u.fac);
        if (ZS.sound)
          ZS.sound.event(
            u.def.cls === "air" ? "boom" : u.def.cls === "arm" ? "boom" : "die",
            u.x,
            u.y,
          );
      }
      if (u.fac === 0 && u.sel) this.deselect(u);
    }

    /* ==================================================================
       THE CAPTURE RULE
       ================================================================== */

    // a flak on a site has gone. If it was the last standing for the
    // owner, the base is ownerless: the flag falls, half the industry
    // burns, the command is ash.
    siteLostFlak(site, b) {
      // count what still stands for the owner of this ground
      const owner = site.owner;
      let flaks = 0;
      for (const x of this.buildings) {
        if (x.dead || !x.def.flak) continue;
        if (x.site !== site) continue;
        if (owner >= 0 ? x.fac === owner : true) flaks++;
      }
      if (flaks > 0) return;
      site.open = true;
      if (site.home) {
        this.say(0, "The flaks at " + site.name + " are down — the yard stands open", "warn");
        R.FX.ping(this, site.x, site.y, "bad");
        return; // a home ground is never ownerless
      }
      if (owner < 0) return; // a yellow base simply stands open
      const f = this.factions[owner];
      // 50% of the production buildings go up with the flag
      const prod = this.buildings.filter(
        (x) => !x.dead && x.fac === owner && (x.def.cat === "econ" || x.def.cat === "mil"),
      );
      for (let i = prod.length - 1; i >= 0; i--) {
        if (i % 2 === 0) {
          R.Economy.recoverLost(f, prod[i], false);
          this.removeBuilding(prod[i], true);
        } else {
          prod[i].lvl = Math.max(1, prod[i].lvl >> 1);
          const nh = R.levelHp(prod[i].def, prod[i].lvl);
          prod[i].maxHp = nh;
          prod[i].hp = Math.min(prod[i].hp, nh);
        }
      }
      // the command buildings: ash, but the purse remembers
      const cmd = this.buildings.filter(
        (x) => !x.dead && x.fac === owner && x.def.cat === "cmd" && x.site === site,
      );
      for (const c of cmd) {
        R.Economy.recoverLost(f, c, false);
        this.removeBuilding(c, true);
      }
      // the flak upgrades are part of what burns
      if (f.flakL2) f.recovered.flakL2 = 1;
      if (f.flakL3) f.recovered.flakL3 = 1;
      f.flakL2 = false;
      f.flakL3 = false;
      // the sand gives a truck to whoever came with nothing
      const conqueror = this.lastAttackerOf(b);
      if (conqueror >= 0 && this.factions[conqueror] && this.factions[conqueror].sites <= 0) {
        const u = this.addUnit("apc", conqueror, site.x, site.y);
        if (u)
          this.say(
            conqueror,
            "The company with no base on the map is given a Conquest Truck",
            "good",
          );
      }
      site.owner = -1;
      site.capT = 0;
      site.capBy = -1;
      this.claimSite(site, -1);
      if (owner === 0) {
        this.stats.lostSite = (this.stats.lostSite || 0) + 1;
        this.say(0, "The flaks at " + site.name + " are down — the base is ownerless", "warn");
        R.FX.ping(this, site.x, site.y, "bad");
        if (R.Cam) R.Cam.shake(5);
      } else if (conqueror === 0) {
        this.say(
          0,
          "The flaks at " + site.name + " are down — it will not refuse a Conquest Truck",
          "good",
        );
        R.FX.ping(this, site.x, site.y, "good");
      }
    }

    lastAttackerOf(b) {
      // who last touched this flak: remember it on the hit, read it here
      return b.lastBy || -1;
    }

    // the Conquest Truck has stood on open ground long enough: the base
    // changes hands and stands up with two fresh flaks in the door.
    capture(g, site, fac) {
      // the player's home ground never turns; a rival's can, and does
      if (site.home && site.owner === 0) return false;
      if (!site.open) return false;
      const old = site.owner;
      site.owner = fac;
      site.capT = 0;
      site.capFrac = 0;
      site.capBy = -1;
      site.open = false;
      if (site.nest) {
        site.nest = false;
        if (R.Horde) R.Horde.nestLost(g, site);
      }
      this.claimSite(site, fac);
      // two fresh flaks, standing where the door is
      const spots = this.ringSpots(site, 2);
      for (let i = 0; i < 2 && i < spots.length; i++)
        this.addBuilding("flak", fac, spots[i].tx, spots[i].ty, 1, true);
      if (fac === 0) {
        this.stats.captured++;
        this.say(0, site.name + " is yours. Two flaks stand in the door.", "good");
        R.FX.ping(this, site.x, site.y, "good");
      } else if (old === 0) {
        this.say(0, R.factionName[fac] + " has taken " + site.name, "warn");
        R.FX.ping(this, site.x, site.y, "bad");
      } else if (old >= 0) {
        this.say(fac, R.factionName[fac] + " holds " + site.name, "");
      }
      if (ZS.sound) ZS.sound.event("capture", site.x, site.y);
      return true;
    }

    ringSpots(site, n) {
      const out = [];
      for (let k = 0; k < n * 14; k++) {
        const an = (k / (n * 14)) * R.TAU;
        const rr = 3 + (k % 4);
        const tx = Math.round(site.tx + Math.cos(an) * rr),
          ty = Math.round(site.ty + Math.sin(an) * rr);
        if (this.t.canBuild(tx, ty, 1, {})) out.push({ tx, ty });
        if (out.length >= n) break;
      }
      return out;
    }

    /* ==================================================================
       territory
       ================================================================== */

    claimSite(site, fac) {
      const old = site.owner;
      site.owner = fac;
      if (old >= 0 && this.factions[old])
        this.factions[old].sites = Math.max(0, this.factions[old].sites - 1);
      if (fac >= 0 && this.factions[fac]) this.factions[fac].sites++;
      this.reclaim();
    }

    reclaim() {
      const t = this.t;
      t.owner.fill(-1);
      for (const s of t.sites) {
        if (s.owner < 0) continue;
        const r = s.r + (s.tier - 1) * 3;
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const x = s.tx + dx,
              y = s.ty + dy;
            const i = t.idx(x, y);
            if (i < 0) continue;
            const prev = t.owner[i];
            if (prev === -1 || prev === s.owner) t.owner[i] = s.owner;
            else {
              const dNew = Math.hypot(dx, dy);
              const os = t.sites.find((o) => o.owner === prev);
              if (os) {
                const orr = os.r + (os.tier - 1) * 3;
                if (Math.hypot(os.tx - x, os.ty - y) / orr > dNew / r) t.owner[i] = s.owner;
              }
            }
          }
      }
    }

    siteAt(x, y) {
      let best = null,
        bd = 260;
      for (const s of this.t.sites) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      return best;
    }

    /* ==================================================================
       squads: merging is the only group command the war gives you
       ================================================================== */

    mergeSquads(g, list) {
      const byKey = Object.create(null);
      for (const u of list) {
        if (u.kind !== "u" || !u.squad) continue;
        (byKey[u.key] = byKey[u.key] || []).push(u);
      }
      let moved = 0;
      for (const key in byKey) {
        const us = byKey[key];
        const squads = Object.create(null);
        for (const u of us) squads[u.squad.id] = u.squad;
        const ids = Object.keys(squads);
        if (ids.length < 2) continue;
        // the fullest squad is the one the others pour into
        ids.sort((a, b) => squads[b].n - squads[a].n);
        const target = squads[ids[0]];
        for (let i = 1; i < ids.length; i++) {
          const src = squads[ids[i]];
          for (const u of us) {
            if (u.squad !== src) continue;
            if (target.n >= R.UDEF[key].grp) continue;
            src.n--;
            target.n++;
            u.squad = target;
            moved++;
          }
          if (src.n <= 0) delete this.factions[u.fac].squads[src.id];
        }
      }
      return moved;
    }

    /* ==================================================================
       queries
       ================================================================== */

    rebuildGrid() {
      const g = this.grid;
      g.cells.clear();
      for (const u of this.units) if (!u.dead && !u.inside) g.insert(u);
      for (const b of this.buildings) if (!b.dead) g.insert(b);
    }

    inRect(x0, y0, x1, y1, fac) {
      const out = [];
      for (const u of this.units) {
        if (u.dead || u.inside) continue;
        if (fac !== undefined && u.fac !== fac) continue;
        if (u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) out.push(u);
      }
      return out;
    }

    // nearest enemy that `e` can actually hurt, at the range the gun
    // offers each target. A specialized gun keeps its eye on what it is
    // built to kill: a base-killer takes the factory over the tank
    // standing between, and its reach stretches (rm) while that kind of
    // target moves or fires.
    nearestTarget(e, range, needAir, noBld) {
      const g = this.grid;
      const spec = e.def ? e.def.spec : null;
      const qR =
        range * (spec ? e.def.rm || 1 : 1) + (e.def && e.def.flak ? R.FLAK_SEA_RANGE_BONUS : 0);
      let best = null;
      let specBest = null,
        specBd = Infinity;
      g.query(e.x, e.y, qR, (o) => {
        if (o === e || o.dead) return;
        if (o.fac === e.fac) return;
        if (!R.hostileTo(e.fac, o.fac)) return;
        if (noBld && o.kind === "b") return;
        // the wall and the gate are part of the ground: no gun shoots them
        if (o.kind === "b" && o.def.inert) return;
        if (o.kind === "u" && o.def.stealth && !o.detected) return;
        const d2 = R.dist2(e.x, e.y, o.x, o.y);
        const lim = R.Combat.rangeTo(this, e, o);
        if (d2 >= lim * lim) return;
        if (!this.canHit(e, o, needAir)) return;
        best = o;
        if (spec && R.specMatch(spec, o) && d2 < specBd) {
          specBd = d2;
          specBest = o;
        }
      });
      return specBest || best;
    }

    // can the gun that `e` offers point at `o`? air needs the anti-air
    // gun, sea needs the ship gun, and everything else needs a gun at all
    canHit(e, o, useAA) {
      const w = useAA && e.w2 ? e.w2 : e.w;
      if (!w) return false;
      if (e.def && e.def.noAA) return false;
      if (o.kind === "u") {
        if (o.def.cls === "air") return !!w.aa;
        if (o.def.cls === "sea") return !!w.as;
      }
      return true;
    }

    buildingAt(tx, ty) {
      const i = this.t.idx(tx, ty);
      if (i < 0) return null;
      const id = this.t.occ[i];
      if (!id) return null;
      for (const b of this.buildings) if (b.id === id && !b.dead) return b;
      return null;
    }
    buildingAtWorld(x, y) {
      return this.buildingAt((x / TILE) | 0, (y / TILE) | 0);
    }

    unitAt(x, y, r) {
      r = r || 26;
      let best = null,
        bd = r * r;
      for (const u of this.units) {
        if (u.dead || u.inside) continue;
        if (u.def.stealth && !u.detected && u.fac !== 0) continue;
        const d2 = R.dist2(x, y, u.x, u.y);
        if (d2 < bd) {
          bd = d2;
          best = u;
        }
      }
      return best;
    }

    /* ==================================================================
       fog of war
       ================================================================== */

    recomputeFog(_force) {
      const t = this.t,
        vis = this.vis;
      for (let i = 0; i < vis.length; i++) if (vis[i] === 2) vis[i] = 1;
      const mark = (x, y, r) => {
        const rT = Math.ceil(r / TILE);
        const tx = (x / TILE) | 0,
          ty = (y / TILE) | 0;
        for (let dy = -rT; dy <= rT; dy++)
          for (let dx = -rT; dx <= rT; dx++) {
            if (dx * dx + dy * dy > rT * rT) continue;
            const i = t.idx(tx + dx, ty + dy);
            if (i >= 0) vis[i] = 2;
          }
      };
      for (const u of this.units) {
        if (u.dead || u.fac !== 0 || u.inside) continue;
        mark(u.x, u.y, u.sight);
      }
      for (const b of this.buildings) {
        if (b.dead || b.fac !== 0) continue;
        mark(b.x, b.y, b.sight + b.size * 20);
      }
      // sight towers see the ground; jammers hide what is under them
      for (const b of this.buildings) {
        if (b.dead || b.fac !== 0) continue;
        if (b.def.key === "sight") mark(b.x, b.y, b.sight || 1100);
      }
      for (const s of this.t.sites) if (s.owner === 0) mark(s.x, s.y, s.r * TILE);
    }

    // is this ground seen by somebody? ground under a jammer tower reads
    // unseen to everyone but its owner
    visible(x, y) {
      const i = this.t.at(x, y);
      if (i < 0) return 0;
      const v = this.vis[i];
      if (v === 0) return 0;
      if (v === 1 && this.t.jam && this.t.jam[i]) return 0;
      return v;
    }
    visibleNow(x, y) {
      return this.visible(x, y) === 2;
    }

    // detector and sight: what is hidden on the map, hidden how
    stealthKnown(u) {
      if (!u.def.stealth) return true;
      return u.detected;
    }

    /* ==================================================================
       selection
       ================================================================== */

    clearSel() {
      for (const u of this.units) u.sel = false;
      for (const b of this.buildings) b.sel = false;
    }
    select(list, additive) {
      if (!additive) this.clearSel();
      for (const e of list) e.sel = true;
    }
    deselect(e) {
      e.sel = false;
    }
    selection() {
      const out = [];
      for (const u of this.units) if (u.sel && !u.dead && !u.inside) out.push(u);
      for (const b of this.buildings) if (b.sel && !b.dead) out.push(b);
      return out;
    }
    selUnits() {
      const out = [];
      for (const u of this.units) if (u.sel && !u.dead && !u.inside) out.push(u);
      return out;
    }

    /* ==================================================================
       orders
       ================================================================== */

    order(list, ord, append) {
      if (!list.length) return;
      const chainable = ord.type === "move" || ord.type === "amove" || ord.type === "patrol";
      const chained = !!append && chainable;
      if (chainable && list.length > 1 && !chained) {
        R.Entity.assignFormation(this, list, ord);
      } else {
        for (const e of list) R.Entity.setOrder(this, e, ord, chained);
      }
      if (R.FX)
        R.FX.marker(
          this,
          ord.x,
          ord.y,
          ord.type === "amove" ? "attack" : ord.type === "move" ? "move" : null,
        );
    }

    /* ==================================================================
       ledger
       ================================================================== */

    say(fac, text, kind) {
      this.log.push({ t: this.time, fac, text, kind: kind || "" });
      if (this.log.length > 240) this.log.shift();
      if (fac === 0 || fac === undefined) {
        this.alerts.push({ t: this.time, text, kind: kind || "" });
        if (this.alerts.length > 6) this.alerts.shift();
        if (R.UI) R.UI.toast(text);
      }
    }

    finish(won, why) {
      if (this.over) return;
      this.over = true;
      this.result = { won, why, time: this.time, stats: Object.assign({}, this.stats) };
      if (R.UI) R.UI.showResult(this.result);
    }

    /* ==================================================================
       the frame
       ================================================================== */

    update(dt) {
      if (this.paused || this.over) return;
      this.time += dt;
      this.nav.sync(this);
      this.rebuildGrid();

      R.Economy.update(this, dt);
      this.detectPass(dt);
      this.territoryGrow(dt);
      this.questCheck();

      // the AI thinks on its own clock
      if (R.AI) R.AI.update(this, dt);
      if (R.Horde) R.Horde.update(this, dt);

      for (const b of this.buildings) if (!b.dead) R.Base.update(this, b, dt);
      for (const u of this.units) if (!u.dead) R.Entity.update(this, u, dt);

      R.Combat.update(this, dt);
      if (R.FX) R.FX.update(this, dt);

      this.fogT += dt;
      if (this.fogT > 0.3) {
        this.fogT = 0;
        this.recomputeFog();
      }

      let w = 0;
      for (let i = 0; i < this.units.length; i++) {
        const u = this.units[i];
        if (!u.dead) this.units[w++] = u;
      }
      this.units.length = w;
      w = 0;
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i];
        if (!b.dead) this.buildings[w++] = b;
      }
      this.buildings.length = w;

      if (!this.over && this.time > 60) {
        let enemies = 0;
        for (let i = 1; i <= 5; i++)
          if (this.factions[i].alive && this.factions[i].sites > 0) enemies++;
        if (enemies === 0 && this.factions[0].alive)
          this.finish(true, "Every rival banner is off the map.");
      }
    }

    // the detector towers and detector planes are the only eyes that see
    // the invisible; the sight a stealth unit keeps is its own
    detectPass(_dt) {
      // find detectors: buildings of the player and the AI, flying wardens
      let any = false;
      for (const b of this.buildings) if (!b.dead && b.def.key === "detector") any = true;
      const wardens = [];
      if (!any) for (const u of this.units) if (!u.dead && u.def.detector) wardens.push(u);
      if (!any && !wardens.length) return;
      for (const u of this.units) {
        if (u.dead || !u.def.stealth) continue;
        if (u.detected && this.time - u.lastSeen < 3) continue;
        let seen = false;
        if (any)
          for (const b of this.buildings) {
            if (b.dead || b.def.key !== "detector") continue;
            if (R.dist2(b.x, b.y, u.x, u.y) < 1100 * 1100) {
              seen = true;
              break;
            }
          }
        if (!seen)
          for (const wd of wardens) {
            if (wd.dead || wd.fac === u.fac) continue;
            if (!R.hostileTo(wd.fac, u.fac)) continue;
            if (R.dist2(wd.x, wd.y, u.x, u.y) < (wd.sight + 200) * (wd.sight + 200)) {
              seen = true;
              break;
            }
          }
        u.detected = seen;
        if (seen) u.lastSeen = this.time;
      }
    }

    // the ring widens the longer you hold the place; a held base with a
    // jammer tower stands dark to the enemy's sight
    territoryGrow(dt) {
      for (const s of this.t.sites) {
        if (s.owner < 0) continue;
        s.hold = (s.hold || 0) + dt;
        if (s.hold > 150 && s.tier < 4) {
          s.tier++;
          s.hold = 0;
          this.reclaim();
          if (s.owner === 0)
            this.say(0, s.name + " has grown — its ground reaches further", "good");
        }
      }
      // jammer: the tiles under a jammer tower read unseen, recomputed
      // a few times a second with the fog
      if ((this._jamT = (this._jamT || 0) + dt) > 0.4) {
        this._jamT = 0;
        const jam = this.t.jam;
        jam.fill(0);
        for (const b of this.buildings) {
          if (b.dead || b.def.key !== "jammer") continue;
          const r = 300 + 80 * b.lvl;
          const rT = Math.ceil(r / TILE);
          const tx = (b.x / TILE) | 0,
            ty = (b.y / TILE) | 0;
          for (let dy = -rT; dy <= rT; dy++)
            for (let dx = -rT; dx <= rT; dx++) {
              if (dx * dx + dy * dy > rT * rT) continue;
              const i = this.t.idx(tx + dx, ty + dy);
              if (i >= 0) jam[i] = 1;
            }
        }
        for (const s of this.t.sites) s.jammed = false;
      }
    }

    /* ---------- the starter quests ---------- */

    questCheck() {
      const f = this.factions[0];
      for (const q of R.QUESTS) {
        if (this.questDone[q.key]) continue;
        let done = false;
        if (q.key === "q_breda") done = this.stats.bredaBuilt >= 3;
        else if (q.key === "q_flak") done = this.stats.flakBroken >= 1;
        else if (q.key === "q_site") done = this.stats.captured >= 1;
        else if (q.key === "q_flaks") done = (f.counts.flak || 0) >= 6;
        if (!done) continue;
        this.questDone[q.key] = true;
        const rw = q.reward;
        if (rw.gold) f.gold += rw.gold;
        for (const k in rw)
          if (k !== "gold") f.res[k] = Math.min(f.store[k] || 1e9, f.res[k] + rw[k]);
        this.say(0, "Quest done — " + q.name + ". The company pays.", "good");
      }
    }

    /* ==================================================================
       payment
       ================================================================== */

    canPay(fac, cost) {
      const f = this.factions[fac];
      if (cost.gold) return f.gold >= cost.gold;
      const r = f.res;
      for (const k in cost) if (r[k] < cost[k]) return false;
      return true;
    }
    pay(fac, cost) {
      const f = this.factions[fac];
      if (cost.gold) {
        f.gold -= cost.gold;
        return;
      }
      const r = f.res;
      for (const k in cost) r[k] -= cost[k];
    }
    refund(fac, cost, frac) {
      const f = this.factions[fac];
      if (cost.gold) {
        f.gold += cost.gold * (frac === undefined ? 1 : frac);
        return;
      }
      const r = f.res;
      for (const k in cost) r[k] += cost[k] * (frac === undefined ? 1 : frac);
    }

    count(fac, key) {
      const f = this.factions[fac];
      return f.counts[key] || 0;
    }
    countUnits(fac, key) {
      let n = 0;
      for (const u of this.units) if (!u.dead && u.fac === fac && (!key || u.key === key)) n++;
      return n;
    }
    maxBuildings(fac, key) {
      const def = R.BDEF[key];
      if (!def) return 0;
      return def.max || 1;
    }
  }

  R.Game = Game;
})();
