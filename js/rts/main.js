/* SANDSTORM — the bootstrap.

   Makes the world, wires the input, and runs the loop. The order of the
   <script> tags in rts.html is the load order, and it matters: core,
   then the tables, then the systems, then this.

   Input is the whole of the game's vocabulary, so it is worth stating
   plainly:

     left drag         box select
     left click        select one thing
     double click      select every one of that kind on screen
     right click       move, or attack whatever is under the cursor
     middle drag       pan
     wheel             zoom on the cursor

   and the rest of it (attack-move, patrol, control groups, build
   hotkeys) is on the keys printed in the help page. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});
  const TILE = R.TILE;

  const App = {
    canvas: null,
    ctx: null,
    g: null,
    cam: null,
    vw: 0,
    vh: 0,
    dpr: 1,
    armed: null, // an order waiting for a map click
    drag: null, // {x0,y0,x1,y1,mode}
    pan: null, // {x,y}
    mx: 0,
    my: 0,
    lastClickT: 0,
    lastClickId: 0,
    lastAlarm: null,
    t0: 0,
    time: 0,

    /* ==================================================================
       boot
       ================================================================== */

    boot() {
      const q = new URLSearchParams(location.search);
      let seed = q.get("seed");
      seed =
        seed !== null && seed !== ""
          ? parseInt(seed, 10) >>> 0
          : (Math.random() * 0xffffffff) >>> 0;
      this.seed = seed;

      this.canvas = document.getElementById("view");
      this.ctx = this.canvas.getContext("2d");

      ZS.Perf.init();
      ZS.Perf.onTier = () => this.resize();

      const g = (this.g = new R.Game(seed));
      g.ctx = this.ctx;
      g.start();

      const cam = (this.cam = new ZS.Camera({ w: R.W, h: R.H }));
      R.Cam.init(cam);
      cam.minZoom = 0.16;
      cam.maxZoom = 2.0;
      cam.zoom = 0.8;

      R.Render.init();
      R.UI.init(g, this);

      // open on the home base, looking at the whole yard
      const home = g.t.homeSite;
      cam.x = home.x;
      cam.y = home.y;
      cam.zoom = 0.9;
      cam.clamp(this.vw || window.innerWidth, this.vh || window.innerHeight);

      this.resize();
      this.bind();

      g.say(
        0,
        "The company holds " + home.name + ". Five nations want the sand — go and take some.",
        "good",
      );
      g.say(
        0,
        "F1 opens the manual. The short version: take ground, build on it, and put flak over it.",
      );

      this.t0 = performance.now();
      requestAnimationFrame((t) => this.loop(t));
      window.ZS.debug = window.ZS.debug || {};
      window.ZS.debug.rts = { g, cam, app: this };
      return this;
    },

    resize() {
      const dpr = Math.min(ZS.Perf.dprCap(), window.devicePixelRatio || 1);
      const vw = window.innerWidth,
        vh = window.innerHeight;
      this.dpr = dpr;
      this.vw = vw;
      this.vh = vh;
      this.canvas.width = Math.round(vw * dpr);
      this.canvas.height = Math.round(vh * dpr);
      this.canvas.style.width = vw + "px";
      this.canvas.style.height = vh + "px";
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cam.clamp(vw, vh);
      if (R.Mini.canvas) R.Mini.resize(236);
    },

    /* ==================================================================
       input
       ================================================================== */

    bind() {
      const cv = this.canvas;
      window.addEventListener("resize", () => this.resize());

      cv.addEventListener("contextmenu", (e) => e.preventDefault());

      cv.addEventListener("pointerdown", (e) => this.onDown(e));
      window.addEventListener("pointermove", (e) => {
        this.onMove(e);
        if (this.miniDrag) this.onMini(e, false);
      });
      window.addEventListener("pointerup", (e) => {
        this.onUp(e);
        this.miniDrag = false;
      });
      cv.addEventListener("pointerleave", () => R.Cam.mouseLeave());
      cv.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const f = Math.pow(0.9988, e.deltaY);
          R.Cam.zoomAt(e.clientX, e.clientY, f, this.vw, this.vh);
        },
        { passive: false },
      );

      window.addEventListener("keydown", (e) => this.onKey(e, true));
      window.addEventListener("keyup", (e) => this.onKey(e, false));
      window.addEventListener("blur", () => {
        R.Cam.keys = Object.create(null);
      });

      // first gesture unlocks the audio
      const unlock = () => {
        if (ZS.sound) ZS.sound.unlock();
        window.removeEventListener("pointerdown", unlock);
      };
      window.addEventListener("pointerdown", unlock);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && !this.g.paused) this.wasPaused = false;
      });
    },

    toWorld(sx, sy) {
      return this.cam.toWorld(sx, sy, this.vw, this.vh);
    },

    localE(e) {
      return { x: e.clientX, y: e.clientY };
    },

    /* ---------- minimap ---------- */

    onMini(e, down) {
      if (down) {
        this.miniDrag = true;
        e.preventDefault();
        e.stopPropagation();
      }
      if (!this.miniDrag || !R.Mini.canvas) return;
      const rect = R.Mini.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left,
        py = e.clientY - rect.top;
      const k = R.W / (rect.width || 1);
      const x = R.clamp(px * k, 0, R.W),
        y = R.clamp(py * k, 0, R.H);
      R.Cam.centerOn(x, y, this.vw, this.vh);
    },

    /* ---------- pointer ---------- */

    onDown(e) {
      if (this.g.over) return;
      if (ZS.sound) ZS.sound.unlock();
      const sx = e.clientX,
        sy = e.clientY;
      if (R.Mini.hitTest(sx, sy)) return;

      this.mx = sx;
      this.my = sy;

      /* ---- middle button (or a held space): pan ---- */
      if (e.button === 1 || (e.button === 0 && this.spaceHeld)) {
        this.pan = { x: sx, y: sy };
        e.preventDefault();
        return;
      }

      if (e.button === 2) {
        this.onRight(e);
        return;
      }
      if (e.button !== 0) return;

      /* ---- placing a building ---- */
      if (R.UI.place) {
        this.tryPlace(e);
        return;
      }

      /* ---- setting a rally point (armed with the button) ---- */
      if (R.UI.rally) {
        const w = this.toWorld(sx, sy);
        const sel = this.g.selection();
        for (const b of sel) if (b.kind === "b" && R.PRODUCES[b.key]) b.rally = { x: w.x, y: w.y };
        R.UI.rally = false;
        R.FX.marker(this.g, w.x, w.y, "move");
        return;
      }

      /* ---- an armed order (attack-move, patrol…) ---- */
      if (this.armed) {
        this.applyArmed(sx, sy, e.shiftKey);
        return;
      }

      /* ---- box select ---- */
      this.drag = { x0: sx, y0: sy, x1: sx, y1: sy, moved: false, add: e.shiftKey || e.ctrlKey };
    },

    onMove(e) {
      this.mx = e.clientX;
      this.my = e.clientY;
      R.Cam.mouseMove(e.clientX, e.clientY);

      if (this.pan) {
        this.cam.panBy(e.clientX - this.pan.x, e.clientY - this.pan.y, this.vw, this.vh);
        this.pan.x = e.clientX;
        this.pan.y = e.clientY;
        return;
      }
      if (this.drag) {
        this.drag.x1 = e.clientX;
        this.drag.y1 = e.clientY;
        if (Math.abs(this.drag.x1 - this.drag.x0) > 3 || Math.abs(this.drag.y1 - this.drag.y0) > 3)
          this.drag.moved = true;
        R.Render.box = this.drag.moved ? this.drag : null;
        return;
      }
      if (R.UI.place) {
        const w = this.toWorld(e.clientX, e.clientY);
        const tx = Math.floor(w.x / TILE),
          ty = Math.floor(w.y / TILE);
        const def = R.BDEF[R.UI.place];
        // hold the cursor on the middle of the footprint
        const ox = Math.floor((def.size - 1) / 2);
        const gx = R.clamp(tx - ox, 0, R.MAPW - def.size),
          gy = R.clamp(ty - ox, 0, R.MAPH - def.size);
        const why = R.Base.blockReason(this.g, R.UI.place, 0, gx, gy);
        R.Render.ghost = { key: R.UI.place, tx: gx, ty: gy, ok: !why, reason: why };
      } else if (R.Render.ghost) R.Render.ghost = null;
    },

    onUp(e) {
      if (this.pan) {
        this.pan = null;
        return;
      }
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      R.Render.box = null;

      if (!d.moved) {
        this.clickSelect(e);
        return;
      }
      // a real box: select everything of yours inside it
      const a = this.toWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
      const b = this.toWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
      const hit = this.g.inRect(a.x, a.y, b.x, b.y, 0);
      // a single click's worth of drag still counts as a click
      if (!hit.length) return;
      // prefer fighting units over buildings when the box holds both
      const mil = hit.filter((u) => u.w || u.def.capture || u.def.mp);
      const pick = mil.length ? mil : hit;
      this.g.select(pick, d.add);
      R.UI.selSig = "";
      if (ZS.sound) ZS.sound.event("order");
    },

    clickSelect(e) {
      const w = this.toWorld(e.clientX, e.clientY);
      const g = this.g;
      // buildings first: they are the thing you are aiming at when you
      // click a base, and they are big
      let hit = g.buildingAtWorld(w.x, w.y);
      if (hit && hit.fac !== 0 && !g.visible(w.x, w.y)) hit = null;
      if (!hit) {
        const u = g.unitAt(w.x, w.y, 30);
        if (u && (u.fac === 0 || g.visibleNow(u.x, u.y))) hit = u;
      }
      if (!hit) {
        if (!e.shiftKey) g.clearSel();
        R.UI.selSig = "";
        return;
      }
      // double click: everything of that kind on screen
      const now = performance.now();
      const dbl = this.lastClickId === hit.id && now - this.lastClickT < 340;
      this.lastClickId = hit.id;
      this.lastClickT = now;

      if (dbl && hit.kind === "u") {
        const view = this.cam.visible(this.vw, this.vh, 0);
        const same = [];
        for (const u of g.units)
          if (
            !u.dead &&
            u.fac === 0 &&
            u.key === hit.key &&
            R.aabb(u, view.x0, view.y0, view.x1, view.y1)
          )
            same.push(u);
        g.select(same, e.shiftKey);
      } else {
        g.select([hit], e.shiftKey);
      }
      R.UI.selSig = "";
      if (ZS.sound) ZS.sound.event("order");
    },

    /* ---------- right click: the workhorse ---------- */

    onRight(e) {
      const g = this.g;
      if (R.UI.place) {
        R.UI.cancelPlace();
        return;
      }
      if (this.armed) {
        this.armed = null;
        return;
      }
      const w = this.toWorld(e.clientX, e.clientY);
      const sel = g.selUnits();

      // a production building selected: right click sets its rally point
      if (sel.length === 0) {
        const b = g.selection()[0];
        if (b && b.kind === "b" && R.PRODUCES[b.key]) {
          b.rally = { x: w.x, y: w.y };
          R.FX.marker(g, w.x, w.y, "move");
        }
        return;
      }
      if (!sel.length) return;

      // a hostile or neutral settlement under the cursor: the column raids
      // the yard — guns are fed to the guns, the truck takes the ground
      const bld = g.buildingAtWorld(w.x, w.y);
      if (!bld) {
        const site = this.siteAtPoint(w.x, w.y);
        if (site && site.owner !== 0) {
          this.raidSite(sel, site, w);
          return;
        }
      }

      // what is under the cursor?
      const tgt = this.pickTarget(w.x, w.y);
      const ord = tgt
        ? { type: "attack", tgt, x: tgt.x, y: tgt.y }
        : { type: "move", x: w.x, y: w.y };
      g.order(sel, ord, e.shiftKey);
      if (ZS.sound) ZS.sound.event(tgt ? "order" : "move", w.x, w.y);
    },

    // the settlement a point stands in, if any
    siteAtPoint(x, y) {
      for (const s of this.g.t.sites) {
        const r = (s.r + 2) * R.TILE;
        if (Math.abs(x - s.x) <= r && Math.abs(y - s.y) <= r) return s;
      }
      return null;
    },

    // feed the column to the yard's guns and send the truck in; a group
    // without a truck only fights — the ground cannot turn
    raidSite(sel, site, _w) {
      const g = this.g;
      const guns = g.buildings.filter(
        (b) =>
          !b.dead &&
          b.site === site &&
          b.fac !== 0 &&
          R.hostileTo(0, b.fac) &&
          (b.def.turret || b.key === "hq"),
      );
      const trucks = sel.filter((u) => u.def.capture);
      const army = sel.filter((u) => !u.def.capture);
      if (guns.length) {
        for (let i = 0; i < army.length; i++) {
          const tgt = guns[i % guns.length];
          R.Entity.setOrder(g, army[i], { type: "attack", tgt, x: tgt.x, y: tgt.y });
        }
      } else if (army.length) {
        R.Entity.assignFormation(g, army, { type: "amove", x: site.x, y: site.y });
      }
      for (const u of trucks)
        R.Entity.setOrder(g, u, { type: "capture", site, x: site.x, y: site.y });
      R.FX.marker(g, site.x, site.y, "attack");
      if (ZS.sound) ZS.sound.event("order", site.x, site.y);
      if (!trucks.length)
        R.UI.toast("No Conquest Truck in the group — the yard cannot turn", "bad");
    },

    pickTarget(x, y) {
      const g = this.g;
      const b = g.buildingAtWorld(x, y);
      if (b && b.fac !== 0 && R.hostileTo(0, b.fac) && g.visible(x, y)) return b;
      const u = g.unitAt(x, y, 34);
      if (u && u.fac !== 0 && R.hostileTo(0, u.fac) && g.visibleNow(u.x, u.y)) return u;
      return null;
    },

    applyArmed(sx, sy, queue) {
      const kind = this.armed;
      const w = this.toWorld(sx, sy);
      const g = this.g;
      const sel = g.selUnits();
      if (!sel.length) {
        this.armed = null;
        return;
      }
      if (kind === "capture") {
        const site = this.siteAtPoint(w.x, w.y);
        if (!site || site.owner === 0) {
          this.armed = null;
          R.UI.toast("Click the settlement itself — the yard, not the open sand", "bad");
          return;
        }
        const trucks = sel.filter((u) => u.def.capture);
        for (const u of trucks)
          R.Entity.setOrder(g, u, { type: "capture", site, x: site.x, y: site.y });
        const rest = sel.filter((u) => !u.def.capture);
        if (rest.length) g.order(rest, { type: "amove", x: site.x, y: site.y }, false);
        this.armed = null;
        R.FX.marker(g, site.x, site.y, "attack");
        if (ZS.sound) ZS.sound.event("order");
        return;
      }
      if (kind === "patrol") {
        if (!this.patrolFrom) {
          this.patrolFrom = w;
          R.FX.marker(g, w.x, w.y, "move");
          return;
        }
        for (const u of sel)
          R.Entity.setOrder(g, u, {
            type: "patrol",
            x: this.patrolFrom.x,
            y: this.patrolFrom.y,
            x2: w.x,
            y2: w.y,
          });
        this.patrolFrom = null;
        this.armed = null;
        R.FX.marker(g, w.x, w.y, "move");
        if (ZS.sound) ZS.sound.event("order");
        return;
      }
      const ord = { type: kind, x: w.x, y: w.y };
      g.order(sel, ord, queue);
      if (kind === "hold") {
        for (const u of sel) {
          u.holdX = u.x;
          u.holdY = u.y;
        }
      }
      this.armed = null;
    },

    tryPlace(e) {
      const g = this.g;
      const key = R.UI.place;
      const w = this.toWorld(e.clientX, e.clientY);
      const def = R.BDEF[key];
      const ox = Math.floor((def.size - 1) / 2);
      const gx = R.clamp(((w.x / TILE) | 0) - ox, 0, R.MAPW - def.size);
      const gy = R.clamp(((w.y / TILE) | 0) - ox, 0, R.MAPH - def.size);
      const why = R.Base.blockReason(g, key, 0, gx, gy);
      if (why) {
        R.UI.toast(why[0].toUpperCase() + why.slice(1), "bad");
        return;
      }
      const b = R.Base.place(g, key, 0, gx, gy);
      if (b) {
        R.Render.invalidate(b.x - 200, b.y - 200, b.x + 200, b.y + 200);
        if (!e.shiftKey) R.UI.cancelPlace();
        R.UI.cmdSig = "";
      }
    },

    /* ---------- keys ---------- */

    onKey(e, down) {
      const g = this.g;
      const k = e.key.toLowerCase();

      if (k === " ") this.spaceHeld = down;
      if (!down) {
        R.Cam.key(e, false);
        return;
      }
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;

      R.Cam.key(e, true);

      /* ---- global & build menu ---- */
      if (k === "escape") {
        if (R.UI.helpOpen) R.UI.toggleHelp(false);
        else if (R.UI.place) R.UI.cancelPlace();
        else if (R.UI.buildOpen) R.UI.toggleBuild(false);
        else if (this.armed) {
          this.armed = null;
          this.patrolFrom = null;
        } else if (R.UI.rally) R.UI.rally = false;
        else g.clearSel();
        R.UI.deckSig = "";
        return;
      }
      if (k === "f1" || k === "?") {
        e.preventDefault();
        R.UI.toggleHelp();
        return;
      }
      if (k === " ") {
        e.preventDefault();
        R.UI.setSpeed(0);
        return;
      }
      if (k === "b" && !e.ctrlKey && !e.metaKey) {
        R.UI.toggleBuild();
        return;
      }
      if (k === "q" && !e.ctrlKey && !e.metaKey && !R.UI.buildOpen && !g.selection().length) {
        ZS.Perf.cycle();
        R.UI.toast("Quality: tier " + ZS.Perf.tier);
        return;
      }
      if (k === "k" && !e.ctrlKey && !e.metaKey) {
        if (ZS.sound && ZS.sound.toggleMute) {
          const muted = ZS.sound.toggleMute();
          R.UI.toast(muted ? "Sound muted" : "Sound on");
        }
        return;
      }
      if (k === "f3") {
        R.Render.showFog = !R.Render.showFog;
        R.UI.toast("Fog of war " + (R.Render.showFog ? "on" : "off"));
        return;
      }
      if (k === "f4") {
        R.Render.showTerritory = !R.Render.showTerritory;
        R.UI.toast("Territory " + (R.Render.showTerritory ? "on" : "off"));
        return;
      }
      if (k === "f5") {
        R.Render.showGrid = !R.Render.showGrid;
        return;
      }
      if (k === "f9") {
        if (this.lastAlarm) R.Cam.glideTo(this.lastAlarm.x, this.lastAlarm.y, 0.8);
        else R.UI.toast("Nothing has raised the alarm yet");
        return;
      }

      const selUnits = g.selUnits();

      // Camera navigation
      if (k === "home" || k === "f2" || (k === "h" && !selUnits.length)) {
        const hq = g.factions[0].hq;
        const s = g.t.homeSite;
        const t = hq && hq.kind === "b" ? hq : s;
        R.Cam.glideTo(t.x, t.y, 1.0);
        return;
      }
      if (k === "f" && !selUnits.length) {
        this.cam.fit(R.W, R.H, this.vw, this.vh);
        return;
      }

      /* ---- control groups or game speed ---- */
      if (k >= "1" && k <= "9") {
        const n = parseInt(k, 10);
        if (e.ctrlKey || e.metaKey) {
          const sel = g.selection();
          R.UI.groups[n] = sel.map((o) => o.id);
          R.UI.toast("Group " + n + " set — " + sel.length);
          return;
        }
        const ids = R.UI.groups[n];
        if (ids && ids.length) {
          const list = [];
          for (const u of g.units) if (!u.dead && ids.indexOf(u.id) >= 0) list.push(u);
          for (const b of g.buildings) if (!b.dead && ids.indexOf(b.id) >= 0) list.push(b);
          if (list.length) {
            g.select(list, e.shiftKey);
            R.UI.selSig = "";
            if (this.lastGroup === n && performance.now() - this.lastGroupT < 380) {
              let cx = 0,
                cy = 0;
              for (const o of list) {
                cx += o.x;
                cy += o.y;
              }
              R.Cam.glideTo(cx / list.length, cy / list.length);
            }
            this.lastGroup = n;
            this.lastGroupT = performance.now();
            return;
          }
        }
        // If not a group recall, set game speed
        if (n >= 1 && n <= 3) {
          R.UI.setSpeed(n);
          return;
        }
      }

      /* ---- selection ---- */
      if (k === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const view = this.cam.visible(this.vw, this.vh, 0);
        const all = this.g.inRect(view.x0, view.y0, view.x1, view.y1, 0);
        const mil = all.filter((u) => u.w || u.def.capture || u.def.mp);
        g.select(mil.length ? mil : all, false);
        R.UI.selSig = "";
        return;
      }
      if (k === "tab") {
        e.preventDefault();
        this.cycleArmies();
        return;
      }
      if (k === "delete" || k === "backspace") {
        const sel = g.selection();
        for (const o of sel) {
          if (o.kind === "b") {
            g.refund(0, o.def.cost, o.built ? 0.5 : 1);
            g.removeBuilding(o, true);
          } else if (o.fac === 0) g.killUnit(o, true);
        }
        R.UI.selSig = "";
        return;
      }

      /* ---- building upgrade & rally ---- */
      const sel = g.selection();
      if (k === "u" && !selUnits.length) {
        if (sel.length === 1 && sel[0].kind === "b" && sel[0].fac === 0) {
          const b = sel[0];
          const cost = R.Base.upCostFor(g, b);
          if (cost && b.built && !b.upgrading) {
            if (R.Base.startUpgrade(g, b)) {
              R.UI.deckSig = "";
              if (ZS.sound) ZS.sound.event("order");
            } else {
              R.UI.toast("Not enough " + R.UI.missingOf(cost), "bad");
            }
          }
          return;
        }
      }
      if (k === "y" && !selUnits.length) {
        if (sel.length === 1 && sel[0].kind === "b" && R.PRODUCES[sel[0].key]) {
          R.UI.rally = true;
          R.UI.toast("Right-click the map to set rally point");
          return;
        }
      }

      /* ---- QWERTY build or produce shortcuts ---- */
      const hkIdx = ["q", "w", "e", "r", "t", "y"].indexOf(k);
      if (hkIdx >= 0 && !e.ctrlKey && !e.metaKey) {
        // if factory selected, queue unit
        if (sel.length === 1 && sel[0].kind === "b" && R.PRODUCES[sel[0].key]) {
          const prods = R.PRODUCES[sel[0].key];
          if (prods[hkIdx]) {
            R.UI.queueUnit(sel[0], prods[hkIdx]);
            return;
          }
        }
        // if no units selected, select building to place
        if (!selUnits.length) {
          const activeCat = R.BUILD_MENU.find((c) => c.key === R.UI.buildTab) || R.BUILD_MENU[0];
          if (activeCat && activeCat.keys[hkIdx]) {
            R.UI.pickBuild(activeCat.keys[hkIdx]);
            return;
          }
        }
      }

      /* ---- orders ---- */
      const orderKey = {
        a: "amove",
        m: "move",
        p: "patrol",
        h: "hold",
        s: "stop",
        c: "capture",
      }[k];
      if (orderKey && !e.ctrlKey && !e.metaKey && selUnits.length) {
        R.UI.beginOrder(orderKey);
        return;
      }
      if (k === "f" && selUnits.length) {
        R.UI.formUp();
        return;
      }
    },

    // Tab walks the armies: every group of your units that is not standing
    // in a base, in reading order across the map
    cycleArmies() {
      const g = this.g;
      const field = g.units.filter(
        (u) => !u.dead && u.fac === 0 && (u.w || u.def.capture || u.def.mp),
      );
      if (!field.length) return;
      // cluster by rough grid cell so "an army" means something
      const cells = new Map();
      for (const u of field) {
        const key = ((u.x / 900) | 0) + "," + ((u.y / 900) | 0);
        let a = cells.get(key);
        if (!a) cells.set(key, (a = []));
        a.push(u);
      }
      const groups = [...cells.values()].sort((a, b) => b.length - a.length);
      this._cyc = ((this._cyc || 0) + 1) % groups.length;
      const grp = groups[this._cyc];
      g.select(grp, false);
      R.UI.selSig = "";
      let cx = 0,
        cy = 0;
      for (const u of grp) {
        cx += u.x;
        cy += u.y;
      }
      R.Cam.glideTo(cx / grp.length, cy / grp.length);
    },

    /* ==================================================================
       the loop
       ================================================================== */

    loop(now) {
      requestAnimationFrame((t) => this.loop(t));
      let dt = (now - (this.last || now)) / 1000;
      this.last = now;
      if (dt > 0.05) dt = 0.05;
      if (dt <= 0) dt = 1 / 60;
      this.time += dt;

      ZS.setBoil(this.time);
      ZS.Perf.frame(dt);

      const g = this.g;
      R.Cam.update(dt, this.vw, this.vh);

      // the sim runs at the chosen speed; the camera and the UI do not
      if (!g.paused && !g.over) {
        const step = dt * g.speed;
        // a fast setting takes several smaller steps, so physics stays
        // stable at 3x instead of jumping
        const n = g.speed > 1 ? Math.min(3, Math.ceil(g.speed)) : 1;
        for (let i = 0; i < n; i++) g.update(step / n);
      }

      // remember where the last alarm was, for F9
      for (const m of R.FX.markers)
        if (m.type === "ping" && m.kind !== "good" && m.t < 0.05)
          this.lastAlarm = { x: m.x, y: m.y };

      R.Render.frame(g, this.cam, dt, this.vw, this.vh);
      R.Mini.draw(g, this.cam, this.vw, this.vh);
      R.UI.frame();
      if (ZS.sound) ZS.sound.tick(dt);
    },
  };

  R.App = App;
  window.addEventListener("DOMContentLoaded", () => App.boot());
})();
