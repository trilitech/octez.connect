import { BeaconBaseMessage, BeaconErrorType, BeaconMessageType } from '@tezos-x/beacon-types'

/**
 * @category Message
 */
export interface ErrorResponse extends BeaconBaseMessage {
  type: BeaconMessageType.Error
  errorType: BeaconErrorType
  errorData?: any
}
