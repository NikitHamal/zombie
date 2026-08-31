/* The Hollow — the world beyond.
   Six nations past the valley, and one that was never going to be a
   friend. Each of them keeps an opinion, and each of them is a long way
   off: an envoy rides for days, a caravan takes a week to come back, and
   an army takes its time arriving — which is the only warning you get.

   The far ones are also the strong ones. The Grange sends grain and
   asks for iron; the Rust sends machines and asks for bread. What they
   put in the field is decided by what they are (`age`), so the Desert
   Order arrives on horses with cannon and the Black Choir arrives on
   foot with knives.

   Nothing here touches the simulation directly: the scenario hands this
   file its stores, its people and its army, and asks it to tick. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  // The nations roll their own dice. Nothing they do may move the village's
  // own random stream — the weather of the world should not change because
  // somebody far away decided to be difficult.
  function rng(st) {
    if (!st._rng) st._rng = ZS.rng32((st.seed | 0) ^ 0x71ab || 1);
    return st._rng;
  }
  function roll(st) {
    return rng(st)();
  }

  const BAL = {
    DRIFT: 0.007, // opinion slides back toward neutral every dawn
    KNOW_AT: 5, // the day the first of them is heard of
    KNOW_STEP: 2, // ...and how far apart the rest of them are
    CARAVAN_AT: 0.6, // this fond, and their wagons come
    CARAVAN_EVERY: 5, // ...this many days apart
    DEMAND_AT: 0.32, // this sour, and they send a demand
    WAR_AT: 0.16, // this sour, and they stop asking
    ALLY_AT: 0.78, // this fond, and they send help
    TRIBUTE: 40, // what a demand asks for
    ENVOY: { food: 20, scrap: 8 }, // what an envoy costs to send
    GIFT: { food: 45 }, // what a gift costs
    OP_ENVOY: 0.12,
    OP_TRADE: 0.05,
    OP_GIFT: 0.18,
    OP_REFUSE: -0.2,
    OP_INSULT: -0.2,
    OP_BEATEN: 0.16, // they lost an army and they would rather not lose another
    SUE_FOR: 2, // how many invasions have to fail before they ask for peace
    HELP_CHANCE: 0.5, // an ally rides in when the village is in trouble
    INVADE_EVERY: [6, 9], // days between invasions, once it is war
    INVADE_N: (day) => 2 + Math.min(7, Math.floor(day / 9)),
    CHOIR_AT: 18, // the day the choir first walks out of the burnt valley
    CHOIR_EVERY: [8, 11], // ...and how often after that
    CHOIR_N: (day) => 1 + Math.min(5, Math.floor(Math.max(0, day - 10) / 12)),
  };

  /* ---------- who is out there ----------
     days  how long a ride takes, one way
     ang   where they sit on the map, in radians
     age   what they can put in the field (see js/village/ages.js)
     field what they actually send
     give  what a caravan brings · want what it costs you */

  const NATIONS = [
    {
      id: "grange",
      name: "the Grange",
      where: "east, where the fields still stand",
      blurb: "a league of farming towns. Grain to spare, and nothing to defend it with.",
      days: 3,
      ang: 0.2,
      age: "manor",
      field: ["militia", "spearman", "archer"],
      give: { food: 90, cloth: 8 },
      want: { scrap: 30, arms: 8 },
      op0: 0.54,
    },
    {
      id: "kell",
      name: "Kell",
      where: "north, in the hills",
      blurb: "a hill kingdom with a horse under every knight. They want stone, and they want iron.",
      days: 4,
      ang: -0.85,
      age: "manor",
      field: ["spearman", "knight", "knightRider"],
      give: { stone: 80, arms: 12 },
      want: { food: 60, scrap: 24 },
      op0: 0.48,
    },
    {
      id: "pale",
      name: "the Pale Company",
      where: "on the road, going wherever the pay is",
      blurb: "sellswords. They will stand your line for bread and arms, and they are good at it.",
      days: 4,
      ang: 1.35,
      age: "manor",
      merc: 1,
      field: ["spearman", "archer", "knight"],
      give: { arms: 20, scrap: 20 },
      want: { food: 50 },
      op0: 0.5,
    },
    {
      id: "order",
      name: "the Desert Order",
      where: "south, past the dry hills",
      blurb:
        "riders, and cannon on the camels behind them. They came a long way, and they mean to stay.",
      days: 6,
      ang: 2.45,
      age: "forge",
      field: ["lancer", "gunner", "cannon"],
      give: { arms: 34, scrap: 26 },
      want: { food: 70, cloth: 6 },
      op0: 0.42,
    },
    {
      id: "salt",
      name: "the Salt Coast",
      where: "west, where the river meets the sea",
      blurb: "traders and shipbuilders. Cloth, medicine, and a fair price for scrap.",
      days: 5,
      ang: -2.15,
      age: "forge",
      field: ["militia", "gunner"],
      give: { cloth: 18, scrap: 40, arms: 10 },
      want: { food: 45, wood: 40 },
      op0: 0.52,
    },
    {
      id: "rust",
      name: "the Rust",
      where: "east, in the old works",
      blurb:
        "a host built out of what the world threw away. Machines, and the men who keep them running.",
      days: 7,
      ang: -3.0,
      age: "foundry",
      field: ["gunner", "machinegun", "tank"],
      give: { arms: 46, scrap: 60 },
      want: { food: 90, arms: 10 },
      op0: 0.4,
    },
    {
      id: "choir",
      name: "the Black Choir",
      where: "north-east, in the burnt valley",
      blurb:
        "they do not trade. They sing to the dead and they walk among them, and they want the hollow.",
      days: 5,
      ang: 3.05,
      age: "manor",
      foe: 1, // never anything but an enemy
      field: ["militia", "spearman", "knightRider"],
      give: {},
      want: {},
      op0: 0.06,
    },
  ];

  const Nations = {
    BAL,
    NATIONS,

    def(id) {
      for (const n of NATIONS) if (n.id === id) return n;
      return null;
    },

    create(seed) {
      const rng = ZS.rng32((seed | 0) ^ 0x7a1c);
      return {
        seed: seed | 0,
        list: NATIONS.map((n) => ({
          id: n.id,
          opinion: n.foe ? n.op0 : ZS.clamp(n.op0 + (rng() - 0.5) * 0.18, 0.05, 0.95),
          met: 0, // 0 unheard of · 1 heard of · 2 spoken with
          war: 0,
          rides: [], // who is on the road: { kind, t, days }
          caravanIn: 2 + Math.floor(rng() * 3),
          demandIn: 0,
          invadeIn: 0,
          invasions: 0,
          beaten: 0,
          anger: 0,
        })),
        events: [], // the demands waiting on an answer
        next: 1,
        news: [], // the last few things that happened out there
      };
    },

    get(st, id) {
      for (const f of st.list) if (f.id === id) return f;
      return null;
    },

    // are these two nations at war with each other? An RTS scenario turns
    // whole factions hostile to one another through this. Unknown or
    // missing ids default to peaceful.
    atWar(scen, aId, bId) {
      if (!aId || !bId || aId === bId) return false;
      const st = scen && scen.nat;
      if (!st) return false;
      const a = this.get(st, aId),
        b = this.get(st, bId);
      return !!(a && b && a.war && b.war);
    },

    word(op) {
      return op > 0.78
        ? "allies"
        : op > 0.6
          ? "friendly"
          : op > 0.44
            ? "wary"
            : op > 0.28
              ? "cold"
              : op > 0.16
                ? "hostile"
                : "at war";
    },

    /* ---------- the dawn ---------- */

    daily(scen) {
      const st = scen.nat;
      if (!st) return;
      for (let i = 0; i < st.list.length; i++) {
        const f = st.list[i];
        const d = this.def(f.id);
        // opinions cool toward the middle; the Choir has no middle to find
        if (!d.foe) f.opinion += (0.5 - f.opinion) * BAL.DRIFT;
        f.anger = Math.max(0, f.anger - 0.05);
        // you hear of them in turn, the nearer ones first
        if (!f.met && scen.day >= BAL.KNOW_AT + i * BAL.KNOW_STEP) {
          f.met = 1;
          st.news.unshift("word reaches the hollow: " + d.name + ", " + d.where);
          if (ZS.Chronicle) ZS.Chronicle.add(scen, "we hear of " + d.name, "people");
        }
        if (!f.met) continue;
        // what is on the road
        for (let k = f.rides.length - 1; k >= 0; k--) {
          const r = f.rides[k];
          r.t--;
          if (r.t > 0) continue;
          f.rides.splice(k, 1);
          this.arrive(scen, f, r);
        }
        if (d.foe) {
          // they do not ask. They start later than anybody else would,
          // and they never send the whole choir at once
          if (scen.day < BAL.CHOIR_AT) continue;
          if (f.invadeIn > 0) f.invadeIn--;
          else {
            f.invadeIn = BAL.CHOIR_EVERY[0] + Math.floor(roll(st) * 3);
            this.invade(scen, f);
          }
          continue;
        }
        // caravans, demands, invasions
        if (f.war) {
          if (f.invadeIn > 0) f.invadeIn--;
          else {
            f.invadeIn =
              BAL.INVADE_EVERY[0] +
              Math.floor(roll(st) * (BAL.INVADE_EVERY[1] - BAL.INVADE_EVERY[0] + 1));
            this.invade(scen, f);
          }
          continue;
        }
        if (f.opinion >= BAL.CARAVAN_AT) {
          if (f.caravanIn > 0) f.caravanIn--;
          else {
            f.caravanIn = BAL.CARAVAN_EVERY;
            this.caravan(scen, f);
          }
        }
        if (f.opinion < BAL.DEMAND_AT && f.demandIn <= 0 && !this.hasEvent(st, f.id)) {
          f.demandIn = 6;
          this.pushEvent(st, f, scen);
        } else if (f.demandIn > 0) f.demandIn--;
      }
      // stale demands are withdrawn
      for (let i = st.events.length - 1; i >= 0; i--)
        if (scen.day - st.events[i].day > 4) st.events.splice(i, 1);
      if (st.news.length > 6) st.news.length = 6;
    },

    hasEvent(st, fid) {
      for (const e of st.events) if (e.faction === fid) return true;
      return false;
    },

    pushEvent(st, f, scen) {
      const d = this.def(f.id);
      const ev = {
        id: st.next++,
        faction: f.id,
        day: scen.day,
        give: { food: BAL.TRIBUTE },
        text: d.name + " want " + BAL.TRIBUTE + " food, or they will ride",
      };
      st.events.push(ev);
      st.news.unshift(ev.text);
      if (ZS.Chronicle) ZS.Chronicle.add(scen, ev.text, "people");
      if (ZS.VillageUI) ZS.VillageUI.toast(ev.text);
      return ev;
    },

    event(st, id) {
      for (const e of st.events) if (e.id === +id) return e;
      return null;
    },

    /* ---------- the road ---------- */

    // what it costs to put somebody on a horse
    rideCost(scen, kind) {
      if (kind === "envoy") return { food: BAL.ENVOY.food, scrap: BAL.ENVOY.scrap };
      if (kind === "gift") return { food: BAL.GIFT.food };
      const d = kind === "hire" ? this.def("pale") : this.def(kind);
      const n = this.pick(scen);
      const cost = {};
      const want = (d && d.want) || {};
      for (const k in want) cost[k] = want[k];
      if (kind === "hire" && n) {
        // a company of sellswords wants paying in arms, and feeding
        cost.arms = (cost.arms || 0) + 14;
        cost.food = (cost.food || 0) + 30;
      }
      return cost;
    },

    pick(scen) {
      return scen.nat ? this.get(scen.nat, "pale") : null;
    },

    send(scen, id, kind) {
      const st = scen.nat;
      const f = this.get(st, id);
      const d = this.def(id);
      if (!f || !f.met) return { ok: false, err: "you have not heard of them" };
      if (d.foe && kind !== "insult") return { ok: false, err: "they do not receive anybody" };
      if (f.rides.length >= 3) return { ok: false, err: "there is already a party on the road" };
      const cost = this.rideCost(scen, kind === "hire" ? "hire" : kind);
      if (kind === "trade") {
        for (const k in d.want)
          if ((scen.res[k] || 0) < d.want[k]) return { ok: false, err: "not enough " + k };
        for (const k in d.want) scen.res[k] -= d.want[k];
      } else if (kind !== "insult") {
        for (const k in cost)
          if ((scen.res[k] || 0) < cost[k]) return { ok: false, err: "not enough " + k };
        for (const k in cost) scen.res[k] -= cost[k];
      }
      const days = d.days;
      f.rides.push({ kind, t: kind === "trade" || kind === "hire" ? days * 2 : days, days });
      st.news.unshift(
        kind === "envoy"
          ? "an envoy rides for " + d.name
          : kind === "trade"
            ? "goods sent to " + d.name
            : kind === "hire"
              ? "the Pale Company has been paid"
              : kind === "gift"
                ? "a gift goes to " + d.name
                : "word sent to " + d.name + ", and none of it kind",
      );
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
      return { ok: true, days: days };
    },

    // what comes of a ride when it gets there
    arrive(scen, f, r) {
      const st = scen.nat;
      const d = this.def(f.id);
      if (r.kind === "envoy") {
        f.opinion = ZS.clamp(f.opinion + BAL.OP_ENVOY, 0, 1);
        f.met = 2;
        st.news.unshift("the envoy is received by " + d.name);
        if (ZS.Chronicle) ZS.Chronicle.add(scen, "an envoy to " + d.name, "people");
        return;
      }
      if (r.kind === "gift") {
        f.opinion = ZS.clamp(f.opinion + BAL.OP_GIFT, 0, 1);
        f.met = 2;
        if (f.war && f.opinion >= 0.3) {
          f.war = 0;
          f.invadeIn = 0;
          st.news.unshift(d.name + " accepts the gift, and the war ends");
          if (ZS.Chronicle) ZS.Chronicle.add(scen, "peace with " + d.name, "people");
        } else st.news.unshift(d.name + " takes the gift");
        return;
      }
      if (r.kind === "trade") {
        const got = [];
        for (const k in d.give) {
          const room = Math.max(0, scen.storeCap(k) - scen.res[k]);
          const n = Math.min(Math.round(d.give[k]), Math.round(room));
          if (n <= 0) continue;
          scen.res[k] = (scen.res[k] || 0) + n;
          got.push(n + " " + k);
        }
        f.opinion = ZS.clamp(f.opinion + BAL.OP_TRADE, 0, 1);
        f.met = 2;
        const txt =
          "the wagons come back from " +
          d.name +
          (got.length ? " — " + got.join(", ") : " — and the stores were full");
        st.news.unshift(txt);
        if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "people");
        if (ZS.sound) ZS.sound.event("v_callout", scen.hall.x, scen.hall.y);
        if (ZS.VillageUI) ZS.VillageUI.toast(txt);
        return;
      }
      if (r.kind === "hire") {
        f.opinion = ZS.clamp(f.opinion + BAL.OP_TRADE, 0, 1);
        f.met = 2;
        this.hire(scen);
        return;
      }
      if (r.kind === "insult") {
        f.opinion = ZS.clamp(f.opinion + BAL.OP_INSULT, 0, 1);
        f.anger = Math.min(1, f.anger + 0.35);
        st.news.unshift(d.name + " will not forget that");
        if (f.opinion < BAL.WAR_AT) this.declare(scen, f);
      }
    },

    // the sellswords: one of theirs, under your flag
    hire(scen) {
      const d = this.def("pale");
      const ids = ZS.Units.ORDER.filter((id) => {
        const u = ZS.Units.def(id);
        return d.field.indexOf(id) >= 0 && ZS.Ages.at(scen, u.age) && u.dmg > 0;
      });
      const id = ids.length ? ids[ids.length - 1] : "militia";
      const a = ZS.Army.spawn(scen, id, false);
      if (!a) return;
      a.hired = 1;
      const txt = "the Pale Company send a " + ZS.Units.def(id).name;
      scen.nat.news.unshift(txt);
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "people");
      if (ZS.VillageUI) ZS.VillageUI.toast(txt);
    },

    /* ---------- the answers ---------- */

    pay(scen, id) {
      const st = scen.nat;
      const ev = this.event(st, id);
      if (!ev) return { ok: false, err: "they have gone" };
      for (const k in ev.give)
        if ((scen.res[k] || 0) < ev.give[k]) return { ok: false, err: "not enough " + k };
      for (const k in ev.give) scen.res[k] -= ev.give[k];
      const f = this.get(st, ev.faction);
      f.opinion = ZS.clamp(f.opinion + 0.16, 0, 1);
      f.met = 2;
      st.events.splice(st.events.indexOf(ev), 1);
      const txt = "paid " + this.def(f.id).name + " " + ev.give.food + " food";
      st.news.unshift(txt);
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "people");
      if (ZS.VillageUI) ZS.VillageUI.toast("they took it, and they rode off");
      return { ok: true };
    },

    refuse(scen, id) {
      const st = scen.nat;
      const ev = this.event(st, id);
      if (!ev) return { ok: false, err: "they have gone" };
      const f = this.get(st, ev.faction);
      f.opinion = ZS.clamp(f.opinion + BAL.OP_REFUSE, 0, 1);
      f.anger = Math.min(1, f.anger + 0.4);
      f.met = 2;
      st.events.splice(st.events.indexOf(ev), 1);
      const txt = "refused " + this.def(f.id).name;
      st.news.unshift(txt);
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt + " — they will ride", "people");
      if (f.opinion < BAL.WAR_AT) this.declare(scen, f);
      else f.invadeIn = Math.min(f.invadeIn || 3, 3);
      return { ok: true };
    },

    declare(scen, f) {
      if (f.war) return;
      const d = this.def(f.id);
      f.war = 1;
      f.invadeIn = 2;
      const txt = "it is war with " + d.name;
      scen.nat.news.unshift(txt);
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "people");
      if (ZS.VillageUI) ZS.VillageUI.toast(txt);
      scen.alarm("war", txt);
      if (ZS.sound) ZS.sound.event("v_bell", scen.hall.x, scen.hall.y);
    },

    /* ---------- the caravan, and the help ---------- */

    caravan(scen, f) {
      const d = this.def(f.id);
      const got = [];
      for (const k in d.give) {
        const room = Math.max(0, scen.storeCap(k) - scen.res[k]);
        const n = Math.min(Math.round(d.give[k] * 0.6), Math.round(room));
        if (n <= 0) continue;
        scen.res[k] = (scen.res[k] || 0) + n;
        got.push(n + " " + k);
      }
      const txt =
        "a caravan out of " +
        d.name +
        (got.length ? " — " + got.join(", ") : " — and nowhere to put it");
      scen.nat.news.unshift(txt);
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "people");
      if (got.length && ZS.VillageUI) ZS.VillageUI.toast(txt);
    },

    // an ally rides in when the village is in trouble: the night went badly,
    // or there are strangers in the field
    help(scen) {
      const st = scen.nat;
      if (!st) return false;
      let came = false;
      for (const f of st.list) {
        const d = this.def(f.id);
        if (d.foe || f.war || f.opinion < BAL.ALLY_AT || !f.met) continue;
        if (roll(st) > BAL.HELP_CHANCE) continue;
        const ids = d.field.filter((id) => ZS.Ages.at(scen, ZS.Units.def(id).age));
        if (!ids.length) continue;
        const id = ids[(roll(st) * ids.length) | 0];
        const n = 1 + (roll(st) < 0.35 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const a = ZS.Army.spawn(scen, id, false);
          if (a) a.ally = d.id;
        }
        const txt = d.name + " send " + (n > 1 ? "two" : "a") + " " + ZS.Units.def(id).name;
        st.news.unshift(txt);
        if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "people");
        if (ZS.VillageUI) ZS.VillageUI.toast(txt);
        came = true;
      }
      return came;
    },

    /* ---------- the invasion ---------- */

    invade(scen, f) {
      const d = this.def(f.id);
      const st = scen.nat;
      const n = d.foe ? BAL.CHOIR_N(scen.day) : BAL.INVADE_N(scen.day);
      // what they can still feed, and what the age allows
      const ids = d.field.filter((id) => ZS.Ages.at(scen, ZS.Units.def(id).age));
      if (!ids.length) return;
      let sent = 0;
      for (let i = 0; i < n; i++) {
        const id = ids[(roll(st) * ids.length) | 0];
        const a = ZS.Army.spawn(scen, id, true);
        if (!a) continue;
        a.nat = f.id;
        sent++;
      }
      if (!sent) return;
      f.left = (f.left || 0) + sent; // how many of theirs are still standing
      f.invasions++;
      const txt = d.name + " are on the road — " + sent + " of them";
      st.news.unshift(txt);
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "war");
      if (ZS.VillageUI) ZS.VillageUI.toast(txt);
      scen.alarm("war", txt);
      if (ZS.sound) ZS.sound.event("v_bell", scen.hall.x, scen.hall.y);
    },

    // called from the army when one of theirs goes down
    lost(scen, a) {
      const st = scen.nat;
      if (!st || !a.nat) return;
      const f = this.get(st, a.nat);
      if (!f) return;
      f.left = Math.max(0, (f.left || 0) - 1);
      if (f.left > 0) return;
      // the last of them is down: they count the cost
      f.beaten++;
      f.anger = Math.min(1, f.anger + 0.2);
      const d = this.def(f.id);
      const txt =
        f.beaten >= BAL.SUE_FOR && !d.foe
          ? d.name + " have had enough — they ride home"
          : "the field is ours; " + d.name + " will come again";
      st.news.unshift(txt);
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "war");
      if (ZS.VillageUI) ZS.VillageUI.toast(txt);
      if (f.beaten >= BAL.SUE_FOR && !d.foe) {
        f.war = 0;
        f.opinion = Math.max(f.opinion, 0.3);
        f.invadeIn = 0;
        f.beaten = 0;
      }
    },

    // how many of theirs are standing
    foes(scen) {
      let n = 0;
      for (const a of scen.agents) if (a.st === 4 && a.foe && !a.dead && !a.gone) n++;
      return n;
    },

    /* ---------- what the panel says ---------- */

    alerts(scen) {
      const st = scen.nat;
      const out = [];
      if (!st) return out;
      for (const e of st.events) {
        const d = this.def(e.faction);
        out.push(["trade", d.name + ": " + e.give.food + " food, or they ride"]);
      }
      const n = this.foes(scen);
      if (n) out.push(["war", n + " of them are in the field"]);
      return out;
    },

    line(scen) {
      const st = scen.nat;
      if (!st) return "";
      const known = st.list.filter((f) => f.met);
      if (!known.length) return "nobody out there that we know of";
      const bits = [];
      for (const f of known) {
        const d = this.def(f.id);
        bits.push(d.name + " " + this.word(f.opinion));
      }
      return bits.join(" · ");
    },

    save(scen) {
      const st = scen.nat;
      if (!st) return null;
      return {
        seed: st.seed,
        list: st.list.map((f) => [
          f.id,
          Math.round(f.opinion * 100) / 100,
          f.met,
          f.war,
          f.caravanIn,
          f.demandIn,
          f.invadeIn,
          f.invasions,
          f.beaten,
          f.rides.map((r) => [r.kind, r.t]),
        ]),
        news: st.news.slice(0, 6),
        next: st.next,
      };
    },

    load(scen, d) {
      const st = (scen.nat = this.create(d ? d.seed : scen.world.seed));
      if (!d) return st;
      for (const row of d.list || []) {
        const f = this.get(st, row[0]);
        if (!f) continue;
        f.opinion = row[1];
        f.met = row[2] || 0;
        f.war = row[3] || 0;
        f.caravanIn = row[4] || 0;
        f.demandIn = row[5] || 0;
        f.invadeIn = row[6] || 0;
        f.invasions = row[7] || 0;
        f.beaten = row[8] || 0;
        f.rides = (row[9] || []).map((r) => ({ kind: r[0], t: r[1], days: r[1] }));
      }
      st.news = d.news || [];
      st.next = d.next || 1;
      return st;
    },
  };

  ZS.Nations = Nations;
})();
