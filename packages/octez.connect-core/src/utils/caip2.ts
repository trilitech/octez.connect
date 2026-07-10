/**
 * CAIP-2 chain id helpers, scoped to the Tezos namespace (`tezos:<reference>`).
 *
 * The wire format accepts both the bare reference (`NetXsqzbfFenSTS`) and the
 * full CAIP-2 string (`tezos:NetXsqzbfFenSTS`); SDK code consistently stores
 * and routes on the full form.
 */
import { Network, NetworkType } from '@tezos-x/octez.connect-types'

const TEZOS_CAIP2_PREFIX = 'tezos:'

const TEZOS_CAIP2_RE = /^tezos:[A-Za-z0-9]+$/

/**
 * Returns `chainId` with the `tezos:` prefix added if absent. No validation
 * is performed; use `isValidTezosCaip2` at API boundaries.
 */
export const normalizeTezosCaip2 = (chainId: string): string =>
  chainId.startsWith(TEZOS_CAIP2_PREFIX) ? chainId : `${TEZOS_CAIP2_PREFIX}${chainId}`

/**
 * Whether `value` is a syntactically valid Tezos CAIP-2 chain id
 * (`tezos:<alphanumeric reference>`).
 */
export const isValidTezosCaip2 = (value: string): boolean => TEZOS_CAIP2_RE.test(value)

/**
 * Build the minimal `Network` for a Tezos CAIP-2 chain id. Single source of
 * truth for the `{ type: CUSTOM, chainId, ... }` shape, so the network used
 * to derive an account identifier is constructed identically everywhere
 * (permission storage, operation-request lookup, stale-scheme scan). `name`
 * defaults to the chain id when the wallet supplies no human label.
 */
export const networkFromTezosCaip2 = (
  chainId: string,
  opts?: { name?: string; rpcUrl?: string }
): Network => ({
  type: NetworkType.CUSTOM,
  name: opts?.name ?? chainId,
  rpcUrl: opts?.rpcUrl,
  chainId
})

/**
 * Canonical NetworkType → genesis chain id (CAIP-2 reference) table.
 *
 * Applied ONLY at boundaries that must translate between the named-network
 * vocabulary (WalletConnect session namespaces use `tezos:<name>`) and the
 * genesis-keyed CAIP-2 vocabulary of the beacon v4 multi-network protocol.
 *
 * Sourcing rule: ids are read from the network's own RPC
 * (`/chains/main/chain_id`) and locked by unit test — never guessed. Networks
 * without an entry are not statically mappable and multi-network requests for
 * them can only travel over transports that pass chain ids through opaquely
 * (P2P/postmessage):
 * - WEEKLYNET / DAILYNET rotate their genesis on every reset.
 * - CUSTOM has no fixed genesis by definition.
 * - TALLINNNET / SEOULNET / TEZLINK_SHADOWNET / TEZOSX_PREVIEWNET currently
 *   publish no queryable RPC in the teztnets registry; add their ids here
 *   (RPC-sourced) when available.
 * If a long-running network relaunches with a new genesis, its entry must be
 * updated in the same change that bumps the supported network.
 */
export const TEZOS_NETWORK_GENESIS_IDS: Partial<Record<NetworkType, string>> = {
  [NetworkType.MAINNET]: 'NetXdQprcVkpaWU',
  [NetworkType.GHOSTNET]: 'NetXnHfVqm9iesp',
  [NetworkType.SHADOWNET]: 'NetXsqzbfFenSTS',
  [NetworkType.USHUAIANET]: 'NetXpX8WSZkAZZA'
}

/**
 * Full CAIP-2 chain id (`tezos:NetX…`) for a named network, or `undefined`
 * when the network has no statically known genesis (see
 * {@link TEZOS_NETWORK_GENESIS_IDS}).
 */
export const tezosCaip2FromNetworkType = (type: NetworkType): string | undefined => {
  const genesis = TEZOS_NETWORK_GENESIS_IDS[type]

  return genesis === undefined ? undefined : `${TEZOS_CAIP2_PREFIX}${genesis}`
}

/**
 * Named network for a CAIP-2 chain id (bare or `tezos:`-prefixed), or
 * `undefined` when the id does not belong to a statically mapped network.
 */
export const networkTypeFromTezosCaip2 = (chainId: string): NetworkType | undefined => {
  const normalized = normalizeTezosCaip2(chainId)
  const reference = normalized.slice(TEZOS_CAIP2_PREFIX.length)

  return (Object.keys(TEZOS_NETWORK_GENESIS_IDS) as NetworkType[]).find(
    (type) => TEZOS_NETWORK_GENESIS_IDS[type] === reference
  )
}
