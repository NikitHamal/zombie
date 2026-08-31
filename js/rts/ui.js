/* The overlay. Paper on top of the sketch, the way the village had it, but
   shaped for a war: the clock and the money at the top, the selection and
   its orders at the bottom left, the command card across the middle, the
   minimap at the bottom right. Everything is a thin sheet that stays out
   of the way of the field.

   The keyboard lives here too: the camera under WASD and the edges, the
   speeds under 1-3, orders under S/H/A, building under B, control groups
   under the numbers. The scenario keeps the state; this paints it, four
   times a second, and immediately when something changes. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const MINI_W = 216,
    MINI_H = 162;

  const BUILDMENU = [
    { kind: "wall", key: "def" },
    { kind: "gate", key: "def" },
    { kind: "barricade", key: "def" },
    { kind: "gunNest", key: "def" },
    { kind: "turret", key: "def" },
    { kind: "hut", key: "eco" },
    { kind: "flag", key: "eco" },
    { kind: "oil", key: "eco" },
    { kind: "foundry", key: "prod" },
    { kind: "airfield", key: "prod" },
    { kind: "dock", key: "prod" },
  ];

  const RtsUI = {
    scen: null,
    els: {},
    groups: {},
    atkMode: false,
    lastSig: "",
    miniGround: null,
    _toastT: null,

    init(scen) {
      if (this.scen === scen) return;
      this.scen = scen;
      const $ = (id) => document.getElementById(id);
      this.els = {
        clock: $("clock"),
        phase: $("phase"),
        res: $("res"),
        alerts: $("alerts"),
        sel: $("sel"),
        cmd: $("cmd"),
        toast: $("toast"),
        help: $("helpwrap"),
        mini: $("mini"),
        bar: $("bar"),
      };
      this._buttons();
      this._keys();
      this._minimap();
      if (this._iv) clearInterval(this._iv);
      this._iv = setInterval(() => this.refresh(), 250);
    },

    /* ---------- the bar's buttons ---------- */

    _buttons() {
      const $ = (id) => document.getElementById(id);
      const scen = this.scen;
      const speed = (v) => {
        scen.timeScale = v;
        if (v > 0) this._lastSpeed = v;
        this.refresh(true);
      };
      $("sp0").onclick = () => speed(scen.timeScale === 0 ? this._lastSpeed || 1 : 0);
      $("sp1").onclick = () => speed(1);
      $("sp2").onclick = () => speed(2);
      $("sp3").onclick = () => speed(3);
      $("buildb").onclick = () => this.toggleBuildMenu();
      $("helpb").onclick = () => this.els.help.classList.toggle("on");
      $("qualb").onclick = () => {
        if (ZS.Perf) ZS.Perf.cycle();
      };
      $("soundb").onclick = () => {
        if (ZS.sound && ZS.sound.toggle) ZS.sound.toggle();
      };
      $("homeb").onclick = () => this.goHome();
    },

    goHome() {
      const scen = this.scen;
      const hq = scen.bldsOf(0, "hall")[0];
      const cam = ZS.debug && ZS.debug.cam;
      if (cam && hq) {
        cam.x = hq.x + hq.w / 2;
        cam.y = hq.y + hq.h / 2;
        cam.clamp(scen.vw || 800, scen.vh || 600);
      }
    },

    /* ---------- the keyboard ---------- */

    _keys() {
      const scen = this.scen;
      const CAMKEYS = {
        w: 1,
        a: 1,
        s: 1,
        d: 1,
        ArrowUp: 1,
        ArrowDown: 1,
        ArrowLeft: 1,
        ArrowRight: 1,
      };
      window.addEventListener("keydown", (e) => {
        if (e.repeat) return;
        const k = e.key;
        if (CAMKEYS[k]) {
          scen.keys[k] = true;
          if (k.startsWith("Arrow")) e.preventDefault();
          return;
        }
        if (e.ctrlKey && /^[0-9]$/.test(k)) {
          this.groups[k] = scen.sel.slice();
          this.toast("group " + k + " — " + this.groups[k].length + " guns");
          return;
        }
        switch (k) {
          case " ":
            e.preventDefault();
            scen.timeScale = scen.timeScale === 0 ? this._lastSpeed || 1 : 0;
            this.refresh(true);
            break;
          case "1":
          case "2":
          case "3":
            if (!e.ctrlKey) {
              if (this.groups[k] && !e.shiftKey) {
                this._recall(k);
                return;
              }
              scen.timeScale = +k;
              this._lastSpeed = +k;
              this.refresh(true);
            }
            break;
          case "Escape":
            if (this.els.help.classList.contains("on")) this.els.help.classList.remove("on");
            else if (scen.build) {
              scen.build = null;
              this.buildMenuOn = false;
              this.refresh(true);
            } else {
              for (const a of scen.sel) a.sel = false;
              scen.sel = [];
              scen.selB = null;
              this.refresh(true);
            }
            break;
          case "s":
            this.order("stop");
            break;
          case "h":
            this.order("hold");
            break;
          case "a":
            this.atkMode = !this.atkMode;
            this.toast(this.atkMode ? "attack-move — right-click the ground" : "attack-move off");
            break;
          case "b":
            this.toggleBuildMenu();
            break;
          case "u":
            if (scen.selB && scen.selB.fac === 0) {
              scen.upgrade(scen.selB);
              this.refresh(true);
            }
            break;
          case "r":
            if (scen.selB && scen.selB.fac === 0) {
              scen.repairB = scen.repairB === scen.selB ? null : scen.selB;
              this.toast(scen.repairB ? "the repair begins" : "the repair stops");
            }
            break;
          case "x":
            if (scen.selB && scen.selB.fac === 0) {
              scen.sell(scen.selB);
              this.refresh(true);
            }
            break;
          case "f":
            this.goHome();
            break;
          case "?":
            this.els.help.classList.toggle("on");
            break;
          case "k":
            if (ZS.sound && ZS.sound.toggle) ZS.sound.toggle();
            break;
          case "q":
            if (ZS.Perf) ZS.Perf.cycle();
            break;
          case "F3":
            e.preventDefault();
            if (ZS.Perf) ZS.Perf.on = !ZS.Perf.on;
            break;
        }
      });
      window.addEventListener("keyup", (e) => {
        if (CAMKEYS[e.key]) scen.keys[e.key] = false;
      });
      window.addEventListener("blur", () => {
        scen.keys = {};
      });
      // the right-click order honours attack-move mode
      const oldCommand = scen._command.bind(scen);
      scen._command = (x, y, e) => {
        if (this.atkMode && scen.sel.length) {
          const b = ZS.Structs.pick(scen.world.buildings, x, y);
          let tgt = null;
          for (const a of scen.agents)
            if (!a.dead && a.fac !== 0 && Math.hypot(a.x - x, a.y - y) < 26) tgt = a;
          if (!tgt && b && b.fac !== 0) tgt = b;
          if (tgt) scen.issueAttack(scen.sel, tgt);
          else scen.issueMove(scen.sel, x, y, "amove");
          this.atkMode = false;
          return;
        }
        oldCommand(x, y, e);
      };
    },

    _recall(k) {
      const scen = this.scen;
      const g = (this.groups[k] || []).filter((a) => !a.dead && !a.gone);
      for (const a of scen.sel) a.sel = false;
      scen.sel = g;
      for (const a of g) a.sel = true;
      scen.selB = null;
      if (g.length) {
        const cam = ZS.debug && ZS.debug.cam;
        if (cam) {
          cam.x = g[0].x;
          cam.y = g[0].y;
          cam.clamp(scen.vw || 800, scen.vh || 600);
        }
      }
      this.refresh(true);
    },

    order(kind) {
      const scen = this.scen;
      if (!scen.sel.length) return;
      if (kind === "stop") {
        for (const a of scen.sel) scen.orderUnit(a, null);
        this.toast("they stand easy");
      } else if (kind === "hold") {
        for (const a of scen.sel) scen.orderUnit(a, { k: "hold" });
        this.toast("they hold where they are");
      }
      this.refresh(true);
    },

    /* ---------- the build menu ---------- */

    toggleBuildMenu() {
      this.buildMenuOn = !this.buildMenuOn;
      if (!this.buildMenuOn) this.scen.build = null;
      this.refresh(true);
    },

    armBuild(kind) {
      const scen = this.scen;
      scen.build = scen.build === kind ? null : kind;
      if (scen.build) {
        const bd = ZS.Roster.BUILD[kind];
        this.toast(bd.name + " — " + bd.money + " funds · click the ground");
      }
      this.refresh(true);
    },

    /* ---------- the paint ---------- */

    sig() {
      const s = this.scen;
      const sel = s.sel.length
        ? "u" + s.sel.map((a) => a.id).join(",")
        : s.selB
          ? "b" +
            s.selB.seed +
            ":" +
            Math.ceil(s.selB.hp) +
            ":" +
            s.selB.lvl +
            ":" +
            (s.selB.queue || []).length
          : "-";
      return (
        s.day +
        "|" +
        (s.night ? 1 : 0) +
        "|" +
        Math.floor(s.clock) +
        "|" +
        sel +
        "|" +
        Math.floor(s.facs[0].funds) +
        "|" +
        (s.build || "") +
        "|" +
        (this.buildMenuOn ? 1 : 0) +
        "|" +
        s.timeScale +
        "|" +
        (s.repairB ? 1 : 0) +
        "|" +
        s.alerts.length +
        "|" +
        (s.selB && s.selB.queue ? s.selB.queue.map((q) => Math.floor(q.p * 10)).join("") : "")
      );
    },

    refresh(force) {
      const s = this.scen;
      if (!s) return;
      const sig = this.sig();
      if (!force && sig === this.lastSig) return;
      this.lastSig = sig;
      this._clock();
      this._res();
      this._alerts();
      this._sel();
      this._cmd();
    },

    _clock() {
      const s = this.scen;
      this.els.clock.textContent = "DAY " + s.day + " · " + (s.night ? "night" : "daylight");
      this.els.phase.textContent = s.night ? "the dead are out" : "the field is open";
      const btns = ["sp0", "sp1", "sp2", "sp3"];
      const on = s.timeScale === 0 ? 0 : Math.min(3, Math.round(s.timeScale));
      btns.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("on", i === on);
      });
    },

    _res() {
      const s = this.scen;
      const f = s.facs[0];
      const inc = s.playerIncome();
      let derricks = 0;
      for (const b of s.world.buildings)
        if (b.kind === "oil" && b.fac === 0 && !b.ruined) derricks++;
      this.els.res.innerHTML =
        '<div class="chip"><i style="background:#8a7a3a"></i>' +
        Math.floor(f.funds) +
        " funds <span class='cap'>+" +
        inc.toFixed(1) +
        "/s</span></div>" +
        '<div class="chip"><i style="background:#5a7a3a"></i>' +
        s.supUsed(0) +
        " / " +
        s.supMax(0) +
        " supply</div>" +
        '<div class="chip"><i style="background:#4a4438"></i>' +
        derricks +
        (derricks === 1 ? " derrick" : " derricks") +
        "</div>" +
        '<div class="chip wide">' +
        s.kills +
        " put down · " +
        s.lost +
        " lost</div>";
    },

    _alerts() {
      const s = this.scen;
      const el = this.els.alerts;
      const list = s.alerts;
      if (!list.length) {
        el.classList.remove("on");
        return;
      }
      el.classList.add("on");
      el.innerHTML = list.map((a) => '<span class="al raid">' + a.txt + "</span>").join("");
    },

    _sel() {
      const s = this.scen;
      const el = this.els.sel;
      if (s.sel.length) {
        const n = s.sel.length;
        const first = s.sel[0];
        const d = ZS.Units.CAT[first.unit];
        let hp = 0,
          mhp = 0;
        for (const a of s.sel) {
          hp += a.hp;
          mhp += a.maxHp;
        }
        el.classList.add("on");
        el.innerHTML =
          '<div class="head"><b>' +
          (n === 1 ? d.name : n + " guns") +
          "</b><span>" +
          (n === 1
            ? Math.ceil(first.hp) + " / " + first.maxHp
            : Math.ceil((hp / mhp) * 100) + "% whole") +
          "</span></div>" +
          '<div class="line dim">' +
          (d.desc || "") +
          "</div>" +
          (n > 1 ? this._mixLine() : "") +
          '<div class="line" style="margin-top:5px">right-click to send them</div>';
        return;
      }
      if (s.selB) {
        const b = s.selB;
        const c = ZS.Structs.CAT[b.kind];
        el.classList.add("on");
        const mine = b.fac === 0;
        const facName =
          b.fac >= 0 && ZS.FACPAINT[b.fac]
            ? ZS.FACPAINT[b.fac].name
            : b.fac === -1
              ? "no one's"
              : "an enemy's";
        el.innerHTML =
          '<div class="head"><b>' +
          c.name +
          "</b><span>" +
          facName +
          "</span></div>" +
          '<div class="line">' +
          (b.ruined
            ? "ruined"
            : b.built
              ? "level " + b.lvl
              : "raising — " + Math.floor((b.prog || 0) * 100) + "%") +
          "</div>" +
          '<div class="line">' +
          Math.ceil(Math.max(0, b.hp)) +
          " / " +
          b.maxHp +
          "</div>" +
          (b.queue && b.queue.length
            ? '<div class="line dim">' +
              b.queue.map((q) => ZS.Units.CAT[q.id].name).join(", ") +
              "</div>"
            : "") +
          (mine
            ? '<div class="line dim" style="margin-top:4px">U upgrade · R repair · X sell</div>'
            : "");
        return;
      }
      el.classList.remove("on");
    },

    _mixLine() {
      const s = this.scen;
      const counts = {};
      for (const a of s.sel) counts[a.unit] = (counts[a.unit] || 0) + 1;
      const bits = [];
      for (const id in counts) bits.push(counts[id] + " " + ZS.Units.CAT[id].name);
      return '<div class="line dim">' + bits.join(", ") + "</div>";
    },

    _cmd() {
      const s = this.scen;
      const el = this.els.cmd;
      let html = "";
      if (s.selB && s.selB.fac === 0 && ZS.Roster.TRAIN[s.selB.kind] && s.selB.built) {
        const b = s.selB;
        html += '<div class="ctitle">train</div><div class="tray">';
        for (const id of ZS.Roster.TRAIN[b.kind]) {
          const d = ZS.Units.CAT[id];
          const no = s.facs[0].funds < d.money || s.supUsed(0) + (d.sup || 1) > s.supMax(0);
          html +=
            '<button data-act="train-' +
            id +
            '"' +
            (no ? ' class="no"' : "") +
            ' title="' +
            (d.desc || "") +
            '">' +
            d.name +
            " <kbd>" +
            d.money +
            "</kbd></button>";
        }
        html += "</div>";
        if (b.queue.length) {
          html +=
            '<div class="qline">' +
            b.queue.map((q) => Math.floor(q.p * 100) + "% " + ZS.Units.CAT[q.id].name).join(" · ") +
            ' <button data-act="cancel">cancel</button></div>';
        }
      }
      if (s.sel.length) {
        html +=
          '<div class="tray">' +
          '<button data-act="stop" title="S">stop <kbd>S</kbd></button>' +
          '<button data-act="hold" title="H">hold <kbd>H</kbd></button>' +
          '<button data-act="amode" title="A">attack-move <kbd>A</kbd></button>' +
          "</div>";
      }
      if (this.buildMenuOn) {
        html +=
          '<div class="ctitle">raise' +
          (s.build ? " — " + ZS.Roster.BUILD[s.build].name : "") +
          "</div>";
        for (const group of ["def", "eco", "prod"]) {
          html += '<div class="tray">';
          for (const item of BUILDMENU) {
            if (item.key !== group) continue;
            const bd = ZS.Roster.BUILD[item.kind];
            const no = s.facs[0].funds < bd.money;
            html +=
              '<button data-act="build-' +
              item.kind +
              '"' +
              (s.build === item.kind ? ' class="on"' : no ? ' class="no"' : "") +
              ' title="' +
              bd.desc +
              '">' +
              bd.name +
              " <kbd>" +
              bd.money +
              "</kbd></button>";
          }
          html += "</div>";
        }
        html +=
          '<div class="pfoot">walls and barricades drag out in a line · esc puts it down</div>';
      }
      if (!html) {
        html =
          '<div class="tray">' +
          '<button data-act="buildmenu">raise something <kbd>B</kbd></button>' +
          '<button data-act="home">the hall <kbd>F</kbd></button>' +
          "</div>" +
          '<div class="pfoot">the derricks pay the war · capture them, or raise your own on the seeps</div>';
      }
      if (el.innerHTML !== html) {
        el.innerHTML = html;
        for (const btn of el.querySelectorAll("button[data-act]"))
          btn.onclick = () => this.act(btn.getAttribute("data-act"));
      }
    },

    act(act) {
      const s = this.scen;
      if (act === "stop") return this.order("stop");
      if (act === "hold") return this.order("hold");
      if (act === "amode") {
        this.atkMode = !this.atkMode;
        this.toast(this.atkMode ? "attack-move — right-click the ground" : "attack-move off");
        return;
      }
      if (act === "buildmenu") return this.toggleBuildMenu();
      if (act === "home") return this.goHome();
      if (act === "cancel") {
        const b = s.selB;
        if (b && b.queue.length) {
          const q = b.queue.shift();
          s.facs[0].funds += Math.floor(ZS.Units.CAT[q.id].money * 0.5 * (1 - q.p));
          this.refresh(true);
        }
        return;
      }
      if (act.startsWith("train-")) {
        const id = act.slice(6);
        if (s.selB) {
          const r = s.trainUnit(0, s.selB, id);
          if (!r.ok) this.toast(r.err);
        }
        this.refresh(true);
        return;
      }
      if (act.startsWith("build-")) return this.armBuild(act.slice(6));
    },

    /* ---------- the minimap ---------- */

    _minimap() {
      const cv = this.els.mini;
      cv.width = MINI_W;
      cv.height = MINI_H;
      const scen = this.scen;
      const world = scen.world;
      // the ground, once: paper, water, the woods
      const g = document.createElement("canvas");
      g.width = MINI_W;
      g.height = MINI_H;
      const gc = g.getContext("2d");
      const sx = MINI_W / world.w,
        sy = MINI_H / world.h;
      gc.fillStyle = "#efe8d8";
      gc.fillRect(0, 0, MINI_W, MINI_H);
      gc.fillStyle = "rgba(96,138,166,0.5)";
      const blob = (pts) => {
        gc.beginPath();
        for (let i = 0; i < pts.length; i++)
          if (i) gc.lineTo(pts[i].x * sx, pts[i].y * sy);
          else gc.moveTo(pts[i].x * sx, pts[i].y * sy);
        gc.closePath();
        gc.fill();
      };
      if (world.river && world.river.pts) blob(world.river.pts);
      if (world.lake && world.lake.pts && world.lake.r) blob(world.lake.pts);
      if (world.ponds) for (const p of world.ponds) blob(p.pts);
      if (world.forest) {
        gc.fillStyle = "rgba(104,132,66,0.4)";
        gc.beginPath();
        gc.ellipse(
          world.forest.x * sx,
          world.forest.y * sy,
          world.forest.r * sx,
          world.forest.r * sy * 0.9,
          0,
          0,
          6.2832,
        );
        gc.fill();
      }
      this.miniGround = g;
      this._miniSx = sx;
      this._miniSy = sy;
      const jump = (e) => {
        const r = cv.getBoundingClientRect();
        const wx = ((e.clientX - r.left) / MINI_W) * world.w;
        const wy = ((e.clientY - r.top) / MINI_H) * world.h;
        const cam = ZS.debug && ZS.debug.cam;
        if (cam) {
          cam.x = wx;
          cam.y = wy;
          cam.clamp(scen.vw || 800, scen.vh || 600);
        }
      };
      cv.style.pointerEvents = "auto";
      cv.addEventListener("pointerdown", (e) => {
        jump(e);
        this._miniDrag = true;
        cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener("pointermove", (e) => {
        if (this._miniDrag) jump(e);
      });
      cv.addEventListener("pointerup", () => {
        this._miniDrag = false;
      });
      setInterval(() => this._miniPaint(), 220);
    },

    _miniPaint() {
      const s = this.scen;
      const cv = this.els.mini;
      if (!cv || !s || !s.world) return;
      const c = cv.getContext("2d");
      const sx = this._miniSx,
        sy = this._miniSy;
      c.clearRect(0, 0, MINI_W, MINI_H);
      c.drawImage(this.miniGround, 0, 0);
      // the nests
      for (const n of s.nests) {
        if (!ZS.Horde.alive(n)) continue;
        c.fillStyle = "rgba(90,40,30,0.8)";
        c.fillRect(n.x * sx - 1.6, n.y * sy - 1.6, 3.2, 3.2);
      }
      // the buildings, in their flags' colours
      for (const b of s.world.buildings) {
        const paint = ZS.FACPAINT[b.fac];
        c.fillStyle =
          b.fac === -1 ? "rgba(70,64,52,0.7)" : paint ? paint.dot : "rgba(70,64,52,0.5)";
        if (b.ruined) c.fillStyle = "rgba(110,104,92,0.45)";
        const big = b.kind === "hall" ? 3 : 2;
        c.fillRect(b.cx * sx - big / 2, b.cy * sy - big / 2, big, big);
      }
      // the units
      for (const a of s.agents) {
        if (a.st === 2) c.fillStyle = "rgba(90,40,30,0.55)";
        else {
          const paint = ZS.FACPAINT[a.fac];
          c.fillStyle = paint ? paint.dot : "#5a7a3a";
        }
        c.fillRect(a.x * sx - 1, a.y * sy - 1, 2, 2);
      }
      // the camera's frame
      const cam = ZS.debug && ZS.debug.cam;
      if (cam) {
        const vw = s.vw || 800,
          vh = s.vh || 600;
        const hw = vw / cam.zoom / 2,
          hh = vh / cam.zoom / 2;
        c.strokeStyle = "rgba(46,44,40,0.85)";
        c.lineWidth = 1.2;
        c.strokeRect((cam.x - hw) * sx, (cam.y - hh) * sy, hw * 2 * sx, hh * 2 * sy);
      }
      // the night, faintly
      if (s.night) {
        c.fillStyle = "rgba(38,42,56,0.25)";
        c.fillRect(0, 0, MINI_W, MINI_H);
      }
    },

    /* ---------- voices ---------- */

    toast(txt) {
      const el = this.els.toast;
      if (!el) return;
      el.textContent = txt;
      el.classList.add("on");
      if (this._toastT) clearTimeout(this._toastT);
      this._toastT = setTimeout(() => el.classList.remove("on"), 2600);
    },

    note(txt) {
      const s = this.scen;
      s.alerts.push({ txt, t: 9 });
      if (s.alerts.length > 4) s.alerts.shift();
    },

    setNight(on) {
      document.body.classList.toggle("night", on);
    },
  };

  ZS.RtsUI = RtsUI;
})();
