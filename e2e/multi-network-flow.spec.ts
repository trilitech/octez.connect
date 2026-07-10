import { test, expect, BrowserContext, Page } from '@playwright/test'

// End-to-end exercise of the v4 multi-network flow over the P2P (Beacon)
// transport: a dApp requests permissions across two CAIP-2 networks, an
// upgraded wallet returns an `accounts` fanout, the dApp materialises one
// account per network, and an operation targeting a specific network carries
// its CAIP-2 string across the wire.
//
// Requires reachable Beacon relay nodes (matrixNodes). Run with `npm run e2e`.

const L1 = 'tezos:NetXdQprcVkpaWU' // mainnet
const L2 = 'tezos:NetXnHfVqm9iesp' // ghostnet

let dapp: Page
let dappCtx: BrowserContext
let wallet: Page
let walletCtx: BrowserContext

test.beforeEach(async ({ browser }) => {
  dappCtx = await browser.newContext()
  walletCtx = await browser.newContext()

  await dappCtx.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:1234'
  })
  await walletCtx.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:1234'
  })

  dapp = await dappCtx.newPage()
  wallet = await walletCtx.newPage()

  // Surface browser-side errors so e2e failures pinpoint the actual cause
  // (e.g. requestPermissions throwing inside the bundle without opening UI).
  dapp.on('console', (msg) => console.log(`[dapp:${msg.type()}]`, msg.text()))
  dapp.on('pageerror', (err) => console.log(`[dapp:pageerror]`, err.message))

  await dapp.goto('http://localhost:1234/dapp.html')
  await wallet.goto('http://localhost:1234/wallet.html')
})

test.afterEach(async () => {
  const closeIfPossible = async (ctx: BrowserContext): Promise<void> => {
    if (typeof ctx?.close === 'function') {
      await ctx.close()
    }
  }
  await Promise.allSettled([closeIfPossible(dappCtx), closeIfPossible(walletCtx)])
})

// Drive the pairing alert and hand the sync code to the wallet. Triggering the
// multi-network permission button doubles as the first request that opens the
// pairing flow.
async function pairMultiNetwork(): Promise<void> {
  await dapp.click('#requestMultiNetworkPermission')
  await dapp.waitForSelector('div.alert-wrapper-show', { state: 'visible', timeout: 30_000 })

  await dapp.click('div.alert-footer')
  await dapp.click('button:has-text("Show QR code")')
  await dapp.waitForSelector('span.pair-other-info', { state: 'visible', timeout: 30_000 })

  await dapp.click('button:has-text("octez.connect")')
  await dapp.waitForSelector('div.qr-right', { state: 'visible', timeout: 30_000 })
  await dapp.click('div.qr-right')

  const pairingCode = await dapp.evaluate(async () => navigator.clipboard.readText())
  expect(pairingCode).toBeTruthy()

  // Hand the code to the wallet via the hidden input (robust across contexts).
  await wallet.fill('#hidden-input', pairingCode)
  await wallet.click('#paste')
}

test('v4 multi-network: fanout yields one account per network and operations route by CAIP-2', async () => {
  await pairMultiNetwork()

  // The wallet returns an `accounts` fanout for the two requested networks, so
  // the dApp should materialise exactly two accounts keyed by L1 and L2.
  await expect(dapp.locator('#accounts .account-row')).toHaveCount(2, { timeout: 30_000 })

  const chainIds = await dapp
    .locator('#accounts .account-row')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-chainid')))
  expect(chainIds.sort()).toEqual([L1, L2].sort())

  // Target an operation at L2 (the default value of #operationNetwork) and
  // confirm the CAIP-2 string reached the wallet and the dApp resolved.
  await expect(dapp.locator('#operationNetwork')).toHaveValue(L2)
  await dapp.click('#requestOperationMultiNetwork')

  await expect(wallet.locator('#lastOpNetwork')).toHaveText(L2, { timeout: 30_000 })
  await expect(dapp.locator('#operationResult')).toContainText(`operation ok on ${L2}`, {
    timeout: 30_000
  })
})
