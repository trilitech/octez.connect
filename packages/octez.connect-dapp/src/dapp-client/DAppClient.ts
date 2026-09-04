import bs58check from 'bs58check'
import {
  ConnectionContext,
  AccountInfo,
  TransportType,
  StorageKey,
  BeaconMessageType,
  PermissionScope,
  PermissionResponse,
  NetworkType,
  SignPayloadResponse,
  SignPayloadRequest,
  OperationResponse,
  OperationRequest,
  BroadcastResponse,
  BroadcastRequest,
  ErrorResponse,
  BeaconMessage,
  RequestPermissionInput,
  RequestPermissionNetwork,
  PermissionResponseAccounts,
  RequestSignPayloadInput,
  RequestOperationInput,
  RequestBroadcastInput,
  PermissionRequest,
  PermissionResponseOutput,
  PermissionRequestInput,
  SignPayloadResponseOutput,
  SignPayloadRequestInput,
  OperationResponseOutput,
  OperationRequestInput,
  BroadcastResponseOutput,
  BroadcastRequestInput,
  BeaconRequestInputMessage,
  Network,
  Origin,
  PeerInfo,
  BeaconErrorType,
  AppMetadata,
  ExtendedP2PPairingResponse,
  ExtendedPostMessagePairingResponse,
  SigningType,
  ExtendedPeerInfo,
  Optional,
  ColorMode,
  IgnoredRequestInputProperties,
  WalletInfo,
  BeaconMessageWrapper,
  Blockchain,
  BlockchainMessage,
  BlockchainRequestV3,
  BlockchainResponseV3,
  PermissionRequestV3,
  PermissionResponseV3,
  BeaconBaseMessage,
  AcknowledgeResponse,
  ExtendedWalletConnectPairingResponse,
  ProofOfEventChallengeRequest,
  ProofOfEventChallengeResponse,
  ProofOfEventChallengeRequestInput,
  RequestProofOfEventChallengeInput,
  ChangeAccountRequest,
  PeerInfoType,
  App,
  AppBase,
  DesktopApp,
  ExtensionApp,
  WebApp,
  SimulatedProofOfEventChallengeRequestInput,
  SimulatedProofOfEventChallengeRequest,
  SimulatedProofOfEventChallengeResponse,
  RequestSimulatedProofOfEventChallengeInput,
  TransportStatus,
  ErrorContext
  // PermissionRequestV3
  // RequestEncryptPayloadInput,
  // EncryptPayloadResponseOutput,
  // EncryptPayloadResponse,
  // EncryptPayloadRequest
} from '@tezos-x/octez.connect-types'
import {
  Client,
  Transport,
  AppMetadataManager,
  Serializer,
  LocalStorage,
  BeaconError,
  getAccountIdentifier,
  getSenderId,
  Logger,
  ClientEvents,
  StorageValidator,
  SDK_VERSION,
  IndexedDBStorage,
  MultiTabChannel,
  BACKEND_URL,
  getError,
  usesWrappedMessages,
  buildErrorContext,
  UnknownBeaconError,
  AbortedBeaconError,
  compareBeaconVersion,
  isMultiNetworkVersion,
  VersionUnsupportedBeaconError,
  NetworksUnsupportedBeaconError,
  normalizeTezosCaip2,
  isValidTezosCaip2,
  networkFromTezosCaip2,
  networkTypeFromTezosCaip2,
  resolveRequiredMinimumVersion,
  negotiateEnvelopeVersion,
  effectivePeerVersion,
  MESSAGE_WRAPPED_FROM_VERSION,
  DEFAULT_WALLETCONNECT_PROJECT_ID,
  wrapBeaconMessage
} from '@tezos-x/octez.connect-core'
import { TezosBlockchain } from '@tezos-x/octez.connect-blockchain-tezos'
import {
  getAddressFromPublicKey,
  ExposedPromise,
  generateGUID,
  toHex,
  signMessage,
  CONTRACT_PREFIX,
  prefixPublicKey,
  isValidAddress,
  getKeypairFromSeed
} from '@tezos-x/octez.connect-utils'
import { PostMessageTransport } from '@tezos-x/octez.connect-transport-postmessage'
import {
  AlertButton,
  closeToast,
  getColorMode,
  setColorMode,
  setDesktopList,
  setExtensionList,
  setWebList,
  setiOSList,
  getiOSList,
  getDesktopList,
  getExtensionList,
  getWebList,
  isBrowser,
  isDesktop,
  isMobileOS,
  isIOS,
  currentOS
} from '@tezos-x/octez.connect-ui'
import { WalletConnectTransport } from '@tezos-x/octez.connect-transport-walletconnect'
import { messageEvents } from '../beacon-message-events'
import { BlockExplorer } from '../utils/block-explorer'
import { BeaconEvent, BeaconEventHandlerFunction, BeaconEventType, BeaconEventHandler } from '../events'
import { TzktBlockExplorer } from '../utils/tzkt-blockexplorer'

import { DappPostMessageTransport } from '../transports/DappPostMessageTransport'
import { DappP2PTransport } from '../transports/DappP2PTransport'
import { DappWalletConnectTransport } from '../transports/DappWalletConnectTransport'
import { DAppClientOptions } from './DAppClientOptions'

const logger = new Logger('DAppClient')

// Surfaced when a permission response yields zero account records.
const EMPTY_PERMISSION_ACCOUNTS_MESSAGE =
  'Wallet permission response did not include any accounts. Please re-pair the wallet and try again.'

/**
 * @publicapi
 *
 * The DAppClient has to be used in decentralized applications. It handles all the logic related to connecting to beacon-compatible
 * wallets and sending requests.
 *
 * @category DApp
 */
export class DAppClient extends Client {
  /**
   * The description of the app
   */
  public readonly description?: string

  /**
   * The block explorer used by the SDK
   */
  public readonly blockExplorer: BlockExplorer

  /**
   * Automatically switch between apps on Mobile Devices (Enabled by Default)
   */
  private readonly enableAppSwitching: boolean

  /**
   * Enable metrics tracking (Disabled by Default)
   */
  private enableMetrics?: boolean

  private userId?: string

  public network: Network

  protected readonly events: BeaconEventHandler = new BeaconEventHandler()

  protected postMessageTransport: DappPostMessageTransport | undefined
  protected p2pTransport: DappP2PTransport | undefined
  protected walletConnectTransport: DappWalletConnectTransport | undefined

  protected wcProjectId?: string
  protected wcRelayUrl?: string

  /**
   * WalletConnect is enabled by default (as in 4.8.x) using the shared
   * DEFAULT_WALLETCONNECT_PROJECT_ID unless `walletConnectOptions` overrides it.
   * Set `disableWalletConnect: true` to opt out. When false, no WC transport is
   * built, listened to, or offered for pairing.
   */
  protected isWalletConnectEnabled: boolean = true

  private isGetActiveAccountHandled: boolean = false

  private readonly openRequestsOtherTabs = new Set<string>()
  /**
   * A map of requests that are currently "open", meaning we have sent them to a wallet and are still awaiting a response.
   */
  private readonly openRequests = new Map<
    string,
    ExposedPromise<
      {
        message: BeaconMessage | BeaconMessageWrapper<BeaconBaseMessage>
        connectionInfo: ConnectionContext
      },
      ErrorResponse
    >
  >()

  /**
   * The currently active account. For all requests that are associated to a specific request (operation request, signing request),
   * the active account is used to determine the network and destination wallet
   */
  private _activeAccount: ExposedPromise<AccountInfo | undefined> = new ExposedPromise()

  /**
   * The currently active peer. This is used to address a peer in case the active account is not set. (Eg. for permission requests)
   */
  private _activePeer: ExposedPromise<PeerInfoType | undefined> = new ExposedPromise()

  private _initPromise: Promise<TransportType> | undefined
  private _initPromiseReject: ((reason?: ErrorResponse | AbortedBeaconError) => void) | undefined
  private isInitPending: boolean = false

  /**
   * Networks mapped for the next WalletConnect session proposal when
   * `requestPermissions` runs before the WalletConnect transport exists (it
   * is created lazily in `init`). Applied and cleared right after creation.
   */
  private pendingWcProposalNetworks: NetworkType[] | undefined

  private readonly activeAccountLoaded: Promise<AccountInfo | undefined>

  private readonly appMetadataManager: AppMetadataManager

  private readonly termsAndConditionsUrl?: string

  private readonly privacyPolicyUrl?: string

  private readonly errorMessages: Record<string, Record<string | number, string>>

  private readonly featuredWallets: string[] | undefined

  public readonly requiredMinimumVersion: string

  private readonly storageValidator: StorageValidator

  private readonly beaconIDB = new IndexedDBStorage('beacon', ['bug_report', 'metrics'])

  private debounceSetActiveAccount: boolean = false

  private readonly multiTabChannel = new MultiTabChannel(
    'octez.connect-sdk-channel',
    this.onBCMessageHandler.bind(this),
    this.onElectedLeaderhandler.bind(this)
  )

