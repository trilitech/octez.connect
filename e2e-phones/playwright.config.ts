import { defineConfig } from '@playwright/test'

// Real-phone tests. Run only through BrowserStack (browserstack.yml,
// .github/workflows/real-phones.yml). Kept outside e2e/ so the normal
// suite (playwright.config.ts, testDir ./e2e) never picks them up.
// retries: 1 — a pass on retry ("flaky") counts as green.
export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  retries: 1,
  reporter: [['list']]
})
