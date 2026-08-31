/* SANDSTORM — UI Overlay.

   Clean paper-and-ink interface.
   - Top-left: match timer, speed controls, Build toggle, the books
     (four stores, the gold purse, energy and military points, bases), help.
   - Top-right: tactical minimap.
   - Bottom: conditional deck (visible only when units/buildings are
     selected, or when the Build menu is opened via key B / Build button).

   The Build menu carries the whole catalogue: the industry and the
   military, the wall and the flak, the gold towers of the command
   section, and the ledger — the things gold buys that do not sit on
   a plot of ground at all (plated flak, the long gun, immediate
   resources, the acceleration hours). */
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
    {
      key: "c",
      name: "Capture",
      hint: "Capture a settlement (C) — then left-click the yard. The flaks must be down first.",
      kind: "capture",
    },
  ];

  // what the ×5 / ×0.2 specialty actually means, in words
  const SPEC_TEXT = {
    base: "the base itself",
    vehicle: "vehicles",
    bigveh: "heavy armour",
    weakveh: "light armour",
    vehboat: "boats",
    vehtrain: "trains",
    baunit: "base craft",
    air: "aircraft",
    bigair: "heavy aircraft",
    copter: "rotors",
    boat: "the navy",
    boattrain: "boats and trains",
    train: "the rail",
  };

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
       the books on the top bar
       ================================================================== */

    buildRes() {
      if (!this.resEl) return;
      clear(this.resEl);
      this.resChips = {};
      for (const r of R.RES) {
        const chip = el("div", "chip", this.resEl);
        chip.title = r.name + " — store & live generation";
        const dot = el("i", "", chip);
        dot.style.background = R.RES_INK[r.key] || "#706050";
        const val = el("b", "", chip, "0");
        const rate = el("span", "rate", chip, "");
        this.resChips[r.key] = { chip, val, rate };
      }
      // the gold purse
      const gchip = el("div", "chip", this.resEl);
      gchip.title = "Gold — earned slowly, spent on the command section";
      const gd = el("i", "", gchip);
      gd.style.background = R.RES_GOLD_INK || "#b08c2c";
      this.goldVal = el("b", "", gchip, "0");
      // the two hard books
      this.epChip = el("div", "chip stat", this.resEl);
      this.epChip.title =
        "Energy Points — every building costs some. A hundred over the cap and everything the books pay for stops.";
      this.mpChip = el("div", "chip stat", this.resEl);
      this.mpChip.title = "Military Points — every unit carries some. Squads are the group limit.";
      this.baseChip = el("div", "chip stat", this.resEl);
      this.baseChip.title = "Bases held / base cap (Command Bases raise the cap)";
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
        const rate = f.rate[r.key];
        c.rate.textContent = rate > 0.05 ? "+" + R.num(rate / 60) + "/s" : "";
        const capVal = Math.floor(f.store[r.key] || 0);
        const full = capVal > 0 && v >= capVal - 0.5;
        c.chip.style.color = full ? "#9a4030" : "";
      }
      const gold = Math.floor(f.gold);
      if (force || this.lastRes.gold !== gold) {
        this.lastRes.gold = gold;
        this.goldVal.textContent = gold + " g";
      }
      if (force || this.lastRes.ep !== f.ep) {
        this.lastRes.ep = f.ep;
        this.epChip.textContent = "EP " + Math.round(f.ep) + " / " + f.epMax;
      }
      this.epChip.style.color = f.produceStopped ? "#9a4030" : "";
      const nSquads = Object.keys(f.squads).length;
      if (
        force ||
        this.lastRes.mp !== f.mp ||
        this.lastRes.sq !== nSquads ||
        this.lastRes.mpMax !== f.mpMax
      ) {
        this.lastRes.mp = f.mp;
        this.lastRes.sq = nSquads;
        this.lastRes.mpMax = f.mpMax;
        this.mpChip.textContent =
          "MP " + Math.round(f.mp) + "/" + f.mpMax + " · " + nSquads + "/" + f.squadCap + " sq";
      }
      this.mpChip.style.color = f.produceStopped ? "#9a4030" : "";
      const capBase = 3 + (f.counts.maxcommand || 0);
      this.baseChip.textContent = "Bases " + f.sites + "/" + capBase;
      this.baseChip.title = "Bases held / base cap · Command Bases raise the cap";
    },

    /* ==================================================================
       conditional bottom deck
       ================================================================== */

    toggleBuild(force) {
      this.buildOpen = force === undefined ? !this.buildOpen : force;
      if (this.btnBuild) this.btnBuild.classList.toggle("on", this.buildOpen);
      if (this.buildOpen) {
        this.g.clearSel();
        if (!this.buildTab || this.buildTab === "ledger") this.buildTab = "econ";
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

      const f = g.factions[0];
      let sig = "";
      if (!sel.length) {
        sig =
          "build|" +
          this.buildTab +
          "|" +
          (this.place || "") +
          "|" +
          Math.round(f.gold) +
          "|" +
          f.produceStopped;
      } else if (sel.length === 1) {
        const e = sel[0];
        sig =
          "one|" +
          e.id +
          "|" +
          Math.round(e.hp) +
          "|" +
          (e.queue ? e.queue.length : 0) +
          "|" +
          (e.upgrading || 0) +
          "|" +
          e.lvl;
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
      const g = this.g;
      const f = g.factions[0];
      const head = el("div", "deck-head", box);
      el("span", "deck-title", head, "Build Structures");

      const tabs = el("div", "deck-tabs", head);
      for (const cat of R.BUILD_MENU) {
        const tb = el("button", "", tabs, cat.name);
        tb.classList.toggle("on", this.buildTab === cat.key);
        tb.onclick = () => {
          this.buildTab = cat.key;
          this.cancelPlace();
          this.refreshDeck(true);
        };
      }
      const tbG = el("button", "", tabs, "Gold");
      tbG.classList.toggle("on", this.buildTab === "ledger");
      tbG.onclick = () => {
        this.buildTab = "ledger";
        this.cancelPlace();
        this.refreshDeck(true);
      };

      const close = el("button", "", head, "✕");
      close.style.padding = "0 5px";
      close.onclick = () => this.toggleBuild(false);

      const body = el("div", "deck-body", box);
      const grid = el("div", "deck-grid", body);

      if (f.produceStopped) {
        const warn = el("button", "danger", grid);
        warn.textContent = "⚠ Books overdrawn — building & production stopped";
        warn.disabled = true;
        warn.style.cssText = "grid-column: 1 / -1; white-space: normal;";
      }

      if (this.buildTab === "ledger") {
        this.renderLedger(grid);
        return;
      }

      const activeCat = R.BUILD_MENU.find((c) => c.key === this.buildTab) || R.BUILD_MENU[0];
      for (let i = 0; i < activeCat.keys.length; i++) {
        const key = activeCat.keys[i];
        const def = R.BDEF[key];
        if (!def) continue;
        const have = g.count(0, key);
        const cap = def.perSite ? null : g.maxBuildings(0, key);
        const atCap = cap !== null && have >= cap;
        const hk = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"][i];

        const price = def.goldBld ? "Gold " + R.Economy.goldPrice(f, def) : this.costText(def.cost);
        const btn = el("button", "", grid, def.name + (hk ? " (" + hk + ")" : ""));
        if (this.place === key) btn.classList.add("on");
        if (atCap) btn.disabled = true;

        let req = "";
        if (def.site) req = "\nNeeds " + R.BASE_TYPES[def.site[0]].name.toLowerCase() + " ground";
        if (def.perSite) req += "\nOne per settlement";
        if (def.water) req += "\nBuilt on the water";
        if (def.rail) req += "\nMust touch the rail";

        btn.title =
          def.name +
          "\n" +
          (def.desc || "") +
          req +
          "\n\n" +
          price +
          (def.time ? " · " + def.time + "s" : "") +
          (def.ep ? " · " + def.ep + " EP" : "") +
          "\n" +
          have +
          (cap !== null ? "/" + cap : "") +
          " built";

        btn.onclick = () => {
          if (atCap) {
            this.toast("Limit reached for " + def.name, "bad");
            return;
          }
          if (def.goldBld && f.gold < R.Economy.goldPrice(f, def))
            this.toast("Not enough gold", "bad");
          else if (!def.goldBld && !g.canPay(0, def.cost))
            this.toast("Not enough " + this.missingOf(def.cost), "bad");
          this.pickBuild(key);
        };
      }
    },

    // the ledger: gold purchases that do not sit on a plot of ground
    renderLedger(grid) {
      const g = this.g;
      const f = g.factions[0];
      for (const L of R.GOLD_LEDGER) {
        const btn = el("button", "", grid, L.name + " (" + L.cost + " g)");
        btn.title = L.name + "\n" + L.desc + "\n\nGold " + L.cost;
        if (L.key === "flakArmor" && f.flakL2) btn.disabled = true;
        if (L.key === "flakWeapon" && f.flakL3) btn.disabled = true;
        if (L.key === "flakWeapon" && !f.flakL2) btn.title += "\n(plate the flaks first)";
        btn.onclick = () => {
          const why = R.Economy.buyGoldItem(g, f, L.key);
          if (why) this.toast(why[0].toUpperCase() + why.slice(1), "bad");
          else {
            this.deckSig = "";
            if (ZS.sound) ZS.sound.event("order");
          }
        };
      }
      const hint = el("button", "", grid, "Gold towers: see Command");
      hint.disabled = true;
      hint.title =
        "Power, points, plate and extensions are buildings — open them in the Command tab and place them on your own ground.";
    },

    renderOneDeck(e) {
      const box = this.deckEl;
      const g = this.g;
      const f = g.factions[0];

      const head = el("div", "deck-head", box);
      el("span", "deck-title", head, e.def.name);
      const sub = el("span", "deck-sub", head);
      if (e.kind === "b") {
        const siteTxt =
          e.site && R.BASE_TYPES[e.site.kind]
            ? " on " + R.BASE_TYPES[e.site.kind].name.toLowerCase() + " ground"
            : "";
        sub.textContent = "Level " + e.lvl + siteTxt + " · " + (R.factionName[e.fac] || "Neutral");
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
        if (e.def.makes)
          el(
            "",
            "",
            stats,
            "Output: +" + R.num(R.levelRate(e.def, e.lvl) / 60) + "/s " + e.def.makes,
          );
        if (e.def.flak) {
          const lvl =
            f && e.fac === 0
              ? f.flakL3
                ? "L3 · the long gun"
                : f.flakL2
                  ? "L2 · plated"
                  : "L1"
              : "L1";
          el("div", "", stats, "Flak " + lvl);
          if (e.fac === 0)
            el("div", "", stats, "Plate (29 g) & long gun (99 g) live in the Gold tab");
        }
        if (e.def.ep) el("div", "", stats, e.def.ep + " Energy Points");
        if (e.def.mp) el("div", "", stats, "+" + e.def.mp + " Military Points");
        if (e.def.goldBld && e.def.recover !== false && e.def.recover)
          el("div", "", stats, "Comes back for " + e.def.recover + " g if the base falls");
        if (e.site && e.def.makes)
          el("div", "", stats, "Max level here: " + R.maxLevelOf(e.def, e.site));
        if (e.upgrading) el("div", "", stats, "Upgrading… " + Math.max(0, Math.ceil(e.upT)) + "s");
        if (e.built && f.produceStopped && e.fac === 0 && !e.def.goldBld)
          el("div", "", stats, "⚠ stopped — the books are overdrawn");
      } else {
        el("div", "", stats, "Armour: " + (e.def.arm + (e.vet || 0)) + " · Speed: " + e.def.speed);
        if (e.w) {
          let wtxt = "Damage: " + e.w.dmg + " · Range: " + Math.round(e.w.range / 40) + " tiles";
          if (e.def.spec)
            wtxt +=
              "\n" +
              R.SPEC_MUL +
              "× vs " +
              (SPEC_TEXT[e.def.spec] || e.def.spec) +
              " · " +
              R.SPEC_OFF +
              "× vs the rest";
          el("div", "", stats, wtxt);
        }
        if (e.def.fuel) el("div", "", stats, "Fuel: " + e.def.fuel + "/s while moving");
        if (e.def.mp) el("div", "", stats, e.def.mp + " MP · group of " + (e.def.grp || 1));
        const tags = [];
        if (e.def.stealth) tags.push("stealth");
        if (e.def.detector) tags.push("detector");
        if (e.def.train) tags.push("rail-bound");
        if (e.def.water) tags.push("sea");
        if (e.def.capture) tags.push("takes settlements");
        if (e.def.givesAmmo) tags.push("refills guns");
        if (tags.length) el("div", "", stats, tags.join(" · "));
        if (e.def.ammo)
          el("div", "", stats, "Ammo: " + (e.ammo !== undefined ? e.ammo : e.def.ammo) + " shells");
      }

      // actions right grid
      const grid = el("div", "deck-grid", body);

      if (e.kind === "b" && e.fac === 0) {
        const upCost = R.Base.upCostFor(g, e);
        if (upCost && e.built && !e.upgrading) {
          const btnUp = el("button", "", grid, "Upgrade (U)");
          btnUp.title = this.costText(upCost) + " · " + R.upTime(e.def, e.lvl) + "s";
          btnUp.onclick = () => {
            if (!R.Base.startUpgrade(g, e)) {
              this.toast(
                upCost.gold ? "Not enough gold" : "Not enough " + this.missingOf(upCost),
                "bad",
              );
            } else {
              this.deckSig = "";
              if (ZS.sound) ZS.sound.event("order");
            }
          };
        } else if (e.def.makes && e.built) {
          const done = el("button", "", grid, "Max level");
          done.disabled = true;
          done.title = "This factory stands at its height";
        }

        if (R.PRODUCES[e.key]) {
          const prods = R.PRODUCES[e.key];
          prods.forEach((k, i) => {
            const udef = R.UDEF[k];
            if (!udef) return;
            const hk = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"][i] || "";
            const cost = R.Economy.unitCost(g, f, k);
            const btnP = el("button", "", grid, udef.name + (hk ? " (" + hk + ")" : ""));
            btnP.title =
              udef.name +
              (udef.role ? "\n" + udef.role : "") +
              "\n" +
              this.costText(cost) +
              " · " +
              udef.time +
              "s · " +
              udef.mp +
              " MP";
            btnP.onclick = () => this.queueUnit(e, k);
          });

          if (e.queue && e.queue.length) {
            e.queue.forEach((item, idx) => {
              const qbtn = el(
                "button",
                "danger",
                grid,
                (R.UDEF[item.key] ? R.UDEF[item.key].short : item.key) +
                  " ✕ " +
                  Math.max(0, Math.ceil(item.t)) +
                  "s",
              );
              qbtn.title = "Cancel (refunds the price)";
              qbtn.onclick = () => {
                R.Base.cancelQueued(g, e, idx);
                this.deckSig = "";
              };
            });
          }

          const btnRally = el("button", "", grid, "Rally (Y)");
          btnRally.title = "New units ride to this point instead of drifting out";
          btnRally.onclick = () => {
            this.rally = true;
            this.toast("Left-click the map to set the rally point");
          };
        }

        const btnDemo = el("button", "danger", grid, "Demolish");
        btnDemo.title = "Tears it down (Del)";
        btnDemo.onclick = () => {
          if (e.def.goldBld) {
            const price = R.Economy.goldPrice(f, e.def);
            f.gold += Math.round(price * (e.built ? 0.5 : 1));
          } else {
            g.refund(0, e.def.cost, e.built ? 0.5 : 1);
          }
          g.removeBuilding(e, true);
          this.deckSig = "";
        };
      } else if (e.kind === "u" && e.fac === 0) {
        for (const o of ORDERS) {
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
      el("span", "deck-title", head, sel.length + " Selected");
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
        const line = el("div", "", stats, (grp[0].def.name || k) + ": " + grp.length);
        line.style.cursor = "pointer";
        line.onclick = () => {
          g.select(grp, false);
          this.deckSig = "";
          this.refreshDeck(true);
        };
      }

      // actions right grid
      const grid = el("div", "deck-grid", body);
      const anyCap = sel.some((e) => e.kind === "u" && e.def.capture);

      for (const o of ORDERS) {
        if (o.kind === "capture" && !anyCap) continue;
        const btn = el("button", "", grid, o.name + " (" + o.key.toUpperCase() + ")");
        btn.title = o.hint;
        btn.onclick = () => this.beginOrder(o.kind);
      }

      const btnForm = el("button", "", grid, "Form up (F)");
      btnForm.title = "Stack the selection into a marching column";
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
      this.app.armed = null;
      this.toast("Placing " + R.BDEF[key].name + " — left click to site, Esc to cancel");
    },

    cancelPlace() {
      this.place = null;
      R.Render.ghost = null;
      this.refreshDeck(true);
    },

    queueUnit(b, key) {
      if (!R.Base.queueItem(this.g, b, key)) {
        const f = this.g.factions[0];
        if (f.produceStopped) this.toast("Books overdrawn — production is stopped", "bad");
        else if (!this.g.canPay(0, R.Economy.unitCost(this.g, f, key)))
          this.toast("Not enough " + this.missingOf(R.Economy.unitCost(this.g, f, key)), "bad");
        else if (b.lastFail === "mp")
          this.toast("Military Points run out — raise a Military Central", "bad");
        else if (b.lastFail === "squad")
          this.toast("No squad left — raise a Group Extension", "bad");
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
      if (kind === "capture") {
        this.app.armed = kind;
        this.patrolFrom = null;
        this.toast("Capture — left-click the settlement you want to turn");
        return;
      }

      this.app.armed = kind;
      this.patrolFrom = null;
      this.toast(
        (kind === "amove"
          ? "Attack move"
          : kind === "patrol"
            ? "Patrol — click the near end"
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
      const f = this.g.factions[0];
      if (cost.gold && f.gold < cost.gold) return "gold";
      const r = f.res;
      for (const k in cost) if (r[k] < cost[k]) return R.RES_NAME[k] || k;
      return "resources";
    },

    costText(cost) {
      const out = [];
      if (cost.gold) out.push("Gold " + cost.gold);
      for (const r of R.RES) if (cost[r.key]) out.push(r.name + " " + R.num(cost[r.key]));
      return out.join(", ") || "free";
    },

    /* ==================================================================
       toasts, help, speed, result
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

    // the end of it: what the run bought
    showResult(result) {
      if (this.helpWrap) this.toggleHelp(false);
      let wrap = document.getElementById("resultwrap");
      if (!wrap) {
        wrap = el("div", "", document.getElementById("ui"));
        wrap.id = "resultwrap";
        wrap.style.cssText =
          "position:fixed;inset:0;display:none;background:rgba(240,234,218,0.82);pointer-events:auto;z-index:30;";
      }
      wrap.innerHTML = "";
      const card = el("div", "card paper", wrap);
      card.style.cssText =
        "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-0.3deg);padding:18px 26px;width:420px;font-size:14px;line-height:1.55;";
      el("h2", "", card, result.won ? "the company stands" : "the command centre has fallen");
      el(
        "div",
        "",
        card,
        result.why + (result.time ? " · " + R.mmss(result.time) + " on the sand" : ""),
      );
      const st = result.stats || {};
      const rows = [
        ["buildings raised", st.built],
        ["flaks broken", st.flakBroken],
        ["losses suffered", st.lost],
        ["sites held", this.g ? this.g.factions[0].sites : 0],
        ["gold in the purse", this.g ? Math.floor(this.g.factions[0].gold) : 0],
      ];
      for (const r of rows) {
        const d = el("div", "", card);
        el("span", "k", d, r[0]);
        el("span", "", d, r[1] !== undefined ? r[1] : "—");
      }
      const again = el("button", "", card, "Again");
      again.style.marginTop = "10px";
      again.onclick = () => location.reload();
      wrap.style.display = "block";
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
