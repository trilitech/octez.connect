import { BeaconErrorType } from '@tezos-x/octez.connect-types'

import { BEACON_ERROR_CODES } from './error-codes'
import { BeaconError } from './BeaconError'

/**
 * @category Error
 */
export class UnknownBeaconError extends BeaconError {
  public name: string = 'UnknownBeaconError'
  public title: string = 'Error'

  constructor() {
    super(
      BeaconErrorType.UNKNOWN_ERROR,
      'An unknown error occurred. Please try again or report it to a developer.',
      BEACON_ERROR_CODES.UNKNOWN_ERROR
    )
  }
}
