/* The Hollow — everything else that can go wrong.
   The dead are only one way to lose a village. Fire takes a roof in an
   afternoon; sickness spreads through a hall full of people sleeping
   shoulder to shoulder; rats eat a winter's grain; cold eats the people;
   and despair — the quiet one — empties a village from the inside.

   Each hazard is the same shape: it starts for a reason, it grows on a
   clock, it takes something, and there is something you can do about it. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const BAL = {
    FIRE_SPREAD: 26, // seconds before a fire tries the next roof
    FIRE_DPS: 3.4, // structure hp per second, per fire
    FIRE_DOUSE: 2.6, // a villager's bucket, per second
    SICK_CHANCE: 0.04, // per villager, per dawn (before modifiers)
    SICK_DAYS: 3, // days it runs
    SICK_DPS: 0.15, // a fever takes the strength, not the life
    SICK_DEATH: 0.02, // per sick villager per day, without physic
    RAT_EAT: 0.9, // food per day per point of rats
    DESPAIR_LEAVE: 0.07, // chance a broken villager walks out at dawn
    WINTER_WOOD: 1.6, // firewood per head per day through the winter
    FROST_DPS: 0.7,
    FEAST_FOOD: 18,
  };

  const Hazards = {
    BAL,

    create() {
      return {
        fire: [], // { s, t, smoke }
        sick: 0, // how many are ill
        rats: 0, // 0..1
        despair: 0, // 0..1
        cold: 0, // 0..1 — how badly the winter is biting
        spreadT: 0,
        feastT: 0, // days until a feast may be held again
        last: "", // the newest thing that went wrong
      };
    },

    /* ---------- the dawn roll ---------- */

    daily(scen) {
      const h = scen.haz;
      h.feastT = Math.max(0, h.feastT - 1);

      // --- winter: the burn and the bite ---
      const wint = scen.season && scen.season.id === "winter" ? 1 : 0;
      if (wint) {
        const need = Math.round(
          scen.villagers().length * BAL.WINTER_WOOD * (scen.season.upkeep || 1),
        );
        scen.winterWood = need;
        if (scen.res.wood >= need) {
          scen.res.wood -= need;
          h.cold = Math.max(0, h.cold - 0.5);
        } else {
          scen.res.wood = 0;
          h.cold = ZS.clamp(h.cold + 0.4, 0, 1);
          if (scen.logLine)
            scen.logLine("the wood ran out — " + need + " logs a day to keep the cold out");
          scen.alarm("cold", "the cold is in the hall");
        }
      } else {
        scen.winterWood = 0;
        h.cold = Math.max(0, h.cold - 0.35);
      }

      // --- rats: grain, and whatever they brought with them ---
      const granary = scen.count("granary");
      const dogs = scen.count("kennel");
      let ratChance = 0.1 + (scen.res.food > 180 ? 0.12 : 0) - granary * 0.07 - dogs * 0.04;
      if (scen.season && scen.season.id === "autumn") ratChance += 0.08;
      if (Math.random() < ratChance) h.rats = ZS.clamp(h.rats + 0.2 + Math.random() * 0.2, 0, 1);
      else h.rats = Math.max(0, h.rats - 0.14);
      if (h.rats > 0) {
        const eat = Math.round(h.rats * BAL.RAT_EAT * scen.villagers().length * 0.4);
        if (eat > 0) scen.res.food = Math.max(0, scen.res.food - eat);
      }

      // --- sickness ---
      const crowd = scen.villagers().length / Math.max(1, scen.popCap());
      let sickChance = BAL.SICK_CHANCE * (1 + h.rats * 1.6) * (0.6 + crowd);
      const infirm = scen.has("infirm") ? 1 : 0;
      if (infirm) sickChance *= 0.55;
      if (scen.done && scen.done.medicine) sickChance *= 0.5;
      if (scen.season && scen.season.id === "winter") sickChance *= 1.3;
      const list = scen.villagers();
      for (const a of list) {
        if (a.sick > 0) continue;
        if (Math.random() < sickChance) this.infect(scen, a);
      }
      // the course of the illness
      for (const a of list) {
        if (!a.sick) continue;
        a.sick -= 1;
        if (a.sick <= 0) {
          a.sick = 0;
          if (scen.logLine) scen.logLine(a.name + " is on their feet again");
        } else if (Math.random() < BAL.SICK_DEATH * (infirm ? 0.4 : 1)) {
          a.hp = 0;
          a.sick = 0;
          if (scen.logLine) scen.logLine(a.name + " died in the night, burning with fever");
          scen.killVillager(a, "fever");
        }
      }

      // --- despair: the village empties from the inside ---
      const morale = scen.morale === undefined ? 0.6 : scen.morale;
      if (morale < 0.34) h.despair = ZS.clamp(h.despair + 0.2, 0, 1);
      else if (morale < 0.5) h.despair = ZS.clamp(h.despair + 0.08, 0, 1);
      else h.despair = Math.max(0, h.despair - 0.18);
      if (h.despair > 0.5) {
        for (const a of list) {
          if (a.kin && a.kin.child) continue;
          if (a.kin && a.kin.morale < 0.22 && Math.random() < BAL.DESPAIR_LEAVE * h.despair) {
            this.leave(scen, a);
            break; // one a day is enough heartbreak
          }
        }
      }

      // --- fire: storms, and the careless ---
      let fireChance = 0.012;
      if (scen.weather && scen.weather.id === "storm") fireChance += 0.05;
      if (scen.season && scen.season.id === "summer" && scen.weather && scen.weather.id === "clear")
        fireChance += 0.02;
      const weak = scen.world.buildings.filter((b) => b.built && b.hp < b.maxHp * 0.3).length;
      fireChance += weak * 0.006;
      if (scen.weather && scen.weather.id === "rain") fireChance *= 0.15;
      if (Math.random() < fireChance) {
        const cands = scen.world.buildings.filter(
          (b) =>
            b.built &&
            b.kind !== "wall" &&
            b.kind !== "barricade" &&
            b.kind !== "farm" &&
            !b.ruined,
        );
        if (cands.length)
          this.ignite(scen, cands[(Math.random() * cands.length) | 0], "a spark caught");
      }
    },

    /* ---------- starting and stopping them ---------- */

    ignite(scen, s, why) {
      if (!s || s.burning) return;
      const h = scen.haz;
      s.burning = 1;
      h.fire.push({ s, i: 0.5, seed: Math.random() * 997 });
      h.spreadT = BAL.FIRE_SPREAD;
      h.last = why || "fire";
      scen.alarm("fire", (s.name || s.kind) + " is alight");
      if (scen.logLine) scen.logLine(why + " — the " + (s.name || s.kind) + " is burning");
      if (scen.onFire) scen.onFire(s);
    },

    infect(scen, a) {
      if (a.sick) return;
      a.sick = BAL.SICK_DAYS;
      scen.alarm("sick", a.name + " has taken to their bed");
      if (scen.logLine) scen.logLine(a.name + " is sick");
      if (scen.onSick) scen.onSick(a);
    },

    leave(scen, a) {
      if (scen.logLine) scen.logLine(a.name + " walked out at dawn and did not look back");
      scen.alarm("despair", a.name + " has gone");
      if (scen.onLeave) scen.onLeave(a);
    },

    // the player's answer to despair: a hot meal and a night off
    feast(scen) {
      const h = scen.haz;
      if (h.feastT > 0) return { ok: false, err: "the village feasted only yesterday" };
      if (scen.res.food < BAL.FEAST_FOOD)
        return { ok: false, err: "it takes " + BAL.FEAST_FOOD + " food to feed everyone" };
      scen.res.food -= BAL.FEAST_FOOD;
      h.feastT = 2;
      for (const a of scen.villagers()) {
        if (a.kin) a.kin.morale = Math.min(1, a.kin.morale + 0.26);
        a.hp = Math.min(a.maxHp, a.hp + 8);
      }
      h.despair = Math.max(0, h.despair - 0.5);
      scen.grief = Math.max(0, (scen.grief || 0) - 0.3);
      if (scen.logLine) scen.logLine("a feast in the hall — the first laughing in days");
      return { ok: true };
    },

    /* ---------- every frame ---------- */

    tick(scen, dt) {
      const h = scen.haz;
      // --- fire ---
      if (h.fire.length) {
        const rain = scen.weather && scen.weather.wet ? 0.45 : 1;
        for (let i = h.fire.length - 1; i >= 0; i--) {
          const f = h.fire[i];
          const s = f.s;
          if (!s || s.hp <= 0 || scen.world.buildings.indexOf(s) < 0) {
            h.fire.splice(i, 1);
            continue;
          }
          // buckets: every villager at the fire knocks it back
          let douse = 0;
          for (const a of scen.villagers())
            if (a.tgt && a.tgt.sub === "douse" && a.tgt.o === s) douse++;
          f.i += dt * (0.05 + (douse ? -BAL.FIRE_DOUSE * douse * 0.06 : 0)) * rain;
          if (f.i < 0) f.i = 0;
          if (f.i > 1.4) f.i = 1.4;
          if (douse && f.i <= 0.02) {
            s.burning = 0;
            h.fire.splice(i, 1);
            if (scen.logLine) scen.logLine("the fire in the " + (s.name || s.kind) + " is out");
            continue;
          }
          scen._damageStruct(s, BAL.FIRE_DPS * dt * f.i * rain);
          if (s.hp <= 0 && s.built) {
            s.burning = 0;
            h.fire.splice(i, 1);
            if (scen.onBurnedDown) scen.onBurnedDown(s);
          }
        }
        // spread
        h.spreadT -= dt;
        if (h.spreadT <= 0 && h.fire.length) {
          h.spreadT = BAL.FIRE_SPREAD;
          const f = h.fire[(Math.random() * h.fire.length) | 0];
          let best = null,
            bd = 130 * 130;
          for (const b of scen.world.buildings) {
            if (b === f.s || !b.built || b.burning || b.kind === "wall" || b.kind === "farm")
              continue;
            const dx = b.x + b.w / 2 - (f.s.x + f.s.w / 2),
              dy = b.y + b.h / 2 - (f.s.y + f.s.h / 2);
            const d = dx * dx + dy * dy;
            if (d < bd) {
              bd = d;
              best = b;
            }
          }
          if (best && Math.random() < 0.55) this.ignite(scen, best, "the fire spread");
        }
      }
      // --- sickness and cold take their cut ---
      const list = scen.villagers();
      for (const a of list) {
        if (a.sick > 0) a.hp -= BAL.SICK_DPS * dt;
        if (h.cold > 0.2 && scen.phase === "night") a.hp -= BAL.FROST_DPS * h.cold * dt;
        if (a.hp <= 0) scen.killVillager(a, a.sick > 0 ? "fever" : "cold");
      }
    },

    /* ---------- what the panel says ---------- */

    alerts(scen) {
      const h = scen.haz;
      const out = [];
      if (h.fire.length)
        out.push(["fire", h.fire.length + (h.fire.length > 1 ? " fires" : " fire") + " burning"]);
      if (h.sick) out.push(["sick", h.sick + " sick"]);
      if (h.rats > 0.3) out.push(["rats", "rats in the grain"]);
      if (h.cold > 0.2) out.push(["cold", "the hall is freezing"]);
      if (h.despair > 0.4) out.push(["despair", "the village is losing heart"]);
      return out;
    },

    /* ---------- drawing the fire ---------- */

    draw(c, scen, t) {
      const h = scen.haz;
      for (const f of h.fire) {
        const s = f.s;
        if (!s) continue;
        const cx = s.x + s.w / 2,
          cy = s.y + s.h / 2;
        // the glow
        if (ZS.Perf && ZS.Perf.glow) {
          const g = c.createRadialGradient(cx, cy - 10, 6, cx, cy - 10, 110 * f.i);
          g.addColorStop(0, "rgba(226,132,44," + (0.2 * f.i).toFixed(3) + ")");
          g.addColorStop(1, "rgba(226,132,44,0)");
          c.fillStyle = g;
          c.beginPath();
          c.arc(cx, cy - 10, 110 * f.i, 0, 7);
          c.fill();
        }
        // flames licking out of the roof
        const n = 2 + Math.round(f.i * 4);
        for (let i = 0; i < n; i++) {
          const px = s.x + 8 + ZS.hash(f.seed + i * 3.3) * (s.w - 16);
          const py = s.y + 6 + ZS.hash(f.seed + i * 7.7) * (s.h - 14);
          const k = (t * 1.6 + i * 0.4) % 1;
          c.strokeStyle = "rgba(214,120,40," + (0.85 * (1 - k)).toFixed(2) + ")";
          c.lineWidth = 2;
          ZS.wline(c, px, py, px + ZS.jit(f.seed + i) * 3, py - 14 * f.i - k * 12, f.seed + i, 1.4);
          c.strokeStyle = "rgba(236,196,90," + (0.7 * (1 - k)).toFixed(2) + ")";
          c.lineWidth = 1.2;
          ZS.wline(
            c,
            px + 2,
            py - 2,
            px + 2 + ZS.jit(f.seed + i + 9) * 2,
            py - 8 * f.i - k * 8,
            f.seed + i + 5,
            1,
          );
        }
        // smoke
        c.fillStyle = "rgba(70,64,58,0.16)";
        for (let i = 0; i < 5; i++) {
          const k = (t * 0.3 + i * 0.2 + ZS.hash(f.seed + i)) % 1;
          c.beginPath();
          c.arc(cx + Math.sin(i * 2 + t) * 8 + k * 10, s.y - k * 60, 5 + k * 14, 0, 7);
          c.fill();
        }
      }
    },
  };

  ZS.Hazards = Hazards;
})();
