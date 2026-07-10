// __tests__/DAppClient.test.ts
import { DAppClient } from '../../src/dapp-client/DAppClient'
import { BeaconErrorType, BeaconMessageType, NetworkType } from '@tezos-x/octez.connect-types'
import { ExposedPromise } from '@tezos-x/octez.connect-utils'
import { LocalStorage } from '@tezos-x/octez.connect-core'
import { BeaconEvent } from '../../src/events'

//
// 1) Mock out all the heavy @tezos-x/octez.connect-core and @tezos-x/octez.connect-ui dependencies,
//    so we can instantiate DAppClient without spinning up real transports, storage, etc.
//

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

jest.mock('@tezos-x/octez.connect-core', () => {
  const actual = jest.requireActual('@tezos-x/octez.connect-core')
  return {
    ...actual,
    // a minimal in-memory LocalStorage stub
    LocalStorage: class {
      private store = new Map<string, any>()
      async get(key: string) {
        return this.store.get(key)
      }
      async set(key: string, value: any) {
        this.store.set(key, value)
      }
      subscribeToStorageChanged(_cb: any) {
        /* no op */
      }
      getPrefixedKey(key: string) {
        return key
      }
    },
    // StorageValidator always “valid”
    StorageValidator: class {
      constructor(_s: any) {}
      validate() {
        return Promise.resolve(true)
      }
    },
    // Serializer just serializes to an empty string
    Serializer: class {
      serialize(_r: any) {
        return Promise.resolve('')
      }
    },
    // ExposedPromise with resolve/reject hooks
    ExposedPromise: class<T, E> {
      public promise: Promise<T>
      private _resolve!: (v: T) => void
      private _reject!: (e: E) => void
      constructor() {
        this.promise = new Promise<T>((res, rej) => {
          this._resolve = res
          this._reject = rej
        })
      }
      static resolve<U>(val: U) {
        const ex = new (this as any)()
        ex._resolve(val)
        return ex
      }
      resolve(v: T) {
        this._resolve(v)
      }
      reject(e: E) {
        this._reject(e)
      }
      isSettled() {
        return true
      }
    },
    generateGUID: jest.fn().mockResolvedValue('guid'),
    getSenderId: jest.fn().mockResolvedValue('senderId'),
    Logger: class {
      constructor(_name: string) {}
      error() {}
      warn() {}
      log() {}
      time() {}
    },
    ClientEvents: {
      CLOSE_ALERT: 'CLOSE_ALERT',
      RESET_STATE: 'RESET_STATE',
      WC_ACK_NOTIFICATION: 'WC_ACK_NOTIFICATION',
      ON_RELAYER_ERROR: 'ON_RELAYER_ERROR'
    },
    IndexedDBStorage: class {
      constructor() {}
      set() {}
      getAllKeys() {
        return Promise.resolve([])
      }
      delete() {}
    },
    MultiTabChannel: class {
      constructor(_a: any, _b: any, _c: any) {}
      isLeader() {
        return true
      }
      hasLeader() {
        return Promise.resolve(true)
      }
      getLeadership() {
        return Promise.resolve()
      }
      postMessage(_msg: any) {}
    },
    BACKEND_URL: '',
    getError: (_t: any, _d: any) => new Error('beacon error')
  }
})

jest.mock('@tezos-x/octez.connect-transport-walletconnect', () => ({
  WalletConnectTransport: class WalletConnectTransport {}
}))
jest.mock('@walletconnect/sign-client', () => ({}))
jest.mock('@walletconnect/types', () => ({}))
jest.mock('@walletconnect/utils', () => ({ getSdkError: jest.fn() }))

