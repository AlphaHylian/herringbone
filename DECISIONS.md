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
