// Wrapped-only outgoing pipeline: flat convenience inputs from the wallet
// app are wrapped onto the wire here; permission grants are validated via
// the blockchain registry and persisted in one batched write.
import { BeaconErrorType, BeaconMessageType, NetworkType } from '@tezos-x/octez.connect-types'
import { OutgoingResponseInterceptor } from '../../src/interceptors/OutgoingResponseInterceptor'

const ownAppMetadata = { senderId: 'wallet-sender', name: 'Test Wallet' }

const parsedAccount = (overrides: Record<string, unknown> = {}) => ({
  accountId: 'account-1',
  address: 'tz1address',
  publicKey: 'edpkkey',
  network: undefined,
  scopes: [],
  ...overrides
})

const buildConfig = (
  message: any,
  options: {
    requestPayload?: Record<string, unknown>
    parsedAccounts?: Record<string, unknown>[]
    validateResponse?: jest.Mock
  } = {}
) => {
  const addPermissions = jest.fn().mockResolvedValue(undefined)
  const interceptorCallback = jest.fn()
  const validateResponse = options.validateResponse ?? jest.fn().mockResolvedValue(undefined)
  const blockchain = {
    identifier: 'tezos',
    validateResponse,
    getAccountInfosFromPermissionResponse: jest
      .fn()
      .mockResolvedValue(options.parsedAccounts ?? [parsedAccount()])
  }
  const config = {
    senderId: 'wallet-sender',
    // Post-fork requests are always wrapped envelopes with a negotiated version.
    request: {
      id: 'req-id',
      version: '4',
      senderId: 'dapp-sender',
      message: {
        blockchainIdentifier: 'tezos',
        type: BeaconMessageType.PermissionRequest,
        blockchainData: options.requestPayload ?? {}
      }
    } as any,
    message,
    ownAppMetadata: ownAppMetadata as any,
    permissionManager: { addPermissions } as any,
    appMetadataManager: {
      getAppMetadata: jest.fn(async () => ({ senderId: 'dapp-sender', name: 'Test dApp' })),
      addAppMetadata: jest.fn()
    } as any,
    interceptorCallback,
    blockchains: new Map([['tezos', blockchain]]) as any
  }

  return { config, addPermissions, interceptorCallback, blockchain, validateResponse }
}

