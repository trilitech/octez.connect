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

// Under RAW the payload may be text, so it is not required to be strict hex.
// A wallet that decodes it with a lenient hex decoder (for example Node's
// `Buffer.from(p, 'hex')`, which stops at the first invalid character) would
// still read bytes from "03ab " or "03abcdzz". The check below therefore only
// looks at the first byte plus one more hex byte-sized pair, and ignores what follows.
const LENIENT_OPERATION_REGEX = /^03[0-9a-fA-F]{2}/
const LENIENT_WARNED_REGEX = new RegExp(
  `^(${WATERMARKS_WARNED_UNDER_RAW.join('|')})[0-9a-fA-F]{2}`
)

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
 * - `raw`: anything non-empty, except a payload that starts with `03` followed
 *   by two more hex digits (an operation that must be sent as `operation`).
 *   This is a prefix match: trailing characters, odd length or non-hex tails
 *   do not make the payload text, because lenient hex decoders still read
 *   bytes from it. Text such as "03ab..." is therefore refused as well.
 *   A prefix of `01`, `02`, `11`, `12` or `13` followed by two hex digits is
 *   accepted and reported through `options.onWarning`.
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
      if (LENIENT_OPERATION_REGEX.test(body)) {
        throw new SignPayloadConsistencyError(
          'payload-mismatch',
          'A payload starting with "03" is an operation and must use signing type "operation"'
        )
      }
      {
        const warned = LENIENT_WARNED_REGEX.exec(body)
        if (warned) {
          options.onWarning?.(
            `Signing type "raw" with a payload starting with watermark byte "${warned[1]}"`
          )
        }
      }

      return
    default:
      return
  }
}
