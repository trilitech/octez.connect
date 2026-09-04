import { ExposedPromise, generateGUID } from '@tezos-x/octez.connect-utils'
import {
  ConnectionContext,
  TransportType,
  TransportStatus,
  BeaconBaseMessage,
  AccountInfo,
  PeerInfo,
  AppMetadata,
  BeaconRequestMessage,
  BeaconMessageWrapper,
  NodeDistributions,
  Blockchain
} from '@tezos-x/octez.connect-types'
import { DEFAULT_PROTOCOL_VERSION } from '../../constants'
import { BeaconClient } from '../beacon-client/BeaconClient'
import { AccountManager } from '../../managers/AccountManager'
import { getSenderId } from '../../utils/get-sender-id'
import { Logger } from '../../utils/Logger'
import { ClientOptions } from './ClientOptions'
import { Transport } from '../../transports/Transport'
import { Serializer } from '../../Serializer'
import { buildDisconnectMessage, effectivePeerVersion } from '../../utils/message-utils'
import { getPreferredMessageProtocolVersion } from '../../message-protocol'

const logger = new Logger('Client')

/**
 * @internalapi
 *
 * This abstract class handles the a big part of the logic that is shared between the dapp and wallet client.
 * For example, it selects and manages the transport and accounts.
 */
export abstract class Client extends BeaconClient {
  protected readonly accountManager: AccountManager
  protected readonly blockchains: Map<string, Blockchain> = new Map()

  protected handleResponse: (
    _event: BeaconRequestMessage | BeaconMessageWrapper<BeaconBaseMessage>,
    connectionInfo: ConnectionContext
  ) => void

  /**
   * How many requests can be sent after another
   */
  protected readonly rateLimit: number = 2
  /**
   * The time window in seconds in which the "rateLimit" is checked
   */
  protected readonly rateLimitWindowInSeconds: number = 5

  /**
   * Stores the times when requests have been made to determine if the rate limit has been reached
   */
  protected requestCounter: number[] = []

  protected readonly matrixNodes: NodeDistributions

  /**
   * One subscription per transport type, together with the transport instance
   * it is attached to. The instance is needed to detach: a replaced transport
   * outlives the client's reference to it (`disconnect()` and
   * `handleDisconnect()` only null the reference), so removing the listener
   * from the *incoming* transport would leave the old one subscribed.
   */
  private readonly transportListeners: Map<
    TransportType,
    {
      transport: Transport
      listener: (message: unknown, connectionInfo: ConnectionContext) => Promise<void>
    }
  > = new Map()

  protected _transport: ExposedPromise<Transport<any>> = new ExposedPromise()
  protected get transport(): Promise<Transport<any>> {
    return this._transport.promise
  }

  /**
   * Returns the connection status of the Client
   */
  public get connectionStatus(): TransportStatus {
    return this._transport.promiseResult?.connectionStatus ?? TransportStatus.NOT_CONNECTED
  }

  /**
   * Returns whether or not the transaport is ready
   */
  public get ready(): Promise<void> {
    return this.transport.then(() => undefined)
  }

  constructor(config: ClientOptions) {
    super(config)

    this.accountManager = new AccountManager(config.storage)
    this.matrixNodes = config.matrixNodes ?? {}

    this.handleResponse = (
      message: BeaconBaseMessage | BeaconMessageWrapper<BeaconBaseMessage>,
      connectionInfo: ConnectionContext
    ): void => {
      throw new Error(
        `not overwritten${JSON.stringify(message)} - ${JSON.stringify(connectionInfo)}`
      )
    }
  }
  protected async cleanup() {
    if (!this.transportListeners.size) {
      return
    }

    // Each subscription is removed from the transport it is attached to.
    // Going through `this.transport` removed them all from whichever transport
    // was active, and removed none when no transport was resolved -- the state
    // `disconnect()` leaves behind.
    await Promise.all(
      Array.from(this.transportListeners.values()).map(({ transport, listener }) =>
        transport.removeListener(listener)
      )
    )
    this.transportListeners.clear()
  }

  /**
   * Register a blockchain to the client
   * @param chain The blockchain to register
   */
  public addBlockchain(chain: Blockchain) {
    this.blockchains.set(chain.identifier, chain)
    for (const legacyIdentifier of chain.legacyIdentifiers ?? []) {
      this.blockchains.set(legacyIdentifier, chain)
    }
  }

