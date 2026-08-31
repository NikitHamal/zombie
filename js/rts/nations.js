/* The nations at war. Four of them stand around the hollow, and three of
   them want it: the Grange is an ally (it fights whoever the player fights,
   and mostly it fights the other three), and Kell, the Rustworks and the
   Order each run a base of their own with the same tools the player has —
   derricks for money, factories for arms, and waves that come
   when the army is big enough. They war on each other too: a wave goes at
   whichever enemy base stands nearest, and that is often not the player's.

   Everything physical — placing a building, queueing a unit, giving an
   order — is a call into the scenario; this file only thinks. Each nation
   keeps its own clock (`thinkT`) so their decisions do not land on the same
   frame. The dice they roll are the scenario's stream: nothing here owns
   randomness of its own. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const BAL = {
    THINK: 1.3, // seconds between a nation's decisions
    FUNDS: [0, 1100, 1150, 1250, 1200], // what each starts holding
    WAVE_BASE: 5, // the first wave is this many guns
    WAVE_DAY: 1.2, // ...and grows by this a day
    WAVE_CAP: 22, // no wave bigger than this
    WAVE_GAP: 26, // at least this long between waves
    HOME_KEEP: 2, // this many guns always stay behind
    DEFEND_T: 9, // how long an attack stays "hot"
    DEFEND_R: 1050, // a hot spot farther out than this is somebody else's
    CAPTURE_R: 1700, // how far from home a nation reaches for oil
    QUEUES: 2, // how deep a factory's queue may run
  };

  // what each nation builds, in the order it likes its army — nobody
  // fights on foot, so every mix is machines
  const NATIONS = [
    null, // the player
    {
      name: "the Grange",
      ally: 1,
      mix: ["scout", "scout", "tank", "tank", "helicopter"],
    },
    {
      name: "Kell",
      mix: ["scout", "scout", "scout", "tank", "scout"],
    },
    {
      name: "the Rustworks",
      mix: ["scout", "tank", "tank", "tank", "helicopter"],
    },
    {
      name: "the Order",
      mix: ["tank", "helicopter", "tank", "fighter", "scout"],
    },
  ];

  function foesOf(f) {
    // the ally fights the three; the three fight the hollow, the ally, and
    // each other — nobody at this table is anybody's friend
    return f.ally ? [2, 3, 4] : [0, 1, 2, 3, 4].filter((i) => i !== f.i);
  }

  const Nations = {
    BAL,
    NATIONS,

    create(_scen) {
      const facs = [];
      for (let i = 0; i < NATIONS.length; i++) {
        const n = NATIONS[i];
        facs.push(
          n
            ? {
                i,
                name: n.name,
                ally: !!n.ally,
                mix: n.mix,
                mixI: 0,
                funds: BAL.FUNDS[i],
                thinkT: 0.5 + i * 0.4,
                lastWave: -99,
                hot: null,
                hotT: -99,
                dead: false,
              }
            : { i: 0, name: "the Hollow", funds: 1300, dead: false },
        );
      }
      return facs;
    },

    // the money: the hall pays a little, the derricks pay the war
    income(scen, f) {
      if (f.dead) return 0;
      let inc = f.hq && !f.hq.ruined ? 2 : 0.5;
      for (const b of scen.world.buildings)
        if (b.kind === "oil" && b.fac === f.i && b.built && !b.ruined) inc += 5;
      return inc;
    },

    tick(scen, dt) {
      for (const f of scen.facs) {
        if (!f || f.i === 0 || f.dead) continue;
        f.thinkT -= dt;
        if (f.thinkT > 0) continue;
        f.thinkT = BAL.THINK;
        this.think(scen, f);
      }
    },

    think(scen, f) {
      const t = scen.t;
      // the hall fell: the nation is done, whatever is still standing
      // fights on its last orders
      const hq = scen.bldsOf(f.i, "hall")[0];
      f.hq = hq || null;
      if (!hq || hq.ruined) {
        f.dead = true;
        return;
      }

      this.defend(scen, f, t);
      this.capture(scen, f, t);
      this.build(scen, f);
      this.produce(scen, f);
      this.wave(scen, f, t);
    },

    /* ---------- answers ---------- */

    defend(scen, f, t) {
      if (!f.hot || t - f.hotT > BAL.DEFEND_T) return;
      const hq = f.hq;
      const dx = f.hot.x - (hq.x + hq.w / 2),
        dy = f.hot.y - (hq.y + hq.h / 2);
      if (dx * dx + dy * dy > BAL.DEFEND_R * BAL.DEFEND_R) return;
      const idle = scen.idleUnits(f.i);
      const go = Math.min(idle.length, 6);
      for (let i = 0; i < go; i++)
        scen.orderAmove(idle[i], f.hot.x + (i % 3) * 30 - 30, f.hot.y + ((i / 3) | 0) * 30 - 15);
    },

    capture(scen, f, _t) {
      // two guns go and stand on a neutral derrick until it is theirs
      const hq = f.hq;
      const d = scen.nearestNeutralDerrick(hq.x + hq.w / 2, hq.y + hq.h / 2, BAL.CAPTURE_R);
      if (!d) return;
      let heading = 0;
      for (const a of scen.agents)
        if (a.st === 4 && a.fac === f.i && a.ord && a.ord.k === "capture" && a.ord.tgt === d)
          heading++;
      if (heading >= 2) return;
      const idle = scen.idleUnits(f.i).filter((a) => !ZS.Units.CAT[a.unit].fly);
      for (let i = 0; i < Math.min(2 - heading, idle.length); i++)
        scen.orderUnit(idle[i], { k: "capture", tgt: d });
    },

    build(scen, f) {
      const day = scen.day;
      const bs = scen.bldsOf(f.i);
      const count = (kind) => {
        let n = 0;
        for (const b of bs) if (b.kind === kind && !b.ruined) n++;
        return n;
      };
      const mix = f.mix;
      const wants = (u) => mix.indexOf(u) >= 0;
      const tryBuild = (kind) => scen.aiBuild(f.i, kind);
      // the factory first — the war is machines, and nothing else makes
      // them. then roofs for the supply, cheap guns at the door, and the
      // heavier works as the days go on
      if (count("foundry") === 0) return tryBuild("foundry");
      if (scen.supMax(f.i) - scen.supUsed(f.i) < 6) tryBuild("hut");
      if (count("gunNest") < 2) tryBuild("gunNest");
      if (day >= 3 && count("turret") < 1) tryBuild("turret");
      if (day >= 3 && count("dock") === 0 && wants("gunboat")) tryBuild("dock");
      if (day >= 4 && count("airfield") === 0 && (wants("helicopter") || wants("fighter")))
        tryBuild("airfield");
      if (day >= 5 && count("foundry") < 2 && wants("tank")) tryBuild("foundry");
    },

    produce(scen, f) {
      for (const b of scen.bldsOf(f.i)) {
        if (b.ruined || !b.built) continue;
        const list = ZS.Roster.TRAIN[b.kind];
        if (!list) continue;
        if ((b.queue || []).length >= BAL.QUEUES) continue;
        // the nation's own taste, filtered to what this building can make
        let id = null;
        for (let k = 0; k < f.mix.length; k++) {
          const cand = f.mix[(f.mixI + k) % f.mix.length];
          if (list.indexOf(cand) >= 0) {
            id = cand;
            f.mixI = (f.mixI + k + 1) % f.mix.length;
            break;
          }
        }
        if (!id) continue;
        if (list.indexOf("gunboat") >= 0 && id !== "gunboat") continue;
        scen.trainUnit(f.i, b, id);
      }
    },

    wave(scen, f, t) {
      if (t - f.lastWave < BAL.WAVE_GAP) return;
      const idle = scen.idleUnits(f.i);
      const need = Math.min(BAL.WAVE_CAP, BAL.WAVE_BASE + scen.day * BAL.WAVE_DAY);
      if (idle.length < need) return;
      // go at whichever enemy stands nearest — often that is another nation
      const foes = foesOf(f);
      let best = null,
        bd = 1e18;
      const hx = f.hq.x + f.hq.w / 2,
        hy = f.hq.y + f.hq.h / 2;
      for (const b of scen.world.buildings) {
        if (b.ruined || foes.indexOf(b.fac) < 0) continue;
        const keep = b.kind === "hall" ? -400 * 400 : 0; // hqs are worth the walk
        const dd =
          (b.x + b.w / 2 - hx) * (b.x + b.w / 2 - hx) +
          (b.y + b.h / 2 - hy) * (b.y + b.h / 2 - hy) +
          keep;
        if (dd < bd) {
          bd = dd;
          best = b;
        }
      }
      if (!best) return;
      const tx = best.x + best.w / 2,
        ty = best.y + best.h / 2;
      const dx = tx - hx,
        dy = ty - hy;
      const m = Math.hypot(dx, dy) || 1;
      const send = idle.slice(0, Math.max(1, idle.length - BAL.HOME_KEEP));
      scen.toastFac(f.i, f.name + " is on the march");
      for (let i = 0; i < send.length; i++) {
        const col = i % 4,
          row = (i / 4) | 0;
        scen.orderAmove(
          send[i],
          tx - (dx / m) * 210 + (col - 1.5) * 40,
          ty - (dy / m) * 210 + (row - 1) * 36,
        );
      }
      // the point of the spear goes straight at the door
      scen.orderAmove(send[0], tx, ty);
      f.lastWave = t;
    },
  };

  ZS.RtsNations = Nations;
})();
