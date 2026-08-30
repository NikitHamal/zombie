# AGENTS.md — The Hollow

A hand-drawn, "boiling line" sketch-style **zombie survival village**. One
page, `index.html`, and one scenario, `ScenarioVillage`. There is no
player character: you direct a handful of people who work by day and hide
by night, and you rebuild the village around them while the dead learn
where it is.

Vanilla JS, Canvas 2D. No framework, no build step, no bundler — and it
must stay that way (see Hard constraints).

## Run it

Double-click `index.html` (file:// protocol), or serve the directory with
any static server. That's the whole build. `package.json` scripts are dev
tooling only (format/lint).

- `?seed=20250830` in the query string pins the map; without it the world
  is new every reload. The seed also seeds the valley (the places beyond
  the wood), so a run is reproducible end to end.
- Saving is `localStorage` (`zs.hollow.*`), which works on `file://` in
  every current browser.

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
3. **The base agent figure is frozen.** `js/village/figures.js` → `draw()`
   is a verbatim port of the original `ScenarioZombie.draw`. Do not
   restyle it. New looks go **on top** as additive layers (`tool`, `load`,
   `jobGlyph`, `mood`, `zedMark`, `zedPose`) — that is how the tool in the
   hand, the load on the shoulder, the crawler's low drag, the mourning
   villager at a grave and the child's short legs all got there.
4. **No per-frame allocations in hot loops.** Reuse arrays and records
   (`_sprites`, the painter's list in `draw.js`, the particle pool in
   `art.js`); decay-and-prune instead of rebuild.
5. **Format with oxfmt, lint with oxlint** (Oxc tooling). Run before
   finishing any change; both must be clean (0 warnings/errors).
6. **The frame budget is a feature.** `ZS.Perf` owns it (see Performance).

## Architecture

Two layers, one contract between them:

```
index.html
└── <script src> load order (matters):
    js/sketch.js         style primitives + the stroke/point budget
    js/village/perf.js   quality tiers, fps governor, stroke counters
    js/grid.js           spatial hash
    js/nav.js            A* pathfinding + walkability mask
    js/camera.js         pan/zoom/pinch camera, clamped to the world
    js/world.js          paper world (2200×1600 for the village)
    js/buildings.js      procedural town (rooms, doors, occupancy)
    js/stains.js         persistent-stamp layer (splats, corpses, decals)
    js/village/art.js    props, livestock, weather, ground decoration
    js/village/figures.js  the figures (frozen base + additive layers)
    js/village/structs.js  23 building kinds: cost, time, hp, and their art
    js/village/kin.js    named people: traits, memory, morale, birth, grief
    js/village/hazards.js  fire, fever, rats, cold, despair
    js/village/overworld.js  the valley: 10 places, parties, fog, loot tables
    js/village/people.js    other people: trade, tribute, raids (st === 3)
    js/village/cure.js      the four steps, the dose, and the end of it
    js/village/chronicle.js  the ledger and the three save slots
    js/village/ages.js    the five ages: what the village has become
    js/village/units.js   the roster: 13 things that fight, and their art
    js/village/fx.js      the noise of a battle: arrows, shells, smoke, dust
    js/village/army.js    the field: training, orders, the line, the bread
    js/agents.js         generic entity engine (AI pass, separation, clamp)
    js/sim.js            game clock (day/night, tap)
    js/scenarios/village.js  THE GAME: jobs, tasks, buildings, research, night
    js/village/ui.js     the DOM overlay (paper, keyboard-first)
    js/draw.js           scene + HUD pipeline (calls back into the scenario)
    js/sound.js          WebAudio cues (no assets), unlocked on first tap
    js/main.js           bootstrap: world, camera, input, main loop
```

**The core (`js/*.js`) knows nothing about zombies.** It runs the clock,
physics, spacing, navigation, camera, and rendering pipeline, and calls
the scenario for everything scenario-specific. The village scenario owns
who the people are, how they work, and how a night plays out.

`ZS.debug` = `{ cam, world, nav, buildings, scenario }` — the headless
harness and any page-side inspection use it.

### Frame flow

`main.js` loop (rAF, dt clamped to 50 ms, time scale 0–3):

1. `ZS.setBoil(t)` — advances the boil epoch (line jitter).
2. `ZS.Perf.frame(dt)` — fps governor; steps the quality tier down when
   the machine struggles and back up when it doesn't.
3. `ZS.Sim.update(dt, t, world, W, H)`:
   - if `scenario.left(agents) === 0` → the village has fallen: the
     results card goes up, `wave++`, `scenario.init(...)` restarts the run;
     otherwise `scenario.maintain(...)` runs the clock (day → dusk →
     night → dawn → new day).
   - `ZS.updateAgents(agents, dt, t, world, wave)`: rebuild the spatial
     grid, `scenario.frame(...)` (village-wide logic: hazards, weather,
     parties, kin, autosave), then **two AI passes** — hostiles first (they
     get the A* budget), then everyone else — then separation, walkability
     fix-up, integration, compaction.
4. `ZS.drawScene(...)`: paper → water → `scenario.drawGround` → stains →
   y-sorted trees / buildings / **scenario sprites (props, livestock,
   see `extraSprites`)** / agents → `scenario.drawFX` → speech bubbles →
   `scenario.drawOver` (night wash, weather, fire) → HUD. The list is
   culled to the camera, so fps scales with how much world is visible.

### The `ZS` surface you'll actually touch

| export | what it is |
|---|---|
| `ZS.wline, ZS.wcirc, ZS.wpoly, ZS.sketchRect, ZS.lerpC` | sketch drawing (all count strokes) |
| `ZS.setBoil, ZS.jit, ZS.sjit` | boil epoch + per-seed jitter |
| `ZS.Nav` | `isWalkable`, `astar`, `los`, `nearestWalkable`, `randLand`, `inForest`; `version` bumps when the map changes |
| `ZS.Stains` | persistent stamp canvas; `register`, `splat`, `corpse`, `fillBlob` |
| `ZS.planAndFollow, ZS.wander` | movement helpers |
| `ZS.Camera` | `fit`, `zoom`, `toWorld`, `visible(vw, vh, pad)`, `autoSeek` |
| `ZS.Sim` | `agents`, `wave`, `init`, `counts`, `update`, `tap` |
| `ZS.sound.event(name, x, y)` | WebAudio cue, spatialized, per-name cooldown |
| `ZS.Perf` | `detail/amp/glow/decal/rich`, `dprCap()`, `navBudget()`, `cap(n)`, `setTier`, `cycle()`, `beginList/take/endList`, `debug(...)`, `on` |
| `ZS.Figures` | `render(c, a, t)` — the frozen figure plus the village's layers |
| `ZS.Structs` | `CAT` (19 kinds), `ORDER`, `make`, `place`, `canPlace`, `footprintClear`, `draw`, `glow`, `smoke`, `flames`, `rubble` |
| `ZS.Art` | props (`PROP`), livestock (`CRIT`), weather, `decorate`, `burst`, `drawSky`, `tickWeather` |
| `ZS.Kin` | `make`, `born`, `trait`, `speed/work/carry/fight/fear/hp/study/heal`, `remember`, `rememberAll`, `tick`, `daily`, `birth`, `mourn`, `describe` |
| `ZS.Hazards` | `create`, `daily`, `ignite`, `infect`, `leave`, `feast`, `tick`, `alerts`, `draw` |
| `ZS.Overworld` | `create`, `def`, `site`, `travelTime`, `canSend`, `send`, `tick`, `rollSite`, `progress` |
| `ZS.Chronicle` | `slots`, `save`, `autosave`, `peek`, `loadSlot`, `clear`, `add`, `entries` |
| `ZS.VillageUI` | the overlay; `init(scen)`, `toast`, `refresh(force)`, `act`, `key` |

## The game

### The shape of a day

`BAL.DAY_LEN` 120 s of daylight, 9 s of dusk, `BAL.NIGHT_LEN` 70 s of
night, 12 s of dawn. The clock runs at four speeds (0–3, keys `1`–`3`,
space pauses). Work happens by day; at dusk everyone comes in; at night
the dead come out; at dawn the card comes up and `Kin.daily`,
`Hazards.daily` and the autosave run.

### The night, staged (idea 3)

Nights are not a flat stream. The queue is built in `_startNight`:

| stage | when | what |
|---|---|---|
| `scouts` | first 12% | two or three drift in early, while it is still light enough to watch them come |
| `trickle` | to 40% | the steady filter through the dark |
| `push` | to 72% | the push — the rest arrive together |
| `stragglers` | to the end | first light, and the last few |

The HUD names the stage, and two of them toast. Zombie kinds join by day:
`crawler` from day 3 (legs gone, rides low, drags), `runner` from day 5,
`brute` from day 9, `wailer` from day 10 (keeps its distance and **screams**,
each scream pulling one more out of the wood — three screams a night,
no more).

**The door.** While the hall stands (above 28% of its hp) the dead cannot
reach anyone pressed up against it — they throw themselves at the timber
instead. When the hall gives, they get in. That single rule is the shape
of the whole defence: the huddle is safe, the people who are not in it are
not, and the hall's hit points are the village's real hit points.

**Guards hold a line.** `_shield()` picks the line between the hall and
wherever the dead are; a guard will not follow the fight further than
`BAL.LEASH` (230 px) from it, and falls back through the door below 32%
hp. Chasing into the treeline is how villages lose their watch.

### Work and jobs

Ten jobs (roster `V`, or click a person): labourer, woodcutter, quarrier,
forager, farmer, builder, repairer, guard, healer, idle. `_findWork`
picks a task by need and priority — a fire outranks everything, then the
dying, then grief (one person goes and stands at a grave), then the
season's work, then stockpiling.

Carrying is a round trip: gather at the node, walk it to the hall, and the
stores only grow when the load lands. `storeCap(kind)` caps each good
(the granary adds a lot of food room).

### Structures (19)

hall, hut, farm, quarry, store, shed, wall, tower, post, beacon, infirm,
shop, well, **mill**, **smith**, **granary**, **kennel**, **shrine**,
**barricade**. Each kind costs `{w,s,c}`, takes time and materials at the
site (`b.mat`, `b.prog`), and has its own art and its own effect:

- **mill** — flour: food goes further at the table.
- **smith** — the forge: `smithMul()` on guard damage, and powder weapons
  (rifle/shotgun/smg) only stay in order while a smithy is standing.
- **granary** — food room, and upkeep is cheaper out of a full granary.
- **kennel** — dogs: sight radius, so the watch sees them coming.
- **shrine** — the souls are kept there; `shrineMul()` lifts every pair of
  hands, and it grows with the dead.
- **barricade** — cheap, quick, and **dragged out in a line** (see below).
- **tower / post** — sight and guard capacity; the watch forms on them.
- **beacon** — firelight: the dead shy from it and move at 62% speed
  within its radius.

**Dragging a line.** Arm a wall or a barricade and drag on the ground:
`pointerDown/Move/Up` (claimed from the camera) lays a row of ghosts with
per-piece cost and a live "out of stores" marker, and drops as many as you
can pay for. The horde pathfinds around them and piles at the gap.

### The valley (idea 1, 2, 9)

Ten places beyond the wood, at 42–235 "minutes" out: the Alder
farmstead, the quarry, the mill, the chapel (physic), the manor, Ashford,
the Warrens, the refugee camp, the river crossing (people), the dead city.
Send **two** for
`10 food` and a walk of `def.d * 2.2` seconds each way. What comes back is
rolled on the site: seed stock, nails, tools, a cure, a stranger — or a
bite, or nobody (`rollSite`). Fog clears only where feet have been:
`seen` 0 unknown → 1 rumoured → 2 scouted → 3 worked, and the panel draws
the map with a scribbled cloud over everything you have not walked to.

`serialize()` carries parties in the field, so closing the browser does
not strand anybody out there.

### The ages and the field (js/village/{ages,units,fx,army}.js)

A village becomes a civilisation in five steps, and each step is something
you can see from the green:

| age | what it takes | what it opens |
| --- | --- | --- |
| a refuge | — | militia, spearmen |
| a manor | hall level 2 + a barracks | cart, archer, knight, lancer, mounted knight, stable |
| a forge | a smithy + `gunpowder` | musketeer, cannon, foundry |
| a foundry | a foundry + `mechanised` | machine gun team, tank |
| an airfield | an airfield + `flight` | helicopter, fighter |

`Ages.of(scen)` is read by the build menu (`armBuild` refuses what is ahead
of the age), by the field panel, and by `Army.order`. `Ages.next(scen)`
says what is still missing, in the village's own words.

**Soldiers are `st === 4`**, `a.unit` is an id from `Units.CAT`, and
`a.foe` marks the other side. They are agents like anybody else: the core
moves them, separates them, y-sorts them and lifts them from the field.
`scen.update` hands them to `ZS.Army.update`, which finds something to
fight (`opposed`: ours shoot the dead, raiders and theirs; theirs shoot
the living and ours) or walks them to their place in the rank
(`slotAt(post(scen), a.slot)` — six shoulder to shoulder, row behind row).

Shooting is `shot` in the catalog: `melee` · `arrow` · `ball` · `burst`
land at once, `shell` and `bomb` are scheduled (`army.shots`) and go off
under `Army.land` with a splash and a siege multiplier against walls.
Flyers (`fly: 1`) set `a.free`, so they go over walls, water and the dead's
hands — and nothing on the ground can reach them.

**Bread.** Every unit eats `d.eat` a day, charged at dawn
(`Army.dawn`) before the village's own upkeep. Fight further than
`SUPPLY_R` 430 px from the stores and the army starves unless a **cart**
is within `CART_R` 220 px of it; starving units lose health, and one below
`DESERT` 22% walks home for good.

**Arms** are a fifth store: the armourer (job `smith`, key `O`) turns
scrap into arms at the smithy (1 → 1) or the foundry (2 → 3), and the
rack is capped at half of what the stores hold.

New buildings: **barracks** `r` (+4 beds a level), **stable** `g` (+3),
**foundry** `p` (+2), **airfield** `z` (+2). New studies: `gunpowder`
(`rifles`), `mechanised`, `flight`.

### Other people (js/village/people.js)

Two of them, and both of them keep an opinion (`0` blood enemies → `1`
fast friends, drifting back to `0.5` by `DRIFT` 0.012 a dawn):

- **Ashford** — a market town. Warm (`opinion ≥ 0.55`) and they send a
  caravan every fourth day: 30 food for 26 scrap and 6 cloth.
- **the Warrens** — a camp in the quarry terraces. Cold (`opinion < 0.46`)
  and they send a demand: 34 food or they come within two days.

You meet them by walking to their place (`Overworld` marks `met`, and the
loot roll carries `met`/`cleared` home with the party). Answer with the
buttons in the valley panel: `trade` · `pay` · `refuse`. Refusing sours
them by 0.18 and starts the clock.

**Raiders are `st === 3`** — living, hostile, and in `scen.raiders`
(`spawnRaiders`, `_updateRaider`). They are not the dead: they walk to the
nearest store, granary or hall, spend `STEAL_T` 2.4 s filling their arms
with up to `STEAL` 9 of one thing, and run for the nearest map edge, where
`Factions.escaped()` takes it out of your stores for good. Hurt below
`FLEE_AT` 38% they drop everything and run. They club people (`_wound`):
pain and blood, but no infection. Guards see them through `_nearestZed`,
and a dead raider costs the Warrens 0.1 opinion and some anger. Send a
party to the Warrens and there is a chance (`0.45`, if nobody was lost)
that the camp is broken and the raids stop for good.

A raid is not saved mid-fight: reload and it is over.

### The cure (js/village/cure.js)

Four steps, and the first three are places you have to go and come back
from (`Cure.onReturn`, called from `Overworld.arrive`):

1. **the physic's chest** — the chapel → research `physic`
2. **the physician's ledger** — the manor → `serum1` (needs `physic`)
3. **the cold box** — the dead city → `serum2` (needs `serum1`)
4. **the course** — brewed at home in a **level-two infirmary** → `serum3`

`Cure.gate(scen, id)` is consulted by `researchList()` (which hides what
you cannot study) and `researchLocked()` (which shows it grey in the
workshop panel, with the reason). `startResearch` refuses it too.

Finishing `serum3` yields `BAL.DOSES` 2 doses; studying it again brews
another course. A dose is spent the moment somebody's bite runs out
(`Cure.dose`): it stops the infection dead and leaves them alive at 40%
health. Three quiet dawns after the course is known (`FINAL_DAYS`), the
plague is finished: `scen.cured = 1`, the card **the last night**, and
`_startNight` stops putting anything in the wood.

### The people (idea 6, 7)

Every villager has a name, a face seed, and **one of eight traits**
(brave, quick, strong, clever, steady, kind, frail, stubborn) with
multipliers on speed, work, carry, fight, fear, hp, study and heal. They
remember (`kin.mem`) who pulled them out of a fire or saved them from the
dead, and the memory lifts their spirits.

Children are born when there is food, a spare bed, and quiet
(`morale > 0.55`, `food > 40`, 0.14 × spare beds × morale per dawn), are
born **to a named mother**, are drawn short-legged, and grow up
(`kin.grow`) to take work. The dead are mourned: `grief` rises, and grief
slows every pair of hands in the village. A hot meal (`feast`, 18 food)
lifts it — and so does a kill.

### Hazards that are not the dead (idea 10)

- **Fire** — spreads hut to hut, is fought with buckets (`douse`, and
  everyone drops everything for it), and slows in rain.
- **Fever** — takes the strength (work × 0.5, speed × 0.62) and, rarely,
  the life.
- **Rats** — in the granary, eating the grain.
- **Cold** — a winter without firewood (`winterWood` logs a day) bites
  everyone.
- **Despair** — low spirits, heavy grief: people stop working, and
  sometimes walk out at dawn.

### Bites (the one number that matters)

A bite runs for `BAL.INFECT_TIME` 80 s at `BAL.INFECT_CHANCE` 0.13 per
bite. Most bites kill. Some do not: `_fightItOff` cures anyone who is
standing at the infirmary, and gives everyone else a 40% roll (+25% with
`medicine`, +15% for the steady). Getting the bitten to a healer is the
early game's real puzzle.

### Research (the workshop, `T`)

Seventeen steps: sharp tools 1–2, spears, bows, rifles, shotguns, armour
1–2, crop rotation 1–2, medicine, stone wall, towers 2, **and the four of
the cure** (`physic` → `serum1` → `serum2` → `serum3`). Powder weapons
need a standing smithy; everything needs a workshop, and the cure needs
what it needs — see `Cure.gate` above.

### The record (idea 11)

`ZS.Chronicle` keeps the last 60 entries of the run (deaths, births,
fires, parties, the night's tally), draws them in the `L` panel, and writes
three named save slots plus an autosave at every dawn. The save is
`serialize()` v2: the map seed, the day, every structure with its
condition and materials, every person with their trait and memories, the
props, the parties, the ledger. v1 saves (the old format) still load.

### Controls

| key | what |
|---|---|
| click / drag | select, pan; **drag with a wall or barricade armed** = lay a line |
| wheel / pinch | zoom |
| `V` | the roster · `shift+V` names on and off · `tab` cycle people |
| `B` | build menu (number keys / letter keys pick, `esc` cancels) |
| `T` | the workshop |
| `H` / `F` | centre on the hall / fit the map |
| `M` | the valley (parties, the map, the fog) |
| `L` | the record (ledger, feast, save slots) |
| `N` | ring the bell — everyone comes home; `shift+N` calls the dark down early |
| `J` | job icons |
| `Q` | picture quality · `F3` the numbers overlay |
| `K` | mute · `space` pause · `1`–`3` speed · `?` help |

Selected villager: the job keys (`L W S F M B R G C X`). Selected
building: `U` upgrade, `R` repair, `X` dismantle.

## Performance (idea 12)

`ZS.Perf` is the frame budget, and it is honest:

- **Three tiers** — `smooth` (detail .34, no boil on short strokes, dpr 1,
  40 particles, 8 A* per frame), `steady` (.62, 1.5, 120, 12), `crisp`
  (1, 2, 260, 16). `Q` cycles by hand; the governor steps down after a
  run of slow frames and back up after a long stretch of fast ones, and
  says so in a toast.
- **`detail` and `amp` scale the boil itself** — `wline`/`wcirc`/`wpoly`
  take fewer sub-segments and a smaller amplitude; below detail .45 they
  stop shaking altogether (`FAST`), which is where most of the saving is.
- **Stroke and point counting** — every primitive counts; `F3` shows
  strokes, points, calls, agents, fps and the tier.
- **Culled painter's list** — `draw.js` builds the y-sorted list from a
  pool (`beginList`/`take`/`endList`) and culls to the camera.
- **Weather and particles only where you are looking** — `Art.tickWeather`
  gets the visible rect; nothing is simulated off-screen.
- **Decal cap** (`Perf.cap(n)`) — stains, props and particles are capped,
  and the static ground decoration (`Art.decorate`) is painted into the
  stain layer **once**.

## Style system (`js/sketch.js`)

- **Boil**: `ZS.setBoil(t)` sets the epoch; `ZS.jit(seed)` / `ZS.sjit(seed)`
  return per-seed jitter for the current epoch — the "hand redrawing the
  lines" effect (~7 re-jit/s). Every wobbly shape takes a seed so it
  wiggles stably.
- **Primitives**: `wline`, `wcirc`, `wpoly`, `sketchRect`, `lerpC`.
- **Palette**: paper `#f3edde`, page `#efe8d8`, ink `#3d342b`, ink-soft
  `rgba(61,52,43,0.5)`; washes are low-alpha pastels. Keep new colour in
  that register.

## Tooling & verification (how we work)

- **Format/lint** (Oxc): `npm run format` / `npm run lint`. From non-TTY
  automation, run the local bins directly — `npx` can hang without a TTY:
  `node node_modules/oxfmt/bin/oxfmt js/` and
  `node node_modules/oxlint/bin/oxlint js/`. No config files; Oxc defaults
  are the house style (it wraps long calls and adds trailing commas —
  don't hand-fight it).
- **`.verify/harness.js`** boots the real page headlessly: enough DOM,
  canvas and storage for `index.html` to load, and a `frames(n)` stepper
  that drives the rAF loop. **The file list is read out of `index.html`**,
  so it cannot drift from the page. It exports `ZS`, `G` (the scenario),
  `frames`, `key`, `press`, `els`, `store`.
- **`.verify/` scripts** (run with `node .verify/<name>.js`):
  - `ui-smoke.js` — the overlay: panels open, rows click, and nothing is
    rebuilt under the cursor.
  - `systems-smoke.js` — the newer systems, end to end: parties, fire,
    fever, birth, grief, the barricade line, the slots, the quality tiers.
  - `play.js [days]` — **a bot that plays the game**: takes each dawn,
    sets the work, lays a palisade in a ring, studies, sends parties,
    holds a feast, and reports whether the village is still there. This is
    the balance harness. `ZS_DEBUG=1` prints every bite.
- **Balance is measured, not guessed.** A wall ring, a workshop and a
  healer carry a village past day 26 with fifteen souls; forget the wall
  and it is gone by the second week. When you touch `BAL`, run
  `node .verify/play.js 26` three or four times — the spread is the
  signal, not any single run.
- **No browser in this sandbox** (Playwright is a devDependency but the
  browser download is blocked). The harness, plus `node --check`, oxfmt and
  oxlint, are the verification path.

## Change recipes

- **Tune a behaviour** → `BAL` at the top of `js/scenarios/village.js`.
  Don't touch the core for scenario concerns. Then run `play.js`.
- **New building** → `ZS.Structs.CAT` (cost/time/hp/art) + `ORDER` + the
  scenario hooks it needs (a `_first("kind")` lookup, or a multiplier like
  `farmMul()`). The art goes in `structs.js` beside its neighbours and is
  drawn through the same 20-odd helpers (`gable`, `door`, `windowLit`,
  `smoke`, `flames`, `rubble`, `cracks`).
- **New agent state** → additive layer in `figures.js` (`mood`, `zedMark`,
  a pose in `render`), never an edit to the frozen `draw()`.
- **New hazard** → `js/village/hazards.js`: a branch in `daily()` (the
  dawn roll), `tick()` (per-frame), `alerts()` (the strip) and `draw()`.
- **New overlay panel** → a `mode` on the scenario + a `panelSig`/`paint`
  pair in `ui.js` + a key. Guard the signature so the panel does not
  rebuild itself under the cursor (a number that moves every tick must
  not be in it).

## The tiers (the plan being worked through)

Tier A (**shipped**) — A2 other people · A3 the cure. A1 the road out was
left out by request.

Tier B — B4 interiors and rooms · B5 items, wear, winter clothes ·
B6 walk the valley.

Tier C — C8 squad tactics. (C1 horde ecology was left out by request.)

Tier D — D9 generations and legacy · D10 meta progression and challenge
modes.

Tier E — E11 climate with warnings · E12 trust between individuals ·
E13 nights you actually watch · E14 onboarding and access.

## Future work (known, not started)

Scout reports written in the hand of whoever went; more structure art;
veterancy shown on the figure itself. Whatever ships keeps the exact
sketch style.
