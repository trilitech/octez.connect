import { Origin } from '@tezos-x/octez.connect-types'
import { DAppClient } from '../../src/dapp-client/DAppClient'
import { BeaconEvent } from '../../src/events'

// The UI and WalletConnect layers are not under test and are heavy to load.
jest.mock('@tezos-x/octez.connect-ui', () => ({
  setColorMode: jest.fn(),
  getColorMode: jest.fn().mockReturnValue('light'),
  setDesktopList: jest.fn(),
  setExtensionList: jest.fn(),
  setWebList: jest.fn(),
  setiOSList: jest.fn(),
  getiOSList: jest.fn().mockReturnValue([]),
  getDesktopList: jest.fn().mockReturnValue([]),
  getExtensionList: jest.fn().mockReturnValue([]),
  getWebList: jest.fn().mockReturnValue([]),
  isBrowser: jest.fn().mockReturnValue(true),
  isDesktop: jest.fn().mockReturnValue(false),
  isMobileOS: jest.fn().mockReturnValue(false),
  isIOS: jest.fn().mockReturnValue(false),
  currentOS: jest.fn().mockReturnValue('test'),
  closeToast: jest.fn()
}))
jest.mock('@tezos-x/octez.connect-transport-walletconnect', () => ({
  WalletConnectTransport: class WalletConnectTransport {}
}))
jest.mock('@walletconnect/sign-client', () => ({}))
jest.mock('@walletconnect/types', () => ({}))
jest.mock('@walletconnect/utils', () => ({ getSdkError: jest.fn() }))

/**
 * A wallet-initiated `disconnect` is the only end-of-session signal a dApp
 * gets over postMessage. Wallets built outside this SDK -- and those on
 * <= 4.8.6, which echo the peer's version -- send it flat but stamped with the
 * wrapped dialect's version number. Routing on that number alone dropped it
 * before handleDisconnect(), so no CHANNEL_CLOSED reached the integrator (#52).
 *
 * P2P keeps the SDK from touching a transport that never resolves in a test;
 * the wrapped/flat routing under test runs before any transport is used.
 */
const CONNECTION_INFO = { origin: Origin.P2P, id: 'wallet-sender-id' }

const channelClosedEvents = async (message: Record<string, unknown>): Promise<number> => {
  const client = new DAppClient({ name: 'test-dapp', disableDefaultEvents: true })
  let closed = 0
  await client.subscribeToEvent(BeaconEvent.CHANNEL_CLOSED, () => {
    closed += 1
  })

  await (
    client as unknown as {
      handleResponse: (message: unknown, connectionInfo: unknown) => Promise<void>
    }
  ).handleResponse(message, CONNECTION_INFO)

  await client.destroy()

  return closed
}

describe('DAppClient — incoming disconnect dialects', () => {
  it('handles a flat disconnect stamped with the wrapped-dialect version', async () => {
    await expect(
      channelClosedEvents({
        id: 'message-id',
        version: '4',
        senderId: 'wallet-sender-id',
        type: 'disconnect'
      })
    ).resolves.toBe(1)
  })

  it('handles a wrapped disconnect', async () => {
    await expect(
      channelClosedEvents({
        id: 'message-id',
        version: '4',
        senderId: 'wallet-sender-id',
        message: { type: 'disconnect' }
      })
    ).resolves.toBe(1)
  })

  it('lets the wrapped payload decide, not a top-level type', async () => {
    // A wallet built outside this SDK may stamp both markers. The payload is
    // what identifies the wrapped dialect: reading the absence of a top-level
    // `type` instead would route this envelope flat, and a flat reading sees
    // only the fields at the top level -- for a real response, every payload
    // field lives under `.message` and would be lost. The two readings agree
    // on every conformant message; this pins which one decides when they do
    // not.
    await expect(
      channelClosedEvents({
        id: 'message-id',
        version: '4',
        senderId: 'wallet-sender-id',
        type: 'acknowledge',
        message: { type: 'disconnect' }
      })
    ).resolves.toBe(1)
  })

  it('still drops a wrapped message with no payload', async () => {
    await expect(
      channelClosedEvents({
        id: 'message-id',
        version: '4',
        senderId: 'wallet-sender-id'
      })
    ).resolves.toBe(0)
  })
})