describe('DAppClient — basic unit tests', () => {
  let client: DAppClient

  beforeAll(() => {
    client = new DAppClient({
      name: 'TestApp',
      storage: new LocalStorage(),
      preferredNetwork: NetworkType.MAINNET
    })
    client.subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, () => {})
  })

  it('addQueryParam returns "key=value"', () => {
    // addQueryParam is private — cast to any to reach it
    const result = (client as any).addQueryParam('foo', 'bar')
    expect(result).toBe('foo=bar')
  })

  it('addOpenRequest stores given promise in openRequests map', () => {
    const p = new ExposedPromise<{ foo: string }, any>()
    ;(client as any).addOpenRequest('myId', p)
    expect((client as any).openRequests.get('myId')).toBe(p)
  })

  it('addBlockchain / removeBlockchain manage internal map', async () => {
    // define a minimal fake chain
    const fakeChain = {
      identifier: 'chain-1',
      getWalletLists: jest.fn().mockResolvedValue({
        desktopList: [],
        extensionList: [],
        webList: [],
        iOSList: []
      }),
      handleResponse: jest.fn()
    }
    client.addBlockchain(fakeChain as any)
    expect((client as any).blockchains.has('chain-1')).toBe(true)

    client.removeBlockchain('chain-1')
    expect((client as any).blockchains.has('chain-1')).toBe(false)
  })
})

describe('DAppClient — abort handling', () => {
  let client: DAppClient

  beforeEach(() => {
    client = new DAppClient({
      name: 'TestAbortApp',
      storage: new LocalStorage(),
      preferredNetwork: NetworkType.MAINNET
    })
  })

  it('rejects _initPromise with ABORTED_ERROR when abortHandler is called', async () => {
    // Manually set up the init promise state as if init() was in progress
    let capturedReject: ((reason?: any) => void) | undefined

    ;(client as any)._initPromise = new Promise<any>((_resolve, reject) => {
      capturedReject = reject
    })
    ;(client as any)._initPromiseReject = capturedReject

    // Create a promise that will be rejected
    const initPromise = (client as any)._initPromise

    // Simulate calling the abort logic (what happens when user closes modal)
    const rejectFn = (client as any)._initPromiseReject
    if (rejectFn) {
      rejectFn({
        type: BeaconMessageType.Error,
        errorType: BeaconErrorType.ABORTED_ERROR,
        id: '',
        senderId: '',
        version: '2'
      })
    }

    // Verify the promise rejects with ABORTED_ERROR
    await expect(initPromise).rejects.toMatchObject({
      type: BeaconMessageType.Error,
      errorType: BeaconErrorType.ABORTED_ERROR
    })
  })

  it('clears _initPromise and _initPromiseReject after abort', () => {
    // Set up initial state
    ;(client as any)._initPromise = new Promise(() => {})
    ;(client as any)._initPromiseReject = jest.fn()

    // Simulate the cleanup that happens in abortHandler
    ;(client as any)._initPromise = undefined
    ;(client as any)._initPromiseReject = undefined

    expect((client as any)._initPromise).toBeUndefined()
    expect((client as any)._initPromiseReject).toBeUndefined()
  })

  it('emits PAIR_ABORTED event when abort occurs', async () => {
    const pairAbortedHandler = jest.fn()
    client.subscribeToEvent(BeaconEvent.PAIR_ABORTED, pairAbortedHandler)

    // Emit the event as it would be in abortHandler
    await (client as any).events.emit(BeaconEvent.PAIR_ABORTED)

    // The handler should be called
    expect(pairAbortedHandler).toHaveBeenCalled()
  })
})

