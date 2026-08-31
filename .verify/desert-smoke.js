/* The Desert Order — the RTS scenario, headless.
   Exercises the transform: the big map, rival outposts, territory, direct
   orders, naval units, and the factions-at-war rule. Run:
   ZS_SCEN=ScenarioDesert ZS_WW=3200 ZS_WH=2200 node .verify/desert-smoke.js */
const { G, ZS, frames, press } = require("./harness");

const fails = [];
function ok(good, label, extra) {
  if (good) console.log("  ok   " + label + (extra ? "  — " + extra : ""));
  else {
    console.log("  FAIL " + label + (extra ? "  — " + extra : ""));
    fails.push(label);
  }
}

console.log("The Desert Order — the RTS scenario\n");

ok(
  G && G.constructor && G.constructor.name === "ScenarioDesert",
  "the page boots the RTS scenario",
  G.constructor.name,
);
ok(
  (G.outposts || []).length >= 3,
  "rival outposts stand out in the waste",
  String((G.outposts || []).length),
);
ok(
  G.world.buildings.filter((b) => b.enemy).length >= 10,
  "enemy ground is scattered across the map",
);

// territory: the walled outpost is held from the first frame
frames(120);
ok(
  (G._ters || []).length >= 1,
  "territory rings are drawn around what the player holds",
  String((G._ters || []).length),
);

// direct orders: a garrison is under arms and can be told to move
const ours = () => (G.agents || []).filter((a) => a.st === 4 && !a.foe && !a.dead);
ok(ours().length >= 3, "a garrison is already under arms", String(ours().length));
const before = ours().map((a) => [a.x, a.y]);
const tx = G.center.x + 520,
  ty = G.center.y - 260;
G._moveSelected(tx, ty);
frames(160);
const moved = ours().filter(
  (a, i) => Math.hypot(a.x - before[i][0], a.y - before[i][1]) > 120,
).length;
ok(moved >= 2, "units walk to an issued move order", moved + " moved");

// naval: the fleets are on the roster, and step into the water
ok(
  ZS.Units.roster(G).includes("gunboat") && ZS.Units.roster(G).includes("destroyer"),
  "the fleets are on the roster",
);
const b = ZS.Army.spawn(G, "gunboat", false);
ok(
  !!b && G.nav.isWater(b.x, b.y),
  "a gunboat steps into open water",
  b && String(G.nav.isWater(b.x, b.y)),
);

// factions at war: two enemy side units only fight when their nations war
const nat = G.nat;
const f = nat.list.find((x) => !ZS.Nations.def(x.id).foe) || nat.list[0];
ZS.Nations.declare(G, f);
const a1 = ZS.Army.spawn(G, "militia", true),
  a2 = ZS.Army.spawn(G, "militia", true);
a1.nat = f.id;
a2.nat = f.id;
ok(!G.hostileBetween(a1, a2, G), "soldiers of one army do not fight each other");
a2.nat = nat.list.find((x) => x.id !== f.id && !ZS.Nations.def(x.id).foe).id;
ZS.Nations.declare(
  G,
  nat.list.find((x) => x.id === a2.nat),
);
ok(!!G.hostileBetween(a1, a2, G), "nations at war will fight each other");

// player vs a foe is always hostile
const foe = ZS.Army.spawn(G, "militia", true);
ok(G.hostileBetween(ours()[0], foe, G), "the dead of the player are always at odds with a foe");

// the defensive works fight on their own
const tur = G.world.buildings.find((bb) => bb.kind === "gunTurret" && !bb.enemy);
if (tur) {
  const f2 = ZS.Army.spawn(G, "militia", true);
  f2.x = tur.x + tur.w / 2 + 80;
  f2.y = tur.y + tur.h / 2;
  f2.goal = { x: tur.x, y: tur.y };
  frames(200);
  ok(!!f2.dead, "a walled turret shells a close enemy", f2.dead && "down");
} else {
  ok(false, "a walled turret is standing");
}

console.log("\n" + (fails.length ? fails.length + " FAILED" : "all checks passed"));
process.exit(fails.length ? 1 : 0);
