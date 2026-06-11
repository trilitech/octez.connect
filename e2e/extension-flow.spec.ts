// Chromium content-script harness for the WalletConnect opt-out.
//
// This loads the built SDK inside a real MV3 content script (a separate JS world)
// and drives pairing with `disableWalletConnect: true`. It validates the harness
// wiring and the opt-out plumbing end to end. Note: Chromium's isolated worlds do
// NOT reproduce the Firefox "Xray" membrane bug — the real-Firefox run
// (e2e:firefox-ext) is what exercises that; this proves the harness itself and the
// no-WalletConnect path.
//
// Extension loading needs a full Chromium launched via launchPersistentContext, so
// this spec manages its own context rather than the default fixture browser.
import { test, expect, chromium } from '@playwright/test'
import { copyFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'extension')
// MV3 content scripts forbid `unsafe-eval`, so this needs an eval-free (production
// devtool) SDK bundle — NOT the eval-based dev bundle in examples/. Build one with
// `npm run webpack:sdk:ext` (defaults below) or point EXT_SDK_BUNDLE at your own.
const SDK_BUNDLE =
  process.env.EXT_SDK_BUNDLE ||
  path.join(__dirname, '..', 'packages', 'octez.connect-sdk', 'dist', 'octez.connect.ext.min.js')

test('a dApp in a content script pairs with WalletConnect disabled (Chromium) @extended', async () => {
  // Opt-in only: this spec loads an unpacked extension, which needs headed Chromium
  // (a display / xvfb) and the eval-free SDK bundle. `npm run e2e:ext` sets the flag
  // and builds the bundle; plain `e2e`/`e2e:smoke` runs skip it rather than fail.
  test.skip(
    process.env.RUN_EXT_E2E !== '1',
    'extension harness: run via `npm run e2e:ext` (headed Chromium + eval-free bundle)'
  )

  // Assemble a temporary extension directory from the small fixtures plus the
  // built UMD bundle, so the 4 MB artifact never has to live in the repo.
  const extensionDir = mkdtempSync(path.join(tmpdir(), 'octez-ext-'))
  copyFileSync(path.join(FIXTURE_DIR, 'manifest.json'), path.join(extensionDir, 'manifest.json'))
  copyFileSync(path.join(FIXTURE_DIR, 'content.js'), path.join(extensionDir, 'content.js'))
  copyFileSync(SDK_BUNDLE, path.join(extensionDir, 'octez.connect.min.js'))

  const userDataDir = mkdtempSync(path.join(tmpdir(), 'octez-ext-profile-'))
  // Chromium only loads unpacked extensions in headed mode, so this spec runs
  // headed (use a virtual display such as `xvfb-run` in CI). Set PW_EXT_HEADLESS=1
  // to try headless on a Chromium new-headless build that supports extensions.
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.PW_EXT_HEADLESS === '1',
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`]
  })

  try {
    const page = await context.newPage()
    await page.goto('http://localhost:1234/extension-host.html')

    // The content script built the client in its own compartment with WC disabled.
    // The marker is an empty (zero-size) div, so wait for it attached, not visible.
    await page.waitForSelector('#ext-harness[data-ready="true"]', {
      state: 'attached',
      timeout: 30_000
    })
    await expect(page.locator('#ext-harness')).not.toHaveAttribute('data-init-error', /.+/)

    await page.click('#ext-connect')

    // The pairing alert renders into the shared page DOM and offers wallets.
    await page.waitForSelector('div.alert-wrapper-show', { state: 'visible', timeout: 30_000 })

    // With WalletConnect disabled, no WC-originated errors must have been captured.
    await expect(page.locator('#ext-harness')).toHaveAttribute('data-wc-errors', '0')
  } finally {
    await context.close()
  }
})
