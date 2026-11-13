export const SDK_VERSION: string = '5.0.5'
export const BEACON_VERSION: string = '4'
export const PROTOCOL_VERSION_V1 = 1
export const PROTOCOL_VERSION_V2 = 2
export const LATEST_PROTOCOL_VERSION = PROTOCOL_VERSION_V2
export const DEFAULT_PROTOCOL_VERSION = PROTOCOL_VERSION_V1

export const NOTIFICATION_ORACLE_URL: string =
  'https://beacon-notification-oracle.dev.gke.papers.tech'

export const BACKEND_URL: string = 'https://beacon-backend.prod.gke.papers.tech'

/**
 * Shared ecosystem WalletConnect Cloud projectId, applied by default so dApps
 * can offer WalletConnect wallets (e.g. Kukai Mobile) without registering
 * their own project — WalletConnect's free tier comfortably covers the Tezos
 * ecosystem's volume. Override per dApp via
 * `DAppClientOptions.walletConnectOptions.projectId`; opt out entirely via
 * `disableWalletConnect`. Same id that 4.8.x shipped as its built-in default.
 */
export const DEFAULT_WALLETCONNECT_PROJECT_ID = '24469fd0a06df227b6e5f7dc7de0ff4f'
