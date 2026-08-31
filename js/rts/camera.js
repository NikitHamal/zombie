/* SANDSTORM — the camera.

   A real RTS camera: it scrolls when the cursor reaches the screen edge,
   it pans on a middle-drag, it answers WASD and the arrow keys, the wheel
   zooms on the cursor, and it can be told to go somewhere (the minimap,
   the home base, a control group) and glide there instead of cutting.

   It also carries the shake: an artillery round landing near the edge of
   the screen should move the page. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});

  const EDGE = 26; // px from the border that starts a scroll
  const EDGE_SPEED = 900; // world units/sec at zoom 1
  const KEY_SPEED = 1100;

  const Cam = {
    cam: null,
    keys: Object.create(null),
    edgeOn: true,
    shakeT: 0,
    shakeMag: 0,
    _mx: 0,
    _my: 0,
    _inWindow: false,

    init(cam) {
      this.cam = cam;
      cam.minZoom = 0.16;
      cam.maxZoom = 2.0;
      cam.zoom = 0.85;
      cam.auto = false;
      return this;
    },

    key(e, down) {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "a" || k === "s" || k === "d") this.keys[k] = down;
      if (k.startsWith("arrow")) this.keys[k] = down;
      if (down && (k === "w" || k === "a" || k === "s" || k === "d" || k.startsWith("arrow")))
        e.preventDefault();
    },

    mouseMove(x, y) {
      this._mx = x;
      this._my = y;
      this._inWindow = true;
    },
    mouseLeave() {
      this._inWindow = false;
    },

    // a drag from the middle button (or with space held) pans the page
    panBy(dx, dy, vw, vh) {
      this.cam.panBy(dx, dy, vw, vh);
    },

    zoomAt(x, y, f, vw, vh) {
      this.cam.zoomAt(x, y, f, vw, vh);
    },

    shake(mag) {
      if (mag > this.shakeMag) this.shakeMag = Math.min(26, mag);
      this.shakeT = Math.max(this.shakeT, 0.28);
    },

    // go somewhere and take your time about it
    glideTo(x, y, zoom) {
      this._glide = { x, y, zoom: zoom === undefined ? this.cam.zoom : zoom, t: 0 };
    },

    centerOn(x, y, vw, vh) {
      this.cam.x = x;
      this.cam.y = y;
      this.cam.clamp(vw, vh);
      this._glide = null;
    },

    update(dt, vw, vh) {
      const cam = this.cam;
      if (!cam) return;

      if (this._glide) {
        const g = this._glide;
        g.t += dt;
        const k = 1 - Math.exp(-dt / 0.22);
        cam.x += (g.x - cam.x) * k;
        cam.y += (g.y - cam.y) * k;
        cam.zoom += (g.zoom - cam.zoom) * k;
        cam.clamp(vw, vh);
        if (g.t > 0.8) this._glide = null;
        return;
      }

      let vx = 0,
        vy = 0;
      // edge scrolling is a nudge, not a shove: it runs slower than the
      // keys, and it ramps in with how far past the border you are
      let edge = false;
      const k = this.keys;
      if (k.a || k.arrowleft) vx -= 1;
      if (k.d || k.arrowright) vx += 1;
      if (k.w || k.arrowup) vy -= 1;
      if (k.s || k.arrowdown) vy += 1;

      if (!vx && !vy && this.edgeOn && this._inWindow && !this._suppress) {
        const m = EDGE;
        if (this._mx < m) vx -= 1 - this._mx / m;
        else if (this._mx > vw - m) vx += 1 - (vw - this._mx) / m;
        if (this._my < m) vy -= 1 - this._my / m;
        else if (this._my > vh - m) vy += 1 - (vh - this._my) / m;
        edge = vx !== 0 || vy !== 0;
      }

      if (vx || vy) {
        const sp = ((edge ? EDGE_SPEED : KEY_SPEED) / cam.zoom) * dt;
        cam.x += vx * sp;
        cam.y += vy * sp;
        cam.clamp(vw, vh);
      }

      if (this.shakeT > 0) {
        this.shakeT -= dt;
        const m = this.shakeMag * Math.max(0, this.shakeT / 0.28);
        this._sx = (Math.random() * 2 - 1) * m;
        this._sy = (Math.random() * 2 - 1) * m;
        if (this.shakeT <= 0) {
          this.shakeMag = 0;
          this._sx = this._sy = 0;
        }
      }
    },

    // applied by the renderer, in screen space, after the camera transform
    shakeOffset() {
      return this._sx || this._sy ? { x: this._sx, y: this._sy } : null;
    },
  };

  R.Cam = Cam;
})();
