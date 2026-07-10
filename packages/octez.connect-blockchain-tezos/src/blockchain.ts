import {
  Blockchain,
  BlockchainMessage,
  PermissionResponseV3,
  ResponseInput,
  App,
  BeaconMessageType,
  DesktopApp,
  ExtensionApp,
  WebApp,
  Network,
  NetworkType,
  PermissionScope
} from '@tezos-x/octez.connect-types'
import {
  getAccountIdentifier,
  isMultiNetworkVersion,
  isValidTezosCaip2,
  Logger,
  networkFromTezosCaip2,
  normalizeTezosCaip2
} from '@tezos-x/octez.connect-core'
import {
  CONTRACT_PREFIX,
  getAddressFromPublicKey,
  isValidAddress,
  loadWalletLists,
  prefixPublicKey
} from '@tezos-x/octez.connect-utils'
import bundledTezosRegistry from '@tezos-x/octez.connect-ui/data/tezos.json'
import { TezosMessageType } from './types/message-type'
import {
  TezosBlockchainRequest,
  TezosPermissionResponseBlockchainData
} from './types/messages'

const { desktopList, extensionList, iOSList, webList } = loadWalletLists(bundledTezosRegistry)

const logger = new Logger('TezosBlockchain')

export class TezosBlockchain implements Blockchain {
  // CAIP-2 namespace. Must match the `blockchainIdentifier` field on the
  // wire (PermissionRequestV3/PermissionResponseV3 — see
  // packages/octez.connect-types/src/types/beaconV3/PermissionRequest.ts)
  // and the Substrate handler's `'substrate'` convention. Previously this was
  // the coin ticker `'xtz'`, which silently broke every registry lookup
  // keyed on the wire identifier (the wallet's OutgoingResponseInterceptor
  // and the dApp's v4 fanout parser both go through `blockchains.get`).
  public readonly identifier: string = 'tezos'
  // The registry also resolves the pre-rename ticker key, so peers and
  // integrations still addressing the handler as 'xtz' keep working.
  public readonly legacyIdentifiers: readonly string[] = ['xtz']

  async validateRequest(input: BlockchainMessage): Promise<void> {
    if (input.type === BeaconMessageType.PermissionRequest) {
      // Permission requests carry appMetadata/scopes injected by the client;
      // nothing chain-specific to validate before send.
      return
    }

    const data = (input as TezosBlockchainRequest).blockchainData
    if (!data || typeof data !== 'object') {
      throw new Error('Tezos request is missing blockchainData')
    }

    const requireFields = (fields: [string, unknown][]): void => {
      for (const [name, value] of fields) {
        if (value === undefined || value === null || value === '') {
          throw new Error(`Tezos ${data.type} is missing required field "${name}"`)
        }
      }
    }

    switch (data.type) {
      case TezosMessageType.operation_request:
        requireFields([
          ['network', data.network],
          ['operationDetails', data.operationDetails],
          ['sourceAddress', data.sourceAddress]
        ])
        if (!Array.isArray(data.operationDetails) || data.operationDetails.length === 0) {
          throw new Error('Tezos operation_request requires a non-empty operationDetails array')
        }

        return
      case TezosMessageType.sign_payload_request:
        requireFields([
          ['signingType', data.signingType],
          ['payload', data.payload]
        ])

        return
      case TezosMessageType.broadcast_request:
        requireFields([
          ['network', data.network],
          ['signedTransaction', data.signedTransaction]
        ])

        return
      case TezosMessageType.proof_of_event_challenge_request:
      case TezosMessageType.simulated_proof_of_event_challenge_request:
        requireFields([
          ['contractAddress', data.contractAddress],
          ['payload', data.payload]
        ])

        return
      default:
        throw new Error(
          `Unknown Tezos request type "${(data as { type?: unknown }).type}" — the peer speaks a newer Tezos dialect than this SDK`
        )
    }
  }

