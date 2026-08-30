/* The Hollow — a hands-on run.
   This one plays the game instead of poking at it: it takes the dawn, sets
   the work, marks out buildings where they will fit, studies what it can,
   sends parties into the valley, and holds a feast when the village's
   heart is going. Then it reports whether the village is still there.

   Run: node .verify/play.js [days] */
const { ZS, G, frames } = require("./harness");

const DAYS = +(process.argv[2] || 14);
const log = [];
const fails = [];
function check(ok, label, extra) {
  if (ok) console.log("  ok   " + label + (extra ? "  — " + extra : ""));
  else {
    console.log("  FAIL " + label + (extra ? "  — " + extra : ""));
    fails.push(label);
  }
}

/* ---------- the player ---------- */

// the ruins first (a roof is cheaper to mend than to raise), then beds,
// then food, then a wall and somewhere to stand on it, then the workshop
const WANT = [
  ["hut", 4],
  ["farm", 2],
  ["wall", 3],
  ["infirm", 1],
  ["shop", 1],
  ["tower", 1],
  ["post", 1],
  ["shed", 2],
  ["wall", 6],
  ["barricade", 12],
  ["store", 2],
  ["post", 2],
  ["mill", 1],
  ["granary", 1],
  ["smith", 1],
  ["kennel", 1],
  ["shrine", 1],
  ["hut", 6],
];

function freeSpot(kind) {
  const c = ZS.Structs.CAT[kind];
  const cx = G.center.x,
    cy = G.center.y;
  for (let ring = 0; ring < 9; ring++) {
    const r = 150 + ring * 62;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + ring * 0.4;
      const x = cx + Math.cos(a) * r,
        y = cy + Math.sin(a) * r * 0.85;
      if (x < 80 || y < 80 || x > G.world.w - 80 || y > G.world.h - 80) continue;
      if (ZS.Structs.footprintClear(G.world, G.nav, x - c.w / 2, y - c.h / 2, c.w, c.h)) return { x, y };
    }
  }
  return null;
}

// a wall only works as a wall: the bot lays them in a ring round the hall,
// the way a player would
function ringSpot(i, n, r) {
  const a = (i / n) * Math.PI * 2;
  return { x: G.center.x + Math.cos(a) * r, y: G.center.y + Math.sin(a) * r * 0.9 };
}

function ring(kind, n, r) {
  const c = ZS.Structs.CAT[kind];
  for (let i = 0; i < n; i++) {
    const p = ringSpot(i, n, r);
    if (!ZS.Structs.footprintClear(G.world, G.nav, p.x - c.w / 2, p.y - c.h / 2, c.w, c.h)) continue;
    const have = G.world.buildings.filter(
      (b) => b.kind === kind && Math.abs(b.x + b.w / 2 - p.x) < 30 && Math.abs(b.y + b.h / 2 - p.y) < 30,
    ).length;
    if (have) continue;
    G.armBuild(kind);
    const ok = G._placeAt(p.x, p.y, true);
    G.cancelMode();
    if (ok) return true;
  }
  return false;
}

let built = 0;
function tryBuild(kind) {
  const cost = G.buildCost(kind);
  if (!G.canPay(cost)) return false;
  const p = freeSpot(kind);
  if (!p) return false;
  G.armBuild(kind);
  const ok = G._placeAt(p.x, p.y, true);
  G.cancelMode();
  if (ok) built++;
  return ok;
}

