/* The Hollow — the steward (autopilot).

   Not a bot that plays instead of you: a steward who keeps the village
   running while you watch, and tells you what he did and why. He sets the
   work at dawn and again whenever the day turns, marks out what the
   village can afford, mends what the night broke, studies what comes
   next, puts people under arms, answers the nations, sends parties out,
   and rings the bell when the dark gets into them.

   He never touches a person you have set by hand: the hand lasts until
   the next dawn, and then he takes them back.

   Everything he decides goes through the same public calls the buttons
   use — setJob, _placeAt, startResearch, recruit, Army.order,
   Nations.send — so there is no second, hidden way of doing things. */
(() => {
  "use strict";
  const ZS = window.ZS;

  const BAL = {
    THINK: 3.2, // seconds between looks round the village
    FEED: 2.6, // days of food to keep in the larder
    MARK_MAX: 3, // sites marked out in a day
    GUARD_EARLY: 0.3, // share of the village on the watch, early on
    GUARD_LATE: 0.42,
    GUARD_THREAT: 0.55, // ...and when there is something in the field
    WOOD_KEEP: 70, // never spend below this: the mending needs it
    MEND_WOOD: 130, // mend a ruin when the pile is above this
    REPAIR_AT: 0.6,
    HEAL_AT: 0.85,
    RECRUIT_FOOD: 110,
    RECRUIT_WOOD: 30,
    TRAIN_FOOD: 190, // people under arms only with this in hand
    RING_FEAR: 0.45, // bell: this much panic abroad in the dark
    PARTY_FOOD: 140,
    FEAST_MORALE: 0.45,
    ENVOY_FOOD: 90, // only send an envoy out of a full larder
  };

  /* ---------- reading the village ---------- */

  // everything a decision needs, gathered once
  function read(scen) {
    const pop = scen.villagers();
    const up = scen._upkeep ? scen._upkeep() : 1;
    const bld = scen.world.buildings;
    let sites = 0,
      hurt = 0,
      ruins = 0,
      plots = 0,
      walls = 0,
      barricades = 0;
    for (const b of bld) {
      if (!b.built) sites++;
      else if (b.ruined) ruins++;
      else if (b.hp < b.maxHp * BAL.REPAIR_AT) hurt++;
      if (b.kind === "farm" && b.built && !b.ruined && b.plot) plots++;
      if (b.kind === "wall") walls++;
      if (b.kind === "barricade") barricades++;
    }
    const cap = scen.storeCap ? scen.storeCap() : 0;
    let patients = 0;
    for (const a of pop) if (a.hp < a.maxHp * BAL.HEAL_AT || a.inf > 0) patients++;
    let infirm = scen._first ? scen._first("infirm") : null;
    if (infirm && (infirm.ruined || !infirm.built)) infirm = null;
    return {
      scen,
      day: scen.day,
      night: scen.phase === "night" || scen.phase === "dusk",
      season: scen.season || {},
      pop: pop.length,
      people: pop,
      adults: pop.filter((a) => !(a.kin && a.kin.child)),
      beds: scen.popCap ? scen.popCap() : 0,
      guards: scen.guards ? scen.guards().length : 0,
      guardCap: scen.guardCap ? scen.guardCap() : 0,
      up,
      food: scen.res.food,
      wood: scen.res.wood,
      stone: scen.res.stone,
      scrap: scen.res.scrap,
      cloth: scen.res.cloth || 0,
      arms: scen.res.arms || 0,
      armsCap: scen.storeCap ? scen.storeCap("arms") : 0,
      storeCap: cap,
      stores: scen.storeTotal ? scen.storeTotal() : 0,
      sites,
      hurt,
      ruins,
      plots,
      walls,
      barricades,
      patients,
      infirm,
      hasInfirm: !!infirm,
      canForge: !!(
        scen.world.buildings.filter(
          (b) => (b.kind === "smith" || b.kind === "foundry") && b.built && !b.ruined,
        ).length || 0
      ),
      ageI: ZS.Ages ? ZS.Ages.index(scen) : 0,
      foes: ZS.Army ? ZS.Army.units(scen, true).length : 0,
      crew: ZS.Units ? ZS.Units.crew(scen) : 0,
      beds4: ZS.Units ? ZS.Units.cap(scen) : 0,
      raiders: (scen.raiders || []).length,
      morale: scen.morale === undefined ? 1 : scen.morale,
      despair: scen.haz && scen.haz.despair ? scen.haz.despair : 0,
      fear: panic(scen),
      done: scen.done || {},
      // what the village wants in hand, the same sums the labourer uses
      wantW: Math.min(scen.storeCap ? scen.storeCap("wood") : 200, 80 + pop.length * 10),
      wantS: Math.min(scen.storeCap ? scen.storeCap("stone") : 200, 60 + pop.length * 8),
      wantC: Math.min(scen.storeCap ? scen.storeCap("scrap") : 200, 40 + pop.length * 6),
    };
  }

  function panic(scen) {
    let n = 0,
      s = 0;
    for (const a of scen.villagers()) {
      if (!a.panic) continue;
      n++;
      s += Math.min(1, a.panic);
    }
    return n ? s / n : 0;
  }

  /* ---------- where things go ---------- */

  // a clear patch, searched in rings out from the green, the way a player
  // would look for one (Structs.make is the top-left corner)
  function spot(scen, kind) {
    const c = ZS.Structs.CAT[kind];
    if (!c) return null;
    const cx = scen.center ? scen.center.x : scen.hall.x;
    const cy = scen.center ? scen.center.y : scen.hall.y;
    for (let ring = 0; ring < 9; ring++) {
      const r = 150 + ring * 62;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + ring * 0.4;
        const x = cx + Math.cos(a) * r,
          y = cy + Math.sin(a) * r * 0.85;
        if (x < 80 || y < 80 || x > scen.world.w - 80 || y > scen.world.h - 80) continue;
        if (ZS.Structs.canPlace(scen.world, scen.nav, kind, x, y).ok) return { x, y };
      }
    }
    return null;
  }

  // walls and barricades only work as a line: the steward lays them in a
  // ring round the green, outside the buildings
  function ringSpot(scen, i, n, r) {
    const a = (i / n) * Math.PI * 2;
    const cx = scen.center ? scen.center.x : scen.hall.x;
    const cy = scen.center ? scen.center.y : scen.hall.y;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.9 };
  }

  // mark one out without disturbing whatever the player has in hand
  function raise(scen, kind, x, y) {
    const wasMode = scen.mode,
      wasArmed = scen.armed,
      wasDrag = scen.drag;
    scen.armed = kind;
    if (!scen.canPay(scen.buildCost(kind))) {
      scen.armed = wasArmed;
      return false;
    }
    const ok =
      ZS.Structs.canPlace(scen.world, scen.nav, kind, x, y).ok && scen._placeAt(x, y, true);
    scen.armed = wasArmed;
    scen.mode = wasMode;
    scen.drag = wasDrag;
    return ok;
  }

  /* ---------- the plan: what the village raises, and when ---------- */

  // in the order the steward would raise them. Each row is a kind, how
  // many of them he wants, and when he starts wanting them.
  const PLAN = [
    ["shop", 1, (r) => r.day >= 2], // somewhere to think, before anything else
    ["shed", 2, (r) => r.day >= 2], // and somewhere to put things
    ["hut", 6, (r) => r.pop >= r.beds - 1], // beds before comforts
    ["farm", 3, (r) => r.day >= 3 && r.food < r.up * 4],
    ["store", 2, (r) => r.stores > r.storeCap * 0.72],
    ["infirm", 1, (r) => r.pop >= 5],
    ["post", 2, (r) => r.pop >= 6 && r.guards >= r.guardCap - 1],
    ["tower", 2, (r) => r.day >= 8 || r.done.towers2],
    ["well", 1, (r) => r.day >= 4],
    ["smith", 1, (r) => r.day >= 8 || r.scrap > 18],
    ["mill", 1, (r) => r.day >= 6 && r.plots >= 2],
    ["granary", 1, (r) => r.day >= 6 && r.food > 150],
    ["barracks", 2, (r) => r.pop >= 7], // the field: the ages gate these
    ["stable", 1, (r) => r.ageI >= 1 && r.pop >= 8],
    ["foundry", 1, (r) => r.ageI >= 2 && r.scrap > 30],
    ["airfield", 1, (r) => r.ageI >= 3],
    ["kennel", 1, (r) => r.pop >= 7],
    ["shrine", 1, (r) => r.pop >= 8 && r.morale < 0.72],
  ];

  // what he studies, in order — the physic's chest first, because the
  // plague is the thing that ends villages
  const STUDY = [
    "tools1",
    "spears",
    "physic",
    "farm1",
    "bows",
    "serum1",
    "armor1",
    "serum2",
    "towers2",
    "serum3",
    "medicine",
    "tools2",
    "rifles",
    "gunpowder",
    "stonewall",
    "mechanised",
    "flight",
    "farm2",
    "armor2",
    "shotguns",
    "smgs",
    "reinforce",
  ];

  /* ---------- the work ---------- */

  // who is good at what: the steward reads their trait, the way a real
  // one would know his people
  // children carry and tend; they do not stand the watch, work the forge
  // or break rock
  const HARD = { guard: 1, heal: 1, smith: 1, stone: 1 };

  function can(a, job) {
    return !(a.kin && a.kin.child && HARD[job]);
  }

  function fit(a, job) {
    const t = ZS.Kin ? ZS.Kin.trait(a) : null;
    const id = t ? t.id : "";
    if (job === "guard" || job === "smith") return id === "brave" ? 2 : id === "strong" ? 1 : 0;
    if (job === "heal") return id === "clever" ? 2 : 0;
    if (job === "wood" || job === "stone" || job === "build" || job === "repair")
      return id === "strong" ? 2 : id === "quick" ? 1 : 0;
    if (job === "farm" || job === "food") return id === "quick" ? 1 : 0;
    return 0;
  }

  function plan(r) {
    const want = [];
    const push = (job, n) => {
      for (let i = 0; i < n; i++) want.push(job);
    };
    // the watch: more of it as the nights get worse, and all of it when
    // there is something in the field. Never so much that nobody works.
    let share = r.day < 6 ? BAL.GUARD_EARLY : r.day < 13 ? BAL.GUARD_LATE : 0.5;
    if (r.foes || r.raiders) share = BAL.GUARD_THREAT;
    let g = Math.min(r.guardCap, Math.ceil(r.pop * share));
    g = Math.min(g, Math.max(0, r.adults.length - 2));
    if (r.pop <= 3) g = Math.min(g, 1);
    push("guard", Math.max(0, g));
    // the wounded
    if (r.hasInfirm && r.patients > 0) push("heal", r.patients > 3 ? 2 : 1);
    // arms, if there is scrap to make them from and somewhere to keep them
    if (r.canForge && r.scrap > 6 && r.arms < r.armsCap - 1) push("smith", 1);
    // the larder first, always
    const feed = r.food < r.up * BAL.FEED;
    if (feed) push("food", r.food < r.up * 1.4 ? 3 : 1);
    // the plots: one hand each, and never more than three
    push("farm", Math.min(r.plots, 3));
    // then the piles, by what is short
    const shortW = r.wood < r.wantW,
      shortS = r.stone < r.wantS,
      shortC = r.scrap < r.wantC;
    if (shortW) push("wood", r.wood < r.wantW * 0.5 ? 2 : 1);
    if (shortS) push("stone", 1);
    if (shortC && r.wood >= r.wantW) push("wood", 1); // wreck, when the wood is in
    // whatever has been marked out
    if (r.sites) push("build", Math.min(r.sites * 2, 4));
    // and what the night broke
    if (r.hurt && r.wood > BAL.WOOD_KEEP * 0.5) push("repair", r.hurt > 3 ? 2 : 1);
    // everybody else takes what comes
    while (want.length < r.people.length) want.push("labourer");
    return want.slice(0, r.people.length);
  }

  // set the work: as little moving about as possible, and never a hand
  // the player has set today
  function jobs(scen, r) {
    const want = plan(r);
    const need = Object.create(null);
    for (const j of want) need[j] = (need[j] || 0) + 1;
    const held = []; // set by hand today: leave them
    const free = [];
    for (const a of r.people) {
      if (a.hand === scen.day) {
        held.push(a);
        if (need[a.job] > 0) need[a.job]--;
      } else free.push(a);
    }
    // fill each job: whoever is already doing it, then whoever suits it
    const take = (job) => {
      // whoever is already doing it, then whoever suits it best
      for (const a of free)
        if (!a.taken && a.job === job && can(a, job)) {
          a.taken = 1;
          return a;
        }
      let best = null,
        bs = -1;
      for (const a of free) {
        if (a.taken || !can(a, job)) continue;
        const s = fit(a, job);
        if (s > bs) {
          bs = s;
          best = a;
        }
      }
      if (best) {
        best.taken = 1;
        return best;
      }
      return null;
    };
    for (const job in need) {
      for (let i = 0; i < need[job]; i++) {
        const a = take(job);
        if (!a) break;
        if (a.job !== job) scen.setJob(a, job, true);
        a.pilot = job;
      }
    }
    // anybody still unassigned takes what comes
    for (const a of free)
      if (!a.taken && a.job !== "labourer") {
        scen.setJob(a, "labourer", true);
        a.pilot = "labourer";
      }
    for (const a of r.people) a.taken = 0;
  }

  /* ---------- raising, mending, studying ---------- */

  function build(scen, r) {
    let marked = 0;
    for (const [kind, n, when] of PLAN) {
      if (marked >= BAL.MARK_MAX) break;
      const have = scen.count ? scen.count(kind) : 0;
      if (have >= n) continue;
      if (!when(r)) continue;
      if (!scen.canPay(scen.buildCost(kind))) continue;
      // the mending comes first: never leave the village with no timber
      if (scen.res.wood - (scen.buildCost(kind).w || 0) < BAL.WOOD_KEEP * 0.4) continue;
      const p = spot(scen, kind);
      if (!p) continue;
      if (raise(scen, kind, p.x, p.y)) marked++;
    }
    // a wall works as a ring, or it does not work at all — and a ring
    // that goes up one post a day is not a ring in time
    const keep = marked ? 150 : 70; // a plan in hand outranks another post
    for (let k = 0; k < 3 && r.wood > keep && r.walls < 14; k++) {
      let laid = false;
      for (let i = 0; i < 14 && !laid; i++)
        for (const rad of [215, 248, 185]) {
          const p = ringSpot(scen, i, 14, rad);
          if (raise(scen, "wall", p.x, p.y)) {
            marked++;
            laid = true;
            r.walls++;
            break;
          }
        }
      if (!laid) break;
    }
    for (
      let k = 0;
      k < 2 && r.wood > (marked ? 210 : 150) && r.barricades < 14 && r.day >= 5;
      k++
    ) {
      let laid = false;
      for (let i = 0; i < 14 && !laid; i++) {
        const p = ringSpot(scen, i, 14, 292);
        if (raise(scen, "barricade", p.x, p.y)) {
          marked++;
          laid = true;
          r.barricades++;
        }
      }
      if (!laid) break;
    }
    return marked;
  }

  function mend(scen, r) {
    let n = 0;
    // what is broken, worst first — but never at the cost of the season's
    // building, and only two a day
    if (r.wood > BAL.WOOD_KEEP && r.hurt) {
      const hurt = scen.world.buildings
        .filter((b) => b.built && !b.ruined && b.hp < b.maxHp * BAL.REPAIR_AT)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      for (const b of hurt) {
        if (n >= 2 || scen.res.wood < 40) break;
        if (scen.repair(b, true)) n++;
      }
    }
    // a ruin is a whole building for a fraction of the price
    if (scen.res.wood > BAL.MEND_WOOD) {
      const ruin = scen.world.buildings
        .filter((b) => b.ruined && b.kind !== "hall")
        .sort((a, b) => a.maxHp - b.maxHp)[0];
      if (ruin && scen.repair(ruin, true)) n++;
    }
    return n;
  }

  function study(scen) {
    if (scen.research || !scen.has("shop")) return false;
    const list = scen.researchList ? scen.researchList() : [];
    if (!list.length) return false;
    let pick = null;
    for (const id of STUDY) {
      const row = list.find((x) => x.id === id);
      if (row && scen.canPay(row.def.cost)) {
        pick = id;
        break;
      }
    }
    if (!pick) return false;
    return !!scen.startResearch(pick);
  }

  // the hall and the barracks: what a growing village spends its stone on
  function improve(scen, r) {
    const hall = scen.hall;
    if (hall && !hall.ruined && (hall.lvl || 1) < 3) {
      const cost = scen.upgradeCost(hall);
      if (scen.canPay(cost) && r.food > r.up * 2) {
        scen.upgrade(hall);
        return "the hall is raised";
      }
    }
    if (r.crew >= r.beds4 && r.beds4 > 0 && r.food > 260) {
      const b = scen._first("barracks") || scen._first("stable");
      if (b && !b.ruined && (b.lvl || 1) < 3 && scen.canPay(scen.upgradeCost(b))) {
        scen.upgrade(b);
        return "room for more under arms";
      }
    }
    return null;
  }

  // what he puts in the field, best first: the ages gate the rest
  const ARMS_ORDER = [
    "tank",
    "fighter",
    "helicopter",
    "machinegun",
    "cannon",
    "gunner",
    "knightRider",
    "lancer",
    "knight",
    "archer",
    "spearman",
    "militia",
  ];

  /* ---------- the field, the world, the valley ---------- */

  // the strongest thing the village can put in the field, that it can
  // feed. Carts first once the line is fighting far from the stores.
  function field(scen, r) {
    if (!ZS.Army || !ZS.Units || r.beds4 <= 0) return null;
    if (r.food < BAL.TRAIN_FOOD) return null;
    if (r.crew + 1 > r.beds4) return null;
    const want = r.crew >= 4 && !ZS.Units.count(scen, "cart") ? "cart" : ARMS_ORDER;
    const list = Array.isArray(want) ? want : [want];
    for (const id of list) {
      const d = ZS.Units.CAT[id];
      if (!d || !d.cost) continue;
      if (d.age && ZS.Ages && !ZS.Ages.at(scen, d.age)) continue;
      const res = ZS.Army.order(scen, id);
      if (res && res.ok) return ZS.Units.def(id).name;
    }
    return null;
  }

  // the factions at the edge of the valley: cloth, mostly, which the
  // village cannot make for itself and cannot build a workshop without
  function trade(scen, r) {
    const F = ZS.Factions;
    if (!F || !scen.fac || !scen.fac.events) return null;
    for (const ev of scen.fac.events.slice()) {
      const get = ev.get || {},
        give = ev.give || {};
      let worth = 0;
      for (const k in get) {
        if (k === "cloth" && r.cloth < 14) worth += 3;
        else if (k === "scrap" && r.scrap < r.wantC) worth += 2;
        else if (k === "food" && r.food < r.up * 2) worth += 3;
        else worth += 1;
      }
      if (worth < 3) continue;
      // and only out of a full store: never trade away the season's work
      let spare = true;
      for (const k in give) if ((scen.res[k] || 0) < give[k] * 1.8) spare = false;
      if (!spare) continue;
      const res = F.trade(scen, ev.id);
      if (res && res.ok) return "traded with them: " + res.got;
    }
    return null;
  }

  // the nations: pay what you can, speak to whoever will listen, and hire
  // when there is an army on the road
  function world(scen, r) {
    const N = ZS.Nations;
    if (!N || !scen.nat) return null;
    // a demand on the table: pay it while there is a larder to pay it from
    const ev = scen.nat.events[0];
    if (ev) {
      const cost = ev.give.food || N.BAL.TRIBUTE;
      if (r.food > cost + 80) {
        N.pay(scen, ev.id);
        return "the tribute is paid";
      }
      if (r.food < cost) {
        N.refuse(scen, ev.id);
        return "there is nothing to pay them with";
      }
    }
    // an army on the road, and the coin to hire: the Pale will sell you
    // anybody
    if (r.foes && r.food > 200 && r.scrap > 40) {
      const pale = N.get(scen.nat, "pale");
      if (pale && pale.met) {
        const res = N.send(scen, "pale", "hire");
        if (res && res.ok) return "the Pale is hired";
      }
    }
    // speak to whoever has not been spoken to, out of a full larder
    if (r.food > BAL.ENVOY_FOOD) {
      for (const f of scen.nat.list) {
        const d = N.def(f.id);
        if (d.foe || f.war || f.met < 1 || f.met >= 2) continue;
        if (f.opinion > 0.66) continue;
        const res = N.send(scen, f.id, "envoy");
        if (res && res.ok) return "an envoy rides for " + d.name;
        break;
      }
    }
    return null;
  }

  // out into the valley: the cure's own sites first, then whatever is
  // still unseen
  function party(scen, r) {
    const ow = scen.ow;
    if (!ow || ow.parties.length || !ZS.Overworld) return null;
    if (r.food < BAL.PARTY_FOOD || r.pop < 4) return null;
    let pick = null;
    const cure = ZS.Cure && scen.cure ? ZS.Cure.current(scen.cure) : null;
    if (cure && cure.site) {
      const s = ZS.Overworld.site(ow, cure.site);
      if (s && s.seen) pick = s;
    }
    if (!pick) {
      const seen = ow.sites.filter((s) => s.seen && !s.looted);
      if (seen.length) pick = seen[(Math.random() * seen.length) | 0];
    }
    if (!pick) return null;
    if (!ZS.Overworld.canSend(ow, scen, pick.id, false).ok) return null;
    ZS.Overworld.send(ow, scen, pick.id, false);
    return "a party goes to " + (ZS.Overworld.def(pick.id) || {}).name;
  }

  // how the line stands: a skirmish line if most of it shoots, a wedge if
  // it is outnumbered, a line otherwise — and out to meet them when there
  // are more of ours than there are of theirs
  function tactics(scen, r) {
    const A = scen.army;
    if (!A || !ZS.Army || !r.crew) return null;
    let shoot = 0;
    for (const a of ZS.Army.units(scen, false)) {
      const d = ZS.Units.CAT[a.unit];
      if (d && (d.rng || 0) > 40) shoot++;
    }
    const form = shoot * 2 >= r.crew ? "skirmish" : r.foes > r.crew ? "wedge" : "line";
    const stance = r.foes && r.crew > r.foes ? "push" : "hold";
    const focus = r.foes > r.crew ? "weak" : "near";
    const did = [];
    if (A.form !== form) {
      ZS.Army.form(scen, form);
      did.push("a " + form);
    }
    if (A.stance !== stance) {
      ZS.Army.stance(scen, stance);
      did.push(stance === "push" ? "out to meet them" : "back on their ground");
    }
    if (A.focus !== focus) {
      ZS.Army.focus(scen, focus);
      did.push("aim at the " + (focus === "weak" ? "wounded" : "nearest"));
    }
    return did.length ? "the line forms " + did.join(", ") : null;
  }

  /* ---------- the module ---------- */

  const Autopilot = {
    BAL,
    ARMS_ORDER,

    create() {
      return { on: 0, last: "", did: [], t: 0, day: 0 };
    },

    load(scen, s) {
      const p = (scen.pilot = this.create());
      if (!s) return p;
      p.on = s.on ? 1 : 0;
      p.last = s.last || "";
      p.did = Array.isArray(s.did) ? s.did.slice(0, 6) : [];
      return p;
    },

    save(scen) {
      const p = scen.pilot || this.create();
      return { on: p.on ? 1 : 0, last: p.last || "", did: p.did.slice(0, 6) };
    },

    on(scen) {
      return !!(scen.pilot && scen.pilot.on);
    },

    toggle(scen) {
      if (!scen.pilot) this.load(scen, null);
      scen.pilot.on = scen.pilot.on ? 0 : 1;
      scen.pilot.t = 0;
      if (scen.pilot.on) {
        this.dawn(scen);
        this.say(scen, "the steward takes the village in hand");
      } else {
        scen.pilot.last = "the steward steps back — the village is yours again";
        if (ZS.Chronicle) ZS.Chronicle.add(scen, "the steward steps back", "note");
      }
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
      return !!scen.pilot.on;
    },

    // what he tells you: the panel keeps the last of it
    say(scen, txt) {
      if (!scen.pilot) this.load(scen, null);
      scen.pilot.last = txt;
      scen.pilot.did.unshift(txt);
      if (scen.pilot.did.length > 6) scen.pilot.did.length = 6;
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "note");
    },

    /* the dawn: the whole village, thought about once */
    dawn(scen) {
      if (!this.on(scen) || scen.over) return;
      const r = read(scen);
      if (!r.people.length) return;
      const did = [];
      jobs(scen, r);
      const swapped = trade(scen, r);
      if (swapped) did.push(swapped);
      const marked = build(scen, r);
      if (marked) did.push(marked === 1 ? "a site marked out" : marked + " sites marked out");
      const mended = mend(scen, r);
      if (mended) did.push(mended === 1 ? "one building mended" : mended + " buildings mended");
      if (study(scen)) {
        const r2 = scen.research;
        if (r2) did.push("the workshop takes up " + r2.def.name.toLowerCase());
      }
      const grew = improve(scen, r);
      if (grew) did.push(grew);
      // mouths, then hands
      let took = 0;
      const feed = r.pop < 5 ? BAL.RECRUIT_FOOD * 0.65 : BAL.RECRUIT_FOOD;
      while (
        scen.villagers().length < scen.popCap() &&
        scen.res.food > feed &&
        scen.res.wood > BAL.RECRUIT_WOOD
      ) {
        if (!scen.recruit() || took++ > 2) break;
      }
      if (took) did.push(took === 1 ? "a bed given" : took + " beds given");
      const arms = field(scen, r);
      if (arms) did.push(arms + " under arms");
      const shape = tactics(scen, r);
      if (shape) did.push(shape);
      const beyond = world(scen, r);
      if (beyond) did.push(beyond);
      const out = party(scen, r);
      if (out) did.push(out);
      if ((r.morale < BAL.FEAST_MORALE || r.despair > 0.4) && ZS.Hazards) {
        if (ZS.Hazards.feast(scen).ok) did.push("a hot meal for everybody");
      }
      if (did.length) this.say(scen, did.join(" · "));
      else this.say(scen, "the work is set, and there is nothing to add");
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
    },

    /* the day (and the night): the small looks round */
    tick(scen, dt) {
      const p = scen.pilot;
      if (!p || !p.on || scen.over) return;
      p.t -= dt;
      if (p.t > 0) return;
      p.t = BAL.THINK;
      const r = read(scen);
      if (!r.people.length) return;
      // the work moves with the day: a larder that has gone short, a wall
      // that has gone down, something in the field
      jobs(scen, r);
      // the dark gets into them: ring the bell over it
      if (r.night && r.fear > BAL.RING_FEAR && !(scen.bellT > 0) && scen.ringBell) scen.ringBell();
      // a feast, when the heart is going
      if (!r.night && (r.morale < BAL.FEAST_MORALE || r.despair > 0.4) && ZS.Hazards) {
        if (ZS.Hazards.feast(scen).ok) this.say(scen, "a hot meal for everybody");
      }
      // how the line stands, as the field changes
      const shape = tactics(scen, r);
      if (shape) this.say(scen, shape);
      // and anything worth raising, if the morning's plan has run dry
      if (!r.sites && !r.night) {
        const marked = build(scen, r);
        if (marked)
          this.say(scen, marked === 1 ? "a site marked out" : marked + " sites marked out");
        if (study(scen)) {
          const rr = scen.research;
          if (rr) this.say(scen, "the workshop takes up " + rr.def.name.toLowerCase());
        }
      }
    },

    /* what the panel shows */
    line(scen) {
      const p = scen.pilot;
      if (!p) return "the steward is not about";
      if (!p.on) return "the steward is standing by";
      return p.last || "the steward is looking round";
    },

    // the jobs, for the panel: who is doing what and why
    jobs(scen) {
      const r = read(scen);
      return plan(r);
    },

    read,
  };

  ZS.Autopilot = Autopilot;
})();
