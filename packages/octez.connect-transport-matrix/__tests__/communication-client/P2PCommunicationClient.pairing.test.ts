// Real crypto throughout; only the Matrix network client is faked.

jest.mock('../../src/matrix-client/MatrixClient', () => ({
  MatrixClient: { create: jest.fn() }
}))

import { getHexHash, getKeypairFromSeed, sealCryptobox, toHex } from '@tezos-x/octez.connect-utils'
import { StorageKey } from '@tezos-x/octez.connect-types'
import { MatrixClient } from '../../src/matrix-client/MatrixClient'
import { MatrixClientEventType } from '../../src/matrix-client/models/MatrixClientEvent'
import { P2PCommunicationClient } from '../../src/communication-client/P2PCommunicationClient'

const RELAY = 'beacon-node-1.example'

const memoryStorage = () => {
  const data: Record<string, any> = { [StorageKey.MATRIX_PEER_ROOM_IDS]: {} }
  return {
    data,
    get: jest.fn(async (k: string) => data[k] ?? (k.includes('peers') ? [] : undefined)),
    set: jest.fn(async (k: string, v: any) => {
      data[k] = v
    }),
    delete: jest.fn(async (k: string) => {
      delete data[k]
    })
  }
}

const setup = async () => {
  const handlers: Record<string, Array<(e: any) => any>> = {}
  const matrix = {
    subscribe: jest.fn((type: string, fn: any) => {
      ;(handlers[type] ||= []).push(fn)
    }),
    unsubscribe: jest.fn(),
    unsubscribeAll: jest.fn(),
    joinRooms: jest.fn().mockResolvedValue(undefined),
    getRoomById: jest.fn().mockResolvedValue({ members: [] }),
    start: jest.fn().mockResolvedValue(undefined), // fake login always succeeds
    stop: jest.fn(),
    joinedRooms: Promise.resolve([]),
    invitedRooms: Promise.resolve([])
  }
  ;(MatrixClient.create as jest.Mock).mockReturnValue(matrix)

  const dappKeys = await getKeypairFromSeed('dapp-seed')
  const storage = memoryStorage()
  const client = new P2PCommunicationClient('dapp', dappKeys, 1, storage as any)
  jest
    .spyOn(client as any, 'getRelayServer')
    .mockResolvedValue({ server: RELAY, timestamp: Date.now() / 1000 })
  ;(client as any).client.resolve(matrix)

  const emit = async (type: string, event: any) => {
    for (const fn of handlers[type] ?? []) await fn(event)
  }

  return { client, matrix, storage, emit, handlers, dappKeys }
}

// A pairing reply sealed to the dApp's public key.
const channelOpen = async (
  dappPublicKey: Uint8Array,
  otherSeed: string,
  requestId: string = 'never-requested'
) => {
  const other = await getKeypairFromSeed(otherSeed)
  const reply = {
    id: requestId,
    type: 'p2p-pairing-response',
    name: 'Some Wallet',
    version: '3',
    publicKey: toHex(other.publicKey),
    relayServer: RELAY
  }
  const sealed = await sealCryptobox(JSON.stringify(reply), dappPublicKey)
  const dappHash = await getHexHash(Buffer.from(dappPublicKey))
  const otherHash = await getHexHash(Buffer.from(other.publicKey))
  return {
    other,
    event: {
      type: MatrixClientEventType.MESSAGE,
      content: {
        roomId: '!other-room:' + RELAY,
        message: {
          type: 'm.text',
          sender: `@${otherHash}:${RELAY}`,
          content: `@channel-open:@${dappHash}:${RELAY}:${sealed}`
        }
      }
    }
  }
}

describe('P2PCommunicationClient pairing and session checks', () => {
  beforeEach(() => sessionStorage.clear()) // pending pairings live there
  afterEach(() => jest.restoreAllMocks())

  it('still accepts the reply after the tab reloads mid-pairing', async () => {
    const before = await setup()
    const request = await before.client.getPairingRequestInfo()

    // Reload: a brand-new client, same tab (same sessionStorage).
    const after = await setup()
    const accepted = jest.fn()
    await after.client.listenForChannelOpening(accepted)
    const { event } = await channelOpen(after.dappKeys.publicKey, 'real-wallet', request.id)
    await after.emit(MatrixClientEventType.MESSAGE, event)

    expect(accepted).toHaveBeenCalledTimes(1)
  })

  it('ignores the reply once the pairing popup was closed', async () => {
    const { client, emit, dappKeys } = await setup()
    const accepted = jest.fn()
    await client.listenForChannelOpening(accepted)
    const request = await client.getPairingRequestInfo()

    client.clearPendingPairings() // popup closed
    const { event } = await channelOpen(dappKeys.publicKey, 'real-wallet', request.id)
    await emit(MatrixClientEventType.MESSAGE, event)

    expect(accepted).not.toHaveBeenCalled()
  })

  it('ignores a pairing reply when the dApp never asked for one', async () => {
    const { client, emit, dappKeys } = await setup()
    const accepted = jest.fn()
    await client.listenForChannelOpening(accepted)

    // No getPairingRequestInfo() / QR code shown -- nothing is pending.
    const { event } = await channelOpen(dappKeys.publicKey, 'other-seed')
    await emit(MatrixClientEventType.MESSAGE, event)

    expect(accepted).not.toHaveBeenCalled()
  })

  it('ignores a pairing reply whose id does not match the pending request', async () => {
    const { client, emit, dappKeys } = await setup()
    const accepted = jest.fn()
    await client.listenForChannelOpening(accepted)
    await client.getPairingRequestInfo() // a real request is pending, with its own id

    const { event } = await channelOpen(dappKeys.publicKey, 'other-seed')
    await emit(MatrixClientEventType.MESSAGE, event)

    expect(accepted).not.toHaveBeenCalled()
  })

  it('still accepts the reply to a pairing request it showed, once', async () => {
    const { client, emit, storage, dappKeys } = await setup()
    const accepted = jest.fn()
    await client.listenForChannelOpening(accepted)
    const request = await client.getPairingRequestInfo()

    const { event } = await channelOpen(dappKeys.publicKey, 'real-wallet', request.id)
    await emit(MatrixClientEventType.MESSAGE, event)
    await emit(MatrixClientEventType.MESSAGE, event) // replayed: single use

    expect(accepted).toHaveBeenCalledTimes(1)
    expect(Object.values(storage.data[StorageKey.MATRIX_PEER_ROOM_IDS])).toEqual([
      event.content.roomId
    ])
  })

  it('ignores a reply whose Matrix sender does not own the key it claims', async () => {
    const { client, emit, dappKeys } = await setup()
    const accepted = jest.fn()
    await client.listenForChannelOpening(accepted)
    const request = await client.getPairingRequestInfo()

    const { event } = await channelOpen(dappKeys.publicKey, 'real-wallet', request.id)
    event.content.message.sender = '@someone-else:' + RELAY
    await emit(MatrixClientEventType.MESSAGE, event)

    expect(accepted).not.toHaveBeenCalled()
  })

  it('does not rewrite message routing for an unknown sender before checking the reply', async () => {
    const { client, emit, storage, dappKeys } = await setup()
    await client.listenForChannelOpening(jest.fn())

    const { event } = await channelOpen(dappKeys.publicKey, 'other-seed')
    // Garbage payload: cannot even be decrypted.
    event.content.message.content = event.content.message.content.replace(/:[0-9a-f]+$/, ':00')
    await emit(MatrixClientEventType.MESSAGE, event)

    expect(storage.data[StorageKey.MATRIX_PEER_ROOM_IDS]).toEqual({})
  })
})
