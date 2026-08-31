# DESERT ORDER — COMPLETE DESIGN DEEP-DIVE
### Full mechanics, economy, buildings, units & math — researched & compiled for rebuilding in your own style
*Research date: 2026-08-31 · Sources: official help site (help.desertorder.com), official unit data tables (2019 & 2022 snapshots), community guides (desertordergame.blogspot.com), Desert Order Fan Club strategy threads (2019–2022), NamuWiki, s-and-j.co.uk community wiki. N.B. — the developers tweak balance frequently; figures below are a snapshot and should be treated as a "reference balance," not eternal truth.*

---

## 0. THE GAME IN ONE PARAGRAPH

**Desert Order** (desertorder.com, by Studio Hoppe → now **DITOGAMES**, German developers; browser-based, no install) is a persistent, real-time, isometric WWII desert war game played on numbered **world maps** shared by hundreds of players. You have **1 uncapturable home base** and conquer **extra bases** on the map. You produce **WWII vehicles** (tanks, SPGs, flak, copters, planes, boats, armored trains), drive them in **groups** around the big map, and fight *real players* 24/7 — **the game runs even while you're offline**, so your army can be killed while you sleep. The economy is 4 resources (Concrete, Steel, Aluminum, Oil) + a premium currency (**Gold**, real money / Polutorka trick). The whole game is an endless, map-by-map conquest ladder: the endgame is holding many bases on many maps via highways.

Key design DNA (what makes it feel like Desert Order):
1. **Eternal, shared-world PvP with real-time movement** — no build queue for troops at distance; you must physically drive your army across the map, and fuel limits how far you go.
2. **Groups** (squads) — 1 command = 1 group; everything is group-based; groups are homogeneous (one unit type).
3. **Hard cap systems** — Energy Points (building cap) and Military Points (army cap) gate everything; going over = production shuts down.
4. **Base = a defensive fortress with flaks** — you conquer bases by destroying all base defense, then driving an **APC (Conquest Truck)** inside.
5. **Rock-paper-scissors specializations** — every unit is 5× stronger vs its specialty class and 5× weaker vs everything else, so combined arms is mandatory.
6. **Map meta** — maps open over time; highways connect them; alliances fight over territory on each map.

---

## 1. CORE RESOURCES & UI LAYOUT

| Resource | Produced by | Used for |
|---|---|---|
| **Concrete** | Concrete factory | Buildings, flak guns |
| **Steel** | Steel plant (steelworks) | Almost every ground unit, trains, ships |
| **Aluminum** | Aluminum factory | Planes, helicopters, some AA/boats |
| **Oil (Fuel)** | Oil refinery (coal liquefaction) | **Movement** — every unit burns oil/sec while moving; without it armies freeze. Also used to build Polutorka/ammo. |
| **Gold** | Real money + Polutorka trick | Max buildings, upgrades, accelerations, immediate resources |

- The top HUD bar shows: **Energy (used/max), Military Points (used/max), Base points (x/10), group limit, resources, gold**, plus map number.
- **Minimap colors:** you = green, allies = blue, enemies = red/brown, empty/newbie bases = yellow, homebases = "H".
- Each resource has a **stock (storage) limit** per map; when full, factories on that map STOP producing.
- **Offline play:** the world keeps simulating. Your base stays ~15 minutes after you stop playing, then **leaves the map** — your army stays behind, unguarded! (Hence the "park AA units next to home base" meta.)

---

## 2. ECONOMY — PRODUCTION & STORAGE (official formulas)

### 2.1 Production rate depends on # of bases ON THAT MAP (diminishing returns)
```
Productivity = (number_of_bases_on_map ^ 0.5) / number_of_bases_on_map
```
| Bases on map | Effectiveness |
|---|---|
| 1 | 100% |
| 2 | 70.7% |
| 3 | 57.7% |
| 4 | 50% |
| 10 | 31.6% |
| 16 | 25% |
| 25 | 20% |
| 100 | 10% |

Example (official): 1 base with maxed steelworks → 1,000 steel/min. 4 bases → 4 × 1,000 × 50% = 2,000 steel/min. *(So more bases ≠ linear gains — a deliberate anti-turtling/anti-zerg economy.)*

### 2.2 Storage limits (per map, diminishing returns)
Each factory on the map raises that resource's storage cap:
```
Concrete storage = ROUND( √( #concrete_factories_on_map × 1000 ) ) × 1,000
Steel   storage  = ROUND( √( #steel_mills_on_map  × 1000 ) ) × 300
Alu     storage  = ROUND( √( #alu_factories_on_map × 1000 ) ) × 100
Fuel    storage  = ROUND( √( #oil_refineries_on_map × 1000 ) ) × 30
```
**Home map bonuses:** +1,000,000 concrete, +500,000 steel, +250,000 aluminum, +50,000 fuel. Having a **2nd base on the home map** adds another +750,000 concrete, +1,000,000 steel, +500,000 aluminum.

Official worked example: 3 bases with Level-11 steel mills (33 mills) on home map →
`ROUND(√(33×1000)) × 300 + 500,000 + 1,000,000 = 1,554,600` steel cap.

### 2.3 Production acceleration
- Multiplies that base's production **×3** for a duration (e.g. 100 → 300 steel/min).
- Cost: gold; duration pick 1–15 hours; aborted early → **prorated gold refund** (floor).
- While active, that base's storage limit is suspended. Cannot activate if you have ≥ **100M** of that resource.
- **Freebies:** home base gets **1 free steel acceleration/hour per day** (only if < 1M steel on home map). With ≥ 2 bases you also get **1 free aluminum hour/day** (< 1M alu).

