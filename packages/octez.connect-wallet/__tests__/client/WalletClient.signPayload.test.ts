import { Client, LocalStorage } from '@tezos-x/octez.connect-core'
import { BeaconErrorType, BeaconMessageType } from '@tezos-x/octez.connect-types'
import { WalletClient } from '../../src/client/WalletClient'
import { IncomingRequestInterceptor } from '../../src/interceptors/IncomingRequestInterceptor'
import { OutgoingResponseInterceptor } from '../../src/interceptors/OutgoingResponseInterceptor'

jest.mock('@tezos-x/octez.connect-core', () => {
  const actual = jest.requireActual('@tezos-x/octez.connect-core')
  return {
    ...actual,
    LocalStorage: jest.fn().mockImplementation(() => ({
      get: jest.fn().mockResolvedValue([]),
      set: jest.fn().mockResolvedValue(undefined)
    })),
    PermissionManager: jest.fn().mockImplementation(() => ({})),
    AppMetadataManager: jest.fn().mockImplementation(() => ({})),
    getSenderId: jest.fn().mockResolvedValue('sender-id'),
    Logger: jest.fn().mockImplementation(() => ({ log: jest.fn(), warn: jest.fn() }))
  }
})
jest.mock('../../src/transports/WalletP2PTransport')
jest.mock('../../src/interceptors/IncomingRequestInterceptor')
jest.mock('../../src/interceptors/OutgoingResponseInterceptor')

const ctx = { origin: 'p2p', id: 'conn-1' } as any

const wrapped = (id: string, blockchainData: any) => ({
  id,
  version: '3',
  senderId: 'dapp',
  message: { type: BeaconMessageType.BlockchainRequest, blockchainIdentifier: 'tezos', blockchainData }
})
const flat = (id: string, extra: any) => ({
  id,
  version: '2',
  senderId: 'dapp',
  type: BeaconMessageType.SignPayloadRequest,
  sourceAddress: 'tz1src',
  ...extra
})

describe('WalletClient — sign_payload consistency check', () => {
  let client: WalletClient
  let callback: jest.Mock

  const outgoing = () =>
    (OutgoingResponseInterceptor.intercept as jest.Mock).mock.calls.map((c) => c[0].message)

  beforeEach(async () => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(Client.prototype, 'init').mockResolvedValue('x' as any)
    client = new WalletClient({ name: 'w', storage: new LocalStorage() as any })
    jest.spyOn(client as any, '_connect').mockResolvedValue(undefined)
    callback = jest.fn()
    await client.connect(callback)
  })

  const send = (msg: any) => (client as any).handleResponse(msg, ctx)

  describe.each([
    ['wrapped v3', (t: any, p: any) => wrapped('r1', { type: 'sign_payload_request', signingType: t, payload: p, sourceAddress: 'tz1src' })],
    ['flat v2', (t: any, p: any) => flat('r1', { signingType: t, payload: p })]
  ])('%s', (_name, build) => {
    it('RAW + 03 is answered with one PARAMETERS_INVALID_ERROR and never reaches the wallet', async () => {
      await send(build('raw', '03abcdef'))

      const errors = outgoing().filter((m: any) => m.type === BeaconMessageType.Error)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatchObject({
        id: 'r1',
        errorType: BeaconErrorType.PARAMETERS_INVALID_ERROR
      })
      expect(IncomingRequestInterceptor.intercept).not.toHaveBeenCalled()
      expect(callback).not.toHaveBeenCalled()
      expect((client as any).pendingRequests).toHaveLength(0)
    })

    it('the acknowledge goes out first, then the error', async () => {
      await send(build('raw', '03abcdef'))
      expect(outgoing().map((m: any) => m.type)).toEqual([
        BeaconMessageType.Acknowledge,
        BeaconMessageType.Error
      ])
    })

    it('OPERATION + 03 is unchanged: reaches the interceptor, no error', async () => {
      await send(build('operation', '03abcdef'))
      expect(IncomingRequestInterceptor.intercept).toHaveBeenCalledTimes(1)
      expect(outgoing().some((m: any) => m.type === BeaconMessageType.Error)).toBe(false)
    })

    it('RAW + 01 is accepted (warned only)', async () => {
      await send(build('raw', '01abcdef'))
      expect(IncomingRequestInterceptor.intercept).toHaveBeenCalledTimes(1)
    })

    it('unknown signing type -> SIGNATURE_TYPE_NOT_SUPPORTED', async () => {
      await send(build('sha256', 'abcd'))
      const errors = outgoing().filter((m: any) => m.type === BeaconMessageType.Error)
      expect(errors).toHaveLength(1)
      expect(errors[0].errorType).toBe(BeaconErrorType.SIGNATURE_TYPE_NOT_SUPPORTED)
      expect(IncomingRequestInterceptor.intercept).not.toHaveBeenCalled()
    })

    it('missing signing type -> SIGNATURE_TYPE_NOT_SUPPORTED', async () => {
      await send(build(undefined, 'abcd'))
      const errors = outgoing().filter((m: any) => m.type === BeaconMessageType.Error)
      expect(errors[0].errorType).toBe(BeaconErrorType.SIGNATURE_TYPE_NOT_SUPPORTED)
    })
  })

  it('non-sign requests are not inspected', async () => {
    await send(
      wrapped('r2', { type: 'operation_request', network: 'x', operationDetails: [{}], sourceAddress: 'tz1' })
    )
    expect(IncomingRequestInterceptor.intercept).toHaveBeenCalledTimes(1)
  })
})
