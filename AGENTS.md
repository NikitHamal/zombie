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

**Tactics** (the field panel): the line takes one of four shapes —
`line` (six shoulder to shoulder, row behind row), `wedge` (a point, each
rank two men narrower than the one in front), `column` (two abreast, for a
road), `skirmish` (spread wide, for shooters) — one of two orders, `hold`
or `push` (`push` walks the line `PUSH_PX` 150 past its ground, out along
the bearing from home to the threat), and one of three things to aim at:
`near`, `big` (heaviest first), `weak` (finish the wounded). All three are
`scen.army.form/stance/focus`, saved with the army, and the steward sets
them himself (skirmish when half the line shoots, a wedge when
outnumbered, `push` when there are more of ours).

**Arms** are a fifth store: the armourer (job `smith`, key `O`) turns
scrap into arms at the smithy (1 → 1) or the foundry (2 → 3), and the
rack is capped at half of what the stores hold.

New buildings: **barracks** `r` (+4 beds a level), **stable** `g` (+3),
**foundry** `p` (+2), **airfield** `z` (+2). New studies: `gunpowder`
(`rifles`), `mechanised`, `flight`.

### The world beyond (js/village/nations.js)

Seven nations, further out than the factions in the valley, and each one
is a place with a temper: `def` holds `name · where · blurb · days` (how
far the road is) · `ang` (where on the map it sits) · `age` · `field`
(what it puts in the field) · `give` (what a caravan brings) · `want`
(what it will trade for). **The Choir** (`foe: 1`) is the burnt valley
walking: it never answers an envoy and it comes anyway, from day
`CHOIR_AT` 18, `CHOIR_N(day)` at a time, every 8–11 days.

| nation | days | temper | what it sends |
| --- | --- | --- | --- |
| the Grange | 2 | 0.65 | militia, spearmen · food |
| Kell | 4 | 0.42 | spearmen, archers, knights · wood |
| the Pale | 6 | 0.50 | mercenaries (hired, not sent) |
| the Order | 8 | 0.38 | knights, lancers · stone |
| the Salt Road | 3 | 0.55 | caravans · scrap, cloth |
| the Rustworks | 5 | 0.47 | musketeers, cannon · scrap |
| the Choir | 7 | 0.06 | everything, and word of nothing |

`Nations.daily(scen)` is called from `_newDay`, after `Factions.daily`:
opinions drift toward 0.5, you **hear of them in turn** (day `KNOW_AT` 5,
two days apart, nearest first), rides on the road count down and arrive.
Fond (≥ 0.6) nations send **caravans**; sour ones (< 0.32) send a
**demand** for 40 food, which the player pays or refuses from the panel
(`nat-pay` / `nat-refuse`); at < 0.16 they stop asking and send an army
every 6–9 days. Two beaten invasions and they sue for peace. An ally
(≥ 0.78) may ride in on a bad night (`Nations.help(scen)`, called from
`_endNight`).

**Their own dice.** `roll(st)` draws from `st._rng`, a stream seeded from
the world seed (`ZS.rng32(seed ^ 0x71ab)`). Nothing the nations do may
move the village's own random stream — otherwise the weather would change
because somebody far away was difficult. Every subsystem that rolls dice
of its own should do the same.

**Their armies are the same soldiers.** `Nations.invade` →
`Army.spawn(scen, id, true)`; `Army.kill` → `Nations.lost(scen, o)`, which
counts that nation's `left` down to zero (`f.beaten++`, and peace at
`SUE_FOR` 2). `Units.count/crew/upkeep` count `!a.foe` only — theirs must
never eat our bread or sleep in our beds.

The panel (`D`, `nationsPanel`) sketches the seven as a fan around the
hollow, the road to each one dashed until it has been walked, riders as
dots on the road, and — when it is war — how many days out the next lot
are.

### The valley is a place (js/village/chronicle.js, js/main.js)

The seed used to be rolled fresh on every refresh, so a saved game came
back to a different river. `ZS.Seed` keeps it in `localStorage`
(`zs.hollow.seed`): `?seed=N` pins it (and is remembered), otherwise the
kept seed is used, and a new one is only rolled when there is none.
`serialize()` carries `seed`, and `Chronicle.loadSlot` re-pins it before
reloading, so a slot brings its own valley back. *A new valley* in the
record panel rolls a fresh one and clears the live save.

### The steward (js/village/autopilot.js)

`P`, or the *steward* button: an autopilot that plays the village and
tells you what it did. He is not a second, hidden way of doing things —
every decision goes through the same public calls the buttons use
(`setJob`, `_placeAt`, `startResearch`, `recruit`, `Army.order`,
`Nations.send`, `Overworld.send`).

