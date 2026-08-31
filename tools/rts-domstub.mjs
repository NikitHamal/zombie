/* rts-domstub.mjs — load the whole rts.html page under a Node DOM stub
   and pump frames. Catches load-order and runtime errors the sim-only
   headless harness cannot see (sprites, render, ui, minimap, main).

   Usage: node tools/rts-domstub.mjs [seed] [frames] */
import { readFileSync } from "node:fs";

const SEED = process.argv[2] ? parseInt(process.argv[2], 10) : 777;
const FRAMES = process.argv[3] ? parseInt(process.argv[3], 10) : 400;

/* ---------- canvas 2d context: a Proxy that swallows everything ---------- */

function makeCtx(cv) {
  const target = {
    canvas: cv,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    measureText: () => ({ width: 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

/* ---------- DOM element stub ---------- */

function makeEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    className: "",
    style: {},
    dataset: {},
    title: "",
    disabled: false,
    width: 300,
    height: 300,
    clientWidth: 300,
    clientHeight: 300,
    isConnected: true,
    _children: [],
    _text: "",
    get children() {
      return this._children;
    },
    get firstChild() {
      return this._children[0] || null;
    },
    set textContent(v) {
      this._text = String(v);
    },
    get textContent() {
      return this._text;
    },
    set innerHTML(v) {
      this._children = [];
      this._text = String(v);
    },
    get innerHTML() {
      return this._text;
    },
    appendChild(c) {
      this._children.push(c);
      c.parentNode = this;
      return c;
    },
    removeChild(c) {
      const i = this._children.indexOf(c);
      if (i >= 0) this._children.splice(i, 1);
      return c;
    },
    classList: {
      _s: new Set(),
      add(...c) {
        for (const x of c) this._s.add(x);
      },
      remove(...c) {
        for (const x of c) this._s.delete(x);
      },
      toggle(c, force) {
        const on = force === undefined ? !this._s.has(c) : !!force;
        if (on) this._s.add(c);
        else this._s.delete(c);
        return on;
      },
      contains(c) {
        return this._s.has(c);
      },
    },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300 };
    },
    getContext(kind) {
      if (kind === "2d" && !this._ctx) this._ctx = makeCtx(this);
      return this._ctx || null;
    },
  };
  return el;
}

/* ---------- window / document ---------- */

const listeners = {};
globalThis.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 800;
globalThis.devicePixelRatio = 1;
globalThis.location = {
  search: "?seed=" + SEED,
  href: "file:///home/user/zombie/rts.html",
  reload() {},
};
globalThis.addEventListener = (ev, cb) => {
  (listeners[ev] = listeners[ev] || []).push(cb);
};
globalThis.removeEventListener = () => {};
let rafCb = null;
globalThis.requestAnimationFrame = (cb) => {
  rafCb = cb;
  return 1;
};
globalThis.cancelAnimationFrame = () => {};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });

const byId = {};
globalThis.document = {
  hidden: false,
  visibilityState: "visible",
  body: makeEl("body"),
  addEventListener(ev, cb) {
    (listeners["doc:" + ev] = listeners["doc:" + ev] || []).push(cb);
  },
  removeEventListener() {},
  getElementById(id) {
    if (!byId[id]) byId[id] = makeEl(id === "view" || id === "mini" ? "canvas" : "div");
    return byId[id];
  },
  createElement(tag) {
    return makeEl(tag);
  },
};

/* ---------- load the scripts, in the rts.html order ---------- */

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
  "js/rts/sprites.js",
  "js/rts/render.js",
  "js/rts/minimap.js",
  "js/rts/ui.js",
  "js/rts/main.js",
];

for (const f of FILES) {
  const code = readFileSync(new URL("../" + f, import.meta.url), "utf8");
  try {
    new Function(code)();
  } catch (e) {
    console.error("LOAD FAIL " + f + ": " + e.stack.split("\n").slice(0, 4).join("\n"));
    process.exit(1);
  }
}

/* ---------- fire DOMContentLoaded and pump frames ---------- */

try {
  for (const cb of listeners["DOMContentLoaded"] || []) cb();
} catch (e) {
  console.error("BOOT FAIL: " + e.stack.split("\n").slice(0, 6).join("\n"));
  process.exit(1);
}

const t0 = 1000;
for (let i = 0; i < FRAMES; i++) {
  const cb = rafCb;
  rafCb = null;
  if (!cb) {
    console.error("no rAF scheduled at frame " + i);
    break;
  }
  try {
    cb(t0 + i * 16.7);
  } catch (e) {
    console.error(
      "FRAME FAIL @" + (t0 + i * 16.7).toFixed(0) + ": " + e.stack.split("\n").slice(0, 6).join("\n"),
    );
    process.exit(1);
  }
}

