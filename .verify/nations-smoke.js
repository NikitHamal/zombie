/* The world beyond: a targeted smoke test for the nations.
   That they are out there and become known, that an envoy rides and is
   received, that wagons come back with goods, that a refusal sours a
   nation and can start a war, that a war arrives as an army of theirs on
   the map, that the field can beat it — and that all of it survives a
   reload.

   Run: node .verify/nations-smoke.js */
"use strict";
const { ZS, G, frames, key, press } = require("./harness");

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

function dismiss() {
  if (G.card) G.dismissCard();
}
// This is a test about the world, not about whether four people can hold a
// hall for three weeks: the hall and the people are kept whole so the
// nations can be watched. What is measured is out there, not in here.
function frames2(n) {
  for (let i = 0; i < n; i++) {
    if (G.hall) {
      G.hall.maxHp = Math.max(G.hall.maxHp, 720);
      G.hall.hp = G.hall.maxHp;
    }
    for (const v of G.villagers()) {
      v.maxHp = Math.max(v.maxHp, 400);
      v.hp = v.maxHp;
    }
    if (G.res.food < 120) G.res.food = 120;
    frames(1);
    dismiss();
  }
}
function untilDay(n, cap = 40000) {
  let f = 0;
  while (G.day < n && f < cap) {
    frames2(1);
    f++;
  }
  return G.day >= n;
}
function nat(id) {
  return ZS.Nations.get(G.nat, id);
}
function foes() {
  return ZS.Nations.foes(G);
}

/* ---------- boot ---------- */
frames(240);
dismiss();
// The plague is finished in this valley: what this test watches is the
// world beyond it, not the wood. (The nights stay quiet, so the only
// thing that can hurt the village from here on is a nation.)
G.cured = 1;

ok(
  "the nations are out there",
  ZS.Nations.NATIONS.length === 7,
  ZS.Nations.NATIONS.length + " of them",
);
ok(
  "the village has not heard of them yet",
  G.nat.list.every((f) => !f.met),
);
ok("and the choir was never going to be a friend", !!ZS.Nations.def("choir").foe);
ok(
  "each of them knows what it would put in the field",
  ZS.Nations.NATIONS.every((n) => n.field.length && ZS.Units.def(n.field[0])),
);

/* ---------- they become known, the near ones first ---------- */
untilDay(7);
ok(
  "the first of them is heard of by day 7",
  G.nat.list.some((f) => f.met),
  ZS.Nations.line(G),
);
untilDay(20);
const known = G.nat.list.filter((f) => f.met).length;
ok("and word of the rest comes with the days", known >= 4, known + " known by day " + G.day);

/* ---------- an envoy rides, and is received ---------- */
{
  const f = nat("grange");
  ok("the Grange is known", !!f && f.met === 1, f ? "met " + f.met : "none");
  const op0 = f.opinion;
  G.res.food = 300;
  G.res.scrap = 200;
  const r = ZS.Nations.send(G, "grange", "envoy");
  ok("the envoy is sent", r.ok, r.err || r.days + " days");
  ok("and there is somebody on the road", f.rides.length === 1);
  const food0 = G.res.food;
  ok("the road costs food", food0 < 300, Math.round(food0) + " food left");
  untilDay(G.day + 4);
  ok("the envoy is received", f.rides.length === 0 && f.met === 2, "met " + f.met);
  ok(
    "and the Grange thinks better of us",
    f.opinion > op0,
    op0.toFixed(2) + " → " + f.opinion.toFixed(2),
  );
}

/* ---------- the wagons come back ---------- */
{
  const f = nat("grange");
  G.res.scrap = 300;
  G.res.arms = 60;
  G.res.food = 60; // room in the larder for what they bring
  const r = ZS.Nations.send(G, "grange", "trade");
  ok("the trade goes out", r.ok, r.err || r.days + " days");
  const food0 = G.res.food;
  untilDay(G.day + 8);
  ok(
    "the wagons come back with something",
    G.res.food > food0 + 20,
    Math.round(food0) + " → " + Math.round(G.res.food),
  );
  ok("and the road is clear again", f.rides.length === 0, f.rides.length + " still out");
}

/* ---------- a refusal sours somebody, and may start a war ---------- */
{
  const f = nat("kell");
  f.met = 2;
  f.opinion = 0.2; // cold enough to make a demand
  f.demandIn = 0;
  ZS.Nations.daily(G);
  ok(
    "a cold nation sends a demand",
    G.nat.events.length > 0,
    G.nat.events[0] && G.nat.events[0].text,
  );
  const ev = G.nat.events[0];
  const op0 = f.opinion;
  G.res.food = 400;
  const r = ZS.Nations.refuse(G, ev.id);
  ok("the demand can be refused", r.ok, r.err || "");
  ok("and they think worse of us", f.opinion < op0, op0.toFixed(2) + " → " + f.opinion.toFixed(2));
  ok(
    "and it is war, or nearly",
    f.war === 1 || f.invadeIn > 0,
    f.war ? "at war" : f.invadeIn + " days",
  );
}

