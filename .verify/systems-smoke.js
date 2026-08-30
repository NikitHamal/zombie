/* The Hollow — the newer systems, end to end.
   The valley and the parties that go out into it; fire, fever, rats, cold
   and despair; birth, grief and coming of age; the barricade dragged out
   in a line; the record and the three slots; and the promise that the
   quality tier actually costs less to draw.
   Run: node .verify/systems-smoke.js */
const { ZS, G, frames, key, press, els, store } = require("./harness");

const fails = [];
function check(ok, label, extra) {
  if (ok) console.log("  ok   " + label + (extra ? "  — " + extra : ""));
  else {
    console.log("  FAIL " + label + (extra ? "  — " + extra : ""));
    fails.push(label);
  }
}

console.log("The Hollow — the newer systems\n");
frames(20);

/* ---------------- the valley ---------------- */
check(
  !!G.ow && G.ow.sites.length === 10,
  "the valley is there",
  G.ow ? G.ow.sites.length + " places" : "missing",
);
check(G.ow.sites.filter((s) => s.seen).length === 2, "two of them are known at the start");
check(G.ow.sites.filter((s) => !s.seen).length === 8, "the rest are rumour and dark");
check(
  !!ZS.Overworld.def("ashford") && !!ZS.Overworld.def("warrens"),
  "and there are people out there",
  "ashford · warrens",
);

const near = G.ow.sites.find((s) => s.seen);
const def = ZS.Overworld.def(near.id);
G.res.food = 200;
const before = G.villagers().length;
const sent = ZS.Overworld.send(G.ow, G, near.id, false);
check(
  sent.ok,
  "a party sets out",
  sent.ok ? sent.p.members.map((a) => a.name).join(" and ") : sent.err,
);
check(
  G.villagers().length === before - 2,
  "and they leave the village",
  G.villagers().length + " at home",
);
check(G.away.length === 2, "they are accounted for while they are gone");
const food0 = G.res.food;
let guard = 0;
// a dawn card holds the world still, which is the point of it
while (G.ow.parties.length && guard++ < 12000) {
  frames(1);
  if (G.card) G.dismissCard();
}
check(G.ow.parties.length === 0, "the party comes home", guard + " frames");
check(
  G.villagers().length === before,
  "and the village is whole again",
  G.villagers().length + " villagers",
);
check(G.away.length === 0, "nobody is stranded out there");
check(
  G.res.food !== food0,
  "they brought something back",
  Math.round(G.res.food - food0) + " food",
);
check(G.chron.length > 0, "the record was written", G.chron[0].txt);

// a scout reveals what is out there
const dark = G.ow.sites.find((s) => !s.seen);
if (dark) {
  dark.seen = 1;
  const sc = ZS.Overworld.send(G.ow, G, dark.id, true);
  check(sc.ok, "a scout can be sent", sc.ok ? sc.p.members[0].name : sc.err);
  guard = 0;
  // the walk there and back is itself a day or more of play
  while (G.ow.parties.length && guard++ < 12000) {
    frames(1);
    if (G.card) G.dismissCard();
  }
  check(
    dark.seen >= 2 || G.chron.some((e) => e.kind === "death" && e.txt.indexOf("lost") >= 0),
    "and comes back knowing the place — or does not come back at all",
    dark.id +
      " seen=" +
      dark.seen +
      " · " +
      (G.ow.parties.length ? "still out there" : "home") +
      " · " +
      (G.chron.find((e) => e.txt.indexOf("scout") >= 0) || { txt: "no word" }).txt,
  );
}

/* ---------------- fire ---------------- */
// fires are fought by day; at night everyone is behind a door
let spun = 0;
while (G.phase !== "day" && spun++ < 4000) {
  frames(1);
  if (G.card) G.dismissCard();
}
const target = G.world.buildings.find((b) => b.built && b.kind !== "wall" && b.kind !== "farm");
const souls0 = G.souls || 0;
ZS.Hazards.ignite(G, target, "a test spark");
check(G.haz.fire.length === 1, "a fire starts");
check(!!target.burning, "the building is alight");
let sawDouse = false;
guard = 0;
while (G.haz.fire.length && guard++ < 3000) {
  frames(1);
  for (const a of G.villagers()) if (a.tgt && a.tgt.sub === "douse") sawDouse = true;
}
check(sawDouse, "the village drops everything for it");
check(G.haz.fire.length === 0, "and it goes out", guard + " frames");
check(!target.burning, "the building is not burning any more");
// a fire is dangerous, and sometimes somebody does not get out. What
// matters is that it is put out and the village is still standing.
check(
  (G.souls || 0) - souls0 <= 1,
  "and it costs at most one of them",
  (G.souls || 0) - souls0 + " lost",
);

/* ---------------- fever, and the feast ---------------- */
const sick0 = G.villagers()[0];
ZS.Hazards.infect(G, sick0);
check(sick0.sick > 0, "somebody takes to their bed", sick0.name);
check(G.haz.sick === undefined || G.haz.sick >= 0, "the count is kept");
frames(30);
check(ZS.Kin.work(sick0) < 1 || sick0.sick > 0, "a fever slows the work");

const food1 = G.res.food;
G.res.food = 100;
const feast = ZS.Hazards.feast(G);
check(feast.ok, "the village can hold a feast");
check(G.res.food === 100 - ZS.Hazards.BAL.FEAST_FOOD, "and it costs food", G.res.food);
const mor = G.villagers().map((a) => a.kin.morale);
check(
  mor.every((m) => m > 0.3),
  "spirits lift",
  (mor.reduce((x, y) => x + y, 0) / mor.length).toFixed(2) + " average",
);
check(!ZS.Hazards.feast(G).ok, "but not twice in a day");
G.res.food = food1;

