// __tests__/client/WalletClient.test.ts

import { Client, LocalStorage } from '@tezos-x/octez.connect-core'
import { StorageKey } from '@tezos-x/octez.connect-types'
import { WalletClient } from '../../src/client/WalletClient'
import { WalletP2PTransport } from '../../src/transports/WalletP2PTransport'

const fetchMock = jest.fn()
const originalFetch = global.fetch
beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch
})
afterAll(() => {
  global.fetch = originalFetch
})
beforeEach(() => {
  fetchMock.mockReset()
})

const jsonResponse = <T>(data: T): Response =>
  ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data
  } as unknown as Response)

// Stub out all of beacon-utils, including generateGUID
jest.mock('@tezos-x/octez.connect-utils', () => ({
  ExposedPromise: class {
    public promise = new Promise<boolean>(() => {})
    public resolve = jest.fn()
  },
  toHex: jest.fn().mockReturnValue('abcd'),
  generateGUID: jest.fn().mockReturnValue('guid-123')
}))

// The WalletClient constructor registers TezosBlockchain by default; its real
// module reads the bundled wallet lists via octez.connect-utils, which the
// minimal mock above starves — stub the whole handler for this suite.
jest.mock('@tezos-x/octez.connect-blockchain-tezos', () => ({
  TezosBlockchain: class {
    public readonly identifier = 'tezos'
    public readonly legacyIdentifiers = ['xtz']
    public async validateRequest() {}
    public async validateResponse() {}
    public async handleResponse() {}
    public async getWalletLists() {
      return { extensionList: [], desktopList: [], webList: [], iOSList: [] }
    }
    public async getAccountInfosFromPermissionResponse() {
      return []
    }
  }
}))

// Stub everything from beacon-core *except* Client, so subclassing still works
jest.mock('@tezos-x/octez.connect-core', () => {
  const actual = jest.requireActual('@tezos-x/octez.connect-core')
  return {
    ...actual,
    LocalStorage: jest.fn().mockImplementation(() => ({
      get: jest.fn().mockResolvedValue([]),
      set: jest.fn().mockResolvedValue(undefined)
    })),
    PermissionManager: jest.fn().mockImplementation(() => ({
      getPermissions: jest.fn(),
      getPermission: jest.fn(),
      removePermissions: jest.fn(),
      removePermission: jest.fn(),
      removeAllPermissions: jest.fn()
    })),
    AppMetadataManager: jest.fn().mockImplementation(() => ({
      getAppMetadataList: jest.fn(),
      getAppMetadata: jest.fn(),
      removeAppMetadata: jest.fn(),
      removeAllAppMetadata: jest.fn()
    })),
    getSenderId: jest.fn().mockResolvedValue('sender-id'),
    Logger: jest.fn().mockImplementation(() => ({ log: jest.fn(), warn: jest.fn() }))
  }
})

jest.mock('../../src/transports/WalletP2PTransport')
jest.mock('../../src/interceptors/IncomingRequestInterceptor')
jest.mock('../../src/interceptors/OutgoingResponseInterceptor')

