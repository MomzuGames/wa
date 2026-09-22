# CLAUDE.md — Project Brief

> Title: **Chōwa** (renamed from the working title LUMA; the name lives in one constant in `src/config/game.ts`).
> This file is the single source of truth. Re-read the relevant section before starting any phase.

---

## 1. Vision

A calm, beautiful, wordless puzzle game played in the browser on a laptop.
The player journeys across a **world map of 6 regions**, all open from the start. Each region is one visual puzzle type with its own deep difficulty curve. Finishing one region lights it up and opens the path to the next.

The feeling to aim for: **meditative focus**. Think soft glowing light on black, slow breathing motion, gentle generative music, and a steady sense of mastery.

### Character
- **The light** is the player's companion: a small creature with a blinking face (`ui/face.ts`). On the title it hops up onto the letters; on the map it orbits the current region and leaves a streak of light when it travels; on the trail it hops to your level; in a level it sits by the level number, does little antics when idle, flinches on a mistake and spins with sparks on a solve. Scenes talk to it only through `spirit:*` events (`ui/spirit.ts`).
- **Every hint explains itself.** `showClue` returns a caption shown in a toast (`ui/toast.ts`); hints are one concrete thing at a time and region-specific (a tile turns into place; a start star pulses; a stone outline appears; a mirror locks; one pad glows). After all four tiers, the hint button keeps giving concrete steps.
- **Depth and scenery:** a spotlight under every puzzle, shadows under tiles, stones and pads, a colour wash and region-specific backdrop (`fx/atmosphere.ts`: caustics, star field, raked sand, crystal facets, waves and fireflies) plus a night landscape per region (`fx/scenery.ts`: headland and shore with rolling waves; mountain ranges with pines and a river; rolling hills with bamboo; a cave with stalactites and a glowing stream; hills over a lake with the moon's reflection), all with pointer parallax, plants swaying in the wind and silhouette birds passing now and then. The map shows each region's name and colour pool on hover/focus.
- **Nothing is static.** The map drifts slowly, stars twinkle, each region figure has its own idle life, light pulses travel along completed trails, and every region has an atmosphere layer (`fx/atmosphere.ts`) behind its trail and puzzles.
- **Instruction cards** (`ui/levelIntro.ts`) show level number, chapter dots, a looping animated demo (`LevelScene.introGlyph`), short caption lines (`LevelScene.introLines`) and a continue button. A card appears by itself only when a level's lines contain something the player has not seen in that region (tracked in the save); the `?` button in the HUD reopens it any time. The bulb button asks "Would you like a hint?" and reveals the next clue tier on yes, even before it is earned.
- **Music:** the drone plays on the title screen, the map is quiet, and each region has its own generative bed (`audio/beds.ts`) that plays on its trail and in its levels, cross-faded by `AudioEngine.setScene`. Map audio layering is intentionally not implemented.

### Non-negotiable principles
1. **No word puzzles.** The UI uses icons and motion, not text. Text is allowed only for the title logo, level numbers, the small move counter, and the short captions on each level's instruction card (the owner asked for clearer instructions).
2. **Black and light pastel only.** Use near-black backgrounds with soft pastel light. No saturated colours, and no pure white except as a tiny highlight.
3. **Nothing harsh.** No red error flashes, buzzers, shaking screens, timers or countdowns. Failure is shown as a gentle unravel or fade.
4. **The answer is never shown in full.** Clues unlock progressively after failed attempts (see §7).
5. **Animation quality is a feature.** Everything eases smoothly, nothing snaps, and the game holds 60fps.
6. **Every level must be provably solvable.** Generators are verified by solvers in automated tests.
7. **Teach by showing.** The first level of each region is trivially easy, with a soft ghost-hand demonstration and no text.

---

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Build | **Vite** + **TypeScript** (strict mode) |
| Rendering | **PixiJS v8** (WebGL) + **pixi-filters** (bloom/glow) |
| Animation | **GSAP 3** |
| Audio | **Tone.js** (all sound generated in code; no audio files) |
| Tests | **Vitest** |
| Fonts | `@fontsource/quicksand` (bundled locally so it works offline) |
| Installable app | **vite-plugin-pwa** (installable from Chrome/Edge, works offline) |
| Save data | `localStorage`, one save per local profile ("light"); no accounts, nothing leaves the device |
| Hosting | GitHub Pages from the `wa` repo via `.github/workflows/deploy.yml`; built with `base: '/wa/'` |

Use the latest stable versions. Don't add other frameworks (no React, no game engines) without asking the owner.

### Scripts (package.json)
- `npm run dev`: dev server (http://localhost:5173)
- `npm run build`: production build
- `npm run preview`: serve the production build
- `npm run play`: build, then preview, then open the browser (one command for the owner)
- `npm test`: run all Vitest tests
- `npm run levels`: regenerate all level JSON files from seeds (see §9)

---

## 3. Architecture

```
Game/
├── CLAUDE.md
├── index.html
├── package.json
├── vite.config.ts
├── scripts/
│   └── generateLevels.ts        # bakes seeded levels into JSON, verified by solvers
├── public/                      # PWA icons, manifest assets
└── src/
    ├── main.ts
    ├── core/
    │   ├── app.ts               # Pixi Application, resize, devicePixelRatio
    │   ├── sceneManager.ts      # scenes: Title → Map → Region → Level
    │   ├── input.ts             # unified pointer (mouse + trackpad), keyboard
    │   ├── rng.ts               # seeded RNG (e.g. mulberry32)
    │   ├── save.ts              # versioned save/load
    │   └── events.ts            # typed event bus
    ├── design/
    │   ├── palette.ts           # ALL colours live here
    │   ├── motion.ts            # durations + easings
    │   └── layout.ts            # safe areas, scaling
    ├── fx/
    │   ├── background.ts        # vignette + drifting dust particles
    │   ├── glow.ts              # bloom/glow helpers
    │   ├── particles.ts         # pooled particle system (cap 400 live particles)
    │   └── transitions.ts       # cross-fades, camera drift
    ├── audio/
    │   ├── engine.ts            # master bus, limiter, reverb, volume, mute
    │   ├── scale.ts             # D major pentatonic helpers
    │   ├── ambient.ts           # generative drones/pads
    │   └── instruments.ts       # per-region voices
    ├── hints/
    │   ├── hintManager.ts       # attempt tracking + tier unlocking
    │   └── hintOrb.ts           # the clue orb UI
    ├── map/
    │   ├── worldMap.ts
    │   └── regionNode.ts
    ├── ui/
    │   ├── hud.ts               # level number, back, restart, hint orb, settings
    │   └── settings.ts          # icon-only settings panel
    └── regions/
        ├── types.ts             # PuzzleModule interface (below)
        ├── registry.ts          # ordered list of the 5 regions
        ├── tidepools/           # Region 1 — Loop
        ├── nightsky/            # Region 2 — Constellation
        ├── stonegarden/         # Region 3 — Silhouette
        ├── crystalcaves/        # Region 4 — Prism
        ├── moonlake/            # Region 5 — Ripple
        └── shadowterrace/       # Region 6 — Shadows (3D)
```

Each region folder contains: `model.ts`, `generator.ts`, `solver.ts`, `view.ts`, `clues.ts`, `sound.ts`, `levels.json`, `*.test.ts`.

### The PuzzleModule contract
Every region plugs into the shared shell through one interface. The shell never contains region-specific logic.

```ts
export type RegionId = 'tidepools' | 'nightsky' | 'stonegarden' | 'crystalcaves' | 'moonlake' | 'shadowterrace';
export type ClueTier = 1 | 2 | 3 | 4;

export interface LevelScene {
  container: import('pixi.js').Container;
  on(event: 'attempt' | 'solved' | 'move', cb: () => void): void;
  restart(): void;
  showClue(tier: ClueTier): void;        // must never reveal the complete solution
  playCompletion(): Promise<void>;       // the region's signature solve animation
  update?(dt: number): void;             // ticked every frame by the shell (ripples, drift, timed clues)
  destroy(): void;
}

export interface PuzzleModule {
  id: RegionId;
  accent: string;                         // key into palette.ts
  levelCount: number;
  createLevel(ctx: ShellContext, levelIndex: number): LevelScene;
  playRegionFinale(ctx: ShellContext): Promise<void>;
}
```

`ShellContext` gives modules access to the palette, motion presets, audio engine, particles, input and the seeded RNG.

---

## 4. Visual Design System

### Palette (`design/palette.ts`, the only place colours are defined)
| Token | Hex | Use |
|---|---|---|
| `void` | `#0B0B10` | background |
| `ink` | `#15151D` | panels, tiles, inactive shapes |
| `dim` | `#2A2A36` | locked or inactive outlines |
| `mint` | `#B8F2E6` | Tidepools accent |
| `lavender` | `#CDB8FF` | Night Sky accent |
| `peach` | `#FFD6C2` | Stone Garden accent |
| `sky` | `#BDE0FE` | Crystal Caves accent |
| `rose` | `#FFC8DD` | Moon Lake accent |
| `sage` | `#D0E8BF` | Shadow Terrace accent |
| `lemon` | `#FFF1B8` | Prism beam colour only |
| `pearl` | `#F7F4FF` | tiny highlights, "all colours" beam |

Rules:
- Each region uses its accent plus the neutrals. Other pastels appear only where the mechanic needs them (for example, Prism beams).
- Glow comes from bloom around pastel shapes, not from flat bright fills.
- Add a subtle radial vignette on every scene.
- Never flash the full screen.

### Typography
Quicksand, light weight, generous letter-spacing. It is used only for the title and level numbers.

### Motion (`design/motion.ts`)
- **Easings:** `sine.inOut` for ambient motion, `expo.out` for responses, and a gentle `back.out(1.4)` for tile snaps.
- **Durations:**
  - micro-feedback: 150–250 ms
  - piece moves: 250–400 ms
  - scene transitions: 800–1400 ms
  - completion sequences: 2.5–4 s
- **Idle "breathing":** interactive elements scale 1.00 → 1.05 over about 4 s, looping, with offset phases so they don't pulse in sync.
- **Background:** slow-drifting dust motes (20–40 particles, alpha 0.05–0.2).
- **Reduced motion:** respect `prefers-reduced-motion` and the settings toggle by removing drift and camera motion, shortening sequences, and keeping all feedback.
- Target a stable 60fps. Pool particles and graphics, and never allocate per frame in hot paths.

### Layout
- Target laptop screens (1280×720 to 2560×1600), with DPR-aware rendering.
- The puzzle area is centred with calm negative space.
- The HUD is minimal, icon-only, low-contrast (`dim`), and brightens on hover.
- Hit targets must be at least 28 px, with generous snapping tolerances for trackpad users.

---

## 5. Audio Design

- **Key:** D major pentatonic (D E F# A B) everywhere, so every sound harmonises with every other.
- **Master chain:** gentle limiter at −12 dB ceiling, then a long soft reverb, then output.
  - No transients sharper than a 10 ms attack.
  - No sounds below about 60 Hz or harsh highs above about 8 kHz.
- **Autoplay:** audio starts on the first user click (browser autoplay rule). The title screen's pulsing dot is that click.
- **Ambient bed:** a slow evolving drone on D and A, with filtered noise "air" and slow random filter drift. It must never loop audibly.
- **Region voices:**

| Region | Voice | Ambient character |
|---|---|---|
| Tidepools | soft marimba / water-droplet pluck | lapping filtered noise |
| Night Sky | glassy FM celesta / bells | high shimmering pad |
| Stone Garden | kalimba-like pluck | warm low hum, occasional wooden click |
| Crystal Caves | singing-bowl sines with long tails | crystalline harmonics |
| Moon Lake | warm electric-piano pad | deep slow swells |
| Shadow Terrace | soft wooden blocks climbing with each stone | koto-like plucks over a breathy low pad |

- **Interaction sounds** are always pentatonic notes, so there are no "wrong" notes.
- **Failure:** a soft descending 3-note breath, very quiet.
- **Solve:** the region voice plays a short phrase; in Night Sky it replays the player's own path as a melody.
- **Clue unlock:** a single wind-chime tone.
- **World map:** layers the ambient beds of all completed regions, so a fully completed map plays a full harmony.
- **Settings:** music volume, effects volume, mute. The `M` key toggles mute.

---

## 6. World Map & Progression

- **Look:** a black canvas with the world drawn in faint pastel line art.
- **Region order (on the map):** Tidepools → Night Sky → Stone Garden → Crystal Caves → Moon Lake → Shadow Terrace.
- **Region states:**
  - Locked: a dim outline, silent.
  - Unlocked: an accent outline, breathing gently.
  - Complete: filled with soft accent light, with its ambient layer audible on the map.
- **Region size:** 10 levels in 4 short chapters (3, 3, 2, 2). Level nodes sit along a winding trail inside the region scene. The final level of each region is generated with "ultra" parameters and is the hardest; chapter-final figures sit at levels 3, 6 and 8.
- **Unlocking within a region:** a level unlocks when the previous one is solved. The player may also be up to 2 levels ahead of their earliest unsolved level, so one hard level never blocks progress.
- **Regions are never gated:** every region is open from the first visit; players pick any region and come back to it later (`isRegionUnlocked` always returns true). Finishing a region still lights it and draws the glowing trail to the next one.
- **Finishing a region:** at 100%, play the region finale, return to the map, animate the region filling with light, then slowly draw a glowing path to the next region.
- Completed regions and levels can always be replayed.
- **Optional stretch, "The Summit":** unlocked after all 5 regions. Mixed-mechanic levels. Build it only in Phase 9, if the owner asks.

### Profiles
- The person icon (title and map) opens the profile card (`ui/profileOverlay.ts`, the game's one piece of DOM): each player is a named light with a colour and its own save under `chowa.save.v1.<id>`. The first visit asks you to make a light. The companion takes the chosen colour. Progress is per device by design; there is no login and no server.

### Save data (`localStorage` key `chowa.save.v1`)
```ts
{
  version: 1,
  regions: { [id in RegionId]: { solved: number[]; attempts: Record<number, number>; cluesUsed: Record<number, number> } },
  settings: { music: number; sfx: number; muted: boolean; reducedMotion: boolean },
}
```
Resetting progress requires a press-and-hold to confirm; there is no text dialog.

---

## 7. Hint / Clue System (shared by every region)

The **clue orb** sits dim in a corner of the level HUD and slowly fills with light as attempt units accumulate.

| Attempt units | Tier unlocked | Meaning (each region implements it concretely) |
|---|---|---|
| 3 | Tier 1 | **Where to begin**: one correct starting point or piece |
| 6 | Tier 2 | **A piece of the path**: a small correct fragment |
| 10 | Tier 3 | **The principle**: highlight the underlying rule |
| 15 | Tier 4 | **A glimpse**: about half the solution shimmers for 3 s, then fades |

### Rules
- Clues are optional. The orb chimes softly when a tier becomes available, and the player clicks it (or presses `H`) to reveal the next unlocked tier.
- **Never reveal the full solution.** Tier 4 must show at most 50% of the solution, temporarily.
- Where possible, compute clues from the player's **current state** using the solver, not only the stored solution.

### What counts as an attempt unit
- **Night Sky:** each failed stroke.
- **All other regions:** each manual restart, plus one unit per 40 moves without solving, plus one unit per 3 minutes of active play. Time stops counting when the tab is hidden or the player has been idle for 60 s.

Attempts and clues used are saved per level.

---

## 8. The Five Regions

For every region:
- Levels 1–2 are handcrafted tutorials, and level 1 has the ghost-hand demo.
- Each region introduces a new mechanic per chapter and a **signature twist** from chapter 3 (see each region below). The instruction card's glyph is rebuilt from the level, so every twist present in the level is shown visually as well as in the captions.
- Each chapter's final level is handcrafted and forms a recognisable figure where the mechanic allows it: a whale, a bird, a lotus, a fox, a moon and so on.
- All other levels are generated from seeds.

### Region 1 — Tidepools (Loop) · accent `mint`
- **Board:** a grid of tiles. Each tile has 0–4 connectors (end, straight, corner, T, cross). Every level of every region is verified solvable by its solver in tests (`src/regions/allLevels.test.ts` plus per-region suites).
- **Input:** click to rotate clockwise; right-click (or Shift-click) rotates counter-clockwise. Rotation is a smooth 90° tween with a slight overshoot.
- **Win condition:** every connector meets a matching connector, with no open ends. Accept **any** valid configuration, not just the stored one.
- **Generator:** randomly create consistent connections between neighbouring cells, derive the tile types, then scramble the rotations. Reject levels where the scrambled board is already solved or has more than 20% blank tiles.
- **Solver:** constraint propagation plus backtracking. It is used for validation and for current-state clues.
- **Chapters:**
  1. 3×3 to 4×4 grids
  2. 5×5 to 6×6 grids
  3. Irregular board shapes plus locked (pre-set) tiles
  4. 7×7 to 9×9 grids, where multiple separate loops are required
- **Signature twist — linked tiles:** from chapter 3 some tiles are tied in pairs (marked with matching dots on their top edge). Turning one turns its partner too, and locking one locks both. The solver keeps all rotations for linked cells and propagates each choice to the partner.
- **Clues:**
  1. Lock one correctly rotated tile, shown with a mint shimmer.
  2. Lock 2 more tiles.
  3. Softly mark every tile whose connectors are forced (determined by the board edges).
  4. Half the tiles briefly ghost their correct rotation.
- **Feel:** closed loops fill with flowing light as you connect them.
- **Solve animation:** light flows through every loop, a ripple radiates outward, and the tiles gently bob like water.

### Region 2 — Night Sky (Constellation, one-stroke drawing) · accent `lavender`
- **Board:** stars (nodes) connected by faint lines (edges).
- **Input:** press on a star and drag.
  - Passing within the snap radius of a star connected to the current star by an unused edge traverses that edge; it lights up and plays a note.
  - Moving back along the last edge undoes it.
  - Releasing the pointer before every edge is lit counts as a failed attempt: the lit path gently unravels back and fades.
- **Win condition:** every edge is traversed exactly its required number of times, in one stroke.
- **Generator:** place points with Poisson-disk sampling, then take a random walk among nearby points to build the edges. The walk itself is the stored solution, so every level is guaranteed solvable.
  - Constraints: every star must be at least 20 px from every line not attached to it.
  - Crossings should match the difficulty parameters.
- **Solver:** Hierholzer's algorithm plus backtracking, which also handles one-way and double edges. It returns valid starting stars.
- **Chapters:**
  1. 4–8 stars, simple shapes
  2. More crossings and some stars where the start matters (exactly 2 stars have an odd number of lines)
  3. One-way edges, shown as a slow directional shimmer
  4. Double edges (brighter until traced twice), plus slow star drift in the final levels
- **Signature twist — ordered stars:** from chapter 3 a few stars carry small dots beneath them (one, two, three). They must be reached in that order; starting on or moving to one out of turn is refused with a flash and the unravel sound. The generator picks them from the walk's first visits so the stored walk still works, and the solver filters options by `orderAllows`.
- **Clues:**
  1. A valid starting star pulses.
  2. The first 2 edges of a valid path shimmer.
  3. Stars with an odd number of lines get a soft ring.
  4. Half the path shimmers for 3 s.
- **Solve animation:** the constellation brightens, the path replays as a melody, and the figure drifts upward among the stars.

### Region 3 — Stone Garden (Silhouette) · accent `peach`
- **Grid model:** keeps geometry exact. Each grid cell is split by its diagonals into 4 triangles (N, E, S, W). A piece is a connected set of these triangles.
- **Input:**
  - Drag pieces from the tray; they snap to the whole-cell grid, with smooth magnetic easing when near a snap point. **A stone settles wherever it is dropped** as long as it does not overlap another stone; it need not be inside the silhouette. The magnet outline shows the accent colour when the spot is an exact fit and pearl otherwise.
  - Rotate 90° by tapping a stone (without dragging), with the scroll wheel, the `R` key, or the on-screen **turn** button (bottom-left, acts on the last touched stone).
  - Flip with a double-click, a long press, the `F` key, or the on-screen **flip** button (from chapter 3 onward).
- **Win condition:** the placed triangles cover the silhouette exactly, with no overlap and nothing outside it. Accept any exact cover.
- **Signature twist — fixed stones and gaps:** from chapter 3 the silhouette may contain a gap that must stay empty, and from chapter 4 one grey stone is already set in place and cannot be moved (the solver pins it).
- **Generator:** grow a random silhouette (or use a handcrafted figure), partition it into pieces by seeded region-growing (with a range of piece sizes), then scramble rotation and flip into the tray. Reject levels where pieces are trivially identical.
- **Solver:** exact-cover search (Algorithm X style).
- **Chapters:**
  1. 3–4 pieces, rotation only
  2. 5–6 pieces
  3. Flipping is required
  4. 7–9 pieces including look-alike pieces
- **Clues:**
  1. A faint ghost outline shows where one piece belongs.
  2. One piece settles into place by itself.
  3. The internal seams of the silhouette appear faintly for 3 s.
  4. Ghosts of half the pieces appear for 3 s.
- **Solve animation:** the seams dissolve into one smooth shape, and sand-rake lines ripple outward around it.

### Region 4 — Crystal Caves (Prism light) · accent `sky`
- **Board:** a grid containing:
  - fixed emitters, each emitting a beam of one colour
  - rotatable pieces, marked with a soft ring
  - fixed pieces, shown as stone
  - targets
- **Beam colours:** a bitmask where rose=1, sky=2, lemon=4.
  - Colours mix at targets: rose+sky = lavender, sky+lemon = mint, rose+lemon = peach, all three = pearl.
  - Beams pass through each other without mixing.
- **Pieces:**
  - mirror (`/` or `\`)
  - splitter (half passes through, half reflects)
  - filter (passes only one colour)
  - blocker
  - dichroic mirror (chapter 4+): bounces only its own colour and lets every other colour pass straight through, so one beam can be split by colour
- **Input:** click a rotatable piece to cycle its orientation.
- **Win condition:** every target receives exactly its required colour mask.
  - Beam tracing is deterministic, with loop detection.
- **Generator:** place emitters and pieces, orient them randomly into a solution, trace the beams to decide target colours, then scramble the rotatable pieces. Reject levels that are pre-solved or have unused rotatable pieces.
- **Accessibility:** each target also shows a tiny glyph for its colour mask, so the game works for colour-blind players.
- **Chapters:**
  1. Single emitter, mirrors only
  2. Several emitters, mirrors plus splitters
  3. Colour mixing at targets
  4. Filters, blockers and dense boards
- **Clues:**
  1. Lock one correct piece.
  2. Lock 2 more pieces.
  3. For 3 s, show a faint dotted route from each emitter to the target it should feed.
  4. Half the rotatable pieces ghost their correct orientation.
- **Solve animation:** targets bloom into crystals, the beams shimmer, and refraction sparkles drift up.

### Region 5 — Moon Lake (Ripple / Lights-Out) · accent `rose`
- **Board:** lily-pad nodes on a graph (grids, rings, irregular clusters).
- **Input:** clicking a node toggles it and its neighbours, with a ripple animation spreading outward.
- **Win condition:** every node is lit.
  - In chapter 3+, nodes have 3 states (dark, half-lit, lit) and a click advances each affected node one step (mod 3).
- **Generator:** start from the solved board and apply a random set of presses; that set is the stored solution. Reject levels whose minimum solution length is below the chapter's threshold.
- **Solver:** Gaussian elimination over GF(2) (or GF(3) for 3-state levels). It gives the minimum presses from **any** current state.
- **Chapters:**
  1. Small grids (3×3, 4×4)
  2. Rings and irregular pond shapes
  3. Three-state nodes
  4. Wide-ripple nodes (affect neighbours 2 steps away), plus larger boards
- **Signature twist — stone pads:** from chapter 3 some pads are grey stone. They cannot be pressed, only changed by their neighbours' ripples, and they still have to end up lit. The solver drops their press variable.
- **Clues:** computed from the current state.
  1. One node from the minimum solution glows softly.
  2. 2 more nodes glow.
  3. The number of presses still needed appears as small dots, not digits.
  4. Half the remaining presses shimmer for 3 s.
- **Solve animation:** the whole lake lights up, concentric ripples spread across it, and a moon reflection rises.

### Region 6 — Shadow Terrace (Shadows, three-dimensional) · accent `sage`
- **Board:** an n×n terrace drawn in isometric 3D (`view.ts` projects grid points through a view angle; stacks are sorted back to front and drawn as cubes with three shaded faces). Two lanterns stand behind the far edges; every stack throws a shadow on the sand in front, one bar per row along each near edge, whose length is the tallest stone in that row (per-column and per-row maxima of the heightmap).
- **Input:** tap a tile to add a stone; the stack climbs to its ceiling (the smaller of its two shadows), then clears. Hold, right-click or shift-click takes one stone away. The turn button (bottom left) or `R` rotates the view a quarter turn, with a tween; shadows fade during the turn.
- **Win condition:** the cast shadows match the moon's on both edges, every moonlit tile carries a stone and dark tiles are empty (from chapter 2), the stone count is exact (from chapter 3), and fixed grey stacks are untouched. Accept **any** heightmap that satisfies this.
- **Generator:** a random heightmap gives the shadows; a level is rejected when filling every stack to its ceiling already solves it (once the count rule is in play). The ultra level asks for the **minimum** number of stones.
- **Solver:** backtracking over cells with look-ahead (each row and column must still be able to reach its shadow; the count must stay reachable). `solveShadow(level, prefer)` tries the player's own heights first so hints stay close to what they built; `minimumStones` finds the fewest stones.
- **Chapters:**
  1. 3×3, heights to 2, shadows only
  2. 3×3 to 4×4, heights to 3, moonlit floor plan
  3. 4×4, exact stone count (the lantern gauge beside the terrace)
  4. 4×4 to 5×5, heights to 4, fixed grey stacks; the final level asks for the minimum count
- **Signature twist — the lantern gauge:** a vertical gauge with one tick per stone fills as stones are placed; it must be exactly full. Spilling over shows in pearl above the gauge.
- **Clues:**
  1. One stack's correct height appears as a pale outline (a cross on the floor means "take these away").
  2. Two more outlines.
  3. For 3 s, tiles in rows and columns whose shadow is still wrong shimmer.
  4. Outlines for half the stacks, for 3 s.
- **Solve animation:** the terrace turns slowly once while a moon climbs behind it and sparks rise from the stones.

---

## 9. Levels Pipeline

- Levels are **baked** into `src/regions/<id>/levels.json` by `npm run levels`.
  - Each generated level is stored with its seed, difficulty parameters, board data and one stored solution.
  - Handcrafted levels live in the same file with `"handcrafted": true`.
- `generateLevels.ts` runs the solver on every level. It computes a difficulty metric (search nodes explored, minimum moves, or similar) and sorts the levels within each chapter from easiest to hardest.
- **Tests must assert, for every level in every region:**
  - it is solvable by the solver
  - it is not solved at its start state
  - its stored solution is valid
  - clue tier 4 never reveals more than 50% of the solution
- The game never runs the generators at runtime; it only loads the JSON.

---

## 10. Controls Summary

| Action | Input |
|---|---|
| Main interaction | Mouse, trackpad or touch (tap/drag). Touch: hold a Loop tile to turn it back; hold a stone to flip it |
| Restart level | `R` in Loop/Prism/Ripple, or the restart icon. Stone Garden uses `R` to rotate, so restart there is the icon or `Backspace`. |
| Clue | `H` or click the orb |
| Mute | `M` |
| Back to region / map | `Esc` |

---

## 11. Dev Mode

Add `?dev=1` to the URL to enable:
- an FPS meter
- unlock-all
- jumping to any level (`?level=nightsky:12`)
- a solution overlay

Dev features are stripped from production builds with `import.meta.env.DEV` guards. **The solution overlay must never exist in production.**

---

## 12. Working Rules for Claude Code

1. **Work one phase at a time** (see §13). Don't start the next phase until the owner says so.
2. At the end of each phase:
   - run `npm test` and `npm run build`
   - fix any failures
   - `git commit` with a clear message
   - give the owner a short summary and **exact manual test steps** ("run `npm run dev`, open the link, click X, expect Y")
3. Keep region logic out of the shell, and shell logic out of regions.
4. Put all colours in `palette.ts` and all timings in `motion.ts`, with no magic numbers elsewhere.
5. Prefer clarity over cleverness: small files and typed interfaces.
6. If a design decision here seems wrong in practice (feel, difficulty, performance), explain it and propose an alternative instead of silently deviating.
7. The owner is not a programmer. Explain things in plain language and give copy-pasteable commands.

---

## 13. Build Plan

### Phase 0 — Setup
- Initialise git and scaffold Vite + TS strict. Install Pixi, pixi-filters, GSAP, Tone.js, Vitest, Quicksand and vite-plugin-pwa.
- Add the npm scripts from §2. `npm run play` should work.
- **Done when:** `npm run dev` shows a black screen with a softly breathing pastel dot.

### Phase 1 — Shell
- Build the palette, motion, background (vignette + dust), particles, glow, transitions, scene manager, input, seeded RNG, save system, audio engine (master chain + ambient drone), settings panel and HUD.
- Build the title screen: the logo fades in, and clicking the pulsing dot starts audio and moves to the map.
- **Done when:** title → placeholder map transitions smoothly, the drone plays calmly, mute and volume work, settings persist after reload, and it runs at 60fps.

### Phase 2 — World Map + Progression
- Draw the map with 5 region shapes in their locked, unlocked and complete states.
- Build the region scene with a 24-node level trail, and a **placeholder puzzle** (a "click the glowing dot" scene) implementing `PuzzleModule`.
- Implement the unlock rules, the region-completion light-fill, the path-drawing animation, map audio layering, and the hint orb with attempt-unit tracking (driven by the placeholder).
- **Done when:** in dev mode you can play through all 5 placeholder regions end to end, and the unlock, save, clue orb and all animations work.

### Phase 3 — Region 1: Tidepools (Loop)
- **3a:** model, view, input and win detection with 2 handcrafted levels.
- **3b:** generator, solver, level baking and tests; all 24 levels.
- **3c:** clues (tiers 1–4) and the ghost-hand tutorial.
- **3d:** sound, solve animation, region finale and polish.
- **Done when:** Tidepools is fully playable from start to finish and feels finished. Replace the placeholder for this region.

### Phases 4–7 — Night Sky, Stone Garden, Crystal Caves, Moon Lake
Same 4 sub-steps (a–d) and the same "done when" standard as Phase 3, one region per phase.

### Phase 8 — Polish & App
- Full playtest pass on difficulty ordering, audio mix balance, reduced-motion mode and performance profiling.
- Configure the PWA manifest (name, pastel-on-black icons, standalone display) and offline caching.
- Confirm `npm run play` works.
- **Done when:** the game can be installed from Chrome/Edge and launched like an app on the laptop.

### Phase 9 — The Summit (optional, only if the owner asks)
Mixed-mechanic finale levels and an ending sequence.
