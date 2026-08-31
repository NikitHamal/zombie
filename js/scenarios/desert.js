/* SCENARIO PACK: The Desert Order
 *
 * A hand-drawn real-time strategy. You hold a walled outpost on the
 * frontier, and you take more of the desert. Rival nations war on you and
 * on each other; the dead still come out of the wastes at night. You
 * build, you research, you field tanks and gunships and fleets, you
 * box-select them and send them out to take the ground — and the ground
 * you hold is the ground that feeds you.
 *
 * This is a re-skin and re-purpose of the proven survival scenario. The
 * engine, the little illustrated units, the walls, the towers, the market
 * and the field all do the same work; what changes is the frame: an RTS
 * is a war for territory, not a fight for a single village. The village
 * scenario's whole contract is inherited, so the page, the UI, the
 * harness and the save format all keep working.
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const SAVE_KEY = "zs.desert.v1";

  class ScenarioDesert extends ZS.ScenarioVillage {
    constructor() {
      super();
      this._own = new Set(); // buildings the player claims (held by reference)
      this._ord = null; // the current RTS order: { mode, x, y } (select box / move / attack)
      this._drag = null; // the box being dragged, in screen space
      this._ters = []; // the captured territory: rings of claimed ground
      this.name = "desert";
    }

    /* ---------------- the map: a wide waste with a coast ---------------- */

    // One large continent. A river runs north-south on the west; a big
    // coastal sea takes the south-east, so a navy has somewhere to sail.
    // The player holds a walled outpost on the near coast; rival nations
    // hold outposts out in the waste, and the dead rise when the sun drops.
    terrain(world, nav) {
      this.world = world;
      this.nav = nav;
      const W = world.w,
        H = world.h;

      // water: a western river and a southern sea (big enough to sail)
      world.water({
        riverBaseX: 170,
        lake: { x: W * 0.74, y: H * 0.72, r: Math.min(W, H) * 0.34 },
      });
      nav.markWater();
      world.forest = { x: W * 0.5, y: 320, r: 420 };
      world.placeAllTrees({
        grovePos: [
          { x: W * 0.2, y: H * 0.82 },
          { x: W * 0.86, y: H * 0.24 },
          { x: W * 0.62, y: H * 0.4 },
        ],
      });
      for (const tr of world.trees) tr.amt = 24;
      world.buildings = [];

      const rng = ZS.rng32(world.seed ^ 0x5011);
      // the player's outpost: a walled ring on the west bank
      this.center = { x: W * 0.26, y: H * 0.42 };
      const cx = this.center.x,
        cy = this.center.y;

      const hall = ZS.Structs.make("hall", cx, cy, rng() * 997);
      world.buildings.push(hall);
      nav.markRect(hall.x, hall.y, hall.w, hall.h, 0);
      this.hall = hall;

      const ring = [
        ["hut", -230, -70],
        ["hut", 205, 40],
        ["hut", -120, 150],
        ["refinery", 250, -150],
        ["well", -80, -175],
        ["beacon", 120, 165],
        ["wall", -320, -250],
        ["wall", -160, -290],
        ["wall", 20, -300],
        ["wall", 230, -280],
        ["wall", -340, -80],
        ["wall", -330, 90],
        ["wall", 250, -100],
      ];
      for (const [kind, dx, dy] of ring) {
        const s = ZS.Structs.make(kind, cx + dx, cy + dy, rng() * 997);
        if (!ZS.Structs.footprintClear(world, nav, s.x, s.y, s.w, s.h)) continue;
        world.buildings.push(s);
        nav.markRect(s.x, s.y, s.w, s.h, 0);
      }
      // a couple of garrison defences already standing
      for (const [kind, dx, dy] of [
        ["gunTurret", -150, -90],
        ["gunTurret", 160, -60],
        ["flak", 0, -190],
      ]) {
        const s = ZS.Structs.make(kind, cx + dx, cy + dy, rng() * 997);
        if (!ZS.Structs.footprintClear(world, nav, s.x, s.y, s.w, s.h)) continue;
        world.buildings.push(s);
        nav.markRect(s.x, s.y, s.w, s.h, 0);
      }

      // rival outposts and neutral ground, scattered across the waste
      this._spawnOutposts(world, nav, rng);

      if (this.loaded) this._applySavedMap(world, nav);

      // resource nodes spread wide, so expansion means going and getting it
      this._scatterNodes(world, nav, rng);
      nav.version++;
      this.trees0 = world.trees.length;

      // claim the whole walled outpost the player starts in (the ring laid
      // before the outposts) — not the rival ground out in the waste
      for (const b of world.buildings) if (!b.enemy) this._own.add(b);
    }

    // a handful of rival nation outposts, at home sites out in the waste
    _spawnOutposts(world, nav, rng) {
      const sites = [];
      const n = 4;
      for (let i = 0; i < n * 40 && sites.length < n; i++) {
        const x = (0.12 + rng() * 0.74) * world.w;
        const y = (0.14 + rng() * 0.7) * world.h;
        // keep clear of the player and of the water
        if (Math.hypot(x - this.center.x, y - this.center.y) < 520) continue;
        let ok = true;
        for (let px = x - 120; px <= x + 120 && ok; px += 60)
          for (let py = y - 120; py <= y + 120; py += 60)
            if (nav.cellAt(px, py) !== 1) {
              ok = false;
              break;
            }
        if (!ok) continue;
        sites.push({ x, y, id: "nat-" + (sites.length + 1) });
      }
      this.outposts = sites;
      for (let i = 0; i < sites.length; i++) {
        const s = sites[i];
        const ox = s.x,
          oy = s.y;
        const hall = ZS.Structs.make("hall", ox, oy, rng() * 997);
        hall.owner = "nat-" + (i + 1);
        hall.enemy = true;
        world.buildings.push(hall);
        nav.markRect(hall.x, hall.y, hall.w, hall.h, 0);
        for (const [kind, dx, dy] of [
          ["barracks", -150, -60],
          ["wall", -200, -160],
          ["wall", 200, -150],
          ["wall", -180, 120],
          ["wall", 180, 130],
          ["gunTurret", 140, -60],
        ]) {
          const b = ZS.Structs.make(kind, ox + dx, oy + dy, rng() * 997);
          b.owner = "nat-" + (i + 1);
          b.enemy = true;
          if (!ZS.Structs.footprintClear(world, nav, b.x, b.y, b.w, b.h)) continue;
          world.buildings.push(b);
          nav.markRect(b.x, b.y, b.w, b.h, 0);
        }
      }
    }

    _scatterNodes(world, nav, rng) {
      const W = world.w,
        H = world.h;
      const cx = this.center.x,
        cy = this.center.y;
      const placed = (kind, n, r0, r1, amt) => {
        let k = 0;
        for (let i = 0; i < n * 40 && k < n; i++) {
          const ang = rng() * Math.PI * 2;
          const r = r0 + rng() * (r1 - r0);
          const x = cx + Math.cos(ang) * r;
          const y = cy + Math.sin(ang) * r;
          if (x < 80 || y < 80 || x > W - 80 || y > H - 80) continue;
          if (nav.cellAt(x, y) !== 1) continue;
          if (nav.cellAt(x + 14, y) !== 1 || nav.cellAt(x - 14, y) !== 1) continue;
          let clash = false;
          for (const b of world.buildings)
            if (
              Math.abs(b.x + b.w / 2 - x) < b.w / 2 + 30 &&
              Math.abs(b.y + b.h / 2 - y) < b.h / 2 + 30
            )
              clash = true;
          for (const o of this.nodes) if (Math.hypot(o.x - x, o.y - y) < 70) clash = true;
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
          k++;
        }
      };
      placed("rock", 16, 300, 2200, 30);
      placed("rock", 8, 160, 900, 30);
      placed("bush", 20, 150, 2000, 12);
      placed("wreck", 10, 250, 2400, 18);
    }

    /* ---------------- the water: who can sail it ---------------- */

    // only ships take to the water (a ship is any unit with a `water`
    // def), so a tank stays on the land even though the engine can swim
    swimmer(a) {
      if (!a || a.st !== 4) return false;
      return !!ZS.Units.def(a.unit).water;
    }

    // the army picks a muster spot for a new unit; a ship steps into the
    // nearest open water
    _spawnPointFleet() {
      if (!this.nav || !this.world) return null;
      for (let i = 0; i < 900; i++) {
        const x = this.world.w * (0.5 + Math.random() * 0.45);
        const y = this.world.h * (0.62 + Math.random() * 0.32);
        if (this.nav.isWater(x, y)) return { x, y };
      }
      return null;
    }

    /* ---------------- factions: whole nations at war ---------------- */

    // the Desert Order fields the fleets too
    roster() {
      return ["gunboat", "destroyer"];
    }

    // two units under arms are hostile when their nations are at war, or
    // one belongs to the player and the other is any foe. The village never
    // defined this — so it is a no-op there.
    hostileBetween(a, o, scen) {
      if (a.foe !== o.foe) return true; // player vs enemy, either way
      if (!a.foe) return false; // player vs player: never
      // two enemy factions: only if their nations are at war
      if (a.nat === o.nat) return false; // the same army
      return !!(ZS.Nations && scen && ZS.Nations.atWar(scen, a.nat, o.nat));
    }

    /* ---------------- direct RTS control ---------------- */

    // left-drag = box select; left-click one of ours = select; left-click
    // ground with a selection = move; left-click an enemy with a selection
    // = attack-move. Building placement keeps the village semantics.
    pointerDown(px, py, _wx, _wy, btn, world) {
      const w = this.nav ? this.nav.world : world;
      if (!w) return false;
      const p = scenePoint(this, px, py);
      if (btn === 2) {
        // right-drag reserves; a right-click orders the selection
        this._issueOrders(p.x, p.y);
        return true;
      }
      // left: begin a selection box (or arm a build cursor)
      if (this.armed) return super.pointerDown && super.pointerDown(px, py, p.x, p.y, btn, world);
      this._sel0 = { px, py, x: p.x, y: p.y };
      this._drag = { x0: px, y0: py, x1: px, y1: py };
      return true;
    }

    pointerMove(px, py, _wx, _wy, world) {
      if (this._drag) {
        this._drag.x1 = px;
        this._drag.y1 = py;
      }
      if (super.pointerMove) super.pointerMove(px, py, _wx, _wy, world);
    }

    pointerUp(px, py, _wx, _wy, world) {
      const drag = this._drag;
      this._drag = null;
      const p = scenePoint(this, px, py);
      if (drag && Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) > 8) {
        this._boxSelect(drag);
        return true;
      }
      // a click, not a drag
      if (this.armed) return super.pointerUp && super.pointerUp(px, py, p.x, p.y, _wy, world);
      this._click(p.x, p.y, world);
      return true;
    }

    _boxSelect(drag) {
      const cam = ZS.debug && ZS.debug.cam;
      const x0 = Math.min(drag.x0, drag.x1),
        y0 = Math.min(drag.y0, drag.y1),
        x1 = Math.max(drag.x0, drag.x1),
        y1 = Math.max(drag.y0, drag.y1);
      const want = [];
      const take = [];
      const lo = { px: x0, py: y0, x: x0, y: y0 };
      const hi = { px: x1, py: y1, x: x1, y: y1 };
      if (cam) {
        const a = cam.toWorld(x0, y0),
          b = cam.toWorld(x1, y1);
        lo.x = Math.min(a.x, b.x);
        lo.y = Math.min(a.y, b.y);
        hi.x = Math.max(a.x, b.x);
        hi.y = Math.max(a.y, b.y);
      }
      for (const a of this.agents || []) {
        if (a.dead || a.gone || a.st !== 4 || a.foe) continue;
        if (a.x >= lo.x && a.x <= hi.x && a.y >= lo.y && a.y <= hi.y) take.push(a);
      }
      for (const a of this.agents || []) a.sel = false;
      for (const a of take) a.sel = true;
      if (take.length) {
        this.sel = { k: "u", o: take[0], all: take };
      } else {
        this.sel = null;
        // fall through to plain click-selection of a building / villager
        for (const b of this.world.buildings) {
          if (b && b.x <= lo.x && b.x + b.w >= lo.x && b.y <= lo.y && b.y + b.h >= lo.y) {
            this.sel = { k: "s", o: b };
            this.mode = "build";
            break;
          }
        }
      }
    }

    _click(x, y, world) {
      // something of ours under the cursor?
      let hit = null;
      for (const a of this.agents || []) {
        if (a.dead || a.st !== 4 || a.foe) continue;
        if (Math.hypot(a.x - x, a.y - y) < 26) hit = a;
      }
      if (hit) {
        this._deselect();
        hit.sel = true;
        this.sel = { k: "u", o: hit, all: [hit] };
        return;
      }
      if (this.sel && this.sel.k === "u" && this.sel.all) {
        // an enemy structure under the cursor: attack it, not just the point
        const b = this._structAt(x, y);
        if (b && b.enemy) {
          this._attackStruct(b);
          return;
        }
        this._moveSelected(x, y);
      }
    }

    _structAt(x, y) {
      for (const b of this.world.buildings) {
        const pad = b.kind === "wall" ? 10 : 4;
        if (x < b.x - pad || x > b.x + b.w + pad || y < b.y - pad || y > b.y + b.h + pad) continue;
        return b;
      }
      return null;
    }

    _attackStruct(b) {
      if (!this.sel || !this.sel.all) return;
      this._atkTarget = b;
      for (const a of this.sel.all) {
        a.goal = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        a.targStruct = b;
        a.path = null;
        a.wantMove = true;
      }
      if (ZS.sound) ZS.sound.event("order", b.x + b.w / 2, b.y + b.h / 2);
    }

    _deselect() {
      for (const a of this.agents || []) a.sel = false;
      this.sel = null;
    }

    // a garrison already under arms on the first day: enough to box-select
    // and send out, enough to hold the yard until the factory comes up.
    // Only on a fresh run — a loaded game restores its own field.
    init(agents) {
      const fresh = this.loaded === null;
      super.init(agents);
      if (!fresh || this.__startUnits) return;
      this.__startUnits = true;
      const cx = this.hall.x + this.hall.w / 2,
        cy = this.hall.y + this.hall.h / 2;
      const starter = ["militia", "archer", "gunner", "machinegun"];
      const seeded = [];
      for (let i = 0; i < starter.length; i++) {
        const a = ZS.Army.spawn(this, starter[i], false);
        if (!a) continue;
        a.goal = { x: cx - 120 + i * 70, y: cy + 120 + (i % 2) * 30 };
        a.path = null;
        seeded.push(a);
      }
      if (seeded.length) this.sel = { k: "u", o: seeded[0], all: seeded };

      // each rival outpost keeps a small garrison on its own ground, so a
      // conqueror is met by soldiers, not just by walls
      const rng = ZS.rng32((this.world.seed ^ 0xbeef) + this.day);
      for (let i = 0; i < (this.outposts || []).length; i++) {
        const site = this.outposts[i];
        const garrison = ["militia", "archer", "gunner"].slice(0, 1 + (i % 3));
        for (const id of garrison) {
          // spawn on the outpost's own ground, then hold the yard
          const at = this.nav.nearestWalkable(
            site.x + (rng() - 0.5) * 120,
            site.y + 30 + rng() * 70,
            160,
            true,
          );
          const a = ZS.Army.spawn(this, id, true, at);
          if (!a) continue;
          a.nat = site.id;
          a.goal = { x: site.x, y: site.y + 40 };
          a.path = null;
          a.hold = true;
        }
      }
    }

    _moveSelected(x, y) {
      const all = this.sel && this.sel.all ? this.sel.all : [];
      const n = all.length || 1;
      for (let i = 0; i < all.length; i++) {
        const a = all[i];
        // individual waypoints, slightly spread, so they don't stack
        a.goal = { x: x + (i - (n - 1) / 2) * 18, y: y + ((i % 3) - 1) * 16 };
        a.targStruct = null;
        a.path = null;
        a.wantMove = true;
        if (ZS.sound) ZS.sound.event("order", a.x, a.y);
      }
    }

    _issueOrders(x, y) {
      if (!this._own || !this.agents) return;
      const ours = this.agents.filter((a) => !a.dead && a.st === 4 && !a.foe);
      if (ours.length) this._moveSelected(x, y);
    }

    tap(_agents, _world, x, y) {
      // a click on the map that the core deems a tap: forward to orders
      if (this.sel && this.sel.k === "u") this._moveSelected(x, y);
      return super.tap ? super.tap(_agents, _world, x, y) : false;
    }

    /* ---------------- the run: territory, nations, the dead ---------------- */

    maintain(agents, dt) {
      super.maintain(agents, dt);
      this._tickTerritory(dt);
      this._defenseFire(dt);
      // the order wins the desert when the last rival stronghold falls
      if (!this._victory && !this.over && (this.outposts || []).length) {
        const halls = this.world.buildings.filter((b) => b.enemy && b.kind === "hall");
        if (!halls.length) {
          this._victory = true;
          this.over = {
            title: "the desert is ours",
            lines: [
              "the last rival stronghold falls.",
              "every flag on the waste flies for the order.",
              "the dead still wander, but the ground is yours.",
            ],
          };
          if (ZS.VillageUI) ZS.VillageUI.toast("the desert is ours");
        }
      }
    }

    // the defensive works fight on their own: a gun turret shells the line,
    // a flak rack reaches for the sky, a rocket rack knocks at the walls.
    // They are buildings, so they charge from their own magazine and can be
    // upgraded (more range and damage per level).
    _defenseFire(dt) {
      const D = this._defenseDefs();
      this._dT = (this._dT || 0) - dt;
      if (this._dT > 0) return;
      this._dT = 0.35;
      for (const b of this.world.buildings) {
        const d = D[b.kind];
        if (!d || !b.built || b.ruined) continue;
        const enemy = !!b.enemy; // does this ground belong to the enemy?
        const rng = d.range + (b.lvl || 1) * d.rngLvl;
        const cx = b.x + b.w / 2,
          cy = b.y + b.h / 2;
        // a flyer needs the flak; ground units need the gun or rockets.
        // Enemy ground shoots the player's forces; the player's shoots the
        // dead and the field of the enemy.
        for (const a of this.agents || []) {
          if (a.dead || a.gone) continue;
          const target = enemy
            ? a.st === 4 && !a.foe
            : a.st === 2 || a.st === 3 || (a.st === 4 && a.foe);
          if (!target) continue;
          const dd = Math.hypot(a.x - cx, a.y - cy);
          if (dd > rng) continue;
          const reach = d.airOnly ? !!ZS.Units.def(a.unit).fly : true;
          if (d.airOnly && !reach) continue;
          if (d.groundOnly && reach) continue;
          b.kick = 0.42;
          this._defenseFireAt(b, a, d, enemy);
          break;
        }
      }
    }

    _defenseFireAt(b, a, d, enemy) {
      const cx = b.x + b.w / 2,
        cy = b.y + b.h / 2;
      if (ZS.Fx) {
        if (d.kind === "shell") ZS.Fx.shell(this, cx, cy - 8, a.x, a.y, d.big, b.seed | 0);
        else if (d.kind === "bomb") ZS.Fx.bomb(this, cx, cy - 8, a.x, a.y, b.seed | 0);
        else ZS.Fx.arrow(this, cx, cy - 8, a.x, a.y, b.seed | 0);
      }
      const dmg = d.dmg + (b.lvl || 1) * d.dmgLvl;
      if (a.st === 2) {
        this._hitZombie(enemy ? {} : { x: cx, y: cy }, a, dmg); // dead: the tally keeps the score
      } else if (a.st === 3) {
        a.hp -= dmg;
        a.flash = 0.3;
        if (a.hp <= 0) this._killRaider(enemy ? {} : { x: cx, y: cy }, a);
      } else if (a.st === 4) {
        a.hp -= dmg;
        a.flash = 0.3;
        this._pop(a.x, a.y - 28, "-" + Math.round(dmg), "#a04030");
        if (a.hp <= 0 && !a.dead) {
          a.dead = true;
          if (!enemy && this.army)
            this.army.kills++; // our ground: one for the tally
          else if (enemy) this.army.lost++; // enemy ground cost us one
        }
      }
    }

    _defenseDefs() {
      return {
        gunTurret: {
          kind: "shell",
          dmg: 34,
          dmgLvl: 14,
          range: 230,
          rngLvl: 22,
          big: 1,
          col: "rgba(104,110,96,0.9)",
        },
        flak: {
          kind: "arrow",
          dmg: 22,
          dmgLvl: 10,
          range: 300,
          rngLvl: 26,
          airOnly: true,
          col: "rgba(122,128,132,0.9)",
        },
        rocket: {
          kind: "bomb",
          dmg: 56,
          dmgLvl: 22,
          range: 260,
          rngLvl: 24,
          big: 1,
          col: "rgba(150,116,74,0.9)",
        },
      };
    }

    // ground captured by standing buildings; a slow trickle of supplies from
    // what you hold, and a defensive ring the dead cannot cross.
    _tickTerritory(dt) {
      if (!this.world) return;
      this._tT = (this._tT || 0) + dt;
      if (this._tT < 0.9) return;
      this._tT = 0;
      let sum = 0;
      const rings = [];
      for (const b of this.world.buildings) {
        if (!b || b.kind === "wall") continue;
        if (!this._own.has(b)) continue;
        const c = { x: b.x + b.w / 2, y: b.y + b.h / 2, r: 90 + (b.lvl || 1) * 22 };
        rings.push(c);
        sum += 1 + (b.lvl || 1);
      }
      this._ters = rings;
      if (sum) this.res.scrap = Math.min(this.storeCap("scrap"), this.res.scrap + sum * 0.28 * dt);
      // giving strongholds a place to build: a nominal build allowance
      this._buildAllow = sum;
    }

    // a building the player raises is ground the player holds; a capture
    // post takes the ground around it, and a razed enemy hall unlocks its
    // yard to a fresh claim.
    onBuilt(b) {
      super.onBuilt(b);
      if (this._own) this._own.add(b);
      if (b.kind === "capture") this._claimAround(b, 220);
    }

    // territory the player holds is fed by the ground they own. A capture
    // post claims a ring of open ground; an enemy hall, once razed, hands
    // its yard over to whoever beats the ground.
    _claimAround(b, r) {
      const cx = b.x + b.w / 2,
        cy = b.y + b.h / 2;
      for (const o of this.world.buildings) {
        if (o === b || this._own.has(o)) continue;
        if (o.enemy) continue; // only neutral ground is claimed freely
        const d = Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy);
        if (d <= r) this._own.add(o);
      }
    }

    _damageStruct(b, amt) {
      // an enemy hall that is about to fall hands its yard over first
      if (b.enemy && b.kind === "hall" && !b._razed && b.hp - amt <= 0) {
        b._razed = true;
        const cx = b.x + b.w / 2,
          cy = b.y + b.h / 2;
        for (const o of this.world.buildings) {
          if (o === b || !o.enemy || o.dead) continue;
          if (Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy) > 240) continue;
          o.enemy = false;
          this._own.add(o);
        }
        if (this.nat) this.nat.news.unshift("an enemy stronghold falls — the ground is ours");
      }
      super._damageStruct(b, amt);
      // a unit told to take a specific structure looks for something else
      if (this.agents) for (const a of this.agents) if (a.targStruct === b) a.targStruct = null;
    }

    // the village's first-of-a-kind and counts are for the player's own
    // works; in an RTS there is enemy ground, so both must skip it (or the
    // player's new troops would muster at an enemy barracks)
    _first(kind) {
      for (const b of this.world.buildings)
        if (b.kind === kind && b.built && !b.ruined && !b.enemy && this._own.has(b)) return b;
      return null;
    }

    count(kind) {
      let n = 0;
      for (const b of this.world.buildings)
        if (b.kind === kind && b.built && !b.ruined && !b.enemy && this._own.has(b)) n++;
      return n;
    }

    // units fight structures too, not just the living. A soldier in range of
    // a hostile building opens fire on it (and an armour piece or a bomber
    // pulls the wall down), which is what makes an RTS about ground.
    // Units never trade a living target for a wall: agents come first,
    // then structures, then the plain agent/army update.
    update(a, dt, t, grid, nav) {
      if (a.st === 4) {
        const d = ZS.Units.def(a.unit);
        const sight = (ZS.Army.BAL && ZS.Army.BAL.SIGHT) || 340;
        if (!this._agentTarget(a, sight)) {
          const tgt = this._hostileStruct(a, d.rng || 26);
          if (tgt && this._fireStruct(a, tgt, d, dt, t)) return;
        }
      }
      super.update(a, dt, t, grid, nav);
    }

    // the nearest living foe in range, using the field's own "who fights
    // whom" so the priority matches the rest of the army
    _agentTarget(a, rng) {
      let best = null,
        bd = rng * rng;
      for (const o of this.agents || []) {
        if (o === a || o.dead || o.gone) continue;
        if (o.st === 4) {
          if (!ZS.Army.opposed(a, o)) continue;
        } else if (
          (a.foe && o.st === 0) || // an invader will cut a civilian
          (!a.foe && (o.st === 2 || o.st === 3 || (o.st === 4 && o.foe)))
        ) {
          // ours fight the dead and raiders
        } else {
          continue;
        }
        const d = Math.hypot(o.x - a.x, o.y - a.y);
        if (d > rng) continue;
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      return best;
    }

    _hostileStruct(a, rng) {
      // an explicit attack order on a structure wins
      if (a.targStruct && !a.targStruct.dead && !a.targStruct.ruined) {
        const tb = a.targStruct;
        const hostile = a.foe ? this._own.has(tb) : tb.enemy;
        if (hostile) return tb;
      }
      let best = null,
        bd = rng * rng;
      for (const b of this.world.buildings) {
        if (b.dead || b.ruined) continue;
        if (b.kind === "wall" && !a.siege) continue; // soft targets only
        const hostile = a.foe ? this._own.has(b) : b.enemy;
        if (!hostile) continue;
        const dx = Math.max(b.x - a.x, 0, a.x - (b.x + b.w));
        const dy = Math.max(b.y - a.y, 0, a.y - (b.y + b.h));
        const dd = Math.hypot(dx, dy);
        if (dd > rng) continue;
        if (dd < bd) {
          bd = dd;
          best = b;
        }
      }
      return best;
    }

    _fireStruct(a, b, d, dt, t) {
      const cx = b.x + b.w / 2,
        cy = b.y + b.h / 2;
      a.a = Math.atan2(cy - a.y, cx - a.x);
      const rng = d.rng || 26;
      // stay at the edge of the weapon's reach, not on top of the wall
      const dd = Math.hypot(cx - a.x, cy - a.y);
      if (dd > rng * 0.9) {
        a.wantMove = true;
        ZS.planAndFollow(
          a,
          { x: cx, y: cy },
          false,
          d.spd * (a.sup > 0 ? 0.9 : 0.7),
          dt,
          t,
          this.nav,
        );
        return true;
      }
      a.vx *= 0.86;
      a.vy *= 0.86;
      if (a.atkT > 0) return true;
      a.atkT = d.rate;
      a.kick = 0.35;
      a.muzzle = 0.12;
      // the wall only falls to shell or bomb; a rifle scuffs it
      const dmg = d.siege ? d.dmg * d.siege : d.dmg * 0.25;
      if (d.shot && d.shot !== "arrow" && ZS.Fx) {
        if (d.shot === "bomb") ZS.Fx.bomb(this, a.x, a.y - (d.fly ? 44 : 14), cx, cy, a.seed | 0);
        else ZS.Fx.shell(this, a.x, a.y - 14, cx, cy, d.splash > 30 ? 1 : 0, a.seed | 0);
      }
      this._damageStruct(b, dmg);
      if (ZS.sound) ZS.sound.event(d.shot === "bomb" ? "air" : "shot_rifle", a.x, a.y);
      return true;
    }

    camInterest(dt) {
      return super.camInterest(dt);
    }

    // RTS messaging: direct control, not a refuge under siege
    hud() {
      const h = super.hud();
      return Object.assign(h, { hint: this._hint() });
    }

    _hint() {
      if (this.armed)
        return (
          "click the ground to place the " + ZS.Structs.CAT[this.armed].name + " · esc to cancel"
        );
      if (this.sel && this.sel.k === "u")
        return "the line is picked · drag to select, click ground to move, click an enemy to attack";
      if (this.phase === "night") return "the dead are out there · drag to select your garrison";
      const bits = [
        "drag box-select",
        "click move",
        "A the field",
        "B build",
        "T workshop",
        "space pause",
      ];
      return bits.join("  ·  ");
    }

    /* ---------------- drawing ---------------- */

    drawOver(c, world, t, vis) {
      // the boundary of what you hold
      if (this._ters && this._ters.length) {
        c.save();
        c.lineWidth = 1.4;
        for (const r of this._ters) {
          c.strokeStyle = "rgba(84,86,66,0.55)";
          c.setLineDash([6, 6]);
          ZS.wcirc(c, r.x, r.y, r.r, r.r * 0.01 + t * 0.1, 0.35);
          c.stroke();
          c.setLineDash([]);
        }
        c.restore();
      }
      // the selection box
      if (this._drag) {
        const d = this._drag;
        c.save();
        c.strokeStyle = "rgba(92,110,90,0.9)";
        c.lineWidth = 1.2;
        c.strokeRect(
          Math.min(d.x0, d.x1),
          Math.min(d.y0, d.y1),
          Math.abs(d.x1 - d.x0),
          Math.abs(d.y1 - d.y0),
        );
        c.restore();
      }
      if (super.drawOver) super.drawOver(c, world, t, vis);
    }

    serialize() {
      const s = super.serialize();
      // buildings are re-made from the seed on load, so we store the indices
      s.own = [];
      for (let i = 0; i < this.world.buildings.length; i++)
        if (this._own && this._own.has(this.world.buildings[i])) s.own.push(i);
      return s;
    }

    _applySavedMap(world, nav) {
      super._applySavedMap(world, nav);
      // re-claim whatever we held, by the index the save recorded
      const s = this.loaded;
      if (s && s.own)
        for (const i of s.own) if (world.buildings[i]) this._own.add(world.buildings[i]);
    }
  }

  // the point on the ground under a screen coord: the camera knows best
  function scenePoint(s, px, py) {
    const cam = ZS.debug && ZS.debug.cam;
    if (cam && cam.toWorld) {
      const p = cam.toWorld(px, py);
      if (p) return p;
    }
    return { x: px, y: py };
  }

  ZS.ScenarioDesert = ScenarioDesert;
})();
