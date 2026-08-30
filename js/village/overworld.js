/* The Hollow — the valley beyond the clearing.
   The village is one map, but it is not the whole world: out there are
   eight places, and every one of them has something you need and
   something that will try to eat the people you send for it.

   A party is two villagers (or one scout) and a number of days. They
   walk out, they work the site, they walk home — and what happens at the
   site is rolled once, against the party's strength and the site's
   danger. They can come back loaded, come back hurt, come back bitten,
   or not come back at all.

   Nothing here touches the simulation directly. The scenario hands this
   file its people and its stores and asks it to tick. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  // d: minutes of travel one way · danger 0..5 · loot: what a good haul is
  const SITES = [
    {
      id: "farmstead",
      name: "the Alder farmstead",
      kind: "farm",
      d: 42,
      danger: 1,
      desc: "a burnt-out smallholding — the fields went, the cellar didn't",
      loot: { food: 26, wood: 10 },
      seed: "a sack of seed corn (+8% farm yield, forever)",
    },
    {
      id: "quarry",
      name: "the old quarry road",
      kind: "stone",
      d: 55,
      danger: 1,
      desc: "cut stone left stacked where the carters abandoned it",
      loot: { stone: 34, scrap: 4 },
    },
    {
      id: "mill",
      name: "the drowned mill",
      kind: "food",
      d: 70,
      danger: 2,
      desc: "the wheel still turns; the miller's store may be dry",
      loot: { food: 44, wood: 18 },
    },
    {
      id: "chapel",
      name: "the chapel of Saint Wyn",
      kind: "medicine",
      d: 88,
      danger: 2,
      desc: "a stone box in the fields — and a chest of physic inside",
      loot: { food: 16, scrap: 10, cloth: 8 },
      cure: 1,
    },
    {
      id: "manor",
      name: "Vayle manor",
      kind: "scrap",
      d: 115,
      danger: 3,
      desc: "walled, gated, and locked from the inside when it happened",
      loot: { scrap: 26, wood: 24, stone: 18 },
    },
    {
      id: "ashford",
      name: "Ashford",
      kind: "town",
      d: 100,
      danger: 2,
      desc: "a market town behind a palisade — bread for iron, if they like you",
      loot: { scrap: 24, cloth: 8 },
      people: "ashford",
    },
    {
      id: "warrens",
      name: "the Warrens",
      kind: "raiders",
      d: 130,
      danger: 4,
      desc: "a camp cut into the quarry terraces — going there is a fight, not an errand",
      loot: { arms: 12, scrap: 18, food: 20 },
      people: "warrens",
    },
    {
      id: "camp",
      name: "the army camp",
      kind: "arms",
      d: 140,
      danger: 4,
      desc: "tents in rows, a cookhouse, an armoury — and the whole garrison",
      loot: { scrap: 40, arms: 14 },
    },
    {
      id: "crossing",
      name: "the river crossing",
      kind: "trade",
      d: 165,
      danger: 3,
      desc: "a broken bridge, and on the far side: people, maybe",
      loot: { wood: 40, stone: 30, food: 20 },
      recruit: 2,
    },
    {
      id: "city",
      name: "the dead city",
      kind: "city",
      d: 235,
      danger: 5,
      desc: "you can see the smoke from the ridge. Everything is in there.",
      loot: { scrap: 90, arms: 30, food: 40, cloth: 20 },
    },
  ];

  const TRAITS = {
    scout: { name: "scout", spd: 1.35, fight: 0.7 },
  };

  const Overworld = {
    SITES,

    create(seed) {
      const rng = ZS.rng32((seed | 0) ^ 0x2c17);
      const st = {
        seed: seed | 0,
        sites: SITES.map((s) => ({
          id: s.id,
          seen: 0, // 0 unknown · 1 rumoured · 2 scouted · 3 worked
          taken: 0, // how many times it has been worked
          jitter: rng(),
          best: 0,
        })),
        parties: [],
        next: 1,
        log: [],
      };
      // the two nearest places are known from the start
      const near = SITES.map((s, i) => [s.d, i])
        .sort((a, b) => a[0] - b[0])
        .slice(0, 2);
      for (const n of near) st.sites[n[1]].seen = 1;
      return st;
    },

    def(id) {
      for (const s of SITES) if (s.id === id) return s;
      return null;
    },
    site(st, id) {
      for (const s of st.sites) if (s.id === id) return s;
      return null;
    },

    // the round trip, in seconds of play: the farmstead is an afternoon,
    // the dead city is most of a week
    travelTime(st, def, spd) {
      return (def.d * 2.2) / (spd || 1);
    },

    // can this party go: two free adults (or one, for a scout)
    canSend(st, scen, id, scouting) {
      const def = this.def(id);
      if (!def) return { ok: false, err: "no such place" };
      const s = this.site(st, id);
      if (!s || s.seen < 1) return { ok: false, err: "nobody knows where that is" };
      const free = scen.partyPool(scouting ? 1 : 2);
      if (free.length < (scouting ? 1 : 2)) {
        if (scouting) return { ok: false, err: "nobody can be spared" };
        return { ok: false, err: "it takes two, and nobody can be spared" };
      }
      if (scen.res.food < (scouting ? 4 : 10))
        return { ok: false, err: "not enough food for the road" };
      return { ok: true, members: free };
    },

    send(st, scen, id, scouting) {
      const chk = this.canSend(st, scen, id, scouting);
      if (!chk.ok) return chk;
      const def = this.def(id);
      const members = chk.members;
      scen.res.food -= scouting ? 4 : 10;
      const spd = scouting ? TRAITS.scout.spd : 1;
      const out = this.travelTime(st, def, spd) / 2;
      const work = scouting ? 6 : 14 + def.danger * 4;
      const p = {
        id: st.next++,
        site: id,
        scouting: !!scouting,
        members,
        phase: "out", // out → work → back
        t: out,
        total: out * 2 + work,
        out,
        work,
        danger: def.danger,
        loot: null,
        loss: [],
      };
      for (const a of members) scen.sendAway(a);
      st.parties.push(p);
      this.say(st, (scouting ? "a scout rides for " : "a party sets out for ") + def.name, scen);
      return { ok: true, p };
    },

    say(st, txt, scen) {
      st.log.unshift({ day: scen ? scen.day : 0, txt });
      if (st.log.length > 40) st.log.length = 40;
      if (scen && scen.logLine) scen.logLine(txt);
    },

    // one tick: move the parties along, and roll the site when they arrive
    tick(st, dt, scen) {
      for (let i = st.parties.length - 1; i >= 0; i--) {
        const p = st.parties[i];
        p.t -= dt;
        if (p.t > 0) continue;
        if (p.phase === "out") {
          p.phase = "work";
          p.t = p.work;
          continue;
        }
        if (p.phase === "work") {
          p.loot = this.rollSite(st, p, scen);
          p.phase = "back";
          p.t = p.out;
          continue;
        }
        // home
        this.arrive(st, p, scen);
        st.parties.splice(i, 1);
      }
    },

    // what the party finds, and what finds the party
    rollSite(st, p, scen) {
      const def = this.def(p.site);
      const s = this.site(st, p.site);
      s.seen = p.scouting ? 2 : 3;
      if (p.scouting) return { food: 0 };
      const loot = {};
      // a worked-out site gives less each time
      const fade = Math.max(0.3, 1 - s.taken * 0.18);
      for (const k in def.loot)
        loot[k] = Math.round(def.loot[k] * fade * (0.7 + Math.random() * 0.6));
      // the fight: party strength against the site's danger
      let strength = 0;
      for (const a of p.members) {
        strength += (a.kin && a.kin.trait === "brave" ? 1.3 : 1) * (a.job === "guard" ? 1.6 : 1);
        strength += scen.weaponTier ? scen.weaponTier() * 0.35 : 0;
      }
      const risk = ZS.clamp(def.danger * 0.42 - strength * 0.2, 0.04, 0.92);
      const roll = Math.random();
      p.risk = risk;
      if (roll < risk * 0.42) {
        // mauled: somebody is bitten, maybe somebody is lost
        const who = p.members[(Math.random() * p.members.length) | 0];
        p.loss.push(who);
        if (Math.random() < 0.5) p.bitten = who.name;
        if (Math.random() < 0.45 * risk) {
          const who2 = p.members[(Math.random() * p.members.length) | 0];
          if (who2 !== who) p.loss.push(who2);
        }
        for (const k in loot) loot[k] = Math.round(loot[k] * 0.55);
        p.bad = true;
      }
      s.taken++;
      if (def.seed && !s.seeded) {
        s.seeded = 1;
        loot.seed = 1;
      }
      if (def.cure && scen.done && !scen.done.medicine && Math.random() < 0.5) loot.cure = 1;
      if (def.recruit && Math.random() < 0.5) loot.people = 1;
      // a settlement: you have been there, and now they know you too
      if (def.people) {
        loot.met = def.people;
        if (def.people === "warrens" && !p.bad && Math.random() < 0.45) loot.cleared = 1;
      }
      return loot;
    },

    arrive(st, p, scen) {
      const def = this.def(p.site);
      for (const a of p.members) scen.bringBack(a, p.loss.indexOf(a) >= 0, p.bitten === a.name);
      const got = [];
      if (p.loot)
        for (const k in p.loot) {
          const n = p.loot[k];
          if (!n) continue;
          if (k === "seed") {
            scen.bonus.farm = (scen.bonus.farm || 0) + 0.08;
            got.push("seed corn");
            continue;
          }
          if (k === "cure") {
            scen.grantResearch("medicine");
            got.push("a chest of physic");
            continue;
          }
          if (k === "people") {
            scen.joinVillager(true);
            got.push("a stranger, walking");
            continue;
          }
          if (k === "arms") {
            scen.res.scrap += n;
            scen.res.arms = (scen.res.arms || 0) + n;
            got.push(n + " arms");
            continue;
          }
          if (k === "cloth") {
            scen.res.cloth = (scen.res.cloth || 0) + n;
            got.push(n + " cloth");
            continue;
          }
          if (k === "met") {
            if (ZS.Factions && scen.fac) {
              const f = ZS.Factions.get(scen.fac, n);
              if (f) {
                f.met = 2;
                f.opinion = ZS.clamp(f.opinion + (n === "ashford" ? 0.06 : -0.04), 0, 1);
              }
            }
            continue;
          }
          if (k === "cleared") {
            if (ZS.Factions && scen.fac) {
              const f = ZS.Factions.get(scen.fac, "warrens");
              if (f && !f.cleared) {
                f.cleared = 1;
                f.opinion = 0;
                scen.fac.raidIn = 0;
                got.push("the camp is broken");
                if (ZS.Chronicle)
                  ZS.Chronicle.add(scen, "the Warrens are broken — no more raids", "people");
                if (ZS.VillageUI)
                  ZS.VillageUI.toast("the Warrens are broken. They will not come again.");
              }
            }
            continue;
          }
          scen.res[k] = (scen.res[k] || 0) + n;
          got.push(n + " " + k);
        }
      if (p.loss.length) {
        const names = p.loss.map((a) => a.name).join(" and ");
        this.say(st, (p.bad ? "the dead found them: " : "") + names + " did not come back", scen);
        if (scen.onExpeditionLoss) scen.onExpeditionLoss(p.loss);
      }
      this.say(
        st,
        (p.scouting ? "the scout returns from " : "the party comes home from ") +
          def.name +
          (got.length ? " — " + got.join(", ") : " — empty-handed"),
        scen,
      );
      if (scen.onExpeditionReturn) scen.onExpeditionReturn(p, got);
    },

    // how far along a party is, for the panel
    progress(p) {
      return ZS.clamp(1 - p.t / p.total, 0, 1);
    },
  };

  ZS.Overworld = Overworld;
})();