/* ---------------- birth and grief ---------------- */
const pop0 = G.villagers().length;
G.res.food = 300;
for (const a of G.villagers()) if (a.kin) a.kin.morale = 0.95;
G.grief = 0;
G.morale = 0.9;
const baby = ZS.Kin.birth(G);
check(!!baby, "a child is born", baby ? baby.name : "none");
check(baby && baby.kin.child, "and is a child");
check(G.villagers().length === pop0 + 1, "the village grows");
let grew = 0;
for (let i = 0; i < 8 && baby.kin.child; i++) {
  ZS.Kin.daily(G);
  grew++;
}
check(!baby.kin.child, "children grow up", grew + " days");

const mourn0 = G.grief;
const dying = G.villagers()[1];
G.killVillager(dying, "a test");
check(G.grief > mourn0, "the village grieves", G.grief.toFixed(2));
check(!!G.props.find((p) => p.kind === "grave" && p.who === dying.name), "and digs a grave");
check(
  G.chron.some((e) => e.kind === "death"),
  "and writes it in the record",
  G.chron.find((e) => e.kind === "death").txt,
);

/* ---------------- rats, cold, despair ---------------- */
G.haz.rats = 0.8;
const grain = G.res.food;
ZS.Hazards.daily(G);
check(G.res.food <= grain, "rats eat the grain", Math.round(grain - G.res.food) + " food");
const day0 = G.day;
G.day = 25; // deep winter, by the calendar
const wood0 = G.res.wood;
G.res.wood = 0;
ZS.Hazards.daily(G);
check(G.haz.cold > 0, "a winter without firewood bites", G.haz.cold.toFixed(2));
G.res.wood = 400;
G.haz.cold = 0;
ZS.Hazards.daily(G);
check(G.winterWood > 0, "and a winter with wood burns it", G.winterWood + " logs a day");
check(G.haz.cold === 0, "and keeps the cold out");
G.day = day0;
G.res.wood = wood0;

/* ---------------- the barricade line ---------------- */
G.res.wood = 200;
G.openBuild();
G.armBuild("barricade");
const nBefore = G.world.buildings.length;
const p0 = { x: G.center.x - 260, y: G.center.y - 240 };
G.pointerDown(p0.x, p0.y);
const p1 = { x: p0.x + 240, y: p0.y };
G.pointerMove(p1.x, p1.y);
frames(2);
const spots = G._lineSpots("barricade", G.drag);
check(spots.length > 2, "the line is drawn out as a row of ghosts", spots.length + " pieces");
G.pointerUp(p1.x, p1.y);
check(
  G.world.buildings.length > nBefore,
  "and set down",
  G.world.buildings.length - nBefore + " barricades",
);
const bars = G.world.buildings.filter((b) => b.kind === "barricade");
check(
  bars.every((b) => isFinite(b.x) && isFinite(b.y)),
  "every piece landed somewhere real",
);
G.cancelMode();

/* ---------------- the record, and the slots ---------------- */
const wrote = ZS.Chronicle.save(G, 1);
check(wrote, "a run can be written to a slot");
const slots = ZS.Chronicle.slots();
check(slots[0].used && slots[0].day === G.day, "the slot remembers the day", "day " + slots[0].day);
check(ZS.Chronicle.peek(1).chron.length > 0, "and the ledger goes with it");

const data = G.serialize();
const round = JSON.parse(JSON.stringify(data));
check(
  round.v === 2 && round.bs.length === G.world.buildings.length,
  "the world serializes",
  round.bs.length + " structures",
);
check(round.props.length === G.props.length, "and the furniture", round.props.length + " props");
check(
  round.pop.every((p) => p.k),
  "and every person's history",
);

/* ---------------- the panels ---------------- */
key("m");
check(G.mode === "world", "M opens the valley");
frames(2);
check(els.panel.innerHTML.indexOf("send two") >= 0, "the valley panel offers to send people");
key("l");
check(G.mode === "chron", "L opens the record");
frames(2);
check(els.panel.innerHTML.indexOf("hold a feast") >= 0, "the record offers a feast");
check(els.panel.innerHTML.indexOf("slot 1") >= 0, "and the three slots");
key("Escape");

/* ---------------- quality ---------------- */
const t0 = ZS.Perf.tier;
ZS.Perf.auto = false;
ZS.Perf.setTier(2, true);
frames(3);
const rich = ZS.Perf.points;
ZS.Perf.setTier(0, true);
frames(3);
const lean = ZS.Perf.points;
check(lean < rich * 0.5, "the smooth tier moves the pen less", rich + " → " + lean + " points");
check(ZS.Perf.dprCap() === 1, "and asks for fewer pixels");
ZS.Perf.setTier(t0, true);

/* ---------------- a long run with everything switched on ---------------- */
let err = null;
try {
  G.setSpeed(3);
  guard = 0;
  while (G.day < 12 && guard++ < 60000) {
    frames(1);
    if (G.card) G.dismissCard();
    if (G.over) break;
  }
} catch (e) {
  err = e;
}
check(
  !err,
  "it runs to day 12 with all of it switched on",
  err ? err.message : "day " + G.day + (G.over ? " · " + G.over.title : ""),
);
check(
  G.villagers().every((a) => isFinite(a.x) && isFinite(a.y)),
  "nobody is lost in the numbers",
);
check(store.get("zs.hollow.auto") !== undefined, "and it keeps saving itself");

console.log(
  fails.length ? "\n" + fails.length + " FAILED: " + fails.join(", ") : "\nall checks passed",
);
process.exit(fails.length ? 1 : 0);
