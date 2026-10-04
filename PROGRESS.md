# Progress

## Milestones

- [x] **1. Scaffold**: Vite + strict TS + PixiJS v8 + Vitest + Playwright + ESLint/Prettier,
      Capacitor config, `ios/` and `android/` projects, platform interfaces (haptics, storage),
      CI workflow, README.
- [x] **2. Geometry core**: pattern tilings (stretcher, 90°/45° herringbone, basketweave), slot
      generation and classification, sliver rule, concave-target splitting, Clipper2 boolean
      ops, cutting and accuracy, offcut fitting, scoring, game state with undo, greedy solver,
      versioned saves, level loader and validator, 13 levels. All levels are proven
      completable by the solver in unit tests.
- [x] **3. Playable single job**: PixiJS job view (grass, sand bed, kerb, chalk guides,
      textured bricks from one procedural atlas, shadows), pallet and offcut tray, drag-and-snap
      with magnetic pull, tap-to-fill, unlimited undo, completion and results card. Playwright
      test drives real pointer input, then finishes the job via the solver hook.
- [x] **4. Cutting and offcuts**: splitter overlay (wooden bench, dashed target outline,
      live swipe line extended across the brick, blade drop, split, offcut slides to the tray,
      fit meter with the 0.9 mark, cut again, undo cut, "Lay it", cancel). Clean cuts fly into
      the slot automatically. Offcuts drag from the tray, snap and flip into fitting gaps.
      Rating from material use and clean cuts. e2e tests for clean, sloppy and offcut flows.
- [x] **5. Feel pass**: procedural brick atlas (mottling, grain, pits, flashed edges,
      chamfers, rounded corners, paler sharp cut edges), grass/sand textures, soft layered
      shadows, landing bounce with dust puffs, magnetic snap, Web Audio synthesis for every
      sound (clack, pickup, blade thunk with crackle, whoosh, sand hiss, compactor rumble, chimes,
      wind and birdsong ambience), haptics, and the skippable finishing sequence (sand sweep with
      broom, compactor pass with shake, camera pull-back, decorations, cat walking in, rating).
- [x] **6. Progression**: 13 jobs in 3 neighborhoods (Maple Row, Willow Lane, Harbour Hill),
      neighborhood map with thumbnails rendered from the real levels (finished jobs show the
      player's own bricks), sequential unlocks, one new pattern per neighborhood, versioned
      saves through the Preferences interface, review of finished jobs with "Pave again",
      client notes, wordless ghost-hand tutorial (drag, then edge, then swipe), Free Build
      (8 shapes, unlocked patterns, 3 brick colours, no rating) and settings (volume, sound,
      haptics, reduce motion, reset progress). e2e tests cover the whole loop, and every level
      is solved in the real scene.
- [ ] **7. Polish and verification**
