import { BEACON_VERSION } from '../constants'
import { InvalidRequiredMinimumVersionError } from '../errors/InvalidRequiredMinimumVersionError'
import {
  compareBeaconVersion,
  MESSAGE_WRAPPED_FROM_VERSION,
  parseStrictDecimalInteger
} from './message-utils'

/**
 * Default minimum wallet version the dApp accepts when the option is omitted.
 *
 * The lowest protocol version the SDK still speaks: the wrapped-message
 * baseline ('3'). The flat v2 wire was removed in the protocol hard fork, so
 * a v2-only wallet is rejected at request time with
 * `VersionUnsupportedBeaconError` rather than silently failing mid-flow. A
 * dApp that needs the v4 multi-network protocol sets
 * `requiredMinimumVersion: '4'` explicitly.
 */
export const DEFAULT_REQUIRED_MINIMUM_VERSION = '3'

/**
 * Resolve a dApp's `requiredMinimumVersion` option against the SDK's
 * `BEACON_VERSION`. Returns {@link DEFAULT_REQUIRED_MINIMUM_VERSION} when
 * undefined; otherwise validates the supplied value is a decimal-integer
 * string in `[MESSAGE_WRAPPED_FROM_VERSION, BEACON_VERSION]` and returns it
 * unchanged.
 *
 * Throws `InvalidRequiredMinimumVersionError` for any malformed,
 * out-of-range, or future-version input.
 */
export const resolveRequiredMinimumVersion = (
  providedValue: string | undefined
): string => {
  if (providedValue === undefined) {
    return DEFAULT_REQUIRED_MINIMUM_VERSION
  }

  // Validate against the SAME strict contract compareBeaconVersion enforces,
  // up front, so every rejection here is an InvalidRequiredMinimumVersionError
  // rather than a leaked InvalidBeaconVersionError from the comparison below.
  // Reuse parseStrictDecimalInteger (the single owner of that contract) instead
  // of re-declaring the regex + MAX_SAFE_INTEGER bound here.
  const parsed = parseStrictDecimalInteger(providedValue)
  if (parsed === null) {
    throw new InvalidRequiredMinimumVersionError(
      providedValue,
      BEACON_VERSION,
      'value must be a decimal-integer string (e.g. "3", "4")'
    )
  }

  if (parsed < MESSAGE_WRAPPED_FROM_VERSION) {
    throw new InvalidRequiredMinimumVersionError(
      providedValue,
      BEACON_VERSION,
      `value must be >= ${MESSAGE_WRAPPED_FROM_VERSION} (the flat v2 wire was removed; the SDK only speaks wrapped v3+)`
    )
  }

  if (compareBeaconVersion(providedValue, BEACON_VERSION) > 0) {
    throw new InvalidRequiredMinimumVersionError(
      providedValue,
      BEACON_VERSION,
      `value cannot exceed the SDK's own BEACON_VERSION (${BEACON_VERSION})`
    )
  }

  return providedValue
}
