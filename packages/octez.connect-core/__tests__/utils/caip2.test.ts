import { NetworkType } from '@tezos-x/octez.connect-types'
import {
  normalizeTezosCaip2,
  isValidTezosCaip2,
  TEZOS_NETWORK_GENESIS_IDS,
  tezosCaip2FromNetworkType,
  networkTypeFromTezosCaip2
} from '../../src/utils/caip2'

describe('tezos CAIP-2 helpers', () => {
  it('normalizeTezosCaip2 adds the prefix only when absent', () => {
    expect(normalizeTezosCaip2('NetXdQprcVkpaWU')).toBe('tezos:NetXdQprcVkpaWU')
    expect(normalizeTezosCaip2('tezos:NetXdQprcVkpaWU')).toBe('tezos:NetXdQprcVkpaWU')
  })

  it('isValidTezosCaip2 requires the tezos namespace', () => {
    expect(isValidTezosCaip2('tezos:NetXdQprcVkpaWU')).toBe(true)
    expect(isValidTezosCaip2('NetXdQprcVkpaWU')).toBe(false)
  })
})

describe('NetworkType ↔ genesis chain id table', () => {
  // Ids are RPC-sourced (`/chains/main/chain_id`) and locked here — a change
  // to this table means a network relaunched and MIGRATION.md must be updated.
  it.each([
    [NetworkType.MAINNET, 'NetXdQprcVkpaWU'],
    [NetworkType.GHOSTNET, 'NetXnHfVqm9iesp'],
    [NetworkType.SHADOWNET, 'NetXsqzbfFenSTS'],
    [NetworkType.USHUAIANET, 'NetXpX8WSZkAZZA']
  ])('%s → %s', (type, genesis) => {
    expect(TEZOS_NETWORK_GENESIS_IDS[type]).toBe(genesis)
    expect(tezosCaip2FromNetworkType(type)).toBe(`tezos:${genesis}`)
  })

  it.each([
    ['rotating genesis', NetworkType.WEEKLYNET],
    ['rotating genesis', NetworkType.DAILYNET],
    ['no fixed genesis', NetworkType.CUSTOM],
    ['no RPC-sourced id yet', NetworkType.TALLINNNET],
    ['no RPC-sourced id yet', NetworkType.SEOULNET],
    ['no RPC-sourced id yet', NetworkType.TEZLINK_SHADOWNET],
    ['no RPC-sourced id yet', NetworkType.TEZOSX_PREVIEWNET]
  ])('unmappable (%s): %s', (_reason, type) => {
    expect(tezosCaip2FromNetworkType(type)).toBeUndefined()
  })

  it('round-trips through networkTypeFromTezosCaip2 (bare and prefixed)', () => {
    expect(networkTypeFromTezosCaip2('tezos:NetXdQprcVkpaWU')).toBe(NetworkType.MAINNET)
    expect(networkTypeFromTezosCaip2('NetXnHfVqm9iesp')).toBe(NetworkType.GHOSTNET)
    expect(networkTypeFromTezosCaip2('tezos:NetXunknown')).toBeUndefined()
  })
})
