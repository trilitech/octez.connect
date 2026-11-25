import {
  BeaconRequestOutputMessage,
  BeaconMessageType,
  AppMetadata,
  ConnectionContext,
  BeaconMessageWrapper,
  BeaconRequestMessage,
  BlockchainRequestV3,
  PermissionRequestV3,
  BeaconBaseMessage
} from '@tezos-x/octez.connect-types'
import { AppMetadataManager, Logger, usesWrappedMessages, assertNever } from '@tezos-x/octez.connect-core'

const logger = new Logger('IncomingRequestInterceptor')

interface IncomingRequestInterceptorOptions {
  message: BeaconRequestMessage | BeaconMessageWrapper<BeaconBaseMessage>
  connectionInfo: ConnectionContext
  appMetadataManager: AppMetadataManager
  interceptorCallback: (
    message: BeaconRequestOutputMessage,
    connectionInfo: ConnectionContext
  ) => void
}

// Chain identifiers whose wrapped payloads are normalized back to the flat
// request shapes Tezos wallet apps have always consumed ('xtz' is the
// pre-rename legacy identifier). Other chains (e.g. substrate) keep the
// wrapped pass-through of the generic API.
const TEZOS_IDENTIFIERS: readonly string[] = ['tezos', 'xtz']

// Wrapped Tezos blockchainData discriminators → the flat BeaconMessageType
// the wallet app receives. Values reuse the pre-fork wire strings.
const TEZOS_PAYLOAD_TO_FLAT_TYPE: Record<string, BeaconMessageType> = {
  operation_request: BeaconMessageType.OperationRequest,
  sign_payload_request: BeaconMessageType.SignPayloadRequest,
  broadcast_request: BeaconMessageType.BroadcastRequest,
  proof_of_event_challenge_request: BeaconMessageType.ProofOfEventChallengeRequest,
  simulated_proof_of_event_challenge_request:
    BeaconMessageType.SimulatedProofOfEventChallengeRequest
}

/**
 * @internalapi
 *
 * The IncomingRequestInterceptor is used in the WalletClient to intercept an
 * incoming (wrapped) request, enrich it with app metadata, and — for Tezos
 * payloads — normalize it to the flat request shape wallet apps consume, so
 * apps never see envelopes or version strings.
 */
export class IncomingRequestInterceptor {
  /**
   * The method that is called during the interception
   *
   * @param config
   */
  public static async intercept(config: IncomingRequestInterceptorOptions): Promise<void> {
    logger.log('INTERCEPTING REQUEST', config.message)

    // Negotiated wire: flat '2' arrivals are the legacy dialect (a v4.8.x
    // dApp) and already carry the shape wallet apps consume — they only need
    // enrichment. Wrapped arrivals (v3+) are unwrapped and, for Tezos
    // payloads, normalized to the same flat shapes. Anything else (absent or
    // malformed version — untrusted input) is dropped, never dispatched.
    if (usesWrappedMessages(config.message.version)) {
      await IncomingRequestInterceptor.handleWrappedMessage(config)
    } else if (config.message.version === '2') {
      await IncomingRequestInterceptor.handleFlatMessage(config)
    } else {
      logger.warn(
        'intercept',
        `Dropping message with unsupported version ${JSON.stringify(config.message.version)}`
      )
    }
  }

  // Legacy flat v2 dialect: enrich with app metadata and pass through — the
  // output shape is identical to the wrapped path's flat normalization, so
  // wallet apps cannot tell which dialect the dApp spoke.
  private static async handleFlatMessage(
    config: IncomingRequestInterceptorOptions
  ): Promise<void> {
    const { connectionInfo, appMetadataManager, interceptorCallback } = config
    const message = config.message as BeaconRequestMessage

    if (message.type === BeaconMessageType.PermissionRequest) {
      // TODO: Remove v1 compatibility in later version
      let dappMetadata = message.appMetadata
      const legacyBeaconId = (dappMetadata as { beaconId?: string }).beaconId
      if (legacyBeaconId && !dappMetadata.senderId) {
        dappMetadata = { ...dappMetadata, senderId: legacyBeaconId }
        delete (dappMetadata as { beaconId?: string }).beaconId
      }

      await appMetadataManager.addAppMetadata(dappMetadata)
      interceptorCallback({ ...message, appMetadata: dappMetadata }, connectionInfo)

      return
    }

    const appMetadata: AppMetadata = await IncomingRequestInterceptor.getAppMetadata(
      appMetadataManager,
      message.senderId
    )
    interceptorCallback(
      { appMetadata, ...message },
      connectionInfo
    )
  }

