import {
  AppMetadata,
  Network,
  PermissionRequestV3,
  PermissionScope,
  RequestPermissionNetwork
} from '@tezos-x/octez.connect-types'

/**
 * Wrapped Tezos permission request payload. The multi-network `networks`
 * field is only serialized on v4 envelopes; a v3 peer receives the legacy
 * single `network` only.
 */
export interface TezosPermissionRequest extends PermissionRequestV3<'tezos'> {
  blockchainData: {
    appMetadata: AppMetadata
    scopes: PermissionScope[]
    /** Legacy single-network request (v3 envelopes). */
    network?: Network
    /** v4 multi-network request; the wallet answers with an `accounts` fanout. */
    networks?: RequestPermissionNetwork[]
  }
}
