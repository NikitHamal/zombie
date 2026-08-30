/* The Hollow — the people.
   A villager is not a number with a job: they are born here or they walk
   in, they have a trait and a temper, they remember what they saw, they
   grieve when the village loses somebody, and if there is food, room and
   a little hope, they have children who grow up into the work.

   Everything this file decides is a multiplier the simulation reads:
     speed · work · carry · fight · fear · health · birth chance
   so the rest of the game never has to know why a number moved. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const TRAITS = [
    {
      id: "brave",
      name: "brave",
      desc: "stands where the others run",
      fight: 1.25,
      fear: 0.7,
      spd: 1,
      work: 1,
      hp: 1.05,
    },
    {
      id: "quick",
      name: "quick",
      desc: "gets there first, gets away first",
      fight: 1,
      fear: 1,
      spd: 1.14,
      work: 1.05,
      hp: 0.95,
    },
    {
      id: "strong",
      name: "strong",
      desc: "carries more, tires later",
      fight: 1.1,
      fear: 1,
      spd: 0.96,
      work: 1.16,
      carry: 1.25,
      hp: 1.1,
    },
    {
      id: "clever",
      name: "clever",
      desc: "learns fast, mends fast",
      fight: 0.95,
      fear: 1.05,
      spd: 1,
      work: 1,
      study: 1.3,
      heal: 1.3,
      hp: 0.95,
    },
    {
      id: "steady",
      name: "steady",
      desc: "nerves of oak — never bolts",
      fight: 1.15,
      fear: 0.35,
      spd: 1,
      work: 1.05,
      hp: 1.05,
    },
    {
      id: "kind",
      name: "kind",
      desc: "the others work better for knowing them",
      fight: 0.9,
      fear: 1,
      spd: 1,
      work: 1,
      heal: 1.5,
      rally: 1,
      hp: 1,
    },
    {
      id: "frail",
      name: "frail",
      desc: "will not last a scratch, but works like two",
      fight: 0.8,
      fear: 1.3,
      spd: 1.06,
      work: 1.14,
      hp: 0.7,
    },
    {
      id: "stubborn",
      name: "stubborn",
      desc: "finishes what they started",
      fight: 1,
      fear: 0.6,
      spd: 0.98,
      work: 1.2,
      hp: 1,
    },
  ];

  const GROW = 6; // days from birth to working age

  const Kin = {
    TRAITS,
    GROW,

    // the record that rides on the agent
    make(rng, day) {
      const t = TRAITS[(rng() * TRAITS.length) | 0];
      return {
        trait: t.id,
        age: 14 + ((rng() * 30) | 0),
        born: day || 1,
        child: false,
        grow: 0,
        morale: 0.72,
        mem: [],
        kids: 0,
        worked: 0,
        nights: 0,
        kills: 0,
        saved: 0,
      };
    },

    // a child: small, useless for now, and the whole village's stake in
    // being alive next year
    born(mother, day) {
      return {
        trait: TRAITS[(Math.random() * TRAITS.length) | 0].id,
        age: 0,
        born: day,
        child: true,
        grow: 0,
        morale: 0.8,
        mem: ["born in the hollow"],
        kids: 0,
        worked: 0,
        nights: 0,
        kills: 0,
        saved: 0,
        mother: mother ? mother.name : null,
      };
    },

    trait(a) {
      const k = a.kin;
      if (!k) return null;
      for (const t of TRAITS) if (t.id === k.trait) return t;
      return null;
    },

    /* ---------- the multipliers the simulation reads ---------- */

    speed(a) {
      const t = this.trait(a);
      const k = a.kin;
      let m = t ? t.spd : 1;
      if (k && k.child) m *= 0.8;
      if (k) m *= 0.94 + k.morale * 0.12;
      return m;
    },
    work(a) {
      const t = this.trait(a);
      const k = a.kin;
      let m = t ? t.work : 1;
      if (k && k.child) m *= 0.45;
      if (k) m *= 0.88 + k.morale * 0.24;
      return m;
    },
    carry(a) {
      const t = this.trait(a);
      return (t && t.carry) || 1;
    },
    fight(a) {
      const t = this.trait(a);
      let m = (t && t.fight) || 1;
      const k = a.kin;
      // the ones who have stood before stand better
      if (k) m *= 1 + Math.min(0.3, (k.kills || 0) * 0.02);
      return m;
    },
    fear(a) {
      const t = this.trait(a);
      const k = a.kin;
      let m = (t && t.fear) || 1;
      if (k) m *= 1.28 - k.morale * 0.3;
      if (k && k.child) m *= 1.5;
      return m;
    },
    hp(a) {
      const t = this.trait(a);
      let m = (t && t.hp) || 1;
      if (a.kin && a.kin.child) m *= 0.55;
      return m;
    },
    study(a) {
      const t = this.trait(a);
      return (t && t.study) || 1;
    },
    heal(a) {
      const t = this.trait(a);
      return (t && t.heal) || 1;
    },
    // can this person hold a weapon tonight?
    adult(a) {
      return !(a.kin && a.kin.child);
    },

    /* ---------- memory ---------- */

    remember(a, txt) {
      const k = a.kin;
      if (!k) return;
      if (k.mem.length && k.mem[k.mem.length - 1] === txt) return;
      k.mem.push(txt);
      if (k.mem.length > 6) k.mem.shift();
    },
    rememberAll(scen, txt, near) {
      for (const a of scen.villagers()) {
        if (near && near(a)) continue;
        this.remember(a, txt);
      }
    },

    /* ---------- morale ---------- */

    // the village's spirits: food, grief, shelter, and a place to grieve
    villageMorale(scen) {
      const pop = scen.villagers().length || 1;
      const feed = scen.res.food / Math.max(1, pop * 8);
      let m = 0.42 + ZS.clamp(feed, 0, 1.2) * 0.3;
      if (scen.res.food <= 0) m -= 0.35;
      m -= ZS.clamp(scen.grief || 0, 0, 1) * 0.3;
      const shrine = scen.count("shrine");
      if (shrine) m += 0.1 * shrine;
      const hurt = scen.world.buildings.filter((b) => b.built && b.hp < b.maxHp * 0.4).length;
      m -= ZS.clamp(hurt * 0.06, 0, 0.24);
      if (scen.haz && scen.haz.despair > 0) m -= scen.haz.despair * 0.25;
      if (scen.winterT) m -= 0.06;
      return ZS.clamp(m, 0, 1);
    },

    tick(scen, dt) {
      const vm = this.villageMorale(scen);
      scen.morale = vm;
      const list = scen.villagers();
      for (const a of list) {
        const k = a.kin;
        if (!k) continue;
        // drift toward the village's spirits; a kind neighbour lifts it
        let target = vm;
        if (a.hp < a.maxHp * 0.4) target -= 0.18;
        if (scen.hungry > 0) target -= 0.2;
        if (a.inf > 0) target -= 0.25;
        for (const b of list) {
          if (b === a || !b.kin) continue;
          const t = this.trait(b);
          if (t && t.rally) target += 0.04;
        }
        k.morale += (ZS.clamp(target, 0, 1) - k.morale) * Math.min(1, dt * 0.12);
      }
    },

    // one dawn: births, ages, and the grief that fades
    daily(scen) {
      for (const a of scen.villagers()) {
        if (!a.kin) continue;
        a.kin.age += 1 / 365;
        if (a.kin.child) {
          a.kin.grow += 1;
          if (a.kin.grow >= GROW) {
            a.kin.child = false;
            a.kin.age = GROW + 6;
            this.remember(a, "came of age");
            if (scen.logLine) scen.logLine(a.name + " is old enough to work");
          }
        } else a.kin.nights++;
      }
      scen.grief = Math.max(0, (scen.grief || 0) - 0.16);
      // a birth: food, room, two adults, and a little hope
      const pop = scen.villagers().length;
      const spare = scen.popCap() - pop;
      const adults = scen.villagers().filter((a) => !a.kin || !a.kin.child).length;
      if (spare >= 1 && adults >= 2 && scen.res.food > 40 && (scen.morale || 0.5) > 0.55) {
        const chance = 0.14 * Math.min(2, spare) * (scen.morale || 0.5);
        if (Math.random() < chance) return this.birth(scen);
      }
      return null;
    },

    birth(scen) {
      const adults = scen.villagers().filter((a) => !a.kin || !a.kin.child);
      if (adults.length < 2) return null;
      const mother = adults[(Math.random() * adults.length) | 0];
      const k = this.born(mother, scen.day);
      if (mother.kin) mother.kin.kids++;
      scen.res.food -= 8;
      const a = scen.joinVillager(false, k);
      if (a) {
        for (const v of scen.villagers())
          if (v !== a) v.kin.morale = Math.min(1, v.kin.morale + 0.14);
        scen.grief = Math.max(0, (scen.grief || 0) - 0.3);
        if (scen.logLine) scen.logLine("a child is born — " + a.name + ", to " + mother.name);
      }
      return a;
    },

    // somebody died
    mourn(scen, a) {
      scen.grief = ZS.clamp((scen.grief || 0) + (a.kin && a.kin.child ? 0.5 : 0.34), 0, 1);
      scen.griefFor = a.name;
      for (const v of scen.villagers()) {
        if (v === a || !v.kin) continue;
        v.kin.morale = Math.max(0, v.kin.morale - 0.2);
        if (v.kin.mother === a.name) {
          v.kin.morale = Math.max(0, v.kin.morale - 0.25);
          this.remember(v, "lost " + a.name);
        } else if (v.kin.kids && a.kin && a.kin.mother === v.name) {
          v.kin.morale = Math.max(0, v.kin.morale - 0.3);
          this.remember(v, "buried a child");
        }
      }
      if (scen.logLine) scen.logLine(a.name + " is dead");
    },

    /* ---------- the card ---------- */

    describe(a) {
      const t = this.trait(a);
      const k = a.kin;
      if (!k) return "";
      const bits = [];
      if (k.child) bits.push("a child");
      else bits.push(Math.floor(k.age) + " years");
      if (t) bits.push(t.name);
      if (k.morale < 0.3) bits.push("broken");
      else if (k.morale < 0.5) bits.push("low");
      else if (k.morale > 0.82) bits.push("good heart");
      if (k.kills > 2) bits.push(k.kills + " kills");
      return bits.join(" · ");
    },
  };

  ZS.Kin = Kin;
})();
