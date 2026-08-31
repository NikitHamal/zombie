/* Headless sim harness for the RTS — no browser needed.

   The page needs a GPU and a DOM; the *simulation* does not. This loads
   exactly the files that carry game state and rules (core, terrain, nav,
   defs, game and the systems), stubs the two DOM calls terrain.js makes,
   and hands back a live `ZS.RTS` you can poke at from node.

   Use it to ask questions that are expensive to ask by eye: can a tank
   actually leave the base? Is anything standing inside a building? Does
   the economy stay solvent for an hour?

   Run: node tools/rts-headless.mjs            (run the built-in checks)
        node tools/rts-headless.mjs --repl     (drop into a REPL on the game)
        node tools/rts-headless.mjs --t=600    (simulate 600 seconds first) */

import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/* The load order is the page's load order, minus the files that only
   draw things. sprite/render/minimap/ui/main are deliberately absent. */
const FILES = [
  "js/sketch.js",
  "js/grid.js",
  "js/camera.js",
  "js/sound.js",
  "js/village/perf.js",
  "js/rts/core.js",
  "js/rts/camera.js",
  "js/rts/terrain.js",
  "js/rts/nav.js",
  "js/rts/defs.js",
  "js/rts/game.js",
  "js/rts/fx.js",
  "js/rts/combat.js",
  "js/rts/entity.js",
  "js/rts/base.js",
  "js/rts/economy.js",
  "js/rts/territory.js",
  "js/rts/ai.js",
  "js/rts/horde.js",
];

/* ---------- the smallest DOM that terrain.js will accept ---------- */

function stubCanvas() {
  const ctx = new Proxy(
    {},
    {
      get(_t, k) {
        if (k === "canvas") return { width: 1, height: 1 };
        if (k === "createLinearGradient" || k === "createRadialGradient")
          return () => ({ addColorStop() {} });
        if (k === "measureText") return () => ({ width: 0 });
        if (k === "getImageData") return (a, b) => ({ data: new Uint8ClampedArray(a * b * 4) });
        if (k === "createImageData")
          return (a, b) => ({ data: new Uint8ClampedArray(a * b * 4) });
        return () => undefined;
      },
      set() {
        return true;
      },
    },
  );
  return {
    width: 1,
    height: 1,
    style: {},
    getContext: () => ctx,
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
  };
}

function makeSandbox() {
  const document = {
    createElement: (t) => (t === "canvas" ? stubCanvas() : { style: {}, addEventListener() {} }),
    getElementById: () => null,
    addEventListener() {},
    body: { appendChild() {} },
  };
  const sandbox = {
    document,
    console,
    Math,
    Date,
    JSON,
    Object,
    Array,
    Map,
    Set,
    WeakMap,
    Proxy,
    Promise,
    String,
    Number,
    Boolean,
    Error,
    isNaN,
    isFinite,
    parseInt,
    parseFloat,
    Uint8Array,
    Uint8ClampedArray,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
    devicePixelRatio: 1,
    navigator: { hardwareConcurrency: 8, userAgent: "node" },
    innerWidth: 1440,
    innerHeight: 900,
    requestAnimationFrame: () => 0,
    addEventListener() {},
    localStorage: {
      _d: {},
      getItem(k) {
        return k in this._d ? this._d[k] : null;
      },
      setItem(k, v) {
        this._d[k] = String(v);
      },
      removeItem(k) {
        delete this._d[k];
      },
    },
    location: { search: "", href: "file:///", protocol: "file:" },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return sandbox;
}

export function boot(seed) {
  const sandbox = makeSandbox();
  vm.createContext(sandbox);
  for (const rel of FILES) {
    const p = resolve(root, rel);
    vm.runInContext(fs.readFileSync(p, "utf8"), sandbox, { filename: rel });
  }
  const ZS = sandbox.ZS;
  ZS.Perf.init();
  const R = ZS.RTS;
  const g = new R.Game(seed >>> 0);
  g.start();
  return { ZS, R, g, sandbox };
}

// step the sim forward without drawing anything
export function run(g, seconds, dt) {
  dt = dt || 1 / 30;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) g.update(dt);
  return g;
}

/* ======================================================================
   the checks
   ====================================================================== */

const PROBLEMS = [];
function check(name, ok, detail) {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (detail ? "  — " + detail : ""));
  if (!ok) PROBLEMS.push(name + (detail ? ": " + detail : ""));
}

