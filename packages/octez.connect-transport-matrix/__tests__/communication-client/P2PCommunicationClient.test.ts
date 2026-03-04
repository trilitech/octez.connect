// __tests__/communication-client/P2PCommunicationClient.test.ts

// Mock external dependencies
jest.mock('axios')
jest.mock('@tezos-x/octez.connect-utils', () => {
  const actual = jest.requireActual('@tezos-x/octez.connect-utils')

  return {
    ...actual,
    generateGUID: jest.fn(),
    getHexHash: jest.fn(),
    recipientString: jest.fn(),
    encryptCryptoboxPayload: jest.fn(),
    decryptCryptoboxPayload: jest.fn(),
    openCryptobox: jest.fn(),
    toHex: jest.fn(),
    getKeypairFromSeed: jest.fn(),
    secretbox_NONCEBYTES: 8,
    secretbox_MACBYTES: 16
  }
})

jest.mock('../../src/matrix-client/MatrixClient', () => ({
  MatrixClient: { create: jest.fn() }
}))

// Imports
import axios from 'axios'
import {
  ExposedPromise,
  generateGUID,
  getHexHash,
  recipientString,
  encryptCryptoboxPayload,
  decryptCryptoboxPayload,
  openCryptobox,
  toHex,
  getKeypairFromSeed
} from '@tezos-x/octez.connect-utils'
import { MatrixClient } from '../../src/matrix-client/MatrixClient'
import { StorageKey } from '@tezos-x/octez.connect-types'
import { P2PCommunicationClient } from '../../src/communication-client/P2PCommunicationClient'

