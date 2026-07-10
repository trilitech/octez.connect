// __tests__/communication-client/WalletConnectCommunicationClient.wrapped.test.ts
//
// Stage 5 hard-fork coverage: wrapped-message synthesis and session-namespace
// multi-network behavior of the WalletConnect communication client.

import { SessionTypes, SignClientTypes } from '@walletconnect/types'
import {
  BeaconMessageType,
  NetworkType,
  PermissionScope,
  SigningType
} from '@tezos-x/octez.connect-types'
import { WalletConnectCommunicationClient } from '../../src/communication-client/WalletConnectCommunicationClient'

jest.mock('@tezos-x/octez.connect-core', () => {
  const actual = jest.requireActual('@tezos-x/octez.connect-core')
  return {
    ...actual,
    Logger: jest.fn().mockImplementation(() => ({
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      time: jest.fn()
    })),
    WCStorage: jest.fn().mockImplementation(() => ({
      onMessageHandler: undefined,
      onErrorHandler: undefined,
      backup: jest.fn(),
      resetState: jest.fn(),
      notify: jest.fn()
    })),
    Serializer: jest.fn().mockImplementation(() => ({
      serialize: jest.fn((x) => Promise.resolve(JSON.stringify(x))),
      deserialize: jest.fn((x) => Promise.resolve(JSON.parse(x)))
    }))
  }
})

jest.mock('@walletconnect/sign-client', () => ({
  init: jest.fn()
}))

jest.mock('@walletconnect/utils', () => ({
  getSdkError: jest.fn((code: string) => ({ code }))
}))

jest.mock('@tezos-x/octez.connect-utils', () => ({
  generateGUID: jest.fn().mockResolvedValue('guid'),
  getAddressFromPublicKey: jest.fn((publicKey: string) =>
    Promise.resolve(`addr_of_${publicKey}`)
  ),
  isPublicKeySC: jest.fn(
    (value: string) => typeof value === 'string' && value.startsWith('edpk')
  )
}))

const MAINNET_CAIP2 = 'tezos:NetXdQprcVkpaWU'
const GHOSTNET_CAIP2 = 'tezos:NetXnHfVqm9iesp'

const wcOptions = { network: NetworkType.MAINNET, opts: {} as SignClientTypes.Options }
const isLeader = jest.fn().mockResolvedValue(true)

function makeSession(
  accounts: string[],
  sessionProperties: Record<string, string> = {}
): SessionTypes.Struct {
  return {
    topic: 'topic1',
    pairingTopic: 'pairing1',
    namespaces: {
      tezos: {
        accounts,
        methods: ['tezos_getAccounts', 'tezos_send', 'tezos_sign'],
        events: []
      }
    },
    peer: {
      publicKey: 'peer-public-key',
      metadata: { name: 'Test Wallet', icons: ['icon.png'], description: '', url: '' }
    },
    sessionProperties
  } as unknown as SessionTypes.Struct
}

async function captureNotifications(
  client: WalletConnectCommunicationClient
): Promise<{ parsed: () => any[] }> {
  const received: string[] = []
  await client.listenForEncryptedMessage('listener-key', (message) => {
    received.push(message)
  })
  return { parsed: () => received.map((message) => JSON.parse(message)) }
}

