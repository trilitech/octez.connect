/**
 * Per-chain discriminator carried in `blockchainData.type` of wrapped Tezos
 * messages. Values deliberately reuse the pre-fork flat `BeaconMessageType`
 * wire strings so wallet UIs migrating from the flat v2 protocol keep their
 * string switches.
 */
export enum TezosMessageType {
  operation_request = 'operation_request',
  operation_response = 'operation_response',
  sign_payload_request = 'sign_payload_request',
  sign_payload_response = 'sign_payload_response',
  broadcast_request = 'broadcast_request',
  broadcast_response = 'broadcast_response',
  proof_of_event_challenge_request = 'proof_of_event_challenge_request',
  proof_of_event_challenge_response = 'proof_of_event_challenge_response',
  simulated_proof_of_event_challenge_request = 'simulated_proof_of_event_challenge_request',
  simulated_proof_of_event_challenge_response = 'simulated_proof_of_event_challenge_response'
}