  /**
   * Remove a blockchain from the client by its identifier
   * @param chainIdentifier The identifier of the blockchain to remove
   */
  public removeBlockchain(chainIdentifier: string) {
    const chain = this.blockchains.get(chainIdentifier)
    this.blockchains.delete(chainIdentifier)
    for (const legacyIdentifier of chain?.legacyIdentifiers ?? []) {
      this.blockchains.delete(legacyIdentifier)
    }
  }

  /**
   * Return all locally known accounts
   */
  public async getAccounts(): Promise<AccountInfo[]> {
    return this.accountManager.getAccounts()
  }

  /**
   * Return the account by ID
   * @param accountIdentifier The ID of an account
   */
  public async getAccount(accountIdentifier: string): Promise<AccountInfo | undefined> {
    return this.accountManager.getAccount(accountIdentifier)
  }

  /**
   * Remove the account by ID
   * @param accountIdentifier The ID of an account
   */
  public async removeAccount(accountIdentifier: string): Promise<void> {
    return this.accountManager.removeAccount(accountIdentifier)
  }

  /**
   * Remove all locally stored accounts
   */
  public async removeAllAccounts(): Promise<void> {
    return this.accountManager.removeAllAccounts()
  }

  /**
   * Add a new request (current timestamp) to the pending requests, remove old ones and check if we are above the limit
   */
  public async addRequestAndCheckIfRateLimited(): Promise<boolean> {
    const now: number = new Date().getTime()
    this.requestCounter = this.requestCounter.filter(
      (date) => date + this.rateLimitWindowInSeconds * 1000 > now
    )

    this.requestCounter.push(now)

    return this.requestCounter.length > this.rateLimit
  }

  /**
   * This method initializes the client. It will check if the connection should be established to a
   * browser extension or if the P2P transport should be used.
   *
   * @param transport A transport that can be provided by the user
   */
  public async init(transport: Transport<any, any, any>): Promise<TransportType> {
    if (this._transport.isResolved()) {
      return (await this.transport).type
    }

    await this.setTransport(transport) // Let users define their own transport

    return transport.type
  }

  /**
   * Returns the metadata of this DApp
   */
  public async getOwnAppMetadata(): Promise<AppMetadata> {
    return {
      senderId: await getSenderId(await this.beaconId),
      name: this.name,
      icon: this.iconUrl
    }
  }

  /**
   * Return all known peers
   */
  public async getPeers(): Promise<PeerInfo[]> {
    return (await this.transport).getPeers()
  }

  /**
   * Add a new peer to the known peers
   * @param peer The new peer to add
   */
  public async addPeer(peer: PeerInfo): Promise<void> {
    return (await this.transport).addPeer(peer)
  }

  public async destroy(): Promise<void> {
    // Subscriptions are detached from their own transports, so this no longer
    // needs an active one -- after disconnect() there is none, and that is
    // precisely when the orphaned subscriptions have to go.
    await this.cleanup()

    if (this._transport.isResolved()) {
      const transport = await this.transport
      await transport.disconnect()
      if (transport.type === TransportType.WALLETCONNECT) {
        await (transport as any).doClientCleanup() // any because I cannot import the type definition
      }
    }
    await super.destroy()
  }

  /**
   * A "setter" for when the transport needs to be changed.
   */
  protected async setTransport(transport?: Transport<any>): Promise<void> {
    if (transport) {
      if (this._transport.isSettled()) {
        // If the promise has already been resolved we need to create a new one.
        this._transport = ExposedPromise.resolve(transport)
      } else {
        this._transport.resolve(transport)
      }
    } else {
      if (this._transport.isSettled()) {
        // If the promise has already been resolved we need to create a new one.
        this._transport = new ExposedPromise()
      }
    }
  }

