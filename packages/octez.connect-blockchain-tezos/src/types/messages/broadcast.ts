import { BlockchainRequestV3, BlockchainResponseV3, Network } from '@tezos-x/octez.connect-types'
import { TezosMessageType } from '../message-type'

/**
 * Scope string for requests that are always allowed regardless of the
 * granted permission scopes (mirrors the pre-fork `checkPermissions`
 * semantics for broadcast and proof-of-event requests).
 */
export const TEZOS_BROADCAST_SCOPE = 'broadcast' as const

export interface TezosBroadcastRequest extends BlockchainRequestV3<'tezos'> {
  blockchainData: {
    type: TezosMessageType.broadcast_request
    scope: typeof TEZOS_BROADCAST_SCOPE
    /** `Network` object toward v3 peers; CAIP-2 string on v4 envelopes. */
    network: Network | string
    signedTransaction: string
  }
}

export interface TezosBroadcastResponse extends BlockchainResponseV3<'tezos'> {
  blockchainData: {
    type: TezosMessageType.broadcast_response
    transactionHash: string
  }
}
