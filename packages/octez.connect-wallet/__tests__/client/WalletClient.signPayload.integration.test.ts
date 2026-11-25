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
      getAppMetadata: jest.fn().mockResolvedValue({ senderId: 'dapp', name: 'dapp' }),
      addAppMetadata: jest.fn().mockResolvedValue(undefined)
    })),
    getSenderId: jest.fn().mockResolvedValue('sender-id'),
    Logger: jest.fn().mockImplementation(() => ({ log: jest.fn(), warn: jest.fn() }))
  }
})
jest.mock('../../src/transports/WalletP2PTransport')
jest.mock('../../src/interceptors/OutgoingResponseInterceptor')

const ctx = { origin: 'p2p', id: 'conn-1' } as any

const VERSIONS = ['3', '4']
const IDENTIFIERS = ['tezos', 'xtz']
const MATRIX = VERSIONS.flatMap((v) => IDENTIFIERS.map((i) => [v, i]))

const wrapped = (
  id: string,
  blockchainData: any,
  version = '3',
  blockchainIdentifier = 'tezos',
  type: BeaconMessageType = BeaconMessageType.BlockchainRequest
) => ({
  id,
  version,
  senderId: 'dapp',
  message: { type, blockchainIdentifier, blockchainData }
})

const appMetadata = { senderId: 'dapp', name: 'dapp' }

