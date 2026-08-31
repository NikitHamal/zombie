/* The war's roster. Everything that fights in this theatre, on any side:
   the modern arms are added here on top of the field catalog in
   js/village/units.js (which keeps its old entries and its painters), and
   the paint each faction wears is decided here too — `ZS.FACPAINT` is what
   the sashes, flags and minimap dots read.

   Nobody fights on foot. The field is machines — scout cars, tanks,
   wings and boats — and the money numbers live here as well: what a unit
   costs in funds, what a building costs, who turns out whom, and how much
   of the army's weight (supply) each of them takes. The scenario owns
   whether you can pay. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  /* ---------- who wears what ---------- */

  // cloth is the sash and the flag, ring the selection circle, dot the
  // minimap. fac 0 is the player; the dead wear no paint at all.
  const FACPAINT = {
    0: { cloth: "#5a7a3a", ring: "rgba(64,96,52,0.95)", dot: "#5a7a3a", name: "the Hollow" },
    1: { cloth: "#b08a3e", ring: "rgba(176,138,62,0.95)", dot: "#b08a3e", name: "the Grange" },
    2: { cloth: "#a04030", ring: "rgba(160,64,48,0.95)", dot: "#a04030", name: "Kell" },
    3: { cloth: "#5a6a7a", ring: "rgba(90,106,122,0.95)", dot: "#5a6a7a", name: "the Rustworks" },
    4: { cloth: "#4a6a86", ring: "rgba(74,106,134,0.95)", dot: "#4a6a86", name: "the Order" },
  };
  ZS.FACPAINT = FACPAINT;

  /* ---------- the modern arms ----------
     Fields the war reads on top of the old ones:
     money  funds it costs
     sup    supply it takes out of the faction's cap
     bld    which building turns it out
     train  seconds to build one
     ap     ignores armour
     vsAir  can reach flyers
     water  lives on the water, not the land */

  const CAT = {
    scout: {
      name: "scout car",
      hp: 120,
      dmg: 7,
      rng: 165,
      rate: 0.32,
      spd: 150,
      shot: "burst",
      armour: 0.2,
      money: 300,
      sup: 2,
      bld: "foundry",
      train: 10,
      desc: "fast, loud, and everywhere before the news is.",
    },
    tank: {
      name: "tank",
      money: 800,
      sup: 4,
      bld: "foundry",
      train: 18,
    },
    helicopter: {
      name: "helicopter",
      money: 900,
      sup: 4,
      bld: "airfield",
      train: 16,
      vsAir: 1,
    },
    fighter: {
      name: "fighter",
      money: 1200,
      sup: 5,
      bld: "airfield",
      train: 20,
      vsAir: 1,
    },
    gunboat: {
      name: "gunboat",
      hp: 260,
      dmg: 24,
      rng: 215,
      rate: 1.2,
      spd: 105,
      shot: "ball",
      armour: 0.3,
      water: 1,
      money: 500,
      sup: 3,
      bld: "dock",
      train: 14,
      desc: "a shallow draft and a gun that has opinions about both banks.",
    },
  };

  // fold the modern arms into the field catalog (the old entries keep
  // their art and their numbers; this only adds and annotates)
  const U = ZS.Units;
  for (const id of Object.keys(CAT)) {
    if (!U.CAT[id]) U.CAT[id] = {};
    Object.assign(U.CAT[id], CAT[id]);
  }
  // the tank and the wings keep their old stats — they were already
  // right, only the money was new
  U.CAT.tank.desc = "iron, treads, and a gun. Walls remember it afterwards.";
  U.CAT.helicopter.name = "helicopter";
  U.CAT.fighter.name = "fighter";

  /* ---------- the painters ---------- */

  function shadow(c, x, y, r, seed, alpha) {
    c.strokeStyle = "rgba(40,35,25," + (alpha || 0.14) + ")";
    c.lineWidth = 1.2;
    ZS.wcirc(c, x, y + 3, r, seed + 3, 1.2);
  }

  const ART = {
    scout(c, a, _t) {
      const s = a.seed;
      shadow(c, a.x, a.y, 12, s, 0.15);
      // four wheels, rolling
      for (let i = 0; i < 4; i++) {
        const wx = a.x - 11 + (i % 2) * 22,
          wy = a.y + 2 + (i > 1 ? 2 : 0);
        c.strokeStyle = "rgba(52,50,44,0.95)";
        c.lineWidth = 1.4;
        ZS.wcirc(c, wx, wy, 3.6, s + 30 + i, 0.4);
      }
      // the hull: a low armoured box with a sloped nose
      c.strokeStyle = "rgba(84,90,74,0.95)";
      c.lineWidth = 1.6;
      ZS.wpoly(
        c,
        [
          { x: a.x - 14, y: a.y - 1 },
          { x: a.x - 11, y: a.y - 9 },
          { x: a.x + 9, y: a.y - 10 },
          { x: a.x + 14, y: a.y - 4 },
          { x: a.x + 13, y: a.y },
          { x: a.x - 13, y: a.y + 1 },
        ],
        s + 40,
        0.5,
        true,
      );
      c.fillStyle = "rgba(96,104,80,0.22)";
      c.fill();
      // the little turret and the gun, turned where the fighting is
      const ca = Math.cos(a.a),
        sa = Math.sin(a.a) * 0.5;
      ZS.wcirc(c, a.x, a.y - 11, 4.6, s + 44, 0.6);
      c.fillStyle = "rgba(96,104,80,0.3)";
      c.fill();
      c.strokeStyle = "rgba(58,56,50,0.95)";
      c.lineWidth = 1.8;
      const kick = a.kick > 0 ? a.kick * 3 : 0;
      ZS.wline(
        c,
        a.x + ca * (3 - kick),
        a.y - 11 + sa * (3 - kick),
        a.x + ca * 15,
        a.y - 11 + sa * 15,
        s + 45,
        0.2,
      );
      // a whip antenna that knows the wind
      c.strokeStyle = "rgba(58,56,50,0.6)";
      c.lineWidth = 1;
      ZS.wline(c, a.x - 10, a.y - 9, a.x - 13, a.y - 22 + Math.sin(a.gait) * 1.4, s + 47, 0.8);
    },

    gunboat(c, a, t) {
      const s = a.seed;
      const bob = Math.sin(t * 1.8 + s) * 1.3;
      const y = a.y + bob;
      // the wake, so the water knows it passed
      c.strokeStyle = "rgba(96,138,166,0.5)";
      c.lineWidth = 1.1;
      ZS.wline(c, a.x - 20, y + 5, a.x - 30, y + 8, s + 1, 1.2);
      ZS.wline(c, a.x - 20, y + 3, a.x - 32, y + 4, s + 2, 1.2);
      // the hull: flat-bottomed, with a bow that means it
      c.strokeStyle = "rgba(74,76,66,0.95)";
      c.lineWidth = 1.7;
      ZS.wpoly(
        c,
        [
          { x: a.x - 20, y: y - 2 },
          { x: a.x - 16, y: y - 8 },
          { x: a.x + 12, y: y - 8 },
          { x: a.x + 22, y: y - 3 },
          { x: a.x + 12, y: y + 3 },
          { x: a.x - 16, y: y + 3 },
        ],
        s + 10,
        0.6,
        true,
      );
      c.fillStyle = "rgba(90,98,84,0.26)";
      c.fill();
      // the waterline scribble
      c.strokeStyle = "rgba(64,102,132,0.55)";
      c.lineWidth = 1;
      ZS.wline(c, a.x - 24, y + 4, a.x + 24, y + 4, s + 14, 1.4);
      // the wheelhouse
      c.strokeStyle = "rgba(74,76,66,0.9)";
      c.lineWidth = 1.3;
      ZS.wpoly(
        c,
        [
          { x: a.x - 12, y: y - 8 },
          { x: a.x - 12, y: y - 15 },
          { x: a.x - 3, y: y - 15 },
          { x: a.x - 3, y: y - 8 },
        ],
        s + 16,
        0.4,
        true,
      );
      c.fillStyle = "rgba(198,182,150,0.3)";
      c.fill();
      // the gun forward, turned where it is looking
      const ca = Math.cos(a.a),
        sa = Math.sin(a.a) * 0.5;
      ZS.wcirc(c, a.x + 7, y - 10, 3.8, s + 20, 0.5);
      c.strokeStyle = "rgba(58,56,50,0.95)";
      c.lineWidth = 2.2;
      const kick = a.kick > 0 ? a.kick * 3 : 0;
      ZS.wline(
        c,
        a.x + 7 + ca * (2 - kick),
        y - 10 + sa * (2 - kick),
        a.x + 7 + ca * 14,
        y - 10 + sa * 14,
        s + 21,
        0.2,
      );
      // the ensign
      const paint = (ZS.FACPAINT && ZS.FACPAINT[a.fac]) || {};
      c.strokeStyle = "rgba(78,68,52,0.9)";
      c.lineWidth = 1.1;
      ZS.wline(c, a.x - 18, y - 7, a.x - 18, y - 19, s + 24, 0.3);
      c.strokeStyle = paint.cloth || "#5a7a3a";
      c.lineWidth = 1.4;
      ZS.wline(c, a.x - 18, y - 18, a.x - 12, y - 16 + bob * 0.4, s + 25, 0.4);
    },
  };
  Object.assign(U.ART, ART);

  /* ---------- the money of it ---------- */

  const BUILD = {
    hut: { money: 150, time: 14, sup: 4, name: "house", desc: "+4 supply · people need roofs" },
    wall: { money: 40, time: 6, name: "wall", desc: "cheap, drags out in a line" },
    barricade: { money: 25, time: 3, name: "barricade", desc: "fast wire and stakes" },
    gate: { money: 90, time: 10, name: "gate", desc: "opens for friends only" },
    turret: { money: 450, time: 22, name: "cannon turret", desc: "long reach · hits the sky too" },
    gunNest: { money: 280, time: 14, name: "gun nest", desc: "cheap, and it does not sleep" },
    foundry: {
      money: 700,
      time: 30,
      sup: 6,
      name: "factory",
      desc: "turns out scout cars and tanks",
    },
    airfield: { money: 900, time: 34, sup: 6, name: "airfield", desc: "turns out wings" },
    dock: {
      money: 500,
      time: 22,
      sup: 4,
      name: "dock",
      desc: "turns out gunboats · needs water near",
    },
    flag: { money: 120, time: 5, name: "outpost flag", desc: "pushes the build line out" },
  };

  const TRAIN = {}; // which building turns out which unit, in menu order
  for (const id of Object.keys(CAT)) {
    const b = CAT[id].bld;
    if (!TRAIN[b]) TRAIN[b] = [];
    TRAIN[b].push(id);
  }

  const Roster = {
    CAT,
    BUILD,
    TRAIN,
    SUP_START: 20, // every faction starts with this much room under arms
    SUP_CAP: 120, // and none of them ever gets more
  };

  ZS.Roster = Roster;
})();
