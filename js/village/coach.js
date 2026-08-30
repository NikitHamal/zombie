/* The Hollow — the coach.

   Onboarding, in the game's own voice: one short lesson at a time, and
   only when the thing it is about has happened or is about to. Nothing is
   shown twice; the record keeps what has been said (and the steward is
   offered the moment the village is big enough to need one).

   `Coach.daily(scen)` runs at dawn; `Coach.line(scen)` is what the hint
   bar shows while there is a lesson waiting to be acted on. */
(() => {
  "use strict";
  const ZS = window.ZS;

  const BAL = {
    ONE_A_DAY: 1, // never more than this at a dawn
  };

  // in order: the first thing you need is a pair of hands, and the last
  // thing you need is to be told twice
  const LESSONS = [
    {
      id: "work",
      when: (s) => s.day >= 1,
      txt: "click a villager, then press a letter to give them work — L is a labourer, and a labourer takes whatever needs doing.",
    },
    {
      id: "build",
      when: (s) => s.day >= 1 && s.world.buildings.some((b) => !b.built),
      txt: "B marks out a building; click the ground to set it down. It goes up on its own once somebody is set to build.",
    },
    {
      id: "night",
      when: (s) => s.day >= 2,
      txt: "the dead come at night. A wall and a few hands on the watch (G) are worth more than another hut.",
    },
    {
      id: "wall",
      when: (s) => s.day >= 2 && s.world.buildings.filter((b) => b.kind === "wall").length < 4,
      txt: "you can drag with a wall armed to lay a whole line of palisade in one go.",
    },
    {
      id: "valley",
      when: (s) => s.day >= 3 && s.ow,
      txt: "M is the valley. Send a party out — they bring back what the hollow cannot make for itself.",
    },
    {
      id: "hungry",
      when: (s) => s.res.food < s._upkeep() * 2,
      txt: "the larder is thin. F sends a forager, M sows a plot, and a feast (the record, L) lifts them when the heart is going.",
    },
    {
      id: "study",
      when: (s) => s.day >= 4,
      txt: "T is the workshop. That is where the village learns — sharper tools first, then spears.",
    },
    {
      id: "heal",
      when: (s) => s.villagers().some((a) => a.hp < a.maxHp * 0.6 || a.inf > 0),
      txt: "somebody is hurt. An infirmary, and a healer (C), is the difference between a wound and a grave.",
    },
    {
      id: "field",
      when: (s) => ZS.Units && ZS.Units.cap(s) > 0,
      txt: "A is the field: raise soldiers, then click the ground to place the line. They eat before anybody else does.",
    },
    {
      id: "world",
      when: (s) => s.nat && s.nat.list.some((f) => f.met),
      txt: "D is the world beyond. Speak to them before they come to speak to you — envoys are cheaper than wars.",
    },
    {
      id: "steward",
      when: (s) => s.day >= 6,
      txt: "P puts the steward in charge. He sets the work, raises and mends, and tells you what he did. P again takes it back.",
    },
    {
      id: "bite",
      when: (s) => s.villagers().some((a) => a.inf > 0),
      txt: "a bite is a death sentence unless the village finds the physic's chest. Parties, then the chapel — and then the workshop.",
    },
    {
      id: "winter",
      when: (s) => s.season && s.season.id === "winter",
      txt: "winter: the plots sleep and the wood burns twice as fast. Lay in timber in the autumn, or somebody freezes.",
    },
  ];

  const Coach = {
    BAL,
    LESSONS,

    create() {
      return { seen: [], now: null };
    },

    load(scen, s) {
      const c = (scen.coach = this.create());
      if (!s) return c;
      c.seen = Array.isArray(s.seen) ? s.seen.slice() : [];
      c.now = s.now || null;
      return c;
    },

    save(scen) {
      const c = scen.coach || this.create();
      return { seen: c.seen.slice(), now: c.now || null };
    },

    def(id) {
      for (const l of LESSONS) if (l.id === id) return l;
      return null;
    },

    // the lesson waiting to be acted on, if any
    line(scen) {
      const c = scen.coach;
      if (!c || !c.now) return null;
      const l = this.def(c.now);
      return l ? l.txt : null;
    },

    // one at a dawn, the first one whose moment has come
    daily(scen) {
      const c = scen.coach;
      if (!c || scen.over) return null;
      let given = 0;
      for (const l of LESSONS) {
        if (given >= BAL.ONE_A_DAY) break;
        if (c.seen.indexOf(l.id) >= 0) continue;
        let yes = false;
        try {
          yes = !!l.when(scen);
        } catch {
          yes = false;
        }
        if (!yes) continue;
        c.seen.push(l.id);
        c.now = l.id;
        given++;
        if (ZS.Chronicle) ZS.Chronicle.add(scen, l.txt, "note");
        if (ZS.VillageUI) {
          ZS.VillageUI.toast(l.txt);
          ZS.VillageUI.refresh(true);
        }
        if (scen.logLine) scen.logLine(l.txt);
      }
      return given ? c.now : null;
    },
  };

  ZS.Coach = Coach;
})();