describe('WalletClient + IncomingRequestInterceptor — wrapped requests', () => {
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
  const sign = (type: any, signingType: any, payload: any, version = '3', ident = 'tezos') =>
    wrapped('r1', { type, signingType, payload, sourceAddress: 'tz1src' }, version, ident)
  const permission = (blockchainData: any, version = '3', ident = 'tezos') =>
    wrapped('p1', blockchainData, version, ident, BeaconMessageType.PermissionRequest)

  describe.each(MATRIX)('version %s, identifier %s', (version, ident) => {
    it('a string type with a consistent request reaches the wallet as a flat sign request', async () => {
      await send(sign('sign_payload_request', 'micheline', '05abcdef', version, ident))
      expect(errors()).toHaveLength(0)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback.mock.calls[0][0]).toMatchObject({
        type: BeaconMessageType.SignPayloadRequest,
        signingType: 'micheline',
        payload: '05abcdef'
      })
    })

    it('RAW + 03 with a string type is refused and never reaches the wallet', async () => {
      await send(sign('sign_payload_request', 'raw', '03abcdef', version, ident))
      expect(errors()).toHaveLength(1)
      expect(errors()[0].errorType).toBe(BeaconErrorType.PARAMETERS_INVALID_ERROR)
      expect(callback).not.toHaveBeenCalled()
    })

    it('RAW + 03 with an array type is refused and never reaches the wallet', async () => {
      await send(sign(['sign_payload_request'], 'raw', '03abcdef', version, ident))
      expect(errors()).toHaveLength(1)
      expect(errors()[0].errorType).toBe(BeaconErrorType.PARAMETERS_INVALID_ERROR)
      expect(callback).not.toHaveBeenCalled()
    })

    it.each([['toString'], ['__proto__'], ['constructor'], ['hasOwnProperty']])(
      'inherited key %s never reaches the wallet as a sign request',
      async (key) => {
        await send(sign(key, 'raw', '03abcdef', version, ident))
        // intended pass-through: exactly one callback, no error, never a flat sign request
        expect(errors()).toHaveLength(0)
        expect(callback).toHaveBeenCalledTimes(1)
        const seen = callback.mock.calls.map((c) => c[0].type)
        expect(seen).not.toContain(BeaconMessageType.SignPayloadRequest)
        // not normalised into any flat type: it stays a wrapped passthrough
        expect(seen[0]).toBeUndefined()
      }
    )

    it.each([[undefined], [{}], [42]])('non-string type %p is refused', async (type) => {
      await send(sign(type, 'raw', '03abcdef', version, ident))
      expect(errors()).toHaveLength(1)
      expect(errors()[0].errorType).toBe(BeaconErrorType.PARAMETERS_INVALID_ERROR)
      expect(callback).not.toHaveBeenCalled()
    })

    it('a missing blockchainData is refused', async () => {
      await send(wrapped('r1', undefined, version, ident))
      expect(errors()).toHaveLength(1)
      expect(errors()[0].errorType).toBe(BeaconErrorType.PARAMETERS_INVALID_ERROR)
      expect(callback).not.toHaveBeenCalled()
    })

    it('a permission request whose blockchainData carries a sign type stays a permission request', async () => {
      await send(
        permission(
          {
            type: 'sign_payload_request',
            signingType: 'raw',
            payload: '03abcdef',
            appMetadata,
            network: { type: 'mainnet' },
            scopes: ['sign']
          },
          version,
          ident
        )
      )
      expect(errors()).toHaveLength(0)
      expect(callback).toHaveBeenCalledTimes(1)
      const received = callback.mock.calls[0][0]
      expect(received.type).toBe(BeaconMessageType.PermissionRequest)
      expect(callback.mock.calls.map((c) => c[0].type)).not.toContain(
        BeaconMessageType.SignPayloadRequest
      )
    })

    it('blockchainData cannot replace the envelope id, version or senderId (permission)', async () => {
      await send(
        permission(
          { id: 'forged', version: '99', senderId: 'forged', appMetadata, scopes: ['sign'] },
          version,
          ident
        )
      )
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback.mock.calls[0][0]).toMatchObject({
        type: BeaconMessageType.PermissionRequest,
        id: 'p1',
        version,
        senderId: 'dapp'
      })
    })

    it('blockchainData cannot replace the envelope id, version, senderId or appMetadata (sign)', async () => {
      await send(
        wrapped(
          'r1',
          {
            type: 'sign_payload_request',
            signingType: 'micheline',
            payload: '05abcdef',
            sourceAddress: 'tz1src',
            id: 'forged',
            version: '99',
            senderId: 'forged',
            appMetadata: { senderId: 'forged', name: 'forged' }
          },
          version,
          ident
        )
      )
      expect(errors()).toHaveLength(0)
      expect(callback).toHaveBeenCalledTimes(1)
      const received = callback.mock.calls[0][0]
      expect(received).toMatchObject({
        type: BeaconMessageType.SignPayloadRequest,
        id: 'r1',
        version,
        senderId: 'dapp',
        appMetadata,
        signingType: 'micheline',
        payload: '05abcdef',
        sourceAddress: 'tz1src'
      })
    })

    it('a normal permission request keeps its fields', async () => {
      const network = { type: 'mainnet' }
      await send(permission({ appMetadata, network, scopes: ['operation_request', 'sign'] }, version, ident))
      expect(errors()).toHaveLength(0)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback.mock.calls[0][0]).toMatchObject({
        type: BeaconMessageType.PermissionRequest,
        id: 'p1',
        version,
        senderId: 'dapp',
        network,
        scopes: ['operation_request', 'sign']
      })
      expect(callback.mock.calls[0][0].appMetadata).toMatchObject({ name: 'dapp', senderId: 'dapp' })
    })

    it('normal operation and broadcast requests keep their fields', async () => {
      await send(
        wrapped(
          'o1',
          { type: 'operation_request', network: { type: 'mainnet' }, operationDetails: [{ kind: 'transaction' }], sourceAddress: 'tz1src' },
          version,
          ident
        )
      )
      await send(
        wrapped('b1', { type: 'broadcast_request', network: { type: 'mainnet' }, signedTransaction: 'abcd' }, version, ident)
      )
      expect(errors()).toHaveLength(0)
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback.mock.calls[0][0]).toMatchObject({
        type: BeaconMessageType.OperationRequest,
        id: 'o1',
        operationDetails: [{ kind: 'transaction' }],
        sourceAddress: 'tz1src'
      })
      expect(callback.mock.calls[1][0]).toMatchObject({
        type: BeaconMessageType.BroadcastRequest,
        id: 'b1',
        signedTransaction: 'abcd'
      })
    })
  })
})