  constructor(config: DAppClientOptions) {
    super({
      storage: config && config.storage ? config.storage : new LocalStorage(),
      ...config
    })
    this.description = config.description
    // WalletConnect is enabled BY DEFAULT (as in 4.8.x) with the shared
    // ecosystem projectId, so dApps don't have to register with WalletConnect
    // Cloud to offer WC wallets (e.g. Kukai Mobile) — the free tier covers the
    // ecosystem's volume. `walletConnectOptions` overrides the projectId/relay,
    // `disableWalletConnect: true` opts out entirely (e.g. environments where
    // the WC provider cannot run, see #32).
    this.isWalletConnectEnabled = !config.disableWalletConnect
    this.wcProjectId = this.isWalletConnectEnabled
      ? config.walletConnectOptions?.projectId || DEFAULT_WALLETCONNECT_PROJECT_ID
      : undefined
    this.wcRelayUrl = this.isWalletConnectEnabled ? config.walletConnectOptions?.relayUrl : undefined

    this.featuredWallets = config.featuredWallets

    this.events = new BeaconEventHandler(config.eventHandlers, config.disableDefaultEvents ?? false)
    this.blockExplorer = config.blockExplorer ?? new TzktBlockExplorer()
    this.network = config.network ?? { type: config.preferredNetwork ?? NetworkType.MAINNET }
    setColorMode(config.colorMode ?? ColorMode.LIGHT)

    this.termsAndConditionsUrl = config.termsAndConditionsUrl
    this.privacyPolicyUrl = config.privacyPolicyUrl

    this.errorMessages = config.errorMessages ?? {}

    this.appMetadataManager = new AppMetadataManager(this.storage)
    this.storageValidator = new StorageValidator(this.storage)

    this.enableAppSwitching =
      config.enableAppSwitching === undefined ? true : Boolean(config.enableAppSwitching)

    this.enableMetrics = config.enableMetrics ? true : false

    this.requiredMinimumVersion = resolveRequiredMinimumVersion(config.requiredMinimumVersion)

    // Tezos is the default chain: the wrapped-only pipeline routes every
    // request/response through the registry handler, so registration is no
    // longer a consumer obligation. addBlockchain stays public — a later
    // registration under 'tezos' overrides this default.
    this.addBlockchain(new TezosBlockchain())

    // Subscribe to storage changes and update the active account if it changes on other tabs
    this.storage.subscribeToStorageChanged(async (event) => {
      if (event.eventType === 'storageCleared') {
        this.setActiveAccount(undefined)

        return
      }
      if (event.eventType === 'entryModified') {
        if (event.key === this.storage.getPrefixedKey(StorageKey.ACTIVE_ACCOUNT)) {
          const accountIdentifier = event.newValue
          if (!accountIdentifier || accountIdentifier === 'undefined') {
            this.setActiveAccount(undefined)
          } else {
            const account = await this.getAccount(accountIdentifier)
            this.setActiveAccount(account)
          }

          return
        }
        if (event.key === this.storage.getPrefixedKey(StorageKey.ENABLE_METRICS)) {
          this.enableMetrics = Boolean(await this.storage.get(StorageKey.ENABLE_METRICS))

          return
        }
        if (event.key === this.storage.getPrefixedKey(StorageKey.BEACON_SDK_SECRET_SEED)) {
          this._keyPair = new ExposedPromise()
          this._beaconId = new ExposedPromise()
          await this.initSDK()

          return
        }
      }
    })

    this.activeAccountLoaded = this.storage
      .get(StorageKey.ACTIVE_ACCOUNT)
      .then(async (activeAccountIdentifier) => {
        if (activeAccountIdentifier) {
          const account = await this.accountManager.getAccount(activeAccountIdentifier)
          await this.setActiveAccount(account)

          return account
        } else {
          await this.setActiveAccount(undefined)

          return undefined
        }
      })
      .catch(async (storageError) => {
        logger.error(storageError)
        await this.resetInvalidState(false)
        this.events.emit(BeaconEvent.INVALID_ACCOUNT_DEACTIVATED)

        return undefined
      })

    this.handleResponse = async (
      wireMessage: BeaconMessage | BeaconMessageWrapper<BeaconBaseMessage>,
      connectionInfo: ConnectionContext
    ): Promise<void> => {
      // Negotiated wire: a flat arrival is the legacy v2 dialect (from a
      // v4.8.x wallet answering a flat request) and is already the shape the
      // pipeline consumes. Wrapped arrivals carry Tezos payloads that are
      // normalized back to those same flat shapes — the wire dialect stays
      // invisible to integrators. Non-Tezos wrapped payloads keep the
      // pass-through of the generic permissionRequest/request API.
      // The wrapped dialect is identified by its payload, not by the absence of
      // a flat marker: `wrapBeaconMessage` only ever emits
      // { id, version, senderId, message }. Routing on the version alone dropped
      // every flat message stamped with the wrapped dialect's number -- which is
      // how a wallet built outside this SDK (or on <= 4.8.6, echoing the peer's
      // version) sends its `disconnect` -- so handleDisconnect never ran and the
      // dApp kept the account connected until the user disconnected a second
      // time (#52). Testing for `.message` positively routes that message down
      // the flat path, and still reads a non-conformant wallet's wrapped
      // envelope as wrapped even when it carries a redundant top-level `type`.
      const hasWrappedPayload = Boolean(
        (wireMessage as BeaconMessageWrapper<BeaconBaseMessage>).message
      )
      const isWrapped = usesWrappedMessages(wireMessage.version) && hasWrappedPayload

      // Issue #33: a V3-versioned message can arrive without its wrapped payload.
      // With no top-level `type` either it carries nothing to route on, so drop
      // it instead of dereferencing an undefined payload, which would throw an
      // unhandled rejection inside the transport subscription callback.
      if (
        usesWrappedMessages(wireMessage.version) &&
        !hasWrappedPayload &&
        !('type' in wireMessage)
      ) {
        logger.log(
          'handleResponse',
          'Received wrapped message with undefined payload; dropping',
          wireMessage
        )

        return
      }

      const normalized = isWrapped
        ? this.normalizeWrappedTezosMessage(wireMessage as BeaconMessageWrapper<BeaconBaseMessage>)
        : (wireMessage as BeaconMessage)
      const message = normalized ?? wireMessage
      const typedMessage =
        normalized ?? (wireMessage as BeaconMessageWrapper<BeaconBaseMessage>).message

      let appMetadata: AppMetadata | undefined = normalized
        ? (typedMessage as PermissionResponse).appMetadata
        : (typedMessage as unknown as PermissionResponseV3).blockchainData?.appMetadata

      if (!appMetadata && !normalized) {
        const storedMetadata = await Promise.all([
          this.storage.get(StorageKey.TRANSPORT_P2P_PEERS_DAPP),
          this.storage.get(StorageKey.TRANSPORT_WALLETCONNECT_PEERS_DAPP),
          this.storage.get(StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP)
        ])

        for (const peers of storedMetadata) {
          const peer: any = peers.find((peer: any) => peer.senderId === message.senderId)
          if (!peer) {
            continue
          }

          const wallet = await this.getWalletInfo()

          appMetadata = {
            name: peer.name,
            senderId: peer.senderId,
            icon: wallet.icon
          }

          break
        }
      }

      if (this.openRequestsOtherTabs.has(message.id)) {
        // Relay the ORIGINAL wrapped envelope, not the normalized flat
        // message: the receiving tab funnels this straight back into its own
        // handleResponse, whose wrapped-only contract would drop a flat
        // arrival (version '4' with no `.message` payload) and leave the
        // other tab's request pending forever.
        this.multiTabChannel.postMessage({
          type: 'RESPONSE',
          data: {
            message: wireMessage,
            connectionInfo
          },
          id: message.id
        })

        if (typedMessage.type !== BeaconMessageType.Acknowledge) {
          this.openRequestsOtherTabs.delete(message.id)
        }

        return
      }

      const openRequest = this.openRequests.get(message.id)

      logger.log('### openRequest ###', openRequest)
      logger.log('handleResponse', 'Received message', message, connectionInfo)
      logger.log('### message ###', JSON.stringify(message))
      logger.log('### connectionInfo ###', connectionInfo)

      const handleDisconnect = async (): Promise<void> => {
        this.analytics.track('event', 'DAppClient', 'Disconnect received from Wallet')

        const relevantTransport =
          connectionInfo.origin === Origin.P2P
            ? this.p2pTransport
            : connectionInfo.origin === Origin.WALLETCONNECT
              ? this.walletConnectTransport
              : (this.postMessageTransport ?? (await this.transport))

        if (relevantTransport) {
          const peers: ExtendedPeerInfo[] = await relevantTransport.getPeers()
          const peer: ExtendedPeerInfo | undefined = peers.find(
            (peerEl) => peerEl.senderId === message.senderId
          )

          if (peer) {
            await relevantTransport.removePeer(peer)
          }
        }

        await this.removeAccountsForPeerIds([message.senderId])
        await this.events.emit(BeaconEvent.CHANNEL_CLOSED)

        // Reset transport state so next requestPermissions() shows pairing modal
        await this.dropTransports()
        await this.setTransport(undefined)
        await this.setActivePeer(undefined)
      }

      if (openRequest && typedMessage.type === BeaconMessageType.Acknowledge) {
        this.analytics.track('event', 'DAppClient', 'Acknowledge received from Wallet')
        logger.log('handleResponse', `acknowledge message received for ${message.id}`)

        this.events
          .emit(BeaconEvent.ACKNOWLEDGE_RECEIVED, {
            message: typedMessage as AcknowledgeResponse,
            extraInfo: {},
            walletInfo: await this.getWalletInfo()
          })
          .catch(console.error)
      } else if (openRequest) {
        // Define valid response types that should resolve a request
        const validResponseTypes = [
          BeaconMessageType.PermissionResponse,
          BeaconMessageType.OperationResponse,
          BeaconMessageType.SignPayloadResponse,
          BeaconMessageType.BroadcastResponse,
          BeaconMessageType.ProofOfEventChallengeResponse,
          BeaconMessageType.SimulatedProofOfEventChallengeResponse,
          BeaconMessageType.BlockchainResponse,
          BeaconMessageType.Error
        ]

        // Only process if it's a valid response type
        if (validResponseTypes.includes(typedMessage.type)) {
          if (typedMessage.type === BeaconMessageType.PermissionResponse && appMetadata) {
            await this.appMetadataManager.addAppMetadata(appMetadata)
          }

          if (typedMessage.type === BeaconMessageType.Error) {
            openRequest.reject(typedMessage as ErrorResponse)
          } else {
            openRequest.resolve({ message, connectionInfo })
          }
          this.openRequests.delete(typedMessage.id)
        } else {
          // Log unexpected message types but don't resolve the request
          logger.warn(
            'handleResponse',
            `Received unexpected message type "${typedMessage.type}" for request ${message.id}. Expected a response type, not a request type.`
          )
        }
      } else {
        if (typedMessage.type === BeaconMessageType.Disconnect) {
          await handleDisconnect()
        } else if (typedMessage.type === BeaconMessageType.ChangeAccountRequest) {
          await this.onNewAccount(typedMessage as ChangeAccountRequest, connectionInfo)
        }
      }

      if (this._transport.isResolved()) {
        const transport = await this.transport

        if (
          transport instanceof WalletConnectTransport &&
          !this.openRequests.has('session_update')
        ) {
          this.openRequests.set('session_update', new ExposedPromise())
        }
      }
    }

    this.storageValidator
      .validate()
      .then(async (isValid) => {
        const account = await this.activeAccountLoaded

        if (!isValid) {
          const info = await this.getWalletInfo(undefined, account, false)
          info.type =
            info.type === 'extension' && account?.origin.type === Origin.P2P ? 'mobile' : info.type
          await this.storage.set(StorageKey.LAST_SELECTED_WALLET, {
            icon: info.icon ?? '',
            key: info.name,
            type: info.type ?? 'web',
            name: info.name,
            url: info.deeplink
          })

          const nowValid = await this.storageValidator.validate()

          if (!nowValid) {
            this.resetInvalidState(false)
          }
        }

        if (account && account.origin.type !== 'p2p') {
          this.init()
        }
      })
      .catch((err) => logger.error(err.message))

    this.sendMetrics(
      `enable-metrics?${  this.addQueryParam('version', SDK_VERSION)}`,
      undefined,
      (res) => {
        if (!res.ok) {
          res.status === 426
            ? console.error('Metrics are no longer supported for this version, please upgrade.')
            : console.warn(
                'Network error encountered. Metrics sharing have been automatically disabled.'
              )
        }
        this.enableMetrics = res.ok
        this.storage.set(StorageKey.ENABLE_METRICS, res.ok)
      },
      () => {
        this.enableMetrics = false
        this.storage.set(StorageKey.ENABLE_METRICS, false)
      }
    )

    this.initUserID().catch((err) => logger.error(err.message))
  }

  private async checkIfBCLeaderExists() {
    // broadcast channel does not work on mobile
    if (isMobileOS(window)) {
      return true
    }

    const hasLeader = await this.multiTabChannel.hasLeader()

    if (hasLeader) {
      return this.multiTabChannel.isLeader()
    }

    await this.multiTabChannel.getLeadership()

    return this.multiTabChannel.isLeader()
  }

  private async onElectedLeaderhandler() {
    if (!this._transport.isResolved()) {
      return
    }

    const tranport = await this.transport

    if (tranport.type !== TransportType.WALLETCONNECT) {
      return
    }

    if (tranport.connectionStatus === TransportStatus.CONNECTED) {
      return
    }

    await tranport.connect()
  }

  private async onBCMessageHandler(message: any) {
    switch (message.type) {
      case BeaconMessageType.PermissionRequest:
      case BeaconMessageType.OperationRequest:
      case BeaconMessageType.SignPayloadRequest:
      case BeaconMessageType.BroadcastRequest:
      case BeaconMessageType.ProofOfEventChallengeRequest:
      case BeaconMessageType.SimulatedProofOfEventChallengeRequest:
        this.prepareRequest(message)
        break
      case BeaconMessageType.BlockchainRequest:
        this.prepareRequest(message, true)
        break
      case 'RESPONSE':
        this.handleResponse(message.data.message, message.data.connectionInfo)
        break
      case 'DISCONNECT':
        this._transport.isResolved() && this.disconnect()
        break
      default:
        logger.error('onBCMessageHandler', 'message type not recognized', message)
    }
  }

  private async prepareRequest(message: any, isV3 = false) {
    if (!this.multiTabChannel.isLeader()) {
      return
    }

    // block until the transport is ready
    const transport = (await this._transport.promise) as DappWalletConnectTransport
    await transport.waitForResolution()

    this.openRequestsOtherTabs.add(message.id)
    isV3
      ? this.makeRequestV3(message.data, message.id)
      : this.makeRequest(message.data, false, message.id)
  }

  private async createStateSnapshot() {
    if (!localStorage || !this.enableMetrics) {
      return
    }
    const keys = Object.values(StorageKey).filter(
      (key) => !key.includes('wc@2') && !key.includes('secret') && !key.includes('account')
    ) as unknown as StorageKey[]

    try {
      for (const key of keys) {
        await this.beaconIDB.set(key, this.storage.getPrefixedKey(key))
      }
    } catch (err: any) {
      logger.error('createStateSnapshot', err.message)
    }
  }

  private async initUserID() {
    const id = await this.storage.get(StorageKey.USER_ID)

    if (id) {
      this.userId = id

      return
    }

    this.userId = await generateGUID()

    this.storage.set(StorageKey.USER_ID, this.userId)
  }

  /**
   * Disconnect the postMessage and P2P transports and drop all three instances.
   *
   * A dropped transport is not garbage. Its communication client keeps its
   * `window` handlers (postMessage) or its matrix sync (P2P) until it is told to
   * stop, so every path that used to just forget the instances left one more
   * live client behind per connection. Every such path goes through here.
   *
   * WalletConnect is left to each call site: its session is shared across tabs
   * and only the leader may close it, which the callers already handle.
   */
  private async dropTransports(): Promise<void> {
    const dropped = [this.postMessageTransport, this.p2pTransport].filter(
      (transport) => transport !== undefined
    )
    this.postMessageTransport = undefined
    this.p2pTransport = undefined
    this.walletConnectTransport = undefined

    // Best effort: a transport that fails to disconnect is still dropped, and
    // the others are still disconnected.
    await Promise.all(
      dropped.map((transport) =>
        transport.disconnect().catch((error: unknown) => {
          logger.warn('dropTransports', error instanceof Error ? error.message : String(error))
        })
      )
    )
  }

  public async initInternalTransports(): Promise<void> {
    const seed = await this.storage.get(StorageKey.BEACON_SDK_SECRET_SEED)
    if (!seed) {
      throw new Error('Secret seed not found')
    }
    const keyPair = await getKeypairFromSeed(seed)

    if (this.postMessageTransport || this.p2pTransport || this.walletConnectTransport) {
      return
    }

    this.postMessageTransport = new DappPostMessageTransport(this.name, keyPair, this.storage)
    await this.addListener(this.postMessageTransport)

    this.p2pTransport = new DappP2PTransport(
      this.name,
      keyPair,
      this.storage,
      this.matrixNodes,
      this.iconUrl,
      this.appUrl
    )

    await this.addListener(this.p2pTransport)

    // WalletConnect is on by default; skip building/listening the transport
    // only when explicitly disabled via disableWalletConnect (#32).
    if (this.isWalletConnectEnabled) {
      const wcOptions = {
        projectId: this.wcProjectId,
        relayUrl: this.wcRelayUrl,
        metadata: {
          name: this.name,
          description: this.description ?? '',
          url: this.appUrl ?? '',
          icons: this.iconUrl ? [this.iconUrl] : []
        }
      }

      this.walletConnectTransport = new DappWalletConnectTransport(
        this.name,
        keyPair,
        this.storage,
        {
          network: this.network.type,
          opts: wcOptions
        },
        this.checkIfBCLeaderExists.bind(this)
      )

      // Apply proposal networks requested before the transport existed
      // (requestPermissions runs before init creates the transport).
      if (this.pendingWcProposalNetworks) {
        this.walletConnectTransport.setProposalNetworks(this.pendingWcProposalNetworks)
        this.pendingWcProposalNetworks = undefined
      }

      this.initEvents()

      await this.addListener(this.walletConnectTransport)
    }
  }

  private initEvents() {
    if (!this.walletConnectTransport) {
      return
    }

    this.walletConnectTransport.setEventHandler(
      ClientEvents.CLOSE_ALERT,
      this.hideUI.bind(this, ['alert', 'toast'])
    )
    this.walletConnectTransport.setEventHandler(
      ClientEvents.RESET_STATE,
      this.channelClosedHandler.bind(this)
    )
    this.walletConnectTransport.setEventHandler(
      ClientEvents.WC_ACK_NOTIFICATION,
      this.wcToastHandler.bind(this)
    )
    this.walletConnectTransport.setEventHandler(
      ClientEvents.ON_RELAYER_ERROR,
      this.onRelayerError.bind(this)
    )
  }

  private async onRelayerError() {
    await this.resetInvalidState(false)

    const error = new UnknownBeaconError()
    await this.emitEventWithErrorContext(
      BeaconEvent.RELAYER_ERROR,
      error,
      async (errorContext) => errorContext
    )
  }

  private async wcToastHandler(status: string) {
    const walletInfo = await (async (): Promise<WalletInfo> => {
      try {
        return await this.getWalletInfo()
      } catch {
        return { name: 'wallet' }
      }
    })()

    await this.events.emit(BeaconEvent.HIDE_UI, ['alert'])
    if (status === 'pending') {
      this.events.emit(BeaconEvent.ACKNOWLEDGE_RECEIVED, {
        message: {} as any,
        extraInfo: {} as any,
        walletInfo
      })
    } else {
      const error = getError(BeaconErrorType.ABORTED_ERROR, undefined)
      await this.emitEventWithErrorContext(
        BeaconEvent.PERMISSION_REQUEST_ERROR,
        error,
        async (errorContext) => ({
          errorResponse: { errorType: BeaconErrorType.ABORTED_ERROR } as any,
          walletInfo,
          errorContext
        })
      )
    }
  }
  private async channelClosedHandler(type: TransportType) {
    const transport = await this.transport

    if (transport.type !== type) {
      return
    }

    await this.events.emit(BeaconEvent.CHANNEL_CLOSED)
    this.setActiveAccount(undefined)
    await this.disconnect()
  }

