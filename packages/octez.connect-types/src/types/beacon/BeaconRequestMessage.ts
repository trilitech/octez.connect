import {
  PermissionRequest,
  OperationRequest,
  SignPayloadRequest,
  BroadcastRequest,
  ProofOfEventChallengeRequest,
  SimulatedProofOfEventChallengeRequest
  // EncryptPayloadRequest
} from '@tezos-x/octez.connect-types'

/**
 * @internalapi
 */
export type BeaconRequestMessage =
  | PermissionRequest
  | OperationRequest
  | SignPayloadRequest
  // | EncryptPayloadRequest
  | BroadcastRequest
  | ProofOfEventChallengeRequest
  | SimulatedProofOfEventChallengeRequest
