import { BeaconBaseMessage, BeaconMessageType } from '@tezos-x/beacon-types'

export interface ProofOfEventChallengeResponse extends BeaconBaseMessage {
  type: BeaconMessageType.ProofOfEventChallengeResponse
  payloadHash: string
  isAccepted: boolean // Indicating whether the challenge is accepted
}
