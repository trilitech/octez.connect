import { SigningType } from '@tezos-x/octez.connect-types'
import {
  assertSignPayloadConsistent,
  encodeTezosSignedMessage,
  SignPayloadConsistencyError
} from '../../src/utils/sign-payload'

const reasonOf = (fn: () => void): string | undefined => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(SignPayloadConsistencyError)
    return (e as SignPayloadConsistencyError).reason
  }
  return undefined
}

describe('assertSignPayloadConsistent', () => {
  describe('accepted', () => {
    it.each([
      ['operation 03', SigningType.OPERATION, '03abcdef'],
      ['operation 0x prefix', SigningType.OPERATION, '0x03abcdef'],
      ['operation uppercase', SigningType.OPERATION, '03ABCDEF'],
      ['micheline 05', SigningType.MICHELINE, '050100'],
      ['micheline 0x prefix', SigningType.MICHELINE, '0x050100'],
      ['raw text', SigningType.RAW, 'hello world'],
      ['raw micheline-framed hex', SigningType.RAW, '05010000000568656c6c6f'],
      ['raw hex 00', SigningType.RAW, '00ff'],
      ['raw odd-length hex-looking text', SigningType.RAW, '030'],
      ['raw 0x text', SigningType.RAW, '0xhello']
    ])('%s', (_l, type, payload) => {
      const warn = jest.fn()
      expect(() => assertSignPayloadConsistent(type, payload, { onWarning: warn })).not.toThrow()
      expect(warn).not.toHaveBeenCalled()
    })

    it.each(['01', '02', '11', '12', '13'])(
      'raw with first byte %s is accepted and warns',
      (byte) => {
        const warn = jest.fn()
        expect(() =>
          assertSignPayloadConsistent(SigningType.RAW, `${byte}00ff`, { onWarning: warn })
        ).not.toThrow()
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0][0]).toContain(byte)
      }
    )

    it('raw watermark with 0x prefix and uppercase still warns', () => {
      const warn = jest.fn()
      assertSignPayloadConsistent(SigningType.RAW, '0x11FF', { onWarning: warn })
      assertSignPayloadConsistent(SigningType.RAW, '1200FF', { onWarning: warn })
      expect(warn).toHaveBeenCalledTimes(2)
    })

    it('does not require a warning callback', () => {
      expect(() => assertSignPayloadConsistent(SigningType.RAW, '01ff')).not.toThrow()
    })
  })

  describe('rejected', () => {
    it.each([
      ['raw 03', SigningType.RAW, '03abcdef'],
      ['raw 0x03', SigningType.RAW, '0x03abcdef'],
      ['raw uppercase 03', SigningType.RAW, '03ABCDEF'],
      ['operation without 03', SigningType.OPERATION, '05abcdef'],
      ['operation non-hex', SigningType.OPERATION, '03zz'],
      ['operation odd length', SigningType.OPERATION, '03abc'],
      ['micheline without 05', SigningType.MICHELINE, '03abcdef'],
      ['micheline non-hex', SigningType.MICHELINE, '05zz'],
      ['empty payload', SigningType.RAW, ''],
      ['only 0x', SigningType.RAW, '0x'],
      ['non-string payload', SigningType.RAW, 42 as any],
      ['undefined payload', SigningType.OPERATION, undefined as any]
    ])('%s -> payload-mismatch', (_l, type, payload) => {
      expect(reasonOf(() => assertSignPayloadConsistent(type, payload))).toBe('payload-mismatch')
    })

    it.each([
      ['unknown type', 'sha256'],
      ['missing type', undefined],
      ['null type', null],
      ['upper-case type', 'RAW'],
      ['non-string type', 3]
    ])('%s -> unsupported-signing-type', (_l, type) => {
      expect(reasonOf(() => assertSignPayloadConsistent(type, '00ff'))).toBe(
        'unsupported-signing-type'
      )
    })

    it('does not warn when it rejects', () => {
      const warn = jest.fn()
      expect(() =>
        assertSignPayloadConsistent(SigningType.RAW, '03ff', { onWarning: warn })
      ).toThrow()
      expect(warn).not.toHaveBeenCalled()
    })
  })
})

describe('encodeTezosSignedMessage', () => {
  // Beacon docs vector. The expected hex was derived independently: the text is
  // 66 bytes (0x42), prefixed with 05 01 and the 4-byte length.
  const text = 'Tezos Signed Message: mydapp.com 2021-01-14T15:16:04Z Hello world!'
  const expected =
    '05010000004254657a6f73205369676e6564204d6573736167653a206d79646170702e636f6d20323032312d30312d31345431353a31363a30345a2048656c6c6f20776f726c6421'

  it('matches the Beacon docs vector', () => {
    expect(encodeTezosSignedMessage(text)).toBe(expected)
    expect(expected.slice(0, 12)).toBe('050100000042')
  })

  it('counts UTF-8 bytes, not characters or hex digits', () => {
    // 'é' is 1 character, 2 bytes
    expect(encodeTezosSignedMessage('é')).toBe('0501000000' + '02' + 'c3a9')
    expect(encodeTezosSignedMessage('')).toBe('050100000000')
  })

  it('length field equals the byte count of the body', () => {
    const out = encodeTezosSignedMessage('a'.repeat(300))
    expect(parseInt(out.slice(4, 12), 16)).toBe(300)
    expect((out.length - 12) / 2).toBe(300)
  })

  it('is accepted as a micheline payload', () => {
    expect(() => assertSignPayloadConsistent(SigningType.MICHELINE, encodeTezosSignedMessage(text))).not.toThrow()
  })
})
