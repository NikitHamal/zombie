/* Desert Order — the overlay.

   DOM on top of the canvas, in the same paper palette: thin rules, warm
   ink, nothing that fights the drawing underneath for attention. It is
   keyboard-first — every button in it has a key, and the keys are printed
   on the buttons — but everything is clickable too.

   The panel answers one question at all times: "what is selected?" If it
   is a production building you get its queue and its units; if it is a
   defence you get its upgrade; if it is an army you get its orders and
   its wounds. The bottom bar holds the build menu or the production
   roster, and switches between them on its own. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});

  /* ---------- element helpers ---------- */

  function el(tag, cls, parent, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function clear(e) {
    while (e.firstChild) e.removeChild(e.firstChild);
  }

  /* ---------- the order vocabulary, in key order ---------- */

  const ORDERS = [
    { key: "a", name: "Attack Move", hint: "Move and shoot whatever you meet", kind: "amove" },
    { key: "m", name: "Move", hint: "Go there, ignore everything", kind: "move" },
    { key: "p", name: "Patrol", hint: "Walk the line, shoot what you see", kind: "patrol" },
    { key: "h", name: "Hold", hint: "Stand fast and shoot", kind: "hold" },
    { key: "s", name: "Stop", hint: "Halt and drop the target", kind: "stop" },
    { key: "r", name: "Repair", hint: "Engineers and supply: mend the army", kind: "repair" },
    { key: "u", name: "Unload", hint: "Empty a carrier where it stands", kind: "unload" },
    { key: "c", name: "Capture", hint: "Take the ground you are standing on", kind: "capture" },
  ];

  const UI = {
    g: null,
    app: null,
    root: null,
    place: null, // building key being placed
    rally: false, // next click sets a rally point
    tab: "econ",
    groups: Object.create(null),
    lastRes: {},
    toasts: [],
    helpOpen: false,
    selSig: "",
    cmdSig: "",

    /* ==================================================================
       build it
       ================================================================== */

    init(g, app) {
      this.g = g;
      this.app = app;
      const root = (this.root = el("div", "zs-ui", document.body));

      /* ---------- top bar ---------- */
      const top = el("div", "zs-top", root);
      const res = el("div", "zs-res", top);
      this.resEls = {};
      for (const r of R.RES) {
        const box = el("div", "zs-resbox", res);
        box.dataset.k = r.key;
        box.title =
          r.name + " — the store is raised by every " + r.name.toLowerCase() + " plant you hold";
        const tag = el("span", "zs-restag", box, r.short);
        tag.style.color = R.RES_INK[r.key];
        const val = el("span", "zs-resval", box, "0");
        const rate = el("span", "zs-resrate", box, "");
        this.resEls[r.key] = { box, val, rate };
      }

      const mid = el("div", "zs-topmid", top);
      this.clockEl = el("div", "zs-clock", mid, "DAY 1 · 07:00");
      const sub = el("div", "zs-topsub", mid);
      this.capEl = el("span", "zs-chip", sub, "ARMY 0/0");
      this.siteEl = el("span", "zs-chip", sub, "BASES 0");
      this.prodEl = el("span", "zs-chip", sub, "×1.00");

      const sp = el("div", "zs-speed", top);
      this.speedBtns = [];
      for (const s of [
        { v: 0, label: "❙❙", title: "Pause (Space)" },
        { v: 1, label: "▶", title: "Normal speed ([)" },
        { v: 2, label: "▶▶", title: "Fast (])" },
        { v: 3, label: "▶▶▶", title: "Very fast" },
      ]) {
        const b = el("button", "zs-spbtn", sp, s.label);
        b.title = s.title;
        b.onclick = () => this.setSpeed(s.v);
        this.speedBtns.push({ v: s.v, b });
      }
      const help = el("button", "zs-spbtn zs-wide", sp, "?");
      help.title = "Help and hotkeys (F1)";
      help.onclick = () => this.toggleHelp();

      /* ---------- the right panel ---------- */
      const panel = (this.panel = el("div", "zs-panel", root));
      this.panelBody = el("div", "zs-panelbody", panel);
      this.logEl = el("div", "zs-log", panel);

      /* ---------- the bottom bar ---------- */
      const bottom = el("div", "zs-bottom", root);
      const mmf = el("div", "zs-mmframe", bottom);
      const mm = el("canvas", "zs-mini", mmf);
      this.miniCanvas = mm;
      R.Mini.mount(mm);
      const mmLbl = el("div", "zs-mmlabel", mmf, "MAP");
      mmLbl.style.pointerEvents = "none";
      this.mmFrame = mmf;

      const cmd = el("div", "zs-cmd", bottom);
      this.tabsEl = el("div", "zs-tabs", cmd);
      this.gridEl = el("div", "zs-grid", cmd);

      /* ---------- floating things ---------- */
      this.toastEl = el("div", "zs-toasts", root);
      this.helpEl = el("div", "zs-veil zs-hidden", root);
      this.buildHelp();
      this.resultEl = el("div", "zs-veil zs-hidden", root);
      this.pauseEl = el("div", "zs-pauseflag", root, "PAUSED");
      this.pauseEl.style.display = "none";

      this.buildTabs();
      this.refresh(true);
      return this;
    },

    /* ---------- the build menu tabs ---------- */

    buildTabs() {
      clear(this.tabsEl);
      const cats = R.BUILD_MENU.slice();
      // a fourth tab for the units a selected building can make
      this.catBtns = [];
      cats.forEach((c) => {
        const b = el("button", "zs-tab", this.tabsEl, c.name);
        b.dataset.cat = c.key;
        b.onclick = () => {
          this.tab = c.key;
          this.place = null;
          this.cmdSig = "";
          this.refresh(true);
        };
        this.catBtns.push(b);
      });
      const prodTab = (this.prodTab = el("button", "zs-tab zs-hidden", this.tabsEl, "Production"));
      prodTab.onclick = () => {
        this.tab = "prod";
        this.cmdSig = "";
        this.refresh(true);
      };
    },

    /* ==================================================================
       the bottom grid: build menu, or production roster
       ================================================================== */

    refreshCmd(force) {
      const g = this.g;
      const sel = g.selection();
      const prodB =
        sel.length === 1 && sel[0].kind === "b" && R.PRODUCES[sel[0].key] ? sel[0] : null;
      const want = prodB ? "prod" : this.tab === "prod" ? this.tab : this.tab;
      if (prodB && this.tab !== "prod") {
        this.tab = "prod";
      } else if (!prodB && this.tab === "prod") {
        this.tab = "econ";
      }

      const sig = want + "|" + (prodB ? prodB.id : "-") + "|" + (prodB ? prodB.queue.length : 0);
      if (!force && sig === this.cmdSig) return;
      this.cmdSig = sig;

      for (const b of this.catBtns)
        b.classList.toggle("on", b.dataset.cat === this.tab && this.tab !== "prod");
      this.prodTab.classList.toggle("zs-hidden", !prodB);
      this.prodTab.classList.toggle("on", this.tab === "prod");

      clear(this.gridEl);
      this.buildCells = [];
      if (this.tab === "prod" && prodB) this.fillProduction(prodB);
      else this.fillBuild();
    },

    /* ---------- the build menu ---------- */

    fillBuild() {
      const cat = R.BUILD_MENU.find((c) => c.key === this.tab) || R.BUILD_MENU[0];
      cat.keys.forEach((key, i) => {
        const def = R.BDEF[key];
        if (!def) return;
        const hk = ["q", "w", "e", "r", "t", "y"][i] || "";
        const b = el("button", "zs-cell", this.gridEl);
        b.dataset.key = key;
        const cv = el("canvas", "zs-cellicon", b);
        this.paintBuildingIcon(cv, key);
        el("span", "zs-cellname", b, def.short);
        el("span", "zs-cellcost", b, this.costLine(def.cost));
        if (hk) el("span", "zs-hk", b, hk.toUpperCase());
        b.title = this.buildTip(def);
        b.onclick = () => this.pickBuild(key);
        b.oncontextmenu = (e) => e.preventDefault();
        this.buildCells = this.buildCells || [];
        this.buildCells.push({ key, b, def, have: -1, cap: -1 });
      });
      this.refreshCap();
    },

    // the tooltip for a build cell, including where you stand against the cap
    buildTip(def) {
      const g = this.g;
      const have = g.count(0, def.key);
      const cap = g.maxBuildings(0, def.key);
      return (
        def.name +
        "\n" +
        def.desc +
        "\n\n" +
        this.costText(def.cost) +
        "  ·  " +
        def.time +
        "s  ·  " +
        def.hp +
        " hp" +
        (def.w ? "  ·  armed" : "") +
        "\n" +
        have +
        " / " +
        cap +
        " built" +
        (have >= cap ? "\nAt the cap — take a settlement to build more" : "")
      );
    },

    // grey out what you are not allowed to build any more. Runs every
    // refresh, because the cap moves as you take settlements.
    refreshCap() {
      const g = this.g;
      const cells = this.buildCells;
      if (!cells || !cells.length) return;
      for (const c of cells) {
        const have = g.count(0, c.key);
        const cap = g.maxBuildings(0, c.key);
        // only touch the DOM when the numbers actually move: this runs
        // every frame and there is no reason to build strings for it
        if (c.have === have && c.cap === cap) continue;
        c.have = have;
        c.cap = cap;
        c.b.disabled = have >= cap;
        c.b.title = this.buildTip(c.def);
      }
    },

    fillProduction(b) {
      const keys = R.PRODUCES[b.key] || [];
      keys.forEach((key, i) => {
        const def = R.UDEF[key];
        if (!def) return;
        const hk = ["q", "w", "e", "r", "t", "y"][i] || "";
        const c = el("button", "zs-cell", this.gridEl);
        c.dataset.key = key;
        const cv = el("canvas", "zs-cellicon", c);
        this.paintUnitIcon(cv, key);
        el("span", "zs-cellname", c, def.short);
        el("span", "zs-cellcost", c, this.costLine(def.cost));
        if (hk) el("span", "zs-hk", c, hk.toUpperCase());
        c.title =
          def.name +
          "\n" +
          def.role +
          "\n\n" +
          this.costText(def.cost) +
          "  ·  " +
          def.time +
          "s  ·  " +
          def.hp +
          " hp  ·  " +
          def.arm +
          " arm\n" +
          def.pop +
          " cap  ·  " +
          def.sight +
          " sight" +
          (def.w ? "  ·  " + (R.WDEF[def.w].range | 0) + " range" : "  ·  unarmed");
        c.onclick = () => this.queueUnit(b, key);
        c.oncontextmenu = (e) => {
          e.preventDefault();
          this.queueRemove(b, key);
        };
      });
      // the rally button, so new units do not pile up at the door
      const rb = el("button", "zs-cell zs-cellwide", this.gridEl);
      const cv2 = el("canvas", "zs-cellicon", rb);
      this.paintGlyph(cv2, "flag");
      el("span", "zs-cellname", rb, "RALLY");
      el("span", "zs-cellcost", rb, b.rally ? "set" : "off");
      rb.title = "Right-click the map to send new units there. Ctrl+click a factory to clear it.";
      rb.onclick = () => {
        this.rally = true;
        this.toast("Right-click the map to set the rally point");
      };
    },

    /* ---------- icon painting ---------- */

    paintBuildingIcon(cv, key) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const S = 42;
      cv.width = S * dpr;
      cv.height = S * dpr;
      cv.style.width = S + "px";
      cv.style.height = S + "px";
      const c = cv.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const def = R.BDEF[key];
      // the sprite is drawn in world units; work out the scale that fits
      const world = def.size * R.TILE;
      const s = (40 * (S - 8)) / world;
      R.Sprites.icon(c, key, S / 2, S / 2 + 2, s);
    },

    paintUnitIcon(cv, key) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const S = 42;
      cv.width = S * dpr;
      cv.height = S * dpr;
      cv.style.width = S + "px";
      cv.style.height = S + "px";
      const c = cv.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      R.Sprites.unitIcon(c, key, S / 2, S / 2 + 2, 34);
    },

    paintGlyph(cv, kind) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const S = 42;
      cv.width = S * dpr;
      cv.height = S * dpr;
      cv.style.width = S + "px";
      cv.style.height = S + "px";
      const c = cv.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.strokeStyle = "rgba(58,50,42,0.9)";
      c.fillStyle = "rgba(58,50,42,0.16)";
      c.lineWidth = 2;
      c.lineCap = "round";
      const cx = S / 2,
        cy = S / 2;
      if (kind === "flag") {
        c.beginPath();
        c.moveTo(cx - 6, cy + 11);
        c.lineTo(cx - 6, cy - 11);
        c.stroke();
        c.beginPath();
        c.moveTo(cx - 6, cy - 11);
        c.lineTo(cx + 10, cy - 6);
        c.lineTo(cx - 6, cy - 1);
        c.closePath();
        c.fill();
        c.stroke();
      }
    },

    /* ---------- action ---------- */

    pickBuild(key) {
      if (this.place === key) {
        this.cancelPlace();
        return;
      }
      this.place = key;
      this.rally = false;
      this.cmdSig = "";
      for (const b of this.gridEl.children) b.classList.toggle("on", b.dataset.key === key);
      this.toast("Placing " + R.BDEF[key].name + " — left click to site it, Esc to cancel");
    },

    cancelPlace() {
      this.place = null;
      this.cmdSig = "";
      R.Render.ghost = null;
      this.refreshCmd(true);
    },

    queueUnit(b, key) {
      if (!R.Base.queueItem(this.g, b, key)) {
        const ud = R.UDEF[key];
        const f = this.g.factions[0];
        if (f.capUsed + ud.pop > f.cap)
          this.toast("Army cap reached — raise a Command Centre or a barracks", "bad");
        else if (!this.g.canPay(0, ud.cost))
          this.toast("Not enough " + this.missingOf(ud.cost), "bad");
        else this.toast("Cannot queue that here", "bad");
        return;
      }
      this.cmdSig = "";
      if (ZS.sound) ZS.sound.event("order");
    },

    queueRemove(b, key) {
      // cancel the last one of this kind in the queue
      for (let i = b.queue.length - 1; i >= 0; i--)
        if (b.queue[i].key === key) {
          R.Base.cancelQueued(this.g, b, i);
          this.cmdSig = "";
          return;
        }
    },

    missingOf(cost) {
      const r = this.g.factions[0].res;
      for (const k in cost) if (r[k] < cost[k]) return R.RES_NAME[k];
      return "resources";
    },

    /* ---------- cost, in two lengths ---------- */

    // "C420 · S160" — fits on a button
    costLine(cost) {
      const out = [];
      for (const r of R.RES) if (cost[r.key]) out.push(r.short[0] + cost[r.key]);
      return out.join(" · ") || "free";
    },

    // "Concrete 420, Steel 160" — fits in a tooltip
    costText(cost) {
      const out = [];
      for (const r of R.RES) if (cost[r.key]) out.push(r.name + " " + cost[r.key]);
      return out.join(", ") || "free";
    },

    /* ==================================================================
       the selection panel
       ================================================================== */

    refreshSel(force) {
      const g = this.g;
      const sel = g.selection();
      let sig = sel.length + "|";
      if (sel.length === 1) sig += sel[0].id + "|" + ((sel[0].hp / sel[0].maxHp) * 100).toFixed(0);
      else if (sel.length) {
        const byKey = {};
        for (const e of sel) byKey[e.key] = (byKey[e.key] || 0) + 1;
        sig += Object.keys(byKey)
          .sort()
          .map((k) => k + byKey[k])
          .join(",");
      }
      if (!force && sig === this.selSig) return;
      this.selSig = sig;

      clear(this.panelBody);
      if (!sel.length) {
        this.panelEmpty();
        return;
      }
      if (sel.length === 1) this.panelOne(sel[0]);
      else this.panelMany(sel);
    },

    panelEmpty() {
      const g = this.g;
      const f = g.factions[0];
      const h = el("div", "zs-sect", this.panelBody);
      el("div", "zs-secthead", h, "THE COMPANY");
      const rows = [
        ["Settlements", f.sites + " held"],
        ["Army", f.capUsed + " / " + f.cap],
        ["Productivity", (f.productivity || 1).toFixed(2) + "×"],
        ["Build rate", "×" + (f.buildRate || 1).toFixed(2)],
        ["Kills", String(f.kills)],
        ["Lost", String(f.lost)],
      ];
      for (const [k, v] of rows) {
        const r = el("div", "zs-row", h);
        el("span", "zs-rowk", r, k);
        el("span", "zs-rowv", r, v);
      }
      const tip = el("div", "zs-tip", this.panelBody);
      tip.textContent =
        "You can only build on ground you own. Drive a Conquest Truck onto a settlement to take it — more settlements means more of every building.";
    },

    panelOne(e) {
      const g = this.g;
      const head = el("div", "zs-sect", this.panelBody);
      const t = el("div", "zs-secthead", head, e.kind === "b" ? e.def.name : e.def.name);
      t.classList.add("zs-big");
      const sub = el("div", "zs-sub", head, "");
      if (e.kind === "b") {
        sub.textContent =
          "Level " +
          e.lvl +
          (e.def.cat === "def" ? " / " + R.MAXLEVEL_DEF : " / " + R.MAXLEVEL) +
          "  ·  " +
          R.factionName[e.fac];
      } else {
        sub.textContent =
          e.def.cls === "air"
            ? "Air  ·  " + R.factionName[e.fac]
            : e.def.cls === "sea"
              ? "Naval  ·  " + R.factionName[e.fac]
              : e.def.cls === "arm"
                ? "Armour  ·  " + R.factionName[e.fac]
                : e.def.cls === "soft"
                  ? "Vehicle  ·  " + R.factionName[e.fac]
                  : "Infantry  ·  " + R.factionName[e.fac];
      }

      /* --- the numbers --- */
      const st = el("div", "zs-sect", this.panelBody);
      el("div", "zs-secthead", st, "STATE");
      const hp = el("div", "zs-row", st);
      el("span", "zs-rowk", hp, "Hull");
      el("span", "zs-rowv", hp, Math.ceil(e.hp) + " / " + e.maxHp);
      const hpb = el("div", "zs-hpbar", st);
      const hpf = el("div", "zs-hpfill", hpb);
      hpf.style.width = (R.clamp(e.hp / e.maxHp, 0, 1) * 100).toFixed(1) + "%";

      const rows = [];
      if (e.kind === "b") {
        rows.push(["Armour", String(e.arm)]);
        if (e.def.rate)
          rows.push(["Output", "+" + (R.levelRate(e.def, e.lvl) / 60).toFixed(1) + "/s"]);
        if (e.onOil) rows.push(["On a seep", "×" + e.def.onOil]);
        if (e.w) rows.push(["Gun", R.WDEF[e.def.w].range + " range"]);
        if (e.def.cap) rows.push(["Army cap", "+" + e.def.cap]);
        rows.push(["Sight", String(e.sight | 0)]);
        if (!e.built) rows.push(["Building", R.mmss(e.buildT)]);
        if (e.upgrading) rows.push(["Upgrading", R.mmss(e.upT)]);
        if (e.queue.length) rows.push(["Queued", String(e.queue.length)]);
      } else {
        rows.push(["Armour", String(e.def.arm + (e.vet || 0))]);
        rows.push(["Speed", String(e.def.speed)]);
        rows.push(["Sight", String(e.def.sight)]);
        if (e.w) {
          const w = e.w;
          rows.push(["Damage", String(w.dmg)]);
          rows.push(["Range", String(w.range)]);
          rows.push(["Rate", w.rof.toFixed(1) + "/s"]);
          rows.push(["Penetration", String(w.pen)]);
          rows.push(["Hits air", w.aa ? "yes" : "no"]);
        } else if (e.def.capture) rows.push(["Role", "Claims ground"]);
        else if (e.def.repair) rows.push(["Repairs", e.def.repair + "/s"]);
        else if (e.def.carry) rows.push(["Carries", e.def.carry + " men"]);
        else rows.push(["Role", "Unarmed"]);
        if (e.vet) rows.push(["Veteran", "+" + e.vet + " armour"]);
      }
      for (const [k, v] of rows) {
        const r = el("div", "zs-row", st);
        el("span", "zs-rowk", r, k);
        el("span", "zs-rowv", r, String(v));
      }

      if (e.def.desc || e.def.role)
        el("div", "zs-tip", this.panelBody).textContent = e.def.desc || e.def.role;

      /* --- the buttons --- */
      const act = el("div", "zs-sect", this.panelBody);
      el("div", "zs-secthead", act, "ORDERS");
      const btns = el("div", "zs-btns", act);

      if (e.kind === "b") {
        // upgrade
        const cost = R.Base.upCostFor(g, e);
        if (cost && e.built) {
          const b = el("button", "zs-btn", btns, "Upgrade  L" + (e.lvl + 1));
          b.title = this.costText(cost) + "  ·  " + R.upTime(e.def, e.lvl) + "s";
          b.onclick = () => {
            if (!R.Base.startUpgrade(g, e)) this.toast("Not enough " + this.missingOf(cost), "bad");
            else {
              this.selSig = "";
              if (ZS.sound) ZS.sound.event("order");
            }
          };
        }
        if (R.PRODUCES[e.key]) {
          const b = el("button", "zs-btn", btns, "Production");
          b.onclick = () => {
            this.tab = "prod";
            this.cmdSig = "";
            this.refreshCmd(true);
          };
        }
        if (e.rally || R.PRODUCES[e.key]) {
          const b = el("button", "zs-btn", btns, "Rally point");
          b.onclick = () => {
            this.rally = true;
            this.toast("Right-click the map to set the rally point");
          };
        }
        const b2 = el("button", "zs-btn zs-danger", btns, "Demolish");
        b2.title = "Refunds half of what it cost (Del)";
        b2.onclick = () => {
          g.refund(0, e.def.cost, e.built ? 0.5 : 1);
          g.removeBuilding(e, true);
          this.selSig = "";
        };
      } else {
        for (const o of ORDERS) {
          if (o.kind === "repair" && !e.def.repair) continue;
          if (o.kind === "unload" && (!e.def.carry || !e.carry.length)) continue;
          if (o.kind === "capture" && !e.def.capture) continue;
          const b = el("button", "zs-btn zs-btnk", btns, o.name);
          el("span", "zs-key", b, o.key.toUpperCase());
          b.title = o.hint;
          b.onclick = () => this.beginOrder(o.kind);
        }
      }
    },

    panelMany(sel) {
      const g = this.g;
      const head = el("div", "zs-sect", this.panelBody);
      const t = el("div", "zs-secthead", head, sel.length + " SELECTED");
      t.classList.add("zs-big");

      // group by kind, biggest first
      const byKey = {};
      for (const e of sel) (byKey[e.key] = byKey[e.key] || []).push(e);
      const keys = Object.keys(byKey).sort((a, b) => byKey[b].length - byKey[a].length);

      const list = el("div", "zs-sect", this.panelBody);
      el("div", "zs-secthead", list, "ROSTER");
      for (const k of keys) {
        const grp = byKey[k];
        const def = grp[0].def;
        const row = el("div", "zs-rostrow", list);
        row.title = def.desc || def.role || "";
        el("span", "zs-rostname", row, def.name);
        el("span", "zs-rostn", row, "×" + grp.length);
        // a health strip for the group
        let hp = 0,
          mx = 0;
        for (const e of grp) {
          hp += e.hp;
          mx += e.maxHp;
        }
        const bar = el("div", "zs-hpbar zs-thin", row);
        const fill = el("div", "zs-hpfill", bar);
        fill.style.width = mx ? ((hp / mx) * 100).toFixed(1) + "%" : "0%";
        // click to narrow the selection down to this kind
        row.onclick = () => {
          g.select(grp, false);
          this.selSig = "";
          this.refreshSel(true);
        };
      }

      const act = el("div", "zs-sect", this.panelBody);
      el("div", "zs-secthead", act, "ORDERS");
      const btns = el("div", "zs-btns", act);
      // only offer orders the whole group could obey
      const anyRepair = sel.some((e) => e.kind === "u" && e.def.repair);
      const anyCarry = sel.some((e) => e.kind === "u" && e.def.carry && e.carry.length);
      const anyCap = sel.some((e) => e.kind === "u" && e.def.capture);
      for (const o of ORDERS) {
        if (o.kind === "repair" && !anyRepair) continue;
        if (o.kind === "unload" && !anyCarry) continue;
        if (o.kind === "capture" && !anyCap) continue;
        const b = el("button", "zs-btn zs-btnk", btns, o.name);
        el("span", "zs-key", b, o.key.toUpperCase());
        b.title = o.hint;
        b.onclick = () => this.beginOrder(o.kind);
      }
      const br = el("button", "zs-btn", btns, "Form up");
      br.title = "Pull the group into a tight block (F)";
      br.onclick = () => this.formUp();
    },

    // an order that needs a target: arm it, the next click places it
    beginOrder(kind) {
      if (kind === "stop") {
        for (const u of this.g.selUnits()) R.Entity.setOrder(this.g, u, { type: "stop" });
        if (ZS.sound) ZS.sound.event("order");
        return;
      }
      if (kind === "unload") {
        for (const u of this.g.selUnits()) if (u.def.carry) R.Entity.unload(this.g, u);
        if (ZS.sound) ZS.sound.event("order");
        return;
      }
      if (kind === "repair") {
        const list = this.g.selUnits().filter((u) => u.def.repair);
        for (const u of list) {
          // mend the nearest hurt thing you own
          let best = null,
            bd = 1e9;
          this.g.grid.query(u.x, u.y, 520, (o) => {
            if (o.dead || o.fac !== u.fac || o === u) return;
            if (o.hp >= o.maxHp) return;
            const d = R.dist2(u.x, u.y, o.x, o.y);
            if (d < bd) {
              bd = d;
              best = o;
            }
          });
          if (best) R.Entity.setOrder(this.g, u, { type: "repair", tgt: best });
          else this.toast("Nothing nearby needs mending");
        }
        if (ZS.sound) ZS.sound.event("order");
        return;
      }
      if (kind === "capture") {
        for (const u of this.g.selUnits()) {
          if (!u.def.capture) continue;
          R.Entity.setOrder(this.g, u, { type: "capture", x: u.x, y: u.y });
        }
        if (ZS.sound) ZS.sound.event("order");
        return;
      }
      // move / attack-move / patrol / hold: arm the cursor
      this.app.armed = kind;
      this.toast(
        (kind === "amove"
          ? "Attack move"
          : kind === "patrol"
            ? "Patrol"
            : kind === "hold"
              ? "Hold"
              : "Move") + " — left-click the map",
      );
    },

    formUp() {
      const list = this.g.selUnits();
      if (list.length < 2) return;
      let cx = 0,
        cy = 0;
      for (const u of list) {
        cx += u.x;
        cy += u.y;
      }
      cx /= list.length;
      cy /= list.length;
      R.Entity.assignFormation(this.g, list, { type: "move", x: cx, y: cy });
      if (ZS.sound) ZS.sound.event("order");
    },

    /* ==================================================================
       the log and the toasts
       ================================================================== */

    refreshLog() {
      const g = this.g;
      const n = Math.min(7, g.log.length);
      let sig = "";
      for (let i = 0; i < n; i++) sig += g.log[g.log.length - 1 - i].text + "|";
      if (sig === this.logSig) return;
      this.logSig = sig;
      clear(this.logEl);
      for (let i = n - 1; i >= 0; i--) {
        const e = g.log[g.log.length - 1 - i];
        const row = el("div", "zs-logrow" + (e.kind ? " zs-" + e.kind : ""), this.logEl);
        el("span", "zs-logt", row, "D" + (Math.floor(e.t / R.CLOCK.CYCLE) + 1));
        el("span", "zs-logx", row, e.text);
      }
    },

    toast(text, kind) {
      if (!this.toastEl) return;
      const t = el("div", "zs-toast" + (kind ? " zs-" + kind : ""), this.toastEl, text);
      // never more than five on screen at once
      while (this.toastEl.children.length > 5) this.toastEl.removeChild(this.toastEl.firstChild);
      setTimeout(() => {
        t.classList.add("zs-out");
        setTimeout(() => t.parentNode && t.parentNode.removeChild(t), 600);
      }, 3600);
    },

    /* ==================================================================
       help
       ================================================================== */

    buildHelp() {
      const box = el("div", "zs-help", this.helpEl);
      el("h2", "", box, "DESERT ORDER");
      el(
        "p",
        "zs-lede",
        box,
        "You hold one settlement in a desert full of nations that want it, and a Rot that wants all of it. Take ground, raise industry on it, and hold it with guns that answer the right threat.",
      );

      const cols = el("div", "zs-helpcols", box);
      const col = (title, rows) => {
        const c = el("div", "zs-helpcol", cols);
        el("h3", "", c, title);
        const dl = el("dl", "", c);
        for (const [k, v] of rows) {
          el("dt", "", dl, k);
          el("dd", "", dl, v);
        }
      };
      col("Camera", [
        ["W A S D / arrows", "Pan"],
        ["Wheel", "Zoom on the cursor"],
        ["Middle drag", "Pan"],
        ["Edge of screen", "Pan"],
        ["Home / F2", "Jump to your Command Centre"],
        ["F9", "Jump to the last alarm"],
      ]);
      col("Selecting", [
        ["Left drag", "Box select"],
        ["Left click", "Select one"],
        ["Double click", "Select every one of that kind on screen"],
        ["Ctrl + A", "Select everything you own on screen"],
        ["Ctrl + 1…9", "Make a control group"],
        ["1…9", "Select that group"],
        ["Tab", "Cycle your armies"],
        ["Esc", "Drop the selection"],
      ]);
      col("Orders", [
        ["Right click", "Move, or attack what you clicked"],
        ["A", "Attack-move"],
        ["M", "Move"],
        ["P", "Patrol (two clicks: there and back)"],
        ["H", "Hold position"],
        ["S", "Stop"],
        ["R", "Repair (engineers, supply trucks)"],
        ["U", "Unload a carrier"],
        ["C", "Claim the ground (conquest truck)"],
        ["F", "Form up the group"],
        ["Del", "Scuttle / demolish"],
      ]);
      col("Building", [
        ["Q W E R T Y", "Pick from the open tab"],
        ["B", "Back to the build menu"],
        ["Right click", "Cancel placing"],
        ["Esc", "Cancel placing"],
        ["Shift + click", "Place several in a row"],
        ["Ctrl + click", "Cancel one queued unit"],
      ]);
      col("The game", [
        ["Space", "Pause"],
        ["[ / ]", "Slower / faster"],
        ["F1", "This page"],
        ["F3", "Fog of war on and off"],
        ["F4", "Territory wash on and off"],
        ["F5", "Tile grid on and off"],
      ]);

      const rules = el("div", "zs-helprules", box);
      el("h3", "", rules, "Three rules worth knowing");
      const ul = el("ul", "", rules);
      el(
        "li",
        "",
        ul,
        "You can only build on ground you own. Settlements are how you get more of it — drive a Conquest Truck onto one and hold it.",
      );
      el(
        "li",
        "",
        ul,
        "A gun that cannot point up cannot hit aircraft, and aircraft can hit anything that cannot answer. Flak is not optional.",
      );
      el(
        "li",
        "",
        ul,
        "Flak towers are hard targets: a hundred guns shooting one do three times the damage of ten, not ten times. Swarming one with light tanks wastes light tanks.",
      );

      const close = el("button", "zs-btn zs-big", box, "Close");
      close.onclick = () => this.toggleHelp(false);
    },

    toggleHelp(on) {
      this.helpOpen = on === undefined ? !this.helpOpen : on;
      this.helpEl.classList.toggle("zs-hidden", !this.helpOpen);
    },

    showResult(res) {
      clear(this.resultEl);
      const box = el("div", "zs-result", this.resultEl);
      el("h2", "", box, res.won ? "THE MAP IS YOURS" : "THE COMPANY HAS FALLEN");
      el("p", "zs-lede", box, res.why);
      const st = el("div", "zs-helpcols", box);
      const s = res.stats;
      for (const [k, v] of [
        ["Time", R.mmss(res.time)],
        ["Built", s.built],
        ["Taken", s.captured],
        ["Killed", s.killed],
        ["Lost", s.lost],
      ]) {
        const c = el("div", "zs-helpcol zs-stat", st);
        el("div", "zs-statv", c, String(v));
        el("div", "zs-statk", c, k);
      }
      const b = el("button", "zs-btn zs-big", box, "Start again");
      b.onclick = () => location.reload();
      this.resultEl.classList.remove("zs-hidden");
    },

    /* ==================================================================
       speed
       ================================================================== */

    setSpeed(v) {
      const g = this.g;
      if (v === 0) g.paused = !g.paused;
      else {
        g.paused = false;
        g.speed = v;
      }
      for (const s of this.speedBtns)
        s.b.classList.toggle("on", g.paused ? s.v === 0 : s.v === g.speed);
      this.pauseEl.style.display = g.paused ? "" : "none";
    },

    /* ==================================================================
       the frame
       ================================================================== */

    refresh(force) {
      const g = this.g;
      const f = g.factions[0];
      for (const r of R.RES) {
        const e = this.resEls[r.key];
        const v = Math.floor(f.res[r.key]);
        if (force || this.lastRes[r.key] !== v) {
          this.lastRes[r.key] = v;
          e.val.textContent = R.num(v);
        }
        const full = f.store[r.key] > 0 && f.res[r.key] >= f.store[r.key] - 0.5;
        e.box.classList.toggle("full", full);
        const rate = f.rate[r.key] * (f.productivity || 1);
        e.rate.textContent = rate > 0.05 ? "+" + (rate / 60).toFixed(1) : "";
        e.box.title =
          r.name +
          "  ·  " +
          Math.floor(f.res[r.key]) +
          " / " +
          Math.floor(f.store[r.key]) +
          (full ? "  — FULL, build storage" : "") +
          (rate > 0.05 ? "  ·  +" + (rate / 60).toFixed(2) + " per second" : "");
      }
      this.clockEl.textContent = R.clockLabel(g.time);
      this.capEl.textContent = "ARMY " + f.capUsed + "/" + f.cap;
      this.siteEl.textContent = "BASES " + f.sites;
      this.prodEl.textContent = "×" + (f.productivity || 1).toFixed(2);
      this.refreshSel(force);
      this.refreshCmd(force);
      this.refreshCap();
      this.refreshLog();
    },

    frame() {
      this.refresh(false);
    },

    /* ==================================================================
       the minimap layout
       ================================================================== */

    layout() {
      const r = this.mmFrame.getBoundingClientRect();
      R.Mini.place(r.left, r.top);
    },
  };

  R.UI = UI;
})();
