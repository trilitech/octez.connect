import { PostMessageTransport } from '@tezos-x/octez.connect-transport-postmessage'
import { LocalStorage } from '@tezos-x/octez.connect-core'
import { getKeypairFromSeed } from '@tezos-x/octez.connect-utils'
import { ExtensionMessageTarget, StorageKey } from '@tezos-x/octez.connect-types'

// This fixture consumes compiled ESM, including its native class fields.
export async function createHarness() {
  const create = async (name) =>
    new PostMessageTransport(
      name,
      await getKeypairFromSeed(`lifecycle-${name}`),
      new LocalStorage(name),
      StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP
    )
  const sender = await create('sender')
  await sender.disconnect()
  const senderPeer = await sender.getPairingRequestInfo()
  const add = window.addEventListener.bind(window)
  const remove = window.removeEventListener.bind(window)
  const registrations = new Set()
  const receivers = new Map()
  let sequence = 0

  // Module-level discovery and fixture listeners are outside this count.
  window.addEventListener = function (type, listener, options) {
    if (type === 'message') registrations.add(listener)
    return add(type, listener, options)
  }
  window.removeEventListener = function (type, listener, options) {
    if (type === 'message') registrations.delete(listener)
    return remove(type, listener, options)
  }

  return {
    async create(name) {
      const transport = await create(name)
      const messages = []
      await transport.addListener((message, context) => messages.push({ message, context }))
      await transport.listen(senderPeer.publicKey)
      receivers.set(name, { transport, messages, peer: await transport.getPairingRequestInfo() })
    },
    async connect(name) {
      const { transport } = receivers.get(name)
      await transport.connect()
      // stop() clears subscriptions. Restore through the public API.
      await transport.listen(senderPeer.publicKey)
    },
    async disconnect(name) {
      await receivers.get(name).transport.disconnect()
    },
    count() {
      return registrations.size
    },
    messages(name) {
      return receivers.get(name).messages
    },
    async send(name, plaintext) {
      const marker = `lifecycle-drained-${++sequence}`
      // A barrier in the same window-message task queue follows the encrypted
      // event. Its prior decryption microtasks finish before this resolves.
      let finish
      const drained = new Promise((resolve) => {
        finish = resolve
      })
      const relay = (event) => {
        if (event.source !== window || event.origin !== location.origin) return
        if (event.data === marker) {
          remove('message', relay)
          finish()
        } else if (
          event.data?.target === ExtensionMessageTarget.EXTENSION &&
          event.data.encryptedPayload
        ) {
          window.postMessage(
            {
              message: {
                target: ExtensionMessageTarget.PAGE,
                encryptedPayload: event.data.encryptedPayload
              },
              sender: { id: 'fixture-extension' }
            },
            location.origin
          )
          window.postMessage(marker, location.origin)
        }
      }
      add('message', relay)
      try {
        await sender.send(plaintext, receivers.get(name).peer)
        await drained
      } finally {
        remove('message', relay)
      }
    }
  }
}
