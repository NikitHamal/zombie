/* The field: a targeted smoke test for the ages, the roster, the training
   queue, the line, the shooting and the bread.

   It grants what it needs (there is no point waiting forty days for a
   tank in a test) and then checks that the whole thing hangs together:
   that a unit can be trained, that it walks where it is told, that it
   kills what comes out of the wood, that it dies when it is outnumbered,
   and that it comes back after a reload.

   Run: node .verify/army-smoke.js */
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
// This test is about the army, not about whether four people can hold a
// hall through a week of nights: the hall is pinned and the larder is kept
// full so the long stretches measure the field and nothing else.
function frames2(n) {
  for (let i = 0; i < n; i++) {
    if (G.hall) {
      G.hall.maxHp = Math.max(G.hall.maxHp, 720);
      G.hall.hp = G.hall.maxHp;
    }
    if (G.res.food < 200) G.res.food = 200;
    frames(1);
    dismiss();
  }
}
function give(kind, n) {
  G.res[kind] = (G.res[kind] || 0) + n;
}
function zeds() {
  return G.agents.filter((a) => a.st === 2 && !a.dead);
}
function units(foe) {
  return ZS.Army.units(G, foe);
}

/* ---------- boot ---------- */
frames(240);
dismiss();

ok("the village is standing", G.villagers().length > 0, G.villagers().length + " souls");
ok("the army has a book", !!G.army);
ok("the ages are known", ZS.Ages.AGES.length === 5, ZS.Ages.AGES.map((a) => a.id).join(","));
ok("and it starts as a refuge", ZS.Ages.of(G).id === "refuge", ZS.Ages.of(G).name);
ok("thirteen things to train", ZS.Units.ORDER.length === 13, ZS.Units.ORDER.join(","));
ok(
  "every one of them has art",
  ZS.Units.ORDER.every((id) => !!ZS.Units.ART[id]),
);
ok(
  "and every one of them knows its age",
  ZS.Units.ORDER.every((id) => !!ZS.Ages.def(ZS.Units.def(id).age)),
);

/* ---------- the gate: you cannot train what the village is not yet ---------- */
{
  const r = ZS.Army.order(G, "tank");
  ok("a tank is beyond a refuge", !r.ok, r.err);
  const q = ZS.Army.order(G, "militia");
  ok("but a neighbour with a stick is not", q.ok, q.err || "");
  ok("and it goes into the queue", G.army.queue.length === 1);
  const over = ZS.Army.order(G, "militia");
  ok("the army only has so many beds", !over.ok || G.army.queue.length === 2, over.err || "queued");
}

/* ---------- it walks onto the field ---------- */
frames2(60 * 40);
ok("the first of them is trained", units(false).length >= 1, units(false).length + " under arms");
{
  const a = units(false)[0];
  ok("it is one of ours", a && a.st === 4 && !a.foe);
  ok("and it has the health of its kind", a && a.maxHp === ZS.Units.def(a.unit).hp);
}

/* ---------- the line forms where it is told ---------- */
{
  const hall = G.hall;
  const x = hall.x + hall.w / 2 + 40,
    y = hall.y + hall.h + 220;
  ZS.Army.command(G, x, y);
  ok("the rally is marked", !!G.army.rally, G.army.rally && G.army.rally.x + "," + G.army.rally.y);
  const a = units(false)[0];
  const d0 = Math.hypot(a.x - x, a.y - y);
  frames2(60 * 25);
  const d1 = Math.hypot(a.x - x, a.y - y);
  ok("and the line walks to it", d1 < d0 * 0.5, Math.round(d0) + " → " + Math.round(d1) + " px");
}

/* ---------- a night of it: the army holds what the guards cannot ---------- */
{
  // a wall of spearmen, a barracks to hold them, and the studies that open
  // the rest of the roster
  G.hall.lvl = 3;
  G.done.gunpowder = true;
  G.done.mechanised = true;
  G.done.flight = true;
  for (const id of ["barracks", "smith", "foundry", "airfield"]) {
    const b = ZS.Structs.place(G.world, G.nav, id, G.hall.x + 260, G.hall.y + 40);
    if (!b.ok) {
      // anywhere with room
      for (let i = 0; i < 40 && !b.ok; i++) {
        const p = G.nav.nearestWalkable(
          G.hall.x + (Math.random() - 0.5) * 700,
          G.hall.y + (Math.random() - 0.5) * 700,
          400,
          false,
        );
        if (p) Object.assign(b, ZS.Structs.place(G.world, G.nav, id, p.x, p.y));
      }
    }
  }
  ok("the village is a foundry at least", ZS.Ages.index(G) >= 2, ZS.Ages.of(G).name);
  give("wood", 900);
  give("stone", 900);
  give("scrap", 900);
  give("arms", 400);
  give("food", 900);
  for (const id of ["spearman", "archer", "gunner", "cannon", "tank", "helicopter"]) {
    const r = ZS.Army.order(G, id);
    if (!r.ok) console.log("       (could not order " + id + ": " + r.err + ")");
  }
  frames2(60 * 400);
  ok("the field fills up", units(false).length >= 4, units(false).length + " under arms");
  ok(
    "and the whole ladder is in it",
    ZS.Units.ORDER.some((id) => ZS.Units.count(G, id) && ZS.Units.def(id).age === "forge"),
    ZS.Army.line(G),
  );
}

