import { BeaconBaseMessage, BeaconMessageType } from '@tezos-x/beacon-types'

/**
 * @category Message
 */
export interface DisconnectMessage extends BeaconBaseMessage {
  type: BeaconMessageType.Disconnect
}