### 2.4 Map resource level
Each map has a different **resource level multiplier and stock size** (per official help). Maps are numbered and open over time; older maps are richer/more developed.

---

## 3. THE TWO HARD CAPS: ENERGY POINTS & MILITARY POINTS

These two numbers are the heart of the whole game — everything else is gated by them.

### 3.1 Energy Points (EP) — the *building* cap
- You start with **1,000 free EP**.
- **Power Plants** (gold, 19 each) add **+100 EP**. Up to **15 per home base** (285 gold to max).
- EP consumption (per *level* of each factory, and per flak):
  - Concrete factory: **5 EP/level**
  - Steel plant: **7 EP/level**
  - Aluminum factory: **9 EP/level**
  - Oil refinery: **11 EP/level**
  - Each Flak (base defense): **9 EP**
- Example: base with all 4 factories at lvl 5 + 10 flaks = 25+35+45+55+90 = **250 EP**.
- **Tolerance:** you may exceed your cap by up to **+99 EP** and still produce fine. At **+100 over** → **all production and building stops** (except max buildings), and your storage caps become **10× smaller**.
- Consequence: conquering a high-level base suddenly adds its EP cost to your book → "Power Plant error", production crash. **Players always leave headroom.**

### 3.2 Military Points (MP) — the *army* cap
- You start with **1,000 free MP**.
- **Military Central**: +100 MP, **29 gold** each, up to 15 per home base (435 gold). Recoverable 1g.
- **Military Office**: +500 MP, cost **19 / 29 / 59 gold** (first three, home base) and **109 gold** (4th, must be on a resident base). **NOT recoverable.** (Price rises with # on map; cheaper on home map.)
- Every unit **consumes MP** (M3 Stuart = 15 MP, Lancia 3Ro = 15 MP; each unit type shows its MP in its build card).
- Units under construction **also count** toward MP (prevents queue-overflow exploits).
- Same +99 tolerance, then +100 over → cannot build/produce, **cannot use highways**, storage 10× smaller.
- **Release pressure:** lose armies in battle ("send troops to die"), or conquer more bases to build more Military Centrals.

### 3.3 Base cap
- You may hold **1 home base + 9 conquered bases = 10 base points** free.
- **Command Base (Base Command)**: +1 base max, **69 gold** each, max 3 per home base, up to 500 per map. Recoverable 1g. *(Playing 11+ bases without Command Bases breaks production — the game's warning.)*
- **Conquest vehicles (APCs) also each count as 1 base point** while they exist (official FAQ!) — so base points can exceed actual bases.

### 3.4 RECOVERY SYSTEM (anti-frustration for gold spenders — important to clone)
If a base with max buildings is destroyed, you can re-install them elsewhere at **1 gold per piece** (forever, until account reset):
- Power plant — 1g/each · Military Central — 1g/each · Base Command — 1g/each
- Flak **armor** upgrade — 9g/each · Flak **weapon** upgrade — 9g/each · **Factory extension (Base Extension)** — 9g/each
- **NOT recoverable** (lost forever if base lost): Military Office, Group Extension, Sight Tower, Jammer Tower, Detector Tower, Repair Crane (and conventional building upgrades).

---

## 4. BUILDINGS & BASE DEVELOPMENT

### 4.1 Production buildings (built on each base)
| Building | Max level | EP/level | Purpose |
|---|---|---|---|
| Concrete factory | 16 (with Base Extension) | 5 | Concrete production + concrete storage |
| Steel plant | 16 | 7 | Steel production + steel storage |
| Aluminum factory | 16 | 9 | Alu production + alu storage |
| Oil refinery | 15 | 11 | Oil/fuel production + fuel storage |

- Base cap levels are ~12-ish without gold; **Base Extension (49 gold)** unlocks the max levels 16/16/16/15 (manually maxing all four costs the equivalent of ~1,300 gold in resources).
- **Base Extension is recoverable (9g).**
- When a base changes owner by violent conquest, **50% of its production buildings are destroyed**/"reset down" — captured bases often come with refineries around **half level** (e.g. lvl 8). Always check energy before taking.

### 4.2 MAX BUILDINGS (gold, per account/map — the "pay" layer)
| Item | Gold cost | Effect | Recoverable | Max |
|---|---|---|---|---|
| Power Plant | 19 | +100 EP | yes (1g) | 15/home base |
| Military Central | 29 | +100 MP | yes (1g) | 15/home base |
| Military Office | 19 / 29 / 59 / 109 | +500 MP | **no** | 4 |
| Command Base | 69 | +1 base cap | yes (1g) | 3/home base, 500/map |
| Base Extension | 49 | factory max levels | yes (9g) | 1/base |
| Flak armor upgrade | 29 | makes flaks ~10× tougher | yes (9g) | per flak |
| Flak weapon upgrade | 99 | long-range double-barrel flak (L3) | yes (9g) | per flak |
| Group Extension | 39 / 69 / 159 | +1 group limit | **no** | 3 in total |
| Sight Tower | 9 / 29 / 99 (3 lvls) | reveals activity around base | **no** | per base |
| Jammer Tower | 19 / 49 / 99 (3 lvls) | hides base/units from Sight Towers | **no** | per base |
| Detector Tower | 29 | detects stealth units; base auto-fires | **no** | per base |
| Repair Crane | 79 / 159 / 349 (3 lvls) | repairs units to 100% HP | **no** | per base |
| Immediate Resources | 49 | +30M concrete/steel/alu (×3 with loyalty = 90M) | n/a | only if each resource < 10M |

**Blog-verified full-max home base cost ≈ 2,398 gold** (PP 285 + MC 435 + MO 107 + 3× Command Base 207 + Repair Cranes 587 + Base Extension 49 + Group Extensions 267 + Flak upgrades 128 + Sight Towers 137 + Jammers 167 + Detector 29).

**Loyalty bonus:** if your last real-money gold purchase is **≤ 2 weeks** old, Immediate Resources give **×3** (30 → 90 million each).

### 4.3 Flak guns (base defense) — the core defense loop
- Placed around a base's entrance ring; **immobile**; can fire at **ground AND air**.
- **Range +6 vs boats and trains** (they're huge).
- Start: each new base has 2 default flaks (weak — L1).
- ~9–10 range (L1/L2), up to ~13–20 for L3 long-range weapon upgrade (community-observed).
- Free L1 flaks; +29g armor upgrade ("L2"), +99g weapon upgrade ("L3").
- **Extremely strong armor + progressive armor**: the more units shoot a flak, the less each shot does — 100 Bredas do only ~3× the damage of 10 Bredas (soft damage cap by design!).
- Flak upgrades can only be activated when **no enemy (even stealthed) is nearby** and base is not under contested ownership.

### 4.4 Repair Crane levels
- L1: repairs ground units; L2: faster; **L3 repairs aircraft & helicopters too, at 2% HP/min**.
- Repair happens when units stand near the base.

---

## 5. BASE TYPE SYSTEM (production gating)

Base types are **terrain-mounted and fixed on the map** — you can't choose where they are; you conquer them:

| Base type | Marker | Produces |
|---|---|---|
| **Home base (H)** | H dot | Willys/P2(Luchs), Polutorka (gold export), discounted Lancia (50/day), basic tanks, defense, all max buildings |
| **Tank base** | plain dot | Main battle tanks, SPGs, flak tanks |
| **Air base** | `/` dot | Airplanes |
| **Helicopter base** | `|` dot | Helicopters (also **T28/Maus/Karl** — quirk: heaviest super-heavies come from the copter base) |
| **Naval base / shipyard** | near river | Boats, destroyers, submarines, amphibious APC |
| **Train base / railyard** | near tracks | Locomotives, flatcars, Panzerjägerwagen |

- **Home base only** (exclusive): Willys MB, P2 Luchs, Polutorka, discounted 50×/day Lancia (10× reduced price until the daily quota runs out).
- Advanced buildings (planes, ships, heavy tanks, subs) **require the matching base type** — that's why base selection is a strategic decision.

---

## 6. UNITS — THE COMPLETE DATABASE (~72 units)

### 6.1 The unit build card (what each unit shows in-game)
`Firepower (maybe a range: 20–5000) · Armor · W.Range · Sight · Military (MP) · Group (units per group) · Speed · Fuel (per second while moving) · Build time · resource cost`

Verified example cards:
- **M3 Stuart**: FP 250, Armor 75, Range 8, Sight 9, MP 15, Group 7, Speed 1.5, Fuel 35, 45 s build, 95,000 steel / 55,000 alu.
- **90/53 su Lancia 3Ro**: FP 20–5000 (5000 vs bases!), Armor 30, Range 10, Sight 11, MP 15, Group 19, Speed 1, Fuel 25, 9 s build, 39,000/6,500 (10× reduced daily price) — full price 390,000/65,000.
- **P2 Luchs / Breda 501**: Group 47 (per community).

### 6.2 SPECIAL ABILITY RULE (the single most important combat rule)
> **"When a unit has special abilities, its weapons are 5× stronger against its specialization and 5× weaker against everything else. (Units good against bases are 50× weaker [sic — 5× per the same note / heavily nerfed] against everything else.)"**

So a Lancia fires **5,000** at bases but only **20** at tanks. A "Good against Vehicles" unit does 5× to vehicles, 1/5× to everything else. This is why mixed armies matter and why anti-base units can't fight tanks.

### 6.3 DEFINITIONS (from official wiki notes)
- **"Good against big Vehicles"** = target **armor ≥ 1500**.
- **"Good against big Aircraft"** = aircraft **armor ≥ 2500**.
- **"2x/3x range engage"** — unit's **weapon range doubles/triples when engaging** its specialty target class (i.e. vs that class, it out-ranges almost everything).
- Specific conditional ranges:
  - T28 Super Heavy: **2× range if Vehicles move or fire**
  - SDKFZ205 Maus: **2× range if Vehicles or Trains move or fire**
  - T-34-85: **3× range if Boats move or fire**
  - FP6 Wirbelwind: **2× range if Air Units move or fire**
  - M4A1 Skink & M19 MGMC: **2× range if Aircraft move or fire**
- **T28 & SP6 Sturmtiger have no rotating turret → cannot fire while moving.**
- **Maultier, T34 Calliope, Willys MB Calliope have no AA guns** (defenseless vs air).
- Vehicles can **drive over railroad tracks**.
- **T28, Maus, Karl-Geraet 041** are built at the **copter base** only.
- **Stealth units:** Ju87 Stuka Nachtrevi, Horten Ho 229 v7, Platt-LePage XR-1 RAM copter, M-class Submarine (detected by Detector Towers / detector units like BF110 "Detector").
- **Conquest vehicles (APCs):** Conquest Truck (ground) & Conquest boat — **cannot fight**, need escorts.
- **Ammunition support vehicles (MP4/MP1, Tank-based ammo trucks, Karl ammo truck, Ammunition Transport boat):** non-attacking supply units; SPGs/howitzers/torpedo boats can run out of ammo (up to 30 rounds / special ammo per unit type); the Sturmtiger & Karl use exclusive ammo carried by their companion trucks.

### 6.4 FULL UNIT STATS TABLE — official snapshot (2022; costs/damage/armor/range/fuel)
*(`-` = n/a. Steel & Aluminum are per-unit production costs. Range = weapon range. Fuel = fuel burned per second while moving.)*

**GROUND — TANKS, SPGs, AA, TANK DESTROYERS**

| Unit | Special | Steel | Alu | Damage | Armor | Range | Fuel |
|---|---|---|---|---|---|---|---|
| Conquest Truck | APC | 45,000 | 5,000 | – | 3 | – | 20 |
| M16 MGMC | Good vs Air Units / 2× range | 45,000 | 25,000 | 200 | 7 | 5 | 10 |
| SDKFZ123 Luchs (PzKpfw II "P2") | – | 35,000 | 5,000 | 100 | 15 | 8 | 15 |
| Willys MB Calliope | 2× range engage / Fast | 65,000 | 25,000 | 500 | 7 | 8 | 5 |
| BM-13 Katyusha | 3× range engage | 850,000 | 750,000 | 5,000 | 10 | 10 | 25 |
| M4 Sherman (Heavy tank) | – | 450,000 | 200,000 | 1,500 | 150 | 10 | 50 |
| SP6 Sturmtiger Howitzer | Good against Bases | 1.97M | 900,000 | 20,000 | 1,875 | 12 | 75 |
| SDKFZ4 Maultier | 2× range engage | 375,000 | 250,000 | 950 | 15 | 10 | 30 |
| Breda 501 | Good against Bases | 95,000 | 35,000 | 250 | 30 | 10 | 15 |
| 90/53 su Lancia 3Ro | Good against Bases | 390,000 | 65,000 | 1,000 | 30 | 10 | 25 |
| Tetrarch LT Mk VII | Good against Trains | 500,000 | 15,000 | 750 | 75 | 8 | 35 |
| VK1602 Leopard LT | Good vs Boats / 3× range engage | 310,000 | 120,000 | 150 | 75 | 6 | 45 |
| M3 Stuart | – | 95,000 | 55,000 | 250 | 75 | 8 | 35 |
| T-26 | Good against weak Vehicles | 590,000 | 90,000 | 250 | 150 | 10 | 50 |
| KW2 Klimet Woroszylowa | Good vs big Vehicles / 2× range | 1.3M | 600,000 | 6,000 | 1,500 | 9 | 80 |
| SDKFZ173 Jagdpanther | Good vs Base Attack Units / 2× | 1.3M | 500,000 | 800 | 300 | 9 | 50 |
| T-34-85 | Good vs Vehicles + Boats / 3× | 2.5M | 750,000 | 400 | 600 | 8 | 50 |
| sIG33 Sturmpanzer I Bison | Good against Bases | 135,000 | 105,000 | 2,500 | 30 | 6 | 40 |
| sIG33 Sturmpanzer II Bison | Good against Bases | 390,000 | 290,000 | 1,750 | 50 | 10 | 45 |
| Wespe Howitzer | Good against Bases | 150,000 | 35,000 | 1,200 | 75 | 10 | 40 |
| SDKFZ166 Sturmpanzer IV | Good against Bases | 2.9M | 1.9M | 2,250 | 300 | 10 | 65 |
| FP6 Flakpanzer IV Wirbelwind | Good vs Air Units / 2× range | 950,000 | 300,000 | 1,000 | 375 | 8 | 50 |
| P6 Tiger I (PzKpfw VI) Heavy tank | – | 1.9M | 650,000 | 2,500 | 1,500 | 10 | 75 |
| T34 Calliope (Heavy tank) | 2× range engage | 950,000 | 250,000 | 1,500 | 150 | 10 | 60 |
| GPF SaintChamond | Good vs Bases / 3× range engage | 975,000 | 150,000 | 14,000 | 37 | 7 | 50 |
| A27M Cruiser MkIV Cromwell (Heavy) | Fast | 650,000 | 650,000 | 2,000 | 250 | 9 | 75 |
| IS-3M Stalin Tankograd (Heavy) | – | 8.9M | 3.9M | 5,000 | 3,000 | 10 | 110 |
| P6 Tiger II (PzKpfw VI B) King (Heavy) | – | 9.5M | 5.5M | 2,500 | 4,166 | 10 | 100 |
| M4A1 Skink | Good vs Aircraft / 2× range | 750,000 | 175,000 | 700 | 150 | 8 | 50 |
| M19 MGMC | Good vs big Aircraft / 2× range | 875,000 | 225,000 | 3,000 | 50 | 9 | 40 |
| SDKFZ164 Nashorn | Good vs Vehicles / 2× range | 900,000 | 300,000 | 650 | 93 | 10 | 40 |
| SDKFZ184 Elefant | Good vs Vehicles / 2× range | 13.9M | 12.9M | 675 | 4,491 | 10 | 90 |
| SU-122 (T-34) | Good against Trains | 950,000 | 390,000 | 2,250 | 500 | 10 | 75 |
| 203mm Howitzer M1931 (B-4) | Good vs Bases / 3× range engage | 1.39M | 590,000 | 12,500 | 50 | 10 | 55 |
| T28 Super Heavy tank | Good vs Vehicles / 2× range | 9.5M | 4.5M | 1,000 | 7,500 | 10 | 100 |
| SDKFZ205 (PzKpfw VIII) Maus Super Heavy | Good vs Vehicles + Trains / 2× | 11M | 3M | 1,500 | 5,000 | 9 | 125 |
| Karl-Geraet 041 Howitzer | Good vs Bases / 3× range engage | 9M | 8M | 100,000 | 750 | 12 | 150 |
| MP4 Karl Ammunition Support Vehicle | (supply) | 1.5M | 500,000 | – | 75 | – | 50 |
| MP1 Heavy Ammunition Support Vehicle | (supply) | 750,000 | 250,000 | – | 18 | – | 30 |

**HELICOPTERS**

| Unit | Special | Steel | Alu | Damage | Armor | Range | Fuel |
|---|---|---|---|---|---|---|---|
| Sikorsky-R4 copter | – | 25,000 | 225,000 | 500 | 30 | 8 | 125 |
| Focke-Wulf FW-61 copter | Good against Vehicles | 100,000 | 1.25M | 2,000 | 150 | 8 | 175 |
| Sikorsky-H5 copter | Good against Bases | 200,000 | 1.75M | 5,500 | 375 | 4 | 225 |
| Flettner FL-265 copter | Good against Air Units | 95,000 | 750,000 | 900 | 75 | 10 | 125 |
| Platt-LePage XR-1 RAM copter | **Stealth** | 390,000 | 2.95M | 2,500 | 150 | 10 | 275 |

**AIRPLANES**

| Unit | Special | Steel | Alu | Damage | Armor | Range | Fuel |
|---|---|---|---|---|---|---|---|
| IL2 Iljuschin Schturmowik | Good against Vehicles | 100,000 | 750,000 | 600 | 250 | 5 | 150 |
| Kawasaki KI-48 Sokei Bomber | Good against Bases | 450,000 | 4.5M | 7,500 | 1,000 | 5 | 750 |
| Polikarpov I15 | Good against Copters | 55,000 | 125,000 | 100 | 50 | 12 | 150 |
| Supermarine Spitfire | Good against Aircraft | 250,000 | 800,000 | 500 | 375 | 12 | 200 |
| Lockheed P38 Lightning | – | 2.5M | 8.5M | 3,000 | 3,750 | 10 | 550 |
| ME262 Messerschmitt Jet | – | 750,000 | 2.9M | 2,500 | 750 | 12 | 400 |
| B25 Mitchell Bomber | Good against Boats | 750,000 | 4.5M | 5,000 | 3,000 | 6 | 700 |
| Junkers JU87 Stuka Nachtrevi | **Stealth** | 900,000 | 1.9M | 3,000 | 375 | 8 | 400 |
| BF110 Messerschmitt | **Detector** | 490,000 | 4.9M | 900 | 2,500 | 12 | 800 |
| Handley Page Halifax Bomber | Good against Bases | 1.99M | 13.9M | 70,000 | 3,750 | 6 | 900 |
| Horten Ho 229 v7 Bomber | Good against Bases + **Stealth** | 1.9M | 19M | 90,000 | 2,000 | 6 | 2,500 |
| Mitsubishi Ki-30 | Good against Trains | 220,000 | 2.2M | 20,000 | 500 | 6 | 300 |
| Junkers JU88 | Good against Vehicles | 500,000 | 3.5M | 12,500 | 3,000 | 5 | 300 |
| Heinkel HE51 | – | 50,000 | 300,000 | 1,000 | 250 | 10 | 175 |

**BOATS / NAVAL**

| Unit | Special | Steel | Alu | Damage | Armor | Range | Fuel |
|---|---|---|---|---|---|---|---|
| Conquest boat | APC | 35,000 | 1,000 | – | 15 | – | 5 |
| MBK186 Project Patrol boat | Good against Vehicles | 4.5M | 2.5M | 1,500 | 7,500 | 18 | 45 |
| BK1125 Project AA boat | Good against Air Units | 1.5M | 350,000 | 300 | 3,000 | 10 | 35 |
| Flower class Howitzer boat | Good against Bases | 19M | 2.5M | 12,000 | 15,000 | 18 | 55 |
| Fast Attack boat | – | 45,000 | 15,000 | 100 | 10 | 12 | 5 |
| PT596 Torpedo boat | Good against Boats | 750,000 | 150,000 | 1,600 | 750 | 12 | 15 |
| M-class Submarine | attacks Boats only · **Stealth** · 2× | 3.5M | 1.5M | 2,000 | 2,500 | 8 | 90 |
| Allen M. Sumner class Destroyer | 2× range engage | 35M | 9M | 7,500 | 25,000 | 16 | 75 |
| Ammunition Transport boat | (supply) | 1.25M | 250,000 | 0 | 75 | 0 | 35 |

**ARMORED TRAINS** (track-bound; only on rails)

| Unit | Special | Steel | Alu | Damage | Armor | Range | Fuel |
|---|---|---|---|---|---|---|---|
| Train Locomotive | (engine) | 390,000 | 90,000 | 0 | 750 | 0 | 5 |
| Field Artillery Flatcar | Good against Vehicles | 850,000 | 150,000 | 750 | 500 | 18 | 10 |
| Howitzer Flatcar | Good vs Bases / 3× range engage | 4.5M | 900,000 | 12,000 | 750 | 18 | 25 |
| Anti-Air Flatcar | Good against Air Units / 2× | 1.95M | 25,000 | 1,500 | 3,750 | 12 | 20 |
| Panzerjaegerwagen | 2× range engage | 2.2M | 500,000 | 6,000 | 750 | 15 | 20 |
| Panzerjaeger Triebwagen 51 | Good vs Boats + Trains / 3× | 3.9M | 1.9M | 2,500 | 3,750 | 12 | 15 |

**ROUGH UNIT-MAKES (community consensus, for flavor/roles):**
- **Base killers:** Breda 501, Lancia 3Ro (cheap starter), Bison I/II, Wespe, GPF SaintChamond, B-4 (long-range siege), SP6 Sturmtiger, SDKFZ166, Karl, Halifax/Ho229 (air siege), Flower class, Howitzer Flatcar.
- **Anti-vehicle tanks:** Nashorn (2× range — the classic "park one at your base" guard), Elefant, T28, Maus, KW2, Jagdpanther.
- **AA:** M16 (cheap group AA, babysits ground armies), Skink (long-range vs planes), M19 (kills heavy bombers: Halifax/P38), FP6 (heavy-hitting AA, 2× vs air), BK1125 (AA boat), Anti-Air Flatcar, FL-265 (AA copter).
- **Scouting:** I15 (cheap long sight), R4 copter (cheap), XR-1 (stealth), Leopard LT (long sight ground), He51 (cheap, armored, 600 dmg vs ground).
- **Fuel pigs (watch your oil!):** Polutorka & Lancia in huge groups; Halifax ~900 fuel/s; Ju87 Stuka ~400 fuel/s and fuel-hungry when flying inefficiently; XR1 needs ~lvl-4+ oil refineries.

---

## 7. GROUPS & GROUP LIMITS

- **One group = one command.** All units in a group must be **the same unit type** (homogeneous squads — very important design choice for your clone: it forces micro-of-squads rather than blob armies... sort of).
- Each unit type has a **Group number** = how many fit in one group (M3 = 7, Lancia = 19, Breda/Luchs = 47, heavies = 1–2).
- Group limit per map (official formula):
```
Group limit = ((bases_on_map / 10) ^ 0.5) × 10     → 1 base = 3.1 · 2 = 4.5 · 3 = 5.5 · 4 = 6.3 · 5 = 7.1 · 6 = 7.7
Home map bonus: +2 (1 base → group limit 5.1)
```
- **Group Extension building:** +1 group limit; 39/69/159 gold (1st–3rd, home base); price climbs with # installed on the map (cheaper on home map); **not recoverable**.
- You cannot use highways if you are over group limit anywhere. Dropping below cap = send groups to battle or **merge groups** (combine two half groups of the same type).

---

## 8. COMBAT MECHANICS (the exact rules to implement)

1. **Auto-fire engagement.** Units fire automatically at enemies in range with their specialty multiplier; fire rate is per-unit (roughly 1 shot/sec for flaks; units differ).
2. **5×/5× specialization rule** (see 6.2). This is the core: Lancia vs base = 5,000 dmg; Lancia vs tank = 20.
3. **Progressive Armor on ALL bases:** as more attackers shoot the same target, each shot does less. Community: 100 Bredas ≈ 3× the damage of 10 Bredas (i.e. logarithmic-ish falloff). Clone: `damage_scale = 1 / (1 + k·log(n_attackers))` style, or per-flak armor that scales mildly with simultaneous attackers.
4. **Flaks (base guns):** shoot ground + air; **range +6 vs boats/trains**; extremely high armor; cannot move; L3 = long-range.
5. **Air dominance:** planes/copters can shoot any ground/naval/train unit that has **no AA capability** without any retaliation. AA units shoot them back; AA forces are mandatory for armies operating away from bases.
6. **Movement constraints:** tanks/vehicles = anywhere except obstacles (bases, rivers, mountains, forests edges); boats = river only (cheap fuel, long range); trains = tracks only (fast, long range, cheap fuel); air = anywhere (fast, expensive).
7. **No-turret units (T28, Sturmtiger):** stationary-only firing (must stop to shoot).
8. **Ammo system:** artillery/howitzer/torpedo-boat/patrol ships have limited rounds (up to 30) and need **ammunition support vehicles** nearby; Karl & Sturmtiger need their **special ammo carriers** (MP4 Karl ammo truck / No.4 tank-based ammo vehicle).
9. **Fuel:** every moving unit consumes its Fuel stat **per second**. Fuel is drawn from your map's oil pool (via refineries). Run dry → unit stops dead. **Refuel = factories produce fuel; moving armies also refill from your production over time.**
10. **HP & repair:** no permanent losses — units that survive return via **Repair Crane** (L3 also repairs air at 2%/min). Destroyed units are gone forever (resources + MP released).
11. **Damage classes:** "Good vs X" thresholds — big vehicle = armor ≥ 1500, big aircraft = armor ≥ 2500.
12. **Stealth vs detection:** stealth units (Ju87 Nachtrevi, Ho229, XR-1, M-class sub) are invisible to normal units/bases; **Detector Towers** (29g) and **BF110 Detector** planes reveal them (and the base auto-fires).
13. **Sight:** each unit has Sight (view radius, e.g. Leopard/Lancia 11). Air units with high sight = the standard spying method. Sight Towers reveal larger areas; Jammer Towers hide bases/armies from sight.

### Flak-killing math (community formula for "how long can my bomber survive")
Time a plane can stay on target ≈ `(100 − retreat_%) / ((100 − hp_left_after_1_shot) / shots_taken) − (flak_range / plane_speed) − 1`, where flak_range is ~20 for L3 bases or ~12 otherwise. (Practical wisdom: retreat at 15–20% HP, suppress flaks with ground units first, hit when <10 flaks remain.)

---

## 9. CONQUEST — HOW BASES CHANGE HANDS (exact flow)

1. Destroy **ALL base defense (flaks)** of a base → base becomes **ownerless**, **50% of production buildings destroyed**, all **max buildings explode** (recoverable at 1g by owner).
2. Drive a **Conquest Truck (APC)** (or Conquest boat for naval bases) to the base door → click base with the APC selected → base conquered, gets **2 default flaks**, production buildings reset to low level (half level per blog).
3. **Free APC:** if you have *no base at all* on a map and you kill an enemy base's defense, you get a **free APC on that map** (so you can still capture).
4. **Newbie bases (yellow dots):** can only be captured by players with **< 5 bases total** and **< 10 captures that week**; they age into normal bases open to everyone.
5. **Home bases can never be conquered** — only destroyed (owner respawns elsewhere with factories/flaks reset to starting levels). Also: **maximum buildings of other players can't be conquered** (they explode instead).
6. **Allied air-base conquest vehicle:** you can pay **250 gold** to build a Conquest Vehicle from an **allied player's airbase**, even on maps where you have no presence — the "send help to an ally on another map" mechanic.

---

## 10. HIGHWAYS — INTER-MAP TRAVEL

- 12 highways per map: **3 at the middle of each edge (N/W/S/E)**; visible as gray lines.
- **Maps 1–10 have NO highways** (starter maps are sealed). The **two newest maps** and any map **younger than 7 days** also reject highway traffic.
- Cost: **1,000 × the vehicle's per-second fuel** (e.g. Willys MB w/ 5 fuel/s = 5,000 fuel), of which **20% (1,000) arrives with the unit on the target map**. (So you pre-pay fuel to travel and keep a small reserve.)
- Arrival side = same side you left from (north → north).
- Requires: **enough free MP on target map**, **enough free group limit on target map**, no over-cap anywhere.
- Trains leave via tracks at map edge; boats via river edge; air & ground via highways.

---

## 11. ALLIANCE & SOCIAL SYSTEMS (official rules)

- Structure: **1 Leader + up to 10 Co-Leaders**; Leader/Co-Leader approve & kick members. Leader can enable "auto-accept newcomers."
- **Democracy mode** (irreversible): members >1,000 points & 3+ days in alliance can vote; leading candidate with most votes (and online in last 48h) becomes Leader.
- **Inactivity auto-kick** (no login/no action): <1,000 pts → kicked after 5 days; >1,000 → 2 weeks; >10,000 → 8 weeks. Leader inactive >5 days or 0 pts → replaced.
- Alliances >99 members can't accept (newcomers <500 pts don't count as members); >100 → every 10h the lowest-point member is auto-kicked.
- **Join/leave cooldown: 3 days.** Solo alliances dissolve after 12 h with no second member.
- Create your own alliance: **>1,000 points and account older than 2 weeks**.
- **Chat etiquette rules** (real moderation): no blocking bridges/base doors with units, no stealing bases allies killed, no asking for gold/resources (not transferable), no slurs.
- **Welcome Back:** inactive players with 1 base & no alliance get auto-placed on the newest map into a newcomer alliance.
- **Newcomer maps:** yellow newbie-base zones funnel new players vs new players — the anti-smurf measure.

---

## 12. NEW PLAYER FLOW (tutorial — clone this!)

1. Account → **training world**: you get a few **P2 Luchs tanks**. Kill a few neutral Willys jeeps, then kill a flak.
2. Get a free **APC** → conquer your first base → build concrete factory to lvl 2, steel to lvl 2.
3. Build **20 tanks** → kill another base's defense → conquer it. → Released into the real game, auto-assigned to an alliance & map.
4. **Starter quests (each pays resources):** ① build **3 Breda** ② kill a flak on a yellow base ③ conquer a base with an APC ④ build **6+ flaks** on a base.
5. First-week survival tips the meta teaches: 3 Lancias take 2 yellow bases; **Lancia/Breda for bases, Nashorn for guarding, M16 vs air, 12–16 flaks per important base.**

---

## 13. GOLD — THE MONETIZATION & FREE-PLAYER ECONOMY

- Gold is the only premium currency: max buildings, upgrades, accelerations, immediate resources, 250g allied conquest vehicles.
- **Free way to earn gold:** build **10 Polutorka (Gold Export Trucks) in the same CET day** → **+1 gold**. Polutorka: home-base only, **not queueable**, ~75k steel / ~25k alu / ~4.5k fuel each (10 ≈ 750k steel + 250k alu + 45k fuel per official table), weak, fuel-hungry — you build them *to burn resources for gold*.
- **Lancia daily quota:** ~**50 Lancías/day at 10× reduced price** from the home base (39k/6.5k instead of 390k/65k) — the free player's income stabilizer.
- **Immediate Resources:** 49g → 30M of each (90M with ≤2-week "loyalty" bonus). Only if every resource is below 10M.
- **Acceleration:** 3× production, 1–15h, gold, prorated refunds.
- Resources and gold are **not transferable** between players; account selling forbidden; 1 account per world.

---

## 14. BALANCE HISTORY — WHAT CHANGED 2019 → 2022 (proof they retune constantly)

| Unit | 2019 cost (steel) | 2022 cost | Change |
|---|---|---|---|
| SP6 Sturmtiger | 9.9M | 1.97M | −80% (was overpriced) |
| GPF SaintChamond | 2.75M | 975,000 | −65% |
| B-4 Howitzer | 1.95M | 1.39M | −29% |
| KW2 | 2.5M | 1.3M | −48% |
| Flettner FL-265 | 95k/115k alu · 450 dmg · 30 armor | 95k/750k alu · 900 dmg · 75 armor | buffed |
| Focke-Wulf FW-61 | 200k steel | 100k steel | −50% |
| M4 Sherman | 650k steel | 450k steel | −31% |
| Tiger I/II, IS-3, Maus, T28, Katyusha, Breda, Lancia (full), Wespe, Bison | — | — | unchanged |

*(Lesson for your clone: ship a table-driven economy — costs in a spreadsheet/JSON — so retuning is a data edit, not a code edit.)*

---

## 15. KNOWN GAPS (what is NOT public — decide your own numbers)

These are genuinely not published anywhere public; the official client shows them per-unit in-game only:
1. **Factory production rates per level** (only datapoint: ~174 steel/sec with 1 base fully maxed in 2019 → ~7 min per Polutorka). You'll design your own curve.
2. **Per-unit MP, Sight, Speed, Group, build times** for all 72 units (verified examples: M3 = 15 MP / 7 group / 1.5 speed / 9 sight / 45 s; Lancia = 15 MP / 19 group / 1 speed / 11 sight / 9 s; Breda & P2 = 47 group).
3. **Exact flak stats per level** (community estimates: L1/L2 = ~9–10 range, L3 = ~13–20; L2 = ~10× L1 armor).
4. **Progressive armor exact formula** (only qualitative: 100 Bredas ≈ 3× damage of 10).
5. **Per-level building upgrade costs** (concrete/steel/alu per level).
6. **Map resource-level multipliers per map number.**

---

## 16. CLONE BLUEPRINT — HOW TO REBUILD IT YOUR WAY

### Architecture recommendation
```
Game data (JSON/CSV — retune without code):
  units.json      → all unit cards (cat, cost, dmg[class-damage], armor, range, sight, speed, fuel/s, mp, group_size, build_time, specials, buildable_at, ammo?)
  buildings.json  → factories (max lvl, ep cost/lvl, prod rate, storage coeff), max buildings (gold, effects), towers & cranes
  maps.json       → map id, resource multiplier, base spawns, rivers, tracks, highway edge slots
  formulas.js     → productivity(), storage(), group_limit(), flak_damage(), progressive_armor(), range_multiplier(), damage_multiplier()
System loop (server tick ~1s):
  production → storage clamp → fuel drain (per moving unit) → unit movement/firing (range checks + specialty multipliers) → flak defense → capture check → repair → highway transfers
```

### The must-have systems checklist (the actual "Desert Order feel")
- [ ] Persistent world, **offline simulation**, numbered maps, open over time
- [ ] 1 uncapturable home base + conquerable bases (APC capture flow, 50% building decay, flak respawn = 2)
- [ ] 4 resources + fuel-as-movement + storage caps per map + **diminishing returns on more bases**
- [ ] **EP & MP triple cap system with +99 tolerance** (this is the signature tension!)
- [ ] Groups with per-type group size & group limit per map; merge groups; homogeneous groups
- [ ] Units: ~70+, WWII-flavored, with **5×/5× specialization classes** (base / vehicle / big vehicle / air / big air / copter / boat / train / weak vehicle)
- [ ] Progressive armor on bases; flaks (ground+air, +6 range vs boats/trains, L1→L3 upgrades)
- [ ] Stealth/detector & jammer/sight tower tech tree (small but deep)
- [ ] Repair cranes, ammo supply vehicles, no-regret repairs (units survive at low HP)
- [ ] Highways with fuel prepayment + MP/group gating; map-1-10 sealed; newest-map protection
- [ ] Alliances w/ roles, democracy mode, auto-kick timers, map-level territory war, chat, newcomer maps
- [ ] Gold shop w/ **recovery system** (1g rebuilds) — this is what makes gold spenders stick around
- [ ] Free-player gold faucet: daily Polutorka quota (10 → 1 gold) + daily 50× discounted Lancia + free 1h steel (and alu with 2nd base) accelerations

### Making it "your own style" (recommendations to avoid copyright issues)
- Reskin everything: your own faction names, fictional vehicle names, new art/UI (the original's UI is dated anyway).
- Keep the *mechanics* (systems & formulas aren't copyrightable) but write all lore, names, balance & art fresh. Simplify where it improves fun (e.g. cleaner UI, better pathfinding, fewer hidden "+99" overflow rules — expose caps in the UI).
- Consider **fixed-variable improvements** players will love: queue building, troop rally points, better minimap, replays, mobile-friendly input.

---

## 17. SOURCES
- Official help center: help.desertorder.com (FAQ, General, Alliances, Production, Maximum Buildings, Recovery, Unit Classes, Highways, Groups, Home Base, Base Types)
- Official unit statistics tables (community mirrors, 2019 & 2022): alpha-wars.fandom.com/wiki/Desert_Order + fandom image archive (Desert_Order_Units1.jpg, Desert_Order_Units31.jpg)
- Desert Order Game Guide blog (calculations, gold costs, tutorial, flak ranges): desertordergame.blogspot.com
- Desert Order Fan Club strategy threads (Muzhen, 2019–2022): goodreads.com group 979890
- NamuWiki "desert order" article (unit taxonomy, resource roles)
- s-and-j.co.uk "Useful Data" wiki (early-game numbers, base behavior, advice)
- Desert-Order strategy guide (desert-order.com) & browsergames.de/sueddeutsche reviews (context)

*This document is an independent research & design reference. Unit names/costs belong to DITOGAMES; build your own original game inspired by these systems.*
