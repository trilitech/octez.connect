import { test, expect, Page, BrowserContext, Browser } from '@playwright/test'
import { pairWithWCWallet } from './utils'

// Real genesis chain ids (CAIP-2) — must match TEZOS_NETWORK_GENESIS_IDS.
const L1 = 'tezos:NetXdQprcVkpaWU' // mainnet
const L2 = 'tezos:NetXnHfVqm9iesp' // ghostnet

// WalletConnect e2e depends on the public relay, which is known to be flaky.
// Every test is marked slow (3x timeout) via test.slow() in the hooks/tests.

test.describe('WalletConnect classic flow', () => {
  let dapp: Page = {} as unknown as Page
  let dappCtx: BrowserContext = {} as unknown as BrowserContext
  let wallet: Page = {} as unknown as Page
  let walletCtx: BrowserContext = {} as unknown as BrowserContext

  test.beforeEach(async ({ browser }) => {
    test.slow()
    ;[dapp, dappCtx, wallet, walletCtx] = await pairWithWCWallet(browser)
  })

  test.afterEach(async () => {
    // pairWithWCWallet may throw before assigning dappCtx/walletCtx, leaving them
    // as the `{} as BrowserContext` placeholders whose .close() is undefined.
    // Guard the call and use allSettled so cleanup failures do not mask the real
    // test outcome.
    const closeIfPossible = async (ctx: BrowserContext): Promise<void> => {
      if (typeof ctx?.close === 'function') {
        await ctx.close()
      }
    }

    await Promise.allSettled([closeIfPossible(dappCtx), closeIfPossible(walletCtx)])
  })

  test.skip('should load activeAccount on page reload', async () => {
    await dapp.evaluate(() => {
      return window.location.reload()
    })
    await expect(dapp.locator('#activeAccount')).toHaveText(
      'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
      {
        timeout: 30_000
      }
    )
    const activeAccount = await dapp.evaluate(() => {
      return window.localStorage.getItem('beacon:active-account')
    })
    expect(activeAccount).not.toBe('undefined')
  })

  test('should send a request to sign', async () => {
    // #sendToSelf
    await dapp.click('#signPayloadRaw')

    await dapp.waitForSelector('p.toast-label', { state: 'visible', timeout: 30_000 })

    await dapp.waitForSelector('p:has-text("successfully")', {
      state: 'visible',
      timeout: 30_000
    })
  })

  test('should send 1 mutez', async () => {
    // #sendToSelf
    await dapp.click('#sendToSelf')

    await dapp.waitForSelector('p.toast-label', { state: 'visible', timeout: 30_000 })
    await dapp.waitForSelector('p:has-text("successfully")', {
      state: 'visible',
      timeout: 30_000
    })

    await dappCtx.close()
  })

  test('should rate limit', async () => {
    // The rate limit threshold is > 2 requests within 5 seconds.
    // Pairing triggers a permissions request which can count towards the limit.
    // Wait out the window to make this deterministic, then send 3 rapid requests.
    await dapp.waitForTimeout(5500)

    await dapp.click('#sendToSelf')
    await dapp.click('#sendToSelf')
    await dapp.click('#sendToSelf')

    await dapp.waitForSelector('div.alert-wrapper-show', { state: 'visible', timeout: 30_000 })

    await dapp.waitForSelector('h3:has-text("Error")')
    await dapp.waitForSelector('div:has-text("Rate")', {
      state: 'visible',
      timeout: 30_000
    })

    await dapp.click('button:has-text("Close")')

    await dapp.waitForSelector('div.alert-wrapper-show', { state: 'detached', timeout: 30_000 })
  })

  test('should send 1 mutez on second tab', async () => {
    const dapp2 = await dappCtx.newPage()
    await dapp2.goto('http://localhost:1234/dapp.html')

    await expect(dapp2.locator('#activeAccount')).toHaveText(
      'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
      {
        timeout: 30_000
      }
    )

    // #sendToSelf
    await dapp2.click('#sendToSelf')

    await dapp2.waitForSelector('p.toast-label', { state: 'visible', timeout: 30_000 })
    await dapp2.waitForSelector('p:has-text("successfully")', {
      state: 'visible',
      timeout: 30_000
    })
  })

  test('should send 1 mutez on both tabs', async () => {
    const dapp2 = await dappCtx.newPage()
    await dapp2.goto('http://localhost:1234/dapp.html')

    // #sendToSelf
    await dapp.click('#sendToSelf')
    await dapp2.click('#sendToSelf')

    const step1 = async () => {
      await dapp.waitForSelector('p.toast-label', { state: 'visible', timeout: 30_000 })
      await dapp.waitForSelector('p:has-text("successfully")', {
        state: 'visible',
        timeout: 30_000
      })
    }

    const step2 = async () => {
      await dapp2.waitForSelector('p.toast-label', { state: 'visible', timeout: 30_000 })
      await dapp2.waitForSelector('p:has-text("successfully")', {
        state: 'visible',
        timeout: 30_000
      })
    }

    await Promise.all([step1, step2])
  })

  test('should disconnect on both tabs', async () => {
    const dapp2 = await dappCtx.newPage()
    await dapp2.goto('http://localhost:1234/dapp.html')

    await dapp.click('#disconnect')

    await expect(dapp.locator('#activeAccount')).toHaveText('', { timeout: 30_000 })
    await expect(dapp2.locator('#activeAccount')).toHaveText('', { timeout: 30_000 })

    const activeAccount = await dapp.evaluate(() => {
      return window.localStorage.getItem('beacon:active-account')
    })

    expect(activeAccount).toBe('undefined')
  })

  test('should clearActiveAccount on both tabs', async () => {
    const dapp2 = await dappCtx.newPage()
    await dapp2.goto('http://localhost:1234/dapp.html')

    await dapp.click('#clearActiveAccount')

    await expect(dapp.locator('#activeAccount')).toHaveText('', { timeout: 30_000 })
    await expect(dapp2.locator('#activeAccount')).toHaveText('', { timeout: 30_000 })

    const activeAccount = await dapp.evaluate(() => {
      return window.localStorage.getItem('beacon:active-account')
    })

    expect(activeAccount).toBe('undefined')
  })

  test('should update the session on both tabs', async () => {
    const dapp2 = await dappCtx.newPage()
    await dapp2.goto('http://localhost:1234/dapp.html')

    await wallet.click('#update')

    await expect(dapp.locator('#activeAccount')).toHaveText(
      'tz1TwNWHfczra9ubmB9qbqw49EJN3fVcwsVo',
      {
        timeout: 30_000
      }
    )
    await expect(dapp2.locator('#activeAccount')).toHaveText(
      'tz1TwNWHfczra9ubmB9qbqw49EJN3fVcwsVo',
      {
        timeout: 30_000
      }
    )

    const activeAccount = await dapp.evaluate(() => {
      return window.localStorage.getItem('beacon:active-account')
    })

    expect(activeAccount).not.toBe('undefined')
  })

  test('should close the session through wallet', async () => {
    const dapp2 = await dappCtx.newPage()
    await dapp2.goto('http://localhost:1234/dapp.html')

    await wallet.click('#disconnect')

    await expect(dapp.locator('#activeAccount')).toHaveText('', {
      timeout: 30_000
    })
    await expect(dapp2.locator('#activeAccount')).toHaveText('', {
      timeout: 30_000
    })

    const activeAccount = await dapp.evaluate(() => {
      return window.localStorage.getItem('beacon:active-account')
    })

    expect(activeAccount).toBe('undefined')
  })

  // due to an issue in WalletConnect, we cannot test the flow connect -> disconnect -> reconnect

  // test('should disconnect on tab1 and reconnect on tab2', async () => {})

  // test('should disconnect on tab2 and reconnect on tab3', async () => {})
})

