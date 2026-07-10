import { AccountInfo } from '../AccountInfo'
import { AppMetadata } from '../beacon/AppMetadata'
import { BeaconErrorType } from '../BeaconErrorType'
import { BeaconMessageType } from '../beacon/BeaconMessageType'
import { ConnectionContext } from '../ConnectionContext'
import { WalletInfo } from '../WalletInfo'
import { ExtensionApp, DesktopApp, WebApp, App } from '../ui'
import { Network } from '../beacon/Network'
import { PermissionScope } from '../beacon/PermissionScope'

export interface ResponseInput {
  request: BlockchainMessage
  account: AccountInfo
  output: BeaconMessageWrapper<BeaconBaseMessage>
  blockExplorer: any
  connectionContext: ConnectionContext
  walletInfo: WalletInfo
}

export interface Blockchain {
  readonly identifier: string
  /**
   * Identifiers this blockchain was previously registered/addressed under.
   * The client registers the handler under these keys too, so wire messages
   * and registry lookups from integrations built against an older identifier
   * (e.g. Tezos' former 'xtz') keep resolving.
   */
  readonly legacyIdentifiers?: readonly string[]
  validateRequest(input: BlockchainMessage): Promise<void>
  /**
   * Wallet-side validation of an outgoing response payload before it is
   * wrapped and sent (e.g. Tezos rejects permission responses without a
   * usable address/publicKey, invalid addresses, and abstracted accounts
   * whose address is not a contract). Throwing aborts the send.
   */
  validateResponse?(message: BlockchainMessage): Promise<void>
  handleResponse(input: ResponseInput): Promise<void>

  getWalletLists(): Promise<{
    extensionList: ExtensionApp[]
    desktopList: DesktopApp[]
    webList: WebApp[]
    iOSList: App[]
  }>

  /**
   * Parse the wallet's permission response into one or more account records.
   * Implementations branch on `peerVersion` to pick between the multi-network
   * fanout (v4: CAIP-2-keyed `blockchainData.accounts` → N records) and the
   * legacy shape (single record from `blockchainData.publicKey`/`.address`).
   * Field-presence detection of v4 fields as a routing key is forbidden.
   *
   * @param peerVersion decimal-integer peer.version sourced from PeerManager.
   */
  getAccountInfosFromPermissionResponse(
    permissionResponse: PermissionResponseV3,
    peerVersion: string
  ): Promise<{
    accountId: string;
    address: string;
    publicKey: string;
    network?: Network;
    scopes: PermissionScope[];
  }[]>
}

export interface BeaconMessageWrapper<T extends BeaconBaseMessage> {
  id: string // ID of the message. The same ID is used in the request and response
  version: string
  senderId: string // ID of the sender. This is used to identify the
  message: T
}

export interface BeaconBaseMessage {
  type: unknown
}

export interface BlockchainMessage<T extends string = string> {
  blockchainIdentifier: T
  type: unknown
  blockchainData: unknown
}

export interface PermissionRequestV3<T extends string = string> extends BlockchainMessage<T> {
  blockchainIdentifier: T
  type: BeaconMessageType.PermissionRequest
  blockchainData: {
    appMetadata: AppMetadata // Some additional information about the DApp
    scopes: string[]
  }
}
export interface PermissionResponseV3<T extends string = string> extends BlockchainMessage<T> {
  blockchainIdentifier: T
  type: BeaconMessageType.PermissionResponse
  blockchainData: {
    appMetadata: AppMetadata // Some additional information about the Wallet
    scopes: string[] // Permissions that have been granted for this specific address / account
  }
}

export interface BlockchainRequestV3<T extends string = string> extends BlockchainMessage<T> {
  blockchainIdentifier: T
  type: BeaconMessageType.BlockchainRequest
  accountId: string
  blockchainData: {
    type: string
    scope: string
  }
}

export interface BlockchainResponseV3<T extends string = string> extends BlockchainMessage<T> {
  blockchainIdentifier: T
  type: BeaconMessageType.BlockchainResponse
  // accountId is not present, because it can be fetched from the request
  blockchainData: unknown
}

// Error (Blockchain)
export interface BlockchainErrorResponse<T extends string = string> extends BlockchainMessage<T> {
  blockchainIdentifier: T
  type: BeaconMessageType.Error
  error: {
    type: BeaconErrorType
    data?: unknown
  }
  description?: string
}

/**
 * Wallet-initiated account switch, wrapped form. The payload is
 * shape-identical to the chain's permission-response `blockchainData`, so
 * receivers materialize accounts through the same registry parser as a
 * permission response.
 */
export interface ChangeAccountRequestV3<T extends string = string> extends BlockchainMessage<T> {
  blockchainIdentifier: T
  type: BeaconMessageType.ChangeAccountRequest
  blockchainData: unknown
}

// Acknowledge
export interface AcknowledgeMessage extends BeaconBaseMessage {
  type: BeaconMessageType.Acknowledge
}

// Disconnect
export interface DisconnectMessage extends BeaconBaseMessage {
  type: BeaconMessageType.Disconnect
}
