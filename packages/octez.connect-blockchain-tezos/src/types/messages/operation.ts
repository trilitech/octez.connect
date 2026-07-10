import {
  BlockchainRequestV3,
  BlockchainResponseV3,
  Network,
  PartialTezosOperation,
  PermissionScope
} from '@tezos-x/octez.connect-types'
import { TezosMessageType } from '../message-type'

export interface TezosOperationRequest extends BlockchainRequestV3<'tezos'> {
  blockchainData: {
    type: TezosMessageType.operation_request
    scope: PermissionScope.OPERATION_REQUEST
    /** `Network` object toward v3 peers; CAIP-2 string on v4 envelopes. */
    network: Network | string
    operationDetails: PartialTezosOperation[]
    sourceAddress: string
  }
}

export interface TezosOperationResponse extends BlockchainResponseV3<'tezos'> {
  blockchainData: {
    type: TezosMessageType.operation_response
    transactionHash: string
  }
}
