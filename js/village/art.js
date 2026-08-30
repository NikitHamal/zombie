/* The Hollow — the world's furniture, the animals, and the weather.
   Everything here is drawn with the same boiling primitives and the same
   paper palette as the rest of the game: nothing is an image, nothing is
   loaded, and nothing allocates per frame.

   Three kinds of thing live here:
     props     — static things standing in the world (graves, carts,
                 barrels, racks, beehives, torches, piles of firewood)
     critters  — the small lives: chickens, sheep, dogs, crows, rats
     particles — rain, snow, leaves, embers, motes, fireflies, birds,
                 and the one-shot bursts (dust, blood, chips, smoke)

   The scenario keeps the lists; this file knows how to tick and draw
   them. Culling is done here too, against the camera's visible rect. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  const TAU = Math.PI * 2;

  const INK = "rgba(74,62,46,0.9)";
  const INK2 = "rgba(74,62,46,0.42)";
  const INK3 = "rgba(74,62,46,0.22)";
  const WOOD = "rgba(150,110,62,0.85)";
  const STONE = "rgba(120,116,106,0.85)";
  const CLOTH = "rgba(196,182,150,0.9)";
  const BONE = "rgba(226,220,204,0.95)";
  const RED = "rgba(150,50,38,0.9)";

  /* ============================== props ============================== */

  // a prop record: { kind, x, y, seed, r } — the scenario owns the list
  const PROP = {
    // a grave: a mound and a lashed cross. The village buries its dead.
    grave(c, p, t) {
      const s = p.seed;
      c.strokeStyle = INK2;
      c.lineWidth = 1.2;
      ZS.wcirc(c, p.x, p.y, 11, s + 1, 1.6);
      c.fillStyle = "rgba(150,142,120,0.28)";
      ZS.wpoly(
        c,
        [
          { x: p.x - 11, y: p.y + 3 },
          { x: p.x - 6, y: p.y - 3 },
          { x: p.x + 6, y: p.y - 3 },
          { x: p.x + 11, y: p.y + 3 },
        ],
        s + 2,
        1.2,
        true,
      );
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 2;
      ZS.wline(c, p.x, p.y - 2, p.x, p.y - 18, s + 3, 1);
      ZS.wline(c, p.x - 7, p.y - 12, p.x + 7, p.y - 12, s + 4, 1);
      c.strokeStyle = "rgba(150,110,62,0.7)";
      c.lineWidth = 1.4;
      ZS.wline(c, p.x - 5, p.y - 12, p.x + 5, p.y - 12, s + 5, 1.6);
      if (Math.sin(t * 1.4 + s) > 0.86 && ZS.Perf && ZS.Perf.glow) {
        // a wisp, on still nights
        c.strokeStyle = "rgba(190,210,220,0.5)";
        c.lineWidth = 1;
        ZS.wline(c, p.x, p.y - 6, p.x + 3, p.y - 14, s + Math.floor(t), 2);
      }
    },

    cairn(c, p) {
      const s = p.seed;
      c.strokeStyle = STONE;
      c.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        const w = 13 - i * 2.6,
          y = p.y - i * 6;
        ZS.wpoly(
          c,
          [
            { x: p.x - w, y },
            { x: p.x, y: y - 6 },
            { x: p.x + w, y },
            { x: p.x, y: y + 4 },
          ],
          s + i,
          1.1,
          true,
        );
        c.fillStyle = "rgba(120,116,106,0.22)";
        c.fill();
        c.stroke();
      }
    },

    cart(c, p, t) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 2;
      // box
      ZS.wpoly(
        c,
        [
          { x: p.x - 20, y: p.y - 14 },
          { x: p.x + 20, y: p.y - 14 },
          { x: p.x + 18, y: p.y + 2 },
          { x: p.x - 18, y: p.y + 2 },
        ],
        s,
        1.2,
        true,
      );
      c.fillStyle = "rgba(160,118,68,0.2)";
      c.fill();
      c.stroke();
      // wheels
      c.strokeStyle = INK;
      c.lineWidth = 1.8;
      ZS.wcirc(c, p.x - 11, p.y + 6, 7, s + 2, 1.2);
      ZS.wcirc(c, p.x + 11, p.y + 6, 7, s + 3, 1.2);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI + t * 0.02;
        ZS.wline(
          c,
          p.x - 11 + Math.cos(a) * 6,
          p.y + 6 + Math.sin(a) * 6,
          p.x - 11 - Math.cos(a) * 6,
          p.y + 6 - Math.sin(a) * 6,
          s + 10 + i,
          0.6,
        );
      }
      // shafts
      c.strokeStyle = WOOD;
      ZS.wline(c, p.x + 18, p.y - 6, p.x + 34, p.y + 2, s + 4, 1);
    },

    barrel(c, p) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 1.8;
      ZS.wpoly(
        c,
        [
          { x: p.x - 8, y: p.y - 12 },
          { x: p.x + 8, y: p.y - 12 },
          { x: p.x + 6, y: p.y + 1 },
          { x: p.x - 6, y: p.y + 1 },
        ],
        s,
        1,
        true,
      );
      c.fillStyle = "rgba(160,118,68,0.24)";
      c.fill();
      c.stroke();
      c.strokeStyle = "rgba(112,96,78,0.8)";
      c.lineWidth = 1.4;
      ZS.wline(c, p.x - 7, p.y - 8, p.x + 7, p.y - 8, s + 1, 0.7);
      ZS.wline(c, p.x - 6.6, p.y - 3, p.x + 6.6, p.y - 3, s + 2, 0.7);
    },

    crate(c, p) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 1.7;
      ZS.wpoly(
        c,
        [
          { x: p.x - 10, y: p.y - 14 },
          { x: p.x + 10, y: p.y - 14 },
          { x: p.x + 10, y: p.y + 1 },
          { x: p.x - 10, y: p.y + 1 },
        ],
        s,
        1,
        true,
      );
      c.fillStyle = "rgba(160,118,68,0.18)";
      c.fill();
      c.stroke();
      c.lineWidth = 1.1;
      ZS.wline(c, p.x - 10, p.y - 13, p.x + 10, p.y + 1, s + 1, 0.8);
      ZS.wline(c, p.x + 10, p.y - 13, p.x - 10, p.y + 1, s + 2, 0.8);
    },

    sack(c, p) {
      const s = p.seed;
      c.strokeStyle = CLOTH;
      c.lineWidth = 1.6;
      ZS.wpoly(
        c,
        [
          { x: p.x - 8, y: p.y + 1 },
          { x: p.x - 5, y: p.y - 11 },
          { x: p.x + 5, y: p.y - 11 },
          { x: p.x + 8, y: p.y + 1 },
        ],
        s,
        1.2,
        true,
      );
      c.fillStyle = "rgba(196,182,150,0.42)";
      c.fill();
      c.stroke();
      c.strokeStyle = INK2;
      c.lineWidth = 1.3;
      ZS.wline(c, p.x - 4, p.y - 11, p.x + 4, p.y - 11, s + 3, 0.8);
    },

    logs(c, p) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        const y = p.y - i * 6;
        const x = p.x + (i % 2 ? 2 : -2);
        ZS.wline(c, x - 12, y, x + 12, y, s + i, 1);
        c.strokeStyle = INK2;
        ZS.wcirc(c, x + 12, y, 2.6, s + i + 7, 0.6);
        c.strokeStyle = WOOD;
      }
    },

    stones(c, p) {
      const s = p.seed;
      c.strokeStyle = STONE;
      c.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const a = ZS.hash(s + i) * TAU,
          r = 4 + ZS.hash(s + i + 3) * 9;
        ZS.wcirc(c, p.x + Math.cos(a) * 7, p.y + Math.sin(a) * 4 - 2, 2.6 + r * 0.2, s + i, 0.9);
      }
    },

    // drying rack: two posts and a line of cloth, flapping
    rack(c, p, t) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 1.8;
      ZS.wline(c, p.x - 16, p.y + 1, p.x - 16, p.y - 22, s, 0.9);
      ZS.wline(c, p.x + 16, p.y + 1, p.x + 16, p.y - 22, s + 1, 0.9);
      ZS.wline(c, p.x - 18, p.y - 21, p.x + 18, p.y - 21, s + 2, 0.9);
      for (let i = 0; i < 3; i++) {
        const x = p.x - 11 + i * 11;
        const w = 4 + Math.sin(t * 2.2 + i + s) * 1.4;
        c.strokeStyle = CLOTH;
        c.lineWidth = 1.4;
        ZS.wpoly(
          c,
          [
            { x: x - w, y: p.y - 20 },
            { x: x + w, y: p.y - 20 },
            { x: x + w - 0.6, y: p.y - 6 },
            { x: x - w + 0.8, y: p.y - 7 },
          ],
          s + i * 3,
          0.8,
          true,
        );
        c.fillStyle = "rgba(214,204,178,0.5)";
        c.fill();
      }
    },

    scarecrow(c, p, t) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 2;
      ZS.wline(c, p.x, p.y + 2, p.x, p.y - 30, s, 1);
      ZS.wline(c, p.x - 16, p.y - 20, p.x + 16, p.y - 22, s + 1, 1);
      // shirt
      c.strokeStyle = "rgba(150,70,54,0.8)";
      ZS.wpoly(
        c,
        [
          { x: p.x - 9, y: p.y - 26 },
          { x: p.x + 9, y: p.y - 26 },
          { x: p.x + 7, y: p.y - 8 },
          { x: p.x - 7, y: p.y - 8 },
        ],
        s + 2,
        1.4,
        true,
      );
      c.fillStyle = "rgba(150,70,54,0.2)";
      c.fill();
      // straw head
      c.strokeStyle = "rgba(186,158,66,0.9)";
      c.lineWidth = 1.5;
      ZS.wcirc(c, p.x, p.y - 33, 5.5, s + 3, 1.2);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + Math.sin(t * 2 + s) * 0.1;
        ZS.wline(
          c,
          p.x + Math.cos(a) * 4,
          p.y - 33 + Math.sin(a) * 4,
          p.x + Math.cos(a) * 8,
          p.y - 33 + Math.sin(a) * 8,
          s + i,
          0.7,
        );
      }
    },

    hive(c, p, t) {
      const s = p.seed;
      c.strokeStyle = "rgba(186,158,66,0.9)";
      c.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        const w = 10 - i * 1.9,
          y = p.y - i * 4.6;
        ZS.wline(c, p.x - w, y, p.x + w, y - 1.4, s + i, 0.8);
      }
      ZS.wpoly(
        c,
        [
          { x: p.x - 10, y: p.y + 1 },
          { x: p.x - 5, y: p.y - 16 },
          { x: p.x + 5, y: p.y - 16 },
          { x: p.x + 10, y: p.y + 1 },
        ],
        s + 9,
        1,
        true,
      );
      c.fillStyle = "rgba(186,158,66,0.18)";
      c.fill();
      // bees
      if (ZS.Perf && ZS.Perf.rich) {
        c.fillStyle = "rgba(120,102,50,0.7)";
        for (let i = 0; i < 3; i++) {
          const a = t * 2.2 + i * 2.1 + s;
          c.fillRect(
            p.x + Math.cos(a) * (9 + i * 3) - 0.7,
            p.y - 18 + Math.sin(a * 1.7) * 5,
            1.6,
            1.6,
          );
        }
      }
    },

    // a torch on a post: light, and something for the night to gather at
    torch(c, p, t, env) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 2;
      ZS.wline(c, p.x, p.y + 2, p.x - 1, p.y - 26, s, 0.9);
      c.strokeStyle = "rgba(112,84,50,0.9)";
      c.lineWidth = 1.5;
      ZS.wcirc(c, p.x - 1, p.y - 28, 3.4, s + 1, 0.8);
      const f = Math.sin(t * 9 + s) * 0.5 + Math.sin(t * 5.3 + s * 2) * 0.5;
      const h = 7 + f * 2.4;
      c.strokeStyle = "rgba(214,132,44,0.95)";
      c.lineWidth = 2.2;
      ZS.wpoly(
        c,
        [
          { x: p.x - 3.4, y: p.y - 29 },
          { x: p.x - 1 + f * 0.8, y: p.y - 29 - h },
          { x: p.x + 3.4, y: p.y - 29 },
        ],
        s + 2,
        0.7,
        true,
      );
      c.fillStyle = "rgba(226,166,60,0.75)";
      c.fill();
      if (env && env.night > 0.05 && ZS.Perf && ZS.Perf.glow) {
        const g = c.createRadialGradient(p.x - 1, p.y - 34, 4, p.x - 1, p.y - 34, 96);
        g.addColorStop(0, "rgba(236,180,84," + (0.17 * env.night).toFixed(3) + ")");
        g.addColorStop(1, "rgba(236,180,84,0)");
        c.fillStyle = g;
        c.beginPath();
        c.arc(p.x - 1, p.y - 34, 96, 0, TAU);
        c.fill();
      }
    },

    // split firewood under a lean-to: winter eats this
    woodpile(c, p) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 1.5;
      ZS.wline(c, p.x - 14, p.y + 2, p.x + 13, p.y - 6, s, 1);
      for (let r = 0; r < 3; r++)
        for (let i = 0; i < 4 - r; i++) {
          const x = p.x - 11 + i * 7 + r * 3,
            y = p.y - 3 - r * 5.5;
          ZS.wcirc(c, x, y, 3.2, s + r * 5 + i, 0.7);
          c.strokeStyle = INK3;
          ZS.wline(c, x - 2, y - 1, x + 2, y + 1, s + r + i * 2, 0.5);
          c.strokeStyle = WOOD;
        }
    },

    // a banner on a pole: the village has a colour
    banner(c, p, t) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 2;
      ZS.wline(c, p.x, p.y + 2, p.x, p.y - 46, s, 1);
      const w = 15 + Math.sin(t * 1.9 + s) * 2.2;
      c.strokeStyle = "rgba(120,72,52,0.9)";
      c.lineWidth = 1.6;
      ZS.wpoly(
        c,
        [
          { x: p.x + 1, y: p.y - 45 },
          { x: p.x + w, y: p.y - 41 + Math.sin(t * 2.4 + s) * 1.6 },
          { x: p.x + w - 2, y: p.y - 22 + Math.sin(t * 2.1 + s) * 2.4 },
          { x: p.x + 1, y: p.y - 24 },
        ],
        s + 1,
        1.2,
        true,
      );
      c.fillStyle = "rgba(120,72,52,0.28)";
      c.fill();
      c.strokeStyle = "rgba(226,214,180,0.8)";
      c.lineWidth = 1.2;
      ZS.wline(c, p.x + 4, p.y - 35, p.x + w - 4, p.y - 33, s + 2, 0.8);
    },

    signpost(c, p) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 2;
      ZS.wline(c, p.x, p.y + 2, p.x, p.y - 26, s, 0.9);
      ZS.wpoly(
        c,
        [
          { x: p.x - 13, y: p.y - 24 },
          { x: p.x + 15, y: p.y - 26 },
          { x: p.x + 15, y: p.y - 15 },
          { x: p.x - 13, y: p.y - 13 },
        ],
        s + 1,
        1.1,
        true,
      );
      c.fillStyle = "rgba(196,172,120,0.35)";
      c.fill();
      c.stroke();
      c.strokeStyle = INK2;
      c.lineWidth = 1;
      for (let i = 0; i < 2; i++)
        ZS.wline(c, p.x - 10, p.y - 20 + i * 4, p.x + 11, p.y - 21 + i * 4, s + i + 4, 0.6);
    },

    // the memorial: names are added by the chronicle
    shrine(c, p, t) {
      const s = p.seed;
      c.strokeStyle = STONE;
      c.lineWidth = 2;
      ZS.wpoly(
        c,
        [
          { x: p.x - 12, y: p.y + 2 },
          { x: p.x - 10, y: p.y - 20 },
          { x: p.x + 10, y: p.y - 20 },
          { x: p.x + 12, y: p.y + 2 },
        ],
        s,
        1.2,
        true,
      );
      c.fillStyle = "rgba(120,116,106,0.22)";
      c.fill();
      c.stroke();
      // a niche with a candle
      c.fillStyle = "rgba(70,58,44,0.35)";
      c.beginPath();
      c.arc(p.x, p.y - 12, 4, 0, TAU);
      c.fill();
      const f = Math.sin(t * 7 + s) * 0.6 + Math.sin(t * 3.1) * 0.4;
      c.strokeStyle = "rgba(230,180,80,0.95)";
      c.lineWidth = 1.8;
      ZS.wline(c, p.x, p.y - 12, p.x + f, p.y - 17 - f, s + 2, 0.6);
      if (ZS.Perf && ZS.Perf.glow) {
        const g = c.createRadialGradient(p.x, p.y - 16, 2, p.x, p.y - 16, 46);
        g.addColorStop(0, "rgba(236,190,96,0.22)");
        g.addColorStop(1, "rgba(236,190,96,0)");
        c.fillStyle = g;
        c.beginPath();
        c.arc(p.x, p.y - 16, 46, 0, TAU);
        c.fill();
      }
    },

    // a hand pump / standpipe by the well — the granary district's tap
    pump(c, p) {
      const s = p.seed;
      c.strokeStyle = "rgba(112,112,104,0.9)";
      c.lineWidth = 2;
      ZS.wpoly(
        c,
        [
          { x: p.x - 5, y: p.y + 2 },
          { x: p.x - 3, y: p.y - 16 },
          { x: p.x + 3, y: p.y - 16 },
          { x: p.x + 5, y: p.y + 2 },
        ],
        s,
        1,
        true,
      );
      c.fillStyle = "rgba(112,112,104,0.24)";
      c.fill();
      c.stroke();
      c.lineWidth = 1.6;
      ZS.wline(c, p.x + 3, p.y - 14, p.x + 11, p.y - 12, s + 1, 0.8);
      ZS.wline(c, p.x + 11, p.y - 12, p.x + 11, p.y - 4, s + 2, 0.8);
    },

    // a chicken coop — the kennel's quiet neighbour
    coop(c, p, t) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 1.8;
      ZS.wpoly(
        c,
        [
          { x: p.x - 16, y: p.y + 1 },
          { x: p.x - 14, y: p.y - 15 },
          { x: p.x + 14, y: p.y - 15 },
          { x: p.x + 16, y: p.y + 1 },
        ],
        s,
        1.1,
        true,
      );
      c.fillStyle = "rgba(160,118,68,0.2)";
      c.fill();
      c.stroke();
      c.strokeStyle = INK;
      ZS.wpoly(
        c,
        [
          { x: p.x - 18, y: p.y - 14 },
          { x: p.x, y: p.y - 26 },
          { x: p.x + 18, y: p.y - 14 },
        ],
        s + 1,
        1.1,
        true,
      );
      c.fillStyle = "rgba(158,124,64,0.22)";
      c.fill();
      c.fillStyle = "rgba(50,40,30,0.5)";
      c.beginPath();
      c.arc(p.x, p.y - 8, 3.6, 0, TAU);
      c.fill();
      if (Math.sin(t * 0.7 + s) > 0.9) {
        c.strokeStyle = BONE;
        c.lineWidth = 1.4;
        ZS.wcirc(c, p.x + 2, p.y - 2, 2.2, s + 3, 0.5);
      }
    },

    // a beehive stand, a dog kennel, a dovecote — the small livestock set
    kennel(c, p) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 1.7;
      ZS.wpoly(
        c,
        [
          { x: p.x - 12, y: p.y + 1 },
          { x: p.x - 12, y: p.y - 13 },
          { x: p.x, y: p.y - 19 },
          { x: p.x + 12, y: p.y - 13 },
          { x: p.x + 12, y: p.y + 1 },
        ],
        s,
        1.1,
        true,
      );
      c.fillStyle = "rgba(160,118,68,0.2)";
      c.fill();
      c.stroke();
      c.fillStyle = "rgba(50,40,30,0.45)";
      ZS.wpoly(
        c,
        [
          { x: p.x - 5, y: p.y + 1 },
          { x: p.x - 5, y: p.y - 8 },
          { x: p.x + 5, y: p.y - 8 },
          { x: p.x + 5, y: p.y + 1 },
        ],
        s + 1,
        0.8,
        true,
      );
      c.fill();
    },

    dovecote(c, p, t) {
      const s = p.seed;
      c.strokeStyle = WOOD;
      c.lineWidth = 1.8;
      ZS.wline(c, p.x, p.y + 2, p.x, p.y - 14, s, 0.9);
      ZS.wpoly(
        c,
        [
          { x: p.x - 11, y: p.y - 14 },
          { x: p.x - 9, y: p.y - 26 },
          { x: p.x + 9, y: p.y - 26 },
          { x: p.x + 11, y: p.y - 14 },
        ],
        s + 1,
        1,
        true,
      );
      c.fillStyle = "rgba(196,182,150,0.28)";
      c.fill();
      c.stroke();
      ZS.wpoly(
        c,
        [
          { x: p.x - 12, y: p.y - 25 },
          { x: p.x, y: p.y - 35 },
          { x: p.x + 12, y: p.y - 25 },
        ],
        s + 2,
        1,
        true,
      );
      c.fillStyle = "rgba(150,70,54,0.2)";
      c.fill();
      c.stroke();
      if (Math.sin(t * 1.3 + s) > 0.95) {
        c.strokeStyle = "rgba(226,220,204,0.9)";
        c.lineWidth = 1.4;
        ZS.wline(c, p.x - 2, p.y - 30, p.x + 3, p.y - 33, s + 3, 0.6);
      }
    },
  };

  /* ============================ critters ============================ */

  // critters wander, graze, and bolt when the dead come near. They are
  // flavour with teeth: a dog barks (early warning), rats carry sickness.
  const CRIT = {
    chicken(c, a, t) {
      const s = a.seed;
      const peck = Math.max(0, Math.sin(t * 2.4 + s)) > 0.9 ? 3 : 0;
      const bob = Math.sin(t * 3 + s) * 0.6;
      c.strokeStyle = INK2;
      c.lineWidth = 1;
      ZS.wcirc(c, a.x, a.y + 3, 4, s, 0.8);
      c.strokeStyle = "rgba(226,220,204,0.95)";
      c.lineWidth = 1.6;
      ZS.wcirc(c, a.x, a.y - 3 + bob, 4.2, s + 1, 0.9);
      c.fillStyle = "rgba(226,220,204,0.5)";
      c.fill();
      // head and beak
      ZS.wcirc(c, a.x + 3.4 * a.dir, a.y - 7 - peck + bob, 2.4, s + 2, 0.6);
      c.strokeStyle = "rgba(200,150,52,0.95)";
      c.lineWidth = 1.2;
      ZS.wline(
        c,
        a.x + 5.4 * a.dir,
        a.y - 7 - peck + bob,
        a.x + 8 * a.dir,
        a.y - 6.4 - peck + bob,
        s + 3,
        0.4,
      );
      c.strokeStyle = RED;
      c.lineWidth = 1;
      ZS.wline(
        c,
        a.x + 4 * a.dir,
        a.y - 9 - peck + bob,
        a.x + 6 * a.dir,
        a.y - 11 - peck + bob,
        s + 4,
        0.4,
      );
      c.strokeStyle = "rgba(160,140,110,0.9)";
      c.lineWidth = 1.2;
      ZS.wline(c, a.x - 2, a.y + 1, a.x - 1, a.y + 3, s + 5, 0.4);
      ZS.wline(c, a.x + 1, a.y + 1, a.x + 2, a.y + 3, s + 6, 0.4);
    },

    sheep(c, a, _t) {
      const s = a.seed;
      const graze = a.graze > 0 ? 4 : 0;
      c.strokeStyle = INK3;
      c.lineWidth = 1;
      ZS.wcirc(c, a.x, a.y + 4, 8, s, 1);
      c.strokeStyle = "rgba(110,106,96,0.9)";
      c.lineWidth = 1.8;
      // wool: a few overlapping loops
      for (let i = 0; i < 4; i++) {
        const x = a.x - 6 + i * 4,
          y = a.y - 2 + (i % 2 ? 1 : -1);
        ZS.wcirc(c, x, y, 4.4, s + i * 2, 1);
      }
      c.fillStyle = "rgba(238,234,224,0.4)";
      c.fill();
      c.strokeStyle = "rgba(70,64,56,0.9)";
      c.lineWidth = 1.6;
      ZS.wcirc(c, a.x + 8 * a.dir, a.y - 4 - graze, 3, s + 9, 0.7);
      c.fillStyle = "rgba(70,64,56,0.55)";
      c.fill();
      ZS.wline(c, a.x - 5, a.y + 2, a.x - 4, a.y + 5, s + 10, 0.5);
      ZS.wline(c, a.x + 4, a.y + 2, a.x + 5, a.y + 5, s + 11, 0.5);
    },

    dog(c, a, t) {
      const s = a.seed;
      const run = Math.hypot(a.vx, a.vy) > 18 ? 1 : 0;
      const g = Math.sin(a.gait) * 2.4 * (0.4 + run * 0.9);
      c.strokeStyle = INK3;
      c.lineWidth = 1;
      ZS.wcirc(c, a.x, a.y + 4, 7, s, 1);
      c.strokeStyle = "rgba(126,96,58,0.95)";
      c.lineWidth = 2;
      ZS.wline(c, a.x - 8 * a.dir, a.y - 1, a.x + 7 * a.dir, a.y - 2, s + 1, 0.8);
      // legs
      c.lineWidth = 1.5;
      ZS.wline(c, a.x - 6 * a.dir, a.y - 1, a.x - 6 * a.dir + g, a.y + 4, s + 2, 0.6);
      ZS.wline(c, a.x + 6 * a.dir, a.y - 1, a.x + 6 * a.dir - g, a.y + 4, s + 3, 0.6);
      // tail
      c.strokeStyle = "rgba(126,96,58,0.95)";
      c.lineWidth = 1.8;
      const wag = a.bark > 0 ? Math.sin(t * 18) * 4 : Math.sin(t * 4 + s) * 1.6;
      ZS.wline(c, a.x - 8 * a.dir, a.y - 2, a.x - 12 * a.dir, a.y - 6 + wag, s + 4, 0.8);
      // head
      ZS.wcirc(c, a.x + 10 * a.dir, a.y - 6, 3.2, s + 5, 0.7);
      c.fillStyle = "rgba(126,96,58,0.5)";
      c.fill();
      c.strokeStyle = "rgba(126,96,58,0.95)";
      ZS.wline(c, a.x + 8 * a.dir, a.y - 8, a.x + 11 * a.dir, a.y - 9 + (run ? 2 : 0), s + 6, 0.5);
      if (a.bark > 0) {
        c.strokeStyle = RED;
        c.lineWidth = 1.2;
        ZS.wline(c, a.x + 13 * a.dir, a.y - 9, a.x + 16 * a.dir, a.y - 10, s + 7, 0.5);
      }
    },

    crow(c, a, t) {
      const s = a.seed;
      if (a.fly > 0) {
        // airborne: two wing strokes
        const f = Math.sin(t * 14 + s);
        c.strokeStyle = "rgba(52,48,44,0.95)";
        c.lineWidth = 1.8;
        ZS.wline(c, a.x - 9, a.y - 2 - f * 5, a.x, a.y, s + 1, 0.8);
        ZS.wline(c, a.x + 9, a.y - 2 - f * 5, a.x, a.y, s + 2, 0.8);
        ZS.wcirc(c, a.x + 3 * a.dir, a.y - 1, 2.4, s + 3, 0.5);
        c.strokeStyle = "rgba(190,150,52,0.95)";
        c.lineWidth = 1.2;
        ZS.wline(c, a.x + 5 * a.dir, a.y - 1, a.x + 8 * a.dir, a.y - 0.6, s + 4, 0.4);
        return;
      }
      const hop = Math.max(0, Math.sin(t * 3 + s) - 0.8) * 12;
      c.strokeStyle = INK3;
      c.lineWidth = 1;
      ZS.wcirc(c, a.x, a.y + 3, 5, s, 0.8);
      c.strokeStyle = "rgba(52,48,44,0.95)";
      c.lineWidth = 1.8;
      ZS.wcirc(c, a.x, a.y - 4 - hop, 4, s + 1, 0.8);
      c.fillStyle = "rgba(52,48,44,0.55)";
      c.fill();
      ZS.wline(c, a.x + 3 * a.dir, a.y - 6 - hop, a.x + 7 * a.dir, a.y - 7 - hop, s + 2, 0.5);
      c.strokeStyle = "rgba(190,150,52,0.95)";
      c.lineWidth = 1.3;
      ZS.wline(c, a.x + 7 * a.dir, a.y - 7 - hop, a.x + 10 * a.dir, a.y - 6.4 - hop, s + 3, 0.4);
      c.strokeStyle = "rgba(52,48,44,0.95)";
      c.lineWidth = 1.4;
      ZS.wline(c, a.x - 1, a.y - 1, a.x - 2, a.y + 3, s + 5, 0.4);
      ZS.wline(c, a.x + 1, a.y - 1, a.x + 2, a.y + 3, s + 6, 0.4);
    },

    rat(c, a, t) {
      const s = a.seed;
      const run = Math.hypot(a.vx, a.vy) > 14;
      c.strokeStyle = "rgba(96,88,78,0.9)";
      c.lineWidth = 1.6;
      ZS.wcirc(c, a.x, a.y - 1, 3.2, s, 0.7);
      c.fillStyle = "rgba(96,88,78,0.5)";
      c.fill();
      ZS.wline(c, a.x + 2.6 * a.dir, a.y - 2, a.x + 5 * a.dir, a.y - 2.6, s + 1, 0.4);
      // tail
      c.lineWidth = 1.1;
      ZS.wline(
        c,
        a.x - 3 * a.dir,
        a.y - 1,
        a.x - 9 * a.dir,
        a.y - 2 + Math.sin(t * 8 + s) * (run ? 2 : 0.6),
        s + 2,
        0.8,
      );
      if (run) {
        c.strokeStyle = "rgba(96,88,78,0.7)";
        c.lineWidth = 1;
        const g = Math.sin(a.gait) * 1.6;
        ZS.wline(c, a.x - 1, a.y + 1, a.x - 1 + g, a.y + 3, s + 3, 0.4);
        ZS.wline(c, a.x + 1, a.y + 1, a.x + 1 - g, a.y + 3, s + 4, 0.4);
      }
    },
  };

  /* =========================== particles ============================ */

  // one pooled array for every weather particle in the world
  const P = [];
  let pn = 0;
  let weather = "clear";
  let wind = 0.4;

  function emit(kind, x, y, vx, vy, life, r, seed) {
    let p = P[pn];
    if (!p) p = P[pn] = {};
    pn++;
    p.k = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.r = r;
    p.s = seed;
    return p;
  }

  const Art = {
    PROP,
    CRIT,

    /* ---------- static ground decals, painted once into the stain layer ---------- */
    // grass tufts, pebbles, cart ruts and flowers. They never move, so they
    // are painted straight onto the persistent canvas: zero cost per frame.
    decorate(st, world, nav, cx, cy, seed) {
      const sc = st.c;
      const rng = ZS.rng32((seed | 0) ^ 0x77af);
      const n = 900;
      sc.save();
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU;
        const r = 60 + Math.pow(rng(), 0.6) * 620;
        const x = cx + Math.cos(a) * r,
          y = cy + Math.sin(a) * r * 0.85;
        if (x < 20 || y < 20 || x > world.w - 20 || y > world.h - 20) continue;
        if (nav.cellAt(x, y) !== 1) continue;
        const k = rng();
        if (k < 0.6) {
          // a grass tuft: three blades
          sc.strokeStyle = "rgba(112,146,66,0.30)";
          sc.lineWidth = 1;
          for (let b = 0; b < 3; b++) {
            const bx = x + (b - 1) * 1.8;
            sc.beginPath();
            sc.moveTo(bx, y);
            sc.quadraticCurveTo(bx + (rng() - 0.5) * 4, y - 4, bx + (rng() - 0.5) * 7, y - 7);
            sc.stroke();
          }
        } else if (k < 0.74) {
          // a pebble
          sc.fillStyle = "rgba(126,120,108,0.22)";
          sc.beginPath();
          sc.ellipse(x, y, 1.4 + rng() * 1.6, 1 + rng(), rng() * 3, 0, TAU);
          sc.fill();
        } else if (k < 0.84) {
          // a flower
          sc.strokeStyle = "rgba(150,150,90,0.3)";
          sc.lineWidth = 0.8;
          sc.beginPath();
          sc.moveTo(x, y);
          sc.lineTo(x + (rng() - 0.5) * 3, y - 6);
          sc.stroke();
          sc.fillStyle = rng() < 0.5 ? "rgba(206,190,110,0.5)" : "rgba(196,150,160,0.45)";
          sc.beginPath();
          sc.arc(x + (rng() - 0.5) * 3, y - 6.5, 1.4, 0, TAU);
          sc.fill();
        } else if (k < 0.93) {
          // a rut: a short scratch in the dirt
          sc.strokeStyle = "rgba(140,124,96,0.16)";
          sc.lineWidth = 1.6;
          const an = rng() * TAU;
          sc.beginPath();
          sc.moveTo(x, y);
          sc.lineTo(x + Math.cos(an) * 14, y + Math.sin(an) * 8);
          sc.stroke();
        } else {
          // a mushroom or a fallen leaf
          sc.fillStyle = "rgba(160,120,70,0.28)";
          sc.beginPath();
          sc.arc(x, y, 2.2 + rng() * 1.4, 0, Math.PI, true);
          sc.fill();
        }
      }
      sc.restore();
    },

    /* ---------- props ---------- */

    prop(kind, x, y, seed) {
      return { kind, x, y, seed: seed === undefined ? Math.random() * 997 : seed, r: 16 };
    },

    drawProps(c, list, t, vis, env) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.x < vis.x0 - 30 || p.x > vis.x1 + 30 || p.y < vis.y0 - 50 || p.y > vis.y1 + 20)
          continue;
        const f = PROP[p.kind];
        if (!f) continue;
        c.save();
        f(c, p, t, env);
        c.restore();
      }
    },

    /* ---------- critters ---------- */

    critter(kind, x, y) {
      return {
        kind,
        x,
        y,
        vx: 0,
        vy: 0,
        seed: Math.random() * 997,
        dir: Math.random() < 0.5 ? -1 : 1,
        gait: Math.random() * 6,
        home: { x, y },
        graze: 0,
        bark: 0,
        fly: 0,
        think: Math.random() * 3,
      };
    },

    tickCritters(list, dt, t, nav, threat) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        a.gait += dt * (2 + Math.hypot(a.vx, a.vy) * 0.2);
        a.bark = Math.max(0, a.bark - dt);
        a.fly = Math.max(0, a.fly - dt);
        a.think -= dt;
        // bolt from the dead
        let fx = 0,
          fy = 0;
        if (threat) {
          let d2 = 1e9,
            tx = 0,
            ty = 0;
          for (let j = 0; j < threat.length; j++) {
            const z = threat[j];
            const d = (z.x - a.x) * (z.x - a.x) + (z.y - a.y) * (z.y - a.y);
            if (d < d2) {
              d2 = d;
              tx = z.x;
              ty = z.y;
            }
          }
          if (d2 < 19600) {
            const m = Math.sqrt(d2) || 1;
            fx = ((a.x - tx) / m) * 1;
            fy = ((a.y - ty) / m) * 1;
            if (a.kind === "dog" && d2 < 14400) {
              a.bark = 1.2;
              a.warn = 1; // the scenario reads this: the dog has seen them
            }
            if (a.kind === "crow") a.fly = 2.4;
          }
        }
        if (a.think <= 0) {
          a.think = 1.4 + Math.random() * 3.2;
          a.wx = a.home.x + (Math.random() - 0.5) * 90;
          a.wy = a.home.y + (Math.random() - 0.5) * 70;
          if (a.kind === "sheep") a.graze = Math.random() < 0.6 ? 2 + Math.random() * 3 : 0;
          if (a.kind === "rat") a.graze = 0;
        }
        const sp = a.kind === "rat" ? 52 : a.kind === "dog" ? 86 : 34;
        if (a.wx !== undefined && !fx && !fy && a.graze <= 0) {
          const dx = a.wx - a.x,
            dy = a.wy - a.y;
          const d = Math.hypot(dx, dy);
          if (d > 8) {
            fx = dx / d;
            fy = dy / d;
          }
        }
        const boost = fx || fy ? (a.kind === "rat" ? 2.2 : 1.6) : 1;
        a.vx += (fx * sp * boost - a.vx) * dt * 3;
        a.vy += (fy * sp * boost * 0.8 - a.vy) * dt * 3;
        const nx = a.x + a.vx * dt,
          ny = a.y + a.vy * dt;
        if (nav.isWalkable(nx, ny, false)) {
          a.x = nx;
          a.y = ny;
        } else {
          a.vx *= -0.5;
          a.vy *= -0.5;
        }
        if (Math.abs(a.vx) > 4) a.dir = a.vx > 0 ? 1 : -1;
      }
    },

    drawCritters(c, list, t, vis) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.x < vis.x0 - 20 || a.x > vis.x1 + 20 || a.y < vis.y0 - 40 || a.y > vis.y1 + 20)
          continue;
        const f = CRIT[a.kind];
        if (!f) continue;
        c.save();
        f(c, a, t);
        c.restore();
      }
    },

    /* ---------- weather ---------- */

    setWeather(kind, windDir) {
      weather = kind;
      wind = windDir === undefined ? wind : windDir;
    },
    get weather() {
      return weather;
    },

    // keep the sky stocked: rain, snow, leaves, embers, motes, fireflies
    tickWeather(dt, t, vis, env) {
      const P0 = ZS.Perf;
      const cap = P0 ? P0.cap(240) : 240;
      const w = vis.x1 - vis.x0,
        h = vis.y1 - vis.y0;
      const night = env && env.night ? env.night : 0;

      // retire the dead and compact
      let w2 = 0;
      for (let i = 0; i < pn; i++) {
        const p = P[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.k === "rain") p.vy += 260 * dt;
        else if (p.k === "snow") {
          p.x += Math.sin(t * 1.6 + p.s) * 12 * dt;
          p.vy += 6 * dt;
        } else if (p.k === "leaf") {
          p.x += Math.sin(t * 2.2 + p.s) * 26 * dt;
          p.vy = 22 + Math.sin(t * 3 + p.s) * 8;
        } else if (p.k === "ember") {
          p.vy -= 12 * dt;
          p.x += Math.sin(t * 4 + p.s) * 18 * dt;
        } else if (p.k === "mote") {
          p.x += Math.sin(t * 0.7 + p.s) * 6 * dt;
          p.vy = Math.sin(t * 0.5 + p.s * 2) * 4;
        } else if (p.k === "fire") {
          p.vy -= 26 * dt;
          p.r += 6 * dt;
        }
        if (p.life > 0 && p.y < vis.y1 + 60 && p.x > vis.x0 - 90 && p.x < vis.x1 + 90) {
          P[w2] = p;
          w2++;
        }
      }
      pn = w2;

      // how much the sky wants to add this frame
      let want = 0;
      if (weather === "rain") want = Math.min(6, w * h * 0.00016);
      else if (weather === "storm") want = Math.min(9, w * h * 0.00024);
      else if (weather === "snow") want = Math.min(7, w * h * 0.0002);
      else if (weather === "fog") want = 0;
      else want = Math.min(3, w * h * 0.00008);
      if (pn < cap)
        for (let i = 0; i < want; i++) {
          const x = vis.x0 + Math.random() * (w + 160) - 80;
          const y = vis.y0 - 40 + Math.random() * (h * 0.5);
          if (weather === "rain" || weather === "storm") {
            const s = weather === "storm" ? 1.7 : 1;
            emit(
              "rain",
              x,
              y,
              120 * wind * s,
              420 * s,
              3,
              6 + Math.random() * 5,
              Math.random() * 99,
            );
          } else if (weather === "snow") {
            emit(
              "snow",
              x,
              y,
              18 * wind + (Math.random() - 0.5) * 10,
              30 + Math.random() * 22,
              9,
              1.2 + Math.random() * 1.4,
              Math.random() * 99,
            );
          } else if (pn < cap * 0.5) {
            const k = Math.random();
            if (k < 0.6)
              emit(
                "mote",
                x,
                vis.y0 + Math.random() * h,
                6,
                0,
                4 + Math.random() * 4,
                1 + Math.random(),
                Math.random() * 99,
              );
            else emit("leaf", x, y, 26 * wind, 22, 12, 2.4 + Math.random() * 2, Math.random() * 99);
          }
        }
      // fireflies: only at night, only near the grass, only when rich
      if (night > 0.35 && ZS.Perf && ZS.Perf.rich && pn < cap && Math.random() < dt * 1.6) {
        emit(
          "fire",
          vis.x0 + Math.random() * w,
          vis.y0 + h * 0.4 + Math.random() * h * 0.6,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 8,
          4 + Math.random() * 4,
          1.4,
          Math.random() * 99,
        );
      }
      return pn;
    },

    // rain and snow are drawn in screen space, over everything
    drawSky(c, vis, t, env) {
      const night = env && env.night ? env.night : 0;
      if (weather === "fog" || weather === "storm") {
        // low banks of fog drifting across the valley
        const a = weather === "fog" ? 0.3 : 0.16;
        for (let i = 0; i < 5; i++) {
          const px = vis.x0 + ((t * 9 + i * 460) % (vis.x1 - vis.x0 + 900)) - 200;
          const py = vis.y0 + ((i * 231) % Math.max(1, vis.y1 - vis.y0));
          const g = c.createRadialGradient(px, py, 10, px, py, 300);
          g.addColorStop(0, "rgba(238,232,218," + (a * 0.5).toFixed(3) + ")");
          g.addColorStop(1, "rgba(238,232,218,0)");
          c.fillStyle = g;
          c.beginPath();
          c.arc(px, py, 300, 0, TAU);
          c.fill();
        }
      }
      for (let i = 0; i < pn; i++) {
        const p = P[i];
        const f = p.life / p.max;
        if (p.k === "rain") {
          c.strokeStyle = "rgba(120,150,170," + (0.34 * Math.min(1, f * 3)).toFixed(2) + ")";
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          c.stroke();
        } else if (p.k === "snow") {
          c.fillStyle = "rgba(246,244,238," + (0.7 * Math.min(1, f * 2)).toFixed(2) + ")";
          c.beginPath();
          c.arc(p.x, p.y, p.r, 0, TAU);
          c.fill();
        } else if (p.k === "leaf") {
          c.save();
          c.translate(p.x, p.y);
          c.rotate(t * 2 + p.s);
          c.fillStyle = "rgba(158,124,64,0.42)";
          c.beginPath();
          c.ellipse(0, 0, p.r * 1.6, p.r * 0.7, 0, 0, TAU);
          c.fill();
          c.restore();
        } else if (p.k === "fire") {
          const bl = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + p.s * 6));
          c.fillStyle = "rgba(226,214,120," + (0.5 * bl * Math.min(1, f * 2)).toFixed(2) + ")";
          c.beginPath();
          c.arc(p.x, p.y, p.r * bl, 0, TAU);
          c.fill();
        } else {
          c.fillStyle =
            "rgba(236,228,206," +
            (0.22 * Math.min(1, f * 2) * (night > 0.3 ? 0.4 : 1)).toFixed(2) +
            ")";
          c.beginPath();
          c.arc(p.x, p.y, p.r, 0, TAU);
          c.fill();
        }
      }
    },

    // one-shot: a burst of something at a point
    burst(x, y, kind, n, spread) {
      const cap = ZS.Perf ? ZS.Perf.cap(400) : 400;
      n = Math.min(n, cap - pn);
      const s0 = spread === undefined ? 60 : spread;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU,
          sp = s0 * (0.35 + Math.random() * 0.9);
        emit(
          kind === "dust"
            ? "mote"
            : kind === "blood"
              ? "rain"
              : kind === "chip"
                ? "leaf"
                : kind === "spark"
                  ? "fire"
                  : "mote",
          x,
          y,
          Math.cos(a) * sp,
          Math.sin(a) * sp * 0.7 - (kind === "spark" || kind === "smoke" ? 30 : 0),
          0.4 + Math.random() * 0.5,
          kind === "blood" ? 3 : 1.6 + Math.random() * 2,
          Math.random() * 99,
        );
      }
    },

    count() {
      return pn;
    },
    clear() {
      pn = 0;
    },
  };

  ZS.Art = Art;
})();
