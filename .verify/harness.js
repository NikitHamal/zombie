/* A headless harness for The Hollow: enough DOM, canvas and storage for the
   real page to boot, and a step function so a test can drive frame after
   frame without a browser. Nothing here is imported by the game — the files
   are loaded in page order, exactly as index.html loads them.

   ZS_SEED pins the map (otherwise every run is a new village). */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SEED = process.env.ZS_SEED || "20250830";

/* ---------- the smallest honest canvas ---------- */
function ctx2d(canvas) {
  const noop = () => {};
  const c = {
    canvas,
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    bezierCurveTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    ellipse: noop,
    rect: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    fillText: noop,
    strokeText: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setTransform: noop,
    resetTransform: noop,
    transform: noop,
    drawImage: noop,
    setLineDash: noop,
    getLineDash: () => [],
    measureText: (t) => ({ width: (t || "").length * 6 }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    getImageData: (x, y, w, h) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
      width: w,
      height: h,
    }),
    putImageData: noop,
  };
  // anything the hand has not thought of: a property that swallows writes
  return new Proxy(c, {
    get(t, k) {
      if (k in t) return t[k];
      return undefined;
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

function makeEl(tag, id) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    id: id || "",
    style: {},
    dataset: {},
    children: [],
    _cls: new Set(),
    _html: "",
    textContent: "",
    width: 1440,
    height: 900,
    title: "",
    clientWidth: 1440,
    clientHeight: 900,
    listeners: {},
    classList: {
      add: (...n) => n.forEach((x) => el._cls.add(x)),
      remove: (...n) => n.forEach((x) => el._cls.delete(x)),
      toggle: (n, on) => {
        const want = on === undefined ? !el._cls.has(n) : !!on;
        if (want) el._cls.add(n);
        else el._cls.delete(n);
        return want;
      },
      contains: (n) => el._cls.has(n),
    },
    get innerHTML() {
      return el._html;
    },
    set innerHTML(v) {
      el._html = String(v);
    },
    getContext() {
      if (!el._ctx) el._ctx = ctx2d(el);
      return el._ctx;
    },
    addEventListener(type, fn) {
      (el.listeners[type] = el.listeners[type] || []).push(fn);
    },
    removeEventListener() {},
    appendChild(k) {
      el.children.push(k);
      return k;
    },
    removeChild() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 1440, height: 900, top: 0, left: 0 }),
    setPointerCapture() {},
    releasePointerCapture() {},
    focus() {},
    blur() {},
    remove() {},
    dispatch(type, ev) {
      for (const fn of el.listeners[type] || []) fn(ev || {});
    },
  };
  return el;
}

/* ---------- the world's window ---------- */
const els = {};
const rafQueue = [];
let reloaded = false;

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
};

const document = {
  body: makeEl("body"),
  documentElement: makeEl("html"),
  createElement: (tag) => makeEl(tag),
  getElementById(id) {
    if (!els[id]) els[id] = makeEl(id === "c" ? "canvas" : "div", id);
    return els[id];
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
};

const win = {
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 1,
  document,
  performance: { now: () => nowMs },
  requestAnimationFrame(fn) {
    rafQueue.push(fn);
    return rafQueue.length;
  },
  cancelAnimationFrame() {},
  addEventListener(type, fn) {
    (winHandlers[type] = winHandlers[type] || []).push(fn);
  },
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  localStorage,
  location: { search: "?seed=" + SEED, reload: () => (reloaded = true) },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t),
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
};
const winHandlers = {};
let nowMs = 0;

// the page's globals, as the browser would have them
globalThis.window = win;
globalThis.document = document;
globalThis.localStorage = localStorage;
globalThis.requestAnimationFrame = win.requestAnimationFrame;
globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
globalThis.performance = win.performance;
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = win.innerWidth;
globalThis.innerHeight = win.innerHeight;
globalThis.location = win.location;
if (!globalThis.navigator) globalThis.navigator = { userAgent: "node" };
globalThis.AudioContext = undefined; // sound stays silent and unlocked-less
globalThis.Path2D = class Path2D {
  constructor() {}
  moveTo() {}
  lineTo() {}
  closePath() {}
  arc() {}
};
globalThis.Image = class Image {
  constructor() {
    this.width = 1;
    this.height = 1;
  }
  addEventListener() {}
};
globalThis.HTMLElement = class HTMLElement {};

/* ---------- load the page ---------- */
// the file order comes from index.html itself, so it cannot drift
const page = fs
  .readFileSync(path.join(ROOT, "index.html"), "utf8")
  .split("\n")
  .map((l) => (/<script src="([^"]+)"/.exec(l) || [])[1])
  .filter(Boolean);
// the inline script that names the world (it lives on window, as in a page)
// ZS_RNG pins the dice: with it, two builds of the game play the *same*
// evening, and any difference between them is a difference in the game.
const RNG = process.env.ZS_RNG ? +process.env.ZS_RNG : 0;
if (RNG) {
  let s = RNG | 0 || 1;
  Math.random = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
win.ZS_WW = 2200;
win.ZS_WH = 1600;
win.ZS_SCEN = "ScenarioVillage";
globalThis.ZS_WW = win.ZS_WW;
globalThis.ZS_WH = win.ZS_WH;
globalThis.ZS_SCEN = win.ZS_SCEN;
for (const f of page) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  vm.runInThisContext(src, { filename: f });
}

const ZS = win.ZS || globalThis.ZS;
globalThis.ZS = ZS;
// the page's last line
if (ZS.VillageUI) ZS.VillageUI.init(ZS.scenario);
const G = ZS.scenario;

/* ---------- driving it ---------- */
function frames(n) {
  for (let i = 0; i < n; i++) {
    nowMs += 150; // one frame is 150 ms of wall clock, as the page sees it
    const q = rafQueue.splice(0, rafQueue.length);
    for (const fn of q) fn(nowMs);
  }
}

function key(k, extra) {
  const e = Object.assign(
    {
      key: k,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault() {},
      stopPropagation() {},
    },
    extra || {},
  );
  for (const fn of winHandlers.keydown || []) fn(e);
}

// press one of the overlay's rows/buttons the way a pointer does
function press(el, act, arg, who) {
  const node = { dataset: { act, arg, who }, closest: () => node };
  const ev = { target: node, preventDefault() {}, stopPropagation() {} };
  for (const fn of (els[el] && els[el].listeners.pointerdown) || []) fn(ev);
}

function click(id) {
  const e = els[id];
  if (e) for (const fn of e.listeners.click || []) fn({ preventDefault() {} });
}

function snap(file, w, h) {
  if (!file) return;
  fs.writeFileSync(file, Buffer.alloc(0));
}

module.exports = {
  ZS,
  G,
  frames,
  key,
  press,
  click,
  els,
  winHandlers,
  store,
  snap,
  now: () => nowMs,
  reloaded: () => reloaded,
};