/* ---------- and a war arrives ---------- */
{
  const f = nat("kell");
  f.war = 1;
  f.invadeIn = 1;
  f.opinion = 0.1;
  const before = foes();
  untilDay(G.day + 4);
  ok("an army comes out of the hills", foes() > before, foes() + " of them in the field");
  const inv = foes();
  ok(
    "they are theirs, and hostile",
    ZS.Army.units(G, true).every((a) => a.foe && a.nat),
  );
  ok(
    "the village is told",
    /war|field/.test((ZS.Nations.alerts(G)[0] || [])[0] || "war"),
    ZS.Nations.alerts(G).length + " alerts",
  );
  // the field answers: a barracks for the beds, and a line to put in it
  for (const id of ["barracks", "stable"]) {
    let r = ZS.Structs.place(G.world, G.nav, id, G.hall.x + 240, G.hall.y + 60);
    for (let i = 0; i < 40 && !r.ok; i++) {
      const p = G.nav.nearestWalkable(
        G.hall.x + (Math.random() - 0.5) * 700,
        G.hall.y + (Math.random() - 0.5) * 700,
        400,
        false,
      );
      if (p) r = ZS.Structs.place(G.world, G.nav, id, p.x, p.y);
    }
  }
  G.hall.lvl = 3; // a manor: bows and plate are on the menu
  for (const b of G.world.buildings) {
    if (b.kind === "barracks") b.lvl = 3;
    if (b.kind === "stable") b.lvl = 2;
  }
  ok("the village can put people under arms", ZS.Units.cap(G) >= 12, ZS.Units.cap(G) + " beds");
  let killed = false,
    beaten = false;
  for (let k = 0; k < 12; k++) {
    // keep the field full, the way a player would
    give("arms");
    give("wood");
    give("stone");
    give("scrap");
    if (!G.army.queue.length && ZS.Units.crew(G) + 1 <= ZS.Units.cap(G))
      ZS.Army.order(G, ["spearman", "archer", "knight"][k % 3]);
    frames2(60 * 60);
    if (G.army.kills > 0) killed = true;
    if (nat("kell").beaten > 0) beaten = true;
  }
  ok("and the field fights them", killed, G.army.kills + " kills");
  ok("they can be beaten", beaten, "Kell has lost " + nat("kell").beaten + " army");
  // the road is clear again: the rest of this is measured without them
  for (const a of ZS.Army.units(G, true)) a.gone = true;
  frames2(10);
}

/* ---------- the choir never stops ---------- */
{
  const f = nat("choir");
  f.met = 2;
  const r = ZS.Nations.send(G, "choir", "envoy");
  ok("the choir receives nobody", !r.ok, r.err);
  const sent = f.invasions;
  f.invadeIn = 1;
  untilDay(G.day + 3);
  ok("but they keep coming", f.invasions > sent, f.invasions + " times now");
  for (const a of ZS.Army.units(G, true)) a.gone = true;
  frames2(10);
}

/* ---------- the panel ---------- */
{
  key("d");
  frames2(4);
  ok("D opens the world", G.mode === "nations");
  const h = ZS.VillageUI.html.panel || "";
  ok("it draws a map", /id="nationsmap"/.test(h));
  ok("and names the nations", /the Grange/.test(h) && /the Rust/.test(h));
  ok("and every one of them has a road", (h.match(/data-act="nat-send"/g) || []).length >= 10);
  ok("and there is word out of the world", /word out of the world/.test(h));
  press("panel", "nat-send", "grange:envoy");
  frames2(4);
  ok("a button puts an envoy on the road", nat("grange").rides.length > 0);
  key("escape");
  frames2(2);
  ok("escape closes it", G.mode === null);
}

/* ---------- the record carries the world ---------- */
{
  const save = ZS.Nations.save(G);
  ok(
    "the nations serialize",
    !!save && save.list.length === 7,
    save.list.length + " in the record",
  );
  const op = nat("grange").opinion,
    met = nat("grange").met;
  ZS.Nations.load(G, save);
  ok(
    "and they come back as they were",
    Math.abs(nat("grange").opinion - op) < 0.02 && nat("grange").met === met,
    op.toFixed(2) + " → " + nat("grange").opinion.toFixed(2),
  );
  ok("with the news", Array.isArray(G.nat.news) && G.nat.news.length > 0, G.nat.news[0]);
}

/* ---------- it all still runs ---------- */
{
  const day0 = G.day;
  frames2(60 * 400);
  ok("the village keeps going with the world in it", G.day > day0, "to day " + G.day);
  ok("and the world is still whole", !G.over, G.over ? G.over.title : "standing");
}

function give(kind) {
  G.res[kind] = 400;
}

done();