  /**
   * Destroy the instance.
   *
   * WARNING: Call `destroy` whenever you no longer need dAppClient
   * as it frees internal subscriptions to the transport and therefore the instance may no longer work properly.
   * If you wish to disconnect your dApp, use `disconnect` instead.
   */
  async destroy(): Promise<void> {
    await this.createStateSnapshot()
    await this.dropTransports()
    await super.destroy()
  }

  public async init(
    transport?: Transport<any>,
    substratePairing?: boolean
  ): Promise<TransportType> {
    if (this._initPromise) {
      return this._initPromise
    }

    try {
      await this.activeAccountLoaded
    } catch {
      //
    }

    this._initPromise = new Promise<TransportType>(async (resolve, reject) => {
      this._initPromiseReject = reject

      if (transport) {
        await this.addListener(transport)

        resolve(await super.init(transport))
      } else if (this._transport.isSettled()) {
        await (await this.transport).connect()

        resolve(await super.init(await this.transport))
      } else {
        const activeAccount = await this.getActiveAccount()
        const stopListening = () => {
          if (this.postMessageTransport) {
            this.postMessageTransport.stopListeningForNewPeers().catch(console.error)
          }
          if (this.p2pTransport) {
            this.p2pTransport.stopListeningForNewPeers().catch(console.error)
          }
          if (this.walletConnectTransport) {
            this.walletConnectTransport.stopListeningForNewPeers().catch(console.error)
          }
        }

        await this.initInternalTransports()

        if (
          !this.postMessageTransport ||
          !this.p2pTransport ||
          (this.isWalletConnectEnabled && !this.walletConnectTransport)
        ) {
          return
        }

        this.postMessageTransport.connect().then().catch(console.error)

        if (activeAccount && activeAccount.origin) {
          const origin = activeAccount.origin.type
          // Select the transport that matches the active account
          if (origin === Origin.EXTENSION) {
            resolve(await super.init(this.postMessageTransport))
          } else if (origin === Origin.P2P) {
            resolve(await super.init(this.p2pTransport))
          } else if (origin === Origin.WALLETCONNECT && this.walletConnectTransport) {
            resolve(await super.init(this.walletConnectTransport))
          } else {
            // The persisted active account was paired over WalletConnect but WC
            // has since been disabled (`disableWalletConnect`, #32) or failed to
            // initialize, so there is no matching transport to
            // restore. Without this branch none of the conditions above call
            // resolve() and the init promise created above never settles, so
            // init() (and every later call awaiting it) hangs forever. Resolve on
            // the always-available P2P transport so the SDK stays usable and the
            // stale WC account can be re-paired.
            logger.warn(
              'init',
              'Active account was paired over WalletConnect but WC is disabled; falling back to the P2P transport'
            )
            resolve(await super.init(this.p2pTransport))
          }
        } else {
          const p2pTransport = this.p2pTransport
          const postMessageTransport = this.postMessageTransport
          const walletConnectTransport = this.walletConnectTransport

          postMessageTransport
            .listenForNewPeer((peer) => {
              logger.log('init', 'postmessage transport peer connected', peer)
              this.analytics.track('event', 'DAppClient', 'Extension connected', {
                peerName: peer.name
              })
              this.events
                .emit(BeaconEvent.PAIR_SUCCESS, peer)
                .catch((emitError) => console.warn(emitError))

              this.setActivePeer(peer).catch(console.error)
              this.setTransport(this.postMessageTransport).catch(console.error)
              stopListening()
              resolve(TransportType.POST_MESSAGE)
            })
            .catch(console.error)

          p2pTransport
            .listenForNewPeer((peer) => {
              logger.log('init', 'p2p transport peer connected', peer)
              this.analytics.track('event', 'DAppClient', 'octez.connect Wallet connected', {
                peerName: peer.name
              })
              this.events
                .emit(BeaconEvent.PAIR_SUCCESS, peer)
                .catch((emitError) => console.warn(emitError))

              this.setActivePeer(peer).catch(console.error)
              this.setTransport(this.p2pTransport).catch(console.error)
              stopListening()
              resolve(TransportType.P2P)
            })
            .catch(console.error)

          walletConnectTransport
            ?.listenForNewPeer((peer) => {
              logger.log('init', 'walletconnect transport peer connected', peer)
              this.analytics.track('event', 'DAppClient', 'WalletConnect Wallet connected', {
                peerName: peer.name
              })
              this.events
                .emit(BeaconEvent.PAIR_SUCCESS, peer)
                .catch((emitError) => console.warn(emitError))

              this.setActivePeer(peer).catch(console.error)
              this.setTransport(this.walletConnectTransport).catch(console.error)
              stopListening()
              resolve(TransportType.WALLETCONNECT)
            })
            .catch(console.error)

          PostMessageTransport.getAvailableExtensions()
            .then(async (extensions) => {
              this.analytics.track('event', 'DAppClient', 'Extensions detected', { extensions })
            })
            .catch((error) => {
              this._initPromise = undefined
              this._initPromiseReject = undefined
              console.error(error)
            })

          const abortHandler = async () => {
            logger.log('init', 'ABORTED')
            this.sendMetrics(
              'performance-metrics/save',
              await this.buildPayload('connect', 'abort')
            )
            await Promise.all([
              walletConnectTransport?.disconnect(),
              // Disconnects postMessage and P2P -- `postMessageTransport` above
              // is this.postMessageTransport, so dropTransports() already owns
              // it -- and forgets all three. It also stops the P2P client
              // started for the pairing QR: if its start is still pending,
              // P2PCommunicationClient.start() notices the stop once the login
              // completes and shuts it down.
              this.dropTransports()
            ])
            this._activeAccount.isResolved() && this.clearActiveAccount()

            this.events.emit(BeaconEvent.PAIR_ABORTED).catch((emitError) => console.warn(emitError))

            if (this._initPromiseReject) {
              this._initPromiseReject(new AbortedBeaconError())
            }
            this._initPromise = undefined
            this._initPromiseReject = undefined
          }

          const serializer = new Serializer()
          const p2pPeerInfo = new Promise<string>(async (resolve) => {
            try {
              await p2pTransport.connect()
            } catch (err: any) {
              logger.error(err)
              await this.hideUI(['alert']) // hide pairing alert
              const error = new UnknownBeaconError()
              setTimeout(() => {
                this.emitEventWithErrorContext(
                  BeaconEvent.GENERIC_ERROR,
                  error,
                  async (errorContext) => ({
                    message: err.message,
                    errorContext
                  })
                ).catch((emitError) => console.warn(emitError))
              }, 1000)
              abortHandler()
              resolve('')

              return
            }
            resolve(await serializer.serialize(await p2pTransport.getPairingRequestInfo()))
          })

          const walletConnectPeerInfo = new Promise<string>(async (resolve) => {
            // When WC is disabled there is no transport to pair through (#32).
            resolve(
              walletConnectTransport
                ? (await walletConnectTransport.getPairingRequestInfo()).uri
                : ''
            )
          })

          const postmessagePeerInfo = new Promise<string>(async (resolve) => {
            resolve(await serializer.serialize(await postMessageTransport.getPairingRequestInfo()))
          })

          this.events
            .emit(BeaconEvent.PAIR_INIT, {
              p2pPeerInfo,
              postmessagePeerInfo,
              walletConnectPeerInfo,
              networkType: this.network.type,
              abortedHandler: abortHandler.bind(this),
              analytics: this.analytics,
              featuredWallets: this.featuredWallets,
              termsAndConditionsUrl: this.termsAndConditionsUrl,
              privacyPolicyUrl: this.privacyPolicyUrl,
              substratePairing
            })
            .catch((emitError) => console.warn(emitError))
        }
      }
    })

    return this._initPromise
  }

  /**
   * Returns the active account
   */
  public async getActiveAccount(): Promise<AccountInfo | undefined> {
    return this._activeAccount.promise
  }

  private async isInvalidState(account: AccountInfo) {
    const activeAccount = await this._activeAccount.promise

    return !activeAccount
      ? false
      : activeAccount?.address !== account?.address && !this.isGetActiveAccountHandled
  }

  private async resetInvalidState(emit: boolean = true) {
    this.accountManager.removeAllAccounts()
    this._activeAccount = ExposedPromise.resolve<AccountInfo | undefined>(undefined)
    this.storage.set(StorageKey.ACTIVE_ACCOUNT, undefined)
    emit && this.events.emit(BeaconEvent.INVALID_ACTIVE_ACCOUNT_STATE)
    !emit && this.hideUI(['alert'])
    const walletConnectTransport = this.walletConnectTransport
    await Promise.all([walletConnectTransport?.disconnect(), this.dropTransports()])
    await this.setActivePeer(undefined)
    await this.setTransport(undefined)
    this._initPromise = undefined
  }

  /**
   * Sets the active account
   *
   * @param account The account that will be set as the active account
   */
  public async setActiveAccount(account?: AccountInfo): Promise<void> {
    if (!this.isGetActiveAccountHandled) {
      console.warn(
        `An active account has been received, but no active subscription was found for BeaconEvent.ACTIVE_ACCOUNT_SET.
        For more information, visit: https://octez-connect.tezos.com/guides/migration-guide`
      )
    }

    if (account && this._activeAccount.isSettled() && (await this.isInvalidState(account))) {
      const tranport = await this.transport

      if (tranport instanceof WalletConnectTransport && tranport.wasDisconnectedByWallet()) {
        await this.resetInvalidState()

        return
      }
    }

    // when I'm resetting the activeAccount
    if (!account && this._activeAccount.isResolved() && (await this.getActiveAccount())) {
      const transport = await this.transport
      const activeAccount = await this.getActiveAccount()

      if (!transport || !activeAccount) {
        return
      }

      if (!this.debounceSetActiveAccount && transport instanceof WalletConnectTransport) {
        this.debounceSetActiveAccount = true
        this._initPromise = undefined
        await this.dropTransports()
        if (this.multiTabChannel.isLeader() || isMobileOS(window)) {
          await transport.disconnect()
          this.openRequestsOtherTabs.clear()
        } else {
          this.multiTabChannel.postMessage({
            type: 'DISCONNECT'
          })
        }
        Array.from(this.openRequests.entries())
          .filter(([id, _promise]) => id !== 'session_update')
          .forEach(([id, promise]) => {
            promise.reject({
              type: BeaconMessageType.Error,
              errorType: BeaconErrorType.ABORTED_ERROR,
              id,
              senderId: '',
              // SDK-synthesized rejection consumed in-process (never hits the
              // wire); stamped with the wrapped baseline for consistency.
              version: negotiateEnvelopeVersion(undefined)
            })
          })
        this.openRequests.clear()
        this.debounceSetActiveAccount = false
      }
    }

    if (this._activeAccount.isSettled()) {
      // If the promise has already been resolved we need to create a new one.
      this._activeAccount = ExposedPromise.resolve<AccountInfo | undefined>(account)
    } else {
      this._activeAccount.resolve(account)
    }

    if (!this.isGetActiveAccountHandled && this._transport.isResolved()) {
      const transport = await this.transport

      if (transport instanceof WalletConnectTransport && transport.wasDisconnectedByWallet()) {
        await this.resetInvalidState()

        return
      }
    }

    if (account) {
      const origin = account.origin.type
      await this.initInternalTransports()

      // Select the transport that matches the active account
      if (origin === Origin.EXTENSION) {
        await this.setTransport(this.postMessageTransport)
      } else if (origin === Origin.P2P) {
        await this.setTransport(this.p2pTransport)
      } else if (origin === Origin.WALLETCONNECT && this.walletConnectTransport) {
        await this.setTransport(this.walletConnectTransport)
        this.walletConnectTransport.forceUpdate('INIT')
      } else if (origin === Origin.WALLETCONNECT) {
        // WalletConnect is opt-out/disabled (#32) but this persisted account was
        // paired over WC. There is no WC transport to bind; setting the transport
        // to `undefined` would leave the client unable to send any request. Fall
        // back to the always-available P2P transport so the SDK stays usable
        // (the stale WC account can be re-paired).
        logger.warn(
          'setActiveAccount',
          'Active account was paired over WalletConnect but WC is disabled; falling back to the P2P transport'
        )
        await this.setTransport(this.p2pTransport)
      }
      if (this._transport.isResolved()) {
        const transport = await this.transport

        if (transport.connectionStatus === TransportStatus.NOT_CONNECTED) {
          await transport.connect()
        }
      }
      const peer = await this.getPeer(account)
      await this.setActivePeer(peer)
    } else {
      await this.setActivePeer(undefined)
      await this.setTransport(undefined)
    }

    await this.storage.set(
      StorageKey.ACTIVE_ACCOUNT,
      account ? account.accountIdentifier : undefined
    )

    await this.events.emit(BeaconEvent.ACTIVE_ACCOUNT_SET, account)

    return
  }

  /**
   * Clear the active account
   */
  public clearActiveAccount(): Promise<void> {
    return this.setActiveAccount()
  }

  public async setColorMode(colorMode: ColorMode): Promise<void> {
    return setColorMode(colorMode)
  }

  public async getColorMode(): Promise<ColorMode> {
    return getColorMode()
  }

  /**
   * @deprecated
   *
   * Use getOwnAppMetadata instead
   */
  public async getAppMetadata(): Promise<AppMetadata> {
    return this.getOwnAppMetadata()
  }

  public async showPrepare(): Promise<void> {
    const walletInfo = await (async () => {
      try {
        return await this.getWalletInfo()
      } catch {
        return undefined
      }
    })()
    await this.events.emit(BeaconEvent.SHOW_PREPARE, { walletInfo })
  }

  public async hideUI(elements: ('alert' | 'toast')[]): Promise<void> {
    await this.events.emit(BeaconEvent.HIDE_UI, elements)
  }

  private async tryToAppSwitch() {
    if (!isMobileOS(window) || !this.enableAppSwitching) {
      return
    }

    const wallet = await this.getWalletInfo()

    if (wallet.type !== 'mobile' || !wallet.deeplink) {
      return
    }

    const link = isIOS(window) ? wallet.deeplink : (`${wallet.deeplink}wc?uri=` as any)

    if (!link?.length) {
      return
    }

    window.location = link
  }

  private addQueryParam(paramName: string, paramValue: string): string {
    return `${paramName  }=${  paramValue}`
  }

