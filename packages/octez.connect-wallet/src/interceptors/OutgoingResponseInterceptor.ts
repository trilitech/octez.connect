import {
  AppMetadataManager,
  BEACON_VERSION,
  Logger,
  networkFromTezosCaip2,
  normalizeTezosCaip2,
  PermissionManager,
  assertNever,
  wrapBeaconMessage
} from '@tezos-x/octez.connect-core'
import {
  BeaconMessage,
  BeaconResponseInputMessage,
  BeaconMessageType,
  PermissionInfo,
  AppMetadata,
  BeaconErrorType,
  BeaconMessageWrapper,
  BlockchainErrorResponse,
  BlockchainResponseV3,
  PermissionResponseV3,
  BeaconBaseMessage,
  AcknowledgeMessage,
  Blockchain,
  Network,
  NetworkType,
  RequestPermissionNetwork
} from '@tezos-x/octez.connect-types'

interface OutgoingResponseInterceptorOptions {
  senderId: string
  request: BeaconMessageWrapper<BeaconBaseMessage>
  message: BeaconResponseInputMessage
  ownAppMetadata: AppMetadata
  permissionManager: PermissionManager
  appMetadataManager: AppMetadataManager
  interceptorCallback: (message: BeaconMessage) => void
  blockchains: Map<string, Blockchain>
}

const logger = new Logger('OutgoingResponseInterceptor')

// The wallet app's `respond()` input is either one of the flat convenience
// shapes (unchanged public API — Tezos wallets never see wrapped envelopes)
// or an already-wrapped message from the generic chain-agnostic API.
const isWrappedInput = (
  message: BeaconResponseInputMessage
): message is BeaconResponseInputMessage & BeaconMessageWrapper<BeaconBaseMessage> =>
  (message as { message?: unknown }).message !== undefined

// Maps each flat Tezos response type to its wrapped blockchainData
// discriminator (the pre-fork flat wire strings, kept verbatim).
const FLAT_RESPONSE_PAYLOAD_TYPES: Partial<Record<BeaconMessageType, string>> = {
  [BeaconMessageType.OperationResponse]: 'operation_response',
  [BeaconMessageType.SignPayloadResponse]: 'sign_payload_response',
  [BeaconMessageType.BroadcastResponse]: 'broadcast_response',
  [BeaconMessageType.ProofOfEventChallengeResponse]: 'proof_of_event_challenge_response',
  [BeaconMessageType.SimulatedProofOfEventChallengeResponse]:
    'simulated_proof_of_event_challenge_response'
}

/**
 * @internalapi
 *
 * The OutgoingResponseInterceptor is used in the WalletClient to intercept an
 * outgoing response, wrap it onto the (wrapped-only) wire, validate it via the
 * blockchain registry, and persist granted permissions.
 */
export class OutgoingResponseInterceptor {
  public static async intercept(config: OutgoingResponseInterceptorOptions): Promise<void> {
    if (isWrappedInput(config.message)) {
      await OutgoingResponseInterceptor.handleWrappedInput(config)
    } else {
      await OutgoingResponseInterceptor.handleFlatInput(config)
    }
  }

