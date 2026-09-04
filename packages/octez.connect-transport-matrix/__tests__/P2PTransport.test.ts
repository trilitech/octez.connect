import { StorageKey, TransportStatus } from '@tezos-x/octez.connect-types'
import { P2PCommunicationClient } from '../src/communication-client/P2PCommunicationClient'
import { P2PTransport } from '../src/P2PTransport'

/**
 * The matrix client is stubbed at the prototype so a start() can be held
 * pending while a disconnect() lands; the transport is otherwise real.
 */
const storage = {
  get: jest.fn().mockResolvedValue([]),
  set: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  getPrefixedKey: (key: string) => key,
  subscribeToStorageChanged: jest.fn()
}

const KEY_PAIR = { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) }

const make = () =>
  new P2PTransport('test-dapp', KEY_PAIR, storage as never, {}, StorageKey.TRANSPORT_P2P_PEERS_DAPP)

describe('P2PTransport lifecycle', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does not finish a connect() that a disconnect() overtook', async () => {
    let finishStart!: () => void
    jest.spyOn(P2PCommunicationClient.prototype, 'start').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishStart = resolve
        })
    )
    const stop = jest.spyOn(P2PCommunicationClient.prototype, 'stop').mockResolvedValue(undefined)
    const transport = make()

    const connecting = transport.connect()
    await transport.disconnect()
    finishStart()
    await connecting

    expect(stop).toHaveBeenCalledTimes(1)
    expect(transport.connectionStatus).toBe(TransportStatus.NOT_CONNECTED)
  })

  it('connects when nothing interrupts it', async () => {
    jest.spyOn(P2PCommunicationClient.prototype, 'start').mockResolvedValue(undefined)
    const transport = make()

    await transport.connect()

    expect(transport.connectionStatus).toBe(TransportStatus.CONNECTED)
  })
})
