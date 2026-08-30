/* The Hollow — the watch.

   Two questions, asked all the time: *what is worth looking at?* and *is
   anything happening?* The camera gets the first (it is layered into
   `scen.camInterest`, which the page's auto camera already follows); the
   clock gets the second — in watch mode the quiet stretches run at speed
   and the village slows back down the moment there is something to see,
   so a night is something you watch rather than something you wait out.

   Nothing here moves a person or costs a resource. It only looks. */
(() => {
  "use strict";
  const ZS = window.ZS;

  const BAL = {
    QUIET: 3.5, // seconds of nothing before the clock runs on
    FAST: 3, // ...and how fast it runs then
    NEAR: 90, // a dead one this close to somebody is a fight
    ZOOM_IN: 1.3, // how tight the camera sits on trouble
    ZOOM_OUT: 0.95,
    EASE: 1.5, // how quickly the camera goes there
  };

  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

  const Watch = {
    BAL,

    create() {
      return { on: 0, base: 1, quiet: 0, why: "" };
    },

    load(scen, s) {
      const w = (scen.watch = this.create());
      if (!s) return w;
      w.on = s.on ? 1 : 0;
      w.base = s.base === undefined ? 1 : s.base;
      return w;
    },

    save(scen) {
      const w = scen.watch || this.create();
      return { on: w.on ? 1 : 0, base: w.base };
    },

    on(scen) {
      return !!(scen.watch && scen.watch.on);
    },

    toggle(scen) {
      if (!scen.watch) this.load(scen, null);
      const w = scen.watch;
      w.on = w.on ? 0 : 1;
      w.quiet = 0;
      if (w.on) {
        w.base = scen.speed || 1;
        // re-arm the auto camera: panning takes it away, and this gives it
        // back
        if (ZS.debug && ZS.debug.cam) ZS.debug.cam.auto = true;
        if (ZS.VillageUI)
          ZS.VillageUI.toast("watching — the quiet stretches will run on. W to stop");
      } else {
        scen.setSpeed(w.base);
        if (ZS.VillageUI) ZS.VillageUI.toast("the clock is yours again");
      }
      if (ZS.VillageUI) ZS.VillageUI.refresh(true);
      return !!w.on;
    },

    /* ---------- what is worth looking at ---------- */

    // the point of interest, or null when the village is simply getting on
    // with it. `why` is what the panel and the toast can say.
    point(scen) {
      if (scen.over) return null;
      // a fire outranks everything else in the village
      if (scen.haz && scen.haz.fire && scen.haz.fire.length) {
        const f = scen.haz.fire[0];
        const s = f.s;
        if (s)
          return {
            x: s.x + s.w / 2,
            y: s.y + s.h / 2,
            zoom: BAL.ZOOM_IN,
            why: "a fire",
          };
      }
      let best = null,
        bs = 0;
      const take = (a, s, why) => {
        if (s <= bs) return;
        bs = s;
        best = { x: a.x, y: a.y, zoom: s > 2 ? BAL.ZOOM_IN : 1.1, why };
      };
      // the dead, by how close they are to somebody
      const live = scen.villagers();
      for (const z of scen.agents) {
        if (z.st !== 2 || z.dead || z.gone) continue;
        let near = 1e9,
          who = null;
        for (const v of live) {
          const d = dist2(z.x, z.y, v.x, v.y);
          if (d < near) {
            near = d;
            who = v;
          }
        }
        if (!who || near > BAL.NEAR * BAL.NEAR * 4) continue;
        const guard = who.job === "guard" || (who.st === 4 && !who.foe);
        take(
          z,
          guard ? 3 : near < BAL.NEAR * BAL.NEAR ? 2.6 : 1.2,
          guard ? "the line" : "somebody in trouble",
        );
      }
      // theirs, in the field
      if (ZS.Army && ZS.Army.units) {
        const foes = ZS.Army.units(scen, true);
        if (foes.length) {
          let fx = 0,
            fy = 0;
          for (const f of foes) {
            fx += f.x;
            fy += f.y;
          }
          const p = {
            x: fx / foes.length,
            y: fy / foes.length,
            zoom: 1.15,
            why: "an army in the field",
          };
          if (bs < 3) return p;
        }
      }
      // the wounded and the bitten
      for (const v of live) {
        if (v.inf > 0) take(v, 2.2, v.name + " is bitten");
        else if (v.hp < v.maxHp * 0.35) take(v, 1.8, v.name + " is hurt");
      }
      return best;
    },

    // is there anything happening at all?
    hot(scen) {
      return !!this.point(scen);
    },

    /* ---------- the clock ---------- */

    // called every frame from the scenario: the timelapse
    tick(scen, dt) {
      const w = scen.watch;
      if (!w || !w.on || scen.over || scen.card) return;
      if (this.hot(scen)) {
        w.quiet = 0;
        w.why = (this.point(scen) || {}).why || "";
        if (scen.speed !== 1) scen.setSpeed(1);
        return;
      }
      w.quiet += dt;
      if (w.quiet < BAL.QUIET) return;
      // nothing to see: let the village get on with it
      if (scen.speed < BAL.FAST) scen.setSpeed(BAL.FAST);
    },

    // what the panel says we are watching, if anything
    line(scen) {
      const w = scen.watch;
      if (!w || !w.on) return "the watch is off";
      const p = this.point(scen);
      return p ? p.why : w.quiet > BAL.QUIET ? "nothing — the clock runs on" : "watching";
    },
  };

  ZS.Watch = Watch;
})();
