import { BeaconBaseMessage, BeaconMessageType } from '@tezos-x/beacon-types'

/**
 * @category Message
 */
export interface AcknowledgeResponse extends BeaconBaseMessage {
  type: BeaconMessageType.Acknowledge
}
