import {
  Storage,
  StorageKey,
  StorageKeyReturnType,
  TransportStatus
} from '@tezos-x/octez.connect-types'
import { PostMessageTransport } from '../src/PostMessageTransport'

/**
 * Runs against the real core under jsdom: `windowRef` is the jsdom window,
 * so the `window` handlers the client registers are observable through spies.
 */
class MemoryStorage extends Storage {
  private readonly store: Partial<Record<StorageKey, unknown>> = {}

  public static override isSupported(): Promise<boolean> {
    return Promise.resolve(true)
  }

  public override async get<K extends StorageKey>(key: K): Promise<StorageKeyReturnType[K]> {
    return (this.store[key] ?? []) as StorageKeyReturnType[K]
  }

  public override async set<K extends StorageKey>(
    key: K,
    value: StorageKeyReturnType[K]
  ): Promise<void> {
    this.store[key] = value
  }

  public override async delete<K extends StorageKey>(key: K): Promise<void> {
    delete this.store[key]
  }

  public override async subscribeToStorageChanged(): Promise<void> {
    return
  }

  public override getPrefixedKey<K extends StorageKey>(key: K): string {
    return key
  }
}

const KEY_PAIR = {
  publicKey: new Uint8Array(32),
  secretKey: new Uint8Array(64)
}

const messageHandlers = (spy: jest.SpyInstance) =>
  spy.mock.calls.filter(([event]) => event === 'message').map(([, handler]) => handler)

describe('PostMessageTransport lifecycle', () => {
  let added: jest.SpyInstance
  let removed: jest.SpyInstance

  beforeEach(() => {
    added = jest.spyOn(window, 'addEventListener')
    removed = jest.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    added.mockRestore()
    removed.mockRestore()
  })

  const make = () =>
    new PostMessageTransport(
      'test-dapp',
      KEY_PAIR,
      new MemoryStorage(),
      StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP
    )

  it('stops listening on window when disconnected', async () => {
    const transport = make()
    await transport.connect()
    const [handler] = messageHandlers(added)
    expect(handler).toBeDefined()

    await transport.disconnect()

    expect(transport.connectionStatus).toBe(TransportStatus.NOT_CONNECTED)
    expect(messageHandlers(removed)).toContain(handler)
  })

  it('listens again when reconnected on the same instance', async () => {
    const transport = make()
    await transport.connect()
    await transport.disconnect()
    added.mockClear()

    await transport.connect()

    expect(transport.connectionStatus).toBe(TransportStatus.CONNECTED)
    expect(messageHandlers(added)).toHaveLength(1)
  })

  it('does not report CONNECTED when a disconnect lands while the listener is armed', async () => {
    const transport = make()
    // The one gap the earlier status check cannot cover: arming the open-channel
    // listener yields, so a disconnect() can land between it and super.connect().
    jest.spyOn(transport, 'startOpenChannelListener').mockImplementation(async () => {
      await transport.disconnect()
    })

    await transport.connect()

    expect(transport.connectionStatus).toBe(TransportStatus.NOT_CONNECTED)
  })

  it('leaves nothing behind when a disconnect() overtakes a connect()', async () => {
    const transport = make()

    const connecting = transport.connect()
    const disconnecting = transport.disconnect()
    await Promise.all([connecting, disconnecting])

    expect(transport.connectionStatus).toBe(TransportStatus.NOT_CONNECTED)
    const stillRegistered = messageHandlers(added).filter(
      (handler) => !messageHandlers(removed).includes(handler)
    )
    expect(stillRegistered).toHaveLength(0)
  })
})
