import { BeaconBaseMessage } from '../BeaconBaseMessage'
import { BeaconErrorType } from '../../BeaconErrorType'
import { BeaconMessageType } from '../BeaconMessageType'

/**
 * @category Message
 */
export interface ErrorResponse extends BeaconBaseMessage {
  type: BeaconMessageType.Error
  errorType: BeaconErrorType
  errorData?: any
  /**
   * Human-readable context for the error. Used by the v2 tombstone (a
   * hard-forked wallet rejecting a legacy flat-v2 request) to tell the old
   * dApp why; legacy parsers ignore unknown fields.
   */
  description?: string
}