  protected async addListener(transport: Transport<any>): Promise<void> {
    // in beacon we subscribe to the transport on client init only
    // unsubscribing from the transport is only beneficial when running
    // a single page dApp.
    // However, while running a multiple tabs setup, if one of the dApps disconnects
    // the others wont't recover until after a page refresh

    // Detach the previous subscription from the transport it is actually
    // attached to. Calling removeListener on the incoming transport, which never
    // had it, left every replaced transport subscribed: they share the client's
    // key pair, so each one kept decrypting wallet messages and routing them into
    // handleResponse -- once per past connection.
    const previous = this.transportListeners.get(transport.type)
    if (previous) {
      await previous.transport.removeListener(previous.listener)
    }

    const subscription = async (message: any, connectionInfo: ConnectionContext) => {
      if (typeof message !== 'string') {
        return
      }

      const peer = await this.findPeer(connectionInfo.id, transport)
      const protocolVersion = this.getPeerProtocolVersion(peer)

      const deserializedMessage = (await new Serializer(protocolVersion).deserialize(
        message
      )) as BeaconRequestMessage
      this.handleResponse(deserializedMessage, connectionInfo)
    }

    this.transportListeners.set(transport.type, { transport, listener: subscription })

    transport.addListener(subscription).catch((error) => logger.error('addListener', error))
  }

  protected async sendDisconnectToPeer(peer: PeerInfo, transport?: Transport<any>): Promise<void> {
    const id = await generateGUID()
    const senderId = await getSenderId(await this.beaconId)

    // The disconnect ships in the peer's negotiated dialect: wrapped for
    // v3+ peers, the flat legacy shape for v2 peers (which would silently
    // ignore a wrapped envelope).
    const request = buildDisconnectMessage({ id, senderId }, effectivePeerVersion(peer))

    const protocolVersion = this.getPeerProtocolVersion(peer)
    const payload = await new Serializer(protocolVersion).serialize(request)
    const selectedTransport = transport ?? (await this.transport)

    await selectedTransport.send(payload, peer)
  }

  /**
   * Look a peer up by the id the transport attached to a message, on the
   * transport that delivered it.
   *
   * The transport is a parameter rather than a lookup because every caller
   * already has one: a message can only have been delivered by a transport
   * that exists. Reaching for `this.transport` instead parked every arrival
   * between a disconnection and the next pairing -- setTransport(undefined)
   * leaves `_transport` unsettled, so the await only returned once a later
   * pairing resolved it, and the message was replayed into that connection.
   *
   * `connectionInfo.id` is the peer's public key over P2P, but the browser
   * extension's id over postMessage, where the transport cannot tell which
   * peer's key decrypted the message. Match either: only a postMessage
   * pairing response carries an `extensionId`, so the fallback is inert for
   * every other peer.
   */
  protected async findPeer(
    id: string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: Transport<any>
  ): Promise<PeerInfo | undefined> {
    if (!id) {
      return undefined
    }

    const peers = await transport.getPeers()

    return (
      peers.find((peerInfo) => peerInfo.publicKey === id) ??
      // Newest first. `addPeer` dedupes by public key, so a wallet that rotated
      // its beacon key -- a reinstall, a reset -- leaves the stale peer in place
      // beside the new one, both carrying the same extension id. A fresh pairing
      // has to shadow the stale peer, not the other way round.
      [...peers]
        .reverse()
        .find((peerInfo) => 'extensionId' in peerInfo && peerInfo.extensionId === id)
    )
  }

  private getLocalProtocolVersion(): number {
    const localPreferredRaw = Number(getPreferredMessageProtocolVersion())
    return Number.isFinite(localPreferredRaw) && localPreferredRaw >= DEFAULT_PROTOCOL_VERSION
      ? localPreferredRaw
      : DEFAULT_PROTOCOL_VERSION
  }

  private extractPeerProtocolVersion(peer?: PeerInfo): number {
    if (!peer) {
      return DEFAULT_PROTOCOL_VERSION
    }

    const peerProtocolRaw =
      typeof peer.protocolVersion === 'number' ? peer.protocolVersion : Number(peer.protocolVersion)
    return Number.isFinite(peerProtocolRaw) && peerProtocolRaw >= DEFAULT_PROTOCOL_VERSION
      ? peerProtocolRaw
      : DEFAULT_PROTOCOL_VERSION
  }

  protected getPeerProtocolVersion(peer?: PeerInfo): number {
    const localVersion = this.getLocalProtocolVersion()
    const peerVersion = this.extractPeerProtocolVersion(peer)

    return Math.min(peerVersion, localVersion)
  }
}