- **`Autopilot.dawn(scen)`** (from `_newDay`, after the systems) — the
  whole village thought about once: the work, three sites marked out, two
  buildings mended, the next study, an upgrade where it matters, beds
  given, soldiers raised, tribute paid or refused, envoys, a party out, a
  feast when the heart is going.
- **`Autopilot.tick(scen, dt)`** (from `maintain`, every
  `BAL.THINK` 3.2 s) — the small looks round: the work moves with the day,
  the bell is rung when panic is abroad in the dark, a feast when morale
  goes, and another site or study if the morning's plan has run dry.
- **The work** (`plan(r)`) is a list of wanted jobs the length of the
  village, filled in order: the watch first (a share of the village that
  grows with the day and jumps to 0.55 when there is something in the
  field, never more than `adults - 2`), then a healer, then the armourer,
  then the larder, the plots, the piles, the sites, the mending, and
  labourers for the rest. Assignment moves as few people as possible
  (whoever is already doing it, then whoever suits it — `fit()` reads
  `Kin.trait`), and **children never stand the watch, work the forge or
  break rock**.
- **A hand set by the player is their own until the next dawn.** `setJob(a,
  job)` marks `a.hand = day`; the steward leaves those alone. The quiet
  third argument (`setJob(a, job, quiet)`) is what he uses, so setting a
  dozen jobs does not toast or repaint the panel twelve times.
- **He explains himself**: `scen.pilot.last` and `scen.pilot.did` (the last
  six), shown at the top of the record panel and written to the ledger.
- `scen.pilot` is saved (`serialize().pilot`, `Autopilot.load`), so he is
  still in charge after a reload.

### The coach (js/village/coach.js)

Onboarding, in the game's voice: `LESSONS` is an ordered list of
`{ id, when(scen), txt }`, and `Coach.daily(scen)` (from `_newDay`) gives
**one** lesson per dawn — the first whose `when` has come true, never one
that has been said before. The current one is what `scen._hint()` shows in
the hint bar while it is still worth acting on, and what the record panel
puts at the top; each is also written to the ledger and toasted.