  // Generic chain-agnostic wallet API: the app responds with an
  // already-wrapped message (substrate flow, examples/wallet-v3.html).
  private static async handleWrappedInput(
    config: OutgoingResponseInterceptorOptions
  ): Promise<void> {
    const { senderId, request, message: msg, ownAppMetadata, interceptorCallback, blockchains } =
      config

    const wrappedMessage = msg as unknown as
      | BeaconMessageWrapper<PermissionResponseV3>
      | BeaconMessageWrapper<BlockchainResponseV3>

    const v3Message: PermissionResponseV3 | BlockchainResponseV3 = wrappedMessage.message

    // The pre-fork escape hatch that leaked flat Acknowledge/Error messages
    // through unwrapped is gone: those now arrive as flat inputs and are
    // wrapped in handleFlatInput.
    if (v3Message === undefined) {
      throw new Error('Malformed wrapped response: missing message payload')
    }

    const blockchain = OutgoingResponseInterceptor.requireBlockchain(
      blockchains,
      v3Message.blockchainIdentifier
    )

    switch (v3Message.type) {
      case BeaconMessageType.PermissionResponse:
        {
          const response: BeaconMessageWrapper<PermissionResponseV3> = wrapBeaconMessage(
            { id: wrappedMessage.id, version: request.version, senderId },
            {
              blockchainIdentifier: v3Message.blockchainIdentifier,
              type: BeaconMessageType.PermissionResponse,
              blockchainData: {
                ...(v3Message.blockchainData as Record<string, unknown>),
                appMetadata: ownAppMetadata
              } as unknown as PermissionResponseV3['blockchainData']
            }
          )

          await OutgoingResponseInterceptor.persistGrantedPermissions(
            config,
            blockchain,
            response
          )

          interceptorCallback(response as unknown as BeaconMessage)
        }
        break
      case BeaconMessageType.BlockchainResponse:
        {
          const response: BeaconMessageWrapper<BlockchainResponseV3> = wrapBeaconMessage(
            { id: wrappedMessage.id, version: request.version, senderId },
            {
              blockchainIdentifier: v3Message.blockchainIdentifier,
              type: BeaconMessageType.BlockchainResponse,
              blockchainData: {
                ...(wrappedMessage.message.blockchainData as Record<string, unknown>)
              }
            }
          )

          await blockchain.validateResponse?.(response.message)
          interceptorCallback(response as unknown as BeaconMessage)
        }
        break

      default:
        logger.log('intercept', 'Message not handled')
        assertNever(v3Message)
    }
  }

  // Flat convenience inputs: the unchanged wallet-app API. Each flat response
  // is wrapped onto the wire here; the app never handles envelopes.
  private static async handleFlatInput(config: OutgoingResponseInterceptorOptions): Promise<void> {
    const { senderId, request, message, interceptorCallback, blockchains, ownAppMetadata } = config

    const requestInner = request.message as
      | { blockchainIdentifier?: string; blockchainData?: Record<string, unknown> }
      | undefined
    const blockchainIdentifier = requestInner?.blockchainIdentifier ?? 'tezos'
    const envelope = { id: message.id, version: request.version, senderId }

    switch (message.type) {
      case BeaconMessageType.Error: {
        const response: BeaconMessageWrapper<BlockchainErrorResponse> = wrapBeaconMessage(
          envelope,
          {
            blockchainIdentifier,
            type: BeaconMessageType.Error,
            blockchainData: undefined,
            error: { type: message.errorType },
            description: (message as { description?: string }).description
          }
        )
        if (message.errorType === BeaconErrorType.TRANSACTION_INVALID_ERROR && message.errorData) {
          const errorData = message.errorData
          // Check if error data is in correct format
          if (
            Array.isArray(errorData) &&
            errorData.every((item) => Boolean(item.kind) && Boolean(item.id))
          ) {
            response.message.error.data = message.errorData
          } else {
            logger.warn(
              'ErrorData provided is not in correct format. It needs to be an array of RPC errors. It will not be included in the message sent to the dApp'
            )
          }
        }
        interceptorCallback(response as unknown as BeaconMessage)
        break
      }
      case BeaconMessageType.Acknowledge: {
        const response: BeaconMessageWrapper<AcknowledgeMessage> = wrapBeaconMessage(envelope, {
          type: BeaconMessageType.Acknowledge
        })
        interceptorCallback(response as unknown as BeaconMessage)
        break
      }
      case BeaconMessageType.PermissionResponse: {
        const blockchain = OutgoingResponseInterceptor.requireBlockchain(
          blockchains,
          blockchainIdentifier
        )
        const flat = message as Record<string, unknown>
        const response: BeaconMessageWrapper<PermissionResponseV3> = wrapBeaconMessage(
          envelope,
          {
            blockchainIdentifier,
            type: BeaconMessageType.PermissionResponse,
            blockchainData: {
              appMetadata: ownAppMetadata,
              scopes: flat.scopes,
              publicKey: flat.publicKey,
              address: flat.address,
              network: flat.network,
              accounts: flat.accounts,
              walletType: flat.walletType,
              verificationType: flat.verificationType,
              threshold: flat.threshold,
              notification: flat.notification
            } as unknown as PermissionResponseV3['blockchainData']
          }
        )

        await OutgoingResponseInterceptor.persistGrantedPermissions(config, blockchain, response)

        interceptorCallback(response as unknown as BeaconMessage)
        break
      }
      case BeaconMessageType.OperationResponse:
      case BeaconMessageType.SignPayloadResponse:
      case BeaconMessageType.BroadcastResponse:
      case BeaconMessageType.ProofOfEventChallengeResponse:
      case BeaconMessageType.SimulatedProofOfEventChallengeResponse: {
        const payloadType = FLAT_RESPONSE_PAYLOAD_TYPES[message.type]
        const payload = { ...(message as Record<string, unknown>) }
        delete payload.id
        delete payload.type
        const response: BeaconMessageWrapper<BlockchainResponseV3> = wrapBeaconMessage(
          envelope,
          {
            blockchainIdentifier,
            type: BeaconMessageType.BlockchainResponse,
            blockchainData: {
              type: payloadType,
              ...payload
            }
          }
        )
        interceptorCallback(response as unknown as BeaconMessage)
        break
      }
      default:
        logger.log('intercept', 'Message not handled')
        assertNever(message)
    }
  }