  /**
   * Wallet-side validation of an outgoing response before it is wrapped and
   * sent. Ports the flat-v2 pipeline's permission-response checks: a usable
   * publicKey/address must be present, addresses must parse, and abstracted
   * accounts must live at a contract address.
   */
  public async validateResponse(message: BlockchainMessage): Promise<void> {
    if (message.type !== BeaconMessageType.PermissionResponse) {
      return
    }

    const data = (message.blockchainData ?? {}) as TezosPermissionResponseBlockchainData
    const fanoutEntries =
      data.accounts && typeof data.accounts === 'object' && !Array.isArray(data.accounts)
        ? Object.values(data.accounts)
        : []

    const candidates: { publicKey?: string; address?: string }[] = fanoutEntries.length
      ? fanoutEntries.map((raw) => ({
          publicKey: raw?.publicKey ?? data.publicKey,
          address: raw?.address ?? data.address
        }))
      : [{ publicKey: data.publicKey, address: data.address }]

    for (const candidate of candidates) {
      const { publicKey, address: candidateAddress } = candidate
      if (!publicKey && !candidateAddress) {
        throw new Error('PublicKey or Address must be defined')
      }

      const address =
        candidateAddress ?? (await getAddressFromPublicKey(prefixPublicKey(publicKey as string)))

      if (!isValidAddress(address)) {
        throw new Error(`Invalid address: "${address}"`)
      }

      if (data.walletType === 'abstracted_account' && address.substring(0, 3) !== CONTRACT_PREFIX) {
        throw new Error(
          `Invalid abstracted account address "${address}", it should be a ${CONTRACT_PREFIX} address`
        )
      }
    }
  }

  async handleResponse(input: ResponseInput): Promise<void> {
    // Response-side effects are handled by the client; nothing to do here.
    if (input) {
      return
    }
  }

  async getWalletLists(): Promise<{
    extensionList: ExtensionApp[]
    desktopList: DesktopApp[]
    webList: WebApp[]
    iOSList: App[]
  }> {
    return {
      extensionList: extensionList,
      desktopList: desktopList,
      webList: webList,
      iOSList: iOSList
    }
  }

  async getAccountInfosFromPermissionResponse(
    permissionResponse: PermissionResponseV3<'tezos'>,
    peerVersion: string
  ): Promise<{
    accountId: string
    address: string
    publicKey: string
    network?: Network
    scopes: PermissionScope[]
  }[]> {
    const data = (permissionResponse.blockchainData ?? {}) as TezosPermissionResponseBlockchainData
    const scopes = data.scopes ?? []
    // Canonicalize wallet-supplied keys once at ingest so every derived
    // address/identifier downstream (dApp account records AND wallet-side
    // permission records) agrees. An entry with only a publicKey gets its
    // address derived here — never stored with an empty address.
    const wirePublicKey: string = data.publicKey ? prefixPublicKey(data.publicKey) : ''
    const wireAddress: string =
      data.address ?? (wirePublicKey ? await getAddressFromPublicKey(wirePublicKey) : '')

    const isV4Session = isMultiNetworkVersion(peerVersion)
    const hasAccountsFanout =
      data.accounts && typeof data.accounts === 'object' && !Array.isArray(data.accounts)

    if (isV4Session && hasAccountsFanout && data.accounts) {
      // Reject malformed chain-id keys at ingest: a normalized key that is not
      // a valid Tezos CAIP-2 string would persist an account that no operation
      // request could ever target (resolveOperationNetwork requires CAIP-2),
      // i.e. a permanently-unusable account. Drop and log it instead.
      const validEntries = Object.entries(data.accounts).filter(([chainId]) => {
        const ok = isValidTezosCaip2(normalizeTezosCaip2(chainId))
        if (!ok) {
          logger.warn(
            'getAccountInfosFromPermissionResponse',
            `Dropping account under malformed CAIP-2 chain id "${chainId}"`
          )
        }

        return ok
      })

      return Promise.all(
        validEntries.map(async ([chainId, raw]) => {
          const normalizedChainId = normalizeTezosCaip2(chainId)
          const publicKey: string = raw?.publicKey ? prefixPublicKey(raw.publicKey) : wirePublicKey
          const address: string =
            raw?.address ?? (raw?.publicKey ? await getAddressFromPublicKey(publicKey) : wireAddress)
          const network = networkFromTezosCaip2(normalizedChainId, {
            name: raw?.name,
            rpcUrl: raw?.rpcUrl
          })

          return {
            accountId: await getAccountIdentifier(address, network),
            address,
            publicKey,
            network,
            scopes
          }
        })
      )
    }

    const legacyNetwork: Network | undefined = data.network
    const fallbackNetwork: Network = legacyNetwork ?? {
      type: NetworkType.CUSTOM,
      name: 'tezos'
    }

    return [
      {
        accountId: await getAccountIdentifier(wireAddress, fallbackNetwork),
        address: wireAddress,
        publicKey: wirePublicKey,
        network: legacyNetwork,
        scopes
      }
    ]
  }
}