The gates are states, not days, wherever they can be: *work* on day 1,
*build* once a site is marked out, *hungry* when the larder drops below
two days of upkeep, *heal* when somebody is hurt, *field* once there is a
bed in the barracks, *world* once a nation has been heard of, *bite* the
first time somebody is bitten. `scen.coach` is saved (`seen`, `now`).

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
| `A` | the field — train and order the army |
| `D` | the world beyond — the nations |
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
  automation run the local bins — `npx` can hang without a TTY:
  `node node_modules/oxfmt/bin/oxfmt js/` and
  `node node_modules/oxlint/bin/oxlint js/`. No config files; the Oxc
  defaults are the house style (it wraps long calls and adds trailing
  commas — don't hand-fight it). Warnings are errors here: prefix an
  unused parameter with `_`, or use it.
- **`.verify/harness.js`** boots the real page headlessly: enough DOM,
  canvas and storage for `index.html` to load, plus a `frames(n)` stepper
  that drives the rAF loop. **The file list is read out of `index.html`**,
  so it cannot drift from the page. It exports `ZS`, `G` (the scenario),
  `frames`, `key`, `press`, `els`, `store`.
- **The verifiers** (`node .verify/<name>.js`, exit 0 = all green):
  `ui-smoke` (the overlay), `systems-smoke` (hazards, parties, birth,
  slots), `people-smoke` (kin, factions, cure), `army-smoke` (ages, units,
  the field), `nations-smoke` (the seven, their wagons and wars),
  `seed-smoke` (the valley is a place), `pilot-smoke` (the steward),
  `coach-smoke` (the onboarding), and `play.js [days]` — **the balance
  harness**, a bot that plays the game and
  reports whether the village is still there. `.verify/README.md` is the
  full list, with the environment flags.
- **`ZS_RNG` pins every die in the game.** Without it two runs are two
  different evenings and no two builds can be compared; with it, the same
  build replays itself. Use it for every A/B: run the new build, stash it,
  run the old one, compare.
- **`ZS_SEED` pins the map** (`?seed=` in the page, default 20250830);
  `ZS_TRACE=1` prints a line a day while the bot plays; `ZS_DEBUG=1`
  prints every bite with the distance to the hall.
- **Balance is measured, not guessed.** Touch a `BAL`, then run the
  feature's own smoke test *and* `play.js` three or four times — the
  spread is the signal, never one run. `play.js 20` fails about two runs
  in three on this build **and on the commit it grew from**: that is the
  known death spiral (too few hands to reach the food it takes to
  recruit), not a regression.
- **No browser in this sandbox** (Playwright is a devDependency but the
  browser download is blocked). The harness plus `node --check`, oxfmt and
  oxlint are the verification path.

## What we have learned (the traps)

Things that have cost real time, so they do not cost it twice:

- **Their dice are not our dice.** A subsystem that calls `Math.random()`
  shifts the village's whole random stream, and a new feature then looks
  like a balance regression when it is only a different evening. Every
  subsystem rolls its own (`ZS.rng32(seed ^ tag)`, see `Nations.roll` and
  `Factions`). This cost half a day once.
- **Count only our own.** `Units.count/crew/upkeep` must filter `!a.foe`,
  or an invading army eats our bread and sleeps in our beds, and the field
  reports "no room" with not one of ours in it.
- **`cancelMode()` clears the rally flag** — arm the cursor *after*
  cancelling, or nothing happens and there is no error.
- **Dawn cards pause the world.** Any wait loop that does not dismiss
  `scen.card` hangs until its guard counter gives up.
- **`ZS.Units.def(id)` falls back to `militia`**, so a typo'd id walks
  around looking fine until something reads `d.cost`. Use
  `ZS.Units.CAT[id]` where the id must exist.
- **Hard-coded resource assertions break when `BAL` moves.** Leave rack
  room before testing the armourer; pin the hall's health and the larder
  in any test that runs long enough for the village to starve.
- **`Structs.make()` is top-left, `_placeAt()` is centre.**
- **Object literals take commas; class bodies do not.** Everything in
  `js/village/` is an object literal on `window.ZS`.
- **`_placeAt(x, y)` takes the centre**, the way the pointer gives it,
  while `Structs.make()` takes the top-left. Hand a top-left to
  `_placeAt` and half your sites silently fail to place — including the
  one building you were checking for.
- **A constant declared as a property of the module object
  (`ARMS_ORDER: [...]`) is not in scope for the module's own functions.**
  Declare it `const` beside them and reference it from the object too.
- **`str(null)` in `_findWork`** — a work target with no ground under it
  (a plot whose numbers went bad) used to crash the frame. Guarded, but
  the lesson stands: anything a villager walks to can be null.
- **After a sandbox reset `node_modules` is gone** (`npm i` again) and the
  git objects may be gone too: if `git log` shows only the upstream base,
  `git fetch origin <branch> && git reset --mixed FETCH_HEAD` puts the
  branch back without touching the working tree. Check before panicking.
- **A test that measures a feature must pin everything else**, or you are
  measuring survival.

## House style (code and prose)

- **The game speaks in its own voice**: plain, past-tense, a bit grim, no
  exclamation marks, no UI-speak. "the steward takes the village in hand",
  "the larder is empty", "they will not be spoken to. They will be
  fought." Player-facing text goes in the panel's `pfoot` lines, the
  toasts and the ledger — never in an alert.
- **Comments are prose too**, and they explain *why*, in the same voice.
  Every file opens with the paragraph that says what it is.
- **A `BAL` at the top of every subsystem**, with the number in a comment
  and what it does; nothing magic in the body.
- **New subsystems are object literals on `window.ZS`**, in their own file
  under `js/village/`, loaded by a `<script src>` in `index.html` (no
  modules, no bundler, `file://` must work). They own their state
  (`create(seed)` / `load(scen, s)` / `save(scen)`), expose `daily/tick`,
  and are called from exactly one place in the scenario.
- **Panels**: a `mode` on the scenario + `panelSig`/`paint` in `ui.js` + a
  key + a bar button. The signature must not contain anything that moves
  every tick, or the panel rebuilds under the cursor.
- **New art goes through `js/sketch.js`** (`wline`, `wcirc`, `wpoly`,
  `sketchRect`) on the paper palette, and figure work is an *additive
  layer* on the frozen `draw()` in `figures.js` — never an edit to it.

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

The civilisations push (**shipped on top of tier A**, because it was asked
for before the tiers were finished): the five ages and their 13 units, the
field (`A`), the seven nations and their wars (`D`), the seed that keeps
the valley in one piece, and the steward (`P`) who plays it for you.

Tier B — B4 interiors and rooms · B5 items, wear, winter clothes ·
B6 walk the valley (an open map, not a panel).

Tier C — C8 squad tactics (**shipped**: formations, hold/push, focus
fire; the steward picks them himself). C1 horde ecology was left out by
request.

Tier D — D9 generations and legacy · D10 meta progression and challenge
modes.

Tier E — E11 climate with warnings · E12 trust between individuals ·
E13 nights you actually watch · E14 onboarding (**the coach has shipped**)
and access.

Still open from the earlier list: scout reports in the hand of whoever
went, and more identifiable building art.

## Future work (known, not started)

Scout reports written in the hand of whoever went; more structure art;
veterancy shown on the figure itself. Whatever ships keeps the exact
sketch style.
