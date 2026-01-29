export * from '@tezos-x/octez.connect-core'
export * from '@tezos-x/octez.connect-transport-matrix'
export * from '@tezos-x/octez.connect-transport-postmessage'
export * from '@tezos-x/octez.connect-types'
export * from '@tezos-x/octez.connect-utils'
export * from '@tezos-x/octez.connect-ui'

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
