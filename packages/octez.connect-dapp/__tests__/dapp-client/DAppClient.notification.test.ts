import { DAppClient } from '../../src/dapp-client/DAppClient'

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

// Capture what is signed instead of signing it.
const mockSignMessage = jest.fn().mockResolvedValue('edsig-test')
jest.mock('@tezos-x/octez.connect-utils', () => ({
  ...jest.requireActual('@tezos-x/octez.connect-utils'),
  signMessage: (...args: unknown[]) => mockSignMessage(...args)
}))

describe('DAppClient notification signature payload', () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('frames the signed text with its byte length, not the hex-character count', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => 'sent'
    }) as unknown as typeof fetch

    const client = new DAppClient({ name: 'test-dapp', disableDefaultEvents: true })
    jest.spyOn(client as any, 'keyPair', 'get').mockReturnValue(
      Promise.resolve({ publicKey: new Uint8Array(32).fill(1), secretKey: new Uint8Array(64).fill(2) })
    )

    await (client as any).sendNotificationWithAccessToken({
      url: 'https://push.test',
      recipient: 'tz1recipient',
      title: 'Titlé',
      body: 'Body',
      payload: 'payload',
      protocolIdentifier: 'tezos',
      accessToken: 'token'
    })

    expect(mockSignMessage).toHaveBeenCalledTimes(1)
    const signed: string = mockSignMessage.mock.calls[0][0]

    const sendCall = (global.fetch as jest.Mock).mock.calls.find(
      ([url]) => url === 'https://push.test/send'
    )
    const sentBody = JSON.parse(sendCall[1].body)
    const text = Buffer.from(signed.slice(12), 'hex').toString('utf8')
    expect(text).toBe(
      ['Tezos Signed Message: ', 'tz1recipient', 'Titlé', 'Body', sentBody.timestamp, 'payload'].join(' ')
    )

    expect(signed.startsWith('0501')).toBe(true)
    const lengthField = parseInt(signed.slice(4, 12), 16)
    const bodyHex = signed.slice(12)
    expect(lengthField).toBe(bodyHex.length / 2)
    expect(lengthField).toBe(Buffer.byteLength(text, 'utf8'))
    expect(lengthField).not.toBe(bodyHex.length)
  })
})
