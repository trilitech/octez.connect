// Real-Firefox content-script harness for the WalletConnect opt-out (#32).
//
// Playwright cannot load extensions in Firefox, so this drives Firefox directly
// via Selenium + geckodriver: it installs a temporary MV3 extension whose content
// script builds a DAppClient with `disableWalletConnect: true`, then asserts the
// client initialises and pairs with no WalletConnect-originated errors — the path
// that the Xray-membrane bug breaks.
//
// This is the one layer that exercises the genuine Firefox compartment, but it
// needs tooling this repo does not install by default. When that tooling is
// missing the runner prints what to install and exits 0 (skip), so it never turns
// into a false CI failure. To enable it:
//
//   1. Install Firefox (a normal desktop Firefox is fine).
//   2. Install geckodriver and put it on PATH (https://github.com/mozilla/geckodriver/releases).
//   3. npm i -D selenium-webdriver
//   4. npm run webpack:sdk:ext   # builds the eval-free bundle (MV3 forbids eval)
//   5. npm run e2e:firefox-ext
//
// On a headless box, run under xvfb: `xvfb-run -a npm run e2e:firefox-ext`.

import { spawn } from 'node:child_process'
import { copyFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..')
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'extension')
const SDK_BUNDLE =
  process.env.EXT_SDK_BUNDLE ||
  path.join(REPO_ROOT, 'packages', 'octez.connect-sdk', 'dist', 'octez.connect.ext.min.js')
const HOST_URL = 'http://localhost:1234/extension-host.html'

const skip = (reason) => {
  console.log(`[firefox-ext] SKIPPED: ${reason}`)
  console.log('[firefox-ext] See the header of e2e/firefox-extension.mjs for setup steps.')
  process.exit(0)
}

// --- preflight: required tooling + the eval-free bundle ---------------------
if (!existsSync(SDK_BUNDLE)) {
  skip(`eval-free SDK bundle not found at ${SDK_BUNDLE} — run \`npm run webpack:sdk:ext\` first`)
}

let webdriver
let firefox
try {
  webdriver = await import('selenium-webdriver')
  firefox = await import('selenium-webdriver/firefox.js')
} catch {
  skip('selenium-webdriver is not installed (npm i -D selenium-webdriver)')
}

const { Builder, By, until } = webdriver

// --- assemble the temporary extension --------------------------------------
const extensionDir = mkdtempSync(path.join(tmpdir(), 'octez-ff-ext-'))
copyFileSync(path.join(FIXTURE_DIR, 'manifest.json'), path.join(extensionDir, 'manifest.json'))
copyFileSync(path.join(FIXTURE_DIR, 'content.js'), path.join(extensionDir, 'content.js'))
copyFileSync(SDK_BUNDLE, path.join(extensionDir, 'octez.connect.min.js'))

// --- serve examples/ on :1234 so the content script matches the host page ---
const server = spawn('node', ['scripts/static-server.js', 'examples', '1234'], {
  cwd: REPO_ROOT,
  stdio: 'ignore'
})

const waitForServer = async () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(HOST_URL)
      if (response.ok) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('static server did not start on :1234')
}

let driver
let failed = false
try {
  await waitForServer()

  const options = new firefox.Options()
  if (process.env.FIREFOX_HEADLESS !== '0') {
    options.addArguments('-headless')
  }
  // Allow pointing at a non-standard Firefox build (e.g. an extracted tarball).
  if (process.env.FIREFOX_BINARY) {
    options.setBinary(process.env.FIREFOX_BINARY)
  }

  driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build()

  // Load the unpacked MV3 extension as a temporary add-on (allows unsigned).
  await driver.installAddon(extensionDir, true)

  await driver.get(HOST_URL)

  // The content script writes its status onto a marker div in the shared DOM.
  const marker = await driver.wait(until.elementLocated(By.id('ext-harness')), 30_000)
  await driver.wait(async () => (await marker.getAttribute('data-ready')) === 'true', 30_000)

  const initError = await marker.getAttribute('data-init-error')
  if (initError) {
    throw new Error(`DAppClient failed to init in the content script: ${initError}`)
  }

  await driver.findElement(By.id('ext-connect')).click()

  // Pairing alert must appear, and no WalletConnect errors may have been captured.
  await driver.wait(until.elementLocated(By.css('div.alert-wrapper-show')), 30_000)
  const wcErrors = await marker.getAttribute('data-wc-errors')
  if (wcErrors !== '0') {
    throw new Error(`captured ${wcErrors} WalletConnect error(s) with WC disabled`)
  }

  console.log('[firefox-ext] PASS: content-script dApp paired with WalletConnect disabled, 0 WC errors')
} catch (error) {
  failed = true
  console.error(`[firefox-ext] FAIL: ${error && error.message ? error.message : error}`)
} finally {
  if (driver) {
    await driver.quit().catch(() => undefined)
  }
  server.kill()
}

process.exit(failed ? 1 : 0)
