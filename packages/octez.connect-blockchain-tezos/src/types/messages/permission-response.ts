import {
  AppMetadata,
  Network,
  Notification,
  PermissionResponseAccounts,
  PermissionResponseV3,
  PermissionScope,
  Threshold
} from '@tezos-x/octez.connect-types'

/**
 * Wrapped Tezos permission response payload. Formalizes the shape that both
 * the wallet-side interceptor emits and `getAccountInfosFromPermissionResponse`
 * parses: the legacy single-account fields (`publicKey`/`address`/`network`)
 * and the v4 multi-network `accounts` fanout keyed by CAIP-2 chain id.
 */
export interface TezosPermissionResponse extends PermissionResponseV3<'tezos'> {
  blockchainData: {
    appMetadata: AppMetadata
    scopes: PermissionScope[]
    publicKey?: string
    address?: string
    /** Legacy single-network echo (v3 envelopes). */
    network?: Network
    /** v4 multi-network fanout, keyed by CAIP-2 chain id. */
    accounts?: PermissionResponseAccounts
    walletType?: 'implicit' | 'abstracted_account'
    verificationType?: 'proof_of_event'
    threshold?: Threshold
    notification?: Notification
  }
}

/** Payload shape shared by permission responses and change-account requests. */
export type TezosPermissionResponseBlockchainData = TezosPermissionResponse['blockchainData']
