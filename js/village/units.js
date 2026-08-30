/* The Hollow — the field.
   Thirteen things that fight, and one that carries, in five ages: from a
   farmer with a sharpened stick to a machine gunner, a tank, and a fighter
   that the dead cannot reach at all.

   The roster is data (`CAT`), the looks are art (`ART`), and `render`
   draws one of them with its health, its colours and its muzzle flash.
   The rules for training, ordering and paying for them live in army.js.

   Every shape is drawn with the sketch primitives, seeded off the unit's
   own `a.seed`, so it boils with the rest of the world. Nothing here
   allocates per frame. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  /* ---------- the roster ----------
     hp   how long it stands
     dmg  one hit
     rng  how far it reaches (melee ~30, bows ~200, powder ~260, guns ~330)
     rate seconds between hits
     spd  px/s on the march
     crew how many beds it takes out of the army's cap
     eat  food a day, per unit
     cost w = wood · s = stone · c = scrap · a = arms
     fly  true → it ignores walls, water and the dead's hands
     shot what the muzzle does: "melee" · "arrow" · "ball" · "shell" · "burst" · "bomb" */

  const CAT = {
    cart: {
      name: "supply cart",
      age: "manor",
      hp: 80,
      dmg: 0,
      rng: 0,
      rate: 0,
      spd: 66,
      crew: 1,
      eat: 0.6,
      cost: { w: 22, s: 2, c: 4 },
      haul: 60,
      desc: "carries sixty · it does not fight, it keeps the army in the field",
    },
    militia: {
      name: "militia",
      age: "refuge",
      hp: 46,
      dmg: 9,
      rng: 26,
      rate: 1,
      spd: 84,
      crew: 1,
      eat: 0.8,
      cost: { w: 8, c: 1 },
      shot: "melee",
      desc: "a neighbour with a sharpened stick. Better than nothing, and there are a lot of neighbours.",
    },
    spearman: {
      name: "spearman",
      age: "refuge",
      hp: 64,
      dmg: 15,
      rng: 38,
      rate: 1.05,
      spd: 78,
      crew: 1,
      eat: 1,
      cost: { w: 10, s: 2, c: 2 },
      shot: "melee",
      bonus: { mounted: 1.5 },
      desc: "a long stick and the training to hold it level. Horsemen hate it.",
    },
    archer: {
      name: "archer",
      age: "manor",
      hp: 52,
      dmg: 13,
      rng: 200,
      rate: 1.15,
      spd: 80,
      crew: 1,
      eat: 1,
      cost: { w: 12, c: 3 },
      shot: "arrow",
      desc: "kills from a distance, which is the whole point of a wall.",
    },
    knight: {
      name: "knight",
      age: "manor",
      hp: 132,
      dmg: 23,
      rng: 30,
      rate: 1.1,
      spd: 70,
      crew: 1,
      eat: 2.2,
      cost: { w: 18, s: 6, c: 10, a: 6 },
      shot: "melee",
      armour: 0.34,
      desc: "plate from head to knee. Slow, expensive, and very hard to put down.",
    },
    lancer: {
      name: "lancer",
      age: "manor",
      hp: 98,
      dmg: 21,
      rng: 42,
      rate: 1,
      spd: 138,
      crew: 1,
      eat: 1.8,
      cost: { w: 16, s: 2, c: 6, a: 4 },
      shot: "melee",
      mounted: 1,
      desc: "a spearman on a horse. Twice the reach, three times the speed.",
    },
    knightRider: {
      name: "mounted knight",
      age: "manor",
      hp: 162,
      dmg: 29,
      rng: 34,
      rate: 1.15,
      spd: 120,
      crew: 1,
      eat: 3,
      cost: { w: 22, s: 8, c: 14, a: 10 },
      shot: "melee",
      mounted: 1,
      armour: 0.3,
      desc: "a knight who arrives before you have finished being afraid.",
    },
    gunner: {
      name: "musketeer",
      age: "forge",
      hp: 64,
      dmg: 27,
      rng: 260,
      rate: 1.5,
      spd: 76,
      crew: 1,
      eat: 1.6,
      cost: { w: 10, c: 8, a: 8 },
      shot: "ball",
      desc: "powder that stays dry. One shot, and then a long minute of loading.",
    },
    cannon: {
      name: "cannon",
      age: "forge",
      hp: 92,
      dmg: 48,
      rng: 330,
      rate: 3.2,
      spd: 44,
      crew: 2,
      eat: 2.6,
      cost: { w: 24, s: 10, c: 18, a: 14 },
      shot: "shell",
      splash: 46,
      siege: 2.2,
      desc: "throws iron further than anyone can see. Walls hate it. So do crowds.",
    },
    machinegun: {
      name: "machine gun team",
      age: "foundry",
      hp: 72,
      dmg: 15,
      rng: 240,
      rate: 0.3,
      spd: 70,
      crew: 2,
      eat: 2,
      cost: { w: 10, c: 16, a: 16 },
      shot: "burst",
      desc: "a belt, a bipod, and two people who have learned to work the bolt together.",
    },
    tank: {
      name: "tank",
      age: "foundry",
      hp: 340,
      dmg: 42,
      rng: 210,
      rate: 1.6,
      spd: 62,
      crew: 3,
      eat: 4,
      cost: { w: 30, s: 20, c: 30, a: 30 },
      shot: "shell",
      splash: 40,
      armour: 0.55,
      siege: 2.6,
      crush: 1,
      desc: "iron, treads, and a gun. It goes through a palisade the way you go through a door.",
    },
    helicopter: {
      name: "helicopter",
      age: "sky",
      hp: 220,
      dmg: 21,
      rng: 250,
      rate: 0.28,
      spd: 150,
      crew: 3,
      eat: 4.5,
      cost: { w: 20, s: 10, c: 40, a: 34 },
      shot: "burst",
      fly: 1,
      desc: "hangs over the wood and hoses it down. Nothing down there can touch it.",
    },
    fighter: {
      name: "fighter",
      age: "sky",
      hp: 190,
      dmg: 58,
      rng: 300,
      rate: 2.4,
      spd: 240,
      crew: 3,
      eat: 5,
      cost: { w: 26, s: 16, c: 46, a: 40 },
      shot: "bomb",
      splash: 62,
      siege: 3,
      fly: 1,
      desc: "one pass, one stick of bombs, and a gap in the horde you could walk a cart through.",
    },
  };

  // the order they appear in the panel, and the order they are trained in
  const ORDER = [
    "cart",
    "militia",
    "spearman",
    "archer",
    "knight",
    "lancer",
    "knightRider",
    "gunner",
    "cannon",
    "machinegun",
    "tank",
    "helicopter",
    "fighter",
  ];

  /* ==================== the art ==================== */

  const HAND = '"Segoe Script","Bradley Hand","Comic Sans MS",cursive';

  // ink, with a sash of the village green or the enemy red
  function kit(a) {
    return a.foe
      ? { ink: "rgba(58,52,44,0.92)", cloth: "#a04030", steel: "rgba(104,104,112,0.9)" }
      : { ink: "rgba(46,42,34,0.92)", cloth: "#5a7a3a", steel: "rgba(112,116,124,0.9)" };
  }

  function shadow(c, x, y, r, seed, alpha) {
    c.strokeStyle = "rgba(40,35,25," + (alpha || 0.14) + ")";
    c.lineWidth = 1.2;
    ZS.wcirc(c, x, y + 3, r, seed + 3, 1.2);
  }

  // two legs, marching: the bob is the whole animation
  function march(c, a, t, x, y, s, L) {
    const g = Math.sin(a.gait) * 3.4 * (a.move > 8 ? 1 : 0.25);
    c.strokeStyle = kit(a).ink;
    c.lineWidth = 1.5;
    c.lineCap = "round";
    ZS.wline(c, x, y - 4, x + g, y + L, s + 11, 1.1);
    ZS.wline(c, x, y - 4, x - g, y + L, s + 17, 1.1);
    return g;
  }

  // a body: shoulders, head, and one arm doing something
  function body(c, a, x, y, s, opts) {
    const k = kit(a);
    const o = opts || {};
    const lean = o.lean || 0;
    c.strokeStyle = k.ink;
    c.lineWidth = 1.6;
    // torso
    ZS.wline(c, x + lean * 0.3, y - 14, x, y - 2, s + 23, 0.9);
    // head, with a helmet if it is wearing one
    ZS.wcirc(c, x + lean * 0.4, y - 19, 4.4, s + 29, 0.7);
    if (o.helm) {
      c.lineWidth = 1.3;
      ZS.wline(c, x + lean * 0.4 - 5, y - 20, x + lean * 0.4 + 5, y - 20, s + 31, 0.4);
      ZS.wline(c, x + lean * 0.4 - 5, y - 20, x + lean * 0.4 - 4, y - 23, s + 32, 0.4);
      ZS.wline(c, x + lean * 0.4 + 5, y - 20, x + lean * 0.4 + 4, y - 23, s + 33, 0.4);
    }
    // the sash, so you can tell whose they are
    c.strokeStyle = k.cloth;
    c.lineWidth = 1.6;
    ZS.wline(c, x - 4 + lean * 0.3, y - 10, x + 4 + lean * 0.3, y - 12, s + 37, 0.4);
    return { shx: x + lean * 0.3, shy: y - 13, hx: x + lean * 0.4, hy: y - 19 };
  }

  function arm(c, a, s, from, ang, len, col, wide) {
    const k = kit(a);
    c.strokeStyle = col || k.ink;
    c.lineWidth = wide || 1.4;
    c.lineCap = "round";
    ZS.wline(
      c,
      from.shx,
      from.shy,
      from.shx + Math.cos(ang) * len,
      from.shy + Math.sin(ang) * len * 0.6,
      s,
      0.4,
    );
    return {
      x: from.shx + Math.cos(ang) * len,
      y: from.shy + Math.sin(ang) * len * 0.6,
    };
  }

  // a weapon held at an angle; `swing` is the attack animation
  function held(c, a, s, from, ang, len, kind) {
    const k = kit(a);
    const tip = arm(c, a, s, from, ang, len);
    if (kind === "spear") {
      c.strokeStyle = "rgba(104,78,44,0.95)";
      c.lineWidth = 1.4;
      ZS.wline(
        c,
        from.shx,
        from.shy,
        from.shx + Math.cos(ang) * (len + 9),
        from.shy + Math.sin(ang) * (len + 9) * 0.6 - 2,
        s + 5,
        0.3,
      );
      c.strokeStyle = k.steel;
      c.lineWidth = 1.3;
      ZS.wpoly(
        c,
        [
          { x: tip.x, y: tip.y - 1 },
          { x: tip.x + Math.cos(ang) * 6, y: tip.y + Math.sin(ang) * 4 - 3 },
          { x: tip.x + Math.cos(ang) * 5, y: tip.y + Math.sin(ang) * 3 + 3 },
        ],
        s + 7,
        0.3,
        true,
      );
    } else if (kind === "bow") {
      c.strokeStyle = "rgba(104,78,44,0.95)";
      c.lineWidth = 1.3;
      const bx = tip.x,
        by = tip.y;
      ZS.wline(c, bx, by - 9, bx + 4, by, s + 9, 0.5);
      ZS.wline(c, bx, by - 9, bx + 4, by + 9, s + 10, 0.5);
      ZS.wline(c, bx, by - 9, bx, by + 9, s + 11, 0.4);
    } else if (kind === "sword") {
      c.strokeStyle = k.steel;
      c.lineWidth = 1.6;
      ZS.wline(
        c,
        tip.x,
        tip.y,
        tip.x + Math.cos(ang) * 12,
        tip.y + Math.sin(ang) * 7 - 6,
        s + 13,
        0.3,
      );
    } else if (kind === "gun") {
      c.strokeStyle = "rgba(72,66,58,0.95)";
      c.lineWidth = 1.5;
      ZS.wline(
        c,
        tip.x - 2,
        tip.y + 1,
        tip.x + Math.cos(ang) * 16,
        tip.y + Math.sin(ang) * 9,
        s + 15,
        0.25,
      );
      // the stock
      ZS.wline(c, tip.x - 2, tip.y + 1, tip.x - 5, tip.y + 5, s + 16, 0.3);
    }
    return tip;
  }

  // a horse: body, neck, head, four legs, a tail that knows the wind
  function horse(c, a, x, y, s, t) {
    const k = kit(a);
    c.strokeStyle = "rgba(88,64,42,0.92)";
    c.lineWidth = 1.7;
    c.lineCap = "round";
    const y0 = y - 12;
    // barrel
    ZS.wpoly(
      c,
      [
        { x: x - 11, y: y0 - 2 },
        { x: x - 8, y: y0 - 9 },
        { x: x + 8, y: y0 - 10 },
        { x: x + 12, y: y0 - 5 },
        { x: x + 10, y: y0 + 2 },
        { x: x - 9, y: y0 + 3 },
      ],
      s + 41,
      0.5,
      true,
    );
    // neck and head
    ZS.wline(c, x + 8, y0 - 8, x + 15, y0 - 16, s + 42, 0.6);
    ZS.wline(c, x + 15, y0 - 16, x + 19, y0 - 13, s + 43, 0.5);
    ZS.wcirc(c, x + 16, y0 - 14, 2.2, s + 44, 0.4);
    // the tail
    ZS.wline(c, x - 11, y0 - 3, x - 17, y0 + 4 + Math.sin(t * 4 + s) * 2, s + 45, 0.8);
    // the legs: a gallop when it is moving, a stamp when it is not
    const sp = a.move > 12 ? 1 : 0.25;
    const ph = a.gait * 1.6;
    for (let i = 0; i < 4; i++) {
      const lx = x - 8 + (i % 2) * 15 + (i > 1 ? 3 : 0);
      const sw = Math.sin(ph + i * 1.7) * 4.2 * sp;
      ZS.wline(c, lx, y0 + 2, lx + sw, y + 6, s + 50 + i, 0.9);
    }
    // the sash on the rider's horse too
    c.strokeStyle = k.cloth;
    c.lineWidth = 1.4;
    ZS.wline(c, x - 2, y0 - 9, x - 2, y0 + 2, s + 55, 0.3);
    return { seatX: x + 1, seatY: y0 - 11 };
  }

  function spokedWheel(c, x, y, r, s, t, spin) {
    c.strokeStyle = "rgba(84,62,40,0.95)";
    c.lineWidth = 1.3;
    ZS.wcirc(c, x, y, r, s + 60, 0.5);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const an = (i / n) * 6.283 + (spin || 0);
      ZS.wline(c, x, y, x + Math.cos(an) * r, y + Math.sin(an) * r, s + 70 + i, 0.25);
    }
  }

  function treads(c, x, y, w, s, t, roll) {
    c.strokeStyle = "rgba(62,58,50,0.95)";
    c.lineWidth = 1.6;
    const h = 5.5;
    ZS.wpoly(
      c,
      [
        { x: x - w / 2, y: y - h },
        { x: x + w / 2, y: y - h },
        { x: x + w / 2 + 2, y: y + h },
        { x: x - w / 2 - 2, y: y + h },
      ],
      s + 80,
      0.4,
      true,
    );
    // the cleats, marching along with it
    const n = 9;
    for (let i = 0; i < n; i++) {
      const f = ((i / n + (roll || 0) / 6) % 1) * w - w / 2;
      ZS.wline(c, x + f, y - h + 1, x + f, y + h - 1, s + 90 + i, 0.2);
    }
  }

  // a rotor: two blades, blurred into an ellipse, and a hub
  function rotor(c, x, y, r, t, s) {
    const spin = t * 26;
    c.strokeStyle = "rgba(70,66,58,0.28)";
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(x, y, r, r * 0.16, 0, 0, 6.2832);
    c.stroke();
    c.strokeStyle = "rgba(70,66,58,0.8)";
    c.lineWidth = 1.4;
    for (let i = 0; i < 2; i++) {
      const an = spin + i * Math.PI;
      ZS.wline(c, x, y, x + Math.cos(an) * r, y + Math.sin(an) * r * 0.16, s + 100 + i, 0.2);
    }
  }

  /* ---------- each one of them ---------- */

  const ART = {
    cart(c, a, t) {
      const s = a.seed;
      shadow(c, a.x, a.y, 13, s, 0.15);
      spokedWheel(c, a.x - 9, a.y + 2, 6.5, s, t, a.gait * 0.5);
      spokedWheel(c, a.x + 9, a.y + 2, 6.5, s + 5, t, a.gait * 0.5);
      c.strokeStyle = "rgba(96,72,44,0.95)";
      c.lineWidth = 1.5;
      ZS.wpoly(
        c,
        [
          { x: a.x - 14, y: a.y - 8 },
          { x: a.x + 14, y: a.y - 8 },
          { x: a.x + 12, y: a.y + 1 },
          { x: a.x - 12, y: a.y + 1 },
        ],
        s + 110,
        0.5,
        true,
      );
      c.fillStyle = "rgba(122,96,54,0.25)";
      c.fill();
      // the load, whatever it is carrying
      if (a.carry && a.carry.n) {
        c.strokeStyle = kit(a).cloth;
        c.lineWidth = 1.3;
        ZS.wcirc(c, a.x, a.y - 11, 5.5, s + 115, 0.6);
        ZS.wcirc(c, a.x - 6, a.y - 13, 3.5, s + 116, 0.5);
        ZS.wcirc(c, a.x + 6, a.y - 13, 3.5, s + 117, 0.5);
      }
      // the shafts, and no horse: the driver walks
      ZS.wline(c, a.x + 14, a.y - 4, a.x + 22, a.y + 2, s + 118, 0.4);
      const f = body(c, a, a.x + 24, a.y, s + 120, {});
      arm(c, a, s + 121, f, -0.4, 10);
    },

    militia(c, a, t) {
      const s = a.seed;
      shadow(c, a.x, a.y, 6, s);
      march(c, a, t, a.x, a.y, s, 6);
      const f = body(c, a, a.x, a.y, s, {});
      const sw = a.swing > 0 ? Math.sin(a.swing * 9) : 0;
      held(c, a, s, f, -1.2 + sw * 0.9, 13, "spear");
    },

    spearman(c, a, t) {
      const s = a.seed;
      shadow(c, a.x, a.y, 6.5, s);
      march(c, a, t, a.x, a.y, s, 6);
      const f = body(c, a, a.x, a.y, s, { helm: 1 });
      const sw = a.swing > 0 ? Math.sin(a.swing * 8) : 0;
      held(c, a, s, f, -0.5 + sw * 0.7, 20, "spear");
      // a shield on the other arm
      c.strokeStyle = kit(a).cloth;
      c.lineWidth = 1.4;
      ZS.wpoly(
        c,
        [
          { x: f.shx - 8, y: f.shy - 3 },
          { x: f.shx - 4, y: f.shy - 6 },
          { x: f.shx - 4, y: f.shy + 4 },
          { x: f.shx - 8, y: f.shy + 1 },
        ],
        s + 130,
        0.35,
        true,
      );
    },

    archer(c, a, t) {
      const s = a.seed;
      shadow(c, a.x, a.y, 6, s);
      march(c, a, t, a.x, a.y, s, 6);
      const f = body(c, a, a.x, a.y, s, {});
      const draw = a.atkT < 0.25 ? 0.5 : 0; // the string comes back
      held(c, a, s, f, -0.6 - draw, 12, "bow");
      // a quiver on the back
      c.strokeStyle = "rgba(96,72,44,0.9)";
      c.lineWidth = 1.2;
      ZS.wline(c, f.shx + 4, f.shy - 2, f.shx + 7, f.shy + 6, s + 135, 0.3);
    },

    knight(c, a, t) {
      const s = a.seed;
      shadow(c, a.x, a.y, 7.5, s, 0.16);
      march(c, a, t, a.x, a.y, s, 6);
      const f = body(c, a, a.x, a.y, s, { helm: 1 });
      // plate: a gorget, a breast, and greaves
      c.strokeStyle = "rgba(112,116,124,0.85)";
      c.lineWidth = 1.2;
      ZS.wpoly(
        c,
        [
          { x: a.x - 5, y: f.shy - 1 },
          { x: a.x + 5, y: f.shy - 1 },
          { x: a.x + 4, y: a.y - 4 },
          { x: a.x - 4, y: a.y - 4 },
        ],
        s + 140,
        0.3,
        true,
      );
      const sw = a.swing > 0 ? Math.sin(a.swing * 7) : 0;
      held(c, a, s, f, -1.3 + sw * 1.1, 12, "sword");
    },

    lancer(c, a, t) {
      const s = a.seed;
      shadow(c, a.x, a.y, 12, s, 0.15);
      const seat = horse(c, a, a.x, a.y, s, t);
      const f = body(c, a, seat.seatX, seat.seatY - 8, s + 150, { helm: 1 });
      const sw = a.swing > 0 ? Math.sin(a.swing * 8) : 0;
      held(c, a, s + 151, f, -0.35 + sw * 0.5, 22, "spear");
    },

    knightRider(c, a, t) {
      const s = a.seed;
      shadow(c, a.x, a.y, 13, s, 0.16);
      const seat = horse(c, a, a.x, a.y, s, t);
      const f = body(c, a, seat.seatX, seat.seatY - 8, s + 160, { helm: 1 });
      c.strokeStyle = "rgba(112,116,124,0.85)";
      c.lineWidth = 1.2;
      ZS.wpoly(
        c,
        [
          { x: seat.seatX - 5, y: f.shy - 1 },
          { x: seat.seatX + 5, y: f.shy - 1 },
          { x: seat.seatX + 4, y: f.shy + 7 },
          { x: seat.seatX - 4, y: f.shy + 7 },
        ],
        s + 161,
        0.3,
        true,
      );
      // the barding on the horse's chest
      c.strokeStyle = kit(a).cloth;
      c.lineWidth = 1.3;
      ZS.wline(c, a.x + 6, a.y - 18, a.x + 12, a.y - 10, s + 162, 0.3);
      const sw = a.swing > 0 ? Math.sin(a.swing * 7) : 0;
      held(c, a, s + 163, f, -1.2 + sw * 0.9, 13, "sword");
    },

    gunner(c, a, t) {
      const s = a.seed;
      shadow(c, a.x, a.y, 6, s);
      march(c, a, t, a.x, a.y, s, 6);
      const f = body(c, a, a.x, a.y, s, {});
      const aim = a.firing ? -0.15 : -0.5;
      held(c, a, s, f, aim, 15, "gun");
      // a powder horn
      c.strokeStyle = "rgba(96,72,44,0.9)";
      c.lineWidth = 1.1;
      ZS.wline(c, f.shx - 5, f.shy + 3, f.shx - 8, f.shy + 8, s + 170, 0.4);
    },

    cannon(c, a, t) {
      const s = a.seed;
      shadow(c, a.x, a.y, 13, s, 0.16);
      spokedWheel(c, a.x - 8, a.y + 2, 6, s, t, a.gait * 0.3);
      spokedWheel(c, a.x + 8, a.y + 2, 6, s + 5, t, a.gait * 0.3);
      // the carriage
      c.strokeStyle = "rgba(92,68,42,0.95)";
      c.lineWidth = 1.6;
      ZS.wpoly(
        c,
        [
          { x: a.x - 13, y: a.y - 4 },
          { x: a.x + 11, y: a.y - 6 },
          { x: a.x + 11, y: a.y + 1 },
          { x: a.x - 13, y: a.y + 2 },
        ],
        s + 180,
        0.4,
        true,
      );
      // the barrel, pointing where it is looking
      const ca = Math.cos(a.a),
        sa = Math.sin(a.a) * 0.5;
      const kick = a.kick > 0 ? a.kick * 5 : 0;
      c.strokeStyle = "rgba(66,62,56,0.95)";
      c.lineWidth = 3.2;
      ZS.wline(
        c,
        a.x - ca * (10 + kick),
        a.y - 9 - sa * (10 + kick),
        a.x + ca * 20,
        a.y - 9 + sa * 20,
        s + 181,
        0.25,
      );
      c.lineWidth = 1.4;
      c.strokeStyle = "rgba(40,38,34,0.9)";
      ZS.wcirc(c, a.x + ca * 20, a.y - 9 + sa * 20, 2.4, s + 182, 0.3);
    },

    machinegun(c, a, t) {
      const s = a.seed;
      shadow(c, a.x, a.y, 8, s);
      march(c, a, t, a.x - 6, a.y, s, 6);
      const f = body(c, a, a.x - 6, a.y, s, {});
      // the gun on its bipod, and the second man feeding it
      const ca = Math.cos(a.a),
        sa = Math.sin(a.a) * 0.5;
      const gx = a.x + 4,
        gy = a.y - 6;
      // the gunner's hands are on it, and the recoil shakes the pair of them
      const kick = a.kick > 0 ? a.kick * 2 : 0;
      arm(c, a, s + 188, f, -0.25 - kick, 12);
      c.strokeStyle = "rgba(66,62,56,0.95)";
      c.lineWidth = 2;
      ZS.wline(c, gx, gy, gx + ca * 16, gy + sa * 16, s + 190, 0.2);
      c.lineWidth = 1.1;
      ZS.wline(c, gx - 2, gy + 1, gx - 6, gy + 8, s + 191, 0.3);
      ZS.wline(c, gx + 2, gy + 1, gx + 6, gy + 8, s + 192, 0.3);
      // the belt, curling
      c.strokeStyle = "rgba(112,96,52,0.9)";
      ZS.wline(c, gx - 4, gy + 2, gx - 12, gy + 6, s + 193, 0.7);
      const f2 = body(c, a, a.x - 2, a.y + 2, s + 195, {});
      arm(c, a, s + 196, f2, -0.7, 11);
    },

    tank(c, a, t) {
      const s = a.seed;
      shadow(c, a.x, a.y, 18, s, 0.18);
      treads(c, a.x, a.y + 3, 30, s, t, a.gait * 2);
      // the hull
      c.strokeStyle = "rgba(78,86,66,0.95)";
      c.lineWidth = 1.7;
      ZS.wpoly(
        c,
        [
          { x: a.x - 15, y: a.y - 3 },
          { x: a.x + 13, y: a.y - 6 },
          { x: a.x + 15, y: a.y - 12 },
          { x: a.x - 13, y: a.y - 12 },
        ],
        s + 200,
        0.5,
        true,
      );
      c.fillStyle = "rgba(96,104,80,0.22)";
      c.fill();
      // the turret and the gun
      const ca = Math.cos(a.a),
        sa = Math.sin(a.a) * 0.5;
      ZS.wpoly(
        c,
        [
          { x: a.x - 6, y: a.y - 12 },
          { x: a.x + 6, y: a.y - 13 },
          { x: a.x + 5, y: a.y - 19 },
          { x: a.x - 5, y: a.y - 19 },
        ],
        s + 201,
        0.35,
        true,
      );
      const kick = a.kick > 0 ? a.kick * 4 : 0;
      c.strokeStyle = "rgba(58,56,50,0.95)";
      c.lineWidth = 2.4;
      ZS.wline(
        c,
        a.x + ca * (4 - kick),
        a.y - 16 + sa * (4 - kick),
        a.x + ca * 22,
        a.y - 16 + sa * 22,
        s + 202,
        0.2,
      );
      // a hatch and a flag to tell whose it is
      c.strokeStyle = kit(a).cloth;
      c.lineWidth = 1.3;
      ZS.wline(c, a.x - 12, a.y - 12, a.x - 12, a.y - 22, s + 203, 0.3);
      ZS.wline(c, a.x - 12, a.y - 22, a.x - 5, a.y - 20, s + 204, 0.3);
    },

    helicopter(c, a, t) {
      const s = a.seed;
      const y = a.y - 26; // it hangs above the ground
      // its shadow stays on the ground, and it is the only one that moves
      shadow(c, a.x, a.y + 4, 9, s, 0.1);
      c.strokeStyle = "rgba(60,58,52,0.2)";
      c.lineWidth = 1;
      ZS.wline(c, a.x - 4, y + 6, a.x - 20, a.y - 2, s + 210, 1.2);
      rotor(c, a.x, y - 12, 22, t, s);
      // the pod, and the tail
      c.strokeStyle = "rgba(84,88,74,0.95)";
      c.lineWidth = 1.6;
      ZS.wpoly(
        c,
        [
          { x: a.x - 9, y: y - 2 },
          { x: a.x + 4, y: y - 5 },
          { x: a.x + 11, y: y - 1 },
          { x: a.x + 3, y: y + 4 },
          { x: a.x - 8, y: y + 3 },
        ],
        s + 211,
        0.5,
        true,
      );
      c.fillStyle = "rgba(96,104,80,0.25)";
      c.fill();
      ZS.wline(c, a.x - 9, y, a.x - 22, y - 2, s + 212, 0.4);
      ZS.wline(c, a.x - 22, y - 2, a.x - 24, y - 7, s + 213, 0.3);
      // the little tail rotor
      c.strokeStyle = "rgba(70,66,58,0.6)";
      c.lineWidth = 1;
      ZS.wcirc(c, a.x - 24, y - 5, 4, s + 214, 0.5);
      // the skids and the gun
      c.strokeStyle = "rgba(66,62,56,0.9)";
      c.lineWidth = 1.2;
      ZS.wline(c, a.x - 6, y + 4, a.x - 6, y + 9, s + 215, 0.2);
      ZS.wline(c, a.x + 5, y + 4, a.x + 5, y + 9, s + 216, 0.2);
      const ca = Math.cos(a.a),
        sa = Math.sin(a.a) * 0.5;
      c.lineWidth = 1.8;
      ZS.wline(c, a.x, y + 2, a.x + ca * 14, y + 2 + sa * 14, s + 217, 0.2);
    },

    fighter(c, a, t) {
      const s = a.seed;
      const y = a.y - 34;
      shadow(c, a.x, a.y + 4, 7, s, 0.08);
      c.save();
      c.translate(a.x, y);
      // it banks as it turns
      const bank = ZS.clamp((a.turn || 0) * 0.5, -0.5, 0.5);
      c.rotate(a.a + bank);
      c.strokeStyle = "rgba(90,96,84,0.95)";
      c.lineWidth = 1.6;
      // fuselage
      ZS.wpoly(
        c,
        [
          { x: -16, y: 0 },
          { x: -4, y: -3 },
          { x: 12, y: -2 },
          { x: 15, y: 1 },
          { x: -2, y: 4 },
        ],
        s + 220,
        0.4,
        true,
      );
      c.fillStyle = "rgba(104,112,92,0.2)";
      c.fill();
      // wings and tail
      ZS.wline(c, -2, -1, -4, -11, s + 221, 0.4);
      ZS.wline(c, -2, -1, -4, 10, s + 222, 0.4);
      ZS.wline(c, -14, 0, -12, -6, s + 223, 0.3);
      ZS.wline(c, -14, 0, -12, 5, s + 224, 0.3);
      // the propeller: a disc, because it is turning too fast to see —
      // with a blade in it that never quite resolves
      c.strokeStyle = "rgba(70,66,58,0.35)";
      c.lineWidth = 1.2;
      c.beginPath();
      c.ellipse(16, 0, 2.4, 9, 0, 0, 6.2832);
      c.stroke();
      c.strokeStyle = "rgba(70,66,58,0.5)";
      c.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        const an = t * 44 + i * Math.PI;
        ZS.wline(c, 16, 0, 16, Math.sin(an) * 9, s + 227 + i, 0.2);
      }
      // roundels
      c.strokeStyle = kit(a).cloth;
      c.lineWidth = 1.4;
      ZS.wcirc(c, -3, -7, 2.6, s + 225, 0.3);
      ZS.wcirc(c, -3, 8, 2.6, s + 226, 0.3);
      c.restore();
    },
  };

  /* ---------- one of them, drawn ---------- */

  const Units = {
    CAT,
    ORDER,
    ART,

    def(id) {
      return CAT[id] || CAT.militia;
    },

    list() {
      const out = [];
      for (const id of ORDER) out.push({ id, def: CAT[id] });
      return out;
    },

    // what it costs you, at this moment (the workshop and the smithy take
    // the edge off the arms bill)
    cost(scen, id) {
      const d = CAT[id];
      const c = {
        w: Math.max(1, Math.round((d.cost.w || 0) * 1)),
        s: Math.max(1, Math.round((d.cost.s || 0) * 1)),
        c: Math.max(1, Math.round((d.cost.c || 0) * 1)),
      };
      if (d.cost.a) {
        let a = d.cost.a;
        if (scen.has("smith")) a *= 0.85;
        if (scen.has("foundry")) a *= 0.85;
        if (scen.done.tools2) a *= 0.9;
        c.a = Math.max(1, Math.round(a));
      }
      return c;
    },

    // how long it takes to train, in seconds of work
    time(scen, id) {
      const d = CAT[id];
      let t = 12 + d.hp / 10 + (d.crew || 1) * 4;
      if (scen.done.tools1) t *= 0.85;
      if (scen.done.tools2) t *= 0.85;
      return Math.round(t);
    },

    cap(scen) {
      let n = 2; // a village can always put two people under arms
      const add = (kind, per) => {
        for (const b of scen.world.buildings)
          if (b.kind === kind && b.built && !b.ruined) n += per * b.lvl;
      };
      add("barracks", 4);
      add("stable", 3);
      add("foundry", 2);
      add("airfield", 2);
      return n;
    },

    // the army's daily bread — theirs is not our problem
    upkeep(scen) {
      let food = 0;
      for (const a of scen.agents) if (a.st === 4 && !a.foe && CAT[a.unit]) food += CAT[a.unit].eat;
      return food;
    },

    // how many of ours are in the field (theirs do not count, and do not
    // take our beds)
    count(scen, id) {
      let n = 0;
      for (const a of scen.agents) if (a.st === 4 && !a.foe && (!id || a.unit === id)) n++;
      return n;
    },

    crew(scen) {
      let n = 0;
      for (const a of scen.agents)
        if (a.st === 4 && !a.foe && CAT[a.unit]) n += CAT[a.unit].crew || 1;
      return n;
    },

    render(c, a, t) {
      const d = CAT[a.unit] || CAT.militia;
      const fn = ART[a.unit] || ART.militia;
      c.save();
      fn(c, a, t);
      c.restore();
      // the muzzle: a short bright flare, in the direction it is shooting
      if (a.muzzle > 0) {
        const ca = Math.cos(a.a),
          sa = Math.sin(a.a) * 0.5;
        const my = a.y - (d.fly ? 44 : 14);
        c.save();
        c.globalCompositeOperation = "lighter";
        c.fillStyle = "rgba(240,196,104," + (a.muzzle * 5).toFixed(2) + ")";
        c.beginPath();
        c.ellipse(a.x + ca * 18, my + sa * 18, 5, 3, 0, 0, 6.2832);
        c.fill();
        c.restore();
      }
      if (a.hp < a.maxHp - 0.01) this.hp(c, a, d);
      if (a.sel) this.ring(c, a, t, d);
    },

    hp(c, a, d) {
      const w = d.fly ? 22 : 18;
      const y = a.y - (d.fly ? 62 : 32);
      const x = a.x - w / 2;
      c.fillStyle = "rgba(250,246,236,0.8)";
      c.fillRect(x - 1, y - 1, w + 2, 4.2);
      c.strokeStyle = "rgba(70,64,52,0.5)";
      c.lineWidth = 0.8;
      c.strokeRect(x - 1, y - 1, w + 2, 4.2);
      const f = ZS.clamp(a.hp / a.maxHp, 0, 1);
      c.fillStyle =
        f > 0.5 ? "rgba(96,132,58,0.9)" : f > 0.25 ? "rgba(178,140,50,0.9)" : "rgba(158,58,42,0.9)";
      c.fillRect(x, y, w * f, 3.2);
    },

    ring(c, a, t, d) {
      c.strokeStyle = a.foe ? "rgba(150,60,40,0.9)" : "rgba(64,96,52,0.9)";
      c.lineWidth = 1.8;
      const r = (d.fly ? 20 : d.mounted ? 18 : 14) + Math.sin(t * 4) * 0.8;
      ZS.wcirc(c, a.x, a.y - (d.fly ? 34 : 4), r, a.seed + 1, 1.1);
    },

    // the little word over a unit's head when the panel names it
    tag(c, a, txt) {
      c.save();
      c.font = "italic 9.5px " + HAND;
      c.textAlign = "center";
      c.fillStyle = a.foe ? "rgba(150,60,40,0.9)" : "rgba(58,54,44,0.85)";
      c.fillText(txt, a.x, a.y - (CAT[a.unit] && CAT[a.unit].fly ? 68 : 38));
      c.restore();
    },
  };

  ZS.Units = Units;
})();
