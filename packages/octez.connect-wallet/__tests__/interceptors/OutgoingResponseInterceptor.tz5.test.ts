// End-to-end coverage for "PermissionResponse carrying a
// tz5 (ML-DSA-44) account must be accepted by the wallet's outgoing-response path"
import { BeaconMessageType } from '@tezos-x/octez.connect-types'
import { OutgoingResponseInterceptor } from '../../src/interceptors/OutgoingResponseInterceptor'

// Authoritative test vectors (shared with octez.connect-utils crypto.test.ts).
const MDPK_PUBLIC_KEY =
  'mdpk2A7JWfJSqYhEc2qbcPptJhHLdwzciT2TvnTxsYmeRWf5qUUZBM1Jj5qoTPz4S9AGDS7xRmnUFgbqofm62sS1h4CNfps2dwoVgY6puEcxse8UeCii5C62z4FWwoNTonF9n8bTz3s5pXap4aQSbLsp4LU3zeq5UPT4iqmHooQbHb48QwHJB2GZogFCkUJCE8jFaQpaiYyzpVseZVrD5gAA1MoVrGQB7yJPKXaBr9fNV64tYirXF1ZCVCrDsB5XK8gFpT7DtHStpt8i8CbTg58a6qs3NKHLhsDJujNrPv4BD7cV6nkdbhMyS8U82NdTETYk3xtbhm7RPVqmtJKE8FDd9iVPJMFAQ8RRvJj3mtFazroUAC4436JbPzGLcPmGWYYLSjMKBDsmydE2qqf7CsHyxiet4LmFpCZZftUCURzuuHsDCs5Kw7VPR4jE65awhD7wndEUFE5dpdH5uXBWz3Da6Es6ijEnbMPsKpN7vrtVsURvQBzqKPmuVkdd4RdLoVXVxXEk87xmRM6NgAkiN9BBKw9BCAro1ro4pc7zDSVgggcajHLF2hvE95mN7bGV6NvJRioMKhcecoVJfhDZ61JpcqjqzRouBn7F3URjGyXRsv1WhqkhDLHtA6jfeevERtrAv2VZQdXLQaWGUjX2W7wcJY1CzHh6nSYiRdotPDRHnQu2HvKuSguARuQ1UZkx6Ziv3q5fWDJ6Jtaf7ShJMXTJhcjYLFUg5QpZX5CWAkKvMVPYibuiKeGi4KN8i7JAiWXtCqPA7Ei2Afh9uiPaHPF5Z9Muptg8zj25mqwSmY4DcDm7G8B28vk2eRwgr1WPYfxcS2Q9nGioM5gw8rCeH5zAiTf9q5MZQ5ztj3pd9Q25ev8YNb3xNkPb9ic5EkspABppy7aBgYHAxc8ixxe2G5iC774jkWnF3NGKMRrTdLG3UBtfLdNUY1bXFFBvf4Yg8i66kBTRvyRSdSoxFjgrZfNiG16XAWnSqMBGHsS56NGk1736BzKw1EAhVF8GX4P2mUdFj2h1YFdcAXubv4ojsWPh8LRgRKQ2R6iw58dSWyDN48PMQT91kQZtUwX4ZNwAjSEow5yoS2NSraVLFcrt9pyE1hjKgfnSb9d6H9zKXVcUuB7bRkeXaM1qzygnbskpzJ221tgB4EgT7y9nVew2koVtT53Sr7kFki3E4fG9rvuVukwHH73kBNbJY1U25KQHtEJcAjrpsg5A8GrBS7FTxKfBH47FfqnzfJCgHag4AoaXWSm7BnzFkJWPrZ6eBVDy3NMzhQcfQNjVTUaxTH21pWGE1Jhtq9rgDufy2EezLt7MXE2YeNGBTBh3eBKGyGJZ7M86PcMFeu96kj3F3kAqmYc3umz2QsMaqmAoKU2y3BrCsBYxLoC951n5DyqBMFh7mat6PhkEZv4XLeHXxbzaWvwWMT1H8gv2wejnWNZV7kiKVreH4AjUZtmN3KRpbFUdfmyKZMJGsvgrdt3L3xXDpjnUR52W9MX72YYNvjYwJC7BpbE9Xho4MEEFcgmPrTwbg5g4dV34NqueFEqJj2EnaMKFHMrENRKMeXKt3qt7ci6bD5DJpJLmhDpCmxRF86j7BqnC27ooE9qzBVbFhFmrTk7GxJ7ov2K9Y4zuCYrUiWNexqCm971Vgpv8wuaSAMiPSwCy3VtrACfjNrJhA2PuA9xmLEj4HMTgEDRQwjUUUuZT3unZQn8wrEW8oiXN9z5P7JWt9aZNyXNLSykBTtshKkrs1HDAPKzzKpHk4pJvmU99h8fz41Ej9SsPiSyMY9tTN3shfEqEL9'
