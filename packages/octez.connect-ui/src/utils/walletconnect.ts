// Replaces @walletconnect/utils parseUri(...).symKey usage to avoid pulling crypto shims into beacon-ui.
export const hasWalletConnectSymKey = (uri: string | undefined | null): boolean => {
  // Tolerate a missing URI: when WalletConnect is disabled the pairing flow has no
  // WC sync code, so callers may pass an empty/undefined value here.
  if (!uri || !uri.startsWith('wc:')) {
    return false
  }

  const queryStart = uri.indexOf('?')
  if (queryStart === -1) {
    return false
  }

  return Boolean(new URLSearchParams(uri.slice(queryStart + 1)).get('symKey'))
}