describe('wrapped permission response synthesis', () => {
  let client: WalletConnectCommunicationClient

  beforeEach(() => {
    jest.clearAllMocks()
    client = new WalletConnectCommunicationClient(wcOptions, isLeader)
  })

  it('emits a well-formed wrapper with a fanout keyed by genesis CAIP-2 ids', async () => {
    const session = makeSession([
      'tezos:mainnet:edpkSegmentKey',
      'tezos:ghostnet:tz1ghostAddress'
    ])
    ;(client as any).session = session
    ;(client as any).messageIds = ['wrapper-id-1']

    const fetchAccounts = jest
      .spyOn(client as any, 'fetchAccounts')
      .mockResolvedValue([
        { algo: 'ed25519', address: 'tz1ghostAddress', pubkey: 'edpkFetchedKey' }
      ])

    const { parsed } = await captureNotifications(client)

    await (client as any).notifyListenersWithPermissionResponse(session, [
      PermissionScope.SIGN
    ])

    const [wrapper] = parsed()

    // Envelope: {id, version: '4', senderId: topic}; id is the WRAPPER id.
    expect(wrapper.id).toBe('wrapper-id-1')
    expect(wrapper.version).toBe('4')
    expect(wrapper.senderId).toBe('topic1')

    const inner = wrapper.message
    expect(inner.blockchainIdentifier).toBe('tezos')
    expect(inner.type).toBe(BeaconMessageType.PermissionResponse)
    expect(inner.id).toBeUndefined()

    const data = inner.blockchainData
    // Fanout keyed by genesis CAIP-2 ids, not WC network names.
    expect(Object.keys(data.accounts).sort()).toEqual([MAINNET_CAIP2, GHOSTNET_CAIP2].sort())
    expect(data.accounts[MAINNET_CAIP2]).toEqual({
      address: 'addr_of_edpkSegmentKey',
      publicKey: 'edpkSegmentKey'
    })
    expect(data.accounts[GHOSTNET_CAIP2]).toEqual({
      address: 'tz1ghostAddress',
      publicKey: 'edpkFetchedKey'
    })

    // The account segment that already is a pubkey resolves without an RPC;
    // only the ghostnet chain needed tezos_getAccounts.
    expect(fetchAccounts).toHaveBeenCalledTimes(1)
    expect(fetchAccounts).toHaveBeenCalledWith('topic1', 'tezos:ghostnet')

    // Top-level fields echo the preferred (mainnet) chain's entry.
    expect(data.publicKey).toBe('edpkSegmentKey')
    expect(data.address).toBe('addr_of_edpkSegmentKey')
    expect(data.network.chainId).toBe(MAINNET_CAIP2)

    // Scopes echoed from the request instead of the hardcoded default.
    expect(data.scopes).toEqual([PermissionScope.SIGN])
    expect(data.walletType).toBe('implicit')
    expect(data.appMetadata).toEqual({
      senderId: 'topic1',
      name: 'Test Wallet',
      icon: 'icon.png'
    })
  })

  it('uses the sessionProperties pubkey fast path when it matches the account', async () => {
    const session = makeSession(['tezos:mainnet:tz1sessionAddress'], {
      pubkey: 'edpkSessionKey',
      algo: 'ed25519',
      address: 'tz1sessionAddress'
    })
    ;(client as any).session = session
    ;(client as any).messageIds = ['wrapper-id-2']

    const fetchAccounts = jest.spyOn(client as any, 'fetchAccounts')
    const { parsed } = await captureNotifications(client)

    await (client as any).notifyListenersWithPermissionResponse(session)

    expect(fetchAccounts).not.toHaveBeenCalled()
    const data = parsed()[0].message.blockchainData
    expect(data.accounts[MAINNET_CAIP2]).toEqual({
      address: 'tz1sessionAddress',
      publicKey: 'edpkSessionKey'
    })
  })

  it('still responds when the session network differs from the preferred network', async () => {
    // The single-network hard-throw is gone: a ghostnet-only session paired
    // against a mainnet-preferring dApp yields a ghostnet permission response.
    const session = makeSession(['tezos:ghostnet:edpkGhostKey'])
    ;(client as any).session = session
    ;(client as any).messageIds = ['wrapper-id-3']

    const { parsed } = await captureNotifications(client)

    await expect(
      (client as any).notifyListenersWithPermissionResponse(session)
    ).resolves.toBeUndefined()

    const data = parsed()[0].message.blockchainData
    expect(Object.keys(data.accounts)).toEqual([GHOSTNET_CAIP2])
    expect(data.network.chainId).toBe(GHOSTNET_CAIP2)
    expect(data.publicKey).toBe('edpkGhostKey')
  })

  it('drops chains that fail to resolve and throws only when none resolve', async () => {
    const session = makeSession([
      'tezos:mainnet:tz1mainAddress',
      'tezos:ghostnet:tz1ghostAddress'
    ])
    ;(client as any).session = session
    ;(client as any).messageIds = ['wrapper-id-4']

    jest
      .spyOn(client as any, 'fetchAccounts')
      .mockImplementation(async (_topic: unknown, chainId: unknown) => {
        if (chainId === 'tezos:mainnet') {
          throw new Error('wallet refused')
        }
        return [{ algo: 'ed25519', address: 'tz1ghostAddress', pubkey: 'edpkFetchedKey' }]
      })

    const { parsed } = await captureNotifications(client)
    await (client as any).notifyListenersWithPermissionResponse(session)

    const data = parsed()[0].message.blockchainData
    expect(Object.keys(data.accounts)).toEqual([GHOSTNET_CAIP2])

    // All chains failing is still a hard error.
    jest.spyOn(client as any, 'fetchAccounts').mockRejectedValue(new Error('nope'))
    await expect(
      (client as any).notifyListenersWithPermissionResponse(session)
    ).rejects.toThrow('No account shared by wallet')
  })

  it('excludes chains without a static genesis mapping from the fanout', async () => {
    const session = makeSession([
      'tezos:mainnet:edpkSegmentKey',
      'tezos:weeklynet:edpkWeeklyKey'
    ])
    ;(client as any).session = session
    ;(client as any).messageIds = ['wrapper-id-5']

    const { parsed } = await captureNotifications(client)
    await (client as any).notifyListenersWithPermissionResponse(session)

    expect(Object.keys(parsed()[0].message.blockchainData.accounts)).toEqual([MAINNET_CAIP2])
  })
})

