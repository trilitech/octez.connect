import { BeaconMessageType, NetworkType, PermissionScope } from '@tezos-x/octez.connect-types'
import { TezosBlockchain } from '../src/blockchain'
import { TezosMessageType } from '../src/types/message-type'

// Authoritative tz5 (ML-DSA-44) test vectors, shared with
// octez.connect-utils crypto.test.ts. Re-homed here from the deleted
// flat-v2 OutgoingResponseInterceptor.tz5.test.ts: address derivation now
// lives in the parser, which both the dApp and the wallet route through.
const MDPK_PUBLIC_KEY =
  'mdpk2A7JWfJSqYhEc2qbcPptJhHLdwzciT2TvnTxsYmeRWf5qUUZBM1Jj5qoTPz4S9AGDS7xRmnUFgbqofm62sS1h4CNfps2dwoVgY6puEcxse8UeCii5C62z4FWwoNTonF9n8bTz3s5pXap4aQSbLsp4LU3zeq5UPT4iqmHooQbHb48QwHJB2GZogFCkUJCE8jFaQpaiYyzpVseZVrD5gAA1MoVrGQB7yJPKXaBr9fNV64tYirXF1ZCVCrDsB5XK8gFpT7DtHStpt8i8CbTg58a6qs3NKHLhsDJujNrPv4BD7cV6nkdbhMyS8U82NdTETYk3xtbhm7RPVqmtJKE8FDd9iVPJMFAQ8RRvJj3mtFazroUAC4436JbPzGLcPmGWYYLSjMKBDsmydE2qqf7CsHyxiet4LmFpCZZftUCURzuuHsDCs5Kw7VPR4jE65awhD7wndEUFE5dpdH5uXBWz3Da6Es6ijEnbMPsKpN7vrtVsURvQBzqKPmuVkdd4RdLoVXVxXEk87xmRM6NgAkiN9BBKw9BCAro1ro4pc7zDSVgggcajHLF2hvE95mN7bGV6NvJRioMKhcecoVJfhDZ61JpcqjqzRouBn7F3URjGyXRsv1WhqkhDLHtA6jfeevERtrAv2VZQdXLQaWGUjX2W7wcJY1CzHh6nSYiRdotPDRHnQu2HvKuSguARuQ1UZkx6Ziv3q5fWDJ6Jtaf7ShJMXTJhcjYLFUg5QpZX5CWAkKvMVPYibuiKeGi4KN8i7JAiWXtCqPA7Ei2Afh9uiPaHPF5Z9Muptg8zj25mqwSmY4DcDm7G8B28vk2eRwgr1WPYfxcS2Q9nGioM5gw8rCeH5zAiTf9q5MZQ5ztj3pd9Q25ev8YNb3xNkPb9ic5EkspABppy7aBgYHAxc8ixxe2G5iC774jkWnF3NGKMRrTdLG3UBtfLdNUY1bXFFBvf4Yg8i66kBTRvyRSdSoxFjgrZfNiG16XAWnSqMBGHsS56NGk1736BzKw1EAhVF8GX4P2mUdFj2h1YFdcAXubv4ojsWPh8LRgRKQ2R6iw58dSWyDN48PMQT91kQZtUwX4ZNwAjSEow5yoS2NSraVLFcrt9pyE1hjKgfnSb9d6H9zKXVcUuB7bRkeXaM1qzygnbskpzJ221tgB4EgT7y9nVew2koVtT53Sr7kFki3E4fG9rvuVukwHH73kBNbJY1U25KQHtEJcAjrpsg5A8GrBS7FTxKfBH47FfqnzfJCgHag4AoaXWSm7BnzFkJWPrZ6eBVDy3NMzhQcfQNjVTUaxTH21pWGE1Jhtq9rgDufy2EezLt7MXE2YeNGBTBh3eBKGyGJZ7M86PcMFeu96kj3F3kAqmYc3umz2QsMaqmAoKU2y3BrCsBYxLoC951n5DyqBMFh7mat6PhkEZv4XLeHXxbzaWvwWMT1H8gv2wejnWNZV7kiKVreH4AjUZtmN3KRpbFUdfmyKZMJGsvgrdt3L3xXDpjnUR52W9MX72YYNvjYwJC7BpbE9Xho4MEEFcgmPrTwbg5g4dV34NqueFEqJj2EnaMKFHMrENRKMeXKt3qt7ci6bD5DJpJLmhDpCmxRF86j7BqnC27ooE9qzBVbFhFmrTk7GxJ7ov2K9Y4zuCYrUiWNexqCm971Vgpv8wuaSAMiPSwCy3VtrACfjNrJhA2PuA9xmLEj4HMTgEDRQwjUUUuZT3unZQn8wrEW8oiXN9z5P7JWt9aZNyXNLSykBTtshKkrs1HDAPKzzKpHk4pJvmU99h8fz41Ej9SsPiSyMY9tTN3shfEqEL9'