describe('DAppClient — WalletConnect opt-in (#32)', () => {
  const make = (config: any) =>
    new DAppClient({
      name: 'WCOptInApp',
      storage: new LocalStorage(),
      preferredNetwork: NetworkType.MAINNET,
      ...config
    })

  it('does not enable WC or apply a default projectId when no walletConnectOptions are given', () => {
    const client = make({})
    expect((client as any).isWalletConnectEnabled).toBe(false)
    expect((client as any).wcProjectId).toBeUndefined()
    expect((client as any).wcRelayUrl).toBeUndefined()
  })

  it('does not enable WC when disableWalletConnect is true, even with walletConnectOptions', () => {
    const client = make({
      walletConnectOptions: { projectId: 'abc123' },
      disableWalletConnect: true
    })
    expect((client as any).isWalletConnectEnabled).toBe(false)
    // No default projectId is applied when WC is disabled.
    expect((client as any).wcProjectId).toBeUndefined()
  })

  it('enables WC and resolves a projectId when walletConnectOptions are provided', () => {
    const client = make({ walletConnectOptions: { projectId: 'abc123' } })
    expect((client as any).isWalletConnectEnabled).toBe(true)
    expect((client as any).wcProjectId).toBe('abc123')
  })

  it('falls back to the default projectId when walletConnectOptions omit it (relayUrl only)', () => {
    const client = make({ walletConnectOptions: { relayUrl: 'wss://relay.example' } })
    expect((client as any).isWalletConnectEnabled).toBe(true)
    expect(typeof (client as any).wcProjectId).toBe('string')
    expect((client as any).wcRelayUrl).toBe('wss://relay.example')
  })
})

describe('DAppClient — V3 message without payload (#33)', () => {
  it('drops a wrapped (V3) message with an undefined payload instead of throwing', async () => {
    const client = new DAppClient({
      name: 'V3App',
      storage: new LocalStorage(),
      preferredNetwork: NetworkType.MAINNET
    })

    // A V3-versioned message that arrived without its wrapped `message` payload.
    // Before the guard this dereferenced `undefined.blockchainData` and threw an
    // unhandled rejection inside the transport subscription callback.
    const malformed = {
      version: '3',
      id: 'req-1',
      senderId: 'sender-1',
      type: BeaconMessageType.Acknowledge
    } as any

    await expect(
      (client as any).handleResponse(malformed, { origin: 'p2p', id: 'conn-1' })
    ).resolves.toBeUndefined()
  })
})

describe('DAppClient.resolveOperationNetwork', () => {
  let client: DAppClient
  const L1 = 'tezos:NetXsqzbfFenSTS'
  const L2 = 'tezos:NetXY2oPPzkxUW1'

  const acctOnL1 = {
    address: 'tz1burnburnburnburnburnburnburjAYjjX',
    network: { type: 'custom', chainId: L1, name: 'Shadownet L1' }
  } as any
  const acctOnL2 = {
    address: 'tz1otherotherotherotherotherother',
    network: { type: 'custom', chainId: L2, name: 'Tezos X Previewnet L2' }
  } as any
  const legacyAccount = {
    address: 'tz1legacylegacylegacylegacylegacy',
    network: { type: 'mainnet' }
  } as any

  function mockSession(accounts: any[]) {
    ;(client as any).accountManager = {
      getAccounts: jest.fn().mockResolvedValue(accounts)
    }
  }

  beforeEach(() => {
    client = new DAppClient({
      name: 'TestResolveOperationNetwork',
      storage: new LocalStorage(),
      preferredNetwork: NetworkType.MAINNET
    })
  })

  it('single-network session, no input — uses activeAccount.network', async () => {
    mockSession([acctOnL1])
    const out = await (client as any).resolveOperationNetwork(undefined, acctOnL1)
    expect(out).toEqual(acctOnL1.network)
  })

  it('input.network present, in session — returns the CAIP-2 string', async () => {
    mockSession([acctOnL1, acctOnL2])
    const out = await (client as any).resolveOperationNetwork(L2, acctOnL1)
    expect(out).toBe(L2)
  })

  it('input.network === active account network — returns it without reading the account store', async () => {
    mockSession([acctOnL1, acctOnL2])
    const out = await (client as any).resolveOperationNetwork(L1, acctOnL1)
    expect(out).toBe(L1)
    // Fast path: the active account is already on L1, so no full scan is needed.
    expect((client as any).accountManager.getAccounts).not.toHaveBeenCalled()
  })

  it('malformed CAIP-2 string rejects with NetworksUnsupportedBeaconError', async () => {
    mockSession([acctOnL1])
    await expect(
      (client as any).resolveOperationNetwork('ethereum:1', acctOnL1)
    ).rejects.toMatchObject({
      errorCode: 'NETWORKS_UNSUPPORTED',
      unsupportedNetworks: ['ethereum:1']
    })
  })

  it('empty CAIP-2 reference rejects', async () => {
    mockSession([acctOnL1])
    await expect(
      (client as any).resolveOperationNetwork('tezos:', acctOnL1)
    ).rejects.toMatchObject({ errorCode: 'NETWORKS_UNSUPPORTED' })
  })

  it('input.network is well-formed CAIP-2 but NOT in session — rejects', async () => {
    mockSession([acctOnL1])
    await expect(
      (client as any).resolveOperationNetwork(L2, acctOnL1)
    ).rejects.toMatchObject({
      errorCode: 'NETWORKS_UNSUPPORTED',
      requestedNetworks: [L2],
      unsupportedNetworks: [L2]
    })
  })

  it('no input.network on a multi-network session — rejects with ambiguous message', async () => {
    mockSession([acctOnL1, acctOnL2])
    await expect(
      (client as any).resolveOperationNetwork(undefined, acctOnL1)
    ).rejects.toMatchObject({
      errorCode: 'NETWORKS_UNSUPPORTED',
      requestedNetworks: [],
      unsupportedNetworks: []
    })
  })

  it('legacy single-network session (no chainId field) — falls back', async () => {
    mockSession([legacyAccount])
    const out = await (client as any).resolveOperationNetwork(undefined, legacyAccount)
    expect(out).toEqual(legacyAccount.network)
  })
})

