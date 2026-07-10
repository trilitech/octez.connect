import { TezosPermissionRequest } from './permission-request'
import { TezosPermissionResponse } from './permission-response'
import { TezosOperationRequest, TezosOperationResponse } from './operation'
import { TezosSignPayloadRequest, TezosSignPayloadResponse } from './sign-payload'
import { TezosBroadcastRequest, TezosBroadcastResponse } from './broadcast'
import {
  TezosProofOfEventChallengeRequest,
  TezosProofOfEventChallengeResponse,
  TezosSimulatedProofOfEventChallengeRequest,
  TezosSimulatedProofOfEventChallengeResponse
} from './proof-of-event'
import { TezosChangeAccountRequest } from './change-account'

export * from './permission-request'
export * from './permission-response'
export * from './operation'
export * from './sign-payload'
export * from './broadcast'
export * from './proof-of-event'
export * from './change-account'

/** Every wrapped Tezos blockchain-request payload, discriminated by `blockchainData.type`. */
export type TezosBlockchainRequest =
  | TezosOperationRequest
  | TezosSignPayloadRequest
  | TezosBroadcastRequest
  | TezosProofOfEventChallengeRequest
  | TezosSimulatedProofOfEventChallengeRequest

/** Every wrapped Tezos blockchain-response payload, discriminated by `blockchainData.type`. */
export type TezosBlockchainResponse =
  | TezosOperationResponse
  | TezosSignPayloadResponse
  | TezosBroadcastResponse
  | TezosProofOfEventChallengeResponse
  | TezosSimulatedProofOfEventChallengeResponse

/** Every wrapped Tezos message the dApp can send. */
export type TezosRequest = TezosPermissionRequest | TezosBlockchainRequest

/** Every wrapped Tezos message the wallet can send back. */
export type TezosResponse =
  | TezosPermissionResponse
  | TezosBlockchainResponse
  | TezosChangeAccountRequest
