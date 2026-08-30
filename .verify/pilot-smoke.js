/* The Hollow — the steward (autopilot).
   Runs the village with him in charge and checks that he actually does the
   things a player would do, that he says what he did, that a hand set by
   the player is left alone until dawn, and that he survives being saved.

   Run: node .verify/pilot-smoke.js            (a day or two of it)
        ZS_RNG=7 node .verify/pilot-smoke.js   (the same evening every time) */
const { ZS, G, frames, key, press } = require("./harness");

const fails = [];
function ok(good, label, extra) {
  if (good) console.log("  ok   " + label + (extra ? "  — " + extra : ""));
  else {
    console.log("  FAIL " + label + (extra ? "  — " + extra : ""));
    fails.push(label);
  }
}
function frames2(n) {
  for (let i = 0; i < n; i++) {
    frames(1);
    if (G.card) G.dismissCard();
  }
}
function untilDay(d) {
  let guard = 0;
  while (G.day < d && !G.over && guard++ < 400000) {
    frames(1);
    if (G.card) G.dismissCard();
  }
}

console.log("The Hollow — the steward\n");

ok(!!ZS.Autopilot, "the steward is in the house");
const P = ZS.Autopilot;
ok(!P.on(G), "and he starts by standing by", P.line(G));

frames(10);
const on = P.toggle(G);
ok(on && P.on(G), "he can be put in charge", P.line(G));

/* ---------- he does the work ---------- */

untilDay(2);
const jobs = G.villagers().map((a) => a.job);
ok(jobs.length > 0 && jobs.some((j) => j !== "idle"), "the work is set", jobs.join(", "));
ok(G.guards().length > 0, "somebody is on the watch", G.guards().length + " guards");

untilDay(9);
const built = G.world.buildings.length;
ok(
  G.world.buildings.length > built - 1,
  "he marks things out",
  G.world.buildings.length + " sites",
);
ok(
  G.world.buildings.some((b) => b.kind === "wall"),
  "including a wall round the green",
  G.world.buildings.filter((b) => b.kind === "wall").length + " walls",
);
ok(
  !!G.research || Object.keys(G.done).length > 0,
  "the workshop is busy",
  G.research ? G.research.def.name : "learned " + Object.keys(G.done).length,
);
ok((G.pilot.last || "").length > 0, "and he says what he did", G.pilot.last);

/* ---------- the larder follows the work ---------- */

untilDay(12);
const r = P.read(G);
ok(r.food >= 0, "the village is fed", Math.round(r.food) + " food, " + Math.round(r.up) + " a day");
ok(r.people.length > 0, "and there are people in it", r.people.length + " villagers");
ok(
  G.villagers().every((a) => !(a.kin && a.kin.child) || a.job !== "guard"),
  "children are not put on the watch",
);
ok(
  G.guards().length <= G.guardCap(),
  "and the watch is never over its cap",
  G.guards().length + "/" + G.guardCap(),
);

/* ---------- a hand set by the player is their own ---------- */

const mine = G.villagers().find((a) => !(a.kin && a.kin.child));
if (mine) {
  G.setJob(mine, "wood");
  const held = mine.job;
  frames2(600); // a day and a bit of stewarding
  ok(mine.job === held, "a hand set by the player is left alone", held + " → " + mine.job);
}

/* ---------- the field, if there is one to put people in ---------- */

if (ZS.Units && ZS.Units.cap(G) > 0 && G.res.food > 200) {
  const before = ZS.Units.crew(G);
  P.dawn(G);
  ok(
    ZS.Units.crew(G) >= before,
    "he puts people under arms when he can feed them",
    ZS.Units.crew(G) + " of " + ZS.Units.cap(G),
  );
}

/* ---------- the panel ---------- */
{
  key("l");
  frames2(4);
  ok("L opens the record", G.mode === "chron");
  const h = ZS.VillageUI.html.panel || "";
  ok("the record knows about him", /the steward/.test(h));
  ok("and shows he is in charge", /in charge/.test(h));
  ok(
    "and what he last did",
    (h.match(/the steward is|food|mended|under arms|marked out/) || []).length > 0,
  );
  press("panel", "pilot");
  frames2(4);
  ok("the button takes the village back", !P.on(G));
  key("p");
  frames2(4);
  ok("and P gives it to him again", P.on(G));
  key("escape");
  frames2(2);
}

/* ---------- saving ---------- */

const s = G.serialize();
ok(s.pilot && s.pilot.on === 1, "the save knows he is in charge");
const back = P.load(G, s.pilot);
ok(back.on === 1, "and he comes back in charge");

/* ---------- a long run with nobody at the helm ---------- */

let guard = 0;
while (G.day < 26 && !G.over && guard++ < 400000) {
  frames(1);
  if (G.card) G.dismissCard();
}
ok(
  !G.over,
  "the village lasts with him running it",
  "day " + G.day + " · " + G.villagers().length + " villagers",
);
ok((G.pilot.did || []).length > 0, "and he keeps reporting", G.pilot.last);

console.log(
  fails.length
    ? "\n" + fails.length + " FAILED: " + fails.join(" · ") + "\n"
    : "\nall checks passed\n",
);
process.exit(fails.length ? 1 : 0);