  private static async getAppMetadata(
    appMetadataManager: AppMetadataManager,
    senderId: string
  ): Promise<AppMetadata> {
    const appMetadata: AppMetadata | undefined = await appMetadataManager.getAppMetadata(senderId)
    if (!appMetadata) {
      throw new Error('AppMetadata not found')
    }

    return appMetadata
  }

  private static async handleWrappedMessage(
    config: IncomingRequestInterceptorOptions
  ): Promise<void> {
    const {
      message: msg,
      connectionInfo,
      appMetadataManager,
      interceptorCallback
    }: IncomingRequestInterceptorOptions = config

    const wrappedMessage = msg as unknown as
      | BeaconMessageWrapper<PermissionRequestV3>
      | BeaconMessageWrapper<BlockchainRequestV3>

    const v3Message: PermissionRequestV3 | BlockchainRequestV3 = wrappedMessage.message
    const isTezos = TEZOS_IDENTIFIERS.includes(v3Message.blockchainIdentifier)

    switch (v3Message.type) {
      case BeaconMessageType.PermissionRequest:
        {
          const appMetadata: AppMetadata = {
            ...v3Message.blockchainData.appMetadata,
            senderId: msg.senderId // Make sure we use the actual senderId, not what the dApp told us
          }
          await appMetadataManager.addAppMetadata(appMetadata)

          if (isTezos) {
            // Flat normalization: {type, id, senderId, version, appMetadata,
            // network, networks?, scopes} — exactly the pre-fork shape.
            const payload = { ...(v3Message.blockchainData as Record<string, unknown>) }
            delete payload.appMetadata
            // Envelope fields come after the spread: the dApp-supplied
            // blockchainData must not be able to replace them.
            const request = {
              ...payload,
              type: BeaconMessageType.PermissionRequest,
              id: wrappedMessage.id,
              version: wrappedMessage.version,
              senderId: wrappedMessage.senderId,
              appMetadata
            } as unknown as BeaconRequestOutputMessage
            interceptorCallback(request, connectionInfo)
          } else {
            interceptorCallback(
              wrappedMessage as unknown as BeaconRequestOutputMessage,
              connectionInfo
            )
          }
        }
        break
      case BeaconMessageType.BlockchainRequest:
        {
          const blockchainRequest = v3Message
          const payloadType = (blockchainRequest.blockchainData as { type?: unknown } | undefined)
            ?.type
          // Own keys of string types only: a plain lookup would also resolve
          // non-string keys (coerced) and inherited names like 'toString'.
          const flatType =
            typeof payloadType === 'string' &&
            Object.prototype.hasOwnProperty.call(TEZOS_PAYLOAD_TO_FLAT_TYPE, payloadType)
              ? TEZOS_PAYLOAD_TO_FLAT_TYPE[payloadType]
              : undefined

          if (isTezos && flatType) {
            const appMetadata: AppMetadata = await IncomingRequestInterceptor.getAppMetadata(
              appMetadataManager,
              msg.senderId
            )
            const payload = { ...(blockchainRequest.blockchainData as Record<string, unknown>) }
            delete payload.type
            delete payload.scope
            const request = {
              ...payload,
              type: flatType,
              id: wrappedMessage.id,
              version: wrappedMessage.version,
              senderId: wrappedMessage.senderId,
              appMetadata
            } as unknown as BeaconRequestOutputMessage
            interceptorCallback(request, connectionInfo)
          } else {
            interceptorCallback(
              { ...wrappedMessage } as unknown as BeaconRequestOutputMessage,
              connectionInfo
            )
          }
        }
        break

      default:
        logger.log('intercept', 'Message not handled')
        assertNever(v3Message)
    }
  }
}
