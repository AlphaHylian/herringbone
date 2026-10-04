# Herringbone

A calm, tactile puzzle game about laying brick patios, paths and driveways, seen from above.
Drag bricks from the pallet and they snap into the pattern. Where the pattern meets the edge of
the job, take a brick to the splitter, swipe a cut line, and drop the piece into the gap.

No timers, no lives, no fail states, no ads.

## Run in the browser

Requirements: Node 22+, pnpm 10+.

```sh
pnpm install
pnpm dev          # http://localhost:5173 (use your browser's phone emulation)
```

## Tests

```sh
pnpm typecheck
pnpm lint
pnpm test         # Vitest unit tests (pure game logic in src/core)
pnpm build
pnpm e2e          # Playwright smoke tests at a 390x844 phone viewport
```

## Building for phones

See the iOS and Android sections (filled in as the project matures).
