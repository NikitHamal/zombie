/* The Hollow — the cure.
   Four steps, and each of them is somewhere you have to go: the physic's
   chest in the chapel, the physician's ledger in the manor, the cold box
   in the dead city, and then the long work in your own infirmary to make
   something of all three.

   It ends in a dose: a dose stops a bite dead. And the course ends in
   something larger — a village that puts its dead to bed and waits for a
   night that does not come.

   The steps gate research in the workshop (see RESEARCH in the scenario):
   you cannot study what you have not found. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  // what each step needs, in the order the village finds them
  const STEPS = [
    {
      id: "physic",
      name: "the physic's chest",
      site: "chapel",
      need: "worked",
      blurb: "a chest of physic in the chapel of Saint Wyn: herbs, instruments, a notebook",
      text: "out of the chapel: a chest of physic, and a notebook in a careful hand",
      research: "physic",
    },
    {
      id: "ledger",
      name: "the physician's ledger",
      site: "manor",
      need: "worked",
      blurb: "Vayle manor: somewhere in it, one physician wrote down everything he saw",
      text: "out of the manor: a physician's ledger, and it does not read like madness",
      research: "serum1",
    },
    {
      id: "coldbox",
      name: "the cold box",
      site: "city",
      need: "worked",
      blurb: "the dead city: a laboratory under it, and in the laboratory, a cold box",
      text: "out of the city: a case of glass, a cold box, and something still alive in it",
      research: "serum2",
    },
    {
      id: "dose",
      name: "the course",
      site: null,
      need: "brew",
      blurb: "the infirmary, level two, and cloth enough: brew it, and keep brewing it",
      text: "the first dose is drawn. It is not much. It is enough for one person.",
      research: "serum3",
    },
  ];

  const Cure = {
    STEPS,
    BAL: {
      DOSES: 2, // how many doses a finished course yields
      COURSE_CLOTH: 12, // and what a further course costs in cloth
      FINAL_DAYS: 3, // days of quiet before the plague is done
    },

    create() {
      return { step: 0, found: [], doses: 0, brewed: 0, quiet: 0, done: 0 };
    },

    def(id) {
      for (const s of STEPS) if (s.id === id) return s;
      return null;
    },

    // has this step been found yet?
    has(st, id) {
      return st && st.found.indexOf(id) >= 0;
    },

    // the step the village is working toward
    current(st) {
      for (const s of STEPS) if (!this.has(st, s.id)) return s;
      return null;
    },

    /* ---------- finding things ---------- */

    // a party came home from somewhere: did they bring a piece of the cure?
    onReturn(scen, siteId) {
      const st = scen.cure;
      if (!st || st.found.length >= STEPS.length) return null;
      const step = this.current(st);
      if (!step || step.site !== siteId) return null;
      // the dose step is brewed at home, not found
      if (step.need === "brew") return null;
      // it is there, but you have to survive the place to carry it out
      if (Math.random() > 0.62) {
        if (ZS.Chronicle)
          ZS.Chronicle.add(
            scen,
            "they searched " + ZS.Overworld.def(siteId).name + " and found nothing of it",
            "cure",
          );
        return null;
      }
      st.found.push(step.id);
      if (ZS.Chronicle) ZS.Chronicle.add(scen, step.text, "cure");
      if (ZS.VillageUI) ZS.VillageUI.toast(step.text);
      if (scen.logLine) scen.logLine(step.text);
      return step;
    },

    // can the workshop study this?
    gate(scen, researchId) {
      const st = scen.cure;
      if (!st) return { ok: false, err: "not yet" };
      for (const s of STEPS) {
        if (s.research !== researchId) continue;
        if (s.need === "brew") {
          const inf = scen._first ? scen._first("infirm") : null;
          if (!inf || inf.ruined || (inf.lvl || 1) < 2)
            return { ok: false, err: "it needs a level-two infirmary to brew in" };
          return { ok: true };
        }
        if (this.has(st, s.id)) return { ok: true };
        return { ok: false, err: "it needs " + s.name.toLowerCase() + " — " + s.blurb };
      }
      return { ok: true };
    },

    /* ---------- the dose ---------- */

    // a bite has run its course: is there a dose for them?
    dose(scen, a) {
      const st = scen.cure;
      if (!st || st.doses <= 0) return false;
      st.doses--;
      a.inf = 0;
      a.hp = Math.max(10, a.maxHp * 0.4);
      if (ZS.Chronicle) ZS.Chronicle.add(scen, a.name + " — the dose took", "cure");
      if (ZS.VillageUI) ZS.VillageUI.toast("the dose took — " + a.name + " will live");
      if (scen._pop) scen._pop(a.x, a.y - 30, "the dose", "#5a7a3a");
      return true;
    },

    // the course is studied: what it yields
    brewed(scen) {
      const st = scen.cure;
      if (!st) return;
      st.brewed++;
      st.doses += this.BAL.DOSES;
      const txt =
        st.brewed === 1
          ? "the first course is drawn — " + this.BAL.DOSES + " doses, and they will keep"
          : "another course: " + this.BAL.DOSES + " more doses";
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "cure");
      if (ZS.VillageUI) ZS.VillageUI.toast(txt);
    },

    /* ---------- the end of it ---------- */

    // called at every dawn once the course is known
    daily(scen) {
      const st = scen.cure;
      if (!st || st.done) return;
      if (!scen.done.serum3) return;
      st.quiet++;
      if (st.quiet < this.BAL.FINAL_DAYS) return;
      st.done = 1;
      const txt =
        "the last of it is poured away. Whatever comes tonight, it will not be the plague.";
      if (ZS.Chronicle) ZS.Chronicle.add(scen, txt, "cure");
      if (scen.curedEnding) scen.curedEnding();
    },

    // the panel's line: where the village is with it
    line(scen) {
      const st = scen.cure;
      if (!st) return null;
      if (st.done) return { done: 1, text: "the plague is done in this valley" };
      if (scen.done && scen.done.serum3)
        return {
          done: 0,
          doses: st.doses,
          text:
            st.doses > 0
              ? "the course is poured — " + st.doses + " doses in the chest"
              : "the course is known, but the chest is empty — study it again",
        };
      const step = this.current(st);
      if (!step)
        return { done: 0, doses: st.doses, text: "the course is known — " + st.doses + " doses" };
      return {
        step: step.id,
        text: step.need === "brew" ? step.blurb : "look in " + ZS.Overworld.def(step.site).name,
        name: step.name,
        doses: st.doses,
      };
    },
  };

  ZS.Cure = Cure;
})();
