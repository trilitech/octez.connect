import { Client, LocalStorage } from '@tezos-x/octez.connect-core'
import { BeaconErrorType, BeaconMessageType } from '@tezos-x/octez.connect-types'
import { WalletClient } from '../../src/client/WalletClient'
import { OutgoingResponseInterceptor } from '../../src/interceptors/OutgoingResponseInterceptor'

// Unlike WalletClient.signPayload.test.ts, the real IncomingRequestInterceptor
// is used here, so the check and the normalisation are exercised together.
jest.mock('@tezos-x/octez.connect-core', () => {
  const actual = jest.requireActual('@tezos-x/octez.connect-core')
  return {
    ...actual,
    LocalStorage: jest.fn().mockImplementation(() => ({
      get: jest.fn().mockResolvedValue([]),
      set: jest.fn().mockResolvedValue(undefined)
    })),
    PermissionManager: jest.fn().mockImplementation(() => ({})),
    AppMetadataManager: jest.fn().mockImplementation(() => ({
      getAppMetadata: jest.fn().mockResolvedValue({ senderId: 'dapp', name: 'dapp' })
    })),
    getSenderId: jest.fn().mockResolvedValue('sender-id'),
    Logger: jest.fn().mockImplementation(() => ({ log: jest.fn(), warn: jest.fn() }))
  }
})
jest.mock('../../src/transports/WalletP2PTransport')
jest.mock('../../src/interceptors/OutgoingResponseInterceptor')

const ctx = { origin: 'p2p', id: 'conn-1' } as any

const wrapped = (id: string, blockchainData: any) => ({
  id,
  version: '3',
  senderId: 'dapp',
  message: { type: BeaconMessageType.BlockchainRequest, blockchainIdentifier: 'tezos', blockchainData }
})

describe('WalletClient + IncomingRequestInterceptor — wrapped sign_payload', () => {
  let client: WalletClient
  let callback: jest.Mock

  const errors = () =>
    (OutgoingResponseInterceptor.intercept as jest.Mock).mock.calls
      .map((c) => c[0].message)
      .filter((m: any) => m.type === BeaconMessageType.Error)

  beforeEach(async () => {
    jest.clearAllMocks()
    jest.spyOn(Client.prototype, 'init').mockResolvedValue('x' as any)
    client = new WalletClient({ name: 'w', storage: new LocalStorage() as any })
    jest.spyOn(client as any, '_connect').mockResolvedValue(undefined)
    callback = jest.fn()
    await client.connect(callback)
  })

  const send = (msg: any) => (client as any).handleResponse(msg, ctx)
  const sign = (type: any, signingType: any, payload: any) =>
    wrapped('r1', { type, signingType, payload, sourceAddress: 'tz1src' })

  it('a string type with a consistent request reaches the wallet as a flat sign request', async () => {
    await send(sign('sign_payload_request', 'micheline', '05abcdef'))
    expect(errors()).toHaveLength(0)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toMatchObject({
      type: BeaconMessageType.SignPayloadRequest,
      signingType: 'micheline',
      payload: '05abcdef'
    })
  })

  it('RAW + 03 with a string type is refused and never reaches the wallet', async () => {
    await send(sign('sign_payload_request', 'raw', '03abcdef'))
    expect(errors()).toHaveLength(1)
    expect(errors()[0].errorType).toBe(BeaconErrorType.PARAMETERS_INVALID_ERROR)
    expect(callback).not.toHaveBeenCalled()
  })

  it('RAW + 03 with an array type is refused and never reaches the wallet', async () => {
    await send(sign(['sign_payload_request'], 'raw', '03abcdef'))
    expect(errors()).toHaveLength(1)
    expect(errors()[0].errorType).toBe(BeaconErrorType.PARAMETERS_INVALID_ERROR)
    expect(callback).not.toHaveBeenCalled()
  })

  it.each([
    ['toString'],
    ['__proto__'],
    ['constructor'],
    ['hasOwnProperty']
  ])('inherited key %s never reaches the wallet as a sign request', async (key) => {
    await send(sign(key, 'raw', '03abcdef'))
    const seen = callback.mock.calls.map((c) => c[0].type)
    expect(seen).not.toContain(BeaconMessageType.SignPayloadRequest)
    // the request is not normalised into any flat type (it stays a wrapped passthrough)
    for (const t of seen) {
      expect(t).toBeUndefined()
    }
  })

  it.each([[undefined], [{}], [42]])('non-string type %p is refused', async (type) => {
    await send(sign(type, 'raw', '03abcdef'))
    expect(errors()).toHaveLength(1)
    expect(callback).not.toHaveBeenCalled()
  })
})