const TZ5_ADDRESS_DERIVED = 'tz5dBkjzicFLcEp5HLwkpqbVv1tE9EVaxs6e'

// Mock the DI collaborators from core; let utils run for real.
jest.mock('@tezos-x/octez.connect-core', () => ({
  Logger: class {
    log() {}
    warn() {}
    error() {}
  },
  usesWrappedMessages: () => false,
  getAccountIdentifier: async (address: string) => `account-${address}`,
  AppMetadataManager: class {},
  PermissionManager: class {}
}))

const ownAppMetadata = { senderId: 'wallet-sender', name: 'Test Wallet' }
const appMetadataManager = {
  getAppMetadata: jest.fn(async () => ({ senderId: 'dapp-sender', name: 'Test dApp' }))
} as any

const buildConfig = (message: any) => {
  const addPermission = jest.fn().mockResolvedValue(undefined)
  const interceptorCallback = jest.fn()
  const config = {
    senderId: 'wallet-sender',
    request: { version: '2', senderId: 'dapp-sender' } as any,
    message,
    ownAppMetadata: ownAppMetadata as any,
    permissionManager: { addPermission } as any,
    appMetadataManager,
    interceptorCallback,
    blockchains: new Map()
  }
  return { config, addPermission, interceptorCallback }
}

const permissionMessage = (overrides: Record<string, unknown>) => ({
  type: BeaconMessageType.PermissionResponse,
  id: 'msg-id-1',
  network: { type: 'custom' },
  scopes: [],
  ...overrides
})

// `intercept` dispatches handleV2Message without awaiting it (fire-and-forget), so the
// permission-storage work resolves on later microtasks. A macrotask tick drains them.
const flushAsyncWork = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('OutgoingResponseInterceptor — tz5 / ML-DSA-44 permission response (FR-005 / FR-007d)', () => {
  it('accepts a tz5 account end-to-end and stores the derived tz5 address (TC-d)', async () => {
    // Wallet returns only the mdpk public key; the SDK must derive the tz5 address.
    const { config, addPermission, interceptorCallback } = buildConfig(
      permissionMessage({ publicKey: MDPK_PUBLIC_KEY })
    )

    await OutgoingResponseInterceptor.intercept(config)
    await flushAsyncWork()

    // The connection completes (response echoed back to the dApp)...
    expect(interceptorCallback).toHaveBeenCalledTimes(1)
    // ...and the active account stored is the canonical tz5 address derived from the key.
    expect(addPermission).toHaveBeenCalledTimes(1)
    const storedPermission = addPermission.mock.calls[0][0]
    expect(storedPermission.address).toBe(TZ5_ADDRESS_DERIVED)
    expect(storedPermission.publicKey).toBe(MDPK_PUBLIC_KEY)
  })

  it('accepts a tz5 account presented as an address only, with no public key (FR-001 edge)', async () => {
    const { config, addPermission } = buildConfig(
      permissionMessage({ address: TZ5_ADDRESS_DERIVED })
    )

    await OutgoingResponseInterceptor.intercept(config)
    await flushAsyncWork()
    expect(addPermission.mock.calls[0][0].address).toBe(TZ5_ADDRESS_DERIVED)
  })

  it('keeps a legacy tz1 account working unchanged (FR-006 regression)', async () => {
    // 64-char raw hex public key → tz1 address, the pre-feature behavior.
    const { config, addPermission } = buildConfig(
      permissionMessage({
        publicKey: 'e8466d57c1d54e5a3f4ae33988eb5cbb5c7bb2fa30d0f347ccd30f53ac527a97'
      })
    )

    await OutgoingResponseInterceptor.intercept(config)
    await flushAsyncWork()
    expect(addPermission.mock.calls[0][0].address.startsWith('tz1')).toBe(true)
  })
})