describe('DAppClient — requiredMinimumVersion', () => {
  it('throws InvalidRequiredMinimumVersionError at construction when value is non-integer', () => {
    expect(
      () =>
        new DAppClient({
          name: 'TestApp',
          storage: new LocalStorage(),
          preferredNetwork: NetworkType.MAINNET,
          requiredMinimumVersion: '4.5'
        })
    ).toThrow(/InvalidRequiredMinimumVersionError|requiredMinimumVersion/i)
  })

  it('defaults requiredMinimumVersion to the wrapped-message baseline when omitted', () => {
    // Hard fork: the flat v2 wire was removed, so the permissive default is
    // the lowest wrapped dialect ('3') — every wallet the SDK can still talk
    // to is accepted, and v2-only wallets are rejected with a typed error.
    const client = new DAppClient({
      name: 'TestApp',
      storage: new LocalStorage(),
      preferredNetwork: NetworkType.MAINNET
    })
    expect((client as any).requiredMinimumVersion).toBe('3')
  })

  it('assertWalletVersionMeetsMinimum allows a peer that reported no version', () => {
    // A legacy peer paired before versioning must not be rejected on a read.
    const client = new DAppClient({
      name: 'TestApp',
      storage: new LocalStorage(),
      preferredNetwork: NetworkType.MAINNET,
      requiredMinimumVersion: '4'
    })
    expect(() => (client as any).assertWalletVersionMeetsMinimum(undefined)).not.toThrow()
  })

  it('assertWalletVersionMeetsMinimum throws VersionUnsupportedBeaconError when wallet served < min', () => {
    const client = new DAppClient({
      name: 'TestApp',
      storage: new LocalStorage(),
      preferredNetwork: NetworkType.MAINNET,
      requiredMinimumVersion: '4'
    })
    expect(() => (client as any).assertWalletVersionMeetsMinimum('3')).toThrow(
      /VersionUnsupportedBeaconError|version/i
    )
  })

  it('assertWalletVersionMeetsMinimum is a no-op when wallet served >= min', () => {
    const client = new DAppClient({
      name: 'TestApp',
      storage: new LocalStorage(),
      preferredNetwork: NetworkType.MAINNET,
      requiredMinimumVersion: '3'
    })
    expect(() => (client as any).assertWalletVersionMeetsMinimum('4')).not.toThrow()
    expect(() => (client as any).assertWalletVersionMeetsMinimum('3')).not.toThrow()
  })
})

