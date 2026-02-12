import { BeaconBaseMessage, BeaconMessageType } from '@tezos-x/octez.connect-types'

/**
 * @category Message
 */
export interface DisconnectMessage extends BeaconBaseMessage {
  type: BeaconMessageType.Disconnect
}
