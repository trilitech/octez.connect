export { keys } from './utils/keys'
export { ExposedPromise, ExposedPromiseStatus } from './utils/exposed-promise'
export {
  getKeypairFromSeed,
  toHex,
  getAddressFromPublicKey,
  decryptCryptoboxPayload,
  encryptCryptoboxPayload,
  getHexHash,
  sealCryptobox,
  openCryptobox,
  recipientString,
  signMessage,
  isValidAddress,
  prefixPublicKey,
  encodePoeChallengePayload,
  isPublicKeySC,
  createReceiverSessionKey,
  createSenderSessionKey
} from './utils/crypto'
export {
  convertPublicKeyToX25519,
  convertSecretKeyToX25519,
  generateKeyPairFromSeed,
  sign,
  type KeyPair
} from './utils/ed25519'
export type { SessionKeys } from './utils/crypto'
export {
  assertSignPayloadConsistent,
  encodeTezosSignedMessage,
  SignPayloadConsistencyError,
  type SignPayloadConsistencyReason,
  type AssertSignPayloadOptions
} from './utils/sign-payload'
export { generateGUID } from './utils/generate-uuid'
export { loadWalletLists, WalletLists } from './wallet-list-loader'
export { fetchWalletListsFromGitHub, WalletRegistry } from './wallet-list-fetcher'

export const CONTRACT_PREFIX = 'KT1'
export const secretbox_NONCEBYTES = 24 // crypto_secretbox_NONCEBYTES
export const secretbox_MACBYTES = 16 // crypto_secretbox_MACBYTES
