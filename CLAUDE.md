# CLAUDE.md — Project Brief

> Title: **Chōwa** (renamed from the working title LUMA; the name lives in one constant in `src/config/game.ts`).
> This file is the single source of truth. Re-read the relevant section before starting any phase.

---

## 1. Vision

A calm, beautiful, wordless puzzle game played in the browser on a laptop.
The player journeys across a **world map of 6 regions**, all open from the start. Each region is one visual puzzle type with its own deep difficulty curve. Finishing one region lights it up and opens the path to the next.

The feeling to aim for: **meditative focus**. Think soft glowing light on black, slow breathing motion, gentle generative music, and a steady sense of mastery.

### Character
- **The light** is the player's companion: a small creature with a blinking face (`ui/face.ts`). On the title it hops up onto the letters; the title click makes it burst with joy and loop once (`spirit:joy`), and then it roams the map from region to region forever (`spirit:tour`), each region's name and aura brightening as it comes near (`spirit:at` is broadcast every frame). Choosing a region or a level makes it leap into the figure and vanish in a burst (`spirit:dive`); it emerges again in the next scene. On the trail it roams the open levels the same way; in a level it has dived into the puzzle and stays out of sight (the level name has the top row to itself) until the solve, when it bursts out of the middle with joy. Scenes talk to it only through `spirit:*` events (`ui/spirit.ts`).
- **The studio card** (`ui/studioCard.ts`): the game opens on the MomoGames logo, a punk baby with a pastel mohawk, pacifier and hoop earring holding a game controller, drawn as inline SVG from palette colours. Its mohawk sways, it blinks and the controller buttons twinkle; it holds about 2 s while the game loads (a tap skips it) and fades into the title. Dev level jumps skip it. The studio name lives in `STUDIO_NAME` (`config/game.ts`).
- **The story** (`src/story/`): a family of lights sang the world together. One night a great **Silence** fell and the lands began to fade; to save them the family flew out, one light to each land, and sang until they fell asleep inside them. A sleeping light wakes only when its land is back in tune (the puzzles). The smallest was too young to go and slept on the shore; it wakes alone and sets out to find them. (The owner chose this gentle version; not a "wrong note" story.) One short line per beat over a small animation drawn in code (`art.ts`), played by `StoryPlayer` with the screen beneath hidden. **Beats never advance by themselves:** after the line lands, a faint dot breathes below it and a tap moves on; Skip ends it. Scenes (`script.ts`) and when they are due (`triggers.ts`, tested): the six-beat **prologue** on a light's first map, then the map waits **dreaming** (lands dim and unchoosable, HUD hidden): the light floats to the middle, six lights fall from the sky into their lands (`WorldMapScene.playArrival`), and the light says to itself, in a small bubble (`spirit:say`), "They are out there, asleep in the six lands." / "I will find every one of them." A faint ring then breathes around the light; **tapping the light** wakes the map (`wakeUp`: lands brighten, HUD fades in, the tour begins).; **asleep:<land>** when a land's four free levels are solved; **waiting** when all six free parts are done (then the unlock card); **home:<land>** when a land is finished; the **finale** when all six are. Seen scenes are saved per light (`seenStory`). The **book icon** (title and map) simply replays the story so far, in order (the owner wanted it simple: no chapter list). **The family wears the six colours the player did not choose** (`story/family.ts`: a land's sleeper wears the land's colour unless the player took it, then lemon). **The player's light is the smallest** in every scene and among its followers. A finished land's light follows the player's light only once its homecoming scene has been seen, keeping a small distance (trailing while the light travels, a loose ring when it rests). **On each land's trail** the family member asleep there floats in the sky above the levels (`RegionScene`, a `StoryLight` with closed eyes): faint at first, brighter and larger with every level solved, stirring when the player returns from a solve; it is gone once the land is finished (it follows the light instead). At milestones (0, 1, 3, 4, 7 and 9 levels solved) the light says one line to itself on entering the trail, each once (`story/whispers.ts`, saved as `whisper:<land>:<n>`). **Catch-up:** story a player earned but never saw (`missedScenes`) plays once on their next visit to the map. Each finished land's light follows the player's light on the title, map and trails (`spirit:family`), not in levels. Dev: `?story=all` or `?story=<id>`.
- **Hints guide, they never play.** Each `hint()` climbs a ladder for the step at hand: a nudge (where to look, and why), then a faint ghost of that step's answer, then ghosts for a few more steps, never more than half of what is left. See §7.
- **Tips teach strategy without interrupting.** `tips()` lists one-line tips that appear as quiet, non-blocking captions once the player has struggled enough, plus situational ones sent with `level:tip`. Each shows once per player, ever (`seenTips` in the save).
- **Depth and scenery:** a spotlight under every puzzle, shadows under tiles, stones and pads, a colour wash and region-specific backdrop (`fx/atmosphere.ts`: caustics, star field, raked sand, crystal facets, waves and fireflies) plus a night landscape per region (`fx/scenery.ts`: headland and shore with rolling waves; mountain ranges with pines; rolling hills with bamboo; a cave with stalactites and a glowing stream; hills over a lake with the moon's reflection), all with pointer parallax, plants swaying in the wind and silhouette birds passing now and then. The map shows each region's name and colour pool on hover/focus.
- **Nothing is static.** The map drifts and leans toward the pointer (parallax, with the star field further back), every region figure itself moves (rings breathe, stars drift, stones rock, crystals grow, the moon sways, the terrace bobs) with clear ripples, twinkles and glints on top, region names are always shown and light up as the companion passes, light pulses travel along completed trails, and every region has an atmosphere layer (`fx/atmosphere.ts`) behind its trail and puzzles.
- **Instruction cards** (`ui/levelIntro.ts`) are paged: one page per mechanic present in that level (`LevelScene.introPages`), each with its own looping animated demonstration and a short caption. Pages turn with the arrows, a swipe or the arrow keys; page dots show where you are; the play button (or Enter) closes the card. Never teach a mechanic the level does not use. A card opens by itself on the first page the player has not seen in that region (tracked in the save); the `?` button reopens it any time. Shared demo pieces (finger taps, holds, mini buttons) live in `ui/introGlyphs.ts`; `src/regions/introPages.test.ts` builds every page of every level headlessly. The bulb button asks "Would you like a hint?" and gives one step on yes (§7).
- **Music:** the drone plays on the title screen, the map is quiet, and each region has its own generative bed with a **signature melody** on its own instrument and pace (marimba waves, twinkling celesta, kalimba, echoing glass, drifting electric piano, climbing koto) that returns after a quiet stretch (`audio/beds.ts`, `melody`) that plays on its trail and in its levels, cross-faded by `AudioEngine.setScene`. Map audio layering is intentionally not implemented.

### Non-negotiable principles
1. **No word puzzles.** The UI uses icons and motion, not text. Text is allowed only for the title logo, region and level names (`LEVEL_NAMES` in `regions/catalog.ts`: ten named places per region instead of numbers), the small move counter, and the short captions on each level's instruction card (the owner asked for clearer instructions).
2. **Black and light pastel only.** Use near-black backgrounds with soft pastel light. No saturated colours, and no pure white except as a tiny highlight.
3. **Nothing harsh.** No red error flashes, buzzers, shaking screens, timers or countdowns. Failure is shown as a gentle unravel or fade.
4. **The answer is never shown in full.** Hints take one step at a time and never the last one (see §7).
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
| iPhone app | **Capacitor 8** (`ios/`, bundle id `com.momogames.chowa`, iPhone only, portrait). `vite build --mode app` makes the bundled copy (relative paths, no service worker); `IS_APP` in `config/platform.ts` switches off web-only parts (install guide, share link, web updates). `core/native.ts` mirrors saves into Capacitor Preferences, gives a light haptic on a solve and a medium one on a region finale, and sets the audio session to ambient (follows the silent switch). Puzzles and the HUD keep clear of the Dynamic Island and home bar through `safeArea`/`hud` in `design/layout.ts`. Releasing on the App Store as a free game under the MomoGames name. |

Use the latest stable versions. Don't add other frameworks (no React, no game engines) without asking the owner.

### Scripts (package.json)
- `npm run dev`: dev server (http://localhost:5173)
- `npm run build`: production build
- `npm run preview`: serve the production build
- `npm run play`: build, then preview, then open the browser (one command for the owner)
- `npm test`: run all Vitest tests
- `npm run levels`: regenerate all level JSON files from seeds (see §9)
- `npm run app`: build the app copy and copy it into the Xcode project (`npm run app:open` also opens Xcode)
- `npm run icons`: redraw the icons, including the opaque 1024 px App Store icon

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
    │   ├── hintManager.ts       # attempt units (orb fill, tip timing) + hints used
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

export interface LevelScene {
  container: import('pixi.js').Container;
  on(event: 'attempt' | 'solved' | 'move', cb: () => void): void;
  restart(): void;
  hint(): string;                        // one visible step + caption; never the final step
  tips?(): Tip[];                        // { id, text, after } strategy tips, shown once each
  playCompletion(): Promise<void>;       // the region's signature solve animation
  update?(dt: number): void;             // ticked every frame by the shell (ripples, drift, timed clues)
  introPages?(): IntroPage[];            // { caption, glyph: () => Container } per mechanic in this level
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
- **Hint orb filled:** a single wind-chime tone.
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
- **Region size:** 10 levels in 4 short chapters (3, 3, 2, 2). Level nodes sit along a winding trail inside the region scene. The final level of each region is generated with "ultra" parameters and is the hardest; handcrafted figures sit at levels 6 and 8. Level 1 is the only handcrafted tutorial: levels 2–4 are generated real puzzles on a gentle ramp (the owner found the old first four levels too easy).
- **Unlocking within a region:** a level unlocks when the previous one is solved. The player may also be up to 2 levels ahead of their earliest unsolved level, so one hard level never blocks progress.
- **After a solve** the next level opens by itself (`afterLevel` in `core/game.ts`); only the last level returns to the trail, and finishing the region plays its finale.
- **Free and paid (the full journey):** levels 1–4 of every region are free (24 of 60, 40%); levels 5–10 are paid (`progression.freeLevels`, `isPaidLevel`, `paywalled`, `levelPlayable` in `core/progress.ts`). Paid levels show a padlock on the trail; tapping one, or finishing the free part of a region, opens the unlock card (`ui/unlockCard.ts`, DOM). The unlock is per device, for every profile (`chowa.save.v1.unlock`). How it unlocks lives in `core/store.ts`: on the **website** a family code (only its SHA-256 is stored; change it there), in the **app** an Apple in-app purchase. Until the paid developer account exists the app uses a **test store** (Unlock is instant; the profile card offers "Lock the journey again (test)"). Dev mode bypasses the paywall unless `?locks=1`.
- **Regions are never gated:** every region is open from the first visit; players pick any region and come back to it later (`isRegionUnlocked` always returns true). Finishing a region still lights it and draws the glowing trail to the next one.
- **Finishing a region:** at 100%, play the region finale, return to the map, animate the region filling with light, then slowly draw a glowing path to the next region.
- Completed regions and levels can always be replayed.
- **Optional stretch, "The Summit":** unlocked after all 5 regions. Mixed-mechanic levels. Build it only in Phase 9, if the owner asks.

### Profiles
- The person icon (title and map) opens the profile card (`ui/profileOverlay.ts`, DOM): each player is a named light with one of **seven** colours (the six land accents plus `lemon`, an owner-approved exception to lemon being for Prism beams) and its own save under `chowa.save.v1.<id>`. The first visit asks you to make a light. The companion takes the chosen colour. Progress is per device by design; there is no login and no server.
- **Install link:** `…/wa/?install` opens `ui/installGuide.ts` (DOM, like the profile card) instead of the game: Android Chrome gets a one-tap Install button (the held `beforeinstallprompt`, falling back to menu steps), iPhone Safari gets the Share → Add to Home Screen steps, and in-app browsers get Open in Chrome/Safari. Laptops and installed copies skip it. Detection lives in `core/install.ts`; in dev, `?install=ios-safari|ios-other|android|android-inapp` previews each. The profile card's Share link sends this address.

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

## 7. Hints and Tips (shared by every region)

The owner asked for hints that "get me to the next step a little easier" and for instructions that are never intrusive.

### Hints
- The **bulb** asks "Would you like a hint?"; `H` gives one straight away. When the player has struggled for 3 attempt units the bulb **glows softly** and a chime sounds (the old hint orb was removed: its meaning was not evident).
- **Hints never act for the player** (the owner's rule): nothing turns, moves, presses or builds. Each hint climbs a ladder for the current step, computed by the solver from the player's current state and consistent with what earlier hints showed:
  1. **Nudge:** where to look, with a reason.
  2. **Ghost:** that step's answer, shown faintly; the player makes the move. The ghost (and nudge) fade once the move matches.
  3. **More:** ghosts for two more steps per hint, never more than half of what is still wrong.
  After the player completes a step, the next hint starts with a fresh nudge. A restart clears the ghosts.

| Region | Nudge | Ghost |
|---|---|---|
| Tidepools | ring around a wrong tile (edge-forced first) | faint lines of how it should face |
| Night Sky | the start star ringed (with the odd-star reason) | the next two lines of a working stroke, up to half the path |
| Stone Garden | the next stone pulses (biggest first), or a misplaced one to take out | outline of where it belongs, turned and flipped |
| Crystal Caves | ring around the first wrong piece the beam meets | faint shape of its right angle |
| Moon Lake | three pads ringed, one of which is right | the right pad glows ("twice" when needed) |
| Shadow Terrace | a stack marked on the floor, its row and column faintly lit | pale outline of its right height |

### Tips
- Each region's `tips()` gives strategy tips (start at the edges, count odd stars, biggest stone first, follow the beam, order never matters, no stack above its shadows) with an `after` threshold in attempt units. Situational tips arrive as `level:tip` events (a stroke let go too soon, an ordered star refused).
- Tips are quiet captions that never block input, never appear over the instruction card, keep 25 s apart, and are shown once per player per region.

### What counts as an attempt unit
- **Night Sky:** each failed stroke.
- **All other regions:** each manual restart, plus one unit per 40 moves without solving, plus one unit per 3 minutes of active play. Time stops counting when the tab is hidden or the player has been idle for 60 s.

Attempts and clues used are saved per level.

---

## 8. The Five Regions

For every region:
- Level 1 is a handcrafted tutorial with the ghost-hand demo; from level 2 on every level is a real puzzle, climbing gently.
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
  One wrong tile turns into place and locks (see §7).
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
  A growing guide of a working stroke, two lines per hint (see §7).
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
  The biggest waiting stone settles, or a misplaced one returns to the tray (see §7).
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
- **Input:** click a rotatable piece to cycle its orientation. With more than one light, tapping a light switches its beam off and on (`off` in `trace`), to follow one beam at a time; a level only counts as solved with every light on.
- **Board:** every board is cropped to the cells its pieces use (`cropToPieces`, at bake; a beam leaving that area never meets a piece again), and drawn as soft squares so blockers and filters clearly sit in cells. The cave backdrop has no drifting sparks.
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
  One wrong piece turns and locks, following the beam (see §7).
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
- **Clues:**
  One pad of a shortest way glows (see §7).
- **Solve animation:** the whole lake lights up, concentric ripples spread across it, and a moon reflection rises.

### Region 6 — Shadow Terrace (Shadows, three-dimensional) · accent `sage`
- **Board:** an n×n terrace drawn in isometric 3D (`view.ts` projects grid points through a view angle; stacks are sorted back to front and drawn as cubes with three shaded faces). Light falls from behind (no visible lamps: they were a distraction); every stack throws a shadow on the sand in front, one bar per row along each near edge, whose length is the tallest stone in that row (per-column and per-row maxima of the heightmap).
- **Input:** tap a tile to add a stone; the stack climbs to the level's full height, then clears. Hold, right-click or shift-click takes one stone away. Mistakes are allowed: a stack that is too tall throws a shadow past the shaded one, and nothing on the board says where to build. Dragging or swiping sideways across the terrace turns it with the finger and settles on the nearest quarter turn (`R`/arrow keys turn it too); shadows fade while it turns.
- **Win condition:** the cast shadows match the shaded ones on both edges, the stone count is exact (from chapter 2), and fixed grey stacks are untouched. Accept **any** heightmap that satisfies this. (An earlier moonlit floor plan was removed: it gave away where to build.)
- **Generator:** a random heightmap gives the shadows; a level is rejected when filling every stack to its ceiling already solves it (once the count rule is in play). The ultra level asks for the **minimum** number of stones.
- **Solver:** backtracking over cells with look-ahead (each row and column must still be able to reach its shadow; the count must stay reachable). `solveShadow(level, prefer)` tries the player's own heights first so hints stay close to what they built; `minimumStones` finds the fewest stones.
- **Chapters:**
  1. 3×3, heights to 2, shadows only
  2. 3×3 to 4×4, heights to 3, exact stone count (the lantern gauge beside the terrace)
  3. 4×4, a fixed grey stack
  4. 4×4, heights to 4, the **minimum** count (kept at 4×4: the search grows fast with size)
- **Signature twist — the lantern gauge:** a vertical gauge with one tick per stone fills as stones are placed; it must be exactly full. Spilling over shows in pearl above the gauge.
- **Clues:**
  One stack is built to its height, tallest first (see §7).
- **Solve animation:** the terrace turns slowly once while a moon climbs behind it and sparks rise from the stones.

---

## 9. Levels Pipeline

- Levels are **baked** into `src/regions/<id>/levels.json` by `npm run levels`.
  - Each generated level is stored with its seed, difficulty parameters, board data and one stored solution.
  - Handcrafted levels live in the same file with `"handcrafted": true`.
- `generateLevels.ts` runs the solver on every level. For each generated slot it makes several candidates and picks a harder one the later the level (`bakeHelper.ts`), so difficulty climbs steadily. It computes a difficulty metric (search nodes explored, minimum moves, or similar) and sorts the levels within each chapter from easiest to hardest.
- **Tests must assert, for every level in every region:**
  - it is solvable by the solver
  - it is not solved at its start state
  - its stored solution is valid
  - repeated hints always make progress and never finish the level
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
- jumping to any level (`?level=nightsky:3`) or trail (`?trail=moonlake`)
- `?locks=1`: keep progress locks and the paywall in force while testing
- `?story=all` (or one scene id) to preview the story
- a solution overlay, only with `?solution=1` as well (it gives every answer away, so `?dev=1` alone never shows it)

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
