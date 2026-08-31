/* The theatre's smoke: the RTS boots, the five bases stand walled, the
   money moves, orders are obeyed, the guns shoot, the walls are walls,
   the nations think, and the dead come out at night. Run with
   `node .verify/rts-smoke.js` — exit 0 is all green.
   ZS_RNG=1 and the seeded map make two runs the same war. */
"use strict";
process.env.ZS_RNG = process.env.ZS_RNG || "1";
const { ZS, G, frames } = require("./harness");

let fails = 0;
function ok(cond, txt) {
  if (cond) console.log("  ok - " + txt);
  else {
    fails++;
    console.log("  FAIL - " + txt);
  }
}

console.log("the theatre wakes");

/* ---------- the shape of the map ---------- */
ok(G && G.constructor.name === "ScenarioRTS", "the page runs the RTS scenario");
ok(ZS.debug.world.w === 7200 && ZS.debug.world.h === 5400, "the theatre is vast");
ok(G.bases.length === 5, "five bases stand");
ok(G.oilSpots.length >= 10, "the oil seeps are out there (" + G.oilSpots.length + ")");
ok(G.nests.length >= 4, "the nests are in the broken places (" + G.nests.length + ")");

const walls = G.world.buildings.filter((b) => b.kind === "wall").length;
const gates = G.world.buildings.filter((b) => b.kind === "gate").length;
ok(walls >= 40, "the bases are wall-bound (" + walls + " wall pieces)");
ok(gates >= 5, "every base keeps a gate (" + gates + ")");
ok(
  G.world.buildings.some((b) => b.kind === "turret"),
  "the guns stand at the gates",
);
ok(
  G.world.buildings.some((b) => b.kind === "oil" && b.fac === -1),
  "the home derricks wait to be taken",
);

const playerUnits = G.unitsOf(0);
ok(playerUnits.length >= 7, "the player starts under arms (" + playerUnits.length + ")");
ok(G.facs.length === 5, "four nations and the player");

/* ---------- the clock and the money ---------- */
frames(200); // ten seconds
ok(G.t > 9, "the clock runs (" + G.t.toFixed(1) + "s)");
const funds = G.facs[0].funds;
ok(funds > 1300, "the derricks pay (" + Math.floor(funds) + ")");
ok(ZS.RtsNations.income(G, G.facs[2]) >= 2, "the nations are paid too");

/* ---------- selection and orders ---------- */
const u0 = playerUnits[0];
G.sel = playerUnits.slice(0, 4);
for (const a of G.sel) a.sel = true;
const dest = { x: u0.x + 320, y: u0.y };
G.issueMove(G.sel, dest.x, dest.y, "move");
ok(u0.ord && u0.ord.k === "move", "the order lands");
const x0 = u0.x;
frames(400); // twenty seconds of marching
ok(Math.abs(u0.x - x0) > 120, "the guns obey (" + Math.round(Math.abs(u0.x - x0)) + " px)");
ok(!u0.dead, "nobody fell on the march");
// bring them home before the infiltrator arrives
G.issueMove(G.sel, G.bases[0].x, G.bases[0].y + 120, "move");
frames(400);

/* ---------- the shooting ---------- */
// an enemy car drives into the camp: the idle guns should wreck it
const rifle = G.spawnUnit(2, "scout", G.bases[0].x + 120, G.bases[0].y + 120);
ok(!!rifle, "the enemy steps forward");
frames(600); // thirty seconds
ok(rifle.dead, "the camp shoots back");

/* ---------- the walls are walls ---------- */
// a brute at the wall must not stroll through it
const brute = G.spawnZombie("brute", G.bases[0].x + 460, G.bases[0].y, null);
frames(300);
const hallC = { x: G.bases[0].x, y: G.bases[0].y };
const bruteIn = Math.hypot(brute.x - hallC.x, brute.y - hallC.y) < 200;
ok(brute.dead || !bruteIn, "the wall holds the brute");
const nav = ZS.debug.nav;
const gateB = G.world.buildings.find((b) => b.kind === "gate" && b.fac === 0);
ok(!!gateB, "the player keeps a gate");
ok(!nav.isWalkable(gateB.cx, gateB.cy, false) || gateB.open, "a shut gate is a wall");

/* ---------- building ---------- */
const before = G.world.buildings.length;
let at = null;
for (let an = 0; an < 6.3 && !at; an += 0.35)
  for (let r = 110; r < 230 && !at; r += 26) {
    const x = G.bases[0].x + Math.cos(an) * r,
      y = G.bases[0].y + Math.sin(an) * r;
    if (G.canBuildAt(0, "gunNest", x, y).ok) at = { x, y };
  }
ok(!!at, "a gun nest fits somewhere inside the claim");
const far = G.canBuildAt(0, "gunNest", G.bases[0].x + 2600, G.bases[0].y);
ok(!far.ok, "the build line stops at the claim's edge");
const r = G.placeBuild(0, "gunNest", at.x, at.y);
ok(r.ok, "the nest is raised");
ok(G.world.buildings.length === before + 1, "it stands on the ground");
frames(700); // it builds itself
const nest = G.world.buildings[G.world.buildings.length - 1];
ok(nest.built && nest.kind === "gunNest", "the nest is finished");

/* ---------- training ---------- */
const factory = G.bldsOf(0, "foundry")[0];
ok(!!factory, "the factory stands");
const tr = G.trainUnit(0, factory, "scout");
ok(tr.ok, "a scout car is queued");
frames(400);
ok(factory.queue.length === 0, "the queue empties");
ok(
  G.unitsOf(0).length >= playerUnits.length - 2,
  "the army keeps its shape (" + G.unitsOf(0).length + ")",
);

/* ---------- the nations think ---------- */
frames(2400); // two minutes: they should have queued or built something
const kells = G.unitsOf(2);
ok(kells.length >= 4, "Kell has raised more guns (" + kells.length + ")");

/* ---------- the night ---------- */
G.clock = 149; // a second before the dark
frames(60);
ok(G.night, "the dark drops");
const dead = G.agents.filter((a) => a.st === 2).length;
ok(dead >= 3, "the nests wake (" + dead + " dead)");
frames(400);
ok(G.agents.length > 0, "the theatre is still standing");

/* ---------- the ending ---------- */
for (const b of G.world.buildings)
  if (b.kind === "hall" && b.fac >= 2) ((b.hp = 1), G.damageStruct(b, 9999, null));
// knock the other two halls down too
frames(20);
for (const b of G.world.buildings)
  if (b.kind === "hall" && b.fac >= 2 && !b.ruined) G.damageStruct(b, 9999, null);
frames(20);
ok(G.over === "won", "the last enemy hall ends the war");
ok(G.paused, "the card goes up");

console.log(fails ? "rts-smoke: " + fails + " FAILURES" : "rts-smoke: all green");
process.exit(fails ? 1 : 0);
