import { Logger, Transport, PeerManager } from '@tezos-x/octez.connect-core'
import {
  ConnectionContext,
  ExtendedP2PPairingResponse,
  Storage,
  StorageKey,
  TransportStatus,
  TransportType,
  Origin,
  P2PPairingRequest,
  NodeDistributions
} from '@tezos-x/octez.connect-types'
import { KeyPair } from '@tezos-x/octez.connect-utils'
import { P2PCommunicationClient } from './communication-client/P2PCommunicationClient'

const logger = new Logger('P2PTransport')

/**
 * @internalapi
 *
 *
 */
export class P2PTransport<
  T extends P2PPairingRequest | ExtendedP2PPairingResponse,
  K extends StorageKey.TRANSPORT_P2P_PEERS_DAPP | StorageKey.TRANSPORT_P2P_PEERS_WALLET
> extends Transport<T, K, P2PCommunicationClient> {
  public readonly type: TransportType = TransportType.P2P

  constructor(
    name: string,
    keyPair: KeyPair,
    storage: Storage,
    matrixNodes: NodeDistributions,
    storageKey: K,
    iconUrl?: string,
    appUrl?: string
  ) {
    super(
      name,
      new P2PCommunicationClient(name, keyPair, 1, storage, matrixNodes, iconUrl, appUrl),
      new PeerManager<K>(storage, storageKey)
    )
  }

  public static async isAvailable(): Promise<boolean> {
    return Promise.resolve(true)
  }

  public async connect(): Promise<void> {
    if (this._isConnected !== TransportStatus.NOT_CONNECTED) {
      return
    }

    logger.log('connect')
    this._isConnected = TransportStatus.CONNECTING

    await this.client.start()

    // A disconnect() that ran while start() was pending has already stopped
    // the client (start() shuts a client stopped mid-login down itself), and
    // the client promise it left behind never resolves: going on would hang
    // on startOpenChannelListener(). Nothing to do but stop here.
    if (this._isConnected !== TransportStatus.CONNECTING) {
      return
    }

    const knownPeers = await this.getPeers()

    if (knownPeers.length > 0) {
      logger.log('connect', `connecting to ${knownPeers.length} peers`)
      const connectionPromises = knownPeers.map(async (peer) => this.listen(peer.publicKey))
      Promise.all(connectionPromises).catch((error) => logger.error('connect', error))
    }

    await this.startOpenChannelListener()

    return super.connect()
  }

  public async disconnect(): Promise<void> {
    await this.client.stop()

    return super.disconnect()
  }

  public async startOpenChannelListener(): Promise<void> {
    //
  }

  public async getPairingRequestInfo(): Promise<P2PPairingRequest> {
    return this.client.getPairingRequestInfo()
  }

  public async listen(publicKey: string): Promise<void> {
    await this.client
      .listenForEncryptedMessage(publicKey, (message) => {
        const connectionContext: ConnectionContext = {
          origin: Origin.P2P,
          id: publicKey
        }

        this.notifyListeners(message, connectionContext).catch((error) => {
          throw error
        })
      })
      .catch((error) => {
        throw error
      })
  }
}
