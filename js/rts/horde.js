/* Desert Order — the Rot.

   The nations want your ground. The Rot wants all of it.

   Three settlements on the map start infested. They do not build, they do
   not negotiate and they do not stop: on a timer they push out a wave, and
   the wave walks at whatever is nearest — your wall, an ally's refinery,
   another nation's barracks, it makes no difference to them. Kill the
   wave and another comes, a little bigger than the last.

   A nest can be taken like any other settlement, but the ground will not
   turn until you have killed what is standing on it, and taking a nest is
   the only way to stop the waves coming out of it. Take all three and the
   Rot is finished; ignore them and every nation on the map, including you,
   is fighting on two fronts. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const R = (ZS.RTS = ZS.RTS || {});

  const Horde = {
    setup(g) {
      g.horde = { wave: 0, nextT: 999999, nests: 0 };
    },

    countNests() {
      return 0;
    },

    nestLost() {},

    update() {},

    roll(key, wave) {
      const M = R.HORDE.mix;
      let tw = 0;
      for (const m of M) {
        if (wave < m.min) continue;
        tw += m.w;
      }
      let r = Math.random() * tw;
      for (const m of M) {
        if (wave < m.min) continue;
        r -= m.w;
        if (r <= 0) return m.key;
      }
      return "zwalker";
    },

    // the nearest thing that is not Rot: a building, a unit, and failing
    // that the nearest settlement's coordinates to walk at
    nearestPrey(g, x, y) {
      let bu = null,
        bd = 1e18;
      g.grid.query(x, y, 2600, (o) => {
        if (o.dead || o.fac === 6) return;
        if (o.inside) return;
        const d = R.dist2(x, y, o.x, o.y);
        if (d < bd) {
          bd = d;
          bu = o;
        }
      });
      if (bu) return bu;
      let bs = null,
        bsd = 1e18;
      for (const s of g.t.sites) {
        if (s.owner === 6) continue;
        const d = R.dist2(x, y, s.x, s.y);
        if (d < bsd) {
          bsd = d;
          bs = s;
        }
      }
      return bs ? { x: bs.x, y: bs.y, site: true } : null;
    },

    spawnAt(g, site, key, n) {
      for (let i = 0; i < n; i++) {
        const an = Math.random() * R.TAU;
        const rr = Math.random() * 130;
        const x = site.x + Math.cos(an) * rr,
          y = site.y + Math.sin(an) * rr;
        if (!g.nav.openAt(x, y, 0)) continue;
        const z = g.addUnit(key, 6, x, y);
        if (!z) continue;
        const prey = this.nearestPrey(g, x, y);
        if (!prey) continue;
        if (prey.site) R.Entity.setOrder(g, z, { type: "amove", x: prey.x, y: prey.y });
        else R.Entity.setOrder(g, z, { type: "attack", tgt: prey, x: prey.x, y: prey.y });
      }
    },

    wave(g, h) {
      const nests = g.t.sites.filter((s) => s.nest);
      const size = Math.round(
        ((5 + h.wave * 2.6) * (1 + h.wave * R.HORDE.growth)) / Math.max(1, nests.length),
      );
      for (const s of nests) {
        const n = Math.max(3, size);
        for (let i = 0; i < n; i++) this.spawnAt(g, s, this.roll(h.wave), 1);
        R.FX.ping(g, s.x, s.y, "bad");
      }
      const total = Math.round((5 + h.wave * 2.6) * (1 + h.wave * R.HORDE.growth));
      g.say(0, "The Rot is moving — " + total + " of them, out of the nests", "warn");
      if (ZS.sound) ZS.sound.event("horn", g.t.homeSite.x, g.t.homeSite.y);
    },

    // between waves a few stragglers wander out, so the nests never look
    // completely asleep
    trickle(g, dt) {
      if (Math.random() > dt * 0.35) return;
      const nests = g.t.sites.filter((s) => s.nest);
      if (!nests.length) return;
      const s = nests[(Math.random() * nests.length) | 0];
      if (g.countUnits(6) > 160) return; // a hard ceiling on the swarm
      this.spawnAt(g, s, "zwalker", 1 + ((Math.random() * 2) | 0));
    },
  };

  R.Horde = Horde;
})();
