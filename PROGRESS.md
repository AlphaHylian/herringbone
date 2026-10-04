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
- [ ] **5. Feel pass**
- [ ] **6. Progression**
- [ ] **7. Polish and verification**
