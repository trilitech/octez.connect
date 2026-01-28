import { NetworkType } from '@tezos-x/beacon-types'

export interface Network {
  type: NetworkType
  name?: string
  rpcUrl?: string
}
