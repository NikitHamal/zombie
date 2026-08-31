/* Desert Order — the game state.

   One object holds the whole war: the terrain, the navigation grid, every
   unit and building, every faction's stores, the selection and the orders.
   The systems (entity, base, combat, economy, ai, horde) all take this
   object and do their piece of the frame; nothing else holds game state.

   Entities live in flat arrays and are marked dead rather than removed
   mid-frame; the sweep happens once, at the end. A spatial hash is rebuilt
   every frame so "what is near me" is cheap for two thousand things. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE;

  const GRID_CELL = 150;

  class Game {
    constructor(seed) {
      this.seed = seed >>> 0;
      this.t = new R.Terrain(seed);
      this.nav = new R.Nav(this.t);
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
      this.deadSweep = [];
      this.fogT = 0;
      this.nextFog = 0;
      this.stats = { lost: 0, killed: 0, built: 0, captured: 0 };

      this.factions = R.FACTIONS.map((f) => ({
        id: f.id,
        def: f,
        res: { concrete: 0, steel: 0, alu: 0, fuel: 0 },
        store: { concrete: 0, steel: 0, alu: 0, fuel: 0 },
        rate: { concrete: 0, steel: 0, alu: 0, fuel: 0 },
        cap: 0,
        capUsed: 0,
        sites: 0,
        hq: null,
        counts: {}, // building key -> how many
        units: 0,
        lost: 0,
        kills: 0,
        alive: true,
        ai: null,
        firstContact: 0,
      }));

      // opening purse: enough to raise a real base, not enough to win
      const p = this.factions[0];
      p.res.concrete = 6500;
      p.res.steel = 3400;
      p.res.alu = 1200;
      p.res.fuel = 2400;
      for (let i = 1; i < 6; i++) {
        const f = this.factions[i];
        f.res.concrete = 6000;
        f.res.steel = 3200;
        f.res.alu = 900;
        f.res.fuel = 2200;
      }
      this.vis = this.t.vis;
      this.visFade = this.t.visFade;
    }

    /* ==================================================================
       setup
       ================================================================== */

    start() {
      this.placeHome();
      this.placeNations();
      if (R.Horde) R.Horde.setup(this);
      this.buildStartBase();
      this.recomputeFog(true);
      return this;
    }

    placeHome() {
      const site = this.t.homeSite;
      site.owner = 0;
      site.tier = 2;
      this.claimSite(site, 0);
      this.factions[0].hq = site;
    }

    placeNations() {
      // every nation gets a home site as far from the player as the map
      // allows, and a second one to grow into
      const home = this.t.homeSite;
      const pool = this.t.sites
        .filter((s) => s !== home)
        .sort(
          (a, b) =>
            Math.hypot(b.tx - home.tx, b.ty - home.ty) - Math.hypot(a.tx - home.tx, a.ty - home.ty),
        );
      let k = 0;
      for (let i = 1; i <= 5; i++) {
        const s1 = pool[k++];
        const s2 = pool[k++];
        if (s1) {
          s1.owner = i;
          this.claimSite(s1, i);
          this.factions[i].hq = s1;
        }
        if (s2) {
          s2.owner = i;
          this.claimSite(s2, i);
        }
      }
      // three sites start infested: that is where the Rot comes from
      const rest = this.t.sites.filter((s) => s.owner === -1);
      for (let i = 0; i < R.HORDE.nests && i < rest.length; i++) {
        const s = rest[(i * 7 + 3) % rest.length];
        s.nest = true;
        s.owner = 6;
        this.claimSite(s, 6);
      }
    }

    buildStartBase() {
      // the player begins exactly as a Desert Order base begins: a walled
      // yard, a command centre, industry, and guns on the wall
      const site = this.t.homeSite;
      const f = 0;
      const cx = site.tx,
        cy = site.ty;

      const put = (key, dx, dy, lvl) => {
        const b = this.addBuilding(key, f, cx + dx, cy + dy, lvl || 1, true);
        return b;
      };

      put("hq", -2, -2, 2);
      put("concrete", 3, -3, 2);
      put("concrete", -3, 4, 1);
      put("steelmill", 3, 0, 2);
      put("aluworks", -5, -1, 1);
      put("refinery", -5, 3, 1);
      put("barracks", 3, 3, 1);
      put("works", -5, -5, 1);
      put("radar", 0, 4, 1);
      put("repair", -1, 4, 1);

      // the wall ring and the gates, with a gun on each corner
      const R0 = 8;
      const ring = [];
      for (let a = -R0; a <= R0; a++) {
        ring.push([a, -R0], [a, R0], [-R0, a], [R0, a]);
      }
      const gates = [
        [0, -R0],
        [0, R0],
        [-R0, 0],
        [R0, 0],
      ];
      const isGate = (dx, dy) => gates.some((g) => g[0] === dx && g[1] === dy);
      const seen = new Set();
      for (const [dx, dy] of ring) {
        const k = dx + ":" + dy;
        if (seen.has(k)) continue;
        seen.add(k);
        if (isGate(dx, dy)) {
          put("gate", dx, dy, 1);
          continue;
        }
        put("wall", dx, dy, 1);
      }
      // corner guns, and a flak pair to make the point about aircraft
      put("mgnest", -R0 + 1, -R0 + 1, 1);
      put("atgun", R0 - 2, -R0 + 1, 1);
      put("mgnest", R0 - 2, R0 - 2, 1);
      put("atgun", -R0 + 1, R0 - 2, 1);
      put("flaktower", -R0 + 1, 1, 1);
      put("flaktower", R0 - 2, 1, 1);

      // a starting garrison, so the base is not empty
      const open = (dx, dy) => {
        const x = (cx + dx + 0.5) * TILE,
          y = (cy + dy + 0.5) * TILE;
        return this.nav.openAt(x, y, 0) ? { x, y } : null;
      };
      const spots = [];
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const p = open(dx, dy);
          if (p) spots.push(p);
        }
      const give = (key, n) => {
        for (let i = 0; i < n; i++) {
          const p = spots[(i * 5 + 2) % spots.length];
          if (p)
            this.addUnit(
              key,
              0,
              p.x + (Math.random() - 0.5) * 20,
              p.y + (Math.random() - 0.5) * 20,
            );
        }
      };
      give("rifle", 4);
      give("mg", 2);
      give("at", 2);
      give("ltank", 3);
      give("scout", 2);
      give("truck", 1);
      give("eng", 2);
    }

    /* ==================================================================
       spawning
       ================================================================== */

    addUnit(key, fac, x, y) {
      const def = R.UDEF[key];
      if (!def) return null;
      const w = def.w ? R.WDEF[def.w] : null;
      const layer = def.cls === "air" ? 1 : def.cls === "sea" ? 2 : 0;
      const u = {
        id: R.nextId(),
        kind: "u",
        key,
        def,
        w,
        w2: def.w2 ? R.WDEF[def.w2] : null,
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
      };
      u.va = u.a;
      if (def.cls === "air") {
        u.alt = u.altW = 0; // takes off after spawning
        u.fuel = 100;
        u.fuelMax = 100;
      }
      // a gun that cannot reach aircraft means the unit needs flak cover
      u.hasAA = !!(w && w.aa) || !!(u.w2 && u.w2.aa);
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
        hp: R.levelHp(def, lvl || 1),
        maxHp: R.levelHp(def, lvl || 1),
        arm: def.arm,
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
        w: def.w ? R.WDEF[def.w] : null,
        sight: def.sight || 300,
        site: null,
        lastHit: -99,
        attackers: 0,
        attackerT: 0,
        dmgFlash: 0,
        upT: 0,
        upgrading: 0,
        boosted: 0,
      };
      // an oil refinery sitting on a seep pays far better
      if (def.onOil) {
        let on = 0;
        for (let dy = 0; dy < size; dy++)
          for (let dx = 0; dx < size; dx++) {
            const i = this.t.idx(tx + dx, ty + dy);
            if (i >= 0 && this.t.type[i] === R.T.OIL) on++;
          }
        b.onOil = on;
      }
      this.buildings.push(b);
      this.t.markBuilding(tx, ty, size, b.id);
      this.nav.markFootprint(tx, ty, size, true);
      const f = this.factions[fac];
      f.counts[key] = (f.counts[key] || 0) + 1;
      if (def.cap) f.cap += def.cap;
      if (key === "hq") f.hq = b;
      return b;
    }

    removeBuilding(b, silent) {
      if (b.dead) return;
      b.dead = true;
      this.t.clearBuilding(b.tx, b.ty, b.size);
      this.nav.markFootprint(b.tx, b.ty, b.size, false);
      const f = this.factions[b.fac];
      f.counts[b.key] = Math.max(0, (f.counts[b.key] || 1) - 1);
      if (b.def.cap) f.cap = Math.max(0, f.cap - b.def.cap);
      if (!silent) {
        if (R.FX) R.FX.explode(this, b.x, b.y, b.size * 22, 1);
        if (ZS.sound) ZS.sound.event("boom", b.x, b.y);
        if (R.Cam) R.Cam.shake(6 + b.size * 2);
        f.lost++;
        if (b.fac === 0) this.stats.lost++;
      }
      if (b.key === "hq") {
        f.alive = false;
        f.hq = null;
        if (b.fac === 0) this.finish(false, "The command centre has fallen.");
        else this.say(b.fac, R.factionName[b.fac] + " has lost its command centre.");
      }
    }

    killUnit(u, silent) {
      if (u.dead) return;
      u.dead = true;
      this.factions[u.fac].lost++;
      if (u.fac === 0) this.stats.lost++;
      // anything it was carrying goes down with it
      for (const c of u.carry) this.killUnit(c, true);
      u.carry.length = 0;
      if (!silent) {
        if (R.FX)
          R.FX.explode(
            this,
            u.x,
            u.y,
            u.def.cls === "air" ? 46 : u.def.cls === "arm" ? 40 : 24,
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

    // repaint the territory grid from every owned site
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
            // closer sites win
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
        bd = 1e9;
      for (const s of this.t.sites) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      return bd < 260 ? best : null;
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

    // every entity in a world rect (box select lives here)
    inRect(x0, y0, x1, y1, fac) {
      const out = [];
      for (const u of this.units) {
        if (u.dead || u.inside) continue;
        if (fac !== undefined && u.fac !== fac) continue;
        if (u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) out.push(u);
      }
      return out;
    }

    // nearest enemy entity of `e` within `range`, that `e` can actually hurt
    nearestTarget(e, range, needAir) {
      const g = this.grid;
      let best = null,
        bd = range * range;
      g.query(e.x, e.y, range, (o) => {
        if (o === e) return;
        if (o.dead) return;
        if (o.fac === e.fac) return;
        if (!R.hostileTo(e.fac, o.fac)) return;
        const d2 = R.dist2(e.x, e.y, o.x, o.y);
        if (d2 >= bd) return;
        if (!this.canHit(e, o, needAir)) return;
        bd = d2;
        best = o;
      });
      return best;
    }

    // can `e` shoot at `o` at all? (wrong layer = no)
    canHit(e, o, useAA) {
      const w = useAA && e.w2 ? e.w2 : e.w || (e.def && e.def.w ? R.WDEF[e.def.w] : null);
      if (!w) return false;
      const air = o.kind === "u" && o.def.cls === "air";
      const sea = o.kind === "u" && o.def.cls === "sea";
      if (air) return !!w.aa;
      if (sea) return w.as !== false && w.kind !== "torp" ? true : !!w.as || w.kind === "torp";
      return w.as !== false;
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
        const d2 = R.dist2(x, y, u.x - (u.def.alt ? 0 : 0), u.y);
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

    recomputeFog(force) {
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
      // allies share what they see, which is the point of allies
      for (const s of this.t.sites) if (s.owner === 0) mark(s.x, s.y, s.r * TILE);
      if (force) for (let i = 0; i < vis.length; i++) if (vis[i] === 0) vis[i] = 0;
    }

    visible(x, y) {
      const i = this.t.at(x, y);
      return i < 0 ? 0 : this.vis[i];
    }
    visibleNow(x, y) {
      return this.visible(x, y) === 2;
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
       orders — the right-click vocabulary
       ================================================================== */

    // `append` is the shift key: chain this order behind whatever the unit
    // is already doing instead of replacing it.
    order(list, ord, append) {
      if (!list.length) return;
      const chainable = ord.type === "move" || ord.type === "amove" || ord.type === "patrol";
      const chained = !!append && chainable;
      // a group move gets a formation; a single unit just goes. A chained
      // order is handed out one by one — there is no formation to lay out
      // for a waypoint you have not reached yet.
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
      this.nav.sync();
      this.rebuildGrid();

      R.Economy.update(this, dt);
      R.Territory.grow(this, dt);

      if (R.AI) R.AI.update(this, dt);
      if (R.Horde) R.Horde.update(this, dt);

      for (const b of this.buildings) if (!b.dead) R.Base.update(this, b, dt);
      for (const u of this.units) if (!u.dead) R.Entity.update(this, u, dt);

      R.Combat.update(this, dt);
      if (R.FX) R.FX.update(this, dt);

      // fog: recomputed a few times a second, not every frame
      this.fogT += dt;
      if (this.fogT > 0.3) {
        this.fogT = 0;
        this.recomputeFog();
      }

      // the sweep: take the dead off the field, once
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

      // victory: the map is yours when nobody hostile holds a site
      if (!this.over && this.time > 60) {
        let enemies = 0;
        for (let i = 1; i <= 5; i++)
          if (this.factions[i].alive && this.factions[i].sites > 0) enemies++;
        if (enemies === 0 && this.factions[0].alive)
          this.finish(true, "Every rival banner is off the map.");
      }
    }

    // is this faction able to pay?
    canPay(fac, cost) {
      const r = this.factions[fac].res;
      for (const k in cost) if (r[k] < cost[k]) return false;
      return true;
    }
    pay(fac, cost) {
      const r = this.factions[fac].res;
      for (const k in cost) r[k] -= cost[k];
    }
    refund(fac, cost, frac) {
      const r = this.factions[fac].res;
      for (const k in cost) r[k] += cost[k] * (frac === undefined ? 1 : frac);
    }

    // how many of a thing this faction has standing
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
      // settlement sites raise the ceiling on everything, which is why you
      // go and take them
      const f = this.factions[fac];
      const sites = f ? f.sites : 0;
      const bonus = 1 + Math.floor(sites * 0.5);
      return Math.round(def.max * bonus);
    }
  }

  R.Game = Game;
})();
