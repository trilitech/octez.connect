import {
  compareBeaconVersion,
  isAtLeastVersion,
  isMultiNetworkVersion,
  negotiateEnvelopeVersion,
  wrapBeaconMessage,
  unwrapBeaconMessage
} from '../../src/utils/message-utils'
import { InvalidBeaconVersionError } from '../../src/errors/InvalidBeaconVersionError'

describe('isAtLeastVersion / isMultiNetworkVersion', () => {
  it('isAtLeastVersion compares numerically and treats absent/malformed as below', () => {
    expect(isAtLeastVersion('4', '4')).toBe(true)
    expect(isAtLeastVersion('5', '4')).toBe(true)
    expect(isAtLeastVersion('3', '4')).toBe(false)
    expect(isAtLeastVersion(undefined, '4')).toBe(false)
    expect(isAtLeastVersion('NaN', '4')).toBe(false)
    expect(isAtLeastVersion('4.1', '4')).toBe(false)
  })

  it('isMultiNetworkVersion is true at or above v4 only', () => {
    expect(isMultiNetworkVersion('4')).toBe(true)
    expect(isMultiNetworkVersion('10')).toBe(true)
    expect(isMultiNetworkVersion('3')).toBe(false)
    expect(isMultiNetworkVersion('2')).toBe(false)
    expect(isMultiNetworkVersion(undefined)).toBe(false)
    expect(isMultiNetworkVersion('<script>')).toBe(false)
  })
})

describe('negotiateEnvelopeVersion', () => {
  // min(peer.version, BEACON_VERSION) with a hard floor at the wrapped
  // baseline '3'. The removed flat v2 wire must be unreachable from here.
  it.each([
    ['unknown peer (WalletConnect)', undefined, '3'],
    ['legacy v2 peer', '2', '3'],
    ['v3 peer', '3', '3'],
    ['v4 peer', '4', '4'],
    ['future peer capped at own version', '5', '4'],
    ['malformed version', '4.1', '3'],
    ['hostile version', '<script>', '3']
  ])('%s: %p → %p', (_label, peerVersion, expected) => {
    expect(negotiateEnvelopeVersion(peerVersion as string | undefined)).toBe(expected)
  })
})

describe('wrapBeaconMessage / unwrapBeaconMessage', () => {
  const inner = { type: 'permission_request' } as any

  it('wrap builds the canonical envelope shape', () => {
    expect(wrapBeaconMessage({ id: 'id1', version: '4', senderId: 's1' }, inner)).toEqual({
      id: 'id1',
      version: '4',
      senderId: 's1',
      message: inner
    })
  })

  it('unwrap returns the payload only for wrapped (v3+) versions', () => {
    expect(unwrapBeaconMessage({ version: '4', message: inner })).toBe(inner)
    expect(unwrapBeaconMessage({ version: '3', message: inner })).toBe(inner)
    expect(unwrapBeaconMessage({ version: '2', message: inner })).toBeUndefined()
    expect(unwrapBeaconMessage({ version: '3.0', message: inner })).toBeUndefined()
    expect(unwrapBeaconMessage({ message: inner })).toBeUndefined()
  })
})

describe('compareBeaconVersion (strict decimal-integer contract)', () => {
  describe('happy paths', () => {
    it("returns > 0 when a > b ('4' vs '3')", () => {
      expect(compareBeaconVersion('4', '3')).toBeGreaterThan(0)
    })

    it("returns < 0 when a < b ('3' vs '4')", () => {
      expect(compareBeaconVersion('3', '4')).toBeLessThan(0)
    })

    it("returns 0 when a === b ('4' vs '4')", () => {
      expect(compareBeaconVersion('4', '4')).toBe(0)
    })

    it("compares numerically, NOT lexicographically ('10' > '2')", () => {
      // '10' < '2' under lexicographic comparison but > under numeric.
      expect(compareBeaconVersion('10', '2')).toBeGreaterThan(0)
    })

    it('accepts 0 as a legitimate version', () => {
      expect(compareBeaconVersion('0', '0')).toBe(0)
      expect(compareBeaconVersion('0', '4')).toBeLessThan(0)
    })
  })

  describe('malformed inputs throw InvalidBeaconVersionError', () => {
    const malformedCases: ReadonlyArray<[string, unknown]> = [
      ['decimal point', '4.1'],
      ['exponent notation', '4e0'],
      ['exponent notation (large)', '4e1'],
      ['surrounding whitespace', ' 4 '],
      ['leading zero', '04'],
      ['empty string', ''],
      ['negative sign', '-1'],
      ['positive sign', '+4'],
      ['NaN string', 'NaN'],
      ['Infinity string', 'Infinity'],
      ['hex prefix', '0x4'],
      ['non-numeric string', 'four'],
      ['undefined', undefined],
      ['null', null],
      ['number type', 4],
      ['object', {}],
      ['array', []],
      ['boolean', true]
    ]

    it.each(malformedCases)('rejects %s (a = %p)', (_label, value) => {
      expect(() => compareBeaconVersion(value, '3')).toThrow(InvalidBeaconVersionError)
    })

    it('rejects when ONLY b is malformed (validation applies to both operands)', () => {
      expect(() => compareBeaconVersion('4', '4.1')).toThrow(InvalidBeaconVersionError)
    })

    it('rejects values above Number.MAX_SAFE_INTEGER', () => {
      expect(() => compareBeaconVersion('9007199254740993', '3')).toThrow(
        InvalidBeaconVersionError
      )
    })

    it('thrown error carries both offending operands on the instance', () => {
      try {
        compareBeaconVersion('4.1', '3')
        fail('expected throw')
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidBeaconVersionError)
        const err = e as InvalidBeaconVersionError
        expect(err.a).toBe('4.1')
        expect(err.b).toBe('3')
      }
    })
  })
})
