import { test, expect } from '@playwright/test'

// Real phones via BrowserStack. One page, no extra contexts, no clipboard:
// real iPhones support neither. Pages are served on the runner and reached
// through BrowserStack Local at bs-local.com.
const BASE_URL = process.env.PHONES_BASE_URL ?? 'http://bs-local.com:1234'

test('wallet picker opens with the phone layout', async ({ page }) => {
  await page.goto(`${BASE_URL}/dapp.html`)

  // Fail if this is not a real phone browser (e.g. the SDK fell back to a
  // local desktop browser).
  expect(await page.evaluate(() => navigator.userAgent)).toMatch(/iPhone|Android/)

  await page.click('#requestPermission')
  await expect(page.locator('div.alert-wrapper-show')).toBeVisible({ timeout: 30_000 })

  // Phones show wallet tiles; the "Show more" footer is desktop-only
  // (packages/octez.connect-ui/src/components/alert/index.tsx).
  const tiles = page.locator('div.top-wallets-wrapper')
  await expect(tiles).toBeVisible()
  for (const name of ['Kukai', 'MetaMask', 'AirGap', 'Other Wallets']) {
    await expect(tiles.getByText(name, { exact: true })).toBeVisible()
  }
  await expect(page.locator('div.alert-footer')).toHaveCount(0)
})