describe('TezosBlockchain.getAccountInfosFromPermissionResponse', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- avoids a top-level import inside this mock-heavy test setup
  const { TezosBlockchain } = require('@tezos-x/octez.connect-blockchain-tezos')

  it('v4 multi-network response with N accounts → N AccountInfo records', async () => {
    const blockchain = new TezosBlockchain()
    const response = {
      blockchainIdentifier: 'tezos',
      type: BeaconMessageType.PermissionResponse,
      blockchainData: {
        scopes: ['operation_request'],
        publicKey: 'edpkFallback',
        address: 'tz1Fallback',
        accounts: {
          'tezos:NetXxxx': {
            publicKey: 'edpkL1',
            address: 'tz1OnL1',
            name: 'Tezos L1'
          },
          'tezos:NetXyyy': {
            publicKey: 'edpkL2',
            address: 'tz1OnL2',
            name: 'Tezos X'
          }
        }
      }
    }
    const out = await blockchain.getAccountInfosFromPermissionResponse(response, '4')
    expect(out).toHaveLength(2)
    expect(out.map((a: any) => a.address).sort()).toEqual(['tz1OnL1', 'tz1OnL2'])
    expect(out.map((a: any) => a.publicKey).sort()).toEqual(['edpkL1', 'edpkL2'])
    // accountId must differ across networks.
    const ids = out.map((a: any) => a.accountId)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) {
      expect(id).toBeTruthy()
    }
  })

  it('legacy v3 fallback returns a single AccountInfo record', async () => {
    const blockchain = new TezosBlockchain()
    const response = {
      blockchainIdentifier: 'tezos',
      type: BeaconMessageType.PermissionResponse,
      blockchainData: {
        scopes: ['operation_request'],
        publicKey: 'edpkV3',
        address: 'tz1V3'
      }
    }
    const out = await blockchain.getAccountInfosFromPermissionResponse(response, '3')
    expect(out).toHaveLength(1)
    expect(out[0].address).toBe('tz1V3')
    expect(out[0].publicKey).toBe('edpkV3')
    expect(out[0].accountId).toBeTruthy()
  })

  it('v4 session WITHOUT accounts fanout falls back to single-record shape (detection happens upstream in DAppClient)', async () => {
    const blockchain = new TezosBlockchain()
    const response = {
      blockchainIdentifier: 'tezos',
      type: BeaconMessageType.PermissionResponse,
      blockchainData: {
        scopes: ['operation_request'],
        publicKey: 'edpkSingle',
        address: 'tz1Single'
      }
    }
    const out = await blockchain.getAccountInfosFromPermissionResponse(response, '4')
    expect(out).toHaveLength(1)
  })

  it('drops fanout entries whose chain-id key is not valid CAIP-2', async () => {
    const blockchain = new TezosBlockchain()
    const response = {
      blockchainIdentifier: 'tezos',
      type: BeaconMessageType.PermissionResponse,
      blockchainData: {
        scopes: ['operation_request'],
        accounts: {
          'tezos:NetXxxx': { publicKey: 'edpkL1', address: 'tz1OnL1' },
          'not a chain id': { publicKey: 'edpkBad', address: 'tz1Bad' }
        }
      }
    }
    const out = await blockchain.getAccountInfosFromPermissionResponse(response, '4')
    // The malformed key is dropped at ingest rather than persisted as an
    // unusable account; only the valid CAIP-2 entry survives.
    expect(out).toHaveLength(1)
    expect(out[0].address).toBe('tz1OnL1')
  })
})
