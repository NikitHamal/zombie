/* The Hollow — performance.
   One knob rules the frame: the tier. Everything expensive asks this file
   how much of itself it may do — how many sub-segments a boiling stroke
   gets, how many particles may live, whether the torchlight is drawn, how
   many pixels the canvas is allowed to be, how many A* searches a frame
   may spend.

   The tier is chosen for you and then watched: if the frame slips past
   24 ms for two seconds running the game steps down; if it holds under
   13 ms for eight it tries to step back up. Press Q to set it by hand
   (auto goes off the moment you do). F3 shows the numbers.

   Nothing here allocates per frame — the frame-time ring is a fixed
   Float32Array, the draw pool is one array reused forever. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  // detail: sub-segment density of a boiling stroke (1 = the full look)
  // amp:    how hard the strokes wobble
  // dpr:    the highest device-pixel-ratio we will render at
  // part:   how many weather/ember particles may live at once
  // glow:   torchlight, beacon light, bloom — the expensive gradients
  // nav:    A* searches allowed per frame
  // decal:  how much ground furniture (grass tufts, ruts, pebbles) is drawn
  const TIERS = [
    { name: "smooth", detail: 0.34, amp: 0.7, dpr: 1, part: 40, glow: false, nav: 8, decal: 0 },
    { name: "steady", detail: 0.62, amp: 0.85, dpr: 1.5, part: 120, glow: true, nav: 12, decal: 1 },
    { name: "crisp", detail: 1, amp: 1, dpr: 2, part: 260, glow: true, nav: 16, decal: 1 },
  ];

  const N = 60; // frame-time ring
  const rings = new Float32Array(N);

  const Perf = {
    tier: 1,
    auto: true,
    onTier: null, // main.js re-sizes the canvas when the ratio cap changes
    ms: 16,
    fps: 60,
    low: 0, // seconds spent below the line
    high: 0, // seconds spent comfortably above it
    drawn: 0, // strokes this frame (sketch.js counts them)
    calls: 0, // total draw calls this frame

    init() {
      const cores = (navigator.hardwareConcurrency || 4) | 0;
      const px = window.devicePixelRatio || 1;
      // a guess, corrected within the first seconds of play
      let t = 1;
      if (cores >= 8 && px <= 1.5) t = 2;
      else if (cores <= 4 || px > 2.5) t = 1;
      this.setTier(t, false);
      rings.fill(16);
      return this;
    },

    get def() {
      return TIERS[this.tier];
    },
    get detail() {
      return TIERS[this.tier].detail;
    },
    get amp() {
      return TIERS[this.tier].amp;
    },
    get glow() {
      return TIERS[this.tier].glow;
    },
    get decal() {
      return TIERS[this.tier].decal;
    },
    dprCap() {
      return TIERS[this.tier].dpr;
    },
    navBudget() {
      return TIERS[this.tier].nav;
    },
    // how many of these particles may live, please
    cap(n) {
      const m = TIERS[this.tier].part;
      return n < m ? n : m;
    },
    // true when the frame is rich enough to afford this flourish
    get rich() {
      return this.tier >= 2;
    },

    setTier(i, manual) {
      i = ZS.clamp(i | 0, 0, TIERS.length - 1);
      if (i === this.tier && !manual) return this;
      const before = TIERS[this.tier].dpr;
      this.tier = i;
      if (manual) this.auto = false;
      this.low = 0;
      this.high = 0;
      if (before !== TIERS[i].dpr && this.onTier) this.onTier();
      return this;
    },
    cycle() {
      return this.setTier((this.tier + 1) % TIERS.length, true);
    },

    // called once per frame with the real frame delta
    frame(dt) {
      const ms = dt * 1000;
      for (let i = 0; i < N - 1; i++) rings[i] = rings[i + 1];
      rings[N - 1] = ms;
      let s = 0;
      for (let i = 0; i < N; i++) s += rings[i];
      this.ms = s / N;
      this.fps = this.ms > 0 ? 1000 / this.ms : 0;
      if (!this.auto) return;
      if (this.ms > 24) {
        this.low += dt;
        this.high = 0;
      } else if (this.ms < 13) {
        this.high += dt;
        this.low = 0;
      } else {
        this.low = 0;
        this.high = 0;
      }
      if (this.low > 2 && this.tier > 0) this.setTier(this.tier - 1, false);
      else if (this.high > 8 && this.tier < TIERS.length - 1) this.setTier(this.tier + 1, false);
    },

    /* ---------- the draw pool: one array, reused every frame ---------- */
    // draw.js sorts everything with height every frame; this keeps the
    // records instead of making a fresh object per tree, building, agent
    // the records live in `pool` forever; `live` is the frame's handful of
    // references to them. Neither array is ever reallocated.
    pool: [],
    live: [],
    take() {
      const live = this.live;
      const n = live.length;
      let it = this.pool[n];
      if (!it) it = this.pool[n] = { y: 0, k: 0, o: null };
      live[n] = it;
      return it;
    },
    beginList() {
      this.live.length = 0;
      return this;
    },
    endList() {
      return this.live;
    },

    /* ---------- spreading work over frames ---------- */
    // run job i of n only every `period` frames, spread evenly
    spread(i, n, period) {
      const f = this._f || 0;
      return (f + i) % Math.max(1, period) === 0;
    },
    tickFrame() {
      this._f = (this._f || 0) + 1;
    },

    /* ---------- the debug panel (F3) ---------- */
    on: false,
    debug(c, vw, vh, extra) {
      if (!this.on) return;
      const HAND = '"Segoe Script","Bradley Hand","Comic Sans MS",cursive';
      const w = 178,
        h = 96 + (extra && extra.length ? extra.length * 15 : 0);
      const x = vw - w - 14,
        y = vh - h - 14;
      c.save();
      c.fillStyle = "rgba(250,244,232,0.9)";
      c.strokeStyle = "rgba(70,58,44,0.7)";
      c.lineWidth = 1.4;
      ZS.sketchRect(c, x, y, w, h);
      c.fill();
      c.stroke();
      c.textAlign = "left";
      c.font = "12px " + HAND;
      c.fillStyle = "rgba(64,54,40,0.95)";
      let ly = y + 19;
      const line = (a, b) => {
        c.fillText(a, x + 10, ly);
        c.textAlign = "right";
        c.fillText(b, x + w - 10, ly);
        c.textAlign = "left";
        ly += 15;
      };
      const col = this.ms > 24 ? "rgba(150,60,40,0.95)" : "rgba(70,100,54,0.95)";
      c.fillStyle = col;
      line(this.fps.toFixed(0) + " fps", this.ms.toFixed(1) + " ms");
      c.fillStyle = "rgba(64,54,40,0.95)";
      line("quality", TIERS[this.tier].name + (this.auto ? " (auto)" : ""));
      line("strokes", String(this.drawn | 0));
      line("points", String(this.points | 0));
      line("calls", String(this.calls | 0));
      if (extra) {
        ly += 4;
        for (const e of extra) {
          c.fillStyle = "rgba(64,54,40,0.8)";
          line(e[0], e[1]);
        }
      }
      c.restore();
    },
  };

  ZS.Perf = Perf;
})();
