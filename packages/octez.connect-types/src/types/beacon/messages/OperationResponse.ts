import { BeaconBaseMessage, BeaconMessageType } from '@tezos-x/octez.connect-types'

/**
 * @category Message
 */
export interface OperationResponse extends BeaconBaseMessage {
  type: BeaconMessageType.OperationResponse
  transactionHash: string // Hash of the broadcast transaction
}
