import { getKeypairFromSeed } from '@tezos-x/octez.connect-utils'
import { DappP2PTransport } from '../../src/transports/DappP2PTransport'
import { DappPostMessageTransport } from '../../src/transports/DappPostMessageTransport'

describe('DAppClient pairing and session checks', () => {
  it('stops accepting pairing replies once pairing stops listening (popup closed or paired)', async () => {
    const keys = await getKeypairFromSeed('dapp')
    const storage = {
      get: async () => [],
      set: async () => undefined,
      delete: async () => undefined
    }
    const transports = [
      new DappP2PTransport('dapp', keys, storage as any, {} as any),
      new DappPostMessageTransport('dapp', keys, storage as any)
    ]
    for (const transport of transports) {
      const clear = jest.spyOn((transport as any).client, 'clearPendingPairings')
      await transport.stopListeningForNewPeers()
      expect(clear).toHaveBeenCalledTimes(1)
    }
  })
})
