/* The Hollow — the record.
   Three slots, an autosave at every dawn, and the ledger of the run: what
   was built, who was lost, which winters nearly took the village. A game
   you can lose is a game you want to remember, and a game you can lose
   is a game you want to be able to walk away from and come back to. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const PREFIX = "zs.hollow";
  const SLOTS = 3;

  function read(key) {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }
  function write(key, obj) {
    try {
      localStorage.setItem(key, JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  /* ---------- the seed: which valley this is ---------- */
  // Kept in the browser, so a refresh — or a saved game — comes back to the
  // same ground. Every save carries the seed of the valley it was played in,
  // and loading one brings that valley back with it.
  const SEED_KEY = PREFIX + ".seed";

  const Seed = {
    KEY: SEED_KEY,

    get(params) {
      const url = params ? parseInt(params.get("seed"), 10) | 0 : 0;
      if (url) {
        this.keep(url);
        return url;
      }
      const kept = this.kept();
      if (kept) return kept;
      const fresh = (Math.random() * 0x7fffffff) | 0 || 1;
      this.keep(fresh);
      return fresh;
    },

    kept() {
      try {
        return parseInt(localStorage.getItem(SEED_KEY), 10) | 0 || 0;
      } catch {
        return 0;
      }
    },

    keep(seed) {
      try {
        localStorage.setItem(SEED_KEY, String(seed | 0));
        return true;
      } catch {
        return false;
      }
    },

    // a whole new valley: a new seed, and nothing left of the old run
    newValley() {
      const seed = (Math.random() * 0x7fffffff) | 0 || 1;
      this.keep(seed);
      try {
        localStorage.setItem(PREFIX + ".v1", "");
        localStorage.removeItem(PREFIX + ".v1");
        localStorage.removeItem(PREFIX + ".slot0");
      } catch {}
      location.reload();
    },
  };

  const Chronicle = {
    SLOTS,

    slotKey(n) {
      return PREFIX + ".slot" + n;
    },

    // what the slot list shows: day, people, and when it was written
    slots() {
      const out = [];
      for (let i = 1; i <= SLOTS; i++) {
        const s = read(this.slotKey(i));
        out.push({
          n: i,
          used: !!s,
          day: s ? s.day : 0,
          pop: s && s.pop ? s.pop.length : 0,
          season: s ? s.season : "",
          when: s && s.savedAt ? new Date(s.savedAt).toLocaleDateString() : "",
        });
      }
      return out;
    },

    save(scen, n) {
      const data = scen.serialize();
      data.savedAt = Date.now();
      const key = n ? this.slotKey(n) : PREFIX + ".auto";
      const ok = write(key, data);
      if (ok) this.add(scen, "saved" + (n ? " to slot " + n : ""), "note");
      return ok;
    },

    autosave(scen) {
      return this.save(scen, 0);
    },

    peek(n) {
      return read(this.slotKey(n));
    },

    loadSlot(n) {
      const d = read(this.slotKey(n));
      if (!d) return false;
      // the same ground, or the buildings will stand in the wrong places
      if (d.seed) Seed.keep(d.seed);
      write(PREFIX + ".slot0", d); // main.js/ scenario reads the live save
      localStorage.setItem(PREFIX + ".v1", JSON.stringify(d));
      return true;
    },

    clear(n) {
      try {
        localStorage.removeItem(this.slotKey(n));
        return true;
      } catch {
        return false;
      }
    },

    /* ---------- the ledger ---------- */

    add(scen, txt, kind) {
      if (!scen.chron) scen.chron = [];
      scen.chron.unshift({ day: scen.day, txt, kind: kind || "note" });
      if (scen.chron.length > 120) scen.chron.length = 120;
    },

    // the headline entries the dawn card and the panel care about
    entries(scen, n) {
      const list = scen.chron || [];
      return n ? list.slice(0, n) : list;
    },

    // how many of the lost, for the shrine's candles
    lost(scen) {
      return (scen.chron || []).filter((e) => e.kind === "death").length;
    },
  };

  ZS.Chronicle = Chronicle;
  ZS.Seed = Seed;
})();
