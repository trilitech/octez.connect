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
import { ExtensionMessageTarget } from '@tezos-x/octez.connect-types'
import { getKeypairFromSeed, sealCryptobox, toHex } from '@tezos-x/octez.connect-utils'
import { PostMessageClient } from '../src/PostMessageClient'

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
