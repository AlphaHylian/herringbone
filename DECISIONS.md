# Decisions

Judgment calls made while building Herringbone, with the reasoning.

## Tooling

- **TypeScript pinned to 5.9.** `pnpm add typescript` resolves to 7.x (the native port), but
  `typescript-eslint` currently supports `<6.1`. 5.9 keeps lint and typecheck in step.
- **Branch workflow.** The repository has a GitHub remote. Work is pushed to the
  `claude/herringbone-game` branch after each milestone, with a draft pull request into `main`,
  rather than committing straight to `main`.
- **Playwright browser.** The config uses `PW_CHROMIUM_PATH` or the sandbox's pre-installed
  `/opt/pw-browsers/chromium` when it exists, otherwise Playwright's own download (CI runs
  `playwright install chromium`).
- **Capacitor 8** (current stable) with Swift Package Manager on iOS (the default for new
  Capacitor 8 projects), so no CocoaPods step is needed.
- **Status bar.** Dark text on the light sand background (`Style.Light` / `UIStatusBarStyleDarkContent`),
  web view drawn under the status bar; the game pads its UI by the safe-area insets.

## Geometry

- **Clipper2 (`clipper2-ts`) instead of `polygon-clipping`.** I started with `polygon-clipping`
  as suggested, but it threw "Unable to complete output ring" on 45° herringbone bricks and on
  unions of many exactly-touching slots, even with coordinate snapping. Its successor
  `polyclip-ts` failed the same way. Clipper2 works at a fixed decimal precision (0.0001 mm) and
  handled every case; it's actively maintained and was also about twice as fast here.
- **World units are millimetres.** Bricks are 200 × 100 mm. Joints aren't modelled
  geometrically; the renderer insets each brick slightly to draw them.
- **Herringbone and basketweave need length = 2 × width.** The loader enforces it.
  Stretcher bond accepts any brick shape.
- **45° herringbone is the 90° tiling rotated by 45°.** Levels can add their own rotation and
  offset.
- **Accuracy is measured against the target's convex hull**, not the raw target. Straight cuts
  of a convex brick always give convex pieces, so a target that bends inwards (around a tree pit)
  can never be matched exactly. The hull is the best any paver could do, so a perfect cut
  scores 1.0. The thin gap between a straight cut and a concave curve fills with jointing sand.
- **Concave targets are split.** At a sharp inside corner (over 22° of turn, e.g. the inside
  corner of an L-shaped patio) a target is split into convex parts along an edge extension, each
  its own slot. A gentle concave curve whose hull gap is more than 5% of a brick is split at its
  deepest point. That's how a paver would use two pieces around a tight curve.
- **Slivers.** Brick-and-border overlaps smaller than 8% of a brick get no slot. The sand bed
  under the job shows through there and gets filled by the jointing-sand sweep.
- **Curves need more than one cut.** The ideal cuts for a slot follow its hull edges. A run of
  short edges (a sampled curve) is simplified with Douglas–Peucker at 3 mm to a few chords. The
  splitter allows any number of cuts.
- **Offcuts** are always convex, because they come from straight cuts of a convex brick. A
  piece fits a slot if some rotation (or flip, since bricks look the same both sides) and
  translation puts every hull corner inside it, within 4 mm, and it covers at least 95% of the
  hull. Any excess is trimmed off. Offcuts can't be cut again in the splitter. That keeps the
  splitter about one fresh brick per slot and keeps the tray simple.
- **Tray.** Leftovers under 12% of a brick are swept away. The tray holds 6 pieces, and when
  it overflows the smallest piece goes.

## Rating

- 1 brick for finishing. 2 bricks if at least 60% of edge pieces fit cleanly (accuracy at least
  0.9), or 40% clean plus good material use. 3 bricks if at least 85% are clean and the player
  saved at least half as many bricks as the greedy solver does by reusing offcuts.

## Content

- **Neighborhoods and patterns.** There are four patterns and three neighborhoods. Maple Row
  teaches stretcher bond and 90° herringbone, since the game is named after herringbone and it
  should arrive early. Willow Lane unlocks 45° herringbone and Harbour Hill unlocks basketweave.
- Levels are authored in `scripts/build-levels.mjs` (`pnpm levels`), which samples arcs at
  about 70 mm chords and writes the JSON files in `src/levels/`.

## Feel

- **Shadows** are three nested translucent polygons per piece, not a blur filter. They batch
  with everything else and cost nothing per frame.
- **One texture atlas per palette.** Every brick, cut piece and offcut is a Graphics polygon
  filled from the same atlas texture in `'global'` texture space, through an affine "skin"
  that maps brick-local millimetres into the piece's current frame. A piece keeps its exact
  brick texture when it moves from the splitter to the tray to another slot, and everything
  batches into very few draw calls.
- **Finishing sequence:** sand sweep 1.9 s, compactor 2.3 s, camera pull-back 1.3 s, then
  decorations popping in about 0.15 s apart, then the rating card. That's about 7 s in
  total, and a tap anywhere skips to the end state. The cat strolls in from off-screen after
  the sequence; it doesn't block the rating.
- **Decorations** are drawn procedurally from code. A unit test keeps grass-side items
  (benches, plants, cats, bikes) clear of the paving.
- **Headless performance numbers are not meaningful.** The sandbox's Chromium renders WebGL
  with SwiftShader on the CPU, where even an empty stage manages about 40 fps. Performance is
  judged by draw-call and allocation discipline instead (see milestone 7).

## Progression

- **Unlocks are linear.** A job opens when the one before it is finished, so a neighborhood
  opens when the previous one is done. With no fail states, nobody can get stuck.
- **Patterns:** stretcher bond and 90° herringbone from the start (Maple Row), 45° herringbone
  with Willow Lane, basketweave with Harbour Hill. Free Build offers only unlocked patterns,
  so unlocking still means something, but every shape is open from the start.
- **Ratings keep the best result** when a job is replayed. "Pave again" is offered from the
  results card and from the review screen.
- **Save record** per job: rating, bricks, offcuts reused, timestamp, the brick variant per slot,
  and each edge piece's polygon and texture transform. That's enough to redraw the player's
  exact patio in thumbnails and review. The save format is versioned (`version: 1`), parsing
  never throws, and saves from a newer build are ignored rather than guessed at.
- **Client notes** appear before each job (tap to start). The tutorial runs once, on the first
  job, until the first cut piece is laid. Debug deep links (`?level=id`) skip both unless
  `&note=1` or `&tutorial=1` is given.
- **Thumbnails** are rendered one per frame so the map opens instantly, and cached by level and
  completion time.
