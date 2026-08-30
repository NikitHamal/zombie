/* The other people, and the cure: a targeted smoke test.
   Raids that actually walk in and carry things off, a caravan you can
   trade with, a tribute you can refuse — and the four steps of the cure,
   from the chapel chest to the last night that is not a night.

   Run: node .verify/people-smoke.js */
"use strict";
const { ZS, G, frames } = require("./harness");

const fails = [];
function ok(label, cond, extra) {
  if (cond) console.log("  ok   " + label + (extra ? "  — " + extra : ""));
  else {
    console.log("  FAIL " + label + (extra ? "  — " + extra : ""));
    fails.push(label);
  }
}
function done() {
  if (fails.length) {
    console.log("\n" + fails.length + " FAILED: " + fails.join(" · "));
    process.exitCode = 1;
  } else console.log("\nall checks passed");
}

function today() {
  return G.day;
}
function untilDay(n, cap = 40000) {
  let f = 0;
  while (G.day < n && f < cap) {
    frames(1);
    f++;
    if (G.card) G.dismissCard();
  }
  return G.day >= n;
}
function dismiss() {
  if (G.card) G.dismissCard();
}

/* ---------- boot ---------- */
frames(240);
ok("the village is standing", G.villagers().length > 0, G.villagers().length + " souls");
ok(
  "the other people exist",
  G.fac && G.fac.list.length === 2,
  G.fac ? G.fac.list.length + " factions" : "none",
);
ok("the cure has not started", G.cure && G.cure.found.length === 0);
ok(
  "ten places in the valley",
  ZS.Overworld.SITES.length === 10,
  ZS.Overworld.SITES.map((s) => s.id).join(","),
);
ok(
  "both settlements are out there",
  !!ZS.Overworld.def("ashford") && !!ZS.Overworld.def("warrens"),
);

/* ---------- the cure is gated on what you have found ---------- */
{
  const list = G.researchList().map((r) => r.id);
  ok("the physic is not on the list yet", list.indexOf("physic") < 0, list.join(","));
  const locked = G.researchLocked().map((r) => r.id);
  ok("and it is shown as locked instead", locked.indexOf("physic") >= 0, locked.join(","));

  // find it: the way the game finds it
  let found = 0;
  for (let i = 0; i < 60 && !found; i++) found = ZS.Cure.onReturn(G, "chapel") ? 1 : 0;
  ok("the chapel gives up the physic's chest", !!found, "found: " + G.cure.found.join(","));
  const l2 = G.researchList().map((r) => r.id);
  ok("and now it can be studied", l2.indexOf("physic") >= 0, l2.join(","));

  // the next step is somewhere else entirely
  let sp = null;
  for (let i = 0; i < 60 && !sp; i++) sp = ZS.Cure.onReturn(G, "chapel");
  ok("the chapel has nothing more to give", !sp);
  for (let i = 0; i < 60 && !sp; i++) sp = ZS.Cure.onReturn(G, "manor");
  ok("the manor gives up the ledger", !!sp, G.cure.found.join(","));
  sp = null;
  for (let i = 0; i < 60 && !sp; i++) sp = ZS.Cure.onReturn(G, "city");
  ok("the city gives up the cold box", !!sp, G.cure.found.join(","));

  // the dose itself is brewed at home
  const gate0 = ZS.Cure.gate(G, "serum3");
  ok("the course needs a level-two infirmary", !gate0.ok, gate0.err || "");
}

/* ---------- a caravan, and a trade ---------- */
{
  const before = G.res.scrap;
  const food0 = G.res.food;
  ZS.Factions.pushEvent(G.fac, "caravan", "ashford", G);
  dismiss();
  const ev = G.fac.events[G.fac.events.length - 1];
  ok("a caravan is waiting on an answer", ev && ev.kind === "caravan", ev ? ev.text : "none");
  ok("the panel shows it", ZS.VillageUI.peopleBlock(G).indexOf("caravan") >= 0);
  const r = ZS.Factions.trade(G, ev.id);
  ok("the trade goes through", r.ok, r.err || r.got || "");
  ok(
    "the bread is gone and the iron is here",
    G.res.scrap > before && G.res.food < food0,
    "scrap " + before + "→" + G.res.scrap + " · food " + food0 + "→" + G.res.food,
  );
  ok("they think better of us for it", ZS.Factions.get(G.fac, "ashford").trades === 1);
  ok("and the offer is spent", G.fac.events.length === 0);
}

