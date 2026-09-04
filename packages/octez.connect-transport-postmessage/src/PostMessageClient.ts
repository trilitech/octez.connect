import { windowRef, Serializer, getSenderId, MessageBasedClient } from '@tezos-x/octez.connect-core'

import { openCryptobox, secretbox_NONCEBYTES, secretbox_MACBYTES } from '@tezos-x/octez.connect-utils'
import {
  ExtensionMessage,
  ExtensionMessageTarget,
  Origin,
  ConnectionContext,
  ExtendedPostMessagePairingResponse,
  PostMessagePairingResponse,
  EncryptedExtensionMessage,
  PostMessagePairingRequest
} from '@tezos-x/octez.connect-types'

/**
 * @internalapi
 *
 *
 */
export class PostMessageClient extends MessageBasedClient {
  protected readonly activeListeners: Map<
    string,
    (message: EncryptedExtensionMessage, context: ConnectionContext) => void
  > = new Map()

  /**
   * The `window` handlers this client registered, kept so `stop()` can remove
   * them. Both used to be anonymous and permanent: every client instance --
   * one per transport, one transport per connection -- left two listeners
   * behind for the lifetime of the page.
   */
  private messageHandler?: (message: unknown) => void
  private channelOpeningHandler?: (event: unknown) => Promise<void>

  public async init(): Promise<void> {
    this.subscribeToMessages().catch(console.error)
  }

  /**
   * (Re)arm the `window` subscription. Idempotent, so a transport can call it
   * on every `connect()`: after a `stop()` this is what brings the client back.
   */
  public async start(): Promise<void> {
    await this.subscribeToMessages()
  }

  /**
   * Stop listening on `window` and forget every peer subscription. The
   * counterpart of `start()`; a transport calls it from `disconnect()`.
   */
  public async stop(): Promise<void> {
    if (this.messageHandler) {
      windowRef.removeEventListener('message', this.messageHandler)
      this.messageHandler = undefined
    }
    if (this.channelOpeningHandler) {
      windowRef.removeEventListener('message', this.channelOpeningHandler)
      this.channelOpeningHandler = undefined
    }
    this.activeListeners.clear()
  }

  public async listenForEncryptedMessage(
    senderPublicKey: string,
    messageCallback: (message: string, context: ConnectionContext) => void
  ): Promise<void> {
    if (this.activeListeners.has(senderPublicKey)) {
      return
    }

    const callbackFunction = async (
      message: EncryptedExtensionMessage,
      context: ConnectionContext
    ): Promise<void> => {
      try {
        const decryptedMessage = await this.decryptMessage(
          senderPublicKey,
          message.encryptedPayload
        )
        // console.log('calculated sender ID', await getSenderId(senderPublicKey))
        // TODO: Add check for correct decryption key / sender ID
        messageCallback(decryptedMessage, context)
      } catch (decryptionError) {
        /* NO-OP. We try to decode every message, but some might not be addressed to us. */
      }
    }

    this.activeListeners.set(senderPublicKey, callbackFunction)
  }

  public async sendMessage(
    message: string,
    peer: PostMessagePairingRequest | ExtendedPostMessagePairingResponse
  ): Promise<void> {
    const payload = await this.encryptMessage(peer.publicKey, message)

    const targetId = (peer as ExtendedPostMessagePairingResponse)?.extensionId

    // if no targetId, we remove peer
    const msg: EncryptedExtensionMessage = {
      target: ExtensionMessageTarget.EXTENSION,
      encryptedPayload: payload,
      targetId
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    windowRef.postMessage(msg as any, windowRef.location.origin)
  }

  public async listenForChannelOpening(
    messageCallback: (pairingResponse: ExtendedPostMessagePairingResponse) => void
  ): Promise<void> {
    // One channel-opening handler at a time: a transport that reconnects
    // calls this again, and stacking handlers delivered every pairing response
    // once per past connect().
    if (this.channelOpeningHandler) {
      windowRef.removeEventListener('message', this.channelOpeningHandler)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = async (event: any): Promise<void> => {
      if (event.source !== windowRef || event.origin !== windowRef.location.origin) {
        // TODO: Add to error handler: console.debug('[octez.connect]: Event received from untrusted origin')
        return
      }

      const data = event?.data?.message as ExtensionMessage<string>

      if (
        data &&
        data.target === ExtensionMessageTarget.PAGE &&
        (await this.isChannelOpenMessage(data))
      ) {
        const payload = Buffer.from(data.payload, 'hex')

        if (payload.length >= secretbox_NONCEBYTES + secretbox_MACBYTES) {
          try {
            const pairingResponse: PostMessagePairingResponse = JSON.parse(
              await openCryptobox(payload, this.keyPair!.publicKey, this.keyPair!.secretKey)
            )

            messageCallback(
              new ExtendedPostMessagePairingResponse(
                pairingResponse.id,
                pairingResponse.name,
                pairingResponse.publicKey,
                pairingResponse.version,
                await getSenderId(pairingResponse.publicKey),
                event?.data?.sender.id
              )
            )
          } catch (decryptionError) {
            /* NO-OP. We try to decode every message, but some might not be addressed to us. */
          }
        }
      }
    }

    this.channelOpeningHandler = fn
    windowRef.addEventListener('message', fn)
  }

  public async sendPairingRequest(id: string): Promise<void> {
    const message: ExtensionMessage<string> = {
      target: ExtensionMessageTarget.EXTENSION,
      payload: await new Serializer().serialize(await this.getPairingRequestInfo()),
      targetId: id
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    windowRef.postMessage(message as any, windowRef.location.origin)
  }

  public async isChannelOpenMessage(message: any): Promise<boolean> {
    return typeof message === 'object' && message.hasOwnProperty('payload')
  }

  private async subscribeToMessages(): Promise<void> {
    if (this.messageHandler) {
      return
    }

    const handler = (message: unknown): void => {
      if (
        (message as any).source !== windowRef ||
        (message as any).origin !== windowRef.location.origin
      ) {
        // TODO: Add to error handler: console.debug('[octez.connect]: Event received from untrusted origin')
        return
      }

      if (typeof message === 'object' && message) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: {
          message: EncryptedExtensionMessage
          sender: chrome.runtime.MessageSender
        } = (message as any).data
        if (data.message && data.message.target === ExtensionMessageTarget.PAGE) {
          this.activeListeners.forEach((listener) => {
            listener(data.message, {
              origin: Origin.EXTENSION,
              id: data.sender.id || ''
            })
          })
        }
      }
    }

    this.messageHandler = handler
    windowRef.addEventListener('message', handler)
  }
}
