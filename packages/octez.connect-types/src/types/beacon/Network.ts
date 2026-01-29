import { NetworkType } from '@tezos-x/octez.connect-types'

export interface Network {
  type: NetworkType
  name?: string
  rpcUrl?: string
}