describe('sendMessage unwrapping and routing', () => {
  let client: WalletConnectCommunicationClient

  beforeEach(() => {
    jest.clearAllMocks()
    client = new WalletConnectCommunicationClient(wcOptions, isLeader)
  })

  it('unwraps a wrapped PermissionRequest and routes its blockchainData', async () => {
    const requestPermissions = jest
      .spyOn(client, 'requestPermissions')
      .mockResolvedValue(undefined)

    const wrapper = {
      id: 'wrapper-perm-1',
      version: '3',
      senderId: 'dapp-sender',
      message: {
        blockchainIdentifier: 'tezos',
        type: BeaconMessageType.PermissionRequest,
        blockchainData: {
          scopes: [PermissionScope.SIGN],
          network: { type: NetworkType.MAINNET }
        }
      }
    }

    await client.sendMessage(JSON.stringify(wrapper))

    expect(requestPermissions).toHaveBeenCalledWith(wrapper.message.blockchainData)
    // The WRAPPER id is what gets queued for the response envelope.
    expect((client as any).messageIds).toEqual(['wrapper-perm-1'])
  })

  it('warns and drops a non-wrapped (flat) message', async () => {
    const requestPermissions = jest
      .spyOn(client, 'requestPermissions')
      .mockResolvedValue(undefined)

    const flat = {
      id: 'flat-1',
      version: '2',
      type: BeaconMessageType.PermissionRequest,
      network: { type: NetworkType.MAINNET }
    }

    await client.sendMessage(JSON.stringify(flat))

    expect(requestPermissions).not.toHaveBeenCalled()
    expect((client as any).messageIds).toEqual([])
  })

  it('routes wrapped operation and sign-payload requests to the WC RPCs', async () => {
    const sendOperations = jest.spyOn(client, 'sendOperations').mockResolvedValue(undefined)
    const signPayload = jest.spyOn(client, 'signPayload').mockResolvedValue(undefined)

    await client.sendMessage(
      JSON.stringify({
        id: 'wrapper-op-1',
        version: '4',
        senderId: 'dapp-sender',
        message: {
          blockchainIdentifier: 'tezos',
          type: BeaconMessageType.BlockchainRequest,
          accountId: 'account-1',
          blockchainData: {
            type: 'operation_request',
            scope: PermissionScope.OPERATION_REQUEST,
            network: MAINNET_CAIP2,
            operationDetails: [{ kind: 'transaction' }],
            sourceAddress: 'tz1source'
          }
        }
      })
    )

    expect(sendOperations).toHaveBeenCalledWith({
      operationDetails: [{ kind: 'transaction' }],
      network: MAINNET_CAIP2,
      sourceAddress: 'tz1source'
    })

    await client.sendMessage(
      JSON.stringify({
        id: 'wrapper-sign-1',
        version: '4',
        senderId: 'dapp-sender',
        message: {
          blockchainIdentifier: 'tezos',
          type: BeaconMessageType.BlockchainRequest,
          accountId: 'account-1',
          blockchainData: {
            type: 'sign_payload_request',
            scope: PermissionScope.SIGN,
            signingType: SigningType.MICHELINE,
            payload: '0501',
            sourceAddress: 'tz1source'
          }
        }
      })
    )

    expect(signPayload).toHaveBeenCalledWith({
      signingType: SigningType.MICHELINE,
      payload: '0501',
      sourceAddress: 'tz1source'
    })
  })

  it('replies with a wrapped Error for tezos payloads without a WC RPC', async () => {
    ;(client as any).session = makeSession(['tezos:mainnet:edpkSegmentKey'])
    const { parsed } = await captureNotifications(client)

    await client.sendMessage(
      JSON.stringify({
        id: 'wrapper-broadcast-1',
        version: '4',
        senderId: 'dapp-sender',
        message: {
          blockchainIdentifier: 'tezos',
          type: BeaconMessageType.BlockchainRequest,
          accountId: 'account-1',
          blockchainData: { type: 'broadcast_request', signedTransaction: 'sig' }
        }
      })
    )

    const [wrapper] = parsed()
    expect(wrapper.id).toBe('wrapper-broadcast-1')
    expect(wrapper.version).toBe('4')
    expect(wrapper.message.type).toBe(BeaconMessageType.Error)
    expect(wrapper.message.blockchainIdentifier).toBe('tezos')
    expect(wrapper.message.error.type).toBeDefined()
    expect(wrapper.message.description).toContain('not supported over WalletConnect')
    // The unsupported request id is not left queued.
    expect((client as any).messageIds).toEqual([])
  })
})

