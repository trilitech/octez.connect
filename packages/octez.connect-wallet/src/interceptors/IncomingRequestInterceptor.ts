import {
  BeaconRequestOutputMessage,
  BeaconMessageType,
  AppMetadata,
  ConnectionContext,
  BeaconMessageWrapper,
  BlockchainRequestV3,
  PermissionRequestV3,
  BeaconBaseMessage
} from '@tezos-x/octez.connect-types'
import { AppMetadataManager, Logger, usesWrappedMessages, assertNever } from '@tezos-x/octez.connect-core'

const logger = new Logger('IncomingRequestInterceptor')

interface IncomingRequestInterceptorOptions {
  message: BeaconMessageWrapper<BeaconBaseMessage>
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

    // Wrapped-only wire: WalletClient tombstones flat v2 traffic before it
    // reaches this interceptor, so a non-wrapped version here is stray or
    // hostile input — drop it rather than crash the pipeline.
    if (!usesWrappedMessages(config.message.version)) {
      logger.warn(
        'intercept',
        `Dropping non-wrapped message (version ${JSON.stringify(config.message.version)})`
      )

      return
    }

    await IncomingRequestInterceptor.handleWrappedMessage(config)
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
            const request = {
              type: BeaconMessageType.PermissionRequest,
              id: wrappedMessage.id,
              version: wrappedMessage.version,
              senderId: wrappedMessage.senderId,
              appMetadata,
              ...payload
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
          const payloadType = (blockchainRequest.blockchainData as { type?: string }).type
          const flatType = payloadType ? TEZOS_PAYLOAD_TO_FLAT_TYPE[payloadType] : undefined

          if (isTezos && flatType) {
            const appMetadata: AppMetadata = await IncomingRequestInterceptor.getAppMetadata(
              appMetadataManager,
              msg.senderId
            )
            const payload = { ...(blockchainRequest.blockchainData as Record<string, unknown>) }
            delete payload.type
            delete payload.scope
            const request = {
              type: flatType,
              id: wrappedMessage.id,
              version: wrappedMessage.version,
              senderId: wrappedMessage.senderId,
              appMetadata,
              ...payload
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
