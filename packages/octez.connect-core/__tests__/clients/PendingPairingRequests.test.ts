import { PendingPairingRequests } from '../../src/transports/clients/PendingPairingRequests'

describe('PendingPairingRequests', () => {
  beforeEach(() => {
    jest.useRealTimers()
  })

  it('accepts a pending id once, then nothing', () => {
    const pending = new PendingPairingRequests()
    pending.add('a')
    pending.add('b')

    expect(pending.consume('unknown')).toBe(false)
    expect(pending.consume('a')).toBe(true)
    expect(pending.consume('a')).toBe(false)
    expect(pending.consume('b')).toBe(false) // one reply wins, all cleared
    expect(pending.hasPending()).toBe(false)
  })

  it('does not share pending ids between instances (a reload starts empty)', () => {
    new PendingPairingRequests().add('a')

    expect(new PendingPairingRequests().consume('a')).toBe(false)
  })

  it('expires after 30 minutes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T10:00:00Z'))
    const pending = new PendingPairingRequests()
    pending.add('a')

    jest.setSystemTime(new Date('2026-11-13T10:31:00Z'))
    expect(pending.consume('a')).toBe(false)
  })

  it('keeps only the newest 32', () => {
    const pending = new PendingPairingRequests()
    for (let i = 0; i < 33; i++) pending.add(`id-${i}`)

    expect(pending.consume('id-0')).toBe(false)
    expect(pending.consume('id-32')).toBe(true)
  })

  it('clear() forgets everything', () => {
    const pending = new PendingPairingRequests()
    pending.add('a')
    pending.clear()

    expect(pending.consume('a')).toBe(false)
  })
})
