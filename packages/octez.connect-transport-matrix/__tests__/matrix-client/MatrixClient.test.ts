import { MatrixClient } from '../../src/matrix-client/MatrixClient'

describe('MatrixClient', () => {
  const createStore = () => {
    const state: Record<string, unknown> = {
      accessToken: undefined,
      isRunning: false,
      pollingRetries: 0,
      pollingTimeout: undefined,
      rooms: {},
      syncToken: undefined,
      txnNo: 0
    }

    return {
      get: jest.fn((key: string) => state[key]),
      update: jest.fn(async (update: Record<string, unknown>) => {
        Object.assign(state, update)
      }),
      onStateChanged: jest.fn(),
      getRoom: jest.fn()
    }
  }

  it('treats manual stop during polling as normal shutdown', async () => {
    jest.useFakeTimers()
    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      const store = createStore()
      const eventEmitter = {
        onStateChanged: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn()
      }
      const userService = {
        login: jest.fn().mockResolvedValue({ access_token: 'access-token' })
      }
      const eventService = {
        sync: jest.fn().mockResolvedValue({
          next_batch: 'sync-token',
          rooms: {}
        })
      }
      const httpClient = {
        cancelAllRequests: jest.fn().mockResolvedValue(undefined)
      }

      const client = new MatrixClient(
        store as any,
        eventEmitter as any,
        userService as any,
        {} as any,
        eventService as any,
        httpClient as any
      )

      await expect(
        client.start({
          id: 'matrix-user',
          password: 'matrix-password',
          deviceId: 'matrix-device'
        })
      ).resolves.toBeUndefined()

      await expect(client.stop()).resolves.toBeUndefined()
      await expect(jest.runOnlyPendingTimersAsync()).resolves.toBeUndefined()
      await Promise.resolve()

      expect(unhandledRejections).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
      jest.useRealTimers()
    }
  })
})
