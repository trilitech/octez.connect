// Real crypto; only the browser window is faked.

jest.mock('@tezos-x/octez.connect-core', () => {
  const actual = jest.requireActual('@tezos-x/octez.connect-core')
  const listeners: Array<(e: any) => any> = []
  const windowRef = {
    listeners,
    postMessage: jest.fn(),
    addEventListener: jest.fn((_t: string, fn: any) => listeners.push(fn)),
    removeEventListener: jest.fn(),
    location: { origin: 'http://dapp.example' }
  }
  return { ...actual, windowRef }
})

import { windowRef } from '@tezos-x/octez.connect-core'
import { ExtensionMessageTarget, StorageKey } from '@tezos-x/octez.connect-types'
import { getKeypairFromSeed, sealCryptobox, toHex } from '@tezos-x/octez.connect-utils'
import { PostMessageClient } from '../src/PostMessageClient'
import { PostMessageTransport } from '../src/PostMessageTransport'

// Post a sealed pairing reply to the page, as an extension (or any page script) can.
const postReply = async (dappPublicKey: Uint8Array, requestId: string) => {
  const sender = await getKeypairFromSeed('extension-seed')
  const reply = {
    id: requestId,
    type: 'postmessage-pairing-response',
    name: 'Some Extension',
    publicKey: toHex(sender.publicKey),
    version: '3'
  }
  const payload = await sealCryptobox(JSON.stringify(reply), dappPublicKey)
  const w = windowRef as any
  for (const fn of [...w.listeners]) {
    await fn({
      source: w,
      origin: w.location.origin,
      data: {
        message: { target: ExtensionMessageTarget.PAGE, payload },
        sender: { id: 'extension-id' }
      }
    })
  }
}

describe('PostMessageClient pairing and session checks', () => {
  beforeEach(() => {
    ;(windowRef as any).listeners.length = 0
    sessionStorage.clear() // pending pairings live there
  })

  it('ignores an extension pairing reply when the dApp never asked for one', async () => {
    const dappKeys = await getKeypairFromSeed('dapp-seed')
    const client = new PostMessageClient('dapp', dappKeys)
    const accepted = jest.fn()
    await client.listenForChannelOpening(accepted)

    // No pairing request was made.
    await postReply(dappKeys.publicKey, 'never-requested')

    expect(accepted).not.toHaveBeenCalled()
  })

  it('drops a message from a paired extension that claims another extension id', async () => {
    const dappKeys = await getKeypairFromSeed('dapp-seed')
    const data: Record<string, any> = {
      [StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP]: [
        { publicKey: 'b'.repeat(64), extensionId: 'extension-B' }
      ]
    }
    const storage = {
      get: async (k: string) => data[k] ?? [],
      set: async (k: string, v: any) => {
        data[k] = v
      },
      delete: async () => undefined
    }
    const transport = new PostMessageTransport(
      'dapp',
      dappKeys,
      storage as any,
      StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP
    )
    const delivered = jest.fn()
    jest.spyOn(transport as any, 'notifyListeners').mockImplementation(async (...a) => {
      delivered(...a)
    })
    const client = (transport as any).client
    client.decryptMessage = jest.fn().mockResolvedValue('decrypted')

    await transport.listen('b'.repeat(64))
    const onMessage = client.activeListeners.get('b'.repeat(64))
    // Decrypts with B's key (so B sent it), but claims to be extension A.
    await onMessage({ encryptedPayload: 'x' }, { origin: 'extension', id: 'extension-A' })
    await onMessage({ encryptedPayload: 'x' }, { origin: 'extension', id: 'extension-B' })
    await new Promise((resolve) => setTimeout(resolve, 0)) // the client does not await the callback

    expect(delivered).toHaveBeenCalledTimes(1)
    expect(delivered.mock.calls[0][1]).toEqual({ origin: 'extension', id: 'extension-B' })
  })

  it('still accepts the reply to a pairing request it sent, once', async () => {
    const dappKeys = await getKeypairFromSeed('dapp-seed')
    const client = new PostMessageClient('dapp', dappKeys)
    const accepted = jest.fn()
    await client.listenForChannelOpening(accepted)
    const request = await client.getPairingRequestInfo()

    await postReply(dappKeys.publicKey, request.id)
    await postReply(dappKeys.publicKey, request.id) // replayed: single use

    expect(accepted).toHaveBeenCalledTimes(1)
  })
})