describe('OutgoingResponseInterceptor — flat convenience inputs (wallet-app API unchanged)', () => {
  it('wraps a flat Acknowledge into a full envelope (id, version echo, senderId)', async () => {
    const { config, interceptorCallback } = buildConfig({
      id: 'msg-1',
      type: BeaconMessageType.Acknowledge
    })

    await OutgoingResponseInterceptor.intercept(config as any)

    expect(interceptorCallback).toHaveBeenCalledWith({
      id: 'msg-1',
      version: '4',
      senderId: 'wallet-sender',
      message: { type: BeaconMessageType.Acknowledge }
    })
  })

  it('wraps a flat Error and validates TRANSACTION_INVALID_ERROR errorData shape', async () => {
    const { config, interceptorCallback } = buildConfig({
      id: 'msg-1',
      type: BeaconMessageType.Error,
      errorType: BeaconErrorType.TRANSACTION_INVALID_ERROR,
      errorData: [{ kind: 'temporary', id: 'proto.error' }]
    })

    await OutgoingResponseInterceptor.intercept(config as any)

    const sent = interceptorCallback.mock.calls[0][0]
    expect(sent.version).toBe('4')
    expect(sent.message.type).toBe(BeaconMessageType.Error)
    expect(sent.message.error).toEqual({
      type: BeaconErrorType.TRANSACTION_INVALID_ERROR,
      data: [{ kind: 'temporary', id: 'proto.error' }]
    })
  })

  it('drops malformed errorData instead of forwarding it', async () => {
    const { config, interceptorCallback } = buildConfig({
      id: 'msg-1',
      type: BeaconMessageType.Error,
      errorType: BeaconErrorType.TRANSACTION_INVALID_ERROR,
      errorData: { not: 'an array of rpc errors' }
    })

    await OutgoingResponseInterceptor.intercept(config as any)

    expect(interceptorCallback.mock.calls[0][0].message.error.data).toBeUndefined()
  })

  it('wraps a flat PermissionResponse, validates it, and persists grants in ONE batched write', async () => {
    const { config, interceptorCallback, addPermissions, blockchain, validateResponse } =
      buildConfig(
        {
          id: 'msg-1',
          type: BeaconMessageType.PermissionResponse,
          network: { type: NetworkType.MAINNET },
          scopes: ['sign'],
          publicKey: 'edpkkey'
        },
        {
          parsedAccounts: [
            parsedAccount({ accountId: 'acc-main', network: { type: NetworkType.MAINNET } }),
            parsedAccount({ accountId: 'acc-ghost', network: { type: NetworkType.GHOSTNET } })
          ]
        }
      )

    await OutgoingResponseInterceptor.intercept(config as any)

    expect(validateResponse).toHaveBeenCalledTimes(1)
    expect(blockchain.getAccountInfosFromPermissionResponse).toHaveBeenCalledTimes(1)
    // N grants → exactly one batched persistence call (lost-update fix).
    expect(addPermissions).toHaveBeenCalledTimes(1)
    expect(addPermissions.mock.calls[0][0]).toHaveLength(2)
    expect(addPermissions.mock.calls[0][0].map((p: any) => p.accountIdentifier)).toEqual([
      'acc-main',
      'acc-ghost'
    ])

    const sent = interceptorCallback.mock.calls[0][0]
    expect(sent.message.type).toBe(BeaconMessageType.PermissionResponse)
    expect(sent.message.blockchainData.appMetadata).toEqual(ownAppMetadata)
    expect(sent.message.blockchainData.publicKey).toBe('edpkkey')
  })

  it('echoes the requested network instead of blindly defaulting to MAINNET', async () => {
    const { config, addPermissions } = buildConfig(
      {
        id: 'msg-1',
        type: BeaconMessageType.PermissionResponse,
        scopes: [],
        publicKey: 'edpkkey'
      },
      {
        requestPayload: { network: { type: NetworkType.GHOSTNET } },
        // Parser entry without a network → the request's network is echoed.
        parsedAccounts: [parsedAccount({ network: undefined })]
      }
    )

    await OutgoingResponseInterceptor.intercept(config as any)

    expect(addPermissions.mock.calls[0][0][0].network).toEqual({ type: NetworkType.GHOSTNET })
  })

  it('wraps a flat OperationResponse into a tezos BlockchainResponse payload', async () => {
    const { config, interceptorCallback } = buildConfig({
      id: 'msg-1',
      type: BeaconMessageType.OperationResponse,
      transactionHash: 'oo123'
    })

    await OutgoingResponseInterceptor.intercept(config as any)

    expect(interceptorCallback).toHaveBeenCalledWith({
      id: 'msg-1',
      version: '4',
      senderId: 'wallet-sender',
      message: {
        blockchainIdentifier: 'tezos',
        type: BeaconMessageType.BlockchainResponse,
        blockchainData: { type: 'operation_response', transactionHash: 'oo123' }
      }
    })
  })
})

describe('OutgoingResponseInterceptor — wrapped inputs (generic chain API)', () => {
  it('rejects a wrapped envelope with a missing payload (escape hatch removed)', async () => {
    const { config } = buildConfig({ id: 'msg-1', version: '4', message: undefined })
    // isWrappedInput is false for message: undefined → flat switch → assertNever
    // OR wrapped path throws; either way the malformed input must not pass through.
    await expect(
      OutgoingResponseInterceptor.intercept({
        ...config,
        message: { id: 'msg-1', version: '4', message: undefined } as any
      } as any)
    ).rejects.toThrow()
  })

  it('re-wraps a wrapped PermissionResponse with the wallet identity and persists grants', async () => {
    const wrappedInput = {
      id: 'msg-1',
      version: '4',
      senderId: 'to-be-replaced',
      message: {
        blockchainIdentifier: 'tezos',
        type: BeaconMessageType.PermissionResponse,
        blockchainData: { scopes: [], publicKey: 'edpkkey' }
      }
    }
    const { config, interceptorCallback, addPermissions } = buildConfig(wrappedInput)

    await OutgoingResponseInterceptor.intercept(config as any)

    const sent = interceptorCallback.mock.calls[0][0]
    expect(sent.senderId).toBe('wallet-sender')
    expect(sent.version).toBe('4')
    expect(sent.message.blockchainData.appMetadata).toEqual(ownAppMetadata)
    expect(addPermissions).toHaveBeenCalledTimes(1)
  })

  it('throws for an unregistered blockchain identifier', async () => {
    const wrappedInput = {
      id: 'msg-1',
      version: '4',
      senderId: 's',
      message: {
        blockchainIdentifier: 'unknown-chain',
        type: BeaconMessageType.PermissionResponse,
        blockchainData: {}
      }
    }
    const { config } = buildConfig(wrappedInput)

    await expect(OutgoingResponseInterceptor.intercept(config as any)).rejects.toThrow(
      'Blockchain "unknown-chain" not supported'
    )
  })
})
