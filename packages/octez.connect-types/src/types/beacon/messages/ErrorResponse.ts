import { BeaconBaseMessage, BeaconErrorType, BeaconMessageType } from '@tezos-x/octez.connect-types'

/**
 * @category Message
 */
export interface ErrorResponse extends BeaconBaseMessage {
  type: BeaconMessageType.Error
  errorType: BeaconErrorType
  errorData?: any
}
