import { PermissionResponse } from './messages/PermissionResponse'
import { PermissionRequest } from './messages/PermissionRequest'
import { OperationRequest } from './messages/OperationRequest'
import { OperationResponse } from './messages/OperationResponse'
import { SignPayloadRequest } from './messages/SignPayloadRequest'
import { SignPayloadResponse } from './messages/SignPayloadResponse'
import { BroadcastRequest } from './messages/BroadcastRequest'
import { BroadcastResponse } from './messages/BroadcastResponse'
import { AcknowledgeResponse } from './messages/AcknowledgeResponse'
import { DisconnectMessage } from './messages/DisconnectMessage'
import { ErrorResponse } from './messages/ErrorResponse'
import { ProofOfEventChallengeRequest } from './messages/ProofOfEventChallengeRequest'
import { ProofOfEventChallengeResponse } from './messages/ProofOfEventChallengeResponse'
import { SimulatedProofOfEventChallengeRequest } from './messages/SimulatedProofOfEventChallengeRequest'
import { SimulatedProofOfEventChallengeResponse } from './messages/SimulatedProofOfEventChallengeResponse'
import { ChangeAccountRequest } from './messages/ChangeAccountRequest'
// EncryptPayloadRequest,
// EncryptPayloadResponse,

/**
 * @internalapi
 *
 * The flat message shapes. Since the protocol hard fork these are NOT wire
 * formats — the wire is wrapped-v3/v4 only (`BeaconMessageWrapper`). They
 * remain the public API surface: dApp `request*` inputs/outputs and the
 * wallet's `newMessageCallback`/`respond` payloads are normalized to and
 * from these shapes at the SDK boundary, so integrator code is unchanged.
 * The single wire use left is the wallet's v2 tombstone (`ErrorResponse`).
 */
export type BeaconMessage =
  | PermissionRequest
  | PermissionResponse
  | ProofOfEventChallengeRequest
  | ProofOfEventChallengeResponse
  | SimulatedProofOfEventChallengeRequest
  | SimulatedProofOfEventChallengeResponse
  | OperationRequest
  | OperationResponse
  | SignPayloadRequest
  | SignPayloadResponse
  // | EncryptPayloadRequest
  // | EncryptPayloadResponse
  | BroadcastRequest
  | BroadcastResponse
  | AcknowledgeResponse
  | DisconnectMessage
  | ErrorResponse
  | ChangeAccountRequest
