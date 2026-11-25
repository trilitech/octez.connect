import { arrangeTopWallets, DEFAULT_FEATURED_WALLETS, MergedWallet } from '../../src/utils/wallets'
import tezosRegistry from '../../src/data/tezos.json'

const wallet = (key: string, name: string) => ({ key, name }) as MergedWallet

describe('DEFAULT_FEATURED_WALLETS', () => {
  it('every default id matches a wallet in the bundled Tezos list', () => {
    const keys = [
      ...tezosRegistry.extensionList,
      ...tezosRegistry.desktopList,
      ...tezosRegistry.webList,
      ...tezosRegistry.iOSList
    ].map((w) => w.key)

    for (const id of DEFAULT_FEATURED_WALLETS) {
      expect(keys.some((key) => key.startsWith(id))).toBe(true)
    }
  })
})

describe('arrangeTopWallets', () => {
  const wallets = [
    wallet('zeta_web', 'Zeta'),
    wallet('alpha_ios', 'Alpha'),
    wallet('kukai_web', 'Kukai'),
    wallet('temple_chrome', 'Temple'),
    wallet('umami_desktop', 'Umami'),
    wallet('nightly_chrome', 'Nightly')
  ]

  it('puts featured wallets first in the given order, then the rest by name', () => {
    const result = arrangeTopWallets(wallets, ['umami', 'kukai'])

    expect(result.map((w) => w.name)).toEqual([
      'Umami',
      'Kukai',
      'Alpha',
      'Nightly',
      'Temple',
      'Zeta'
    ])
  })

  it('skips a featured id that matches no wallet so the next featured one moves up', () => {
    const result = arrangeTopWallets(wallets, ['kukai', 'missing', 'temple', 'umami', 'nightly'])

    expect(result.slice(0, 4).map((w) => w.name)).toEqual(['Kukai', 'Temple', 'Umami', 'Nightly'])
    expect(result).not.toContain(undefined)
  })
})