describe('WalletClient', () => {
  const backendUrl = 'https://my.backend'
  const accountKey = 'account-pubkey'
  const oracleUrl = 'https://oracle.test'

  let client: WalletClient
  let storage: jest.Mocked<LocalStorage>
  let initSpy: jest.SpyInstance<Promise<any>, [any?]>

  beforeEach(() => {
    jest.clearAllMocks()

    // Silence the multiple‐instances warning in BeaconClient constructor
    jest.spyOn(console, 'error').mockImplementation(() => {})

    // Spy on super.init() so we don’t actually initialize anything real
    initSpy = jest.spyOn(Client.prototype, 'init').mockResolvedValue('transport-type' as any)

    storage = new LocalStorage() as any
    client = new WalletClient({ name: 'test-client', storage })

    // *** Stub the keyPair getter so `await this.keyPair` in init() resolves immediately ***
    jest
      .spyOn(client as any, 'keyPair', 'get')
      .mockReturnValue(Promise.resolve({ publicKey: 'pub', secretKey: 'sec' } as any))
  })

  describe('init()', () => {
    it('should call super.init with a P2P transport and return its result', async () => {
      const transportType = await client.init()

      expect(transportType).toBe('transport-type')
      expect(initSpy).toHaveBeenCalledWith(expect.any(WalletP2PTransport))
      expect(WalletP2PTransport).toHaveBeenCalledWith(
        'test-client',
        expect.anything(),
        storage,
        (client as any).matrixNodes,
        client.iconUrl,
        client.appUrl
      )
    })
  })

  describe('getRegisterPushChallenge()', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValue(
        jsonResponse({ id: 'challenge-id', timestamp: '2025-04-24T12:00:00Z' })
      )
    })

    it('fetches a challenge and builds payload correctly', async () => {
      const { challenge, payloadToSign } = await client.getRegisterPushChallenge(
        backendUrl,
        accountKey,
        oracleUrl
      )

      expect(fetchMock).toHaveBeenCalledWith(`${oracleUrl}/challenge`)
      expect(challenge).toEqual({ id: 'challenge-id', timestamp: '2025-04-24T12:00:00Z' })
      // toHex is mocked to 'abcd'
      expect(payloadToSign).toBe('050100000004abcd')
    })
  })

  describe('registerPush()', () => {
    const challenge = { id: 'cid', timestamp: 'ts' }
    const signature = 'sig'
    const protocol = 'tezos'
    const deviceId = 'dev-123'

    it('returns existing token if found in storage', async () => {
      const existing = {
        publicKey: accountKey,
        backendUrl,
        accessToken: 'a1',
        managementToken: 'm1'
      }
      storage.get.mockResolvedValue([existing])

      const result = await client.registerPush(
        challenge,
        signature,
        backendUrl,
        accountKey,
        protocol,
        deviceId,
        oracleUrl
      )

      expect(storage.get).toHaveBeenCalledWith(StorageKey.PUSH_TOKENS)
      expect(result).toBe(existing)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('registers new token when none exists', async () => {
      storage.get.mockResolvedValue([])
      fetchMock.mockResolvedValue(
        jsonResponse({
          accessToken: 'newA',
          managementToken: 'newM',
          message: 'ok',
          success: true
        })
      )

      const result = await client.registerPush(
        challenge,
        signature,
        backendUrl,
        accountKey,
        protocol,
        deviceId,
        oracleUrl
      )

      expect(fetchMock).toHaveBeenCalledWith(`${oracleUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-client',
          challenge,
          accountPublicKey: accountKey,
          signature,
          backendUrl,
          protocolIdentifier: protocol,
          deviceId
        })
      })
      expect(storage.set).toHaveBeenCalledWith(StorageKey.PUSH_TOKENS, [
        {
          publicKey: accountKey,
          backendUrl,
          accessToken: 'newA',
          managementToken: 'newM'
        }
      ])
      expect(result).toEqual({
        publicKey: accountKey,
        backendUrl,
        accessToken: 'newA',
        managementToken: 'newM'
      })
    })
  })

  describe('respond()', () => {
    it('throws if no matching pending request', async () => {
      await expect(client.respond({ id: 'nope', type: 0 } as any)).rejects.toThrow(
        'No matching request found!'
      )
    })
  })

  describe('addPeer()', () => {
    it('forwards peer info to transport.addPeer()', async () => {
      const fakePeer = { id: '1', name: 'p', publicKey: 'pk', version: '2' } as any
      const extended = { senderId: 'sender-id', ...fakePeer }
      jest.spyOn(client as any, 'getPeerInfo').mockResolvedValue(extended)

      const transportMock = { addPeer: jest.fn().mockResolvedValue(undefined) }
      jest
        .spyOn(client as any, 'transport', 'get')
        .mockReturnValue(Promise.resolve(transportMock as any))

      await client.addPeer(fakePeer)
      expect(transportMock.addPeer).toHaveBeenCalledWith(extended, true)
    })
  })

  describe('handleResponse() disconnect', () => {
    const pairedPeer = { id: 'p1', senderId: 'paired-sender', version: '3' }
    let removePeerSpy: jest.SpyInstance
    let callback: jest.Mock

    const handle = (message: any) =>
      (client as any).handleResponse(message, { origin: 'p2p', id: 'x' })

    beforeEach(async () => {
      jest.spyOn(client as any, '_connect').mockResolvedValue(undefined)
      jest.spyOn(client as any, 'transport', 'get').mockReturnValue(
        Promise.resolve({ getPeers: jest.fn().mockResolvedValue([pairedPeer]) } as any)
      )
      removePeerSpy = jest.spyOn(client, 'removePeer').mockResolvedValue(undefined)
      callback = jest.fn()
      await client.connect(callback)
    })

    it('removes the paired peer on a flat disconnect labelled version 3 (4.x dApps)', async () => {
      await handle({ id: 'm1', version: '3', senderId: 'paired-sender', type: 'disconnect' })

      expect(removePeerSpy).toHaveBeenCalledTimes(1)
      expect(removePeerSpy).toHaveBeenCalledWith(pairedPeer)
    })

    it('ignores a flat version 3 disconnect from an unknown sender', async () => {
      await handle({ id: 'm1', version: '3', senderId: 'someone-else', type: 'disconnect' })

      expect(removePeerSpy).not.toHaveBeenCalled()
    })

    it('does not throw on a payload-less version 3 message that is not a disconnect', async () => {
      await expect(
        handle({ id: 'm1', version: '3', senderId: 'paired-sender', type: 'permission_request' })
      ).resolves.toBeUndefined()
      await expect(handle({ id: 'm2', version: '3', senderId: 'paired-sender' })).resolves.toBeUndefined()

      expect(removePeerSpy).not.toHaveBeenCalled()
      expect(callback).not.toHaveBeenCalled()
    })

    it('still handles the wrapped version 3 disconnect', async () => {
      await handle({
        id: 'm1',
        version: '3',
        senderId: 'paired-sender',
        message: { type: 'disconnect' }
      })

      expect(removePeerSpy).toHaveBeenCalledTimes(1)
    })

    it('ignores a wrapped version 3 disconnect from an unknown sender', async () => {
      await handle({
        id: 'm1',
        version: '3',
        senderId: 'someone-else',
        message: { type: 'disconnect' }
      })

      expect(removePeerSpy).not.toHaveBeenCalled()
    })

    it('still handles the flat version 2 disconnect', async () => {
      await handle({ id: 'm1', version: '2', senderId: 'paired-sender', type: 'disconnect' })

      expect(removePeerSpy).toHaveBeenCalledTimes(1)
    })
  })
})
