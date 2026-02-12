import { BeaconBaseMessage, BeaconMessageType } from '@tezos-x/octez.connect-types'

export interface SimulatedProofOfEventChallengeResponse extends BeaconBaseMessage {
  type: BeaconMessageType.SimulatedProofOfEventChallengeResponse
  operationsList: string // Base64 encoded json
  errorMessage: string
}
