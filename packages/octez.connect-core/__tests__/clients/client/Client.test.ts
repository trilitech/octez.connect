import {
  BeaconMessageType,
  ConnectionContext,
  Origin,
  TransportType
} from '@tezos-x/octez.connect-types'
import { Client } from '../../../src/clients/client/Client'
import { Serializer } from '../../../src/Serializer'
import { Transport } from '../../../src/transports/Transport'
import { MockStorage } from './MockStorage'

/** `Client` is abstract only in name; nothing needs implementing to instantiate it. */
class TestClient extends Client {
  public readonly handled: unknown[] = []

  constructor() {
    super({ name: 'test-client', storage: new MockStorage() })
    this.handleResponse = async (message) => {
      this.handled.push(message)
    }
  }
}

const PEER = {
  publicKey: 'wallet-public-key',
  senderId: 'wallet-sender-id',
  name: 'wallet',
  version: '4',
  // What a postMessage pairing response carries, and what `connectionInfo.id`
  // holds for a message from that extension.
  extensionId: 'wallet-extension-id'
}

type Listener = (message: unknown, connectionInfo: ConnectionContext) => Promise<void>

/** Enough of a Transport for `Client` to subscribe to and read peers from. */
const fakeTransport = (
  type: TransportType = TransportType.POST_MESSAGE,
  peers: (typeof PEER)[] = [PEER]
) => {
  const listeners: Listener[] = []
  const transport = {
    type,
    listeners,
    getPeers: async () => peers,
    addListener: async (listener: Listener) => {
      listeners.push(listener)
    },
    removeListener: async (listener: Listener) => {
      const index = listeners.indexOf(listener)
      if (index >= 0) {
        listeners.splice(index, 1)
      }
    }
  }

  return transport as typeof transport & Transport
}

/** The protected surface under test. */
interface ClientInternals {
  addListener: (transport: Transport) => Promise<void>
  setTransport: (transport?: Transport) => Promise<void>
  findPeer: (publicKey: string | undefined, transport: Transport) => Promise<unknown>
  cleanup: () => Promise<void>
}

const internals = (client: Client) => client as unknown as ClientInternals

const PARKED = Symbol('parked')

/** Resolves to PARKED if `promise` has not settled within 50ms. */
const settledOrParked = <T>(promise: Promise<T>) =>
  Promise.race([
    promise,
    new Promise<typeof PARKED>((resolve) => setTimeout(() => resolve(PARKED), 50))
  ])

describe('Client transport subscriptions', () => {
  describe('findPeer', () => {
    it('resolves the peer on the transport that delivered the message', async () => {
      const client = internals(new TestClient())
      const transport = fakeTransport()

      await client.addListener(transport)

      await expect(client.findPeer(PEER.publicKey, transport)).resolves.toEqual(PEER)
    })

    it('resolves a postMessage peer by the extension id the transport attaches', async () => {
      const client = internals(new TestClient())
      const transport = fakeTransport()

      await client.addListener(transport)

      await expect(client.findPeer(PEER.extensionId, transport)).resolves.toEqual(PEER)
    })

    it('prefers the newest peer when two share an extension id', async () => {
      // `addPeer` dedupes by public key, so a wallet that rotated its beacon key
      // leaves both peers in the store under the same extension id.
      const stale = { ...PEER, publicKey: 'stale-public-key', senderId: 'stale-sender-id' }
      const client = internals(new TestClient())
      const transport = fakeTransport(TransportType.POST_MESSAGE, [stale, PEER])

      await client.addListener(transport)

      await expect(client.findPeer(PEER.extensionId, transport)).resolves.toEqual(PEER)
    })

    it('finds nothing for an id that is neither a public key nor an extension id', async () => {
      const client = internals(new TestClient())
      const transport = fakeTransport()

      await client.addListener(transport)

      await expect(client.findPeer('someone-else', transport)).resolves.toBeUndefined()
    })

    it('finds nothing without an id, without touching the transport', async () => {
      const client = internals(new TestClient())
      const transport = fakeTransport()
      const getPeers = jest.spyOn(transport, 'getPeers')

      await expect(client.findPeer(undefined, transport)).resolves.toBeUndefined()
      expect(getPeers).not.toHaveBeenCalled()
    })
  })

  describe('subscription', () => {
    it('handles a message delivered while no transport is resolved', async () => {
      const client = new TestClient()
      const transport = fakeTransport()

      await internals(client).addListener(transport)
      // Subscribed, but `_transport` was never resolved -- the state between a
      // disconnection and the next pairing. The wallet's echoed `disconnect`
      // arrives here.
      const payload = await new Serializer().serialize({
        id: 'message-id',
        version: '2',
        senderId: PEER.senderId,
        type: BeaconMessageType.Disconnect
      })

      const delivered = transport.listeners[0](payload, {
        origin: Origin.EXTENSION,
        id: PEER.publicKey
      })

      await expect(settledOrParked(delivered)).resolves.toBeUndefined()
      expect(client.handled).toHaveLength(1)
      expect(client.handled[0]).toMatchObject({ type: BeaconMessageType.Disconnect })
    })
  })

  describe('addListener', () => {
    it('detaches the replaced transport, not the incoming one', async () => {
      const client = internals(new TestClient())
      const dropped = fakeTransport()
      const replacement = fakeTransport()

      await client.addListener(dropped)
      await client.addListener(replacement)

      expect(dropped.listeners).toHaveLength(0)
      expect(replacement.listeners).toHaveLength(1)
    })

    it('keeps one subscription per transport type', async () => {
      const client = internals(new TestClient())
      const postMessage = fakeTransport(TransportType.POST_MESSAGE)
      const p2p = fakeTransport(TransportType.P2P)

      await client.addListener(postMessage)
      await client.addListener(p2p)

      expect(postMessage.listeners).toHaveLength(1)
      expect(p2p.listeners).toHaveLength(1)
    })
  })

  describe('destroy', () => {
    it('detaches every subscription after a disconnection left no transport resolved', async () => {
      const client = new TestClient()
      const transport = fakeTransport()

      await internals(client).setTransport(transport)
      await internals(client).setTransport(undefined)

      await client.destroy()

      expect(transport.listeners).toHaveLength(0)
    })
  })

  describe('cleanup', () => {
    it('detaches every subscription from its own transport', async () => {
      const client = internals(new TestClient())
      const postMessage = fakeTransport(TransportType.POST_MESSAGE)
      const p2p = fakeTransport(TransportType.P2P)

      await client.addListener(postMessage)
      await client.addListener(p2p)
      // Only one of them can be the active transport.
      await client.setTransport(p2p)

      await client.cleanup()

      expect(postMessage.listeners).toHaveLength(0)
      expect(p2p.listeners).toHaveLength(0)
    })

    it('detaches even when no transport is resolved', async () => {
      const client = internals(new TestClient())
      const transport = fakeTransport()

      await client.addListener(transport)
      // Subscribed through addListener alone, never set as the active transport.

      await client.cleanup()

      expect(transport.listeners).toHaveLength(0)
    })
  })
})
