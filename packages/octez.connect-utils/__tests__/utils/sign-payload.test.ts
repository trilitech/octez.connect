import { SigningType } from '@tezos-x/octez.connect-types'
import {
  assertSignPayloadConsistent,
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

    it.each(['01abc', '01ab ', '0x02ab\n', '11abzz'])(
      'raw watermark with lenient tail %j still warns',
      (payload) => {
        const warn = jest.fn()
        assertSignPayloadConsistent(SigningType.RAW, payload, { onWarning: warn })
        expect(warn).toHaveBeenCalledTimes(1)
      }
    )

    it('does not require a warning callback', () => {
      expect(() => assertSignPayloadConsistent(SigningType.RAW, '01ff')).not.toThrow()
    })
  })

  describe('rejected', () => {
    it.each([
      ['raw 03', SigningType.RAW, '03abcdef'],
      ['raw 0x03', SigningType.RAW, '0x03abcdef'],
      ['raw uppercase 03', SigningType.RAW, '03ABCDEF'],
      ['raw 03 trailing space', SigningType.RAW, '03abcd '],
      ['raw 03 trailing newline', SigningType.RAW, '03abcd\n'],
      ['raw 03 odd length', SigningType.RAW, '03abc'],
      ['raw 03 non-hex tail', SigningType.RAW, '03abcdzz'],
      ['raw 0x03 trailing space', SigningType.RAW, '0x03abcd '],
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