  private static requireBlockchain(
    blockchains: Map<string, Blockchain>,
    identifier: string
  ): Blockchain {
    const blockchain = blockchains.get(identifier)
    if (blockchain === undefined) {
      throw new Error(`Blockchain "${identifier}" not supported`)
    }

    return blockchain
  }

  // Shared permission persistence for both input styles: validate the
  // response via the chain handler (ported flat-v2 address/publicKey/
  // abstracted-account checks), parse it into per-network accounts, and
  // persist all grants in ONE batched write (N racing addPermission calls
  // used to lose updates on the shared permission list).
  private static async persistGrantedPermissions(
    config: OutgoingResponseInterceptorOptions,
    blockchain: Blockchain,
    response: BeaconMessageWrapper<PermissionResponseV3>
  ): Promise<void> {
    const { request, permissionManager, appMetadataManager } = config

    await blockchain.validateResponse?.(response.message)

    const appMetadata = await appMetadataManager.getAppMetadata(request.senderId)
    if (!appMetadata) {
      throw new Error('AppMetadata not found')
    }

    // This wallet just served the response, so the routing key for the
    // parser is its own BEACON_VERSION.
    const accountInfos = await blockchain.getAccountInfosFromPermissionResponse(
      response.message,
      BEACON_VERSION
    )

    const permissions: PermissionInfo[] = accountInfos.map((accountInfo) => ({
      accountIdentifier: accountInfo.accountId,
      senderId: request.senderId,
      appMetadata,
      website: '',
      address: accountInfo.address,
      publicKey: accountInfo.publicKey,
      network:
        accountInfo.network ?? OutgoingResponseInterceptor.networkFromRequest(request),
      scopes: accountInfo.scopes,
      connectedAt: new Date().getTime()
    }))

    await permissionManager.addPermissions(permissions)
  }

  // Network echo for permission records whose parser entry carries no
  // network: prefer what the dApp actually requested over a blind MAINNET
  // default (the pre-fork behavior, kept only as the logged last resort).
  private static networkFromRequest(request: BeaconMessageWrapper<BeaconBaseMessage>): Network {
    const data = (request.message as { blockchainData?: Record<string, unknown> } | undefined)
      ?.blockchainData
    const requestedNetwork = data?.network
    if (requestedNetwork && typeof requestedNetwork === 'object') {
      return requestedNetwork as Network
    }

    const requestedNetworks = data?.networks
    if (Array.isArray(requestedNetworks) && requestedNetworks.length > 0) {
      const first = requestedNetworks[0] as RequestPermissionNetwork
      if (first?.chainId) {
        return networkFromTezosCaip2(normalizeTezosCaip2(first.chainId), { name: first.name })
      }
    }

    logger.warn(
      'networkFromRequest',
      'Permission request carried no network; defaulting the stored permission to MAINNET'
    )

    return { type: NetworkType.MAINNET }
  }
}
