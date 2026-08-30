# .verify — how this game is checked

Everything in here runs in node, with no browser. `harness.js` loads the
real page (it reads the script list out of `index.html`, so it cannot
drift), fakes just enough DOM/canvas/localStorage, and hands you a frame
stepper.

```
node .verify/<name>.js            # run one
ZS_RNG=7 node .verify/play.js 20  # pin the dice: the same evening, twice
ZS_SEED=12345 node .verify/...    # pin the map (default 20250830)
ZS_TRACE=1 node .verify/play.js   # one line a day while the bot plays
ZS_DEBUG=1 node .verify/play.js   # every bite, with the distance to the hall
```

Exit code is `0` when every check passes. A `FAIL` line names the check.

| file               | what it covers                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `harness.js`       | the page, headless. Exports `ZS`, `G` (the scenario), `frames(n)`, `key(k)`, `press(el, act, arg, who)`, `els`, `store`. |
| `ui-smoke.js`      | the overlay: every panel opens, rows click, nothing rebuilds under the cursor.                                           |
| `systems-smoke.js` | parties, fire, fever, rats, cold, despair, birth, grief, dragged barricade lines, save slots, quality tiers.             |
| `people-smoke.js`  | names, traits, memory, childhood, the factions, the cure chain.                                                          |
| `army-smoke.js`    | the ages, the 13 units, training, the field, rally, siege, supply, save/load.                                            |
| `nations-smoke.js` | the seven nations: envoys, caravans, demands, wars, invasions, peace, the panel.                                         |
| `seed-smoke.js`    | the valley is a place: a refresh, a slot, `?seed=`.                                                                      |
| `pilot-smoke.js`   | the steward: he sets the work, raises, mends, studies, recruits, arms, speaks, and leaves a hand you set alone.          |
| `play.js [days]`   | **the balance harness** — a bot that plays the game for N days and reports whether the village is still standing.        |

## The two things that make runs comparable

1. **`ZS_RNG` pins every die in the game.** Without it, `Math.random()`
   makes each run a different evening, and two builds cannot be compared.
   With it, the same build plays the same run twice — so any difference
   between two builds is a difference in the game, not in the weather.
   ```
   ZS_RNG=7 node .verify/play.js 14     # twice, with the change
   git stash && ZS_RNG=7 node .verify/play.js 14 && git stash pop
   ```
2. **Every subsystem rolls its own dice.** `ZS.rng32(seed ^ something)` —
   see `Nations` (`roll(st)`) and `Factions`. A new subsystem that calls
   `Math.random()` moves the village's own random stream and _changes the
   weather at home_; that is a bug, and it is invisible unless you know to
   look for it. (This is exactly how the nations layer looked like a
   balance regression for a day: it wasn't, it was the dice.)

`ZS_SEED` pins the map only (`?seed=` in the page); gameplay dice are
still free unless `ZS_RNG` is set.

## How balance is tuned (the loop that works)

1. Change `BAL` (top of `js/scenarios/village.js`) or a subsystem's `BAL`.
2. Run the feature's own smoke test — it is written to pin the variables
   that are not being measured (the hall's health, the larder) so a long
   stretch measures the feature, not survival.
3. Run `play.js` **three or four times** and read the spread, never one
   run. Day 14 decides whether a village gets going; day 20–26 whether it
   holds. A single red run is noise; 0/4 is a regression.
4. Only then look for the cause. Measure before guessing: `ZS_TRACE=1`
   (day, souls, food, wood, stone, buildings) shows _where_ a run dies
   long before it shows _why_.

**Known truth, not a bug:** `play.js 20` fails roughly two runs in three
on the current build _and_ on the base commit it grew from. The death
spiral is the same one: a village down to one or two souls cannot reach
the 110 food it takes to recruit, so it cannot recover. Fix that before
believing any day-20 number.

## Notes for whoever runs these

- `node_modules` is not in the repo. `npm i` first, or the oxc bins are
  missing.
- The harness's `press()` takes an element _name_ (`"panel"`), an action
  and an argument — the same `data-act`/`data-arg` the real overlay uses.
- Dawn cards pause the world (`scen.paused` while `scen.card`). Any wait
  loop must dismiss the card or it will hang until the guard counter runs
  out.
- Objects literals inside a subsystem take commas; class bodies do not.
  (`js/village/*.js` are all object literals.)
- `Structs.make()` takes the **top-left**; the UI's `_placeAt(x, y)` takes
  the **centre**. Mixing them puts buildings in the river.
- `ZS.Units.def(id)` falls back to `militia` for a bad id — which hides
  typos until something else dereferences `d.cost`. Use
  `ZS.Units.CAT[id]` when the id must be real.
