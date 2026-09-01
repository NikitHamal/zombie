/* The Hollow — the overlay UI. A thin, paper-coloured DOM layer over the
   canvas: the clock, the stores, the selection card, and two panels that
   only exist while you want them (build · research · the valley · the
   record). The split is deliberate: DOM carries the persistent controls,
   everything the sim writes — toasts, warnings, the dawn and the fall
   cards — is drawn on the canvas in the sketch hand.

   Every control has a key. The screen stays clean: panels open on demand,
   the selection card only exists while something is selected. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const JOBS = [
    { id: "labourer", key: "L", name: "labourer", hint: "takes whatever needs doing" },
    { id: "wood", key: "W", name: "woodcutter", hint: "fell trees, stack the wood" },
    { id: "stone", key: "S", name: "quarrier", hint: "break rock at the quarry" },
    { id: "food", key: "F", name: "forager", hint: "berries, roots, whatever's ripe" },
    { id: "farm", key: "M", name: "farmer", hint: "sow, tend and reap the plots" },
    { id: "build", key: "B", name: "builder", hint: "raise what you mark out" },
    { id: "repair", key: "R", name: "repairer", hint: "patch walls and roofs" },
    { id: "guard", key: "G", name: "guard", hint: "stand the watch, hold the line" },
    { id: "heal", key: "C", name: "healer", hint: "tend the wounded and the bitten" },
    { id: "smith", key: "O", name: "armourer", hint: "turn scrap into arms at the forge" },
    { id: "idle", key: "X", name: "idle", hint: "rest, wander, stay out of trouble" },
  ];

  const UI = {
    scen: null,
    el: {},
    sig: {},
    html: { sel: "", panel: "", res: "" },
    toastT: 0,

    init(scen) {
      // idempotent, and safe to call with nothing: main.js binds it as
      // soon as the scenario exists, and the page binds it again after.
      if (scen && this.scen === scen && this.el && this.el.clock) return this;
      this.scen = scen || this.scen;
      const q = (id) => document.getElementById(id);
      this.el = {
        clock: q("clock"),
        wx: q("wx"),
        res: q("res"),
        sel: q("sel"),
        panel: q("panel"),
        toast: q("toast"),
        alerts: q("alerts"),
        help: q("helpwrap"),
        speeds: [q("sp0"), q("sp1"), q("sp2"), q("sp3")],
      };
      const click = (id, fn) => {
        const e = q(id);
        if (e) e.addEventListener("click", fn);
      };
      click("sp0", () => scen.setSpeed(0));
      click("sp1", () => scen.setSpeed(1));
      click("sp2", () => scen.setSpeed(2));
      click("sp3", () => scen.setSpeed(3));
      click("roles", () => this.act("villagers-panel"));
      click("buildb", () => this.act("build-panel"));
      click("workb", () => this.act("research-panel"));
      click("armyb", () => this.act("army-panel"));
      click("natb", () => this.act("nations-panel"));
      click("mapb", () => this.act("world-panel"));
      click("bookb", () => this.act("chron-panel"));
      click("pilotb", () => this.act("pilot"));
      click("watchb", () => this.act("watch"));
      click("settingsb", () => this.toggleHelp());
      click("settings-close", () => this.toggleHelp(false));
      click("qualb", () => (ZS.Perf ? ZS.Perf.cycle() : null));
      click("home", () => scen.focusHall());
      click("fit", () => scen.fitView());
      click("bell", () => scen.ringBell());
      click("sound", () => scen.toggleSound());
      click("helpb", () => this.toggleHelp());
      const helpwrap = q("helpwrap");
      if (helpwrap) {
        helpwrap.addEventListener("click", (e) => {
          if (e.target === helpwrap) this.toggleHelp(false);
        });
      }
      window.addEventListener("keydown", (e) => this.key(e));
      // The panel's rows are rebuilt whenever the village changes, so the
      // clicks are delegated — and taken on *press*: a node that is replaced
      // between press and release never fires a click, and that was why the
      // cards only ever answered the keyboard.
      const press = (el) =>
        el.addEventListener("pointerdown", (e) => {
          const row = e.target.closest("[data-act]");
          if (!row) return;
          e.preventDefault();
          this.act(row.dataset.act, row.dataset.arg, row.dataset.who);
        });
      press(this.el.panel);
      press(this.el.sel);
      if (this.el.alerts) press(this.el.alerts);
      if (this.pendingToast) {
        const m = this.pendingToast;
        this.pendingToast = null;
        this.toast(m);
      }
      return this;
    },

    // The scenario calls the overlay every frame. If a frame ever lands
    // before the page has bound them together, bind them right there —
    // the overlay is part of the game, not a caller on the outside.
    bound() {
      if (!this.scen && ZS.scenario) this.init(ZS.scenario);
      return this.scen && this.el && this.el.clock ? this.scen : null;
    },

    /* ---------- input ---------- */

    key(e) {
      const s = this.bound();
      if (!s) return;
      if (!s || s.over) {
        if (s && s.over && (e.key === "Escape" || e.key === " " || e.key === "Enter"))
          s.dismissCard();
        return;
      }
      const k = e.key;
      const lower = k.toLowerCase();
      if (this.el.help.classList.contains("on") && k !== "?") {
        this.toggleHelp(false);
        return;
      }
      // the panels own the number keys while they are open
      if (s.mode === "build" && /^[0-9iwbh]$/.test(lower)) {
        const kind = ZS.Structs.ORDER.find((kd) => ZS.Structs.CAT[kd].key === lower);
        if (kind) this.act("build", kind);
        else if (lower === "0") this.act("cancel");
        e.preventDefault();
        return;
      }
      if (s.mode === "research" && /^[0-9]$/.test(lower)) {
        const i = +lower - 1;
        const list = s.researchList();
        if (list[i]) this.act("research", list[i].id);
        e.preventDefault();
        return;
      }
      switch (lower) {
        case "a":
          this.act("army-panel");
          return;
        case "d":
          this.act("nations-panel");
          return;
        case " ":
          s.setSpeed(s.speed ? 0 : 1);
          e.preventDefault();
          return;
        case "0":
          s.setSpeed(0);
          return;
        case "1":
          s.setSpeed(1);
          return;
        case "2":
          s.setSpeed(2);
          return;
        case "3":
          s.setSpeed(3);
          return;
        case "escape":
          if (s.mode) s.cancelMode();
          else s.clearSel();
          return;
        case "j":
          ZS.Figures.opt.jobs = !ZS.Figures.opt.jobs;
          this.toast(ZS.Figures.opt.jobs ? "job icons on" : "job icons off");
          return;
        case "v":
          if (e.shiftKey) {
            ZS.Figures.opt.names = !ZS.Figures.opt.names;
            this.toast(ZS.Figures.opt.names ? "names on" : "names off");
          } else this.act("villagers-panel");
          return;
        case "tab":
          s.cycleVillager(e.shiftKey ? -1 : 1);
          e.preventDefault();
          return;
      }
      // context keys: the selection decides
      const sel = s.sel;
      if (sel && sel.k === "v") {
        const j = JOBS.find((x) => x.key.toLowerCase() === lower);
        if (j) {
          this.act("job", j.id);
          return;
        }
      }
      if (sel && sel.k === "s") {
        if (lower === "u") return this.act("upgrade");
        if (lower === "r") return this.act("repair");
        if (lower === "x") return this.act("demolish");
      }
      if (k === "F3") {
        ZS.Perf.on = !ZS.Perf.on;
        e.preventDefault();
        return;
      }
      if (lower === "t") return this.act("research-panel");
      if (lower === "b") return this.act("build-panel");
      if (lower === "v") return this.act("villagers-panel");
      if (lower === "h") return this.act("home");
      if (lower === "f") return this.act("fit");
      if (lower === "n") return this.act(e.shiftKey ? "nightbell" : "bell");
      if (lower === "m") return this.act("world-panel");
      if (lower === "k") return this.act("sound");
      if (lower === "l") return this.act("chron-panel");
      if (lower === "p") return this.act("pilot");
      if (lower === "w" && !s.sel) return this.act("watch");
      if (lower === "q") return this.act("quality");
      if (lower === "?") return this.act("help");
    },

    act(what, arg, who) {
      const s = this.bound();
      if (!s) return;
      switch (what) {
        case "build":
          s.armBuild(arg);
          break;
        case "job": {
          const a = (who && s.villagerByUid(who)) || (s.sel && s.sel.k === "v" ? s.sel.o : null);
          if (a) s.setJob(a, arg);
          break;
        }
        case "pick": {
          const a = who && s.villagerByUid(who);
          if (a) {
            s.selectVillager(a);
            s.focusOn(a.x, a.y);
          }
          break;
        }
        case "upgrade":
          if (s.sel && s.sel.k === "s") s.upgrade(s.sel.o);
          break;
        case "repair":
          if (s.sel && s.sel.k === "s") s.repair(s.sel.o);
          break;
        case "demolish":
          if (s.sel && s.sel.k === "s") s.demolish(s.sel.o);
          break;
        case "cancel":
          s.cancelMode();
          break;
        case "build-panel":
          if (s.mode === "build") s.cancelMode();
          else s.openBuild();
          break;
        case "research-panel":
          if (s.mode === "research") s.cancelMode();
          else s.openResearch();
          break;
        case "villagers-panel":
          if (s.mode === "villagers") s.cancelMode();
          else s.openVillagers();
          break;
        case "army-panel":
          if (s.mode === "army") s.cancelMode();
          else s.openArmy();
          break;
        case "nations-panel":
          if (s.mode === "nations") s.cancelMode();
          else s.openNations();
          break;
        case "nat-send": {
          const id = arg.split(":")[0],
            kind = arg.split(":")[1];
          const r = ZS.Nations.send(s, id, kind);
          if (!r.ok) this.toast(r.err);
          else this.toast(kind === "insult" ? "said" : "on the road — " + r.days + " days");
          break;
        }
        case "nat-pay": {
          const r = ZS.Nations.pay(s, arg);
          if (!r.ok) this.toast(r.err);
          break;
        }
        case "nat-refuse": {
          const r = ZS.Nations.refuse(s, arg);
          if (!r.ok) this.toast(r.err);
          break;
        }
        case "train": {
          const r = ZS.Army.order(s, arg);
          if (!r.ok) this.toast(r.err);
          else this.toast("training " + ZS.Units.def(arg).name);
          break;
        }
        case "untrain":
          ZS.Army.cancel(s, +arg);
          break;
        case "rally":
          if (!ZS.Units.count(s)) {
            this.toast("nobody under arms yet");
            break;
          }
          s.cancelMode(); // ...and then arm the cursor, or cancel eats it
          s.rallying = true;
          this.toast("click the ground — the line forms where you point");
          break;
        case "dismiss":
          ZS.Army.dismiss(s);
          break;
        case "form": {
          const r = ZS.Army.form(s, arg);
          if (!r.ok) this.toast(r.err);
          break;
        }
        case "stance": {
          const r = ZS.Army.stance(s, arg);
          if (!r.ok) this.toast(r.err);
          break;
        }
        case "focus": {
          const r = ZS.Army.focus(s, arg);
          if (!r.ok) this.toast(r.err);
          break;
        }
        case "pick-unit": {
          const a = who && s.unitByUid(who);
          if (a) {
            s.selectUnit(a);
            s.focusOn(a.x, a.y);
          }
          break;
        }
        case "world-panel":
          if (s.mode === "world") s.cancelMode();
          else s.openWorld();
          break;
        case "chron-panel":
          if (s.mode === "chron") s.cancelMode();
          else s.openChron();
          break;
        case "watch":
          if (ZS.Watch) {
            const on = ZS.Watch.toggle(s);
            if (on && ZS.debug && ZS.debug.cam) ZS.debug.cam.auto = true;
          }
          break;
        case "pilot": {
          if (!ZS.Autopilot) break;
          const on = ZS.Autopilot.toggle(s);
          this.toast(
            on
              ? "the steward takes the village in hand — P to take it back"
              : "the steward steps back — the village is yours",
          );
          break;
        }
        case "quality":
          if (ZS.Perf) {
            ZS.Perf.cycle();
            this.toast("quality: " + ZS.Perf.def.name + (ZS.Perf.auto ? " (auto)" : ""));
          }
          break;
        case "send":
          this.expedition(arg, false);
          break;
        case "scout":
          this.expedition(arg, true);
          break;
        case "fac-trade": {
          const r = ZS.Factions.trade(s, arg);
          if (!r.ok) this.toast(r.err);
          else this.toast("traded — " + r.got);
          this.refresh(true);
          break;
        }
        case "fac-pay": {
          const r = ZS.Factions.tribute(s, arg);
          if (!r.ok) this.toast(r.err);
          this.refresh(true);
          break;
        }
        case "fac-refuse": {
          const r = ZS.Factions.refuse(s, arg);
          if (!r.ok) this.toast(r.err);
          this.refresh(true);
          break;
        }
        case "feast": {
          const r = ZS.Hazards.feast(s);
          if (!r.ok) this.toast(r.err);
          break;
        }
        case "slot":
          if (ZS.Chronicle) {
            const ok = ZS.Chronicle.save(s, +arg);
            this.toast(ok ? "written to slot " + arg : "could not write the slot");
          }
          break;
        case "slotload":
          if (ZS.Chronicle) {
            if (ZS.Chronicle.loadSlot(+arg)) location.reload();
            else this.toast("that slot is empty");
          }
          break;
        case "slotclear":
          if (ZS.Chronicle) ZS.Chronicle.clear(+arg);
          break;
        case "newvalley":
          if (ZS.Chronicle) {
            if (this.confirm && this.confirm !== "newvalley") break;
            ZS.Seed.newValley();
          }
          break;
        case "research":
          s.startResearch(arg);
          break;
        case "recruit":
          s.recruit();
          break;
        case "home":
          s.focusHall();
          break;
        case "fit":
          s.fitView();
          break;
        case "bell":
          s.ringBell();
          break;
        case "nightbell":
          s.callNight();
          break;
        case "sound":
          s.toggleSound();
          break;
        case "help":
          this.toggleHelp();
          break;
        case "close":
          s.clearSel();
          break;
      }
      this.sig = "";
      this.refresh(true);
    },

    expedition(id, scouting) {
      const s = this.scen;
      if (!ZS.Overworld) return;
      const chk = ZS.Overworld.canSend(s.ow, s, id, scouting);
      if (!chk.ok) {
        this.toast(chk.err);
        return;
      }
      const r = ZS.Overworld.send(s.ow, s, id, scouting);
      if (r.ok) {
        const who = r.p.members.map((a) => a.name).join(" and ");
        this.toast(who + (scouting ? " rides for " : " set out for ") + ZS.Overworld.def(id).name);
      }
    },

    toggleHelp(on) {
      const e = this.el.help;
      const show = on === undefined ? !e.classList.contains("on") : on;
      e.classList.toggle("on", show);
    },

    toast(msg) {
      // the scenario can speak before the overlay has introduced itself
      if (!this.el.toast) {
        this.pendingToast = msg;
        return;
      }
      this.el.toast.textContent = msg;
      this.el.toast.classList.add("on");
      this.toastT = 3.2;
    },

    /* ---------- painting ---------- */

    // One signature per region. The clock ticks, the stores fill and the
    // villagers walk about every frame; the buttons only need repainting when
    // *their* numbers move. Repainting a button under the cursor throws away
    // its hover and eats the click, so each region guards its own.
    refresh(force) {
      const s = this.bound();
      if (!s) return;
      if (force) this.sig = {};
      const sig = (this.sig = this.sig || {});
      const bar =
        s.day +
        "|" +
        s.phase +
        "|" +
        Math.floor(s.clockMins()) +
        "|" +
        s.speed +
        "|" +
        s.weather.id +
        "|" +
        s.season.id;
      if (bar !== sig.bar) {
        sig.bar = bar;
        this.paintBar();
      }
      const res =
        Math.floor(s.res.wood / 2) +
        "|" +
        Math.floor(s.res.stone / 2) +
        "|" +
        Math.floor(s.res.food / 2) +
        "|" +
        Math.floor(s.res.scrap / 2) +
        "|" +
        Math.floor((s.res.arms || 0) / 2) +
        "|" +
        s.villagers().length +
        "|" +
        s.guards().length +
        "|" +
        s.popCap() +
        "|" +
        s.storeCap();
      if (res !== sig.res) {
        sig.res = res;
        this.paintRes();
      }
      const sel = this.selSig();
      if (sel !== sig.sel) {
        sig.sel = sel;
        this.paintSel();
      }
      const pan = this.panelSig();
      if (pan !== sig.pan) {
        sig.pan = pan;
        this.paintPanel();
      }
    },

    // the number in a resource pill moves all day; whether a button is
    // affordable only flips now and then. Panels watch the flip, not the
    // number, so they stay still long enough to be clicked.
    afford(list) {
      let f = "";
      for (const c of list) f += c ? "1" : "0";
      return f;
    },

    selSig() {
      const s = this.scen;
      const sel = s.sel;
      if (!sel) return "-";
      const o = sel.o;
      if (sel.k === "v")
        return (
          "v" +
          o.uid +
          ":" +
          o.job +
          ":" +
          Math.ceil(o.hp / 6) +
          ":" +
          (o.inf > 0 ? 1 : 0) +
          ":" +
          (o.carry ? o.carry.n : 0) +
          ":" +
          (o.gun || o.tool || "-")
        );
      if (sel.k === "u")
        return "u" + o.uid + ":" + Math.round((o.hp / o.maxHp) * 20) + ":" + (o.sup > 0 ? 1 : 0);
      if (!o || o.dead) return "-";
      return (
        "s" +
        (o.uid || 0) +
        ":" +
        Math.round((o.hp / o.maxHp) * 20) +
        ":" +
        o.lvl +
        ":" +
        (o.plot ? o.plot.stage : "-") +
        ":" +
        (o.mat ? 1 : 0) +
        ":" +
        (o.want ? 1 : 0) +
        ":" +
        (o.built ? 1 : 0) +
        ":" +
        (o.ruined ? 1 : 0)
      );
    },

    panelSig() {
      const s = this.scen;
      if (s.mode === "build")
        return (
          "b|" + s.armed + "|" + this.afford(ZS.Structs.ORDER.map((k) => s.canPay(s.buildCost(k))))
        );
      if (s.mode === "research") {
        const l = s.researchList();
        return (
          "r|" +
          (s.has("shop") ? 1 : 0) +
          "|" +
          (s.research ? s.research.id + Math.floor(s.research.p * 25) : "-") +
          "|" +
          this.afford(l.map((r) => s.canPay(r.def.cost)))
        );
      }
      if (s.mode === "villagers") {
        let f = "v|" + s.guardCap() + "|" + (s.sel && s.sel.k === "v" ? s.sel.o.uid : 0);
        // spirits move every tick, so they are not part of the roster's
        // signature — the panel must not rebuild itself under the cursor
        for (const a of s.villagers()) f += ";" + a.uid + a.job + Math.ceil(a.hp / 8);
        return f;
      }
      if (s.mode === "world") {
        let f = "w|" + (s.res.food | 0) / 5;
        if (s.ow) for (const st of s.ow.sites) f += ";" + st.seen + st.taken;
        if (s.ow)
          for (const p of s.ow.parties) f += "|" + p.id + Math.floor(ZS.Overworld.progress(p) * 20);
        return f;
      }
      if (s.mode === "army") {
        let f =
          "a|" +
          ZS.Units.crew(s) +
          "|" +
          ZS.Ages.index(s) +
          "|" +
          (s.army.rally ? 1 : 0) +
          "|" +
          s.army.form +
          s.army.stance +
          s.army.focus;
        f += "|" + s.army.queue.map((q) => q.id + Math.floor(q.p * 20)).join(",");
        for (const a of ZS.Army.units(s, false))
          f += ";" + a.uid + Math.ceil(a.hp / 8) + (a.sup > 0 ? 1 : 0);
        f += "|" + this.afford(ZS.Units.ORDER.map((id) => s.canPay(ZS.Units.cost(s, id))));
        return f;
      }
      if (s.mode === "nations") {
        let f = "n|" + s.day + "|" + s.nat.events.length;
        for (const x of s.nat.list)
          f += ";" + x.id + Math.round(x.opinion * 20) + x.met + x.war + x.rides.length;
        return f;
      }
      if (s.mode === "chron")
        return (
          "c|" +
          (s.chron ? s.chron.length : 0) +
          "|" +
          s.day +
          "|" +
          (s.pilot ? s.pilot.on + (s.pilot.last || "") : "") +
          "|" +
          (s.coach ? s.coach.now || "" : "")
        );
      return "none";
    },

    paintBar() {
      const s = this.scen;
      this.el.clock.textContent = "DAY " + s.day;
      this.el.wx.textContent = s.season.name + " · " + s.weather.name;
      this.el.wx.title = s.season.desc + " · " + s.weather.desc;
      for (let i = 0; i < 4; i++) {
        if (this.el.speeds[i]) this.el.speeds[i].classList.toggle("on", s.speed === i);
      }
      if (this.el.pilotb && ZS.Autopilot) this.el.pilotb.classList.toggle("on", ZS.Autopilot.on(s));
      if (this.el.watchb && ZS.Watch) this.el.watchb.classList.toggle("on", ZS.Watch.on(s));
      document.body.classList.toggle("night", s.phase !== "day");
    },

    paintRes() {
      const s = this.scen;
      if (!s) return;
      const r = s.res;
      const v = s.villagers().length;
      const cap = s.storeCap();
      const row = (k, n, col) =>
        '<span class="chip"><i style="background:' +
        col +
        '"></i>' +
        k +
        " <b>" +
        Math.floor(n) +
        "</b>" +
        (n >= cap * 0.75 ? '<span class="cap">/' + cap + "</span>" : "") +
        "</span>";
      this.el.res.innerHTML =
        '<div class="res-row">' +
        row("wood", r.wood, "#8a6a3a") +
        row("stone", r.stone, "#8b8779") +
        row("food", r.food, "#b1963e") +
        row("scrap", r.scrap, "#6f7681") +
        (r.arms > 0.5 || s.has("smith") ? row("arms", r.arms, "#7d7a86") : "") +
        "</div>" +
        (s.winterWood
          ? '<div class="chip wide">winter burn <b>' + s.winterWood + "</b> wood/day</div>"
          : "") +
        '<div class="chip wide">villagers <b>' +
        v +
        "</b>/" +
        s.popCap() +
        " · guards <b>" +
        s.guards().length +
        "</b>" +
        (ZS.Units && ZS.Units.count(s) ? " · field <b>" + ZS.Units.count(s) + "</b>" : "") +
        " · holds " +
        cap +
        "</div>";
    },

    paintSel() {
      const s = this.scen;
      const sel = s.sel;
      const e = this.el.sel;
      if (!sel || (sel.k === "s" && (!sel.o || sel.o.dead))) {
        e.classList.remove("on");
        this.html.sel = "";
        return;
      }
      const html =
        sel.k === "v"
          ? this.villagerCard(sel.o)
          : sel.k === "u"
            ? this.unitCard(sel.o)
            : this.structCard(sel.o);
      e.classList.add("on");
      if (html !== this.html.sel) {
        this.html.sel = html;
        e.innerHTML = html;
        this.selTask = e.querySelector('[data-role="task"]');
      }
    },

    villagerCard(a) {
      const s = this.scen;
      const job = JOBS.find((j) => j.id === a.job) || JOBS[0];
      const wpn = a.gun ? a.wep : a.tool || "fists";
      let h =
        '<div class="head"><b>' +
        (ZS.Kin ? ZS.Kin.full(a) : a.name) +
        "</b><span>" +
        job.name +
        "</span>";
      h += '<i data-act="close">×</i></div>';
      h +=
        '<div class="line">health <b>' +
        Math.round((a.hp / a.maxHp) * 100) +
        "%</b> (" +
        Math.ceil(a.hp) +
        "/" +
        Math.round(a.maxHp) +
        "</b> · " +
        (a.job === "guard" ? "armed: " + wpn : "tool: " + wpn) +
        "</div>";
      if (a.inf > 0)
        h += '<div class="line warn">bitten — ' + Math.ceil(a.inf) + "s to the infirmary</div>";
      if (a.carry && a.carry.n)
        h += '<div class="line">carrying ' + a.carry.n + " " + a.carry.kind + "</div>";
      else h += '<div class="line dim">' + (a.task || "looking for work") + "</div>";
      h += '<div class="jobs">';
      for (const j of JOBS) {
        if (j.id === "heal" && !s.has("infirm")) continue;
        h +=
          '<button data-act="job" data-arg="' +
          j.id +
          '" class="' +
          (a.job === j.id ? "on" : "") +
          '" title="' +
          j.hint +
          '">' +
          j.name +
          "<kbd>" +
          j.key +
          "</kbd></button>";
      }
      h += "</div>";
      return h;
    },

    unitCard(a) {
      const d = ZS.Units.def(a.unit);
      let h =
        '<div class="head"><b>' +
        d.name +
        "</b><span>" +
        (a.foe ? "the enemy" : "the field") +
        '</span><i data-act="close">×</i></div>';
      h += '<div class="line">' + d.desc + "</div>";
      h +=
        '<div class="line">health <b>' +
        Math.ceil(a.hp) +
        "/" +
        Math.round(a.maxHp) +
        ")</b> · reaches " +
        (d.rng > 40 ? Math.round(d.rng) : "arm's length") +
        (d.dmg ? " · hits for " + d.dmg : "") +
        (d.armour ? " · armour " + Math.round(d.armour * 100) + "%" : "") +
        "</div>";
      if (!a.foe)
        h +=
          '<div class="line ' +
          (a.sup <= 0 ? "warn" : "dim") +
          '">' +
          (a.sup <= 0 ? "out of bread" : "fed") +
          " · eats " +
          d.eat +
          " a day</div>";
      h += '<div class="jobs">';
      if (!a.foe) h += '<button data-act="pick-unit" data-who="' + a.uid + '">find it</button>';
      h += "</div>";
      return h;
    },

    structCard(b) {
      const s = this.scen;
      const c = ZS.Structs.CAT[b.kind];
      const pct = Math.round((b.hp / b.maxHp) * 100);
      let h =
        '<div class="head"><b>' +
        c.name +
        "</b><span>" +
        (b.built
          ? b.ruined
            ? "ruined"
            : "level " + b.lvl
          : Math.round((b.prog || 0) * 100) + "% built") +
        '</span><i data-act="close">×</i></div>';
      h += '<div class="line">' + c.desc + "</div>";
      h +=
        '<div class="line">condition <b>' +
        pct +
        "%</b> (" +
        Math.ceil(b.hp) +
        "/" +
        Math.round(b.maxHp) +
        ")</div>";
      if (b.kind === "farm" && b.plot)
        h +=
          '<div class="line dim">' +
          ["fallow", "sown", "growing", "growing", "ready to reap"][b.plot.stage] +
          (b.plot.stage === 1 || b.plot.stage === 2
            ? " · " + Math.round(b.plot.growth * 100) + "%"
            : "") +
          "</div>";
      if (b.mat && (b.mat.wood > 0.5 || b.mat.stone > 0.5))
        h +=
          '<div class="line dim">timber at the site: ' +
          Math.ceil(b.mat.wood) +
          " wood" +
          (b.mat.stone > 0.5 ? ", " + Math.ceil(b.mat.stone) + " stone" : "") +
          "</div>";
      else if (b.want) h += '<div class="line dim">rebuilding — waiting on timber</div>';
      h += '<div class="jobs">';
      if (b.ruined || b.hp < b.maxHp) {
        const rc = s.repairCost(b);
        h +=
          '<button data-act="repair" class="' +
          (b.hp < b.maxHp && s.res.wood + s.res.stone > 1 ? "" : "no") +
          '">' +
          (b.ruined ? "rebuild " : "repair ") +
          costText(rc) +
          "<kbd>R</kbd></button>";
      }
      if (!b.ruined && b.built && b.lvl < c.lvlMax && b.kind !== "wall") {
        const uc = s.upgradeCost(b);
        h +=
          '<button data-act="upgrade" class="' +
          (s.canPay(uc) ? "" : "no") +
          '">upgrade ' +
          costText(uc) +
          "<kbd>U</kbd></button>";
      }
      if (b.kind === "hall") {
        const rc = s.recruitCost();
        h +=
          '<button data-act="recruit" class="' +
          (s.canPay(rc) && s.villagers().length < s.popCap() ? "" : "no") +
          '">welcome a survivor ' +
          costText(rc) +
          "</button>";
        h +=
          '<div class="line dim">homes ' +
          s.villagers().length +
          "/" +
          s.popCap() +
          " · holds " +
          s.storeCap() +
          " of each</div>";
      } else h += '<button data-act="demolish" class="danger">dismantle<kbd>X</kbd></button>';
      h += "</div>";
      return h;
    },

    paintPanel() {
      const s = this.scen;
      const e = this.el.panel;
      let html = "";
      if (s.mode === "build") html = this.buildPanel();
      else if (s.mode === "research") html = this.researchPanel();
      else if (s.mode === "villagers") html = this.villagersPanel();
      else if (s.mode === "army") html = this.armyPanel();
      else if (s.mode === "nations") html = this.nationsPanel();
      else if (s.mode === "world") html = this.worldPanel();
      else if (s.mode === "chron") html = this.chronPanel();
      if (!html) {
        e.classList.remove("on");
        this.html.panel = "";
        return;
      }
      e.classList.add("on");
      if (html !== this.html.panel) {
        this.html.panel = html;
        e.innerHTML = html;
        this.taskNode = e.querySelector('[data-role="task"]');
        this.paintValleyMap();
        this.paintNationsMap();
      }
    },

    buildPanel() {
      const s = this.scen;
      let h = '<div class="ptitle">build <kbd>esc</kbd></div>';
      for (const kind of ZS.Structs.ORDER) {
        const c = ZS.Structs.CAT[kind];
        const cost = s.buildCost(kind);
        const ok = s.canPay(cost);
        h +=
          '<div class="row ' +
          (s.armed === kind ? "on " : "") +
          (ok ? "" : "no") +
          '" data-act="build" data-arg="' +
          kind +
          '"><span>' +
          c.name +
          " <kbd>" +
          c.key +
          "</kbd></span><span>" +
          costText(cost) +
          "</span></div>";
      }
      h += '<div class="pfoot">pick a thing, then click the ground · esc to stop</div>';
      return h;
    },

    // the world beyond: six nations, one of which was never going to be a
    // friend. What they think, how far they are, and who is on the road.
    nationsPanel() {
      const s = this.scen;
      if (!ZS.Nations || !s.nat) return "";
      const N = ZS.Nations;
      let h = '<div class="ptitle">the world beyond <kbd>esc</kbd></div>';
      h += '<canvas id="nationsmap" class="valleymap" width="252" height="176"></canvas>';
      const foes = N.foes(s);
      if (foes) h += '<div class="pfoot"><em>' + foes + " of them are in the field</em></div>";
      // the demands on the table
      for (const e of s.nat.events) {
        const d = N.def(e.faction);
        h +=
          '<div class="row on"><span>' +
          d.name +
          "</span><span>" +
          e.give.food +
          " food</span></div>";
        h += '<div class="pfoot">' + e.text + "</div>";
        h += '<div class="tray">';
        h += '<button data-act="nat-pay" data-arg="' + e.id + '">pay it</button>';
        h += '<button data-act="nat-refuse" data-arg="' + e.id + '" class="danger">refuse</button>';
        h += "</div>";
      }
      for (const f of s.nat.list) {
        const d = N.def(f.id);
        if (!f.met) {
          h += '<div class="row no"><span>somewhere out there</span><span>—</span></div>';
          continue;
        }
        const tag = f.war ? "at war" : N.word(f.opinion);
        h +=
          '<div class="row' +
          (f.war || d.foe ? " no" : "") +
          '"><span>' +
          d.name +
          '</span><span class="who">' +
          f.days * 2 +
          "d · " +
          tag +
          "</span></div>";
        h += '<div class="pfoot">' + d.where + " — " + d.blurb + "</div>";
        // how close the next trouble is, so a war is never a surprise
        if (f.war || d.foe) {
          const bits = [];
          if (f.left > 0) bits.push(f.left + " of theirs still standing");
          bits.push(
            f.invadeIn > 0 ? "the next are " + f.invadeIn + " days out" : "they are due any day",
          );
          if (f.beaten > 0) bits.push(f.beaten + " beaten");
          h += '<div class="pfoot dim">' + bits.join(" · ") + "</div>";
        }
        h += '<div class="tray">';
        if (!d.foe) {
          h +=
            '<button data-act="nat-send" data-arg="' +
            f.id +
            ':envoy"' +
            (s.canPay({ w: 0, s: 0, c: N.BAL.ENVOY.scrap }) && s.res.food >= N.BAL.ENVOY.food
              ? ""
              : ' class="no"') +
            ">envoy <kbd>" +
            N.BAL.ENVOY.food +
            "f</kbd></button>";
          h +=
            '<button data-act="nat-send" data-arg="' +
            f.id +
            ':trade"' +
            (s.canPay(d.want) ? "" : ' class="no"') +
            ">trade " +
            costText(d.want) +
            "</button>";
          h +=
            '<button data-act="nat-send" data-arg="' +
            f.id +
            ':gift"' +
            (s.res.food >= N.BAL.GIFT.food ? "" : ' class="no"') +
            ">gift <kbd>" +
            N.BAL.GIFT.food +
            "f</kbd></button>";
          if (d.merc)
            h +=
              '<button data-act="nat-send" data-arg="' +
              f.id +
              ':hire"' +
              (s.canPay(N.rideCost(s, "hire")) ? "" : ' class="no"') +
              ">hire " +
              costText(N.rideCost(s, "hire")) +
              "</button>";
          h +=
            '<button data-act="nat-send" data-arg="' +
            f.id +
            ':insult"' +
            ' class="danger"' +
            ">insult</button>";
        } else {
          h += '<div class="pfoot">they will not be spoken to. They will be fought.</div>';
        }
        h += "</div>";
        for (const r of f.rides)
          h +=
            '<div class="pfoot dim">' +
            (r.kind === "envoy"
              ? "an envoy"
              : r.kind === "trade"
                ? "the wagons"
                : r.kind === "hire"
                  ? "the company"
                  : r.kind === "gift"
                    ? "a gift"
                    : "word") +
            " · " +
            r.t +
            " day" +
            (r.t === 1 ? "" : "s") +
            " out</div>";
      }
      if (s.nat.news.length) {
        h += '<div class="ptitle" style="margin-top:5px">word out of the world</div>';
        for (const n of s.nat.news.slice(0, 5)) h += '<div class="pfoot dim">' + n + "</div>";
      }
      h +=
        '<div class="tray"><button data-act="world-panel">the valley <kbd>M</kbd></button>' +
        '<button data-act="army-panel">the field <kbd>A</kbd></button></div>';
      return h;
    },

    // the field: what the village has become, what it may put in the
    // field, and what is being trained right now
    armyPanel() {
      const s = this.scen;
      const U = ZS.Units;
      let h = '<div class="ptitle">the field <kbd>esc</kbd></div>';
      const age = ZS.Ages.of(s);
      h += '<div class="pfoot">' + age.name + " — " + age.desc + "</div>";
      const nx = ZS.Ages.next(s);
      if (nx) {
        h +=
          '<div class="pfoot">to reach ' +
          nx.def.name +
          ": " +
          (nx.want.length ? nx.want.join(", ") : "nothing — it is there") +
          "</div>";
      }
      const crew = U.crew(s),
        cap = U.cap(s);
      h +=
        '<div class="pfoot"><b>' +
        U.count(s) +
        "</b> under arms · " +
        crew +
        "/" +
        cap +
        " beds · " +
        Math.round(U.upkeep(s)) +
        " food a day" +
        (s.army.hungry ? " · <em>" + s.army.hungry + " out of bread</em>" : "") +
        "</div>";
      /* how they stand, and what they are told: the four shapes, the two
         orders, and what the line aims at */
      const A = s.army;
      const F = ZS.Army.FORMS,
        FO = ZS.Army.FOCUS;
      h += '<div class="pfoot">they form a ' + (F[A.form] || F.line).name + "</div>";
      h += '<div class="tray">';
      for (const id in F)
        h +=
          '<button data-act="form" data-arg="' +
          id +
          '"' +
          (A.form === id ? ' class="on"' : "") +
          ' title="' +
          F[id].desc +
          '">' +
          F[id].name +
          "</button>";
      h += "</div>";
      h += '<div class="tray">';
      h +=
        '<button data-act="stance" data-arg="hold"' +
        (A.stance === "hold" ? ' class="on"' : "") +
        ' title="stand on the ground they have been given">hold</button>';
      h +=
        '<button data-act="stance" data-arg="push"' +
        (A.stance === "push" ? ' class="on"' : "") +
        ' title="walk out past it and meet them">push</button>';
      h += '<span class="sep"></span>';
      for (const id in FO)
        h +=
          '<button data-act="focus" data-arg="' +
          id +
          '"' +
          (A.focus === id ? ' class="on"' : "") +
          ' title="' +
          FO[id].desc +
          '">' +
          FO[id].name +
          "</button>";
      h += "</div>";
      // what is in the field right now
      const mine = U.ORDER.filter((id) => U.count(s, id));
      if (mine.length)
        h +=
          '<div class="pfoot">' +
          mine.map((id) => U.count(s, id) + "× " + U.def(id).name).join(" · ") +
          "</div>";
      // the training queue
      if (s.army.queue.length) {
        for (let i = 0; i < s.army.queue.length; i++) {
          const q = s.army.queue[i];
          h +=
            '<div class="row on" data-act="untrain" data-arg="' +
            i +
            '"><span>' +
            U.def(q.id).name +
            "</span><span>" +
            Math.round(q.p * 100) +
            "%</span></div>";
        }
      }
      // who is out there, so you can go and look at them
      const mine2 = ZS.Army.units(s, false);
      if (mine2.length) {
        h += '<div class="ptitle" style="margin-top:5px">in the field</div>';
        for (const a of mine2) {
          const d = U.def(a.unit);
          h +=
            '<div class="row" data-act="pick-unit" data-who="' +
            a.uid +
            '"><span>' +
            d.name +
            (a.sup <= 0 ? " <em>· out of bread</em>" : "") +
            '</span><span class="hp"><i style="width:' +
            Math.round((a.hp / a.maxHp) * 100) +
            '%"></i></span></div>';
        }
      }
      h += '<div class="tray">';
      h +=
        '<button data-act="rally"' +
        (U.count(s) ? "" : ' class="no"') +
        ">rally<kbd>click the ground</kbd></button>";
      h +=
        '<button data-act="dismiss"' + (s.army.rally ? "" : ' class="no"') + ">fall back</button>";
      h += "</div>";
      // the roster: everything the village could train, in order
      for (const id of U.ORDER) {
        const d = U.def(id);
        const open = ZS.Ages.at(s, d.age);
        const cost = U.cost(s, id);
        const room = U.crew(s) + (d.crew || 1) <= U.cap(s);
        const ok = open && room && s.canPay(cost);
        let why = "";
        if (!open) why = "needs " + ZS.Ages.def(d.age).name;
        else if (!room) why = "no beds";
        h +=
          '<div class="row ' +
          (ok ? "" : "no") +
          '" data-act="train" data-arg="' +
          id +
          '"><span>' +
          d.name +
          (d.crew > 1 ? " ×" + d.crew : "") +
          "</span><span>" +
          (why || costText(cost)) +
          "</span></div>";
        h +=
          '<div class="pfoot">' +
          d.desc +
          " · " +
          Math.round(U.time(s, id)) +
          "s to train · eats " +
          d.eat +
          "</div>";
      }
      h += '<div class="pfoot">the smithy and the foundry turn scrap into arms.</div>';
      return h;
    },

    // the roster: who is out there, what they are doing, and the row of
    // jobs under the one you picked
    villagersPanel() {
      const s = this.scen;
      const v = s.villagers();
      let h = '<div class="ptitle">villagers <kbd>esc</kbd></div>';
      if (!v.length) {
        h += '<div class="pfoot">nobody left.</div>';
        return h;
      }
      const pick = s.sel && s.sel.k === "v" ? s.sel.o : null;
      for (const a of v) {
        const job = JOBS.find((j) => j.id === a.job) || JOBS[0];
        const hp = Math.max(0, Math.min(100, Math.round((a.hp / a.maxHp) * 100)));
        h +=
          '<div class="row' +
          (a === pick ? " on" : "") +
          '" data-act="pick" data-who="' +
          a.uid +
          '" title="click to find ' +
          (ZS.Kin ? ZS.Kin.full(a) : a.name) +
          '"><span>' +
          (ZS.Kin ? ZS.Kin.full(a) : a.name) +
          (a.sick > 0 ? " <em>·ill</em>" : "") +
          '</span><span class="hp"><i style="width:' +
          hp +
          '%"></i></span><span class="who">' +
          (a.inf > 0 ? "<em>bitten</em>" : a.kin && a.kin.child ? "a child" : job.name) +
          "</span></div>";
        if (a === pick) {
          if (a.kin) {
            h += '<div class="pfoot">' + ZS.Kin.describe(a) + "</div>";
            if (a.kin.mem && a.kin.mem.length)
              h +=
                '<div class="pfoot dim">remembers: ' + a.kin.mem[a.kin.mem.length - 1] + "</div>";
          }
        }
        if (a === pick) {
          h += '<div class="tray">';
          for (const j of JOBS)
            h +=
              '<button data-act="job" data-arg="' +
              j.id +
              '" data-who="' +
              a.uid +
              '"' +
              (a.job === j.id ? ' class="on"' : "") +
              ' title="' +
              j.hint +
              '">' +
              j.name +
              " <kbd>" +
              j.key +
              "</kbd></button>";
          h += "</div>";
          h += '<div class="pfoot" data-role="task"></div>';
        }
      }
      h +=
        '<div class="pfoot">' +
        v.length +
        " of " +
        s.popCap() +
        " beds · " +
        s.guards().length +
        " of " +
        s.guardCap() +
        " on the watch · pick a name and give them work</div>";
      return h;
    },

    // the valley: what is out there, what it costs to reach, and who is
    // already walking
    worldPanel() {
      const s = this.scen;
      if (!ZS.Overworld || !s.ow) return "";
      let h = '<div class="ptitle">the valley <kbd>esc</kbd></div>';
      h += '<canvas id="valleymap" class="valleymap" width="252" height="168"></canvas>';
      if (s.ow.parties.length) {
        h += '<div class="pfoot">out there now</div>';
        for (const p of s.ow.parties) {
          const def = ZS.Overworld.def(p.site);
          const pc = Math.round(ZS.Overworld.progress(p) * 100);
          h +=
            '<div class="row"><span>' +
            (p.scouting ? "scout · " : "") +
            def.name +
            '</span><span class="who">' +
            (p.phase === "out"
              ? "walking out"
              : p.phase === "work"
                ? "at the site"
                : "coming home") +
            " · " +
            pc +
            "%</span></div>";
          h +=
            '<div class="hp" style="flex:1 1 100%;height:4px"><i style="width:' +
            pc +
            '%"></i></div>';
          h += '<div class="pfoot">' + p.members.map((a) => a.name).join(", ") + "</div>";
        }
      }
      h += '<div class="pfoot">two people and ten food · the walk is the risk</div>';
      for (const st of s.ow.sites) {
        const def = ZS.Overworld.def(st.id);
        if (!st.seen) {
          h += '<div class="row no"><span>somewhere out there</span><span>—</span></div>';
          continue;
        }
        const days = Math.max(1, Math.round(def.d / 55));
        const dgr =
          "◆".repeat(def.danger) + '<span class="dim">' + "◇".repeat(5 - def.danger) + "</span>";
        const state =
          st.seen === 1
            ? "rumoured"
            : st.seen === 2
              ? "scouted"
              : "worked" + (st.taken > 1 ? " ×" + st.taken : "");
        const canSend = ZS.Overworld.canSend(s.ow, s, st.id, false).ok;
        const canScout = st.seen < 2 && ZS.Overworld.canSend(s.ow, s, st.id, true).ok;
        h +=
          '<div class="row' +
          (canSend ? "" : " no") +
          '"><span>' +
          def.name +
          '</span><span class="who">' +
          days +
          "d · " +
          dgr +
          "</span></div>";
        h += '<div class="pfoot">' + def.desc + ' <span class="dim">· ' + state + "</span></div>";
        h += '<div class="tray">';
        h +=
          '<button data-act="send" data-arg="' +
          st.id +
          '"' +
          (canSend ? "" : ' class="no"') +
          ">send two</button>";
        if (st.seen < 2)
          h +=
            '<button data-act="scout" data-arg="' +
            st.id +
            '"' +
            (canScout ? "" : ' class="no"') +
            ">scout</button>";
        h += "</div>";
      }
      h += '<div class="pfoot">loot: ' + this.lootLine() + "</div>";
      h += this.peopleBlock(s);
      h += this.cureBlock(s);
      h +=
        '<div class="tray"><button data-act="nations-panel">the world beyond <kbd>D</kbd></button></div>';
      return h;
    },

    // the two of them, and whatever they are asking for just now
    peopleBlock(s) {
      if (!ZS.Factions || !s.fac) return "";
      let h = '<div class="pfoot">other people</div>';
      for (const f of ZS.Factions.lines(s)) {
        h +=
          '<div class="row' +
          (f.dim ? " no" : "") +
          '"><span>' +
          f.name +
          '</span><span class="who">';
        h += f.cleared ? "wiped out" : f.word;
        h += "</span></div>";
        if (!f.dim && !f.cleared) {
          h +=
            '<div class="hp" style="flex:1 1 100%;height:4px"><i style="width:' +
            f.op +
            "%;background:" +
            (f.op > 55 ? "#5a7a3a" : f.op > 40 ? "#8a7a3a" : "#a04030") +
            '"></i></div>';
          h += '<div class="pfoot">' + f.blurb + "</div>";
        }
      }
      for (const ev of s.fac.events) {
        h += '<div class="row"><span>' + ev.text + "</span><span>day " + ev.day + "</span></div>";
        h += '<div class="tray">';
        if (ev.kind === "caravan")
          h +=
            '<button data-act="fac-trade" data-arg="' +
            ev.id +
            '"' +
            (s.res.food >= ev.give.food ? "" : ' class="no"') +
            ">give " +
            ev.give.food +
            " food</button>";
        else if (ev.kind === "demand") {
          h +=
            '<button data-act="fac-pay" data-arg="' +
            ev.id +
            '"' +
            (s.res.food >= ev.give.food ? "" : ' class="no"') +
            ">pay " +
            ev.give.food +
            " food</button>";
          h +=
            '<button data-act="fac-refuse" data-arg="' + ev.id + '" class="danger">refuse</button>';
        }
        h += "</div>";
      }
      const w = ZS.Factions.get(s.fac, "warrens");
      if (w && !w.cleared && s.fac.raidIn > 0)
        h += '<div class="pfoot">they are coming: ' + s.fac.raidIn + " day(s)</div>";
      if (s.raiders && s.raiders.length)
        h += '<div class="pfoot">' + s.raiders.length + " of them are in the village now</div>";
      return h;
    },

    // the four steps, and which one the village is looking for
    cureBlock(s) {
      if (!ZS.Cure || !s.cure) return "";
      const q = ZS.Cure.line(s);
      if (!q) return "";
      let h = '<div class="pfoot">the cure</div>';
      if (q.done) {
        h += '<div class="row"><span>the plague is done</span><span>in this valley</span></div>';
        return h;
      }
      h +=
        '<div class="row' +
        (q.step ? " no" : "") +
        '"><span>' +
        (q.step ? "looking for " + q.name : "the course is known") +
        "</span><span>" +
        (q.step ? "" : q.doses + " doses") +
        "</span></div>";
      h += '<div class="pfoot">' + q.text + "</div>";
      if (!q.step && q.doses > 0)
        h += '<div class="pfoot">a dose is drawn the moment somebody is bitten</div>';
      return h;
    },

    // The map of the valley, in the same hand as the world: the hollow at
    // the left, the roads running out of it, and the fog — a scribbled
    // cloud — over every place nobody has walked to yet.
    paintValleyMap() {
      const s = this.bound();
      const cv = document.getElementById("valleymap");
      if (!s) return;
      if (!cv || !cv.getContext || !s.ow || !ZS.Overworld) return;
      const c = cv.getContext("2d");
      const W = cv.width || 252,
        H = cv.height || 168;
      c.clearRect(0, 0, W, H);
      const ox = 26,
        oy = H / 2;
      const far = 250; // the longest road, in map pixels
      // the hollow itself
      c.strokeStyle = "rgba(70,64,52,0.85)";
      c.lineWidth = 1.4;
      ZS.wpoly(
        c,
        [
          { x: ox - 9, y: oy + 7 },
          { x: ox - 9, y: oy - 3 },
          { x: ox, y: oy - 10 },
          { x: ox + 9, y: oy - 3 },
          { x: ox + 9, y: oy + 7 },
        ],
        11,
        0.5,
        true,
      );
      c.fillStyle = "rgba(214,186,120,0.35)";
      c.fill();
      s.ow.sites.forEach((st, i) => {
        const def = ZS.Overworld.def(st.id);
        const n = s.ow.sites.length;
        const a = ((i + 0.5) / n - 0.5) * 1.5; // fan the roads out
        const d = 44 + (def.d / 250) * far;
        const x = ox + Math.cos(a) * d,
          y = oy + Math.sin(a) * d * 0.62;
        if (x > W - 16) return;
        // the road
        c.strokeStyle = st.seen ? "rgba(120,102,66,0.75)" : "rgba(120,102,66,0.3)";
        c.lineWidth = 1.1;
        c.setLineDash(st.seen ? [] : [3, 4]);
        ZS.wline(c, ox + 9, oy + 2, x, y, 30 + i * 7, 1.1);
        c.setLineDash([]);
        if (!st.seen) {
          // the fog: a scribbled cloud, and a question
          c.strokeStyle = "rgba(150,146,128,0.45)";
          c.lineWidth = 1;
          for (let k = 0; k < 3; k++)
            ZS.wline(c, x - 9, y - 3 + k * 3, x + 9, y - 3 + k * 3, 90 + i * 13 + k, 1.4);
          c.fillStyle = "rgba(90,84,70,0.7)";
          c.font = 'italic 11px "Segoe Script","Bradley Hand","Comic Sans MS",cursive';
          c.textAlign = "center";
          c.fillText("?", x, y + 4);
          return;
        }
        // the place itself: a mark, and its name
        c.strokeStyle = "rgba(70,64,52,0.8)";
        c.lineWidth = 1.2;
        ZS.wpoly(
          c,
          [
            { x: x - 5, y: y + 4 },
            { x: x - 5, y: y - 2 },
            { x: x, y: y - 6 },
            { x: x + 5, y: y - 2 },
            { x: x + 5, y: y + 4 },
          ],
          60 + i * 11,
          0.4,
          true,
        );
        if (st.seen > 2 || st.taken > 0) {
          c.fillStyle = "rgba(96,132,58,0.3)";
          c.fill();
        }
        c.fillStyle = st.seen === 1 ? "rgba(90,84,70,0.6)" : "rgba(58,54,44,0.9)";
        c.font = 'italic 9px "Segoe Script","Bradley Hand","Comic Sans MS",cursive';
        c.textAlign = "center";
        c.fillText(def.name.split(" ")[0], x, y + 14);
      });
      // whoever is out there now
      for (const p of s.ow.parties) {
        const i = s.ow.sites.findIndex((st) => st.id === p.site);
        if (i < 0) continue;
        const def = ZS.Overworld.def(p.site);
        const n = s.ow.sites.length;
        const a = ((i + 0.5) / n - 0.5) * 1.5;
        const d = 44 + (def.d / 250) * far;
        const x = ox + Math.cos(a) * d,
          y = oy + Math.sin(a) * d * 0.62;
        const f = ZS.Overworld.progress(p);
        const px = ox + 9 + (x - ox - 9) * f,
          py = oy + 2 + (y - oy - 2) * f;
        c.strokeStyle = "rgba(64,96,52,0.95)";
        c.lineWidth = 1.4;
        ZS.wcirc(c, px, py, 3.2, 200 + p.id, 0.5);
        c.fillStyle = "rgba(64,96,52,0.9)";
        c.beginPath();
        c.arc(px, py, 1.6, 0, 6.2832);
        c.fill();
      }
      c.textAlign = "left";
    },

    // the wider world: the nations, drawn round the hollow at the distance
    // a rider would take to reach them
    paintNationsMap() {
      const s = this.bound();
      const cv = document.getElementById("nationsmap");
      if (!s) return;
      if (!cv || !cv.getContext || !s.nat || !ZS.Nations) return;
      const c = cv.getContext("2d");
      const W = cv.width || 252,
        H = cv.height || 176;
      const cx = W / 2,
        cy = H / 2 + 4;
      c.clearRect(0, 0, W, H);
      const far = Math.min(W, H) / 2 - 16;
      // the valley: a dashed ring round the hollow
      c.strokeStyle = "rgba(120,102,66,0.4)";
      c.lineWidth = 1;
      c.setLineDash([3, 4]);
      c.beginPath();
      c.ellipse(cx, cy, 30, 20, 0, 0, 6.2832);
      c.stroke();
      c.setLineDash([]);
      // the hollow itself
      c.strokeStyle = "rgba(70,64,52,0.9)";
      c.lineWidth = 1.4;
      ZS.wpoly(
        c,
        [
          { x: cx - 8, y: cy + 6 },
          { x: cx - 8, y: cy - 3 },
          { x: cx, y: cy - 9 },
          { x: cx + 8, y: cy - 3 },
          { x: cx + 8, y: cy + 6 },
        ],
        11,
        0.5,
        true,
      );
      c.fillStyle = "rgba(214,186,120,0.4)";
      c.fill();
      const N = ZS.Nations;
      for (const f of s.nat.list) {
        const d = N.def(f.id);
        if (!f.met) continue;
        const a = d.ang;
        const r = 34 + (d.days / 7) * (far - 40);
        const x = cx + Math.cos(a) * r,
          y = cy + Math.sin(a) * r * 0.66;
        const col = d.foe
          ? "rgba(120,40,32,0.9)"
          : f.war
            ? "rgba(150,60,40,0.9)"
            : f.opinion >= N.BAL.ALLY_AT
              ? "rgba(64,112,52,0.95)"
              : f.opinion >= N.BAL.DEMAND_AT
                ? "rgba(74,68,56,0.85)"
                : "rgba(150,110,44,0.9)";
        // the road
        c.strokeStyle = "rgba(120,102,66,0.45)";
        c.lineWidth = 1;
        c.setLineDash(f.met > 1 ? [] : [3, 4]);
        ZS.wline(c, cx + Math.cos(a) * 9, cy + Math.sin(a) * 6, x, y, 30 + d.days * 7, 1);
        c.setLineDash([]);
        // the mark: a walled town, or a black tent
        c.strokeStyle = col;
        c.lineWidth = 1.4;
        if (d.foe) {
          ZS.wpoly(
            c,
            [
              { x: x - 6, y: y + 4 },
              { x: x, y: y - 7 },
              { x: x + 6, y: y + 4 },
            ],
            d.days * 13 + 3,
            0.4,
            true,
          );
        } else {
          ZS.wpoly(
            c,
            [
              { x: x - 6, y: y + 4 },
              { x: x - 6, y: y - 2 },
              { x: x, y: y - 6 },
              { x: x + 6, y: y - 2 },
              { x: x + 6, y: y + 4 },
            ],
            d.days * 13 + 3,
            0.4,
            true,
          );
        }
        if (f.opinion >= N.BAL.ALLY_AT || f.war) {
          c.fillStyle = f.war ? "rgba(150,60,40,0.22)" : "rgba(96,132,58,0.22)";
          c.fill();
        }
        c.fillStyle = col;
        c.font = 'italic 9px "Segoe Script","Bradley Hand","Comic Sans MS",cursive';
        c.textAlign = "center";
        c.fillText(d.name.split(" ").pop(), x, y + 14);
        // whoever is on the road
        for (const rd of f.rides) {
          const k = 1 - Math.min(1, rd.t / Math.max(1, rd.days * 2));
          const px = cx + Math.cos(a) * 9 + (x - cx - Math.cos(a) * 9) * k;
          const py = cy + Math.sin(a) * 6 + (y - cy - Math.sin(a) * 6) * k;
          c.strokeStyle = "rgba(64,96,52,0.95)";
          c.lineWidth = 1.3;
          ZS.wcirc(c, px, py, 2.6, 200 + d.days * 5, 0.4);
        }
      }
      c.textAlign = "left";
    },

    lootLine() {
      const s = this.scen;
      const bits = [];
      for (const st of s.ow.sites) {
        if (!st.seen) continue;
        const def = ZS.Overworld.def(st.id);
        const k = Object.keys(def.loot)[0];
        bits.push(def.name.split(" ").pop() + " " + k);
      }
      return bits.join(" · ");
    },

    // the ledger, and the three slots
    chronPanel() {
      const s = this.scen;
      let h = '<div class="ptitle">the record <kbd>esc</kbd></div>';
      // the one thing worth knowing right now
      if (ZS.Coach) {
        const lesson = ZS.Coach.line(s);
        if (lesson) h += '<div class="pfoot"><em>' + lesson + "</em></div>";
      }
      if (ZS.Autopilot) {
        const on = ZS.Autopilot.on(s);
        h +=
          '<div class="row' +
          (on ? " on" : "") +
          '"><span>the steward</span><span class="who">' +
          (on ? "in charge" : "standing by") +
          "</span></div>";
        h += '<div class="pfoot">' + ZS.Autopilot.line(s) + "</div>";
        h +=
          '<div class="tray"><button data-act="pilot">' +
          (on ? "take the village back" : "put him in charge") +
          " <kbd>P</kbd></button></div>";
        if (on && s.pilot.did.length > 1) {
          h += '<div class="pfoot">and before that</div>';
          for (const d of s.pilot.did.slice(1, 4)) h += '<div class="pfoot dim">' + d + "</div>";
        }
      }
      const list = (s.chron || []).slice(0, 16);
      if (!list.length) h += '<div class="pfoot">nothing written yet.</div>';
      for (const e of list)
        h +=
          '<div class="row' +
          (e.kind === "death" ? " no" : "") +
          '"><span>day ' +
          e.day +
          '</span><span class="who">' +
          e.txt +
          "</span></div>";
      h +=
        '<div class="pfoot">the dead: ' + (s.souls || 0) + " · grief: " + griefWord(s) + "</div>";
      h += '<div class="tray">';
      const canFeast = s.haz && s.haz.feastT <= 0 && s.res.food >= ZS.Hazards.BAL.FEAST_FOOD;
      h +=
        '<button data-act="feast"' +
        (canFeast ? "" : ' class="no"') +
        ' title="a hot meal: +spirits, and the grief lifts a little">hold a feast (18 food)</button>';
      h += "</div>";
      // the families: who is left of them, and who is under the ground
      if (ZS.Kin) {
        const houses = ZS.Kin.houses(s);
        if (houses.length) {
          h += '<div class="ptitle" style="margin-top:5px">the families</div>';
          for (const f of houses.slice(0, 6)) {
            h +=
              '<div class="row' +
              (f.live.length ? "" : " no") +
              '"><span>' +
              f.house +
              '</span><span class="who">' +
              (f.live.length ? f.live.length + " living" : "gone") +
              (f.dead ? " · " + f.dead + " buried" : "") +
              (f.gen > 1 ? " · " + f.gen + " generations" : "") +
              "</span></div>";
            if (f.live.length) h += '<div class="pfoot dim">' + f.live.join(", ") + "</div>";
          }
        }
      }
      h += '<div class="pfoot">save a run</div>';
      if (ZS.Chronicle)
        for (const sl of ZS.Chronicle.slots())
          h +=
            '<div class="row' +
            (sl.used ? "" : " no") +
            '"><span>slot ' +
            sl.n +
            '</span><span class="who">' +
            (sl.used ? "day " + sl.day + " · " + sl.pop + " souls · " + sl.when : "empty") +
            "</span></div>" +
            '<div class="tray"><button data-act="slot" data-arg="' +
            sl.n +
            '">save</button>' +
            '<button data-act="slotload" data-arg="' +
            sl.n +
            '"' +
            (sl.used ? "" : ' class="no"') +
            ">load</button>" +
            '<button data-act="slotclear" data-arg="' +
            sl.n +
            '"' +
            (sl.used ? "" : ' class="no"') +
            ">clear</button></div>";
      // which valley this is, and how to leave it
      h +=
        '<div class="pfoot">the valley: ' +
        (s.world.seed | 0) +
        ' · <button class="link" data-act="newvalley">a new valley</button>' +
        (this.confirm === "newvalley"
          ? ' — <button class="link" data-act="newvalley">yes, and lose this one</button>'
          : "") +
        "</div>";
      h +=
        '<div class="pfoot">quality: ' +
        ZS.Perf.def.name +
        (ZS.Perf.auto ? " (auto)" : " · set by hand") +
        " · " +
        Math.round(ZS.Perf.fps) +
        " fps</div>";
      return h;
    },

    researchPanel() {
      const s = this.scen;
      let h = '<div class="ptitle">workshop <kbd>esc</kbd></div>';
      if (!s.has("shop")) {
        h += '<div class="pfoot">build a workshop first — it is where the village thinks.</div>';
        return h;
      }
      if (s.research) {
        const r = s.research;
        h +=
          '<div class="row on"><span>' +
          r.def.name +
          "</span><span>" +
          Math.round(r.p * 100) +
          "%</span></div>";
        h += '<div class="pfoot">' + r.def.desc + "</div>";
        return h;
      }
      const list = s.researchList();
      if (!list.length) h += '<div class="pfoot">nothing left to learn.</div>';
      list.forEach((r, i) => {
        h +=
          '<div class="row ' +
          (s.canPay(r.def.cost) ? "" : "no") +
          '" data-act="research" data-arg="' +
          r.id +
          '"><span>' +
          r.def.name +
          " <kbd>" +
          (i + 1) +
          "</kbd></span><span>" +
          costText(r.def.cost) +
          "</span></div>";
        h += '<div class="pfoot">' + r.def.desc + "</div>";
      });
      // the cure: what is still out there, and what it would take
      const locked = s.researchLocked();
      for (const r of locked) {
        h += '<div class="row no"><span>' + r.def.name + "</span><span>not found</span></div>";
        h += '<div class="pfoot">' + r.err + "</div>";
      }
      h += '<div class="pfoot">' + s.weaponName() + " · " + s.armorName() + "</div>";
      return h;
    },

    // the things going wrong, where you cannot miss them
    paintAlerts() {
      const s = this.bound();
      const e = this.el.alerts;
      if (!s || !e) return;
      if (!e) return;
      const list = ZS.Hazards && s.haz ? ZS.Hazards.alerts(s) : [];
      if (ZS.Factions && s.fac) {
        const f = ZS.Factions.alert(s);
        if (f) list.unshift(f);
      }
      // the army shouts for itself (an army out of bread is an army going home)
      if (s.alerts) for (const a of s.alerts) if (a.t > 0) list.push([a.kind, a.txt]);
      // and so do the nations
      if (ZS.Nations && s.nat) {
        for (const a of ZS.Nations.alerts(s)) list.push(a);
        for (const f of s.nat.list)
          if (f.war) list.push(["war", ZS.Nations.def(f.id).name + " are at war with us"]);
      }
      // the door is the whole defence, so it says so
      if (s.hall && s.hall.ruined)
        list.unshift(["door", "the hall is a ruin — there is no door to hold"]);
      else if (s.hall && s.hall.hp < s.hall.maxHp * 0.45)
        list.unshift([
          "door",
          "the hall is failing — " + Math.round((s.hall.hp / s.hall.maxHp) * 100) + "%",
        ]);
      const sig = list.map((a) => a[0] + a[1]).join("|");
      if (sig === this.sig.alerts) return;
      this.sig.alerts = sig;
      if (!list.length) {
        e.classList.remove("on");
        return;
      }
      let h = "";
      for (const a of list) h += '<span class="al ' + a[0] + '">' + a[1] + "</span>";
      if (s.haz.despair > 0.4 || s.morale < 0.45)
        h +=
          '<button data-act="feast"' +
          (s.res.food >= ZS.Hazards.BAL.FEAST_FOOD && s.haz.feastT <= 0 ? "" : ' class="no"') +
          ">hold a feast</button>";
      e.innerHTML = h;
      e.classList.add("on");
    },

    tick(dt) {
      const s = this.bound();
      if (!s) return;
      this.paintAlerts();
      if (s.mode === "world") {
        this.mapT = (this.mapT || 0) - dt;
        if (this.mapT <= 0) {
          this.mapT = 0.25;
          this.paintValleyMap();
        }
      }
      if (s.mode === "nations") {
        this.natT = (this.natT || 0) - dt;
        if (this.natT <= 0) {
          this.natT = 1;
          this.paintNationsMap();
        }
      }
      if (this.toastT > 0) {
        this.toastT -= dt;
        if (this.toastT <= 0 && this.el.toast) this.el.toast.classList.remove("on");
      }
      // "what they are doing" changes every few seconds; it lives in one
      // text node we retype in place, so the buttons around it never move
      const a = s.sel && s.sel.k === "v" ? s.sel.o : null;
      const line = a
        ? (a.task || "standing about") +
          (a.carry && a.carry.n ? " · carrying " + a.carry.n + " " + a.carry.kind : "")
        : "";
      if (this.selTask && this.selTask.textContent !== line) this.selTask.textContent = line;
      if (this.taskNode && this.taskNode.textContent !== line) this.taskNode.textContent = line;
    },
  };

  function griefWord(s) {
    const g = s.grief || 0;
    return g > 0.6
      ? "the village is heartbroken"
      : g > 0.3
        ? "heavy"
        : g > 0.1
          ? "quiet"
          : "settled";
  }

  function costText(c) {
    const p = [];
    if (c.w) p.push(c.w + "w");
    if (c.s) p.push(c.s + "s");
    if (c.c) p.push(c.c + "c");
    if (c.a) p.push(c.a + " arms");
    return p.length ? p.join(" ") : "free";
  }

  UI.JOBS = JOBS;
  UI.costText = costText;
  ZS.VillageUI = UI;
})();
