import { BlockchainRequestV3, BlockchainResponseV3 } from '@tezos-x/octez.connect-types'
import { TezosMessageType } from '../message-type'

/** Always-allowed scope, see TEZOS_BROADCAST_SCOPE. */
export const TEZOS_PROOF_OF_EVENT_SCOPE = 'proof_of_event' as const

export interface TezosProofOfEventChallengeRequest extends BlockchainRequestV3<'tezos'> {
  blockchainData: {
    type: TezosMessageType.proof_of_event_challenge_request
    scope: typeof TEZOS_PROOF_OF_EVENT_SCOPE
    contractAddress: string
    payload: string
  }
}

export interface TezosProofOfEventChallengeResponse extends BlockchainResponseV3<'tezos'> {
  blockchainData: {
    type: TezosMessageType.proof_of_event_challenge_response
    isAccepted: boolean
    payloadHash: string
  }
}

export interface TezosSimulatedProofOfEventChallengeRequest
  extends BlockchainRequestV3<'tezos'> {
  blockchainData: {
    type: TezosMessageType.simulated_proof_of_event_challenge_request
    scope: typeof TEZOS_PROOF_OF_EVENT_SCOPE
    contractAddress: string
    payload: string
  }
}

export interface TezosSimulatedProofOfEventChallengeResponse
  extends BlockchainResponseV3<'tezos'> {
  blockchainData: {
    type: TezosMessageType.simulated_proof_of_event_challenge_response
    /** Base64 encoded json. */
    operationsList: string
    errorMessage: string
  }
}
