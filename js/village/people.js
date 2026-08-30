/* The Hollow — other people.
   The dead are not the only thing out there. There is a market town that
   would rather sell to you than bury you, and there is a camp in the old
   quarry terraces that would rather take what you have.

   Both of them keep an opinion of you. It moves with what you trade, what
   you pay, and what you refuse. When it sours far enough, the Warrens
   come down the road — and raiders are not the dead: they walk to the
   granary, they fill their arms, they run when they are hurt, and what
   they carry off the map is gone.

   Nothing here touches the simulation directly: the scenario hands this
   file its stores and its people and asks it to tick. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const BAL = {
    DRIFT: 0.012, // opinion slides back toward neutral every dawn
    CARAVAN_AT: 0.55, // a town this fond of you sends a caravan
    DEMAND_AT: 0.46, // raiders this sour send a demand
    TRIBUTE: 34, // the food they ask for
    TRADE_GIVE: 30, // what the caravan wants
    RAID_IN: 2, // days between a refusal and the raid
    RAID_N: (day) => 2 + Math.min(5, Math.floor(day / 6)),
    RAID_HP: 62,
    RAID_DMG: 7,
    RAID_REACH: 26,
    RAID_CD: 1.15,
    RAID_SPD: 96,
    STEAL: 9, // how much one raider can carry
    STEAL_T: 2.4, // seconds at the store filling their arms
    FLEE_AT: 0.38, // they run below this fraction of their health
    WAR_LOOT: { food: 30, scrap: 22, arms: 10 },
  };

  // the two of them: one would trade, one would take
  const FACTIONS = [
    {
      id: "ashford",
      name: "Ashford",
      kind: "town",
      home: "ashford",
      blurb: "a market town behind a palisade — they want bread, they have iron",
      give: { food: 30 },
      get: { scrap: 26, cloth: 6 },
    },
    {
      id: "warrens",
      name: "the Warrens",
      kind: "raiders",
      home: "warrens",
      blurb: "a camp cut into the quarry terraces — they take what they are not given",
      give: { food: 0 },
      get: {},
    },
  ];

  const People = {
    BAL,
    FACTIONS,

    def(id) {
      for (const f of FACTIONS) if (f.id === id) return f;
      return null;
    },

    create(seed) {
      const rng = ZS.rng32((seed | 0) ^ 0x5f3a);
      return {
        seed: seed | 0,
        list: FACTIONS.map((f) => ({
          id: f.id,
          opinion: 0.5 + (rng() - 0.5) * 0.16,
          anger: 0,
          met: 0, // 0 unknown · 1 heard of · 2 spoken with
          trades: 0,
          tributes: 0,
          refused: 0,
          raids: 0,
          cleared: 0,
          killed: 0,
        })),
        events: [], // the ones waiting on an answer
        raidIn: 0, // days until they come
        raidT: 0, // a raid is running
        next: 1,
      };
    },

    get(st, id) {
      for (const f of st.list) if (f.id === id) return f;
      return null;
    },

    word(op) {
      return op > 0.78
        ? "fast friends"
        : op > 0.6
          ? "well disposed"
          : op > 0.44
            ? "wary"
            : op > 0.28
              ? "cold"
              : op > 0.12
                ? "hostile"
                : "blood enemies";
    },

    /* ---------- the dawn ---------- */

    daily(scen) {
      const st = scen.fac;
      if (!st) return;
      for (const f of st.list) {
        const d = this.def(f.id);
        // opinions cool toward the middle, and never warm past the clearing
        f.opinion += (0.5 - f.opinion) * BAL.DRIFT;
        f.anger = Math.max(0, f.anger - 0.06);
        if (f.cleared) continue;
        // you know of them once their place has been scouted
        const site = scen.ow && ZS.Overworld ? ZS.Overworld.site(scen.ow, d.home) : null;
        if (site && site.seen >= 2 && f.met < 1) {
          f.met = 1;
          if (ZS.Chronicle)
            ZS.Chronicle.add(scen, "we know now that " + d.name + " is out there", "life");
        }
        if (!f.met) continue;
        if (d.kind === "town") {
          if (f.opinion >= BAL.CARAVAN_AT && scen.day % 4 === 0 && !this.hasEvent(st, "caravan"))
            this.pushEvent(st, "caravan", f.id, scen);
        } else if (f.opinion < BAL.DEMAND_AT && !this.hasEvent(st, "demand")) {
          this.pushEvent(st, "demand", f.id, scen);
        }
      }
      // the raid comes when it is due
      if (st.raidIn > 0) {
        st.raidIn--;
        const f = this.get(st, "warrens");
        if (st.raidIn <= 0 && f && !f.cleared) this.raid(scen);
      }
      // stale offers are withdrawn
      for (let i = st.events.length - 1; i >= 0; i--)
        if (scen.day - st.events[i].day > 3) st.events.splice(i, 1);
    },

    hasEvent(st, kind) {
      for (const e of st.events) if (e.kind === kind) return true;
      return false;
    },

    pushEvent(st, kind, fid, scen) {
      const d = this.def(fid);
      const ev = { id: st.next++, kind, faction: fid, day: scen.day };
      if (kind === "caravan") {
        ev.text = "a caravan out of " + d.name + " is at the gate";
        ev.give = { food: BAL.TRADE_GIVE };
        ev.get = { scrap: 26, cloth: 6 };
      } else if (kind === "demand") {
        ev.text = d.name + " want " + BAL.TRIBUTE + " food, or they will come for it";
        ev.give = { food: BAL.TRIBUTE };
      }
      st.events.push(ev);
      if (ZS.Chronicle) ZS.Chronicle.add(scen, ev.text, "people");
      if (ZS.VillageUI) ZS.VillageUI.toast(ev.text);
      return ev;
    },

    /* ---------- the answers ---------- */

    event(st, id) {
      for (const e of st.events) if (e.id === +id) return e;
      return null;
    },

    // the caravan: bread for iron
    trade(scen, id) {
      const st = scen.fac;
      const ev = this.event(st, id);
      if (!ev) return { ok: false, err: "they have gone" };
      for (const k in ev.give)
        if (scen.res[k] < ev.give[k]) return { ok: false, err: "not enough " + k };
      for (const k in ev.give) scen.res[k] -= ev.give[k];
      const got = [];
      for (const k in ev.get) {
        scen.res[k] = (scen.res[k] || 0) + ev.get[k];
        got.push(ev.get[k] + " " + k);
      }
      const f = this.get(st, ev.faction);
      f.opinion = ZS.clamp(f.opinion + 0.08, 0, 1);
      f.trades++;
      f.met = 2;
      st.events.splice(st.events.indexOf(ev), 1);
      if (ZS.Chronicle)
        ZS.Chronicle.add(
          scen,
          "traded with " + this.def(f.id).name + ": " + got.join(", "),
          "people",
        );
      if (ZS.sound) ZS.sound.event("v_callout", scen.hall.x, scen.hall.y);
      return { ok: true, got: got.join(", ") };
    },

    // the Warrens: pay them
    tribute(scen, id) {
      const st = scen.fac;
      const ev = this.event(st, id);
      if (!ev) return { ok: false, err: "they have gone" };
      if ((scen.res.food || 0) < ev.give.food) return { ok: false, err: "not enough food" };
      scen.res.food -= ev.give.food;
      const f = this.get(st, ev.faction);
      f.opinion = ZS.clamp(f.opinion + 0.14, 0, 1);
      f.tributes++;
      f.met = 2;
      st.raidIn = 0;
      st.events.splice(st.events.indexOf(ev), 1);
      const txt = "paid " + this.def(f.id).name + " " + ev.give.food + " food to go away";
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "people");
      if (ZS.VillageUI) ZS.VillageUI.toast("they took it, and they went");
      return { ok: true };
    },

    // or don't
    refuse(scen, id) {
      const st = scen.fac;
      const ev = this.event(st, id);
      if (!ev) return { ok: false, err: "they have gone" };
      const f = this.get(st, ev.faction);
      f.opinion = ZS.clamp(f.opinion - 0.18, 0, 1);
      f.anger = Math.min(1, f.anger + 0.3);
      f.refused++;
      f.met = 2;
      st.raidIn = Math.max(st.raidIn, BAL.RAID_IN);
      st.events.splice(st.events.indexOf(ev), 1);
      const txt =
        "refused " + this.def(f.id).name + " — they will come within " + st.raidIn + " days";
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "people");
      if (ZS.VillageUI) ZS.VillageUI.toast(txt);
      return { ok: true };
    },

    /* ---------- the raid ---------- */

    raid(scen) {
      const st = scen.fac;
      const f = this.get(st, "warrens");
      if (!f || f.cleared) return;
      f.raids++;
      st.raidT = 1;
      const n = BAL.RAID_N(scen.day);
      scen.spawnRaiders(n);
      const txt =
        f.raids === 1
          ? "the Warrens come down the road"
          : "the Warrens are back — " + n + " of them";
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "people");
      if (ZS.VillageUI) ZS.VillageUI.toast(txt);
      if (ZS.sound) ZS.sound.event("horn", scen.hall.x, scen.hall.y);
      if (scen.alarm) scen.alarm(txt);
    },

    // a raider reached the map edge with its arms full
    escaped(scen, a) {
      if (!a || !a.carry) return;
      const f = this.get(scen.fac, "warrens");
      const k = a.carry.kind,
        n = a.carry.n;
      if (!k || !n) return;
      scen.res[k] = Math.max(0, (scen.res[k] || 0) - n);
      if (ZS.Chronicle)
        ZS.Chronicle.add(scen, n + " " + k + " carried off by the Warrens", "people");
      if (ZS.VillageUI) ZS.VillageUI.toast(n + " " + k + " gone with them");
      if (f) f.opinion = ZS.clamp(f.opinion + 0.03, 0, 1);
    },

    // and one of them died in your green
    killed(scen) {
      const st = scen.fac;
      const f = this.get(st, "warrens");
      if (!f) return;
      f.killed++;
      f.opinion = ZS.clamp(f.opinion - 0.1, 0, 1);
      f.anger = Math.min(1, f.anger + 0.16);
    },

    // the raid is over: what is left of it went home
    over(scen) {
      const st = scen.fac;
      st.raidT = 0;
      st.raidIn = 0;
      const txt =
        scen.raidersKilled > 0
          ? "the Warrens broke — " + scen.raidersKilled + " of them left in the green"
          : "the Warrens took what they came for and went";
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "people");
      if (ZS.VillageUI) ZS.VillageUI.toast(txt);
      scen.raidersKilled = 0;
    },

    /* ---------- what the panel shows ---------- */

    // one line for the alert strip, when there is something to say
    alert(scen) {
      const st = scen.fac;
      if (!st) return null;
      if (scen.raiders && scen.raiders.length)
        return ["raid", scen.raiders.length + " from the Warrens are in the village"];
      const f = this.get(st, "warrens");
      if (f && !f.cleared && st.raidIn > 0)
        return [
          "raid",
          "the Warrens are coming — " + st.raidIn + " day" + (st.raidIn > 1 ? "s" : ""),
        ];
      for (const e of st.events) return ["trade", e.text];
      return null;
    },

    // the section of the valley panel that is about people
    lines(scen) {
      const out = [];
      const st = scen.fac;
      if (!st) return out;
      for (const f of st.list) {
        const d = this.def(f.id);
        if (!f.met) {
          out.push({ id: f.id, name: d.name, dim: 1, word: "someone is out there" });
          continue;
        }
        let w = this.word(f.opinion);
        if (f.cleared) w = "wiped out";
        out.push({
          id: f.id,
          name: d.name,
          word: w,
          op: Math.round(f.opinion * 100),
          blurb: d.blurb,
          cleared: f.cleared,
          raids: f.raids,
          trades: f.trades,
          tributes: f.tributes,
        });
      }
      return out;
    },
  };

  ZS.Factions = People;
})();
