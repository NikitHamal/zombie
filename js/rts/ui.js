/* Desert Order — UI Overlay.

   Clean paper-and-ink interface.
   - Top-left: match timer, speed controls, Build toggle, help.
   - Top-center: live resources and army cap.
   - Top-right: tactical minimap.
   - Bottom: conditional deck (visible only when units/buildings are selected,
     or when the Build menu is opened via key B / Build button). */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});

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

  const ORDERS = [
    { key: "a", name: "Attack", hint: "Attack-move (A)", kind: "amove" },
    { key: "m", name: "Move", hint: "Move (M)", kind: "move" },
    { key: "p", name: "Patrol", hint: "Patrol line (P)", kind: "patrol" },
    { key: "h", name: "Hold", hint: "Hold position (H)", kind: "hold" },
    { key: "s", name: "Stop", hint: "Stop (S)", kind: "stop" },
    { key: "r", name: "Repair", hint: "Repair (R)", kind: "repair" },
    { key: "c", name: "Capture", hint: "Capture site (C)", kind: "capture" },
  ];

  const UI = {
    g: null,
    app: null,
    place: null,
    rally: false,
    buildOpen: false,
    buildTab: "econ",
    groups: Object.create(null),
    lastRes: {},
    helpOpen: false,
    deckSig: "",

    init(g, app) {
      this.g = g;
      this.app = app;

      this.clockEl = document.getElementById("clock");
      this.resEl = document.getElementById("res");
      this.deckEl = document.getElementById("deck");
      this.toastEl = document.getElementById("toast");
      this.helpWrap = document.getElementById("helpwrap");

      // speed buttons
      const sp0 = document.getElementById("sp0");
      const sp1 = document.getElementById("sp1");
      const sp2 = document.getElementById("sp2");
      const sp3 = document.getElementById("sp3");
      if (sp0) sp0.onclick = () => this.setSpeed(0);
      if (sp1) sp1.onclick = () => this.setSpeed(1);
      if (sp2) sp2.onclick = () => this.setSpeed(2);
      if (sp3) sp3.onclick = () => this.setSpeed(3);
      this.speedBtns = [
        { v: 0, b: sp0 },
        { v: 1, b: sp1 },
        { v: 2, b: sp2 },
        { v: 3, b: sp3 },
      ];

      const btnBuild = document.getElementById("btn-build");
      if (btnBuild) {
        this.btnBuild = btnBuild;
        btnBuild.onclick = () => this.toggleBuild();
      }

      const btnHelp = document.getElementById("btn-help");
      if (btnHelp) btnHelp.onclick = () => this.toggleHelp();
      if (this.helpWrap) {
        this.helpWrap.onclick = (e) => {
          if (e.target === this.helpWrap) this.toggleHelp(false);
        };
      }

      // mount minimap top-right
      const miniCv = document.getElementById("mini");
      if (miniCv) {
        R.Mini.mount(miniCv);
        R.Mini.resize(144);
        miniCv.onpointerdown = (e) => this.app.onMini(e, true);
        miniCv.onpointermove = (e) => {
          if (this.app.miniDrag) this.app.onMini(e, false);
        };
      }

      this.buildRes();
      this.refresh(true);
      return this;
    },

    /* ==================================================================
       resources
       ================================================================== */

    buildRes() {
      if (!this.resEl) return;
      clear(this.resEl);
      this.resChips = {};
      for (const r of R.RES) {
        const chip = el("div", "chip", this.resEl);
        chip.title = r.name + " storage & live generation rate";
        const dot = el("i", "", chip);
        dot.style.background = R.RES_INK[r.key] || "#706050";
        const val = el("b", "", chip, "0");
        const rate = el("span", "rate", chip, "");
        this.resChips[r.key] = { chip, val, rate };
      }
      this.armyChip = el("div", "chip stat", this.resEl);
    },

    refreshRes(force) {
      if (!this.resEl || !this.resChips) return;
      const f = this.g.factions[0];
      for (const r of R.RES) {
        const c = this.resChips[r.key];
        if (!c) continue;
        const v = Math.floor(f.res[r.key]);
        if (force || this.lastRes[r.key] !== v) {
          this.lastRes[r.key] = v;
          c.val.textContent = R.num(v);
        }
        const rate = f.rate[r.key] * (f.productivity || 1);
        c.rate.textContent = rate > 0.05 ? "+" + (rate / 60).toFixed(1) : "";
        const capVal = Math.floor(f.store[r.key] || 0);
        const full = capVal > 0 && v >= capVal - 0.5;
        c.chip.style.color = full ? "#9a4030" : "";
      }
      if (this.armyChip) {
        this.armyChip.textContent = "Army: " + f.capUsed + " / " + f.cap + " · Bases: " + f.sites;
        this.armyChip.style.color = f.capUsed >= f.cap ? "#9a4030" : "";
      }
    },

    /* ==================================================================
       conditional bottom deck
       ================================================================== */

    toggleBuild(force) {
      this.buildOpen = force === undefined ? !this.buildOpen : force;
      if (this.btnBuild) this.btnBuild.classList.toggle("on", this.buildOpen);
      if (this.buildOpen) {
        this.g.clearSel();
      } else {
        this.cancelPlace();
      }
      this.refreshDeck(true);
    },

    refreshDeck(force) {
      if (!this.deckEl) return;
      const g = this.g;
      const sel = g.selection();

      const shouldShow = sel.length > 0 || this.buildOpen || !!this.place;
      this.deckEl.classList.toggle("on", shouldShow);
      if (this.btnBuild) this.btnBuild.classList.toggle("on", this.buildOpen || !!this.place);

      if (!shouldShow) {
        this.deckSig = "none";
        clear(this.deckEl);
        return;
      }

      let sig = "";
      if (!sel.length) {
        sig = "build|" + this.buildTab + "|" + (this.place || "");
      } else if (sel.length === 1) {
        const e = sel[0];
        sig = "one|" + e.id + "|" + Math.round(e.hp) + "|" + (e.queue ? e.queue.length : 0);
      } else {
        sig = "many|" + sel.length;
        for (const e of sel) sig += "|" + e.key;
      }

      if (!force && sig === this.deckSig) return;
      this.deckSig = sig;

      clear(this.deckEl);

      if (!sel.length) this.renderBuildDeck();
      else if (sel.length === 1) this.renderOneDeck(sel[0]);
      else this.renderManyDeck(sel);
    },

    renderBuildDeck() {
      const box = this.deckEl;
      const head = el("div", "deck-head", box);
      el("span", "deck-title", head, "Build Structures");

      const tabs = el("div", "deck-tabs", head);
      for (const cat of R.BUILD_MENU) {
        const tb = el("button", "", tabs, cat.name);
        tb.classList.toggle("on", this.buildTab === cat.key);
        tb.onclick = () => {
          this.buildTab = cat.key;
          this.refreshDeck(true);
        };
      }

      const close = el("button", "", head, "✕");
      close.style.padding = "0 5px";
      close.onclick = () => this.toggleBuild(false);

      const body = el("div", "deck-body", box);
      const grid = el("div", "deck-grid", body);
      const activeCat = R.BUILD_MENU.find((c) => c.key === this.buildTab) || R.BUILD_MENU[0];

      for (let i = 0; i < activeCat.keys.length; i++) {
        const key = activeCat.keys[i];
        const def = R.BDEF[key];
        if (!def) continue;
        const have = this.g.count(0, key);
        const cap = this.g.maxBuildings(0, key);
        const atCap = have >= cap;
        const hk = ["Q", "W", "E", "R", "T", "Y"][i];

        const btn = el("button", "", grid, def.name + (hk ? " (" + hk + ")" : ""));
        if (this.place === key) btn.classList.add("on");
        if (atCap) btn.disabled = true;

        btn.title =
          def.name +
          "\n" +
          def.desc +
          "\n\n" +
          this.costText(def.cost) +
          " · " +
          def.time +
          "s · " +
          def.hp +
          " hp\n" +
          have +
          "/" +
          cap +
          " built";

        btn.onclick = () => {
          if (atCap) {
            this.toast("Limit reached for " + def.name, "bad");
            return;
          }
          if (!this.g.canPay(0, def.cost)) {
            this.toast("Not enough " + this.missingOf(def.cost), "bad");
          }
          this.pickBuild(key);
        };
      }
    },

    renderOneDeck(e) {
      const box = this.deckEl;
      const g = this.g;

      const head = el("div", "deck-head", box);
      el("span", "deck-title", head, e.def.name);
      const sub = el("span", "deck-sub", head);
      if (e.kind === "b") {
        sub.textContent = "Level " + e.lvl + " · " + (R.factionName[e.fac] || "Neutral");
      } else {
        sub.textContent =
          (e.def.cls ? e.def.cls.toUpperCase() : "UNIT") +
          " · " +
          (R.factionName[e.fac] || "Neutral");
      }
      const close = el("button", "", head, "✕");
      close.style.padding = "0 5px";
      close.onclick = () => g.clearSel();

      const body = el("div", "deck-body", box);

      // stats left column
      const stats = el("div", "deck-stats", body);
      const hpWrap = el("div", "hpbar", stats);
      const hpFill = el("i", "", hpWrap);
      const pct = Math.max(0, Math.min(100, (e.hp / e.maxHp) * 100));
      hpFill.style.width = pct + "%";
      if (pct < 30) hpFill.style.background = "#9a4030";
      else if (pct < 65) hpFill.style.background = "#9a6a1e";

      el("div", "", stats, "HP: " + Math.ceil(e.hp) + " / " + e.maxHp);
      if (e.kind === "b") {
        if (e.def.rate)
          el("div", "", stats, "Output: +" + (R.levelRate(e.def, e.lvl) / 60).toFixed(1) + "/s");
        if (e.def.cap) el("div", "", stats, "Army Cap: +" + e.def.cap);
      } else {
        el("div", "", stats, "Armour: " + (e.def.arm + (e.vet || 0)) + " · Speed: " + e.def.speed);
        if (e.w) el("div", "", stats, "Damage: " + e.w.dmg + " · Range: " + e.w.range);
      }

      // actions right grid
      const grid = el("div", "deck-grid", body);

      if (e.kind === "b" && e.fac === 0) {
        const upCost = R.Base.upCostFor(g, e);
        if (upCost && e.built && !e.upgrading) {
          const btnUp = el("button", "", grid, "Upgrade (U)");
          btnUp.title = this.costText(upCost) + " · " + R.upTime(e.def, e.lvl) + "s";
          btnUp.onclick = () => {
            if (!R.Base.startUpgrade(g, e))
              this.toast("Not enough " + this.missingOf(upCost), "bad");
            else {
              this.deckSig = "";
              if (ZS.sound) ZS.sound.event("order");
            }
          };
        }

        if (R.PRODUCES[e.key]) {
          const prods = R.PRODUCES[e.key];
          prods.forEach((k, i) => {
            const udef = R.UDEF[k];
            if (!udef) return;
            const hk = ["Q", "W", "E", "R", "T", "Y"][i] || "";
            const btnP = el("button", "", grid, udef.name + (hk ? " (" + hk + ")" : ""));
            btnP.title = udef.name + "\n" + this.costText(udef.cost) + " · " + udef.time + "s";
            btnP.onclick = () => this.queueUnit(e, k);
          });

          if (e.queue && e.queue.length) {
            e.queue.forEach((item, idx) => {
              const qbtn = el(
                "button",
                "danger",
                grid,
                (R.UDEF[item.key] ? R.UDEF[item.key].short : item.key) + " ✕",
              );
              qbtn.title = "Cancel queued unit";
              qbtn.onclick = () => {
                R.Base.cancelQueued(g, e, idx);
                this.deckSig = "";
              };
            });
          }

          const btnRally = el("button", "", grid, "Rally (Y)");
          btnRally.onclick = () => {
            this.rally = true;
            this.toast("Right-click map to set rally point");
          };
        }

        const btnDemo = el("button", "danger", grid, "Demolish");
        btnDemo.title = "Refunds half cost (Del)";
        btnDemo.onclick = () => {
          g.refund(0, e.def.cost, e.built ? 0.5 : 1);
          g.removeBuilding(e, true);
          this.deckSig = "";
        };
      } else if (e.kind === "u" && e.fac === 0) {
        for (const o of ORDERS) {
          if (o.kind === "repair" && !e.def.repair) continue;
          if (o.kind === "capture" && !e.def.capture) continue;
          const btn = el("button", "", grid, o.name + " (" + o.key.toUpperCase() + ")");
          btn.title = o.hint;
          btn.onclick = () => this.beginOrder(o.kind);
        }
      }
    },

    renderManyDeck(sel) {
      const box = this.deckEl;
      const g = this.g;

      const head = el("div", "deck-head", box);
      el("span", "deck-title", head, sel.length + " Units Selected");
      const close = el("button", "", head, "✕");
      close.style.padding = "0 5px";
      close.onclick = () => g.clearSel();

      const body = el("div", "deck-body", box);

      // stats left column
      const stats = el("div", "deck-stats", body);
      const byKey = {};
      for (const e of sel) (byKey[e.key] = byKey[e.key] || []).push(e);
      for (const k in byKey) {
        const grp = byKey[k];
        const line = el("div", "", stats, grp[0].def.name + ": " + grp.length);
        line.style.cursor = "pointer";
        line.onclick = () => {
          g.select(grp, false);
          this.deckSig = "";
          this.refreshDeck(true);
        };
      }

      // actions right grid
      const grid = el("div", "deck-grid", body);
      const anyRepair = sel.some((e) => e.kind === "u" && e.def.repair);
      const anyCap = sel.some((e) => e.kind === "u" && e.def.capture);

      for (const o of ORDERS) {
        if (o.kind === "repair" && !anyRepair) continue;
        if (o.kind === "capture" && !anyCap) continue;
        const btn = el("button", "", grid, o.name + " (" + o.key.toUpperCase() + ")");
        btn.title = o.hint;
        btn.onclick = () => this.beginOrder(o.kind);
      }

      const btnForm = el("button", "", grid, "Form up (F)");
      btnForm.onclick = () => this.formUp();
    },

    /* ==================================================================
       orders & building placement
       ================================================================== */

    pickBuild(key) {
      if (this.place === key) {
        this.cancelPlace();
        return;
      }
      this.place = key;
      this.rally = false;
      this.toast("Placing " + R.BDEF[key].name + " — left click to site, Esc to cancel");
    },

    cancelPlace() {
      this.place = null;
      R.Render.ghost = null;
      this.refreshDeck(true);
    },

    queueUnit(b, key) {
      if (!R.Base.queueItem(this.g, b, key)) {
        const ud = R.UDEF[key];
        const f = this.g.factions[0];
        if (f.capUsed + ud.pop > f.cap)
          this.toast("Army cap reached — raise a Command Centre or Vehicle Works", "bad");
        else if (!this.g.canPay(0, ud.cost))
          this.toast("Not enough " + this.missingOf(ud.cost), "bad");
        else this.toast("Cannot queue that here", "bad");
        return;
      }
      this.deckSig = "";
      if (ZS.sound) ZS.sound.event("order");
    },

    beginOrder(kind) {
      if (kind === "stop") {
        for (const u of this.g.selUnits()) R.Entity.setOrder(this.g, u, { type: "stop" });
        if (ZS.sound) ZS.sound.event("order");
        return;
      }
      if (kind === "repair") {
        const list = this.g.selUnits().filter((u) => u.def.repair);
        for (const u of list) {
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

      this.app.armed = kind;
      this.toast(
        (kind === "amove"
          ? "Attack move"
          : kind === "patrol"
            ? "Patrol"
            : kind === "hold"
              ? "Hold"
              : "Move") + " — left-click map",
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

    missingOf(cost) {
      const r = this.g.factions[0].res;
      for (const k in cost) if (r[k] < cost[k]) return R.RES_NAME[k] || k;
      return "resources";
    },

    costText(cost) {
      const out = [];
      for (const r of R.RES) if (cost[r.key]) out.push(r.name + " " + cost[r.key]);
      return out.join(", ") || "free";
    },

    /* ==================================================================
       toasts, help & speed
       ================================================================== */

    toast(text, kind) {
      if (!this.toastEl) return;
      this.toastEl.textContent = text;
      this.toastEl.className = "paper" + (kind ? " " + kind : "");
      this.toastEl.classList.add("on");
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        if (this.toastEl) this.toastEl.classList.remove("on");
      }, 3000);
    },

    toggleHelp(on) {
      this.helpOpen = on === undefined ? !this.helpOpen : on;
      if (this.helpWrap) this.helpWrap.classList.toggle("on", this.helpOpen);
    },

    setSpeed(v) {
      const g = this.g;
      if (v === 0) g.paused = !g.paused;
      else {
        g.paused = false;
        g.speed = v;
      }
      for (const s of this.speedBtns) {
        if (s.b) s.b.classList.toggle("on", g.paused ? s.v === 0 : s.v === g.speed);
      }
    },

    /* ==================================================================
       frame loop
       ================================================================== */

    refresh(force) {
      const g = this.g;
      if (this.clockEl) this.clockEl.textContent = R.mmss(g.time);
      this.refreshRes(force);
      this.refreshDeck(force);
    },

    frame() {
      this.refresh(false);
    },
  };

  R.UI = UI;
})();
