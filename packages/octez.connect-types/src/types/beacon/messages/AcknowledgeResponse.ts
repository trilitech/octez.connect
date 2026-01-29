import { BeaconBaseMessage, BeaconMessageType } from '@tezos-x/octez.connect-types'

/**
 * @category Message
 */
export interface AcknowledgeResponse extends BeaconBaseMessage {
  type: BeaconMessageType.Acknowledge
}
