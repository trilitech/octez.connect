import { BeaconBaseMessage } from '../BeaconBaseMessage'
import { BeaconMessageType } from '../BeaconMessageType'
import { PermissionScope } from '../PermissionScope'
import { AppMetadata } from '../AppMetadata'
import { Network } from '../Network'
import { RequestPermissionNetwork } from '../../RequestPermissionInput'

/**
 * @category Message
 */
export interface PermissionRequest extends BeaconBaseMessage {
  type: BeaconMessageType.PermissionRequest
  appMetadata: AppMetadata // Some additional information about the DApp
  network: Network // Default network on which the permissions are requested. To request permissions on multiple networks in a single call, use the `networks` field below (v4+ wallets); legacy wallets only honor this single network per request.

  /**
   * Optional multi-network permission request. When non-empty, a v4 wallet
   * returns an `accounts` map keyed by chainId. On the wire this field
   * travels inside the wrapped payload (`blockchainData.networks`) and is
   * stripped for peers negotiated below v4; this flat shape is the
   * normalized API view on both the dApp and wallet side.
   */
  networks?: RequestPermissionNetwork[]
  scopes: PermissionScope[] // The permission scopes that the DApp is asking for
}