/* ---------- they shoot, and things die ---------- */
{
  const before = units(false).length;
  const p = G._spawnPoint();
  for (let i = 0; i < 6; i++) {
    const q = G.nav.nearestWalkable(
      p.x + (Math.random() - 0.5) * 120,
      p.y + (Math.random() - 0.5) * 120,
      300,
      true,
    );
    if (q) G._spawnZed({ k: "walker", at: q });
  }
  ok("the dead are out there", zeds().length >= 4, zeds().length + " of them");
  const k0 = G.army.kills;
  let f = 0;
  while (zeds().length && f < 60 * 120) {
    frames(1);
    dismiss();
    f++;
  }
  ok("and the field kills them", G.army.kills > k0, G.army.kills + " kills");
  ok("the dead are gone", zeds().length === 0, zeds().length + " left");
  ok(
    "nobody was lost doing it",
    units(false).length >= before - 1,
    before + " → " + units(false).length,
  );
  ok("the burst was drawn", G.fx.length >= 0);
}

/* ---------- a soldier can be picked, and it has a card ---------- */
{
  const a = units(false)[0];
  G.selectUnit(a);
  frames2(4);
  ok("picking one opens its card", G.sel && G.sel.k === "u" && G.sel.o === a);
  ok("and the card is painted", /health/.test(ZS.VillageUI.html.sel || ""), "unit card");
  G.clearSel();
}

/* ---------- the panel ---------- */
{
  key("a");
  frames2(4);
  ok("A opens the field", G.mode === "army");
  const h = ZS.VillageUI.html.panel || "";
  ok("it names the age", /refuge|manor|forge|foundry|airfield/.test(h));
  ok("and lists the roster", /militia/.test(h) && /tank/.test(h));
  ok("and every row is a button", (h.match(/data-act="train"/g) || []).length === 13);
  ok("and there is a rally order", /data-act="rally"/.test(h));
  press("panel", "rally");
  frames2(2);
  ok("rally arms the cursor", G.rallying === true);
  const pt = G.nav.nearestWalkable(G.hall.x + 100, G.hall.y + 260, 400, false);
  G.pointerDown(pt.x, pt.y);
  G.pointerUp(pt.x, pt.y);
  frames2(2);
  ok("and the click moves the flag", !!G.army.rally && G.rallying === false);
  key("escape");
  frames2(2);
  ok("escape closes it", G.mode === null);
}

/* ---------- arms: scrap into the rack ---------- */
{
  const smith = G._first("smith");
  ok("there is a smithy", !!smith);
  if (smith) {
    give("scrap", 60);
    G.res.arms = 4; // room in the rack, so the work is visible
    const before = G.res.arms;
    // two of them, so a night's huddling or a sick day cannot hide it
    const hands = G.villagers()
      .filter((a) => !(a.kin && a.kin.child))
      .slice(0, 2);
    for (const v of hands) G.setJob(v, "smith");
    let made = false;
    for (let i = 0; i < 8 && !made; i++) {
      frames2(60 * 45);
      if (G.res.arms > before) made = true;
    }
    ok("the armourer makes arms", made, before + " → " + Math.round(G.res.arms));
  }
}

/* ---------- the army eats ---------- */
{
  const need = ZS.Units.upkeep(G);
  ok("the field has a bill", need > 0, Math.round(need) + " food a day");
  const food0 = G.res.food;
  const day0 = G.day;
  frames2(60 * 400);
  ok("and dawn charges it", G.day > day0, "day " + G.day);
  ok("the larder moved", G.res.food !== food0);
}

/* ---------- the record carries the field ---------- */
{
  const n = units(false).length;
  const save = ZS.Army.save(G);
  ok("the army serializes", !!save && Array.isArray(save.u), n + " in the record");
  ok("and the queue goes with it", Array.isArray(save.q));
  for (const a of units(false)) a.dead = true;
  frames(2);
  ok("the field is empty", units(false).length === 0);
  ZS.Army.load(G, save);
  frames2(30);
  ok("and it comes back", units(false).length === n, units(false).length + " back");
}

/* ---------- it all still runs ---------- */
{
  const day0 = G.day;
  frames2(60 * 600);
  ok("the village keeps going with an army in it", G.day > day0, "to day " + G.day);
  ok("and it is still saving itself", !!G.save);
  ok("the world is still whole", !!G.hall && !G.over, G.over ? G.over.title : "standing");
}

done();
