import { PendingPairingRequests } from '../../src/transports/clients/PendingPairingRequests'

const KEY = 'test:pending'

describe('PendingPairingRequests', () => {
  beforeEach(() => {
    sessionStorage.clear()
    jest.useRealTimers()
  })

  it('accepts a pending id once, then nothing', () => {
    const pending = new PendingPairingRequests(KEY)
    pending.add('a')
    pending.add('b')

    expect(pending.consume('unknown')).toBe(false)
    expect(pending.consume('a')).toBe(true)
    expect(pending.consume('a')).toBe(false)
    expect(pending.consume('b')).toBe(false) // one reply wins, all cleared
    expect(pending.hasPending()).toBe(false)
  })

  it('survives a reload in the same tab', () => {
    new PendingPairingRequests(KEY).add('a')

    expect(new PendingPairingRequests(KEY).consume('a')).toBe(true)
    expect(new PendingPairingRequests(KEY).consume('a')).toBe(false)
  })

  it('keeps transports apart', () => {
    new PendingPairingRequests('p2p').add('a')

    expect(new PendingPairingRequests('postmessage').consume('a')).toBe(false)
  })

  it('expires after 30 minutes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T10:00:00Z'))
    const pending = new PendingPairingRequests(KEY)
    pending.add('a')

    jest.setSystemTime(new Date('2026-11-13T10:31:00Z'))
    expect(pending.consume('a')).toBe(false)
  })

  it('keeps only the newest 32', () => {
    const pending = new PendingPairingRequests(KEY)
    for (let i = 0; i < 33; i++) pending.add(`id-${i}`)

    expect(pending.consume('id-0')).toBe(false)
    expect(pending.consume('id-32')).toBe(true)
  })

  it('clear() forgets everything', () => {
    const pending = new PendingPairingRequests(KEY)
    pending.add('a')
    pending.clear()

    expect(new PendingPairingRequests(KEY).consume('a')).toBe(false)
  })

  it('ignores corrupt saved data', () => {
    sessionStorage.setItem(KEY, '{not json')
    const pending = new PendingPairingRequests(KEY)

    expect(pending.hasPending()).toBe(false)
    pending.add('a')
    expect(pending.consume('a')).toBe(true)
  })
})