const TZ5_ADDRESS_DERIVED = 'tz5dBkjzicFLcEp5HLwkpqbVv1tE9EVaxs6e'

const MAINNET_CAIP2 = 'tezos:NetXdQprcVkpaWU'
const GHOSTNET_CAIP2 = 'tezos:NetXnHfVqm9iesp'

const blockchain = new TezosBlockchain()

const permissionResponse = (blockchainData: Record<string, unknown>) =>
  ({
    blockchainIdentifier: 'tezos',
    type: BeaconMessageType.PermissionResponse,
    blockchainData: { appMetadata: { senderId: 's', name: 'w' }, scopes: [], ...blockchainData }
  }) as any

describe('TezosBlockchain.getAccountInfosFromPermissionResponse', () => {
  describe('legacy single-account branch (v3 peer)', () => {
    it('derives the tz5 address when the wallet supplies only an mdpk public key', async () => {
      const [account] = await blockchain.getAccountInfosFromPermissionResponse(
        permissionResponse({ publicKey: MDPK_PUBLIC_KEY }),
        '3'
      )
      expect(account.address).toBe(TZ5_ADDRESS_DERIVED)
      expect(account.publicKey).toBe(MDPK_PUBLIC_KEY)
      // The accountId must be derived from the derived address, not ''.
      expect(account.accountId).not.toBe('')
    })

    it('accepts an address-only account (no public key)', async () => {
      const [account] = await blockchain.getAccountInfosFromPermissionResponse(
        permissionResponse({ address: TZ5_ADDRESS_DERIVED }),
        '3'
      )
      expect(account.address).toBe(TZ5_ADDRESS_DERIVED)
    })

    it('keeps a legacy raw-hex key working (tz1 regression)', async () => {
      const [account] = await blockchain.getAccountInfosFromPermissionResponse(
        permissionResponse({
          publicKey: 'e8466d57c1d54e5a3f4ae33988eb5cbb5c7bb2fa30d0f347ccd30f53ac527a97'
        }),
        '3'
      )
      expect(account.address.startsWith('tz1')).toBe(true)
      // Raw keys are canonicalized (prefixed) at ingest.
      expect(account.publicKey.startsWith('edpk')).toBe(true)
    })
  })

  describe('v4 multi-network fanout', () => {
    it('returns one account per valid CAIP-2 key with per-entry address derivation', async () => {
      const accounts = await blockchain.getAccountInfosFromPermissionResponse(
        permissionResponse({
          accounts: {
            [MAINNET_CAIP2]: { publicKey: MDPK_PUBLIC_KEY },
            [GHOSTNET_CAIP2]: { address: TZ5_ADDRESS_DERIVED }
          }
        }),
        '4'
      )

      expect(accounts).toHaveLength(2)
      const mainnet = accounts.find((a) => a.network?.chainId === MAINNET_CAIP2)
      const ghostnet = accounts.find((a) => a.network?.chainId === GHOSTNET_CAIP2)
      // publicKey-only entry: address derived, never '' (wallet/dApp
      // identifier divergence regression).
      expect(mainnet?.address).toBe(TZ5_ADDRESS_DERIVED)
      expect(ghostnet?.address).toBe(TZ5_ADDRESS_DERIVED)
      // Same address on two chains must yield two distinct identifiers.
      expect(mainnet?.accountId).not.toBe(ghostnet?.accountId)
    })

    it('drops entries under malformed CAIP-2 keys', async () => {
      const accounts = await blockchain.getAccountInfosFromPermissionResponse(
        permissionResponse({
          accounts: {
            [MAINNET_CAIP2]: { address: TZ5_ADDRESS_DERIVED },
            'tezos:not a chain id!': { address: TZ5_ADDRESS_DERIVED }
          }
        }),
        '4'
      )
      expect(accounts).toHaveLength(1)
    })

    it('falls back to the legacy branch below v4 even when a fanout is present', async () => {
      const accounts = await blockchain.getAccountInfosFromPermissionResponse(
        permissionResponse({
          address: TZ5_ADDRESS_DERIVED,
          accounts: { [MAINNET_CAIP2]: { publicKey: MDPK_PUBLIC_KEY } }
        }),
        '3'
      )
      expect(accounts).toHaveLength(1)
      expect(accounts[0].network).toBeUndefined()
    })
  })
})

