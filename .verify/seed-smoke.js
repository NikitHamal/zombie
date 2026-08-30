/* The Hollow — the valley is a place, not a dice roll.
   A refresh (or a saved game) has to come back to the same river in the
   same bed. Run: node .verify/seed-smoke.js */
const { G, ZS } = require("./harness");

const fails = [];
function ok(good, label, extra) {
  if (good) console.log("  ok   " + label + (extra ? "  — " + extra : ""));
  else {
    console.log("  FAIL " + label + (extra ? "  — " + extra : ""));
    fails.push(label);
  }
}

console.log("The Hollow — the seed of the valley\n");

const Seed = ZS.Seed;
ok(!!Seed, "the keeper is there");
const seed = G.world.seed | 0;
ok(seed !== 0, "the world has a seed", String(seed));

// a second boot, the way a refresh would do it: no ?seed= in the address
const again = Seed.get(new URLSearchParams(""));
ok(again === seed, "a refresh is the same valley", again + " = " + seed);

// and the save knows which valley it was played in
const s = G.serialize();
ok(s.seed === seed, "the save carries the seed", s.seed + " = " + seed);

// a cold start with nothing kept: a new number, and then it is kept
localStorage.removeItem(Seed.KEY);
const fresh = Seed.get(new URLSearchParams(""));
ok(fresh !== 0 && fresh === Seed.kept(), "a cold start rolls one and keeps it", String(fresh));

// ?seed= pins it, and is remembered
const pinned = Seed.get(new URLSearchParams("?seed=424242"));
ok(pinned === 424242, "?seed= pins the map", String(pinned));
ok(Seed.kept() === 424242, "and the pin is kept");

// loading a slot brings that valley back with it
localStorage.setItem(Seed.KEY, "424242");
ok(ZS.Chronicle.save(G, 1), "a run is written to a slot");
const d = ZS.Chronicle.peek(1);
ok(d && d.seed === seed, "the slot knows its valley", d && String(d.seed));
ok(ZS.Chronicle.loadSlot(1), "the slot is loaded");
ok(Seed.kept() === seed, "and loading it brings the valley back", Seed.kept() + " = " + seed);
ZS.Chronicle.clear(1);

// the map itself: the same seed lays the same ground
const world = G.world;
const sig =
  world.trees.length +
  "/" +
  Math.round(world.trees.length ? world.trees[0].x : 0) +
  "/" +
  world.buildings.length +
  "/" +
  Math.round(world.buildings[0] ? world.buildings[0].x : 0);
ok(world.trees.length > 0 && world.buildings.length > 0, "the ground is laid", sig);

console.log(
  fails.length
    ? "\n" + fails.length + " FAILED: " + fails.join(" · ") + "\n"
    : "\nall checks passed\n",
);
process.exit(fails.length ? 1 : 0);
