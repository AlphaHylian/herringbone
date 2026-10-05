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
- [x] **7. Polish and verification**: draw-call audit (8 per frame for an open job, about 30–40
      with every brick, shadow and decoration, 26 on the map after baking rounded corners into
      thumbnails), per-frame allocation review, safe-area insets checked with a simulated notch
      and on 320×568 and 430×932 screens, reduce-motion mode (short tweens, no shake, dust or
      cat walk), procedural icon and splash (`pnpm icons`) wired in through `@capacitor/assets`,
      `npx cap sync` verified, final README and screenshots.

## Herringbone 3D

Done: an endless winding path streamed in chunks, procedural textures, sky and sun shadows, trees
and grass, packs of blocks, gloved first-person hands, laying (tap or sweep), marking edge gaps,
the block splitter with lever and blade animation and offcuts left on the ground, saving,
desktop and touch controls, and synthesised sound. Tests: unit tests for the path and chunks,
and an e2e test of the full loop plus a phone-sized smoke test.

Known limits: the 3D game isn't packaged in the Capacitor apps (it runs in the browser). Blocks
laid by mistake can't be lifted again.

## Native builds

iOS and Android builds could **not** be compiled in this environment: no macOS/Xcode, and no
Android SDK. What was verified:

- `npx cap sync` succeeds for both platforms.
- App id `com.alphahylian.herringbone` and display name "Herringbone" on both.
- Portrait lock: `UISupportedInterfaceOrientations` (iPhone and iPad, with
  `UIRequiresFullScreen`) and `android:screenOrientation="portrait"`.
- Status bar: dark text over the web view (`UIStatusBarStyleDarkContent`, StatusBar plugin
  `Style.Light`, overlaying), with the UI padded by safe-area insets.
- Generated icons (including Android adaptive layers) and light/dark splash screens are in
  both projects.

## Summary

**Done.** All seven milestones. The game is complete and playable in the browser and packaged
for iOS and Android: 13 jobs in 3 neighborhoods, 4 patterns, drag-and-snap, tap-to-fill, the
splitter with multi-cut and undo, offcut reuse with rotation and flipping, a gentle rating, the
finishing sequence with sand, compactor and decorations, the map with real thumbnails, saves,
tutorial, Free Build and settings. All art and sound is procedural. 152 unit tests and 10
Playwright tests (one of them the screenshot generator, skipped by default) pass. A solver
proves every level can be finished.

**Rough edges.**

- Headless Chromium here renders WebGL on the CPU (SwiftShader), so real frame rates on phones
  are unmeasured. Draw calls and allocations were audited instead and are low, but
  please check on a mid-range Android phone.
- On very small screens (iPhone SE) large jobs make bricks around 22 px. Snapping is generous,
  but there's no pinch-zoom.
- Sounds are synthesized and were checked only for running without errors. Their mix and
  levels deserve a listen on a real device with headphones.
- Offcuts can't be cut again, only fitted (see DECISIONS.md).
- Curves are straight chords: the thin gap between a straight cut and a tight concave curve
  is filled with jointing sand, as a paver would do.
- The tutorial and map text is short English text. The flow itself works without reading.

**Known bugs.** None open. Fixed along the way: polygon-clipping crashes (switched to Clipper2),
undo restoring offcuts discarded by the same action, a hang when skipping the finishing
sequence, and the splitter ignoring "Lay it" mid-animation.

### Getting it onto your phones (on your Mac)

```sh
git clone https://github.com/AlphaHylian/herringbone.git && cd herringbone
git checkout claude/herringbone-game      # until the PR is merged
corepack enable && pnpm install           # or: npm i -g pnpm && pnpm install
pnpm build && npx cap sync

# iPhone (needs Xcode 16+): set your signing Team on the App target, pick the phone, press Run.
npx cap open ios

# Android (needs Android Studio): let Gradle sync, enable USB debugging, press Run.
npx cap open android
# or a debug APK from the command line:
cd android && ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk
```