/* ---------- a demand, refused ---------- */
{
  const w = ZS.Factions.get(G.fac, "warrens");
  w.met = 2;
  w.opinion = 0.3;
  ZS.Factions.pushEvent(G.fac, "demand", "warrens", G);
  dismiss();
  const ev = G.fac.events[G.fac.events.length - 1];
  ok("the Warrens ask for bread", ev && ev.kind === "demand", ev ? ev.text : "none");
  const op0 = w.opinion;
  ZS.Factions.refuse(G, ev.id);
  ok("refusing sours them", w.opinion < op0, op0.toFixed(2) + " → " + w.opinion.toFixed(2));
  ok("and names the day", G.fac.raidIn > 0, G.fac.raidIn + " days");
}

/* ---------- the raid ---------- */
{
  const souls0 = G.villagers().length;
  // watch for them: a raid comes and goes inside a day
  let saw = null,
    stores0 = 0,
    f = 0;
  while (f < 24000 && !(saw && G.raiders.length === 0)) {
    frames(1);
    f++;
    dismiss();
    if (!saw && G.raiders.length) {
      saw = G.raiders.slice();
      stores0 = G.res.food + G.res.scrap + G.res.wood;
    }
  }
  ok("the raid came", !!saw, saw ? saw.length + " of them" : "nobody came in " + f + " frames");
  ok("they are people, not the dead", saw && saw.length > 0 && saw.every((a) => a.st === 3));
  ok("and the village knows they are hostile", saw && saw.every((a) => G.hostile(a)));
  ok("the raid resolves", G.raiders.length === 0, f + " frames");
  frames(4);
  dismiss();
  ok("and the raid is over in the bookkeeping", G.fac.raidT === 0);
  const after = G.res.food + G.res.scrap + G.res.wood;
  const killed = ZS.Factions.get(G.fac, "warrens").killed; // the running tally
  ok(
    "something happened: blood or a lighter larder",
    killed > 0 || (saw && after < stores0),
    killed + " down · stores " + Math.round(stores0) + " → " + Math.round(after),
  );
  ok(
    "the village is still here",
    G.villagers().length > 0 || souls0 === 0,
    G.villagers().length + " left",
  );
  ok(
    "the raid is in the ledger",
    ZS.Chronicle.entries(G).some((e) => e.kind === "people"),
  );
}

/* ---------- the theft itself ---------- */
{
  G.res.food = 200;
  G.spawnRaiders(1);
  const r = G.raiders[G.raiders.length - 1];
  r.x = G.hall.x + G.hall.w / 2 + 20;
  r.y = G.hall.y + G.hall.h / 2;
  r.atkT = 6; // not here to fight: here for the larder
  const t0 = ZS.Factions.BAL.STEAL_T;
  ZS.Factions.BAL.STEAL_T = 0.05;
  const food0 = G.res.food;
  let f = 0;
  while (!r.carry && f < 240) {
    frames(1);
    f++;
    dismiss();
  }
  ZS.Factions.BAL.STEAL_T = t0;
  ok(
    "they take what they can carry",
    !!r.carry,
    r.carry ? r.carry.n + " " + r.carry.kind : "nothing in " + f,
  );
  ok("and the larder is lighter for it", G.res.food < food0, food0 + " → " + G.res.food);
  if (r.carry) {
    const f1 = G.res.food;
    ZS.Factions.escaped(G, r);
    ok(
      "what reaches the road is gone for good",
      G.res.food === f1 - r.carry.n,
      f1 + " → " + G.res.food,
    );
  }
  r.gone = true;
  G.raiders.length = 0;
  G.fac.raidT = 0;
}

/* ---------- paying them off ---------- */
{
  const w = ZS.Factions.get(G.fac, "warrens");
  w.cleared = 0;
  G.res.food = 200;
  ZS.Factions.pushEvent(G.fac, "demand", "warrens", G);
  dismiss();
  const ev = G.fac.events[G.fac.events.length - 1];
  const op0 = w.opinion;
  const r = ZS.Factions.tribute(G, ev.id);
  ok("paying them works", r.ok, r.err || "");
  ok(
    "and buys quiet",
    w.opinion > op0 && G.fac.raidIn === 0,
    op0.toFixed(2) + " → " + w.opinion.toFixed(2),
  );
}

