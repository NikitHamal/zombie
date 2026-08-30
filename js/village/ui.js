/* The Hollow — the overlay UI. A thin, paper-coloured DOM layer over the
   canvas: the clock, the stores, the selection card, and two panels that
   only exist while you want them (build · research). HOLD-DESIGN.md §8 is
   the precedent: DOM carries the persistent controls, everything the sim
   writes — toasts, warnings, the dawn and the fall cards — is drawn on the
   canvas in the sketch hand.

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
    { id: "idle", key: "X", name: "idle", hint: "rest, wander, stay out of trouble" },
  ];

  const UI = {
    scen: null,
    el: {},
    sig: {},
    html: { sel: "", panel: "", res: "" },
    toastT: 0,

    init(scen) {
      this.scen = scen;
      const q = (id) => document.getElementById(id);
      this.el = {
        clock: q("clock"),
        wx: q("wx"),
        res: q("res"),
        sel: q("sel"),
        panel: q("panel"),
        toast: q("toast"),
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
      click("home", () => scen.focusHall());
      click("fit", () => scen.fitView());
      click("bell", () => scen.callNight());
      click("sound", () => scen.toggleSound());
      click("helpb", () => this.toggleHelp());
      click("helpwrap", () => this.toggleHelp(false));
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
      return this;
    },

    /* ---------- input ---------- */

    key(e) {
      const s = this.scen;
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
      if (lower === "t") return this.act("research-panel");
      if (lower === "b") return this.act("build-panel");
      if (lower === "v") return this.act("villagers-panel");
      if (lower === "h") return this.act("home");
      if (lower === "f") return this.act("fit");
      if (lower === "n") return this.act("bell");
      if (lower === "m") return this.act("sound");
      if (lower === "?") return this.act("help");
    },

    act(what, arg, who) {
      const s = this.scen;
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

    toggleHelp(on) {
      const e = this.el.help;
      const show = on === undefined ? !e.classList.contains("on") : on;
      e.classList.toggle("on", show);
    },

    toast(msg) {
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
      const s = this.scen;
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
        for (const a of s.villagers()) f += ";" + a.uid + a.job + Math.ceil(a.hp / 8);
        return f;
      }
      return "none";
    },

    paintBar() {
      const s = this.scen;
      this.el.clock.textContent = "DAY " + s.day + "  ·  " + s.clockText();
      this.el.wx.textContent = s.season.name + " · " + s.weather.name;
      this.el.wx.title = s.season.desc + " · " + s.weather.desc;
      for (let i = 0; i < 4; i++) this.el.speeds[i].classList.toggle("on", s.speed === i);
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
        row("wood", r.wood, "#8a6a3a") +
        row("stone", r.stone, "#8b8779") +
        row("food", r.food, "#b1963e") +
        row("scrap", r.scrap, "#6f7681") +
        '<span class="chip wide">villagers <b>' +
        v +
        "</b>/" +
        s.popCap() +
        " · guards <b>" +
        s.guards().length +
        "</b> · holds " +
        cap +
        " of each</span>";
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
      const html = sel.k === "v" ? this.villagerCard(sel.o) : this.structCard(sel.o);
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
      let h = '<div class="head"><b>' + a.name + "</b><span>" + job.name + "</span>";
      h += '<i data-act="close">×</i></div>';
      h +=
        '<div class="line">health <b>' +
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
          a.name +
          '"><span>' +
          a.name +
          '</span><span class="hp"><i style="width:' +
          hp +
          '%"></i></span><span class="who">' +
          (a.inf > 0 ? "<em>bitten</em>" : job.name) +
          "</span></div>";
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
      });
      h += '<div class="pfoot">' + s.weaponName() + " · " + s.armorName() + "</div>";
      return h;
    },

    tick(dt) {
      if (this.toastT > 0) {
        this.toastT -= dt;
        if (this.toastT <= 0) this.el.toast.classList.remove("on");
      }
      // "what they are doing" changes every few seconds; it lives in one
      // text node we retype in place, so the buttons around it never move
      const s = this.scen;
      const a = s && s.sel && s.sel.k === "v" ? s.sel.o : null;
      const line = a
        ? (a.task || "standing about") +
          (a.carry && a.carry.n ? " · carrying " + a.carry.n + " " + a.carry.kind : "")
        : "";
      if (this.selTask && this.selTask.textContent !== line) this.selTask.textContent = line;
      if (this.taskNode && this.taskNode.textContent !== line) this.taskNode.textContent = line;
    },
  };

  function costText(c) {
    const p = [];
    if (c.w) p.push(c.w + "w");
    if (c.s) p.push(c.s + "s");
    if (c.c) p.push(c.c + "c");
    return p.length ? p.join(" ") : "free";
  }

  UI.JOBS = JOBS;
  UI.costText = costText;
  ZS.VillageUI = UI;
})();
