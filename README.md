# The Hollow

A hand-drawn zombie survival village. There is no main character. There
are a handful of people in a ruined valley, and you tell them what to do.
By day they chop, quarry, sow, reap, build and mend. By night the dead
come out of the treeline and try to pull the village down around them.

Rebuild it. Grow it. Arm it. Keep the hall standing — when the hall
falls, the village falls with it.

## Run it

Double-click `index.html`. That is the whole build — no server, no
install, no bundler (`file://` works, including saving).

- `?seed=20250830` in the address bar pins the map and the valley, so you
  can replay the same world. Without it every reload is a new village.
- Save slots live in `localStorage` under `zs.hollow.*`.

## How to play

You never control anyone directly. You pick the work, you mark out the
buildings, and you decide what the village learns.

**The day.** Ten jobs — labourer, woodcutter, quarrier, forager, farmer,
builder, repairer, guard, healer, idle. Labourers take whatever needs
doing. Everything they gather is a round trip: cut it, carry it, and the
stores only grow when the load lands in the hall.

**The night.** It has a shape: two or three drift in early while it is
still light enough to watch them come, a trickle through the dark, a push
in the small hours, and stragglers at first light. Guards hold a line
between the hall and the wood and will not follow the fight past it.

**The door.** While the hall stands, the dead cannot reach anyone pressed
up against it — they throw themselves at the timber instead. When the
hall gives, they get in. Everything you build is in service of that door.

**Bites.** Most bites kill. Some do not. Get the bitten to an infirmary
and a healer, or watch the fever run its course.

**The valley.** Ten places beyond the wood. Send two people with ten
days' food and they walk out, come back with seed stock, nails, tools, a
cure or a stranger — or come back bitten, or not at all. Fog clears only
where feet have been.

**Other people.** There is a market town that would rather sell to you
than bury you, and a camp in the quarry terraces that would rather take
what you have. Both keep an opinion. Trade with Ashford when they are
well disposed; pay the Warrens off, or refuse them and hold the green
when they come down the road. Raiders are not the dead — they walk to
your granary, fill their arms, and run, and whatever reaches the road is
gone. Send a party to their camp and you may end it for good.

**The cure.** Four steps, and three of them are out in the valley: the
physic's chest in the chapel, the physician's ledger in the manor, the
cold box under the dead city. Bring them home, study them, and brew the
course in a level-two infirmary. Then a dose stops a bite dead — and keep
going, and one night nothing comes out of the wood at all.

**The winter.** Summer grows, autumn is the harvest rush, winter stops
the farms dead and burns a pile of wood every day to keep the cold out.

**The people.** Named, with a face and one trait, and a memory of who
pulled them out of a fire. Children are born when there is food, a spare
bed and quiet; they grow up and take work. The dead are mourned, and
grief slows every pair of hands in the village.

**Everything else that goes wrong.** Fire that spreads hut to hut. Fever.
Rats in the granary. Cold. Despair, which is answered with a feast.

## Controls

| key | what |
|---|---|
| click · drag | select · pan. **With a wall or barricade armed, drag to lay a line of them** |
| wheel · pinch | zoom |
| `V` | the roster (`shift+V` names, `tab` cycles people) |
| `B` | build (number/letter keys pick, `esc` cancels) |
| `T` | the workshop — what the village learns |
| `M` | the valley — send parties, read the map |
| `L` | the record — the ledger and the three save slots |
| `N` | ring the bell — everyone comes home (`shift+N` calls the dark down early) |
| `H` · `F` | centre on the hall · fit the map |
| `J` | job icons |
| `Q` | picture quality · `F3` the numbers |
| `space` · `1`–`3` | pause · speed |
| `K` · `?` | mute · help |

On a villager: the job keys `L W S F M B R G C X`. On a building: `U`
upgrade, `R` repair, `X` dismantle.

## A short guide to surviving the first week

1. **Two woodcutters, one forager, one guard.** Four people cannot do
   more than that.
2. **Mend the ruined huts before you raise anything new.** A roof is
   cheaper to fix than to build, and beds are the wall that stops you
   growing.
3. **Wall the green.** A ring of palisade round the hall, with a gap the
   dead want to walk into. This is the single thing that decides whether
   you see day twenty.
4. **A workshop, then spears.** Clubs lose fights. Spears hold them.
5. **An infirmary before the first bad night.** A bite you can walk to a
   healer is a story. A bite you cannot is a grave.
6. **Feed them, and when the grief is heavy, hold a feast.** Morale is a
   multiplier on everything.
7. **Go and meet the neighbours.** The workshop will tell you what it
   cannot study and why — usually because you have not been to the place
   yet. Ashford's iron is worth the walk, and the chapel's physic chest
   is where the cure starts.

## Under the skin

Vanilla JS and Canvas 2D, no framework and no build step. Every line on
the canvas is drawn by the "boiling" sketch primitives in `js/sketch.js`
— wobbly strokes that re-jitter seven times a second, so the world looks
hand-drawn every frame. The overlay is thin, paper-coloured DOM that gets
out of the way.

Load order matters and lives in `index.html`; everything shares one
`window.ZS` namespace. `AGENTS.md` is the mechanics and architecture
document — the balance numbers, the systems, the frame budget, and how to
change any of it.

Verification is headless: `.verify/harness.js` boots the real page in
Node, and `.verify/ui-smoke.js`, `.verify/systems-smoke.js` and
`.verify/play.js` (a bot that plays the game) run against it.