describe('P2PCommunicationClient', () => {
  let client: P2PCommunicationClient
  const mockStorage = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  }
  const fakeKeyPair = { publicKey: 'pub', secretKey: 'sec' }

  beforeEach(() => {
    jest.clearAllMocks()

    // octez.connect-utils mocks
    ;(generateGUID as jest.Mock).mockResolvedValue('generated-guid')
    ;(getHexHash as jest.Mock).mockResolvedValue('hex-hash')
    ;(recipientString as jest.Mock).mockReturnValue('@hex-hash:relay.server')
    ;(encryptCryptoboxPayload as jest.Mock).mockResolvedValue('encrypted-payload')
    ;(decryptCryptoboxPayload as jest.Mock).mockResolvedValue('decrypted-payload')
    ;(openCryptobox as jest.Mock).mockResolvedValue(JSON.stringify({ foo: 'bar' }))
    ;(toHex as jest.Mock).mockReturnValue('deadbeef')
    ;(getKeypairFromSeed as jest.Mock).mockResolvedValue(fakeKeyPair)

    // MatrixClient.create stub
    const fakeMatrixClient = {
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      unsubscribeAll: jest.fn(),
      joinRooms: jest.fn(),
      sendTextMessage: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      getRoomById: jest.fn().mockResolvedValue({ members: ['@peer:relay'] }),
      createTrustedPrivateRoom: jest.fn().mockResolvedValue('!room:id'),
      joinedRooms: Promise.resolve([])
    }
    ;(MatrixClient.create as jest.Mock).mockReturnValue(fakeMatrixClient)

    client = new P2PCommunicationClient('MyApp', fakeKeyPair as any, 2, mockStorage as any)

    // Stub getPublicKey and getRelayServer
    ;(client as any).getPublicKey = jest.fn().mockResolvedValue('pub')
    jest
      .spyOn(client as any, 'getRelayServer')
      .mockResolvedValue({ server: 'relay.server', timestamp: 1234 })
  })

  describe('getPairingRequestInfo', () => {
    it('builds a P2PPairingRequest with id, name, publicKey, version & relayServer', async () => {
      const req = await client.getPairingRequestInfo()
      expect(generateGUID).toHaveBeenCalled()
      expect(req.id).toBe('generated-guid')
      expect(req.name).toBe('MyApp')
      expect(req.publicKey).toBe('pub')
      expect(req.version).toBeDefined()
      expect(req.relayServer).toBe('relay.server')
    })
  })

  describe('getPairingResponseInfo', () => {
    it('builds a P2PPairingResponse using current relayServer, not request’s', async () => {
      const fakeRequest = {
        id: 'req-id',
        name: 'peer-name',
        publicKey: 'peer-pub',
        version: '1.0.0',
        relayServer: 'relay.peer'
      }
      const res = await client.getPairingResponseInfo(fakeRequest as any)
      expect(res.id).toBe('req-id')
      expect(res.name).toBe('MyApp')
      expect(res.publicKey).toBe('pub')
      expect(res.version).toBe('1.0.0')
      // now matches stubbed getRelayServer()
      expect(res.relayServer).toBe('relay.server')
    })
  })

  describe('getBeaconInfo', () => {
    it('fetches /_synapse/client/beacon/info and maps the response', async () => {
      const axiosGetMock = axios.get as jest.Mock
      axiosGetMock.mockResolvedValue({
        data: {
          region: 'eu',
          known_servers: ['a', 'b'],
          timestamp: 9876
        }
      })
      const info = await client.getBeaconInfo('relay.test')
      expect(axios.get).toHaveBeenCalledWith('https://relay.test/_synapse/client/beacon/info', {
        timeout: 10_000
      })
      expect(info).toEqual({
        region: 'eu',
        known_servers: ['a', 'b'],
        timestamp: 9876
      })
    })
  })

  describe('getRelayServer (dead node recovery)', () => {
    let freshClient: P2PCommunicationClient
    type RelayServerRecord = { server: string; timestamp: number; localTimestamp: number }
    type Deferred<T> = {
      promise: Promise<T>
      resolve: (value: T) => void
      reject: (reason?: unknown) => void
    }

    beforeEach(() => {
      freshClient = new P2PCommunicationClient('MyApp', fakeKeyPair as any, 2, mockStorage as any)
    })

    const createDeferred = <T>(): Deferred<T> => {
      let resolve!: (value: T) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })

      return { promise, resolve, reject }
    }

    const setCachedRelay = (relay: RelayServerRecord): void => {
      ;(freshClient as any).relayServer = ExposedPromise.resolve(relay)
    }

    it('returns in-memory relay server when cache is fresh', async () => {
      const now = Date.now()
      setCachedRelay({ server: 'cached-node.papers.tech', timestamp: 1234, localTimestamp: now })

      const beaconInfoSpy = jest.spyOn(freshClient, 'getBeaconInfo')
      const discoverySpy = jest.spyOn(freshClient as any, 'findBestRegionAndGetServer')
      mockStorage.get.mockResolvedValue('should-not-be-read')

      const result = await freshClient.getRelayServer()

      expect(result).toEqual({ server: 'cached-node.papers.tech', timestamp: 1234 })
      expect(beaconInfoSpy).not.toHaveBeenCalled()
      expect(discoverySpy).not.toHaveBeenCalled()
      expect(mockStorage.get).not.toHaveBeenCalled()
    })

    it('refreshes stale in-memory relay server when cached server is reachable', async () => {
      setCachedRelay({ server: 'cached-node.papers.tech', timestamp: 1000, localTimestamp: 0 })

      const beaconInfoSpy = jest
        .spyOn(freshClient, 'getBeaconInfo')
        .mockResolvedValue({ region: 'eu', known_servers: [], timestamp: 2222 })
      const discoverySpy = jest.spyOn(freshClient as any, 'findBestRegionAndGetServer')

      const result = await freshClient.getRelayServer()

      expect(result).toEqual({ server: 'cached-node.papers.tech', timestamp: 2222 })
      expect(beaconInfoSpy).toHaveBeenCalledWith('cached-node.papers.tech')
      expect(discoverySpy).not.toHaveBeenCalled()
      expect(mockStorage.delete).not.toHaveBeenCalled()
    })

    it('falls through to discovery when stale cached server is unreachable', async () => {
      setCachedRelay({ server: 'cached-node.papers.tech', timestamp: 1000, localTimestamp: 0 })
      mockStorage.delete.mockResolvedValue(undefined)
      mockStorage.set.mockResolvedValue(undefined)
      mockStorage.get.mockResolvedValue('')

      const beaconInfoSpy = jest
        .spyOn(freshClient, 'getBeaconInfo')
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      const discoverySpy = jest.spyOn(freshClient as any, 'findBestRegionAndGetServer').mockResolvedValue({
        server: 'discovered-node.papers.tech',
        timestamp: 5000
      })

      const result = await freshClient.getRelayServer()

      expect(result).toEqual({ server: 'discovered-node.papers.tech', timestamp: 5000 })
      expect(beaconInfoSpy).toHaveBeenCalledWith('cached-node.papers.tech')
      expect(discoverySpy).toHaveBeenCalledTimes(1)
      expect(mockStorage.delete).toHaveBeenCalledWith(StorageKey.MATRIX_SELECTED_NODE)
    })

    it('uses stored node when it is reachable', async () => {
      mockStorage.get.mockResolvedValue('healthy-node.papers.tech')
      mockStorage.set.mockResolvedValue(undefined)

      const beaconInfoSpy = jest
        .spyOn(freshClient, 'getBeaconInfo')
        .mockResolvedValue({ region: 'eu', known_servers: [], timestamp: 7777 })
      const discoverySpy = jest.spyOn(freshClient as any, 'findBestRegionAndGetServer')

      const result = await freshClient.getRelayServer()

      expect(result).toEqual({ server: 'healthy-node.papers.tech', timestamp: 7777 })
      expect(beaconInfoSpy).toHaveBeenCalledWith('healthy-node.papers.tech')
      expect(discoverySpy).not.toHaveBeenCalled()
      expect(mockStorage.delete).not.toHaveBeenCalledWith(StorageKey.MATRIX_SELECTED_NODE)
    })

    it('falls through to discovery when stored node is unreachable', async () => {
      mockStorage.get.mockResolvedValue('dead-node.papers.tech')
      mockStorage.delete.mockResolvedValue(undefined)
      mockStorage.set.mockResolvedValue(undefined)

      const beaconInfoSpy = jest
        .spyOn(freshClient, 'getBeaconInfo')
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      const discoverySpy = jest.spyOn(freshClient as any, 'findBestRegionAndGetServer').mockResolvedValue({
        server: 'discovered-node.papers.tech',
        timestamp: 5000
      })

      const result = await freshClient.getRelayServer()

      expect(result).toEqual({ server: 'discovered-node.papers.tech', timestamp: 5000 })
      expect(beaconInfoSpy).toHaveBeenCalledWith('dead-node.papers.tech')
      expect(discoverySpy).toHaveBeenCalledTimes(1)
      expect(mockStorage.delete).toHaveBeenCalledWith(StorageKey.MATRIX_SELECTED_NODE)
    })

    it('clears in-flight relay promise when discovery fails', async () => {
      const storageGet = createDeferred<string>()
      mockStorage.get.mockReturnValue(storageGet.promise)
      mockStorage.delete.mockResolvedValue(undefined)

      jest.spyOn(freshClient as any, 'findBestRegionAndGetServer').mockImplementation(() => {
        throw new Error('offline')
      })

      const relayCall = freshClient.getRelayServer()
      await Promise.resolve()
      const internalRelayPromise = (freshClient as any).relayServer?.promise
      internalRelayPromise?.catch(() => undefined)
      storageGet.resolve('')

      await expect(relayCall).rejects.toThrow('offline')

      expect((freshClient as any).relayServer).toBeUndefined()
    })

    it('reuses a single in-flight discovery for concurrent callers', async () => {
      mockStorage.get.mockResolvedValue('')
      mockStorage.set.mockResolvedValue(undefined)
      const discoverySpy = jest.spyOn(freshClient as any, 'findBestRegionAndGetServer').mockResolvedValue({
        server: 'discovered-node.papers.tech',
        timestamp: 3000
      })

      const [resultA, resultB] = await Promise.all([freshClient.getRelayServer(), freshClient.getRelayServer()])

      expect(resultA).toEqual({ server: 'discovered-node.papers.tech', timestamp: 3000 })
      expect(resultB).toEqual({ server: 'discovered-node.papers.tech', timestamp: 3000 })
      expect(discoverySpy).toHaveBeenCalledTimes(1)
    })

    it('preserves successful cache when concurrent stale refresh has mixed success/failure', async () => {
      setCachedRelay({ server: 'cached-node.papers.tech', timestamp: 1000, localTimestamp: 0 })
      mockStorage.get.mockResolvedValue('')
      mockStorage.set.mockResolvedValue(undefined)
      mockStorage.delete.mockResolvedValue(undefined)

      let callCount = 0
      let resolveSecond!: (value: { region: string; known_servers: string[]; timestamp: number }) => void
      let rejectFirst!: (reason?: unknown) => void

      const firstRefresh = new Promise<{ region: string; known_servers: string[]; timestamp: number }>(
        (_, reject) => {
          rejectFirst = reject
        }
      )
      const secondRefresh = new Promise<{ region: string; known_servers: string[]; timestamp: number }>(
        (resolve) => {
          resolveSecond = resolve
        }
      )

      jest.spyOn(freshClient, 'getBeaconInfo').mockImplementation(async () => {
        callCount += 1
        if (callCount === 1) {
          return firstRefresh
        }
        if (callCount === 2) {
          return secondRefresh
        }
        throw new Error(`Unexpected getBeaconInfo call #${callCount}`)
      })

      const discoverySpy = jest
        .spyOn(freshClient as any, 'findBestRegionAndGetServer')
        .mockResolvedValue({ server: 'unexpected-discovery.papers.tech', timestamp: 9999 })

      const call1 = freshClient.getRelayServer().catch((error) => error)
      const call2 = freshClient.getRelayServer()
      await Promise.resolve()
      const internalRelayPromise = (freshClient as any).relayServer?.promise
      internalRelayPromise?.catch(() => undefined)

      resolveSecond({ region: 'us', known_servers: [], timestamp: 2000 })
      const secondResult = await call2
      expect(secondResult).toEqual({ server: 'cached-node.papers.tech', timestamp: 2000 })

      rejectFirst(new Error('stale refresh failed in one caller'))
      await call1

      const thirdResult = await freshClient.getRelayServer()
      expect(thirdResult).toEqual({ server: 'cached-node.papers.tech', timestamp: 2000 })
      expect(discoverySpy).not.toHaveBeenCalled()
    })
  })

  describe('updatePeerRoom', () => {
    it('throws if sender is invalid', async () => {
      await expect(client.updatePeerRoom('invalid-sender', '!room')).rejects.toThrow(
        'Invalid sender'
      )
    })

    it('pushes the 2nd character of old room into ignoredRooms and updates storage', async () => {
      const sender = '@abcdef:relay.server'
      const oldRoom = '!old:room'
      mockStorage.get.mockResolvedValue({ [sender]: oldRoom })
      mockStorage.set.mockResolvedValue(undefined)

      await client.updatePeerRoom(sender, '!new:room')

      // per implementation, room[1] === 'o' is what gets pushed
      expect((client as any).ignoredRooms).toContain(oldRoom[1])
      expect(mockStorage.set).toHaveBeenCalledWith(StorageKey.MATRIX_PEER_ROOM_IDS, {
        [sender]: '!new:room'
      })
    })
  })
})
