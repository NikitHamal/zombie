# AGENTS.md — The Hollow, the theatre

A hand-drawn, "boiling line" sketch-style **real-time strategy war** on
one vast procedural sheet of paper. Five nations, the player among them:
wall-bound bases, oil derricks that pay for the war, armies of armour
and wings — nobody fights on foot — and the dead leaking out of the
ruined places in between. Command is direct — drag a box, right-click,
and the guns go.

Vanilla JS, Canvas 2D. No framework, no build step, no bundler — and it
must stay that way (see Hard constraints).

## What it was

This branch pivoted completely away from the zombie-village survival sim
(the old game lives in the branch history — `feat/village-survival` and
the commits before the RTS turn). What survived the pivot is the engine
(the clock, the nav, the camera, the painter's list, the sketch style),
the structure and unit art, and the horde itself, which stayed on as the
theatre's ambient threat. Several village files remain on disk but are no
longer loaded by the page (`js/village/kin.js`, `army.js`, `nations.js`
and the rest of that shelf); the page's script list is the source of
truth for what the game is.

## Run it

Double-click `index.html` (file:// protocol), or serve the directory with
any static server. That's the whole build. `package.json` scripts are dev
tooling only (format/lint).

- `?seed=20250830` in the query string pins the theatre; without it the
  kept seed is used (`ZS.Seed`, `js/village/chronicle.js`), and a fresh
  one is only rolled when there is none.
- There are **no save slots yet** — see Future work.

## Hard constraints

1. **Must stay double-clickable (file://).** All code is classic
   `<script src>` tags + IIFEs sharing one `window.ZS` namespace. **No ES
   modules** (CORS-blocked on file://), no imports, no build output, no
   fetch of data files.
2. **The style is the product.** Everything on the canvas is drawn with
   the sketch primitives in `js/sketch.js` (wobbly lines that re-jitter
   every 140 ms — the "boil"). New visuals must use those primitives and
   the paper palette. The overlay is DOM, but it is paper-coloured, thin,
   and gets out of the way.
3. **The zombie figure is frozen.** `js/village/figures.js` → `draw()` is
   a verbatim port of the original `ScenarioZombie.draw`, and the horde
   wears it. Do not restyle it. **Unit art is additive**: new looks are
   new painters merged into `ZS.Units.ART` from `js/rts/roster.js`, or
   new entries in `js/village/structs.js` beside their neighbours — never
   edits to the old painters.
4. **No per-frame allocations in hot loops.** Reuse arrays and records
   (the painter's list in `draw.js`, the fx records in `js/village/fx.js`);
   decay-and-prune instead of rebuild.
5. **Format with oxfmt, lint with oxlint** (Oxc tooling). Run before
   finishing any change; both must be clean (0 warnings/errors).
6. **The frame budget is a feature.** `ZS.Perf` owns it (see Performance).

## Architecture

Two layers, one contract between them:

```
index.html
└── <script src> load order (matters):
    js/sketch.js           style primitives + the stroke/point budget
    js/village/perf.js     quality tiers, fps governor, stroke counters
    js/grid.js             spatial hash
    js/nav.js              A* pathfinding + walkability mask (20 px cells)
    js/camera.js           pan/zoom/pinch camera, clamped to the world
    js/world.js            paper world (7200×5400 for the theatre)
    js/buildings.js        the cell/building index the core consults
    js/stains.js           persistent-stamp layer (blood, wrecks, scorch)
    js/village/chronicle.js  ZS.Seed — which theatre this is
    js/village/figures.js  the frozen zombie figure (the horde wears it)
    js/village/structs.js  structure catalog + every building's art
    js/village/units.js    the field catalog + the unit painters
    js/village/fx.js       arrows, shells, bursts, smoke, dust, wash
    js/rts/roster.js       the modern arms, faction paints, the money
    js/agents.js           generic entity engine (AI pass, separation, clamp)
    js/sim.js              game clock (maintain, updateAgents, tap)
    js/rts/nations.js      the four AI nations and how they think
    js/rts/horde.js        the nests, the packs, the surge, the cap
    js/scenarios/rts.js    THE GAME: map, bases, orders, combat, endings
    js/rts/ui.js           the paper overlay (command card, minimap, keys)
    js/draw.js             scene + HUD pipeline (calls back into the scenario)
    js/sound.js            WebAudio cues (no assets), unlocked on first tap
    js/main.js             bootstrap: world, camera, input, main loop
```

**The core (`js/*.js`) knows nothing about the war.** It runs the clock,
physics, spacing, navigation, camera, and rendering pipeline, and calls
the scenario for everything scenario-specific. `js/scenarios/rts.js`
owns the map, the factions, the orders, and the combat.

`ZS.debug` = `{ cam, world, nav, buildings, scenario }` — the headless
harness and any page-side inspection use it.

### Frame flow

`main.js` loop (rAF, dt clamped to 50 ms, time scale 0–3):

1. `ZS.setBoil(t)` — advances the boil epoch (line jitter).
2. `ZS.Perf.frame(dt)` — fps governor; steps the quality tier down when
   the machine struggles and back up when it doesn't.
3. `ZS.Sim.update(dt, t, world, W, H)`:
   - `scenario.maintain(...)`: the clock and the day/night turn, the
     money, the nations thinking, the horde leaking, construction,
     production, derrick capture, gates, repair, the camera under the
     player's keys, the warnings aging out.
   - `ZS.updateAgents(...)`: rebuild the spatial grid, `scenario.frame`
     (shots landing, markers fading, the defensive guns), then **two AI
     passes** — hostiles first (they get the A* budget), then everyone
     else — then separation, walkability fix-up, integration, compaction.
4. `ZS.drawScene(...)`: paper → water → `scenario.drawGround` (the
   pencil roads, the oil seeps) → stains → y-sorted trees / buildings /
   agents → `scenario.drawFX` → `scenario.drawOver` (the night wash, hp
   bars, capture arcs, order markers, the build ghost, the wall line) →
   HUD. The list is culled to the camera, so fps scales with how much
   world is visible.

### The `ZS` surface you'll actually touch

| export | what it is |
|---|---|
| `ZS.wline, ZS.wcirc, ZS.wpoly, ZS.sketchRect, ZS.lerpC` | sketch drawing (all count strokes) |
| `ZS.setBoil, ZS.jit, ZS.sjit` | boil epoch + per-seed jitter |
| `ZS.Nav` | `isWalkable`, `astar`, `los`, `nearestWalkable`, `isWater`, `markRect`; `version` bumps when the map changes |
| `ZS.Stains` | persistent stamp canvas; `register`, `splat`, `corpse`, `fillBlob` — scaled to a pixel budget on vast worlds |
| `ZS.planAndFollow, ZS.wander` | movement helpers |
| `ZS.Camera` | `fit`, `zoom`, `toWorld`, `visible(vw, vh, pad)`, `panBy`, `zoomAt`, `clamp` |
| `ZS.Sim` | `agents`, `init`, `update`, `tap` |
| `ZS.sound.event(name, x, y)` | WebAudio cue, spatialized, per-name cooldown |
| `ZS.Perf` | quality tiers, `dprCap()`, `navBudget()`, `cap(n)`, `cycle()`, `on`, `debug(...)` |
| `ZS.Figures` | `render(c, a, t)` — the frozen zombie figure plus its marks |
| `ZS.Structs` | the catalog (`CAT`), `ORDER`, `make`, `place`, `remove`, `canPlace`, `footprintClear`, `pick`, `dist`, `draw`, **`mark`** (the nav stamp for a footprint) |
| `ZS.Units` | the field catalog + painters; `render(c, a, t)` draws the muzzle, the hp bar and the selection ring |
| `ZS.Fx` | the loud shapes: `arrow/shell/burst/smoke/dust/wash/bomb/spark` + `draw` |
| `ZS.Seed` | the theatre's seed, kept in the browser |
| `ZS.Roster` | the modern arms (`CAT`), `BUILD` (money/time/supply), `TRAIN` (who turns out whom) |
| `ZS.FACPAINT` | the sash / ring / minimap colour each faction wears |
| `ZS.RtsNations` | the AI: `create`, `income`, `tick`, `think` |
| `ZS.Horde` | `create`, `tick`, `surge`, `pack`, `alive`, `allRuined` |
| `ZS.RtsUI` | the overlay; `init(scen)`, `toast`, `note`, `refresh(force)`, `act`, `setNight` |

## The game

### The shape of the theatre

7200×5400 of paper, one seeded map. The player's base stands near the
middle with a bigger ring; the Grange, Kell, the Rustworks and the Order
stand at the compass. Every base is **wall-bound**: a palisade ring with
a gate south (and north for the player), the hall and the houses inside,
the cannon turrets just outside the wire. Eleven oil seeps dot the map:
one by each base carries a neutral derrick, the rest wait with their dark
bloom for someone to raise one. Six nests of ruins leak the dead.

### The shape of a day

`BAL.DAY_LEN` 150 s of daylight, `BAL.NIGHT_LEN` 70 s of dark. No cards
between them: the clock turns, the night wash comes down, and every whole
nest surges toward your noise. Speeds 0–3 (space pauses, `1`–`3` run).

### The money

Funds only — one number. The hall pays +2/s, each owned derrick +5/s,
capped at `FUNDS_CAP` 9999. Everything costs funds: units, buildings,
upgrades; repair burns them by the second; selling returns half.
**Supply** caps the army: `SUP_START` 20, +4 a house, +6 a production
building (each per level), `SUP_CAP` 120.

### Command (true RTS)

Left drag selects a box of your guns; right-click sends them. The order
record lives on the agent (`a.ord`):

| kind | what it does |
|---|---|
| `move` | waypoint legs of `WP_LEN` 760 (so A* is never asked for the whole theatre), landing in a block formation facing the march; ignores enemies on the way |
| `amove` | the same walk, but anything inside `AGGRO` 280 dies first |
| `atk` | a unit or a building; shooters keep their range, siege guns work the wall |
| `hold` | stand, and shoot whatever comes inside `SIGHT` 320 |
| `capture` | walk onto a derrick and stand there |

Idle guns acquire on their own inside `SIGHT`. `ctrl+right-click` is
attack-move; `S` stops, `H` holds, `A` arms attack-move mode. Control
groups: `ctrl+1`–`9` keeps, the number recalls. Flyers go where they are
pointed (fighters wheel when idle, helicopters hover); gunboats steer by
feeling for the bank ahead and turn toward the deep when it comes up.

### The roster (js/rts/roster.js, on top of js/village/units.js)

| unit | the shape of it |
|---|---|
| scout car | fast, loud, everywhere · factory |
| tank | armour .55, splash, siege 2.4 · factory |
| helicopter | flies, hoses ground and air · airfield |
| fighter | bombs, never stops moving · airfield |
| gunboat | lives on the water (`a.free`) · dock |

Nobody fights on foot — the infantry that once marched this theatre is
gone, and the capture of a derrick is a car parking on it.

`shot` in the catalog decides the muzzle: `ball` and `burst` land at
once; `shell` and `bomb` are scheduled on `scen.shots` and go off in
`_land` with a splash and a siege multiplier on walls. Armour is a flat
fraction off damage unless the shot is `ap`. The factory turns out the
vehicles, the airfield the wings, the dock the boats — production is a
per-building queue, and a right-click on a production building sets its
rally.

### Walls, gates, and the guns that stand still

Walls drag out in a line (arm one, drag, and every ghost the funds can
buy stands up). Gates open for their own within 84 px and shut again —
right-click toggles one by hand. **`Structs.mark`** stamps the nav for a
footprint snapped out to 20 px cell boundaries: nav cells keep their
centres, and a 16 px wall lands between two of them, so thin footprints
must grow or they block nothing (this bug sealed and unsealed the whole
ring once). Cannon turrets (`turret`, 300+26/lvl range, hit flyers) and
gun nests (`gunNest`, faster, ground only) fire from `_gunsTick` in the
frame pass. Buildings upgrade (`U`) to `lvlMax`: +35% hp, +12%
production, +25% turret damage a level. Repair (`R`) trades funds for hp
and un-ruins at 30%; sell (`X`) returns half and gives the ground back.

### Territory

You build only inside your claim: `CLAIM_R` 300 from anything you own,
`FLAG_R` 430 from an outpost flag. Expansion is literal — put a flag out
past the wire and the build line moves with it. Derricks only stand on
oil seeps; docks need water beside them. Buildings raise themselves over
`BUILD.time` seconds once the funds are paid.

### The nations (js/rts/nations.js)

The Grange (fac 1) fights on your side; Kell (2), the Rustworks (3) and
the Order (4) fight you — **and each other**: a wave goes at whichever
hostile hall stands nearest, so the nations war among themselves while
they war on you. Each thinks every `THINK` 1.3 s:

1. defend the hot spot (whoever last hit something of theirs),
2. send two guns to capture the nearest neutral derrick,
3. build in its own taste (the factory first, cheap guns at the door,
   then the turret, the airfield, the dock, a second factory),
4. fill its queues from its `mix`,
5. and when the idle army reaches `WAVE_BASE` 5 + `WAVE_DAY` 1.2 a day
   (cap `WAVE_CAP` 22, at least `WAVE_GAP` 26 s apart), march it at the
   nearest enemy hall.

A hall falling is a nation done (`f.dead`): whatever still stands fights
on its last orders.

### The dead (js/rts/horde.js)

Six nests of ruined buildings, each leaking a pack every `PACK_T` 42 s
(×`NIGHT_MUL` 2.1 at night): walkers, crawlers from day 3, runners from
day 5, brutes from day 9, going at whoever stands nearest — any flag. At
nightfall every whole nest throws a **surge** toward your hall. No pack
comes while `CAP` 150 of the dead already walk. A nest stops leaking only
when everything in it is dust (hp gone, not merely ruined) — a job for a
tank, or for wings with nothing better to bomb. The dead cannot reach
flyers.

### The endings

Every enemy hall ruined → *the theatre is quiet*. Your hall ruined and
your last gun gone → *the hollow has fallen*. `scen.over` and
`scen.paused` gate both; the card reads the day, the dead put down, and
your guns lost, and a click reloads.

### Controls

| key | what |
|---|---|
| left drag · right-click | select · order (move / attack / rally / gate) |
| `ctrl+right` | attack-move · `A` toggles attack-move mode |
| `S · H` | stop · hold |
| `B` | build menu · `esc` puts it down |
| `U · R · X` | upgrade · repair · sell (your building selected) |
| `ctrl+1`–`9` · `1`–`9` | save a group · recall it |
| `WASD` / screen edges | the camera walks · wheel zooms |
| `F` | centre on the hall |
| `space` pause · `1`–`3` speed · `Q` quality · `F3` numbers · `K` mute · `?` help |

## Performance

`ZS.Perf` is the frame budget, and it is honest: three tiers (detail,
dpr, particle caps, A* budget), a governor that steps down on slow frames
and back up on fast ones, stroke/point counting under `F3`, and a culled
painter's list built from a pool.

The vast-map budgets on top of that:

- **The pre-rendered ground scales to `GROUND_BUDGET` 14 MP**
  (`world.groundSS`) and **the stain layer to 10 MP** (`Stains.k`) — a
  7200×5400 sheet must not allocate hundreds of megabytes.
- **Long orders are walked in `WP_LEN` legs**, so no single A* search is
  asked to cross the theatre (the expand budget is 12 000 cells).
- The minimap paints its ground once and its dots every 220 ms.

## Style system (`js/sketch.js`)

- **Boil**: `ZS.setBoil(t)` sets the epoch; `ZS.jit(seed)` /
  `ZS.sjit(seed)` return per-seed jitter for the current epoch — the
  "hand redrawing the lines" effect (~7 re-jit/s).
- **Primitives**: `wline`, `wcirc`, `wpoly`, `sketchRect`, `lerpC`.
- **Palette**: paper `#f3edde`, page `#efe8d8`, ink `#3d342b`; washes are
  low-alpha pastels. Faction colours come from `ZS.FACPAINT` and stay in
  that register.

## Tooling & verification (how we work)

- **Format/lint** (Oxc): `npm run format` / `npm run lint`. From non-TTY
  automation run the local bins — `npx` can hang without a TTY:
  `node node_modules/oxfmt/bin/oxfmt js/` and
  `node node_modules/oxlint/bin/oxlint js/`. Warnings are errors here:
  prefix an unused parameter with `_`, or use it.
- **`.verify/harness.js`** boots the real page headlessly: enough DOM,
  canvas and storage for `index.html` to load, plus a `frames(n)` stepper
  that drives the rAF loop. **The file list, the world size and the
  scenario name are read out of `index.html`**, so it cannot drift from
  the page. It exports `ZS`, `G` (the scenario), `frames`, `key`, `els`,
  `winHandlers`, `store`.
- **`.verify/rts-smoke.js`** runs the whole war: the five walled bases,
  the oil, the money, orders obeyed, the camp shooting back, walls
  holding, building inside the claim, training, the nations thinking, the
  night surge, the ending card. `node .verify/rts-smoke.js`, exit 0 =
  all green.
- **`ZS_RNG` pins every die** the page rolls through `Math.random()`;
  **`ZS_SEED` pins the theatre**. Pin both for any A/B: run the new
  build, stash it, run the old one, compare. A ten-minute soak is
  `frames(12000)`.
- **Balance is measured, not guessed.** Touch a `BAL`, then run the
  smoke *and* a soak — the spread is the signal, never one run.
- **No browser in this sandbox** (Playwright is a devDependency but the
  browser download is blocked). The harness plus `node --check`, oxfmt
  and oxlint are the verification path.

## What we have learned (the traps)

Things that have cost real time, so they do not cost it twice:

- **Nav cells keep their centres.** A footprint thinner than a 20 px
  cell — the 16 px walls — lands between two centres and marks neither,
  so a sealed ring leaked in 282 places. `Structs.mark` snaps a
  footprint out to cell boundaries before stamping; anything new that
  blocks movement goes through it, gates included.
- **`Structs.make()` takes the centre.** It subtracts half the footprint;
  a rotated wall must recompute `x/y/cx/cy` *after* swapping `w/h`.
- **Their dice are not our dice.** A subsystem that calls
  `Math.random()` shifts the war's whole stream, and a new feature then
  looks like a balance regression when it is only a different evening.
  Subsystems roll their own — `scen.rand()` hangs off the world seed.
  This cost half a day once, in the village that stood here before.
- **Units starting outside their walls die.** The starting armies muster
  inside the rings; keep new spawns the same way.
- **The horde needs a ceiling.** Without `CAP` the dead outnumbered every
  living thing on the map by day three.
- **A moved army is a lost army.** Guns under a plain `move` order do not
  shoot back — that is what attack-move is for, in the game and in the
  tests.
- **Object literals take commas; class bodies do not.** The scenario is
  the one class; the `js/rts/` subsystems are object literals on `ZS`.
- **After a sandbox reset `node_modules` is gone** (`npm i` again).
- **A test that measures a feature must pin everything else**, or you are
  measuring survival: the smoke test recalls its marching squad home
  before the infiltration, because a split defence is a dead defence.

## House style (code and prose)

- **The game speaks in its own voice**: plain, past-tense, a bit grim, no
  exclamation marks, no UI-speak. "the dark drops", "the derrick is
  ours", "the theatre is quiet". Player-facing text goes in the command
  card, the toasts and the ending card — never in an alert.
- **Comments are prose too**, and they explain *why*, in the same voice.
  Every file opens with the paragraph that says what it is.
- **A `BAL` at the top of every subsystem**, with the number in a comment
  and what it does; nothing magic in the body.
- **New art goes through `js/sketch.js`** (`wline`, `wcirc`, `wpoly`,
  `sketchRect`) on the paper palette. New unit looks are new painters
  merged into `ZS.Units.ART`; new building looks are new entries in
  `js/village/structs.js`. The zombie figure in `figures.js` is frozen.

## Change recipes

- **Tune a behaviour** → the `BAL` at the top of `js/scenarios/rts.js`,
  or `ZS.Horde.BAL` / `ZS.RtsNations.BAL`. Then run the smoke and a soak.
- **New unit** → a `ZS.Roster.CAT` entry (money/sup/bld/train + the
  combat numbers) + a painter in roster.js's `ART` if the old ones will
  not do.
- **New building** → `ZS.Structs.CAT` (size/hp/lvlMax) + `ORDER` + a
  painter in structs.js + a `ZS.Roster.BUILD` row (money/time/supply) +
  a `TRAIN` entry if it produces.
- **New order kind** → handle it in `ScenarioRTS.update`, and give the
  pointer/keys a way to issue it.
- **New overlay panel** → a paint step in `js/rts/ui.js` guarded by the
  signature (`sig()`), so it does not rebuild under the cursor.

## Future work (known, not started)

In rough order of want:

- **Saving.** Serialize the war (the seed, every building and unit, the
  factions' money and the derricks) to `localStorage`.
- **Fog of war** — seen / remembered ground, and the minimap to match.
- **Diplomacy that moves** — opinions, ceasefires, betrayals; right now
  the alliances are fixed at the door.
- **Transports** — trucks and landing craft hauling machines over water.
- **Air defence as its own gun**, bridges over the rivers, and more
  faction personality in the mixes and the build order.
- **Veterancy shown on the figure**, and more building art to tell the
  bases apart at a glance.

Whatever ships keeps the exact sketch style.