function main() {
  const args = process.argv.slice(2);
  const secs = Number(args.find((a) => a.startsWith("--t="))?.slice(4) || 0);
  const seed = Number(args.find((a) => /^\d+$/.test(a)) || 20260830);

  console.log("seed " + seed + "\n");
  const { R, g } = boot(seed);
  const TILE = R.TILE;

  /* ---- 1. nothing may stand inside a building footprint ---- */
  // ask as the unit itself: standing on your own gate is legal
  const insideBuilding = [];
  for (const u of g.units) {
    if (u.dead || u.inside || u.layer === 1) continue;
    if (!g.nav.openAt(u.x, u.y, u.layer, u.fac)) insideBuilding.push(u.key);
  }
  check(
    "no unit starts inside a building",
    insideBuilding.length === 0,
    insideBuilding.length ? insideBuilding.join(", ") : "",
  );

  /* ---- 2. the garrison can reach open ground outside the wall ---- */
  const home = g.t.homeSite;
  const outside = g.nav.nearestOpen(home.tx + 26, home.ty + 26, 20, 0);
  const garrison = g.units.filter((u) => !u.dead && u.fac === 0 && u.layer === 0);
  let reachable = 0;
  if (outside) {
    const gx = (outside.tx + 0.5) * TILE,
      gy = (outside.ty + 0.5) * TILE;
    // as faction 0: our own gate opens for us
    for (const u of garrison) if (g.nav.astar(u.x, u.y, gx, gy, 0, 0)) reachable++;
  }
  check(
    "the garrison can path out of the base",
    garrison.length > 0 && reachable === garrison.length,
    reachable + "/" + garrison.length + " found a route",
  );

  /* ---- 3. an enemy APC can path INTO the base ---- */
  // A conquering APC asks as faction 1 with breach rights: it may walk
  // our gate only if it were an ally (it is not) and may chew a wall at
  // a price. The cautious query — no faction — must stay shut out.
  const apcSpot = outside
    ? { x: (outside.tx + 0.5) * TILE, y: (outside.ty + 0.5) * TILE }
    : null;
  let apcRoute = null;
  if (apcSpot) apcRoute = g.nav.astar(apcSpot.x, apcSpot.y, home.x, home.y, 0, 1, true);
  check(
    "an enemy can path to the command centre",
    !!apcRoute,
    apcRoute ? apcRoute.length + " waypoints" : "no route at all — the base is sealed",
  );
  // where does the route cross the wall ring? The design says the door,
  // and the flaks that watch it. Count crossings over gate tiles vs
  // wall tiles — the goal tile itself sits inside, so walk every leg.
  if (apcRoute) {
    let gateLegs = 0,
      wallLegs = 0;
    for (let k = 0; k < apcRoute.length; k++) {
      const p = apcRoute[k],
        q = apcRoute[k + 1] || p;
      const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (TILE * 0.5)));
      for (let s = 0; s <= steps; s++) {
        const x = p.x + ((q.x - p.x) * s) / steps,
          y = p.y + ((q.y - p.y) * s) / steps;
        const tx = Math.floor(x / TILE),
          ty = Math.floor(y / TILE);
        const i = g.t.idx(tx, ty);
        if (i < 0) continue;
        if (g.nav.gateOf[i] >= 0) gateLegs++;
        else if (g.nav.bFac[i] >= 0) wallLegs++;
      }
    }
    const throughGate = gateLegs > 0;
    check(
      "the enemy route prefers the gate to the walls",
      throughGate,
      gateLegs + " gate steps vs " + wallLegs + " wall steps",
    );
  }
  const cautious = apcSpot ? g.nav.astar(apcSpot.x, apcSpot.y, home.x, home.y, 0) : null;
  check("a neutral query cannot just walk in", !cautious, cautious ? "the door opened for a stranger" : "door shut");

  /* ---- 4. the eight starter flaks ---- */
  const flaks = g.buildings.filter((b) => !b.dead && b.fac === 0 && b.def.startFlak);
  check("the base opens with 8 starter flaks", flaks.length === 8, flaks.length + " found");

  /* ---- 5. run it, then look again ---- */
  if (secs > 0) {
    run(g, secs);
    console.log("\nafter " + secs + "s of sim (t=" + g.time.toFixed(0) + "):");
    let stuck = 0;
    for (const u of g.units) {
      if (u.dead || u.inside || u.layer === 1) continue;
      if (!g.nav.openAt(u.x, u.y, u.layer, u.fac)) stuck++;
    }
    check("no unit ends up inside a building", stuck === 0, stuck + " embedded");
    const p = g.factions[0];
    console.log(
      "  player: " +
        g.units.filter((u) => !u.dead && u.fac === 0).length +
        " units, " +
        g.buildings.filter((b) => !b.dead && b.fac === 0).length +
        " buildings, sites " +
        p.sites +
        ", res " +
        Object.entries(p.res)
          .map(([k, v]) => k + " " + Math.round(v))
          .join(" · "),
    );
  }

  console.log("");
  if (PROBLEMS.length) {
    console.log("FAIL — " + PROBLEMS.length + " problem(s)");
    process.exit(1);
  }
  console.log("PASS — all green");
}

if (process.argv[1] && process.argv[1].endsWith("rts-headless.mjs")) main();
