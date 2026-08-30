/* The Hollow — the ages.
   A village becomes a civilisation in five steps, and each one is a thing
   you can see from the green: a hall with an upper floor, a barracks with
   a yard, a smithy that never goes cold, a foundry with a chimney, an
   airfield with a windsock. The age is not a number you earn — it is what
   the village has become, and it decides what it may build and whom it
   may put in the field.

   Nothing here allocates per frame; `of(scen)` is called a few times a
   day and cached by the caller. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  // need(): what has to be standing (and known) before the village is this
  const AGES = [
    {
      id: "refuge",
      name: "a refuge",
      short: "refuge",
      desc: "four people and a roof that leaks. Clubs, spears, and a door.",
      need: () => true,
    },
    {
      id: "manor",
      name: "a manor",
      short: "manor",
      desc: "the hall has an upper floor and there is a barracks in the yard. Bows, horses and plate.",
      need: (s) => s.hall.lvl >= 2 && s.has("barracks"),
    },
    {
      id: "forge",
      name: "a forge",
      short: "forge",
      desc: "a smithy that never goes cold, and powder that stays dry. Muskets and cannon.",
      need: (s) => s.has("smith") && s.done.gunpowder,
    },
    {
      id: "foundry",
      name: "a foundry",
      short: "foundry",
      desc: "iron poured in quantity. Machine guns, and a tank in the yard.",
      need: (s) => s.has("foundry") && s.done.mechanised,
    },
    {
      id: "sky",
      name: "an airfield",
      short: "airfield",
      desc: "a strip of mown grass and a windsock. The dead cannot reach you up there.",
      need: (s) => s.has("airfield") && s.done.flight,
    },
  ];

  const Ages = {
    AGES,

    index(scen) {
      let i = 0;
      for (let k = 0; k < AGES.length; k++) {
        try {
          if (AGES[k].need(scen)) i = k;
        } catch {
          // a building or a research id that does not exist yet: not this age
        }
      }
      return i;
    },

    def(id) {
      for (const a of AGES) if (a.id === id) return a;
      return AGES[0];
    },

    of(scen) {
      return AGES[this.index(scen)];
    },

    at(scen, id) {
      return this.index(scen) >= this.rank(id);
    },

    rank(id) {
      for (let i = 0; i < AGES.length; i++) if (AGES[i].id === id) return i;
      return 0;
    },

    // the next step, for the panel: what it is and what it wants
    next(scen) {
      const i = this.index(scen);
      if (i >= AGES.length - 1) return null;
      const a = AGES[i + 1];
      return { def: a, want: this.want(scen, a.id) };
    },

    // what is missing, in the village's own words
    want(scen, id) {
      const bits = [];
      if (id === "manor") {
        if (scen.hall.lvl < 2) bits.push("the hall raised to level 2");
        if (!scen.has("barracks")) bits.push("a barracks");
      } else if (id === "forge") {
        if (!scen.has("smith")) bits.push("a smithy");
        if (!scen.done.gunpowder) bits.push("the study of powder");
      } else if (id === "foundry") {
        if (!scen.has("foundry")) bits.push("a foundry");
        if (!scen.done.mechanised) bits.push("the study of engines");
      } else if (id === "sky") {
        if (!scen.has("airfield")) bits.push("an airfield");
        if (!scen.done.flight) bits.push("the study of flight");
      }
      return bits;
    },
  };

  ZS.Ages = Ages;
})();
