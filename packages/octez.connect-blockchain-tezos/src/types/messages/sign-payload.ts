import {
  BlockchainRequestV3,
  BlockchainResponseV3,
  PermissionScope,
  SigningType
} from '@tezos-x/octez.connect-types'
import { TezosMessageType } from '../message-type'

export interface TezosSignPayloadRequest extends BlockchainRequestV3<'tezos'> {
  blockchainData: {
    type: TezosMessageType.sign_payload_request
    scope: PermissionScope.SIGN
    signingType: SigningType
    payload: string
    sourceAddress: string
  }
}

export interface TezosSignPayloadResponse extends BlockchainResponseV3<'tezos'> {
  blockchainData: {
    type: TezosMessageType.sign_payload_response
    signingType: SigningType
    signature: string
  }
}
