/* The Hollow — the field.
   Everything that stands between the village and whatever is walking out
   of the wood: the thirteen things in js/village/units.js, the order they
   are trained in, the line they form, the shots they fire, the bread they
   eat, and the carts that keep them fed when they are a long way from
   home.

   A soldier is an agent like anybody else (st === 4), so the core moves
   it, separates it, y-sorts it and lifts it from the field when it falls.
   What it *is* lives in `a.unit`; who it shoots at is decided here.

   The state lives on `scen.army`. Nothing here allocates per frame beyond
   a shot record, and the expensive sweeps (slots, supply) run on a timer. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const BAL = {
    SIGHT: 340, // how far a unit looks for somebody to fight
    SLOT_R: 24, // how close to its place in the ranks it must stand
    STAND: 0.5, // a shooter keeps between this and 0.95 of its range
    SUPPLY_R: 430, // how far from the stores an army can fight unpaid
    CART_R: 220, // the bubble of supply one cart carries with it
    HUNGER: 0.5, // hp/s an army out of bread loses
    SLOT_T: 0.7, // how often the ranks are re-numbered
    SUP_T: 0.5, // how often supply is counted
    SHOT_T: 0.5, // how long a shell is in the air
    BOMB_T: 0.7, // ...and a bomb
    DESERT: 0.22, // below this fraction of its health a starving unit walks home
  };

  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

  // a stand-in "one of ours", for the side tests that have no shooter
  const OURS = { foe: 0 };

  /* ---------- who is on which side ---------- */

  // a foe shoots at the living and at our people under arms; ours shoot at
  // the dead, at raiders, and at theirs. Nothing shoots at a flyer that it
  // cannot reach — the dead cannot reach them at all.
  function opposed(a, o) {
    if (!o || o.dead || o.gone || o === a) return false;
    if (a.foe) return o.st === 0 || (o.st === 4 && !o.foe);
    return o.st === 2 || o.st === 3 || (o.st === 4 && o.foe);
  }

  function reachable(shooter, o) {
    if (!o) return true;
    if (o.st === 4) {
      const d = ZS.Units.def(o.unit);
      if (d.fly) return !!ZS.Units.def(shooter.unit).fly;
    }
    return true;
  }

  /* ---------- hurting people ---------- */

  function hurt(scen, o, dmg, by) {
    if (!o || o.dead || o.gone) return;
    if (o.st === 2 || o.st === 3) {
      // the dead and the raiders: the village's own tally keeps the score,
      // and the field keeps its own count of what it puts down
      const was = o.dead;
      scen._hitZombie(by, o, dmg);
      if (!was && o.dead && by && by.st === 4 && !by.foe) scen.army.kills++;
      return;
    }
    if (o.st === 4) {
      const d = ZS.Units.def(o.unit);
      o.hp -= dmg * (1 - (d.armour || 0));
      o.flash = 0.3;
      o.panic = Math.max(o.panic || 0, 1.2);
      scen.fx.push({ x: o.x, y: o.y - 10, t: 0.25, blood: 2, seed: o.seed });
      if (scen.stains) scen.stains.splat(o.x, o.y + 2, "blood", o.seed + Math.random() * 99);
      if (ZS.sound) ZS.sound.event("v_gasp", o.x, o.y);
      scen._pop(o.x, o.y - 28, "-" + Math.round(dmg), "#a04030");
      if (o.hp <= 0) kill(scen, o, by);
      return;
    }
    if (o.st === 0) {
      o.hp -= dmg;
      o.flash = 0.3;
      o.panic = Math.max(o.panic || 0, 2.6);
      scen.fx.push({ x: o.x, y: o.y - 8, t: 0.3, blood: 2, seed: o.seed });
      if (scen.stains) scen.stains.splat(o.x, o.y + 2, "blood", o.seed + Math.random() * 99);
      if (ZS.sound) ZS.sound.event("v_gasp", o.x, o.y);
      if (o.hp <= 0) scen.killVillager(o, "cut down in the field");
    }
  }

  function kill(scen, o, _by) {
    if (o.dead) return;
    o.dead = true;
    const A = scen.army;
    const d = ZS.Units.def(o.unit);
    if (scen.stains) scen.stains.corpse(o);
    if (ZS.sound) ZS.sound.event("v_shout", o.x, o.y);
    if (scen.sel && scen.sel.o === o) scen.sel = null;
    if (o.foe) {
      A.kills++;
      const sc = Math.max(1, Math.round((d.crew || 1) * 2));
      const got = scen._add("scrap", sc);
      if (got) scen._pop(o.x, o.y - 22, "+" + got + " scrap", "#6f7681");
    } else {
      A.lost++;
      scen.grief = Math.min(1, (scen.grief || 0) + 0.05);
      scen._pop(o.x, o.y - 30, d.name + " down", "#a04030");
      if (ZS.Chronicle) ZS.Chronicle.add(scen, d.name + " lost", "death");
      if (ZS.VillageUI) ZS.VillageUI.toast(d.name + " is down");
    }
  }

  /* ---------- the line ---------- */

  // a rank of six, shoulder to shoulder, behind the first
  function slotAt(goal, i) {
    const per = 6;
    const col = i % per,
      row = (i / per) | 0;
    return { x: goal.x + (col - (per - 1) / 2) * 30, y: goal.y + row * 28 };
  }

  function homePoint(scen) {
    const b = scen._first ? scen._first("store") || scen._first("granary") : null;
    const h = b || scen.hall;
    return { x: h.x + h.w / 2, y: h.y + h.h / 2 };
  }

  // where the army forms when nobody has told it otherwise: the green in
  // front of the barracks, or the hall's yard
  function post(scen) {
    const A = scen.army;
    if (A.rally) return A.rally;
    const b = scen._first("barracks");
    if (b) return { x: b.x + b.w / 2, y: b.y + b.h + 54 };
    const h = scen.hall;
    return { x: h.x + h.w / 2, y: h.y + h.h + 70 };
  }

  function speedMul(scen, a) {
    let m = 0.9 + 0.2 * (scen.morale === undefined ? 0.7 : scen.morale);
    if (a.hp < a.maxHp * 0.35) m *= 0.78;
    if (a.sup !== undefined && a.sup <= 0) m *= 0.8;
    return m;
  }

  function find(scen, a, r, grid) {
    let best = null,
      bd = r * r;
    const f = (o) => {
      if (o === a || !opposed(a, o)) return;
      if (!reachable(a, o)) return;
      const d = dist2(a.x, a.y, o.x, o.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    };
    if (grid) grid.query(a.x, a.y, r, f);
    else for (const o of scen.agents) f(o);
    return best;
  }

  /* ---------- one soldier, one frame ---------- */

  // theirs (and the carts) have somewhere to be; ours stand in a rank
  function goalFor(scen, a) {
    if (a.goal) return a.goal;
    if (a.foe) return homePoint(scen);
    return slotAt(post(scen), a.slot || 0);
  }

  function hold(scen, a, d, dt, t, nav) {
    const p = goalFor(scen, a);
    const sp = d.spd * speedMul(scen, a);
    if (dist2(a.x, a.y, p.x, p.y) > BAL.SLOT_R * BAL.SLOT_R) {
      a.wantMove = true;
      ZS.planAndFollow(a, p, false, sp, dt, t, nav);
    } else {
      a.vx *= 0.84;
      a.vy *= 0.84;
      // face the open ground: away from the hall, at whatever is out there
      const h = homePoint(scen);
      const an = Math.atan2(a.y - h.y, a.x - h.x);
      a.a += (an - a.a) * Math.min(1, dt * 2);
      a.turn = 0;
    }
    trail(scen, a, d, dt);
  }

  function trail(scen, a, d, dt) {
    if (!ZS.Fx || !d) return;
    a.dustT = (a.dustT || 0) - dt;
    if (a.dustT > 0) return;
    const moving = Math.hypot(a.vx, a.vy) > 12;
    if (d.fly) {
      a.dustT = 0.5;
      ZS.Fx.wash(scen, a.x, a.y + 6, (a.seed + scen.t) | 0);
      return;
    }
    if (!moving) {
      a.dustT = 0.3;
      return;
    }
    a.dustT = d.mounted ? 0.28 : 0.42;
    ZS.Fx.dust(scen, a.x, a.y + 4, (a.seed + scen.t * 7) | 0);
  }

  function engage(scen, a, o, d, dt, t, nav) {
    const dd = Math.hypot(o.x - a.x, o.y - a.y);
    const an = Math.atan2(o.y - a.y, o.x - a.x);
    // the fighter banks into its turn, and it never stops moving
    if (d.fly) {
      const diff = ((an - a.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      a.turn = ZS.clamp(a.turn * 0.9 + diff, -1, 1);
    }
    a.a = an;
    const sp = d.spd * speedMul(scen, a);
    const rng = d.rng || 26;
    if (d.rng > 40) {
      if (dd > rng * 0.92) {
        a.wantMove = true;
        ZS.planAndFollow(a, { x: o.x, y: o.y }, false, sp, dt, t, nav);
      } else if (dd < rng * BAL.STAND) {
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
    } else if (dd > rng * 0.78) {
      a.wantMove = true;
      ZS.planAndFollow(a, { x: o.x, y: o.y }, false, sp, dt, t, nav);
    } else {
      a.vx *= 0.84;
      a.vy *= 0.84;
    }
    // a flyer keeps its distance by flying, not by backing up
    if (d.fly) {
      a.wantMove = true;
      ZS.planAndFollow(a, { x: o.x, y: o.y }, false, sp, dt, t, nav);
    }
    trail(scen, a, d, dt);
    if (a.atkT > 0) return;
    if (dd > rng + 8) return;
    // an arrow needs the sky; a bullet needs the line
    if (d.rng > 40 && !nav.los(a.x, a.y, o.x, o.y, false) && !d.splash) return;
    a.atkT = d.rate;
    a.kick = 0.35;
    a.muzzle = 0.12;
    if (rng <= 40) {
      a.swing = 0.4;
      let mul = 1;
      const od = o.st === 4 ? ZS.Units.def(o.unit) : null;
      if (d.bonus && d.bonus.mounted && od && od.mounted) mul *= d.bonus.mounted;
      hurt(scen, o, d.dmg * mul, a);
      if (ZS.sound) ZS.sound.event("v_gasp", o.x, o.y);
      return;
    }
    shoot(scen, a, o, d);
  }

  function shoot(scen, a, o, d) {
    const A = scen.army;
    const y0 = a.y - (d.fly ? 44 : 14);
    const seed = (a.seed + scen.t * 11) | 0;
    const dmg = d.dmg;
    if (d.shot === "arrow") {
      ZS.Fx.arrow(scen, a.x, y0, o.x, o.y - 8, seed);
      hurt(scen, o, dmg, a);
      if (ZS.sound) ZS.sound.event("shot_rifle", a.x, a.y);
      return;
    }
    if (d.shot === "ball") {
      scen.fx.push({ x0: a.x, y0: y0, x1: o.x, y1: o.y - 8, t: 0.09, tracer: 1, seed: a.seed });
      ZS.Fx.smoke(scen, a.x + Math.cos(a.a) * 14, y0, 6, seed);
      hurt(scen, o, dmg, a);
      if (ZS.sound) ZS.sound.event("shot_rifle", a.x, a.y);
      return;
    }
    if (d.shot === "burst") {
      ZS.Fx.spark(scen, o.x, o.y - 10, seed, 4);
      hurt(scen, o, dmg, a);
      if (ZS.sound) ZS.sound.event("shot_smg", a.x, a.y);
      return;
    }
    // a shell or a bomb: it takes its time, and it lands where it lands
    const big = d.shot === "bomb" ? 1 : 0;
    const flight = big ? BAL.BOMB_T : BAL.SHOT_T;
    if (d.shot === "bomb") ZS.Fx.bomb(scen, a.x, y0 - 20, o.x, o.y, seed);
    else ZS.Fx.shell(scen, a.x, y0, o.x, o.y, 1, seed);
    if (ZS.sound) ZS.sound.event("boom", a.x, a.y);
    A.shots.push({
      t: flight,
      x: o.x,
      y: o.y,
      dmg: dmg,
      splash: d.splash || 30,
      siege: d.siege || 0,
      foe: a.foe ? 1 : 0,
      from: a,
      seed: seed,
    });
  }

  /* ---------- the module ---------- */

  const Army = {
    BAL,

    create() {
      return {
        queue: [], // what is being trained: [{ id, p }]
        shots: [], // what is in the air
        rally: null, // where the line forms
        kills: 0,
        lost: 0,
        trained: 0,
        hungry: 0, // how many are out of bread right now
        slotT: 0,
        supT: 0,
        unit: 0, // how many are under arms right now (kept by tick)
      };
    },

    /* ---------- training ---------- */

    // what one second of work puts into the training queue
    rate(scen) {
      let r = 0.7;
      if (scen.has("barracks")) r += 0.5;
      if (scen.has("smith")) r += 0.25;
      if (scen.has("foundry")) r += 0.25;
      if (scen.done.tools1) r += 0.15;
      if (scen.done.tools2) r += 0.15;
      return r;
    },

    order(scen, id) {
      const U = ZS.Units;
      const A = scen.army;
      const d = U.def(id);
      if (!ZS.Ages.at(scen, d.age)) {
        const age = ZS.Ages.def(d.age);
        return { ok: false, err: "not until the village is " + age.name };
      }
      if (U.crew(scen) + (d.crew || 1) > U.cap(scen))
        return { ok: false, err: "no room in the army — raise a barracks" };
      const cost = U.cost(scen, id);
      if (!scen.canPay(cost))
        return { ok: false, err: "not enough: " + ZS.VillageUI.costText(cost) };
      scen.pay(cost);
      A.queue.push({ id: id, p: 0 });
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
      return { ok: true };
    },

    cancel(scen, i) {
      const A = scen.army;
      const q = A.queue[i];
      if (!q) return;
      const c = ZS.Units.cost(scen, q.id);
      scen._add("wood", Math.floor((c.w || 0) * 0.5 * (1 - q.p)));
      scen._add("stone", Math.floor((c.s || 0) * 0.5 * (1 - q.p)));
      scen._add("scrap", Math.floor((c.c || 0) * 0.5 * (1 - q.p)));
      if (c.a) scen._add("arms", Math.floor(c.a * 0.5 * (1 - q.p)));
      A.queue.splice(i, 1);
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
    },

    // where a new unit steps onto the field
    muster(scen, foe) {
      if (foe) {
        const p = scen._spawnPoint ? scen._spawnPoint() : null;
        if (p) return p;
      }
      const b = scen._first("barracks");
      const h = b || scen.hall;
      const cx = h.x + h.w / 2,
        cy = h.y + h.h + 40;
      for (let i = 0; i < 12; i++) {
        const an = Math.random() * 6.283;
        const rr = 20 + Math.random() * 70;
        const p = scen.nav.nearestWalkable(
          cx + Math.cos(an) * rr,
          cy + Math.sin(an) * rr,
          90,
          false,
        );
        if (p) return p;
      }
      return { x: cx, y: cy };
    },

    spawn(scen, id, foe, at) {
      const U = ZS.Units;
      const d = U.def(id);
      const p = at || this.muster(scen, foe);
      if (!p) return null;
      const a = scen.makeAgent(p.x, p.y, 4, {
        unit: id,
        foe: foe ? 1 : 0,
        hp: d.hp,
        maxHp: d.hp,
        free: !!d.fly, // a flyer goes over walls, water and the dead
        slot: 0,
        sup: 1,
        kick: 0,
        swing: 0,
        atkT: 0,
        move: 0,
        turn: 0,
        job: "soldier",
        crew: d.crew || 1,
        scale: 1,
      });
      if (foe) a.goal = homePoint(scen);
      scen.agents.push(a);
      if (!foe) {
        scen.army.trained++;
        scen._pop(a.x, a.y - 34, d.name, "#5a7a3a");
        if (ZS.Chronicle) ZS.Chronicle.add(scen, d.name + " joins the field", "build");
      }
      return a;
    },

    // the whole line, or just ours, or just theirs
    units(scen, foe) {
      const out = [];
      if (!scen.agents) return out;
      for (const a of scen.agents) {
        if (a.st !== 4 || a.dead || a.gone) continue;
        if (foe === undefined || !!a.foe === !!foe) out.push(a);
      }
      return out;
    },

    count(scen, id) {
      return ZS.Units.count(scen, id);
    },

    /* ---------- orders ---------- */

    command(scen, x, y) {
      const A = scen.army;
      A.rally = { x: Math.round(x), y: Math.round(y) };
      for (const a of this.units(scen, false)) {
        a.path = null;
        a.gx = null;
      }
      if (ZS.VillageUI) ZS.VillageUI.toast("the line forms there");
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
    },

    dismiss(scen) {
      scen.army.rally = null;
      for (const a of this.units(scen, false)) {
        a.path = null;
        a.gx = null;
      }
      if (ZS.VillageUI) ZS.VillageUI.toast("the army falls back on the village");
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
    },

    /* ---------- the frame ---------- */

    update(scen, a, dt, t, grid, nav) {
      const d = ZS.Units.def(a.unit);
      a.kick = Math.max(0, a.kick - dt * 2.4);
      a.swing = Math.max(0, a.swing - dt * 2.6);
      a.atkT = Math.max(0, a.atkT - dt);
      a.move = Math.hypot(a.vx, a.vy);
      const o = find(scen, a, BAL.SIGHT, grid);
      if (o) engage(scen, a, o, d, dt, t, nav);
      else hold(scen, a, d, dt, t, nav);
    },

    // the slow sweeps: the ranks, the bread, whatever is still in the air
    tick(scen, dt) {
      const A = scen.army;
      if (!A) return;
      /* training: the queue works from the front, one at a time */
      if (A.queue.length) {
        const q = A.queue[0];
        q.p += (dt * this.rate(scen)) / ZS.Units.time(scen, q.id);
        if (q.p >= 1) {
          A.queue.shift();
          this.spawn(scen, q.id, false);
          if (ZS.VillageUI) ZS.VillageUI.refresh(true);
        }
      }
      /* what is in the air */
      for (let i = A.shots.length - 1; i >= 0; i--) {
        const s = A.shots[i];
        s.t -= dt;
        if (s.t > 0) continue;
        A.shots.splice(i, 1);
        this.land(scen, s);
      }
      /* the ranks are numbered, so they stand in a line and not in a heap */
      A.slotT -= dt;
      if (A.slotT <= 0) {
        A.slotT = BAL.SLOT_T;
        const ours = this.units(scen, false);
        for (let i = 0; i < ours.length; i++) ours[i].slot = i;
        A.unit = ours.length;
      }
      /* bread, and how far from the stores an army can fight without it */
      A.supT -= dt;
      if (A.supT <= 0) {
        A.supT = BAL.SUP_T;
        this.supply(scen, BAL.SUP_T);
      }
    },

    land(scen, s) {
      const r = s.splash || 26;
      ZS.Fx.burst(scen, s.x, s.y, r, s.seed);
      ZS.Fx.smoke(scen, s.x, s.y, r * 0.4, s.seed + 7);
      for (const o of scen.agents) {
        if (o.dead || o.gone) continue;
        if (s.foe ? !(o.st === 0 || (o.st === 4 && !o.foe)) : !opposed(OURS, o)) continue;
        const dd = Math.hypot(o.x - s.x, o.y - s.y);
        if (dd > r) continue;
        hurt(scen, o, s.dmg * (1 - (dd / r) * 0.55), s.from);
      }
      // and whatever was standing there
      if (s.siege) {
        for (let i = scen.world.buildings.length - 1; i >= 0; i--) {
          const b = scen.world.buildings[i];
          const dx = Math.max(b.x - s.x, 0, s.x - (b.x + b.w));
          const dy = Math.max(b.y - s.y, 0, s.y - (b.y + b.h));
          const dd = Math.hypot(dx, dy);
          if (dd > r) continue;
          scen._damageStruct(b, s.dmg * s.siege * (1 - (dd / r) * 0.5));
        }
      }
    },

    supply(scen, dt) {
      const A = scen.army;
      const home = homePoint(scen);
      const ours = this.units(scen, false);
      const carts = [];
      for (const a of ours) if (a.unit === "cart") carts.push(a);
      let hungry = 0;
      for (const a of ours) {
        if (a.unit === "cart") continue;
        const far = dist2(a.x, a.y, home.x, home.y) > BAL.SUPPLY_R * BAL.SUPPLY_R;
        let fed = !far;
        if (far) {
          for (const c of carts) {
            if (dist2(a.x, a.y, c.x, c.y) < BAL.CART_R * BAL.CART_R) {
              fed = true;
              break;
            }
          }
        }
        if (fed) {
          a.sup = Math.min(1, a.sup + dt * 0.25);
          continue;
        }
        a.sup = Math.max(0, a.sup - dt * 0.06);
        if (a.sup > 0) continue;
        hungry++;
        a.hp -= BAL.HUNGER * dt;
        if (a.hp <= 0) {
          a.hp = 0;
          kill(scen, a, null);
          if (ZS.VillageUI) ZS.VillageUI.toast("a unit starved out in the field");
        }
      }
      // the carts: they go where the army is, and they come back for more
      if (carts.length) {
        let cx = 0,
          cy = 0,
          n = 0;
        for (const a of ours) {
          if (a.unit === "cart") continue;
          cx += a.x;
          cy += a.y;
          n++;
        }
        for (const c of carts) {
          if (!n) break;
          const g = { x: cx / n, y: cy / n };
          const far = dist2(g.x, g.y, home.x, home.y) > BAL.SUPPLY_R * BAL.SUPPLY_R;
          c.carry = far ? { kind: "food", n: 12 } : null;
          c.goal = far ? g : { x: home.x + (Math.random() - 0.5) * 120, y: home.y + 90 };
        }
      }
      A.hungry = hungry;
      if (hungry) {
        scen.alarm(
          "supply",
          hungry + (hungry === 1 ? " unit is" : " units are") + " out of bread — bring a cart",
        );
      }
    },

    /* ---------- dawn ---------- */

    // the army eats before anybody else does. If there is not enough, it
    // eats into itself, and the weakest walks home.
    dawn(scen) {
      const need = ZS.Units.upkeep(scen);
      if (need <= 0) return;
      const got = Math.min(scen.res.food, need);
      scen.res.food -= got;
      const short = need - got;
      if (short <= 0.01) return;
      for (const a of this.units(scen, false)) {
        a.hp -= short * 2.2;
        if (a.hp > a.maxHp * BAL.DESERT || a.dead) continue;
        // starving and broken: they go home and they stay there
        a.gone = true;
        scen._pop(a.x, a.y - 30, "deserted", "#a04030");
        if (ZS.Chronicle) ZS.Chronicle.add(scen, ZS.Units.def(a.unit).name + " deserted", "note");
      }
      scen.grief = Math.min(1, (scen.grief || 0) + 0.03);
      if (ZS.VillageUI)
        ZS.VillageUI.toast("the army is short of bread — " + Math.round(short) + " short");
    },

    /* ---------- the panel's words ---------- */

    line(scen) {
      const U = ZS.Units;
      const n = U.count(scen);
      if (!n) return "nobody under arms";
      const bits = [];
      for (const id of U.ORDER) {
        const c = U.count(scen, id);
        if (c) bits.push(c + " " + (c === 1 ? U.def(id).name : U.def(id).name + "s"));
      }
      return bits.join(", ");
    },

    save(scen) {
      const A = scen.army;
      return {
        q: A.queue.map((x) => [x.id, Math.round(x.p * 100) / 100]),
        r: A.rally ? [Math.round(A.rally.x), Math.round(A.rally.y)] : null,
        k: A.kills,
        l: A.lost,
        t: A.trained,
        u: this.units(scen, false).map((a) => [
          a.unit,
          Math.round(a.x),
          Math.round(a.y),
          Math.round(a.hp),
        ]),
      };
    },

    load(scen, d) {
      const A = (scen.army = this.create());
      if (!d) return;
      A.queue = (d.q || []).map((x) => ({ id: x[0], p: x[1] || 0 }));
      A.rally = d.r ? { x: d.r[0], y: d.r[1] } : null;
      A.kills = d.k || 0;
      A.lost = d.l || 0;
      A.trained = d.t || 0;
      for (const u of d.u || []) {
        const a = this.spawn(scen, u[0], false, { x: u[1], y: u[2] });
        if (a) a.hp = Math.max(1, Math.min(a.maxHp, u[3]));
      }
    },

    /* ---------- the flag ---------- */

    // the rally: a pennant on a pole, in the village green, in the same ink
    drawFlag(c, scen, t) {
      const A = scen.army;
      if (!A || !A.rally) return;
      const x = A.rally.x,
        y = A.rally.y;
      const s = (scen.world.seed + 411) % 997;
      c.strokeStyle = "rgba(78,68,52,0.9)";
      c.lineWidth = 1.6;
      c.lineCap = "round";
      ZS.wline(c, x, y, x + 1, y - 34, s, 0.3);
      const w = Math.sin(t * 2.2) * 2.4;
      c.strokeStyle = "rgba(90,122,58,0.9)";
      c.lineWidth = 1.4;
      ZS.wpoly(
        c,
        [
          { x: x + 1, y: y - 34 },
          { x: x + 20, y: y - 30 + w },
          { x: x + 1, y: y - 22 },
        ],
        s + 3,
        0.5,
        true,
      );
      c.fillStyle = "rgba(90,122,58,0.3)";
      c.fill();
      c.strokeStyle = "rgba(78,68,52,0.55)";
      c.lineWidth = 1.1;
      ZS.wcirc(c, x, y, 13, s + 9, 1.6);
    },
  };

  ZS.Army = Army;
})();
