import { SigningType } from '@tezos-x/octez.connect-types'

/**
 * Why a sign request was refused.
 *
 * - `unsupported-signing-type`: the signing type is missing or not one of `raw`, `operation`, `micheline`.
 * - `payload-mismatch`: the payload contradicts the signing type it was sent with.
 */
export type SignPayloadConsistencyReason = 'unsupported-signing-type' | 'payload-mismatch'

export class SignPayloadConsistencyError extends Error {
  public readonly name: string = 'SignPayloadConsistencyError'
  public readonly reason: SignPayloadConsistencyReason

  constructor(reason: SignPayloadConsistencyReason, message: string) {
    super(message)
    // Keep `instanceof` working when compiled to ES5.
    Object.setPrototypeOf(this, SignPayloadConsistencyError.prototype)
    this.reason = reason
  }
}

const HEX_REGEX = /^[0-9a-fA-F]+$/

// Watermarks that Tezos assigns to consensus operations and blocks. A RAW
// payload that starts with one of them is unusual; `03` (generic operation)
// is refused, the others are only reported.
const WATERMARKS_WARNED_UNDER_RAW = ['01', '02', '11', '12', '13']

const isHex = (value: string): boolean => value.length % 2 === 0 && HEX_REGEX.test(value)

export interface AssertSignPayloadOptions {
  /** Called with a human readable message for payloads that are accepted but unusual. */
  onWarning?: (message: string) => void
}

/**
 * Checks that the payload of a sign request matches its signing type.
 *
 * - `operation`: even-length hex starting with `03`.
 * - `micheline`: even-length hex starting with `05`.
 * - `raw`: anything non-empty, except hex starting with `03` (an operation
 *   that must be sent as `operation`). Hex starting with `01`, `02`, `11`, `12`
 *   or `13` is accepted and reported through `options.onWarning`.
 *
 * An optional `0x` prefix is ignored. Hex is matched case-insensitively.
 *
 * @throws SignPayloadConsistencyError
 */
export const assertSignPayloadConsistent = (
  signingType: unknown,
  payload: unknown,
  options: AssertSignPayloadOptions = {}
): void => {
  if (
    signingType !== SigningType.RAW &&
    signingType !== SigningType.OPERATION &&
    signingType !== SigningType.MICHELINE
  ) {
    throw new SignPayloadConsistencyError(
      'unsupported-signing-type',
      `Unsupported signing type ${JSON.stringify(signingType)}`
    )
  }

  if (typeof payload !== 'string' || payload.length === 0) {
    throw new SignPayloadConsistencyError('payload-mismatch', 'Payload must be a non-empty string')
  }

  const body = /^0x/i.test(payload) ? payload.slice(2) : payload
  if (body.length === 0) {
    throw new SignPayloadConsistencyError('payload-mismatch', 'Payload must be a non-empty string')
  }

  const hex = isHex(body)
  const prefix = hex ? body.slice(0, 2).toLowerCase() : ''

  switch (signingType) {
    case SigningType.OPERATION:
      if (!hex || prefix !== '03') {
        throw new SignPayloadConsistencyError(
          'payload-mismatch',
          'When using signing type "operation", the payload must be hex starting with "03"'
        )
      }

      return
    case SigningType.MICHELINE:
      if (!hex || prefix !== '05') {
        throw new SignPayloadConsistencyError(
          'payload-mismatch',
          'When using signing type "micheline", the payload must be hex starting with "05"'
        )
      }

      return
    case SigningType.RAW:
      if (hex && prefix === '03') {
        throw new SignPayloadConsistencyError(
          'payload-mismatch',
          'A payload starting with "03" is an operation and must use signing type "operation"'
        )
      }
      if (hex && WATERMARKS_WARNED_UNDER_RAW.includes(prefix)) {
        options.onWarning?.(
          `Signing type "raw" with a payload starting with watermark byte "${prefix}"`
        )
      }

      return
    default:
      return
  }
}

/**
 * Encodes text as a framed Tezos signed message, the form that is safe to sign
 * with `signMessage` or to send as a `micheline` sign request:
 * `05` + `01` + 4-byte big-endian BYTE length of the UTF-8 text + the UTF-8
 * bytes, all as lowercase hex.
 *
 * The length is the number of UTF-8 bytes, not the number of characters and
 * not the number of hex characters. The `05` prefix marks the payload as a
 * Micheline expression, so a signature over it can never be replayed as a
 * Tezos operation (`03`). By convention the text starts with
 * `Tezos Signed Message: `.
 *
 * @example
 * encodeTezosSignedMessage('Tezos Signed Message: mydapp.com 2021-01-14T15:16:04Z Hello world!')
 * // '05010000004254657a6f73205369676e6564...'
 */
export const encodeTezosSignedMessage = (text: string): string => {
  if (typeof text !== 'string') {
    throw new TypeError('encodeTezosSignedMessage expects a string')
  }

  const bytes = Buffer.from(text, 'utf8')

  return `0501${bytes.length.toString(16).padStart(8, '0')}${bytes.toString('hex')}`
}
