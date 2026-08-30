/* The overlay: the roster panel, giving work from it, the placement ghost,
   and the promise underneath all of it — a button under the cursor is not
   rebuilt while you are reaching for it.
   Run: node .verify/ui-smoke.js */
const { ZS, G, frames, key, press, click, els } = require("./harness");

const fails = [];
function check(ok, label, extra) {
  if (ok) console.log("  ok   " + label + (extra ? "  — " + extra : ""));
  else {
    console.log("  FAIL " + label + (extra ? "  — " + extra : ""));
    fails.push(label);
  }
}

console.log("The Hollow — the overlay\n");
frames(20);

/* ---- the roster ---- */
key("v");
check(G.mode === "villagers", "V opens the roster", G.mode);
const roster = els.panel.innerHTML;
check(
  roster.indexOf("mara") >= 0 || roster.indexOf("villagers") >= 0,
  "the roster has names in it",
);
check(roster.indexOf('data-act="pick"') >= 0, "every villager is a clickable row");

const first = G.villagers()[0];
press("panel", "pick", undefined, String(first.uid));
check(G.sel && G.sel.o === first, "clicking a name picks that villager out", first.name);
const tray = els.panel.innerHTML;
check(tray.indexOf('data-act="job"') >= 0, "the job tray opens under the picked name");
check(tray.indexOf("data-who=") >= 0, "each job button knows who it is for");

// give somebody a job from the panel, with nothing selected on the card
const second = G.villagers()[1];
press("panel", "job", "wood", String(second.uid));
check(
  second.job === "wood",
  "a job given from the roster sticks",
  second.name + " → " + second.job,
);

// and from the selection card as well
G.selectVillager(first);
press("sel", "job", "guard", undefined);
check(first.job === "guard", "the card hands out work too", first.name + " → " + first.job);

// the bar buttons open the panels (and the same button closes them again)
click("roles");
check(G.mode === null, "the roles button closes an open roster");
click("roles");
check(G.mode === "villagers", "and opens it again");
click("buildb");
check(G.mode === "build", "the build button opens the build menu");
click("workb");
check(G.mode === "research", "the workshop button opens the research");
key("Escape");
check(G.mode === null, "escape closes the panel");

/* ---- the placement ghost ---- */
G.res.wood = 400;
G.res.stone = 400;
G.openBuild();
frames(2);
check(G.mode === "build", "the build menu is open");
press("panel", "build", "hut");
check(G.armed === "hut", "picking a hut arms it", G.armed);

const cv = els.c;
check(!!cv, "there is a canvas to point at");
// a pointer move over the canvas must move the ghost, with no drag in progress
const cam = ZS.debug.cam;
G._hoverAt(cam.x, cam.y);
frames(2);
check(G.hover && G.hover.x === cam.x, "the cursor is tracked in world coordinates");
cv.dispatch("pointermove", { clientX: 700, clientY: 420, pointerId: 1 });
frames(2);
const p = cam.toWorld(700, 420, 1440, 900);
check(
  G.hover && Math.abs(G.hover.x - p.x) < 1 && Math.abs(G.hover.y - p.y) < 1,
  "moving the pointer moves the ghost",
  Math.round(G.hover.x) + "," + Math.round(G.hover.y),
);
// and the frame with a live ghost must draw without complaint
let threw = null;
try {
  frames(10);
} catch (e) {
  threw = e;
}
check(!threw, "the ghost draws every frame", threw ? threw.message : "10 frames");

// placing it: a tap on the ground where the ghost is
const before = G.world.buildings.length;
ZS.Sim.tap(G.world, G.hover.x, G.hover.y, {});
check(G.world.buildings.length === before + 1, "clicking sets the site down");
const put = G.world.buildings[G.world.buildings.length - 1];
check(
  isFinite(put.x) &&
    isFinite(put.y) &&
    Math.abs(put.x + put.w / 2 - G.hover.x) < 1 &&
    Math.abs(put.y + put.h / 2 - G.hover.y) < 1,
  "and it lands centred on the ghost",
  Math.round(put.x + put.w / 2) +
    "," +
    Math.round(put.y + put.h / 2) +
    " vs " +
    Math.round(G.hover.x) +
    "," +
    Math.round(G.hover.y),
);
G.cancelMode();

/* ---- the promise: nothing under the cursor is rebuilt ---- */
G.selectVillager(G.villagers()[0]);
key("v");
frames(5);
// The promise is that it is not rebuilt *every* frame — a health bar that
// moves must move, but 60 frames may not mean 60 rebuilds.
let lastHtml = els.panel.innerHTML;
let moved = 0;
for (let i = 0; i < 60; i++) {
  frames(1);
  if (els.panel.innerHTML !== lastHtml) {
    moved++;
    lastHtml = els.panel.innerHTML;
  }
}
check(moved <= 8, "the roster is not rebuilt every frame", moved + " rebuilds in 60 frames");

const card = els.sel.innerHTML;
let cardMoved = 0;
for (let i = 0; i < 60; i++) {
  frames(1);
  if (els.sel.innerHTML !== card) cardMoved++;
}
check(cardMoved === 0, "neither is the card", cardMoved + " repaints in 60 frames");

// but a real change does get through
G.setJob(G.villagers()[0], "farm");
frames(2);
check(els.panel.innerHTML !== lastHtml, "changing a job does repaint the roster");
check(els.sel.innerHTML !== card, "and the card");

/* ---- the overlay is part of the game, not a caller beside it ---- */
// A frame can land before the page has bound the overlay to the scenario
// (main.js starts the loop the moment the scenario exists). It must not
// throw — it must bind itself.
const UI = ZS.VillageUI;
const keptScen = UI.scen;
UI.scen = null;
let boundThrew = null;
try {
  UI.tick(0.016);
  UI.refresh(true);
  UI.paintAlerts();
} catch (e) {
  boundThrew = e;
}
check(
  !boundThrew,
  "a frame that lands before the binding does not throw",
  boundThrew ? boundThrew.message : "bound itself",
);
check(UI.scen === keptScen, "and binds itself to the live scenario", !!UI.scen);
check(
  ZS.scenario && !!UI.el.clock,
  "the binding is the same one the page would make",
  "clock " + (UI.el.clock ? "bound" : "missing"),
);

/* ---- a long run with the panels open ---- */
let err = null;
try {
  G.setSpeed(3);
  const guard = { n: 0 };
  while (G.day < 4 && guard.n++ < 4000) {
    frames(1);
    if (G.card) G.dismissCard();
  }
} catch (e) {
  err = e;
}
check(!err, "it runs with the overlay up", err ? err.message : "to day " + G.day);

console.log(
  fails.length ? "\n" + fails.length + " FAILED: " + fails.join(", ") : "\nall checks passed",
);
process.exit(fails.length ? 1 : 0);
