export * from '@tezos-x/beacon-core'
export * from '@tezos-x/beacon-transport-matrix'
export * from '@tezos-x/beacon-transport-postmessage'
export * from '@tezos-x/beacon-types'
export * from '@tezos-x/beacon-utils'
export * from '@tezos-x/beacon-ui'

import { DAppClient } from './dapp-client/DAppClient'
import { DAppClientOptions } from './dapp-client/DAppClientOptions'
import { BeaconEvent, BeaconEventHandler, defaultEventCallbacks } from './events'
import { BlockExplorer } from './utils/block-explorer'
import { TzktBlockExplorer } from './utils/tzkt-blockexplorer'
import { getDAppClientInstance } from './utils/get-instance'

export { DAppClient, DAppClientOptions, getDAppClientInstance }

// Events
export { BeaconEvent, BeaconEventHandler, defaultEventCallbacks }

// BlockExplorer
export { BlockExplorer, TzktBlockExplorer, TzktBlockExplorer as TezblockBlockExplorer }