// v4 multi-network acceptance over WalletConnect. The proposal networks only
// travel with the SESSION PROPOSAL (built at pairing time), so this test must
// pair via the multi-network permission button rather than reuse the classic
// pairWithWCWallet helper.
test.describe('WalletConnect multi-network flow', () => {
  const pairMultiNetworkWC = async (browser: Browser) => {
    const dappCtx = await browser.newContext()
    const walletCtx = await browser.newContext()

    await dappCtx.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://localhost:1234'
    })
    await walletCtx.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://localhost:1234'
    })

    const dapp = await dappCtx.newPage()
    const wallet = await walletCtx.newPage()

    await dapp.goto('http://localhost:1234/dapp.html')
    await wallet.goto('http://localhost:1234/wallet-wc.html')

    // The multi-network permission request doubles as the pairing trigger, so
    // the extra networks feed requiredNamespaces/optionalNamespaces of the
    // WalletConnect session proposal.
    await dapp.click('#requestMultiNetworkPermission')
    await dapp.waitForSelector('div.alert-wrapper-show', { state: 'visible', timeout: 30_000 })

    await dapp.click('div.alert-footer')
    await dapp.click('button:has-text("Show QR code")')
    await dapp.waitForSelector('span.pair-other-info', { state: 'visible', timeout: 30_000 })

    await dapp.click('button:has-text("WalletConnect")')
    await dapp.waitForSelector('div.qr-right', { state: 'visible', timeout: 30_000 })
    await dapp.click('div.qr-right')

    const pairingCode = await dapp.evaluate(async () => navigator.clipboard.readText())
    expect(pairingCode).toBeTruthy()

    await wallet.click('#paste')

    return [dapp, dappCtx, wallet, walletCtx] as const
  }

  test('v4 multi-network over WC: one account row per genesis chain id', async ({ browser }) => {
    test.slow()

    const [dapp, dappCtx, , walletCtx] = await pairMultiNetworkWC(browser)

    try {
      // The mock wallet approves one CAIP account per proposed chain
      // (required: ghostnet, optional: ghostnet + mainnet) and serves
      // tezos_getAccounts per chain, so the dApp must materialise exactly two
      // accounts keyed by the REAL genesis chain ids.
      await expect(dapp.locator('#accounts .account-row')).toHaveCount(2, { timeout: 60_000 })

      const chainIds = await dapp
        .locator('#accounts .account-row')
        .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-chainid')))
      expect(chainIds.sort()).toEqual([L1, L2].sort())

      // The mock wallet shares the same address on every chain.
      const addresses = await dapp
        .locator('#accounts .account-row')
        .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-address')))
      expect(addresses).toEqual([
        'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
        'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb'
      ])
    } finally {
      await Promise.allSettled([dappCtx.close(), walletCtx.close()])
    }
  })
})