describe('TezosBlockchain.validateResponse (ported flat-v2 permission checks)', () => {
  it('rejects a permission response with neither publicKey nor address', async () => {
    await expect(blockchain.validateResponse(permissionResponse({}))).rejects.toThrow(
      'PublicKey or Address must be defined'
    )
  })

  it('rejects an invalid address', async () => {
    await expect(
      blockchain.validateResponse(permissionResponse({ address: 'javascript:alert(1)' }))
    ).rejects.toThrow(/Invalid address/)
  })

  it('rejects an abstracted account whose address is not a KT1 contract', async () => {
    await expect(
      blockchain.validateResponse(
        permissionResponse({ address: TZ5_ADDRESS_DERIVED, walletType: 'abstracted_account' })
      )
    ).rejects.toThrow(/abstracted account/)
  })

  it('accepts a publicKey-only response by deriving the address', async () => {
    await expect(
      blockchain.validateResponse(permissionResponse({ publicKey: MDPK_PUBLIC_KEY }))
    ).resolves.toBeUndefined()
  })

  it('validates every entry of a v4 fanout', async () => {
    await expect(
      blockchain.validateResponse(
        permissionResponse({
          accounts: {
            [MAINNET_CAIP2]: { address: TZ5_ADDRESS_DERIVED },
            [GHOSTNET_CAIP2]: { address: 'garbage' }
          }
        })
      )
    ).rejects.toThrow(/Invalid address/)
  })

  it('ignores non-permission responses', async () => {
    await expect(
      blockchain.validateResponse({
        blockchainIdentifier: 'tezos',
        type: BeaconMessageType.BlockchainResponse,
        blockchainData: {}
      } as any)
    ).resolves.toBeUndefined()
  })
})

describe('TezosBlockchain.validateRequest', () => {
  const request = (blockchainData: Record<string, unknown>) =>
    ({
      blockchainIdentifier: 'tezos',
      type: BeaconMessageType.BlockchainRequest,
      accountId: 'acc',
      blockchainData
    }) as any

  it('accepts a well-formed operation request', async () => {
    await expect(
      blockchain.validateRequest(
        request({
          type: TezosMessageType.operation_request,
          scope: PermissionScope.OPERATION_REQUEST,
          network: MAINNET_CAIP2,
          operationDetails: [{ kind: 'transaction' }],
          sourceAddress: TZ5_ADDRESS_DERIVED
        })
      )
    ).resolves.toBeUndefined()
  })

  it.each([
    ['missing network', { type: TezosMessageType.operation_request, operationDetails: [{}], sourceAddress: 'tz1a' }],
    ['empty operationDetails', { type: TezosMessageType.operation_request, network: MAINNET_CAIP2, operationDetails: [], sourceAddress: 'tz1a' }],
    ['missing payload', { type: TezosMessageType.sign_payload_request, signingType: 'raw' }],
    ['missing signedTransaction', { type: TezosMessageType.broadcast_request, network: { type: NetworkType.MAINNET } }],
    ['missing contractAddress', { type: TezosMessageType.proof_of_event_challenge_request, payload: 'p' }],
    ['unknown type', { type: 'teleport_request' }]
  ])('rejects %s', async (_label, blockchainData) => {
    await expect(blockchain.validateRequest(request(blockchainData))).rejects.toThrow()
  })

  it('passes permission requests through untouched', async () => {
    await expect(
      blockchain.validateRequest({
        blockchainIdentifier: 'tezos',
        type: BeaconMessageType.PermissionRequest,
        blockchainData: {}
      } as any)
    ).resolves.toBeUndefined()
  })
})