const g = globalThis.ZS.debug.rts.g;
const cam = globalThis.ZS.debug.rts.cam;
// fly the camera around a few different places so different art paths
// get drawn: home base, an AI base, a naval site, the rail
const sites = g.t.sites;
const stops = [
  g.t.homeSite,
  sites.find((s) => s.owner >= 1) || sites[1],
  sites.find((s) => s.kind === "naval") || sites[2],
  sites.find((s) => s.kind === "train") || sites[3],
];
for (const s of stops) {
  cam.x = s.x;
  cam.y = s.y;
  cam.zoom = 1.2;
  for (let i = 0; i < 40; i++) {
    const cb = rafCb;
    rafCb = null;
    if (!cb) break;
    try {
      cb(t0 + (FRAMES + i) * 16.7 + (stops.indexOf(s) * 600 + i) * 16.7);
    } catch (e) {
      console.error(
        "PAN FAIL @" + s.name + ": " + e.stack.split("\n").slice(0, 6).join("\n"),
      );
      process.exit(1);
    }
  }
}

// exercise every unit and building shape directly, once, through the
// real draw dispatch (the in-game mix may skip a silhouette)
const R = globalThis.ZS.RTS;
const cv = byId["view"];
const c = cv.getContext("2d");
let drew = 0;
for (const key of R.UKEYS) {
  const def = R.UDEF[key];
  const fake = {
    x: 100,
    y: 100,
    va: -0.5,
    a: -0.5,
    turretA: -0.5,
    fac: 0,
    seed: 4.4,
    gait: 1.2,
    tread: 0.3,
    rotor: 1.1,
    alt: def.cls === "air" ? 30 : 0,
    recoil: 0,
    flash: 0,
    vx: 10,
    vy: 0,
    def,
    key,
    hp: def.hp,
    maxHp: def.hp,
    dmgFlash: 0,
  };
  try {
    R.Sprites.unitIcon(c, key, 100, 100, 46);
    R.Sprites.unit(c, fake, 1.23, g);
    drew++;
  } catch (e) {
    console.error("UNIT DRAW FAIL " + key + ": " + e.stack.split("\n").slice(0, 4).join("\n"));
    process.exit(1);
  }
}
for (const b of g.buildings) {
  if (b.dead) continue;
  try {
    R.Sprites.building(c, b, 1.23, g);
    drew++;
  } catch (e) {
    console.error("BLD DRAW FAIL " + b.key + " (" + b.fac + "): " + e.stack.split("\n").slice(0, 4).join("\n"));
    process.exit(1);
  }
}
// every buildable key, as a ghost and an icon
for (const key of Object.keys(R.BDEF)) {
  try {
    R.Sprites.ghost(c, key, 2, 2, true, g);
    R.Sprites.icon(c, key, 100, 100, 40);
    drew++;
  } catch (e) {
    console.error("GHOST/ICON FAIL " + key + ": " + e.stack.split("\n").slice(0, 4).join("\n"));
    process.exit(1);
  }
}

/* ---------- exercise the UI deck paths under the stub DOM ---------- */

const UI = R.UI;
UI.toggleBuild(true);
for (const tab of ["econ", "mil", "def", "cmd", "ledger"]) {
  UI.buildTab = tab;
  UI.refreshDeck(true);
}
UI.toggleBuild(false);
// single building, single unit, multi unit decks
const works = g.buildings.find((b) => !b.dead && b.fac === 0 && b.key === "works");
if (works) {
  g.select([works], false);
  UI.refreshDeck(true);
}
const mine = g.units.filter((u) => !u.dead && u.fac === 0);
g.select(mine.slice(0, 1), false);
UI.refreshDeck(true);
if (mine.length > 1) {
  g.select(mine.slice(0, Math.min(6, mine.length)), false);
  UI.refreshDeck(true);
}
UI.queueUnit(works, "lynx");
g.clearSel();
// the gold ledger under the stub: buy what the books allow
const f = g.factions[0];
f.gold = Math.max(f.gold, 120);
for (const L of R.GOLD_LEDGER) {
  const why = R.Economy.buyGoldItem(g, f, L.key);
  if (why && why !== "not enough gold") {
    // flak armor can fail on enemy proximity; instant on store limits
    console.log("ledger note: " + L.key + " -> " + why);
  }
}
UI.showResult({ won: true, why: "stub", time: g.time, stats: {} });

console.log(
  "OK — " + FRAMES + " frames + pan + " + drew + " draws; t=" + g.time.toFixed(0) +
    " units=" + g.units.filter((u) => !u.dead).length +
    " buildings=" + g.buildings.filter((b) => !b.dead).length +
    " gold=" + Math.floor(f.gold) +
    " over=" + g.over,
);
