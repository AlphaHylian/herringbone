import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Use an explicit Chromium if given (or the sandbox's pre-installed one); otherwise
// fall back to Playwright's own download (CI runs `playwright install chromium`).
const preinstalled = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PW_CHROMIUM_PATH || (existsSync(preinstalled) ? preinstalled : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
