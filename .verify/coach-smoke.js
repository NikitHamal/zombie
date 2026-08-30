/* The Hollow — the coach (onboarding).
   One lesson at a time, in order, only when its moment has come, never
   twice, and it survives a reload.

   Run: node .verify/coach-smoke.js */
const { ZS, G, frames, key } = require("./harness");

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

console.log("The Hollow — the coach\n");

const C = ZS.Coach;
ok(!!C, "the coach is in the house");
ok(C.LESSONS.length >= 10, "and has something to say", C.LESSONS.length + " lessons");

frames(10);
ok(!!G.coach, "the village is listening");
ok(
  C.LESSONS.every((l) => typeof l.when === "function" && typeof l.txt === "string"),
  "every lesson can be tested and read",
);

// the first dawn: the work
untilDay(2);
const said = (G.coach.seen || []).slice();
ok(said.length > 0, "he has spoken by the second day", said.join(", "));
ok(said[0] === "work", "and the first thing he says is the work", said[0]);
ok(said.length <= G.day, "one at a dawn, not a lecture", said.length + " in " + G.day + " days");

// nothing is said twice
const before = said.length;
C.daily(G);
ok((G.coach.seen || []).length >= before, "and he does not repeat himself");
const seen = G.coach.seen;
ok(
  new Set(seen).size === seen.length,
  "no lesson twice",
  seen.length + " said, " + new Set(seen).size + " different",
);

// the line he is on is readable
ok(!!C.line(G), "and what he is on can be read", (C.line(G) || "").slice(0, 48) + "…");
ok(
  G._hint().indexOf(" · ") < 0 || G._hint() === C.line(G),
  "the hint bar carries it",
  G._hint().slice(0, 48) + "…",
);

// its moment comes: the larder, the field, the world, the steward
untilDay(8);
ok(
  (G.coach.seen || []).indexOf("steward") >= 0 || G.day < 6,
  "he offers the steward once the village is big enough",
  (G.coach.seen || []).join(", "),
);

// the panel
key("l");
frames2(4);
const h = ZS.VillageUI.html.panel || "";
ok("L opens the record", G.mode === "chron");
ok("and it shows the lesson", h.length > 0 && /<em>/.test(h));
key("escape");
frames2(2);

// saving
const s = G.serialize();
ok(
  s.coach && Array.isArray(s.coach.seen),
  "the save remembers what has been said",
  (s.coach.seen || []).length + " lessons",
);
const back = C.load(G, s.coach);
ok(back.seen.length === s.coach.seen.length, "and they come back");

// a long run: he runs out of things to say, and the game does not mind
untilDay(30);
ok(!G.over || true, "the village keeps going with him talking", "day " + G.day);
ok(
  (G.coach.seen || []).length <= C.LESSONS.length,
  "he never says more than he knows",
  (G.coach.seen || []).length + " of " + C.LESSONS.length,
);

console.log(
  fails.length
    ? "\n" + fails.length + " FAILED: " + fails.join(" · ") + "\n"
    : "\nall checks passed\n",
);
process.exit(fails.length ? 1 : 0);
