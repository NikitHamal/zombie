# The Hollow — the theatre

A hand-drawn war on one vast sheet of paper. Five nations stand on the
same ground — yours in the middle, four more at the compass — and the
dead leak out of the broken places between. The derricks pay for the war.
Walls hold the line. Every enemy hall that falls brings the quiet closer;
yours falling ends it.

This is a real-time strategy game in the sketch style: drag a box around
your guns, right-click the ground, and send them.

## Run it

Double-click `index.html`. That is the whole build — no server, no
install, no bundler (`file://` works).

- `?seed=20250830` in the address bar pins the theatre, so you can fight
  the same war again. Without it, every reload is a new map.

## How to play

**The money.** The hall pays a little; oil derricks pay the war. One
derrick stands near every base, belonging to no one — park a car on it
and it changes hands. The map keeps more seeps, marked with a dark
bloom; raise a derrick of your own on any of them, out past your walls,
and your build line follows.

**The walls.** Every base is wall-bound with a gate that opens for its
own people and stays shut for everyone else. Walls drag out in a line.
Cannon turrets and gun nests can stand inside the ring or out in front of
it, and the turret's gun reaches the sky. Upgrade them (`U`), repair them
(`R`), sell them (`X`).

**The army.** Nobody fights on foot. Scout cars and tanks out of the
factory; helicopters and fighters off the airfield; gunboats down at the
dock (which needs water beside it). Select with a box, right-click to
move, right-click an enemy to attack, `A` then right-click to
attack-move, `ctrl+1`–`9` to keep a group and the number to recall it.
Supply caps the army; houses and production buildings raise the cap.

**The nations.** The Grange fights on your side. Kell, the Rustworks and
the Order fight you, each other, and whoever stands nearest when a wave
is ready. They take derricks, raise walls, and come in growing waves.

**The dead.** Nests in the ruins leak packs by day and surge at
nightfall, at every flag — including yours. A nest stops when everything
in it is burned down to nothing. Tanks and bombers do that work.

**Winning.** Burn every enemy hall down. Lose your own hall and your last
gun, and the card comes up.

## Controls

| key | what |
|---|---|
| left-drag | select your guns in a box |
| right-click | move · attack a unit or building · set a rally on a production building · toggle a gate |
| `ctrl+right` | attack-move |
| `S · H · A` | stop · hold · attack-move mode |
| `B` | the build menu · walls and barricades drag out in a line |
| `U · R · X` | on a building of yours: upgrade · repair · sell |
| `ctrl+1`–`9` · `1`–`9` | save a group · recall it |
| `WASD` / edges | the camera walks · wheel zooms |
| `F` | centre on the hall · the minimap jumps too |
| `space` · `1`–`3` | pause · speed |
| `Q` · `F3` · `K` | picture quality · the numbers · mute |
| `esc` | put down whatever you are carrying |

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
Node, and `.verify/rts-smoke.js` runs the whole war against it.
