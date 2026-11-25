import { Transport } from '../../src/transports/Transport'
import { setDebugEnabled } from '../../src/debug'

class TestTransport extends Transport<any, any, any> {
  async listen(): Promise<void> {}
}

// True if `needle` appears anywhere inside `value` (cycle-safe deep search).
const contains = (value: unknown, needle: string, seen = new Set<unknown>()): boolean => {
  if (typeof value === 'string') return value.includes(needle)
  if (!value || typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  return Object.values(value).some((v) => contains(v, needle, seen))
}

describe('Transport logging', () => {
  const secretKey = 'secret-key-must-not-be-logged'
  let spies: jest.SpyInstance[]

  beforeEach(() => {
    setDebugEnabled(true)
    spies = (['log', 'warn', 'debug', 'error', 'group', 'groupCollapsed'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined)
    )
  })

  afterEach(() => {
    setDebugEnabled(false)
    spies.forEach((s) => s.mockRestore())
  })

  const logged = () => spies.flatMap((s) => s.mock.calls)

  it.each([0, 1])(
    'notifyListeners with %i listener(s) never logs the client secret key',
    async (count) => {
      const transport = new TestTransport('test', { keyPair: { secretKey } }, {} as any)
      for (let i = 0; i < count; i++) await transport.addListener(jest.fn())

      await (transport as any).notifyListeners({}, {})

      expect(logged().length).toBeGreaterThan(0)
      expect(logged().some((args) => contains(args, secretKey))).toBe(false)
    }
  )
})
