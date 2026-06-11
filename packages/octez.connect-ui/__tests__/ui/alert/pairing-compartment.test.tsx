import { renderHook, act, cleanup, waitFor } from '@testing-library/react'
import useConnect from '../../../src/ui/alert/hooks/useConnect'
import { hasWalletConnectSymKey } from '../../../src/utils/walletconnect'
import { NetworkType } from '@tezos-x/octez.connect-types'
import { OSLink } from '../../../src/utils/wallets'
import { mangledPeerInfo, breakIteration } from '../../helpers/xray'

jest.mock('../../../src/utils/get-tzip10-link', () => ({
  getTzip10Link: jest.fn().mockReturnValue('https://example.com/tzip10')
}))

jest.mock('../../../src/utils/platform', () => ({
  isTwBrowser: jest.fn().mockReturnValue(false),
  isAndroid: jest.fn().mockReturnValue(false),
  isMobileOS: jest.fn().mockReturnValue(false),
  isIOS: jest.fn().mockReturnValue(false)
}))

const windowOpenMock = jest.fn()

beforeEach(() => {
  window.open = windowOpenMock
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  jest.clearAllMocks()
})

const kukaiWebWallet = {
  key: 'wallet-web-wc',
  name: 'Kukai Wallet',
  id: 'wallet-web-wc-id',
  types: ['web', 'ios'],
  supportedInteractionStandards: ['wallet_connect'],
  links: {
    [OSLink.WEB]: 'https://kukai.example.com',
    [OSLink.IOS]: 'https://kukai.example.com/ios'
  },
  image: 'https://kukai.example.com/icon.png'
}

const pairingPayload = (walletConnectSyncCode?: PromiseLike<string>) => ({
  title: 'compartment test',
  pairingPayload: {
    networkType: NetworkType.GHOSTNET,
    p2pSyncCode: Promise.resolve('p2p'),
    postmessageSyncCode: Promise.resolve('post'),
    walletConnectSyncCode
  }
})

describe('pairing under Firefox-compartment conditions', () => {
  describe('hasWalletConnectSymKey tolerates membrane-mangled values', () => {
    // A peer-info promise that lost its value across the membrane resolves to
    // undefined; the symKey check must report "no WC" rather than throwing.
    it.each([[undefined], [null], ['']])('returns false for %p without throwing', (value) => {
      expect(() => hasWalletConnectSymKey(value as any)).not.toThrow()
      expect(hasWalletConnectSymKey(value as any)).toBe(false)
    })
  })

  it('a wallet collection whose iterator was stripped breaks Map construction (hazard guard)', () => {
    // Documents why the consumption path must never build a Map straight from a
    // cross-compartment collection: the membrane strips the iterator.
    const broken = breakIteration(new Map([['a', 1]]))
    expect(() => new Map(broken as any)).toThrow()
  })

  it('selecting a web wallet with a membrane-mangled WC payload degrades gracefully', async () => {
    const wallets = new Map<string, any>([['wallet-web-wc', kukaiWebWallet]])

    const { result } = renderHook(() =>
      useConnect(false, mangledPeerInfo(), Promise.resolve('p2p'), Promise.resolve('post'), wallets, jest.fn())
    )

    // Before the fix this threw "Cannot read properties of undefined (reading 'startsWith')".
    await act(async () => {
      await expect(
        result.current[7]('wallet-web-wc', pairingPayload(mangledPeerInfo()))
      ).resolves.not.toThrow()
    })

    await waitFor(() => expect(result.current[3]).toBe('install'))
    expect(result.current[6]).toBe(false) // isWCWorking
    expect(result.current[1]).toBe(false) // isLoading settled
  })

  it('starts with WalletConnect not working and does not throw when WC is disabled (no payload)', async () => {
    const wallets = new Map<string, any>([['wallet-web-wc', kukaiWebWallet]])

    const { result } = renderHook(() =>
      useConnect(false, undefined, Promise.resolve('p2p'), Promise.resolve('post'), wallets, jest.fn())
    )

    expect(result.current[6]).toBe(false) // isWCWorking starts false with no WC payload

    await act(async () => {
      await expect(
        result.current[7]('wallet-web-wc', pairingPayload(undefined))
      ).resolves.not.toThrow()
    })

    expect(result.current[6]).toBe(false)
  })
})
