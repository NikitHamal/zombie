# .verify — how this game is checked

Everything in here runs in node, with no browser. `harness.js` loads the
real page (it reads the script list **and** the world size/scenario out of
`index.html`, so it cannot drift), fakes just enough DOM/canvas/
localStorage, and hands you a frame stepper.

```
node .verify/rts-smoke.js           # the whole war, in one file
ZS_RNG=7 node .verify/rts-smoke.js  # pin the dice: the same war, twice
ZS_SEED=12345 node .verify/...      # pin the theatre (default 20250830)
```

Exit code is `0` when every check passes. A `FAIL` line names the check.

| file           | what it covers                                                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness.js`   | the page, headless. Exports `ZS`, `G` (the scenario), `frames(n)`, `key(k)`, `els`, `winHandlers`, `store`.                                                                                              |
| `rts-smoke.js` | the five walled bases, the oil, the clock and the money, orders obeyed, the camp shooting back, walls holding, building and territory, training, the nations thinking, the night surge, the ending card. |

A soak, for balance work:

```
ZS_RNG=1 node -e "
const {ZS,G,frames} = require('./.verify/harness');
frames(12000); // ten minutes of war
console.log(G.t, G.day, G.agents.length, G.facs.map(f=>Math.floor(f.funds)));
"
```

## The two things that make runs comparable

1. **`ZS_RNG` pins every die the page rolls through `Math.random()`.**
   Without it, two builds cannot be compared; with it, the same build
   replays the same war — so any difference between two builds is a
   difference in the game.
2. **Every subsystem rolls its own dice.** The scenario keeps its own
   stream (`scen.rand()`, seeded from the world seed); a new subsystem
   that calls `Math.random()` shifts the war's stream and makes a change
   look like a balance regression when it is only a different evening.
   (This cost half a day once, in the village that stood here before.)

`ZS_SEED` pins the theatre (`?seed=` in the page); gameplay dice are
still free unless `ZS_RNG` is set.

## How balance is tuned (the loop that works)

1. Change a `BAL` — the scenario's, `ZS.Horde.BAL`, or `ZS.RtsNations.BAL`.
2. Run `rts-smoke.js` — it pins what is not being measured.
3. Soak ten minutes with `ZS_RNG` pinned, twice: once with the change,
   once against the stashed base. Compare funds, unit counts, who is
   still standing.
4. The spread is the signal, never one run.

## Notes for whoever runs these

- `node_modules` is not in the repo. `npm i` first, or the oxc bins are
  missing.
- The harness steps one rAF frame per `frames(1)`, at 150 ms of wall
  clock each; the clock clamps dt to 50 ms, so one frame advances the
  sim 0.05 s.
- Ending cards set `scen.paused`; `pointerUp` reloads the page
  (`harness.reloaded()` sees it). Any wait loop must check `scen.over`.
- Object literals take commas; class bodies do not. The scenario is a
  class; the subsystems under `js/rts/` are object literals on `ZS`.
- `ZS.Units.CAT[id]` is the roster lookup; the modern arms are merged in
  by `js/rts/roster.js`, which loads after it.
