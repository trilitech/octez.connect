import { ChangeAccountRequestV3 } from '@tezos-x/octez.connect-types'
import { TezosPermissionResponseBlockchainData } from './permission-response'

/**
 * Wallet-initiated account switch. Shape-identical payload to the permission
 * response so receivers materialize accounts through the same parser.
 */
export interface TezosChangeAccountRequest extends ChangeAccountRequestV3<'tezos'> {
  blockchainData: TezosPermissionResponseBlockchainData
}