/* ---------- a dose ---------- */
{
  G.cure.doses = 2;
  const a = G.villagers()[0];
  a.inf = 20;
  a.hp = 4;
  const used = ZS.Cure.dose(G, a);
  ok("a dose stops a bite", used && a.inf === 0, "inf " + a.inf);
  ok("and there is one fewer of them", G.cure.doses === 1);
  ok("and they are not dead", a.hp > 0, "hp " + Math.round(a.hp));
}

/* ---------- the end of it ---------- */
{
  G.done.serum3 = true;
  ZS.Cure.brewed(G);
  ok("a course yields doses", G.cure.doses >= 2, G.cure.doses + " doses");
  for (let i = 0; i < ZS.Cure.BAL.FINAL_DAYS; i++) ZS.Cure.daily(G);
  ok("the plague is finished", G.cure.done === 1);
  ok("and the village is cured", G.cured === 1);
  ok("and there is a card for it", !!G.card, G.card ? G.card.title : "none");

  // the night after: nothing comes
  G.cured = 1;
  const n0 = G.queue ? G.queue.length : 0;
  G.dismissCard();
  G._startNight(false);
  ok("nothing comes out of the wood", G.queue.length === 0, n0 + " → " + G.queue.length);
}

/* ---------- the panel, in one piece ---------- */
{
  const h = ZS.VillageUI.worldPanel();
  ok("the valley panel has the people in it", h.indexOf("other people") >= 0);
  ok("and the cure", h.indexOf("the cure") >= 0);
  const w = ZS.VillageUI.researchPanel();
  ok("the workshop panel builds", w.indexOf("workshop") >= 0);
  ok(
    "and lists the studies, or says why there are none",
    w.indexOf("<kbd>") >= 0 || w.indexOf("build a workshop") >= 0,
  );
}

/* ---------- generations: houses, inheritance, and the book of them ---------- */
{
  const K = ZS.Kin;
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      frames(1);
      if (G.card) G.dismissCard();
    }
  };
  ok("the kin keep houses", typeof K.full === "function" && typeof K.houses === "function");

  // every soul in the village has a name the village knows them by
  const named = G.villagers().filter((a) => K.full(a) && K.full(a).indexOf(" ") > 0);
  ok(
    "they carry a house",
    named.length === G.villagers().length,
    named.length + "/" + G.villagers().length + " named",
  );
  ok(
    "and a generation",
    G.villagers().every((a) => K.generation(a) >= 1),
    K.generationWord(G.villagers()[0]),
  );

  // a child takes its mother's house, and more often than not her nature
  const mother = G.villagers().find((a) => !(a.kin && a.kin.child));
  mother.kin.house = mother.kin.house || "Alder";
  mother.kin.gen = mother.kin.gen || 1;
  const k = K.born(mother, G.day);
  ok("a child is born into its mother's house", k.house === mother.kin.house, k.house);
  ok("and into the next generation", k.gen === (mother.kin.gen || 1) + 1, "gen " + k.gen);
  let same = 0;
  for (let i = 0; i < 60; i++) if (K.born(mother, G.day).trait === mother.kin.trait) same++;
  ok("and takes after her more often than not", same > 20 && same < 55, same + " of 60");

  // the book of the families
  K.note(G, mother);
  ok(
    "the lineage is written",
    (G.line || []).some((r) => r.n === mother.name),
  );
  K.bury(G, mother);
  ok(
    "and finished when they die",
    (G.line || []).find((r) => r.n === mother.name).d === G.day,
    "died day " + G.day,
  );
  const houses = K.houses(G);
  ok("the houses can be counted", houses.length > 0, houses.map((h) => h.house).join(", "));
  ok(
    "each with the living and the dead",
    houses.every((h) => Array.isArray(h.live)),
  );

  // it goes with the save
  const s = G.serialize();
  ok(
    "the book is saved",
    Array.isArray(s.line) && s.line.length === (G.line || []).length,
    (s.line || []).length + " entries",
  );

  // and the record panel shows it
  G.openChron();
  step(4);
  const h = ZS.VillageUI.html.panel || "";
  ok("the record shows the families", /the families/.test(h), h.length + " chars");
  G.cancelMode();
  step(2);
}

/* ---------- round trip ---------- */
{
  const s = G.serialize();
  ok("the save carries the other people", !!s.fac && !!s.cure, s.v ? "v" + s.v : "");
  ok("and the cure", s.cure && s.cure.found.length === 3, (s.cure ? s.cure.found : []).join(","));
  ok("and that the plague is done", s.cured === 1);
  const html = ZS.VillageUI.worldPanel();
  ok("the panel survives it all", html.length > 100, html.length + " chars");
}

done();