describe('session proposal networks', () => {
  let client: WalletConnectCommunicationClient
  let connect: jest.Mock

  function makeMockSignClient() {
    connect = jest.fn(() =>
      Promise.resolve({ uri: 'wc:proposal-topic@2?relay', approval: () => new Promise(() => {}) })
    )
    return {
      session: { keys: [], get: jest.fn(), getAll: jest.fn(() => []) },
      pairing: { getAll: jest.fn(() => []) },
      on: jest.fn(),
      connect,
      ping: jest.fn(() => Promise.resolve()),
      request: jest.fn(),
      disconnect: jest.fn(),
      core: {
        pairing: {
          getPairings: jest.fn(() => []),
          ping: jest.fn(() => Promise.resolve()),
          events: { on: jest.fn(), removeAllListeners: jest.fn() },
          disconnect: jest.fn()
        },
        events: { removeAllListeners: jest.fn() },
        relayer: {
          transportClose: jest.fn(),
          events: { removeAllListeners: jest.fn() },
          provider: {
            events: { removeAllListeners: jest.fn() },
            connection: { events: { removeAllListeners: jest.fn() } }
          },
          subscriber: { events: { removeAllListeners: jest.fn() } }
        },
        heartbeat: { stop: jest.fn() }
      }
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    client = new WalletConnectCommunicationClient(wcOptions, isLeader)
    ;(client as any).signClient = makeMockSignClient()
  })

  it('keeps the preferred network required and adds extras as optionals', async () => {
    client.setProposalNetworks([NetworkType.MAINNET, NetworkType.GHOSTNET])

    await client.init()

    expect(connect).toHaveBeenCalledTimes(1)
    const params = connect.mock.calls[0][0]
    expect(params.requiredNamespaces.tezos.chains).toEqual(['tezos:mainnet'])
    expect(params.optionalNamespaces.tezos.chains).toEqual(['tezos:mainnet', 'tezos:ghostnet'])
  })

  it('excludes unmappable networks and clears the stored proposal networks', async () => {
    client.setProposalNetworks([NetworkType.GHOSTNET, NetworkType.CUSTOM])

    await client.init()

    let params = connect.mock.calls[0][0]
    // CUSTOM has no static genesis mapping and never reaches the proposal.
    expect(params.optionalNamespaces.tezos.chains).toEqual(['tezos:mainnet', 'tezos:ghostnet'])

    // A second init without setProposalNetworks builds a single-network proposal.
    await client.init()
    params = connect.mock.calls[1][0]
    expect(params.optionalNamespaces.tezos.chains).toEqual(['tezos:mainnet'])
  })
})

describe('permitted networks derived from the session', () => {
  it('reports the distinct granted chains, preferred network first', () => {
    const client = new WalletConnectCommunicationClient(wcOptions, isLeader)
    ;(client as any).session = makeSession([
      'tezos:ghostnet:tz1a',
      'tezos:mainnet:tz1b',
      'tezos:ghostnet:tz1c'
    ])

    expect(client.getNetworks()).toEqual(['mainnet', 'ghostnet'])
  })

  it('falls back to the preferred network before a session exists', () => {
    const client = new WalletConnectCommunicationClient(wcOptions, isLeader)

    expect((client as any).getPermittedNetwork()).toEqual(['mainnet'])
  })
})