function dawn() {
  const v = G.villagers();
  if (!v.length) return;
  // the work: guards first, then whatever is shortest
  let guards = 0;
  const wantGuards = Math.min(
    G.guardCap(),
    Math.max(1, Math.round(v.length * (G.day < 6 ? 0.34 : 0.5))),
  );
  for (const a of v) {
    if (a.kin && a.kin.child) {
      if (a.job !== "idle") G.setJob(a, "labourer");
      continue;
    }
    if (guards < wantGuards) {
      if (a.job !== "guard") G.setJob(a, "guard");
      guards++;
    } else if (G.res.food < 60 && a.job !== "food") G.setJob(a, "food");
    else if (G.res.wood < 40 && guards + 2 < v.length && a.job !== "wood") G.setJob(a, "wood");
    else if (a.job === "guard") G.setJob(a, "labourer");
    else if (a.job !== "labourer" && Math.random() < 0.6) G.setJob(a, "labourer");
  }
  // anybody bitten or badly hurt gets a healer, if there is an infirmary
  if (G.has("infirm") && v.some((a) => a.inf > 0 || a.hp < a.maxHp * 0.5)) {
    const healer = v.find((a) => !(a.kin && a.kin.child) && a.job !== "guard");
    if (healer && healer.job !== "heal") G.setJob(healer, "heal");
  }
  // mend what is broken, but never at the cost of the season's building
  if (G.res.wood > 70) {
    let mends = 0;
    const hurt = G.world.buildings
      .filter((b) => b.built && !b.ruined && b.hp < b.maxHp * 0.6)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    for (const b of hurt) {
      if (mends++ >= 2 || G.res.wood < 40) break;
      G.repair(b, true);
    }
  }
  // the ring first: a palisade round the green, then barricades outside it
  if (G.res.wood > 60 && G.world.buildings.filter((b) => b.kind === "wall").length < 14)
    if (ring("wall", 14, 215)) built++;
  if (G.res.wood > 140 && G.world.buildings.filter((b) => b.kind === "barricade").length < 14)
    if (ring("barricade", 14, 290)) built++;
  // raise the next thing on the list (three a day, if the stores allow)
  let raised = 0;
  for (const [kind, want] of WANT) {
    if (raised >= 3) break;
    const have = G.world.buildings.filter((b) => b.kind === kind).length;
    if (have >= want) continue;
    if (tryBuild(kind)) raised++;
  }
  // and mend a ruin when there is timber to spare: it is a whole building
  // for a fraction of the price
  if (G.res.wood > 130) {
    const ruin = G.world.buildings
      .filter((b) => b.ruined && b.kind !== "hall")
      .sort((a, b) => a.maxHp - b.maxHp)[0];
    if (ruin) G.repair(ruin, true);
  }
  // study: weapons before comforts
  if (!G.research && G.has("shop")) {
    const first = ["spears", "bows", "rifles", "shotguns", "armor1", "tools1", "towers2", "farm1"];
    const list = G.researchList();
    let pick = null;
    for (const id of first) if (list.find((r) => r.id === id && G.canPay(r.def.cost))) pick = id;
    if (!pick) for (const r of list) if (G.canPay(r.def.cost)) pick = r.id;
    if (pick) G.startResearch(pick);
  }
  // a bed and a bite: take in a survivor
  while (G.villagers().length < G.popCap() && G.res.food > 110 && G.res.wood > 30) {
    if (!G.recruit()) break;
  }
  // out into the valley, if two hands can be spared
  if (G.ow && !G.ow.parties.length && G.res.food > 140 && G.day > 3) {
    const known = G.ow.sites.filter((s) => s.seen);
    if (known.length) {
      const pick = known[(Math.random() * known.length) | 0];
      if (ZS.Overworld.canSend(G.ow, G, pick.id, false).ok) ZS.Overworld.send(G.ow, G, pick.id, false);
    }
  }
  // and if the heart is going, a hot meal
  if ((G.haz.despair > 0.4 || G.morale < 0.42) && G.haz.feastT <= 0) ZS.Hazards.feast(G);
}

/* ---------- the run ---------- */

if (process.env.ZS_DEBUG) {
  const origBite = G._bite.bind(G);
  G._bite = function (a, v) {
    const s = G._shelter();
    console.log(
      "  bite d" + G.day + " " + G.phase + " · " + v.name + " (" + v.job + ") " +
        Math.round(Math.hypot(v.x - s.x, v.y - s.y)) + "px from the hall · hp " + Math.round(v.hp),
    );
    return origBite(a, v);
  };
}

console.log("The Hollow — " + DAYS + " days, played\n");
frames(10);
let guard = 0;
let night = 0;
while (G.day < DAYS && !G.over && guard++ < 300000) {
  frames(1);
  if (G.card) {
    log.push("day " + G.day + ": " + (G.card.lines[0] || ""));
    G.dismissCard();
    dawn();
  }
  if (G.phase === "night" && !night) night = 1;
  if (G.phase === "day") night = 0;
}

const v = G.villagers();
console.log(
  "  day " +
    G.day +
    " · " +
    v.length +
    " villagers (" +
    G.popCap() +
    " beds) · " +
    G.guards().length +
    "/" +
    G.guardCap() +
    " guards",
);
console.log(
  "  stores w" +
    Math.round(G.res.wood) +
    " s" +
    Math.round(G.res.stone) +
    " f" +
    Math.round(G.res.food) +
    " c" +
    Math.round(G.res.scrap) +
    (G.res.cloth ? " cloth" + Math.round(G.res.cloth) : "") +
    " · holds " +
    G.storeCap(),
);
console.log(
  "  built " +
    G.world.buildings.filter((b) => b.built && !b.ruined).length +
    " · ruined " +
    G.world.buildings.filter((b) => b.ruined).length +
    " · researched " +
    Object.keys(G.done).length +
    " · souls " +
    G.souls,
);
console.log("  morale " + G.morale.toFixed(2) + " · grief " + G.grief.toFixed(2) + " · " + G.season.name);
for (const l of log.slice(-6)) console.log("    " + l);
const deaths = (G.chron || []).filter((e) => e.kind === "death");
if (deaths.length) console.log("  the lost: " + deaths.map((e) => "d" + e.day + " " + e.txt).join(" · "));

check(!G.over, "the village is still standing", G.over ? G.over.title : "day " + G.day);
check(G.day >= DAYS, "it reached day " + DAYS, "day " + G.day);
check(v.length >= 4, "there are people in it", v.length + " villagers");
check(built > 4, "the player raised things", built + " sites marked out");
check(G.res.food > 0, "and there is food", Math.round(G.res.food) + "");
check(
  Object.keys(G.done).length > 0,
  "the village learned something",
  Object.keys(G.done).join(", ") || "nothing",
);

console.log(fails.length ? "\n" + fails.length + " FAILED: " + fails.join(", ") : "\nall checks passed");
process.exit(fails.length ? 1 : 0);