  private async buildPayload(
    action: 'connect' | 'message' | 'disconnect',
    status: 'start' | 'abort' | 'success' | 'error'
  ): Promise<RequestInit> {
    const wallet = await this.storage.get(StorageKey.LAST_SELECTED_WALLET)
    const transport = this._activeAccount.isResolved()
      ? ((await this.getActiveAccount())?.origin.type ?? 'UNKNOWN')
      : 'UNKNOWN'

    return {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: this.userId,
        os: currentOS(),
        walletName: wallet?.name ?? 'init',
        walletType: wallet?.type ?? 'init',
        sdkVersion: SDK_VERSION,
        transport,
        time: new Date(),
        action,
        status
      })
    }
  }

  private async updateMetricsStorage(payload: string) {
    const queue = await this.beaconIDB.getAllKeys('metrics')

    if (queue.length >= 1000) {
      const key = queue.shift()!
      this.beaconIDB.delete(key.toString(), 'metrics')
    }

    this.beaconIDB.set(String(Date.now()), payload, 'metrics')
  }

  private sendMetrics(
    uri: string,
    options?: RequestInit,
    thenHandler?: (res: Response) => void,
    catchHandler?: (err: Error) => void
  ) {
    if (!this.enableMetrics && uri === 'performance-metrics/save') {
      options && this.updateMetricsStorage(options.body as string)
    }
    if (!this.enableMetrics) {
      return
    }

    fetch(`${BACKEND_URL}/${uri}`, options)
      .then((res) => thenHandler && thenHandler(res))
      .catch((err: Error) => {
        console.warn('Network error encountered. Metrics sharing have been automatically disabled.')
        logger.error(err.message)
        this.enableMetrics = false // in the event of a network error, stop sending metrics
        catchHandler && catchHandler(err)
      })
  }

  private async checkMakeRequest() {
    const isResolved = this._transport.isResolved()
    const isWCInstance = isResolved && (await this.transport) instanceof WalletConnectTransport
    await this.multiTabChannel.init()
    const isLeader = this.multiTabChannel.isLeader()

    return !isResolved || !isWCInstance || isLeader || isMobileOS(window)
  }

  /**
   * Will remove the account from the local storage and set a new active account if necessary.
   *
   * @param accountIdentifier ID of the account
   */
  public async removeAccount(accountIdentifier: string): Promise<void> {
    const removeAccountResult = super.removeAccount(accountIdentifier)
    const activeAccount: AccountInfo | undefined = await this.getActiveAccount()

    if (activeAccount && activeAccount.accountIdentifier === accountIdentifier) {
      await this.setActiveAccount(undefined)
    }

    return removeAccountResult
  }

  /**
   * Remove all accounts and set active account to undefined
   */
  public async removeAllAccounts(): Promise<void> {
    await super.removeAllAccounts()
    await this.setActiveAccount(undefined)
  }

  /**
   * Removes a peer and all the accounts that have been connected through that peer
   *
   * @param peer Peer to be removed
   */
  public async removePeer(
    peer: ExtendedPeerInfo,
    sendDisconnectToPeer: boolean = false
  ): Promise<void> {
    const transport = await this.transport

    const removePeerResult = transport.removePeer(peer)

    await this.removeAccountsForPeers([peer])

    if (sendDisconnectToPeer) {
      await this.sendDisconnectToPeer(peer, transport)
    }

    return removePeerResult
  }

  /**
   * Remove all peers and all accounts that have been connected through those peers
   */
  public async removeAllPeers(sendDisconnectToPeers: boolean = false): Promise<void> {
    const transport = await this.transport

    const peers: ExtendedPeerInfo[] = await transport.getPeers()
    const removePeerResult = transport.removeAllPeers()

    await this.removeAccountsForPeers(peers)

    if (sendDisconnectToPeers) {
      const disconnectPromises = peers.map((peer) => this.sendDisconnectToPeer(peer, transport))

      await Promise.all(disconnectPromises)
    }

    return removePeerResult
  }

  /**
   * Allows the user to subscribe to specific events that are fired in the SDK
   *
   * @param internalEvent The event to subscribe to
   * @param eventCallback The callback that will be called when the event occurs
   */
  public async subscribeToEvent<K extends BeaconEvent>(
    internalEvent: K,
    eventCallback: BeaconEventHandlerFunction<BeaconEventType[K]>
  ): Promise<void> {
    if (internalEvent === BeaconEvent.ACTIVE_ACCOUNT_SET) {
      this.isGetActiveAccountHandled = true
    }

    await this.events.on(internalEvent, eventCallback)
  }

  /**
   * Check if we have permissions to send the specific message type to the active account.
   * If no active account is set, only permission requests are allowed.
   *
   * @param type The type of the message
   */
  public async checkPermissions(type: BeaconMessageType): Promise<boolean> {
    if (
      [
        BeaconMessageType.PermissionRequest,
        BeaconMessageType.ProofOfEventChallengeRequest,
        BeaconMessageType.SimulatedProofOfEventChallengeRequest
      ].includes(type)
    ) {
      return true
    }

    const activeAccount: AccountInfo | undefined = await this.getActiveAccount()

    if (!activeAccount) {
      throw await this.sendInternalError('No active account set!')
    }

    const permissions = activeAccount.scopes

    switch (type) {
      case BeaconMessageType.OperationRequest:
        return permissions.includes(PermissionScope.OPERATION_REQUEST)
      case BeaconMessageType.SignPayloadRequest:
        return permissions.includes(PermissionScope.SIGN)
      // TODO: ENCRYPTION
      // case BeaconMessageType.EncryptPayloadRequest:
      //   return permissions.includes(PermissionScope.ENCRYPT)
      case BeaconMessageType.BroadcastRequest:
        return true
      default:
        return false
    }
  }

  public async sendNotification(
    title: string,
    message: string,
    payload: string,
    protocolIdentifier: string
  ): Promise<string> {
    const activeAccount = await this.getActiveAccount()

    if (
      !activeAccount ||
      (activeAccount &&
        !activeAccount.scopes.includes(PermissionScope.NOTIFICATION) &&
        !activeAccount.notification)
    ) {
      throw new Error('notification permissions not given')
    }

    if (!activeAccount.notification?.token) {
      throw new Error('No AccessToken')
    }

    const url = activeAccount.notification?.apiUrl

    if (!url) {
      throw new Error('No Push URL set')
    }

    return this.sendNotificationWithAccessToken({
      url,
      recipient: activeAccount.address,
      title,
      body: message,
      payload,
      protocolIdentifier,
      accessToken: activeAccount.notification?.token
    })
  }

  public override addBlockchain(chain: Blockchain): void {
    super.addBlockchain(chain)
    chain.getWalletLists().then((walletLists) => {
      setDesktopList(walletLists.desktopList)
      setExtensionList(walletLists.extensionList)
      setWebList(walletLists.webList)
      setiOSList(walletLists.iOSList)
    })
  }

  public async permissionRequest(
    input: PermissionRequestV3
  ): Promise<PermissionResponseV3> {
    logger.log('permissionRequest', input)
    const blockchain = this.blockchains.get(input.blockchainIdentifier)
    if (!blockchain) {
      throw new Error(`Blockchain "${input.blockchainIdentifier}" not supported by dAppClient`)
    }

    const request: PermissionRequestV3 = {
      ...input,
      type: BeaconMessageType.PermissionRequest,
      blockchainData: {
        ...input.blockchainData,
        appMetadata: await this.getOwnAppMetadata()
      }
    }

    logger.log('REQUESTION PERMIMISSION V3', 'xxx', request)

    this.sendMetrics('performance-metrics/save', await this.buildPayload('connect', 'start'))

    const logId = `makeRequestV3 ${Date.now()}`
    logger.time(true, logId)

    const { message: response, connectionInfo } = await this.requireResponse(
      this.makeRequestV3<
        PermissionRequestV3,
        BeaconMessageWrapper<PermissionResponseV3>
      >(request),
      request as any,
      logId
    )
    logger.time(false, logId)

    this.sendMetrics('performance-metrics/save', await this.buildPayload('connect', 'start'))

    logger.log('RESPONSE V3', response, connectionInfo)

    // The version stamp lives on the wrapper envelope, not the inner payload;
    // reading response.message.version would always miss and collapse to '0',
    // misrouting v4 responses when no peer is persisted yet.
    const walletPeerV3 = await this.getPeer()
    const walletPeerVersionV3: string = effectivePeerVersion(walletPeerV3) ?? response.version
    const partialAccountInfos = await blockchain.getAccountInfosFromPermissionResponse(
      response.message,
      walletPeerVersionV3
    )

    const blockchainDataScopes = (
      response.message.blockchainData as { scopes?: PermissionScope[] }
    ).scopes
    const accountInfos: AccountInfo[] = partialAccountInfos.map(
      (p) =>
        ({
          accountIdentifier: p.accountId,
          senderId: response.senderId,
          origin: {
            type: connectionInfo.origin,
            id: connectionInfo.id
          },
          address: p.address,
          publicKey: p.publicKey,
          network: p.network,
          scopes: blockchainDataScopes ?? p.scopes,
          connectedAt: new Date().getTime(),
          chainData: response.message.blockchainData
        } as unknown as AccountInfo)
    )

    await this.accountManager.addAccounts(accountInfos)
    const accountInfo: AccountInfo | undefined = accountInfos[0]
    if (!accountInfo) {
      throw new Error(
        EMPTY_PERMISSION_ACCOUNTS_MESSAGE
      )
    }
    await this.setActiveAccount(accountInfo)

    await blockchain.handleResponse({
      request,
      account: accountInfo,
      output: response,
      blockExplorer: this.blockExplorer,
      connectionContext: connectionInfo,
      walletInfo: await this.getWalletInfo()
    })

    await this.notifySuccess(request as any, {
      account: accountInfo,
      output: {
        address: accountInfo.address,
        network: { type: 'substrate' },
        scopes: []
      } as any,
      blockExplorer: this.blockExplorer,
      connectionContext: connectionInfo,
      walletInfo: await this.getWalletInfo()
    })

    // return output
    return response.message
  }

  public async request(input: BlockchainRequestV3): Promise<BlockchainResponseV3> {
    logger.log('request', input)
    const blockchain = this.blockchains.get(input.blockchainIdentifier)
    if (!blockchain) {
      throw new Error(`Blockchain "${blockchain}" not supported by dAppClient`)
    }

    await blockchain.validateRequest(input)

    const activeAccount: AccountInfo | undefined = await this.getActiveAccount()
    if (!activeAccount) {
      throw await this.sendInternalError('No active account!')
    }

    const request: BlockchainRequestV3 = {
      ...input,
      type: BeaconMessageType.BlockchainRequest,
      accountId: activeAccount.accountIdentifier
    }

    this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'start'))

    const logId = `makeRequestV3 ${Date.now()}`
    logger.time(true, logId)
    const res = (await this.checkMakeRequest())
      ? this.makeRequestV3<
          BlockchainRequestV3,
          BeaconMessageWrapper<BlockchainResponseV3>
        >(request)
      : this.makeRequestBC<any, any>(request)

    const { message: response, connectionInfo } = await this.requireResponse(
      res,
      request as any,
      logId
    )
    logger.time(false, logId)
    this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'success'))

    await blockchain.handleResponse({
      request,
      account: activeAccount,
      output: response,
      blockExplorer: this.blockExplorer,
      connectionContext: connectionInfo,
      walletInfo: await this.getWalletInfo()
    })

    await this.notifySuccess(
      request as any,
      {
        walletInfo: await this.getWalletInfo()
      } as any
    )

    return response.message
  }

  /**
   * Send a permission request to the DApp. This should be done as the first step. The wallet will respond
   * with an publicKey and permissions that were given. The account returned will be set as the "activeAccount"
   * and will be used for the following requests.
   *
   * @param input The message details we need to prepare the PermissionRequest message.
   */
  public async requestPermissions(
    input?: RequestPermissionInput
  ): Promise<PermissionResponseOutput> {
    if ((input as any)?.network) {
      throw new Error(
        '[BEACON] the "network" property is no longer accepted in input. Please provide it when instantiating DAppClient.'
      )
    }

    const request: PermissionRequestInput = {
      appMetadata: await this.getOwnAppMetadata(),
      type: BeaconMessageType.PermissionRequest,
      network: this.network,
      scopes:
        input && input.scopes
          ? input.scopes
          : [PermissionScope.OPERATION_REQUEST, PermissionScope.SIGN]
    }

    // Dedupe by the normalized CAIP-2 chainId so equivalent input entries
    // ('NetX…' and 'tezos:NetX…') collapse to one canonical wire entry.
    if (input?.networks && input.networks.length > 0) {
      const dedupedNetworks = Array.from(
        new Map(
          input.networks.map((n: RequestPermissionNetwork) => {
            const chainId = normalizeTezosCaip2(n.chainId)

            return [chainId, { ...n, chainId }]
          })
        ).values()
      )
      request.networks = dedupedNetworks

      // Multi-network over WalletConnect travels via the session proposal,
      // not the wire payload (WC peers have no beacon version handshake).
      // Map each requested chain id to its named network for the proposal;
      // ids without a static genesis mapping are skipped here (the
      // NetworksUnsupportedBeaconError guard above reports them when the
      // dApp opted into requiredMinimumVersion '4').
      const proposalNetworkTypes: NetworkType[] = []
      for (const { chainId } of dedupedNetworks) {
        const networkType = networkTypeFromTezosCaip2(chainId)
        if (networkType === undefined) {
          logger.debug(
            'requestPermissions',
            `No static network mapping for "${chainId}"; excluded from the WalletConnect proposal`
          )
          continue
        }
        proposalNetworkTypes.push(networkType)
      }

      if (this.walletConnectTransport) {
        this.walletConnectTransport.setProposalNetworks(proposalNetworkTypes)
      } else {
        // The WalletConnect transport is created lazily inside init() (run
        // by makeRequest below, before the pairing proposal is built); stash
        // the networks and apply them right after creation.
        this.pendingWcProposalNetworks = proposalNetworkTypes
      }
    }

    this.analytics.track('event', 'DAppClient', 'Permission requested')

    this.sendMetrics('performance-metrics/save', await this.buildPayload('connect', 'start'))

    const logId = `makeRequest ${Date.now()}`
    logger.time(true, logId)

    const res =
      (await this.checkMakeRequest()) || !(await this.getActiveAccount())
        ? this.makeRequest<PermissionRequest, PermissionResponse>(request, undefined, undefined)
        : this.makeRequestBC<PermissionRequest, PermissionResponse>(request)

    const { message, connectionInfo } = await this.requireResponse(res, request, logId)
    logger.time(false, logId)
    this.sendMetrics('performance-metrics/save', await this.buildPayload('connect', 'success'))

    logger.log('requestPermissions', '######## MESSAGE #######')
    logger.log('requestPermissions', message)

    // Capability-aware peer version (legacy wallets echo the dApp's version
    // at pairing — see effectivePeerVersion); fall back to the response
    // envelope version when no peer is persisted yet.
    const walletPeer = await this.getPeer()
    const walletPeerVersion = effectivePeerVersion(walletPeer) ?? message.version

    // Gate the freshly-paired wallet against the dApp's required minimum (a
    // no-op under the default, permissive minimum). Throws
    // VersionUnsupportedBeaconError when the wallet is too old.
    this.assertWalletVersionMeetsMinimum(walletPeerVersion)

    const isV4Session = isMultiNetworkVersion(walletPeerVersion)

    const messageAccounts = (message as { accounts?: PermissionResponseAccounts }).accounts
    const multiNetworkAccounts: PermissionResponseAccounts | null =
      isV4Session &&
      messageAccounts &&
      typeof messageAccounts === 'object' &&
      !Array.isArray(messageAccounts)
        ? messageAccounts
        : null
    let accountInfo: AccountInfo | undefined

    if (isV4Session) {
      const requestedNetworks: string[] = (request.networks ?? []).map((n) =>
        normalizeTezosCaip2(n.chainId)
      )
      const servedChainIds: string[] = multiNetworkAccounts
        ? Object.keys(multiNetworkAccounts).map(normalizeTezosCaip2)
        : []

      const isMinimumVersionV4OrHigher = isMultiNetworkVersion(this.requiredMinimumVersion)
      // Reject silently-degraded responses: a v4 session with >=2 networks
      // requested but no accounts fanout returned.
      if (requestedNetworks.length >= 2 && isMinimumVersionV4OrHigher) {
        const missing = requestedNetworks.filter((c) => !servedChainIds.includes(c))
        if (missing.length > 0) {
          throw new NetworksUnsupportedBeaconError({
            requestedNetworks,
            unsupportedNetworks: missing
          })
        }
      }
    }

    if (isV4Session && multiNetworkAccounts) {
      const builtAccounts = await this.buildAccountInfosFromV4Fanout(
        message,
        multiNetworkAccounts,
        walletPeerVersion ?? '0',
        connectionInfo
      )
      await this.accountManager.addAccounts(builtAccounts)
      accountInfo = builtAccounts[0]
      if (!accountInfo) {
        throw new Error(
          EMPTY_PERMISSION_ACCOUNTS_MESSAGE
        )
      }
      await this.setActiveAccount(accountInfo)
      logger.log('requestPermissions', '######## MULTI-NETWORK ACCOUNTS #######', builtAccounts.length)
    } else {
      accountInfo = await this.onNewAccount(message, connectionInfo)
      logger.log('requestPermissions', '######## ACCOUNT INFO #######')
      logger.log('requestPermissions', JSON.stringify(accountInfo))
      await this.accountManager.addAccount(accountInfo)
    }
    if (!accountInfo) {
      throw new Error(
        EMPTY_PERMISSION_ACCOUNTS_MESSAGE
      )
    }

    const output: PermissionResponseOutput = {
      ...message,
      walletKey: accountInfo.walletKey,
      address: accountInfo.address,
      accountInfo
    }

    await this.notifySuccess(request, {
      account: accountInfo,
      output,
      blockExplorer: this.blockExplorer,
      connectionContext: connectionInfo,
      walletInfo: await this.getWalletInfo()
    })

    this.analytics.track('event', 'DAppClient', 'Permission received', {
      address: accountInfo.address
    })

    return output
  }

  /**
   * Send a proof of event request to the wallet. The wallet will either accept or decline the challenge.
   * If it is accepted, the challenge will be stored, meaning that even if the user refresh the page, the DAppClient will keep checking if the challenge has been fulfilled.
   * Once the challenge is stored, a challenge stored message will be sent to the wallet.
   * It's **highly recommended** to run a proof of event challenge to check the identity of an abstracted account
   *
   * @param input The message details we need to prepare the ProofOfEventChallenge message.
   */
  public async requestProofOfEventChallenge(input: RequestProofOfEventChallengeInput) {
    const activeAccount = await this.getActiveAccount()

    if (!activeAccount)
      {throw new Error('Please request permissions before doing a proof of event challenge')}
    if (
      activeAccount.walletType !== 'abstracted_account' &&
      activeAccount.verificationType !== 'proof_of_event'
    )
      {throw new Error(
        'This wallet is not an abstracted account and thus cannot perform proof of event'
      )}

    const request: ProofOfEventChallengeRequestInput = {
      type: BeaconMessageType.ProofOfEventChallengeRequest,
      contractAddress: activeAccount.address,
      payload: input.payload
    }

    this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'start'))
    const logId = `makeRequest ${Date.now()}`
    logger.time(true, logId)
    const res = (await this.checkMakeRequest())
      ? this.makeRequest<ProofOfEventChallengeRequest, ProofOfEventChallengeResponse>(request)
      : this.makeRequestBC<ProofOfEventChallengeRequest, ProofOfEventChallengeResponse>(request)

    const { message, connectionInfo } = await this.requireResponse(res, request, logId)
    logger.time(false, logId)
    this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'success'))

    this.analytics.track(
      'event',
      'DAppClient',
      `Proof of event challenge ${message.isAccepted ? 'accepted' : 'refused'}`,
      { address: activeAccount.address }
    )

    await this.notifySuccess(request, {
      account: activeAccount,
      output: message,
      blockExplorer: this.blockExplorer,
      connectionContext: connectionInfo,
      walletInfo: await this.getWalletInfo()
    })

    return message
  }

  /**
   * Send a simulated proof of event request to the wallet. The wallet will either accept or decline the challenge.
   * It's the same than `requestProofOfEventChallenge` but rather than executing operations on the blockchain to prove the identity,
   * The wallet will return a list of operations that you'll be able to run on your side to verify the identity of the abstracted account
   * It's **highly recommended** to run a proof of event challenge to check the identity of an abstracted account
   *
   * @param input The message details we need to prepare the SimulatedProofOfEventChallenge message.
   */
  public async requestSimulatedProofOfEventChallenge(
    input: RequestSimulatedProofOfEventChallengeInput
  ) {
    const activeAccount = await this.getActiveAccount()

    if (!activeAccount)
      {throw new Error('Please request permissions before doing a proof of event challenge')}
    if (
      activeAccount.walletType !== 'abstracted_account' &&
      activeAccount.verificationType !== 'proof_of_event'
    ) {
      throw new Error(
        'This wallet is not an abstracted account and thus cannot perform a simulated proof of event'
      )
    }

    const request: SimulatedProofOfEventChallengeRequestInput = {
      type: BeaconMessageType.SimulatedProofOfEventChallengeRequest,
      contractAddress: activeAccount.address,
      ...input
    }
    const logId = `makeRequest ${Date.now()}`
    logger.time(true, logId)

    const res = (await this.checkMakeRequest())
      ? this.makeRequest<
          SimulatedProofOfEventChallengeRequest,
          SimulatedProofOfEventChallengeResponse
        >(request)
      : this.makeRequestBC<
          SimulatedProofOfEventChallengeRequest,
          SimulatedProofOfEventChallengeResponse
        >(request)

    const { message, connectionInfo } = await this.requireResponse(res, request, logId)
    logger.time(false, logId)

    this.analytics.track(
      'event',
      'DAppClient',
      `Simulated proof of event challenge ${!message.errorMessage ? 'accepted' : 'refused'}`,
      { address: activeAccount.address }
    )

    await this.notifySuccess(request, {
      account: activeAccount,
      output: message,
      blockExplorer: this.blockExplorer,
      connectionContext: connectionInfo,
      walletInfo: await this.getWalletInfo()
    })

    return message
  }

  /**
   * This method will send a "SignPayloadRequest" to the wallet. This method is meant to be used to sign
   * arbitrary data (eg. a string). It will return the signature in the format of "edsig..."
   *
   * @param input The message details we need to prepare the SignPayloadRequest message.
   */
  public async requestSignPayload(
    input: RequestSignPayloadInput
  ): Promise<SignPayloadResponseOutput> {
    if (!input.payload) {
      throw await this.sendInternalError('Payload must be provided')
    }
    const activeAccount: AccountInfo | undefined = await this.getActiveAccount()
    if (!activeAccount) {
      throw await this.sendInternalError('No active account!')
    }

    const payload = input.payload

    if (typeof payload !== 'string') {
      throw new Error('Payload must be a string')
    }

    const signingType = ((): SigningType => {
      switch (input.signingType) {
        case SigningType.OPERATION:
          if (!payload.startsWith('03')) {
            throw new Error(
              'When using signing type "OPERATION", the payload must start with prefix "03"'
            )
          }

          return SigningType.OPERATION

        case SigningType.MICHELINE:
          if (!payload.startsWith('05')) {
            throw new Error(
              'When using signing type "MICHELINE", the payload must start with prefix "05"'
            )
          }

          return SigningType.MICHELINE

        case SigningType.RAW:
        default:
          return SigningType.RAW
      }
    })()

    this.analytics.track('event', 'DAppClient', 'Signature requested')

    const request: SignPayloadRequestInput = {
      type: BeaconMessageType.SignPayloadRequest,
      signingType,
      payload,
      sourceAddress: input.sourceAddress || activeAccount.address
    }

    this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'start'))
    const logId = `makeRequest ${Date.now()}`
    logger.time(true, logId)
    const res = (await this.checkMakeRequest())
      ? this.makeRequest<SignPayloadRequest, SignPayloadResponse>(request)
      : this.makeRequestBC<SignPayloadRequest, SignPayloadResponse>(request)

    const { message, connectionInfo } = await this.requireResponse(res, request, logId)
    logger.time(false, logId)
    this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'success'))

    await this.notifySuccess(request, {
      account: activeAccount,
      output: message,
      connectionContext: connectionInfo,
      walletInfo: await this.getWalletInfo()
    })

    this.analytics.track('event', 'DAppClient', 'Signature response')

    return message
  }

  /**
   * This method will send an "EncryptPayloadRequest" to the wallet. This method is meant to be used to encrypt or decrypt
   * arbitrary data (eg. a string). It will return the encrypted or decrypted payload
   *
   * @param input The message details we need to prepare the EncryptPayloadRequest message.
   */
  // TODO: ENCRYPTION
  // public async requestEncryptPayload(
  //   input: RequestEncryptPayloadInput
  // ): Promise<EncryptPayloadResponseOutput> {
  //   if (!input.payload) {
  //     throw await this.sendInternalError('Payload must be provided')
  //   }
  //   const activeAccount: AccountInfo | undefined = await this.getActiveAccount()
  //   if (!activeAccount) {
  //     throw await this.sendInternalError('No active account!')
  //   }

  //   const payload = input.payload

  //   if (typeof payload !== 'string') {
  //     throw new Error('Payload must be a string')
  //   }

  //   if (typeof input.encryptionCryptoOperation === 'undefined') {
  //     throw new Error('encryptionCryptoOperation must be defined')
  //   }

  //   if (typeof input.encryptionType === 'undefined') {
  //     throw new Error('encryptionType must be defined')
  //   }

  //   const request: EncryptPayloadRequestInput = {
  //     type: BeaconMessageType.EncryptPayloadRequest,
  //     cryptoOperation: input.encryptionCryptoOperation,
  //     encryptionType: input.encryptionType,
  //     payload,
  //     sourceAddress: input.sourceAddress || activeAccount.address
  //   }

  //   const { message, connectionInfo } = await this.makeRequest<
  //     EncryptPayloadRequest,
  //     EncryptPayloadResponse
  //   >(request).catch(async (requestError: ErrorResponse) => {
  //     throw await this.handleRequestError(request, requestError)
  //   })

  //   await this.notifySuccess(request, {
  //     account: activeAccount,
  //     output: message,
  //     connectionContext: connectionInfo,
  //     walletInfo: await this.getWalletInfo()
  //   })

  //   return message
  // }

  /**
   * This method sends an OperationRequest to the wallet. This method should be used for all kinds of operations,
   * eg. transaction or delegation. Not all properties have to be provided. Data like "counter" and fees will be
   * fetched and calculated by the wallet (but they can still be provided if required).
   *
   * @param input The message details we need to prepare the OperationRequest message.
   */
  public async requestOperation(input: RequestOperationInput): Promise<OperationResponseOutput> {
    if (!input.operationDetails) {
      throw await this.sendInternalError('Operation details must be provided')
    }
    const activeAccount: AccountInfo | undefined = await this.getActiveAccount()

    if (!activeAccount) {
      throw await this.sendInternalError('No active account!')
    }

    const resolvedNetwork: Network | string = await this.resolveOperationNetwork(
      input.network,
      activeAccount
    )

    const request: OperationRequestInput = {
      type: BeaconMessageType.OperationRequest,
      network: resolvedNetwork,
      operationDetails: input.operationDetails,
      sourceAddress: activeAccount.address || ''
    }

    this.analytics.track('event', 'DAppClient', 'Operation requested')

    this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'start'))
    const logId = `makeRequest ${Date.now()}`
    logger.time(true, logId)

    const res = (await this.checkMakeRequest())
      ? this.makeRequest<OperationRequest, OperationResponse>(request)
      : this.makeRequestBC<OperationRequest, OperationResponse>(request)

    const { message, connectionInfo } = await this.requireResponse(res, request, logId)
    logger.time(false, logId)
    this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'success'))

    await this.notifySuccess(request, {
      account: activeAccount,
      output: message,
      blockExplorer: this.blockExplorer,
      connectionContext: connectionInfo,
      walletInfo: await this.getWalletInfo()
    })

    this.analytics.track('event', 'DAppClient', 'Operation response')

    return message
  }

  /**
   * Sends a "BroadcastRequest" to the wallet. This method can be used to inject an already signed transaction
   * to the network.
   *
   * @param input The message details we need to prepare the BroadcastRequest message.
   */
  public async requestBroadcast(input: RequestBroadcastInput): Promise<BroadcastResponseOutput> {
    if (!input.signedTransaction) {
      throw await this.sendInternalError('Signed transaction must be provided')
    }

    // Add error message for deprecation of network
    // TODO: Remove when we remove deprecated preferredNetwork
    if (input.network !== undefined && this.network.type !== input.network?.type) {
      console.error(
        '[BEACON] The network specified in the DAppClient constructor does not match the network set in the broadcast request. Please set the network in the constructor. Setting it during the Broadcast Request is deprecated.'
      )
    }

    const request: BroadcastRequestInput = {
      type: BeaconMessageType.BroadcastRequest,
      network: this.network,
      signedTransaction: input.signedTransaction
    }

    this.analytics.track('event', 'DAppClient', 'Broadcast requested')

    this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'start'))
    const logId = `makeRequest ${Date.now()}`
    logger.time(true, logId)
    const res = (await this.checkMakeRequest())
      ? this.makeRequest<BroadcastRequest, BroadcastResponse>(request)
      : this.makeRequestBC<BroadcastRequest, BroadcastResponse>(request)

    const { message, connectionInfo } = await this.requireResponse(res, request, logId)
    logger.time(false, logId)
    this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'success'))

    await this.notifySuccess(request, {
      network: this.network,
      output: message,
      blockExplorer: this.blockExplorer,
      connectionContext: connectionInfo,
      walletInfo: await this.getWalletInfo()
    })

    this.analytics.track('event', 'DAppClient', 'Broadcast response')

    return message
  }

  protected async setActivePeer(peer?: PeerInfoType): Promise<void> {
    if (this._activePeer.isSettled()) {
      // If the promise has already been resolved we need to create a new one.
      this._activePeer = ExposedPromise.resolve(peer)
    } else {
      this._activePeer.resolve(peer)
    }

    if (!peer) {
      return
    }

    await this.initInternalTransports()

    if (peer.type === 'postmessage-pairing-response') {
      await this.setTransport(this.postMessageTransport)
    } else if (peer.type === 'p2p-pairing-response') {
      await this.setTransport(this.p2pTransport)
    }
  }

  /**
   * A "setter" for when the transport needs to be changed.
   */
  protected async setTransport(transport?: Transport<any>): Promise<void> {
    if (!transport) {
      this._initPromise = undefined
    }

    const result = super.setTransport(transport)

    const event = transport ? { ...(transport as any) } : undefined

    // remove keyPair, to prevent dApps from accidentaly leaking the privateKey
    if (event) {
      event.client = {
        ...event.client,
        keyPair: undefined
      }
    }

    await this.events.emit(BeaconEvent.ACTIVE_TRANSPORT_SET, event)

    return result
  }

  /**
   * This method will emit an internal error message.
   *
   * @param errorMessage The error message to send.
   */
  private async sendInternalError(errorMessage: string): Promise<void> {
    const error = new UnknownBeaconError()
    await this.emitEventWithErrorContext(
      BeaconEvent.INTERNAL_ERROR,
      error,
      async (errorContext) => ({
        text: errorMessage,
        errorContext
      })
    )
    throw new Error(errorMessage)
  }

  private async emitEventWithErrorContext<T extends BeaconEvent>(
    event: T,
    error: BeaconError | Error,
    buildPayload: (errorContext: ErrorContext) => Promise<BeaconEventType[T]> | BeaconEventType[T],
    ...additionalArgs: any[]
  ): Promise<void> {
    const transport = this._transport.isResolved() ? await this.transport : undefined
    const errorContext = await buildErrorContext(error, this.storage, transport?.type)
    const payload = await buildPayload(errorContext)
    await this.events.emit(event, payload, ...additionalArgs)
  }

  /**
   * This method will remove all accounts associated with a specific peer.
   *
   * @param peersToRemove An array of peers for which accounts should be removed
   */
  private async removeAccountsForPeers(peersToRemove: ExtendedPeerInfo[]): Promise<void> {
    const peerIdsToRemove = peersToRemove.map((peer) => peer.senderId)

    return this.removeAccountsForPeerIds(peerIdsToRemove)
  }

  private async removeAccountsForPeerIds(peerIds: string[]): Promise<void> {
    const accounts = await this.accountManager.getAccounts()

    // Remove all accounts with origin of the specified peer
    const accountsToRemove = accounts.filter((account) => peerIds.includes(account.senderId))
    const accountIdentifiersToRemove = accountsToRemove.map(
      (accountInfo) => accountInfo.accountIdentifier
    )
    await this.accountManager.removeAccounts(accountIdentifiersToRemove)

    // Check if one of the accounts that was removed was the active account and if yes, set it to undefined
    const activeAccount: AccountInfo | undefined = await this.getActiveAccount()

    if (activeAccount) {
      if (accountIdentifiersToRemove.includes(activeAccount.accountIdentifier)) {
        await this.setActiveAccount(undefined)
      }
    }
  }

  private async requireResponse<T>(
    responsePromise: Promise<T | undefined>,
    request: BeaconRequestInputMessage,
    logId: string
  ): Promise<T> {
    try {
      return (await responsePromise)!
    } catch (requestError) {
      const error = requestError as ErrorResponse | AbortedBeaconError
      if (error instanceof AbortedBeaconError) {
        this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'abort'))
        logger.time(false, logId)
        throw error
      }
      const errorResponse = error
      errorResponse.errorType === BeaconErrorType.ABORTED_ERROR
        ? this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'abort'))
        : this.sendMetrics('performance-metrics/save', await this.buildPayload('message', 'error'))
      logger.time(false, logId)
      throw await this.handleRequestError(request, errorResponse)
    }
  }

  /**
   * This message handles errors that we receive from the wallet.
   *
   * @param request The request we sent
   * @param beaconError The error we received
   */
  private async handleRequestError(
    request: BeaconRequestInputMessage,
    beaconError: ErrorResponse
  ): Promise<void> {
    logger.error('handleRequestError', 'error response', beaconError)
    if (beaconError.errorType) {
      const buttons: AlertButton[] = []
      if (beaconError.errorType === BeaconErrorType.NO_PRIVATE_KEY_FOUND_ERROR) {
        const actionCallback = async (): Promise<void> => {
          const operationRequest: OperationRequestInput = request as OperationRequestInput
          // if the account we requested is not available, we remove it locally
          let accountInfo: AccountInfo | undefined
          if (operationRequest.sourceAddress && operationRequest.network) {
            const networkForId: Network =
              typeof operationRequest.network === 'string'
                ? networkFromTezosCaip2(normalizeTezosCaip2(operationRequest.network))
                : operationRequest.network
            const accountIdentifier = await getAccountIdentifier(
              operationRequest.sourceAddress,
              networkForId
            )
            accountInfo = await this.getAccount(accountIdentifier)

            if (accountInfo) {
              await this.removeAccount(accountInfo.accountIdentifier)
            }
          }
        }

        buttons.push({ text: 'Remove account', actionCallback })
      }

      const peer = await this.getPeer()
      const activeAccount = await this.getActiveAccount()

      // If we sent a permission request, received an error and there is no active account, we need to reset the DAppClient.
      // This most likely means that the user rejected the first permission request after pairing a wallet, so we "forget" the paired wallet to allow the user to pair again.
      if (
        request.type === BeaconMessageType.PermissionRequest &&
        (await this.getActiveAccount()) === undefined
      ) {
        this._initPromise = undefined
        await this.dropTransports()
        await this.setTransport()
        await this.setActivePeer()
      }

      const error = getError(beaconError.errorType, beaconError.errorData)
      await this.emitEventWithErrorContext(
        messageEvents[request.type].error,
        error,
        async (errorContext) => ({
          errorResponse: beaconError,
          walletInfo: await this.getWalletInfo(peer, activeAccount),
          errorMessages: this.errorMessages,
          errorContext
        }),
        buttons
      ).catch((emitError) => logger.error('handleRequestError', emitError))

      throw getError(beaconError.errorType, beaconError.errorData)
    }

    throw beaconError
  }

  /**
   * This message will send an event when we receive a successful response to one of the requests we sent.
   *
   * @param request The request we sent
   * @param response The response we received
   */
  private async notifySuccess(
    request: BeaconRequestInputMessage,
    response:
      | {
          account: AccountInfo
          output: PermissionResponseOutput
          blockExplorer: BlockExplorer
          connectionContext: ConnectionContext
          walletInfo: WalletInfo
        }
      | {
          account: AccountInfo
          output: ProofOfEventChallengeResponse
          blockExplorer: BlockExplorer
          connectionContext: ConnectionContext
          walletInfo: WalletInfo
        }
      | {
          account: AccountInfo
          output: SimulatedProofOfEventChallengeResponse
          blockExplorer: BlockExplorer
          connectionContext: ConnectionContext
          walletInfo: WalletInfo
        }
      | {
          account: AccountInfo
          output: OperationResponseOutput
          blockExplorer: BlockExplorer
          connectionContext: ConnectionContext
          walletInfo: WalletInfo
        }
      | {
          output: SignPayloadResponseOutput
          connectionContext: ConnectionContext
          walletInfo: WalletInfo
        }
      // | {
      //     output: EncryptPayloadResponseOutput
      //     connectionContext: ConnectionContext
      //     walletInfo: WalletInfo
      // }
      | {
          network: Network
          output: BroadcastResponseOutput
          blockExplorer: BlockExplorer
          connectionContext: ConnectionContext
          walletInfo: WalletInfo
        }
  ): Promise<void> {
    this.events
      .emit(messageEvents[request.type].success, response)
      .catch((emitError) => console.warn(emitError))
  }

  private async getWalletInfoFromStorage() {
    return await this.storage.get(StorageKey.LAST_SELECTED_WALLET)
  }

  private async updateStorageWallet(walletInfo: WalletInfo) {
    const wallet = await this.storage.get(StorageKey.LAST_SELECTED_WALLET)

    if (!wallet) {
      return
    }

    wallet.name = walletInfo.name
    wallet.icon = walletInfo.icon ?? wallet.icon
    this.storage.set(StorageKey.LAST_SELECTED_WALLET, wallet)
  }

  private async getWalletInfo(
    peer?: PeerInfo,
    account?: AccountInfo,
    readFromStorage: boolean = true
  ): Promise<WalletInfo> {
    const selectedAccount = account ? account : await this.getActiveAccount()

    const selectedPeer = peer ? peer : await this.getPeer(selectedAccount)

    let walletInfo: WalletInfo | undefined
    if (selectedAccount) {
      walletInfo = await this.appMetadataManager.getAppMetadata(selectedAccount.senderId)
    }

    let storageWallet

    if (readFromStorage) {
      storageWallet = await this.getWalletInfoFromStorage()
    }

    if (!walletInfo) {
      walletInfo = {
        name: selectedPeer?.name ?? storageWallet?.key ?? '',
        icon: selectedPeer?.icon ?? storageWallet?.icon,
        type: storageWallet?.type
      }

      this.updateStorageWallet(walletInfo)
    }

    const lowerCaseCompare = (str1?: string, str2?: string): boolean => {
      if (str1 && str2) {
        return str1.toLowerCase() === str2.toLowerCase()
      }

      return false
    }

    const getOrgName = (name: string) => name.split(/[_\s]+/)[0]

    const apps: AppBase[] = [
      ...getiOSList(),
      ...getWebList(),
      ...getDesktopList(),
      ...getExtensionList()
    ].filter((app: AppBase) =>
      lowerCaseCompare(getOrgName(app.key), getOrgName(walletInfo?.name ?? 'wallet'))
    )

    // TODO: Remove once all wallets send the icon?
    const mobile = (apps as App[]).find(
      (app) => app.universalLink || app.key.includes('ios') || app.key.includes('mobile')
    )
    const browser = (apps as WebApp[]).find((app) => app.links)
    const desktop = (apps as DesktopApp[]).find((app) => app.downloadLink)
    const extension = (apps as ExtensionApp[]).find((app) => app.id)

    const appTypeMap = {
      extension: { app: extension, type: 'extension' },
      desktop: { app: desktop, type: 'desktop' },
      mobile: { app: mobile, type: 'mobile' },
      web: { app: browser, type: 'web' }
    }

    const defaultType = (): {
      app: AppBase | undefined
      type: 'extension' | 'mobile' | 'web' | 'desktop' | undefined
    } => {
      if (isBrowser(window) && browser) {return { app: browser, type: 'web' }}
      if (isDesktop(window) && desktop) {return { app: desktop, type: 'desktop' }}
      if (isBrowser(window) && extension) {return { app: extension, type: 'extension' }}
      if (mobile) {return { app: mobile, type: 'mobile' }}

      return { app: undefined, type: undefined }
    }

    const { app, type } = storageWallet ? appTypeMap[storageWallet.type] : defaultType()

    if (app) {
      let deeplink: string | undefined
      if (app.hasOwnProperty('links')) {
        deeplink = (app as WebApp).links[selectedAccount?.network.type ?? this.network.type]
      } else if (app.hasOwnProperty('deepLink')) {
        deeplink = (app as App).deepLink
      }

      return {
        name: app?.name ?? walletInfo.name,
        icon: app?.logo ?? walletInfo.icon,
        deeplink,
        type: type as any
      }
    }

    return walletInfo
  }

  // Throws VersionUnsupportedBeaconError when a wallet that reported a version
  // is below requiredMinimumVersion (or reports a malformed one). Callers pass
  // the EFFECTIVE version (see effectivePeerVersion): a declared version is
  // only trusted alongside the v5 `protocolVersion` pairing marker; a
  // marker-less wallet that declared one counts as '2' (legacy wallets echo
  // the dApp's version, so the raw peer.version may read deceptively high).
  // A peer that never reported a version (WalletConnect pairings, legacy
  // pairings predating versioning) is treated as unknown and allowed through,
  // so raising the minimum never retroactively breaks an already-paired
  // session on a pure read.
  private assertWalletVersionMeetsMinimum(walletVersion: string | undefined): void {
    if (walletVersion === undefined) {
      return
    }

    const min = this.requiredMinimumVersion

    let cmp: number
    try {
      cmp = compareBeaconVersion(walletVersion, min)
    } catch {
      // A present-but-malformed version cannot be shown to meet the minimum.
      throw new VersionUnsupportedBeaconError(min, walletVersion)
    }

    if (cmp < 0) {
      throw new VersionUnsupportedBeaconError(min, walletVersion)
    }
  }

  // Distinct CAIP-2 chain ids across all session accounts. Reads the account
  // store, so callers should avoid it on paths that can decide without it.
  private async getSessionChainIds(): Promise<string[]> {
    const allAccounts = await this.accountManager.getAccounts()

    return Array.from(
      new Set(
        allAccounts
          .map((a) => a.network?.chainId)
          .filter((c): c is string => typeof c === 'string' && c.length > 0)
      )
    )
  }

  // Resolves the network for an outgoing operation. Returns the supplied
  // CAIP-2 string (validated and confirmed in-session), or the active
  // account's Network when there is no ambiguity. Throws on a multi-network
  // session when no network is supplied.
  private async resolveOperationNetwork(
    inputNetwork: string | undefined,
    activeAccount: AccountInfo
  ): Promise<Network | string> {
    if (inputNetwork) {
      if (!isValidTezosCaip2(inputNetwork)) {
        throw new NetworksUnsupportedBeaconError({
          requestedNetworks: [inputNetwork],
          unsupportedNetworks: [inputNetwork],
          customMessage: `Malformed CAIP-2 string: "${inputNetwork}". Expected format: tezos:<NetID>.`
        })
      }
      // Fast path: the active account is already on the requested network, so
      // it is trivially in-session — skip the account-store read.
      if (inputNetwork === activeAccount.network?.chainId) {
        return inputNetwork
      }
      const knownChainIds = await this.getSessionChainIds()
      // Tolerate pre-multi-network sessions with no recorded chain ids: such a
      // wallet (v2/v3) expects a Network object, not a bare CAIP-2 string it
      // cannot interpret, so return the active account's Network rather than the
      // string. (There is exactly one network in a session with no chain ids.)
      if (knownChainIds.length === 0) {
        return activeAccount.network || this.network
      }
      if (!knownChainIds.includes(inputNetwork)) {
        throw new NetworksUnsupportedBeaconError({
          requestedNetworks: [inputNetwork],
          unsupportedNetworks: [inputNetwork]
        })
      }

      return inputNetwork
    }

    // No explicit network: a session spanning more than one chain is ambiguous.
    const sessionChainIds = await this.getSessionChainIds()
    if (sessionChainIds.length > 1) {
      throw new NetworksUnsupportedBeaconError({
        requestedNetworks: [],
        unsupportedNetworks: []
      })
    }

    return activeAccount.network || this.network
  }

  private async getPeer(account?: AccountInfo): Promise<PeerInfo | undefined> {
    let peer: PeerInfo | undefined

    if (account) {
      logger.log('getPeer', 'We have an account', account)
      const postMessagePeers: ExtendedPostMessagePairingResponse[] =
        (await this.postMessageTransport?.getPeers()) ?? []
      const p2pPeers: ExtendedP2PPairingResponse[] = (await this.p2pTransport?.getPeers()) ?? []
      const walletConnectPeers: ExtendedWalletConnectPairingResponse[] =
        (await this.walletConnectTransport?.getPeers()) ?? []
      const peers = [...postMessagePeers, ...p2pPeers, ...walletConnectPeers]

      logger.log('getPeer', 'Found peers', peers, account)

      peer = peers.find((peerEl) => peerEl.senderId === account.senderId)
      if (!peer) {
        // We could not find an exact match for a sender, so we most likely received it over a relay
        peer = peers.find((peerEl) => (peerEl as any).id === account.origin.id)
      }
    } else {
      peer = await this._activePeer.promise
      logger.log('getPeer', 'Active peer', peer)
    }

    // NB: getPeer() is a pure read used during session resumption, error
    // handling and wallet-info lookups, so it must not throw on an
    // under-minimum peer (that would wipe a resumed session or mask the real
    // wallet error). The version gate is enforced at the pairing response and
    // at request-send time instead — see assertWalletVersionMeetsMinimum.
    return peer
  }

  /**
   * This method handles sending of requests to the DApp. It makes sure that the DAppClient is initialized and connected
   * to the transport. After that rate limits and permissions will be checked, an ID is attached and the request is sent
   * to the DApp over the transport.
   *
   * @param requestInput The BeaconMessage to be sent to the wallet
   * @param account The account that the message will be sent to
   * @param skipResponse If true, the function return as soon as the message is sent
   */

  // Maps each flat Tezos request type to its wrapped blockchainData
  // discriminator + scope (the pre-fork flat wire strings, kept verbatim;
  // mirrored by the wallet-side flat-output normalization).
  private static readonly FLAT_REQUEST_PAYLOAD_TYPES: Partial<
    Record<BeaconMessageType, { type: string; scope: string }>
  > = {
    [BeaconMessageType.OperationRequest]: { type: 'operation_request', scope: 'operation_request' },
    [BeaconMessageType.SignPayloadRequest]: { type: 'sign_payload_request', scope: 'sign' },
    [BeaconMessageType.BroadcastRequest]: { type: 'broadcast_request', scope: 'broadcast' },
    [BeaconMessageType.ProofOfEventChallengeRequest]: {
      type: 'proof_of_event_challenge_request',
      scope: 'proof_of_event'
    },
    [BeaconMessageType.SimulatedProofOfEventChallengeRequest]: {
      type: 'simulated_proof_of_event_challenge_request',
      scope: 'proof_of_event'
    }
  }

  // Wrapped Tezos response blockchainData discriminators → the flat
  // BeaconMessageType the request* methods (and integrators) consume.
  private static readonly TEZOS_PAYLOAD_TO_FLAT_TYPE: Record<string, BeaconMessageType> = {
    operation_response: BeaconMessageType.OperationResponse,
    sign_payload_response: BeaconMessageType.SignPayloadResponse,
    broadcast_response: BeaconMessageType.BroadcastResponse,
    proof_of_event_challenge_response: BeaconMessageType.ProofOfEventChallengeResponse,
    simulated_proof_of_event_challenge_response:
      BeaconMessageType.SimulatedProofOfEventChallengeResponse
  }

  private static readonly TEZOS_IDENTIFIERS: readonly string[] = ['tezos', 'xtz']

  // Build the wrapped Tezos wire message for a flat request input. The v4
  // multi-network `networks` field is stripped for peers negotiated below
  // v4 — a v3 peer must never see v4 payload fields.
  private wrapTezosRequest(
    flat: { type: BeaconMessageType } & Record<string, unknown>,
    envelope: { id: string; version: string; senderId: string },
    account?: AccountInfo
  ): BeaconMessageWrapper<BlockchainMessage> {
    if (flat.type === BeaconMessageType.PermissionRequest) {
      const blockchainData = { ...flat } as Record<string, unknown>
      delete blockchainData.type
      if (!isMultiNetworkVersion(envelope.version)) {
        delete blockchainData.networks
      }

      return wrapBeaconMessage(envelope, {
        blockchainIdentifier: 'tezos',
        type: BeaconMessageType.PermissionRequest,
        blockchainData
      })
    }

    const payloadMeta = DAppClient.FLAT_REQUEST_PAYLOAD_TYPES[flat.type]
    if (!payloadMeta) {
      throw new Error(`Cannot send a "${flat.type}" message: not a Tezos request type`)
    }

    const payload = { ...flat } as Record<string, unknown>
    delete payload.type

    return wrapBeaconMessage(envelope, {
      blockchainIdentifier: 'tezos',
      type: BeaconMessageType.BlockchainRequest,
      accountId: account?.accountIdentifier ?? '',
      blockchainData: {
        type: payloadMeta.type,
        scope: payloadMeta.scope,
        ...payload
      }
    })
  }

  // Normalize a wrapped Tezos wire message back to the flat shape the
  // pre-fork pipeline (request* methods, onNewAccount, integrator events)
  // consumes. Returns undefined for non-Tezos payloads, which keep the
  // wrapped pass-through of the generic permissionRequest/request API.
  private normalizeWrappedTezosMessage(
    wrapper: BeaconMessageWrapper<BeaconBaseMessage>
  ): BeaconMessage | undefined {
    const inner = wrapper.message as unknown as {
      type: BeaconMessageType
      blockchainIdentifier?: string
      blockchainData?: Record<string, unknown>
      error?: { type?: unknown; data?: unknown }
      description?: string
    }
    const envelope = { id: wrapper.id, version: wrapper.version, senderId: wrapper.senderId }

    // Chain-agnostic control messages.
    if (inner.type === BeaconMessageType.Acknowledge || inner.type === BeaconMessageType.Disconnect) {
      return { ...envelope, type: inner.type }
    }
    if (inner.type === BeaconMessageType.Error) {
      return {
        ...envelope,
        type: BeaconMessageType.Error,
        errorType: (inner.error?.type as BeaconErrorType) ?? BeaconErrorType.UNKNOWN_ERROR,
        errorData: inner.error?.data,
        description: inner.description
      }
    }

    if (
      inner.blockchainIdentifier === undefined ||
      !DAppClient.TEZOS_IDENTIFIERS.includes(inner.blockchainIdentifier)
    ) {
      return undefined
    }

    if (
      inner.type === BeaconMessageType.PermissionResponse ||
      inner.type === BeaconMessageType.ChangeAccountRequest
    ) {
      return { ...envelope, type: inner.type, ...(inner.blockchainData ?? {}) } as BeaconMessage
    }

    if (inner.type === BeaconMessageType.BlockchainResponse) {
      const payloadType = inner.blockchainData?.type
      const flatType =
        typeof payloadType === 'string'
          ? DAppClient.TEZOS_PAYLOAD_TO_FLAT_TYPE[payloadType]
          : undefined
      if (!flatType) {
        return undefined
      }
      const payload = { ...(inner.blockchainData ?? {}) }
      delete payload.type

      return { ...envelope, type: flatType, ...payload } as BeaconMessage
    }

    return undefined
  }

  private makeRequest<T extends BeaconRequestInputMessage, U extends BeaconMessage>(
    requestInput: Optional<T, IgnoredRequestInputProperties>,
    skipResponse?: undefined | false,
    otherTabMessageId?: string
  ): Promise<{
    message: U
    connectionInfo: ConnectionContext
  }>
  private makeRequest<T extends BeaconRequestInputMessage, U extends BeaconMessage>(
    requestInput: Optional<T, IgnoredRequestInputProperties>,
    skipResponse: true,
    otherTabMessageId?: string
  ): Promise<undefined>
  private async makeRequest<T extends BeaconRequestInputMessage>(
    requestInput: Optional<T, IgnoredRequestInputProperties>,
    skipResponse?: boolean,
    otherTabMessageId?: string
  ) {
    const messageId = otherTabMessageId ?? (await generateGUID())

    if (this._initPromise && this.isInitPending) {
      if (this._initPromiseReject) {
        this._initPromiseReject(new AbortedBeaconError())
        this._initPromiseReject = undefined
      }
      await Promise.all([
        this.postMessageTransport?.disconnect(),
        this.walletConnectTransport?.disconnect()
      ])
      this._initPromise = undefined
      this.hideUI(['toast'])
    }

    logger.log('makeRequest', 'starting')
    this.isInitPending = true
    await this.init()
    this.isInitPending = false
    logger.log('makeRequest', 'after init')

    if (await this.addRequestAndCheckIfRateLimited()) {
      this.events
        .emit(BeaconEvent.LOCAL_RATE_LIMIT_REACHED)
        .catch((emitError) => console.warn(emitError))

      throw new Error('rate limit reached')
    }

    if (!(await this.checkPermissions(requestInput.type))) {
      this.events.emit(BeaconEvent.NO_PERMISSIONS).catch((emitError) => console.warn(emitError))

      throw new Error('No permissions to send this request to wallet!')
    }

    if (!this.beaconId) {
      throw await this.sendInternalError('octez.connect ID not defined')
    }

    const account = await this.getActiveAccount()

    const peer = await this.getPeer(account)

    // Enforce the dApp's required minimum before a request leaves the SDK.
    // No-op under the default (permissive) minimum; otherwise rejects an
    // under-minimum wallet with VersionUnsupportedBeaconError.
    this.assertWalletVersionMeetsMinimum(effectivePeerVersion(peer))

    // The wire dialect is negotiated per peer — min(effective peer version,
    // BEACON_VERSION), floor '2'. The effective version is capability-aware:
    // legacy wallets ECHO the dApp's version in their pairing response, so
    // peer.version alone would misread a 4.8.x wallet as v4; only peers that
    // sent the v5 `protocolVersion` marker are trusted. A wrapped-capable
    // peer receives the flat requestInput (the unchanged public shape)
    // mapped onto the wrapped Tezos payload; a legacy peer receives the flat
    // v2 message it has always spoken. Integrators never see either dialect.
    const negotiatedVersion = negotiateEnvelopeVersion(effectivePeerVersion(peer))
    const requestSenderId = await getSenderId(await this.beaconId)

    let request: BeaconMessageWrapper<BlockchainMessage> | BeaconMessage
    if (usesWrappedMessages(negotiatedVersion)) {
      const wrapped = this.wrapTezosRequest(
        requestInput,
        { id: messageId, version: negotiatedVersion, senderId: requestSenderId },
        account
      )
      await this.blockchains.get('tezos')?.validateRequest(wrapped.message)
      request = wrapped
    } else {
      request = {
        id: messageId,
        version: negotiatedVersion,
        senderId: requestSenderId,
        ...requestInput
      } as unknown as BeaconMessage
    }

    let exposed

    if (!skipResponse) {
      exposed = new ExposedPromise<
        {
          message: BeaconMessage | BeaconMessageWrapper<BeaconBaseMessage>
          connectionInfo: ConnectionContext
        },
        ErrorResponse
      >()

      this.addOpenRequest(request.id, exposed)
    }

    const payload = await new Serializer(this.getPeerProtocolVersion(peer)).serialize(request)

    const walletInfo = await this.getWalletInfo(peer, account)

    logger.log('makeRequest', 'sending message', request)
    try {
      // Hook for performance measurement
      if ((window as any).__beaconPerf?.onBeforeSend) {
        (window as any).__beaconPerf.onBeforeSend()
      }
      ;(await this.transport).send(payload, peer)
      if (
        requestInput.type !== BeaconMessageType.PermissionRequest ||
        (this._activeAccount.isResolved() && (await this._activeAccount.promise))
      ) {
        this.tryToAppSwitch()
      }
    } catch (sendError) {
      const error = new UnknownBeaconError()
      await this.emitEventWithErrorContext(
        BeaconEvent.INTERNAL_ERROR,
        error,
        async (errorContext) => ({
          text: 'Unable to send message. If this problem persists, please reset the connection and pair your wallet again.',
          errorContext,
          buttons: [
            {
              text: 'Reset Connection',
              actionCallback: async () => {
                closeToast()
                this.disconnect()
              }
            }
          ]
        })
      )
      throw sendError
    }

    if (!otherTabMessageId) {
      this.events
        .emit(messageEvents[requestInput.type].sent, {
          walletInfo: {
            ...walletInfo,
            name: walletInfo.name ?? 'Wallet'
          },
          extraInfo: {
            resetCallback: async () => {
              this.disconnect()
            }
          }
        })
        .catch((emitError) => console.warn(emitError))
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return exposed?.promise as any // TODO: fix type
  }

  /**
   * This method handles sending of requests to the DApp. It makes sure that the DAppClient is initialized and connected
   * to the transport. After that rate limits and permissions will be checked, an ID is attached and the request is sent
   * to the DApp over the transport.
   *
   * @param requestInput The BeaconMessage to be sent to the wallet
   * @param account The account that the message will be sent to
   */
  private async makeRequestV3<
    T extends BlockchainMessage,
    U extends BeaconMessageWrapper<BlockchainMessage>
  >(
    requestInput: T,
    otherTabMessageId?: string
  ): Promise<{
    message: U
    connectionInfo: ConnectionContext
  }> {
    if (this._initPromise && this.isInitPending) {
      if (this._initPromiseReject) {
        this._initPromiseReject(new AbortedBeaconError())
        this._initPromiseReject = undefined
      }
      await Promise.all([
        this.postMessageTransport?.disconnect(),
        this.walletConnectTransport?.disconnect()
      ])
      this._initPromise = undefined
      this.hideUI(['toast'])
    }

    const messageId = otherTabMessageId ?? (await generateGUID())
    logger.log('makeRequest', 'starting')
    this.isInitPending = true
    await this.init(undefined, true)
    this.isInitPending = false
    logger.log('makeRequest', 'after init')

    if (await this.addRequestAndCheckIfRateLimited()) {
      this.events
        .emit(BeaconEvent.LOCAL_RATE_LIMIT_REACHED)
        .catch((emitError) => console.warn(emitError))

      throw new Error('rate limit reached')
    }

    if (!this.beaconId) {
      throw await this.sendInternalError('octez.connect ID not defined')
    }

    const account = await this.getActiveAccount()

    const peer = await this.getPeer(account)

    // Enforce the dApp's required minimum before a request leaves the SDK.
    this.assertWalletVersionMeetsMinimum(effectivePeerVersion(peer))

    // The envelope carries the version negotiated against the effective
    // (capability-aware) peer version — see effectivePeerVersion: legacy
    // wallets echo the dApp's version, so only peers that sent the v5
    // `protocolVersion` marker are trusted with the v4 dialect. Unlike
    // makeRequest, this path is wrapper-only (the v3 blockchainData shape
    // has no flat equivalent), so it floors at '3' instead of '2': a legacy
    // wallet routes a version-'3' wrapper through its v3 branch, whereas a
    // '2'-stamped wrapper would be misrouted as flat and silently dropped.
    const negotiatedVersion = negotiateEnvelopeVersion(effectivePeerVersion(peer))
    const request: BeaconMessageWrapper<BlockchainMessage> = {
      id: messageId,
      version: usesWrappedMessages(negotiatedVersion)
        ? negotiatedVersion
        : String(MESSAGE_WRAPPED_FROM_VERSION),
      senderId: await getSenderId(await this.beaconId),
      message: requestInput
    }

    const exposed = new ExposedPromise<
      {
        message: BeaconMessage | BeaconMessageWrapper<BeaconBaseMessage>
        connectionInfo: ConnectionContext
      },
      ErrorResponse
    >()

    this.addOpenRequest(request.id, exposed)

    const payload = await new Serializer(this.getPeerProtocolVersion(peer)).serialize(request)

    const walletInfo = await this.getWalletInfo(peer, account)

    logger.log('makeRequest', 'sending message', request)
    try {
      // Hook for performance measurement
      if ((window as any).__beaconPerf?.onBeforeSend) {
        (window as any).__beaconPerf.onBeforeSend()
      }
      ;(await this.transport).send(payload, peer)
      if (
        request.message.type !== BeaconMessageType.PermissionRequest ||
        (this._activeAccount.isResolved() && (await this._activeAccount.promise))
      ) {
        this.tryToAppSwitch()
      }
    } catch (sendError) {
      const error = new UnknownBeaconError()
      await this.emitEventWithErrorContext(
        BeaconEvent.INTERNAL_ERROR,
        error,
        async (errorContext) => ({
          text: 'Unable to send message. If this problem persists, please reset the connection and pair your wallet again.',
          errorContext,
          buttons: [
            {
              text: 'Reset Connection',
              actionCallback: async () => {
                closeToast()
                this.disconnect()
              }
            }
          ]
        })
      )
      throw sendError
    }

    const index = requestInput.type as any as BeaconMessageType

    this.events
      .emit(messageEvents[index].sent, {
        walletInfo: {
          ...walletInfo,
          name: walletInfo.name ?? 'Wallet'
        },
        extraInfo: {
          resetCallback: async () => {
            this.disconnect()
          }
        }
      })
      .catch((emitError) => console.warn(emitError))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return exposed.promise as any // TODO: fix type
  }

  private async makeRequestBC<T extends BeaconRequestInputMessage, U extends BeaconMessage>(
    request: Optional<T, IgnoredRequestInputProperties>
  ): Promise<
    | {
        message: U
        connectionInfo: ConnectionContext
      }
    | undefined
  > {
    if (!this._transport.isResolved()) {
      return
    }

    const transport = await this.transport

    if (transport.type !== TransportType.WALLETCONNECT) {
      return
    }

    if (await this.addRequestAndCheckIfRateLimited()) {
      this.events
        .emit(BeaconEvent.LOCAL_RATE_LIMIT_REACHED)
        .catch((emitError) => console.warn(emitError))

      throw new Error('rate limit reached')
    }

    const id = await generateGUID()

    this.multiTabChannel.postMessage({
      type: request.type,
      data: request,
      id
    })

    if (
      request.type !== BeaconMessageType.PermissionRequest ||
      (this._activeAccount.isResolved() && (await this._activeAccount.promise))
    ) {
      this.tryToAppSwitch()
    }

    this.events
      .emit(messageEvents[BeaconMessageType.PermissionRequest].sent, {
        walletInfo: await this.getWalletInfo(),
        extraInfo: {
          resetCallback: () => this.disconnect()
        }
      })
      .catch((emitError) => console.warn(emitError))

    const exposed = new ExposedPromise<
      {
        message: U
        connectionInfo: ConnectionContext
      },
      ErrorResponse
    >()

    this.addOpenRequest(id, exposed as any)

    return exposed.promise
  }

  public async disconnect() {
    if (!this._transport.isResolved()) {
      throw new Error('No transport available.')
    }

    const transport = await this.transport

    if (transport.connectionStatus === TransportStatus.NOT_CONNECTED) {
      throw new Error('Not connected.')
    }

    await this.createStateSnapshot()
    this.sendMetrics('performance-metrics/save', await this.buildPayload('disconnect', 'start'))

    const peers = await transport.getPeers()
    if (peers.length > 0) {
      const shouldNotifyPeers = !(transport instanceof WalletConnectTransport)
      await this.removeAllPeers(shouldNotifyPeers)
    }

    await this.clearActiveAccount()
    if (!(transport instanceof WalletConnectTransport)) {
      await transport.disconnect()
    }
    // The active transport is already disconnected above; this stops the
    // other one (a second disconnect is a no-op) and drops the instances.
    await this.dropTransports()

    await this.setTransport()
    this._initPromise = undefined
    this._initPromiseReject = undefined
    this.isInitPending = false
    this.sendMetrics('performance-metrics/save', await this.buildPayload('disconnect', 'success'))
  }

  /**
   * Adds a requests to the "openRequests" set so we know what messages have already been answered/handled.
   *
   * @param id The ID of the message
   * @param promise A promise that resolves once the response for that specific message is received
   */
  private addOpenRequest(
    id: string,
    promise: ExposedPromise<
      {
        message: BeaconMessage | BeaconMessageWrapper<BeaconBaseMessage>
        connectionInfo: ConnectionContext
      },
      ErrorResponse
    >
  ): void {
    logger.log('addOpenRequest', this.name, `adding request ${id} and waiting for answer`)
    this.openRequests.set(id, promise)
  }

  private async sendNotificationWithAccessToken(notification: {
    url: string
    recipient: string
    title: string
    body: string
    payload: string
    protocolIdentifier: string
    accessToken: string
  }): Promise<string> {
    const { url, recipient, title, body, payload, protocolIdentifier, accessToken } = notification
    const timestamp = new Date().toISOString()

    const keypair = await this.keyPair

    const rawPublicKey = keypair.publicKey

    const prefix = Buffer.from(new Uint8Array([13, 15, 37, 217]))

    const publicKey = bs58check.encode(Buffer.concat([prefix, Buffer.from(rawPublicKey)]))

    const constructedString = [
      'Tezos Signed Message: ',
      recipient,
      title,
      body,
      timestamp,
      payload
    ].join(' ')

    const bytes = toHex(constructedString)
    const payloadBytes = `05` + `01${  bytes.length.toString(16).padStart(8, '0')  }${bytes}`

    const signature = await signMessage(payloadBytes, {
      secretKey: Buffer.from(keypair.secretKey)
    })

    const notificationResponse = await fetch(`${url}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient,
        title,
        body,
        timestamp,
        payload,
        accessToken,
        protocolIdentifier,
        sender: {
          name: this.name,
          publicKey,
          signature
        }
      })
    })

    if (!notificationResponse.ok) {
      throw new Error(
        `sendNotification failed: ${notificationResponse.status} ${notificationResponse.statusText}`
      )
    }

    return notificationResponse.json()
  }

  // Delegate the per-network unpacking to the Tezos blockchain plug-in (the
  // single owner of the v4 fanout shape) and enrich each returned record with
  // the envelope-level AccountInfo metadata that the parser doesn't see.
  private async buildAccountInfosFromV4Fanout(
    message: PermissionResponse,
    fanout: PermissionResponseAccounts,
    peerVersion: string,
    connectionInfo: ConnectionContext
  ): Promise<AccountInfo[]> {
    // Keyed by the CAIP-2 namespace `'tezos'`, which is also the wire-format
    // `blockchainIdentifier` carried by PermissionRequestV3/Response. The
    // dApp must have registered `new TezosBlockchain()` via `addBlockchain`
    // before requesting permissions on the v4 path.
    const tezosBlockchain = this.blockchains.get('tezos')
    if (!tezosBlockchain) {
      throw new Error('Tezos blockchain handler is required to parse v4 permission responses')
    }

    // Normalize the legacy `pubkey`/`pubKey` aliases and prefix any raw key
    // before handing the fanout to the parser. The parser keeps publicKey
    // strings verbatim, so prefixing here keeps stored records canonical.
    const envelopePublicKey =
      message.publicKey ?? (message as { pubkey?: string }).pubkey
    const prefixedEnvelopePk = envelopePublicKey ? prefixPublicKey(envelopePublicKey) : undefined
    const prefixedFanout = Object.fromEntries(
      Object.entries(fanout).map(([cid, raw]) => [
        cid,
        { ...raw, publicKey: raw?.publicKey ? prefixPublicKey(raw.publicKey) : undefined }
      ])
    )
    const synthesizedResponse = {
      blockchainIdentifier: 'tezos',
      type: BeaconMessageType.PermissionResponse,
      blockchainData: {
        ...message,
        publicKey: prefixedEnvelopePk,
        accounts: prefixedFanout
      }
    } as unknown as PermissionResponseV3<'tezos'>

    const partials = await tezosBlockchain.getAccountInfosFromPermissionResponse(
      synthesizedResponse,
      peerVersion
    )

    const walletKey = (await this.storage.get(StorageKey.LAST_SELECTED_WALLET))?.key

    return Promise.all(
      partials.map(async (p) => {
        if (!p.publicKey && !p.address) {
          throw new Error('PublicKey or Address must be defined for multi-network account')
        }
        const address: string = p.address || (await getAddressFromPublicKey(p.publicKey))
        // The parser keys by the address it saw; re-derive accountId if we
        // synthesized the address from a publicKey above.
        const accountIdentifier =
          p.address || !p.network ? p.accountId : await getAccountIdentifier(address, p.network)

        return {
          accountIdentifier,
          senderId: message.senderId,
          origin: {
            type: connectionInfo.origin,
            id: connectionInfo.id
          },
          walletKey,
          address,
          publicKey: p.publicKey || undefined,
          // The v4 fanout parser always sets a Network (networkFromTezosCaip2);
          // the `?? this.network` fallback keeps the type `Network` (required by
          // AccountInfo) without an `as AccountInfo` assertion.
          network: p.network ?? this.network,
          scopes: message.scopes,
          threshold: message.threshold,
          notification: message.notification,
          connectedAt: new Date().getTime(),
          walletType: message.walletType ?? 'implicit',
          verificationType: message.verificationType,
          ...(message.verificationType === 'proof_of_event'
            ? { hasVerifiedChallenge: false }
            : {})
        }
      })
    )
  }

  private async onNewAccount(
    message: PermissionResponse | ChangeAccountRequest,
    connectionInfo: ConnectionContext
  ): Promise<AccountInfo> {
    // TODO: Migration code. Remove sometime after 1.0.0 release.
    const tempPK: string | undefined =
      message.publicKey || (message as any).pubkey || (message as any).pubKey

    const publicKey = tempPK ? prefixPublicKey(tempPK) : undefined

    if (!publicKey && !message.address) {
      throw new Error('PublicKey or Address must be defined')
    }

    const address = message.address ?? (await getAddressFromPublicKey(publicKey!))

    if (!isValidAddress(address)) {
      throw new Error(`Invalid address: "${address}"`)
    }

    if (
      message.walletType === 'abstracted_account' &&
      address.substring(0, 3) !== CONTRACT_PREFIX
    ) {
      throw new Error(
        `Invalid abstracted account address "${address}", it should be a ${CONTRACT_PREFIX} address`
      )
    }

    logger.log('######## MESSAGE #######')
    logger.log('onNewAccount', message)

    const walletKey = (await this.storage.get(StorageKey.LAST_SELECTED_WALLET))?.key

    const accountInfo: AccountInfo = {
      accountIdentifier: await getAccountIdentifier(address, message.network),
      senderId: message.senderId,
      origin: {
        type: connectionInfo.origin,
        id: connectionInfo.id
      },
      walletKey,
      address,
      publicKey,
      network: message.network,
      scopes: message.scopes,
      threshold: message.threshold,
      notification: message.notification,
      connectedAt: new Date().getTime(),
      walletType: message.walletType ?? 'implicit',
      verificationType: message.verificationType,
      ...(message.verificationType === 'proof_of_event' ? { hasVerifiedChallenge: false } : {})
    }

    logger.log('accountInfo', '######## ACCOUNT INFO #######')

    logger.log('accountInfo', accountInfo)

    await this.accountManager.addAccount(accountInfo)
    await this.setActiveAccount(accountInfo)

    return accountInfo
  }
}
