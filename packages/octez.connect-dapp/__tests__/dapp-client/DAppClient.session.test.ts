// Messages are fed to handleResponse exactly as the P2P transport hands them
// over: connectionInfo.id is the public key the message was decrypted with,
// and `senderId` is a field inside the decrypted message.

import { getSenderId } from '@tezos-x/octez.connect-core'
import { Origin, StorageKey } from '@tezos-x/octez.connect-types'
import {
  ExposedPromise,
  getAddressFromPublicKey,
  getKeypairFromSeed,
  prefixPublicKey,
  toHex
} from '@tezos-x/octez.connect-utils'
import { DAppClient } from '../../src/dapp-client/DAppClient'
import { BeaconEvent } from '../../src/events'
import { DappP2PTransport } from '../../src/transports/DappP2PTransport'
import { DappPostMessageTransport } from '../../src/transports/DappPostMessageTransport'

// Same heavy-module mocks as DAppClient.disconnect.test.ts.
jest.mock('@tezos-x/octez.connect-ui', () => ({
  setColorMode: jest.fn(),
  getColorMode: jest.fn().mockReturnValue('light'),
  setDesktopList: jest.fn(),
  setExtensionList: jest.fn(),
  setWebList: jest.fn(),
  setiOSList: jest.fn(),
  getiOSList: jest.fn().mockReturnValue([]),
  getDesktopList: jest.fn().mockReturnValue([]),
  getExtensionList: jest.fn().mockReturnValue([]),
  getWebList: jest.fn().mockReturnValue([]),
  isBrowser: jest.fn().mockReturnValue(true),
  isDesktop: jest.fn().mockReturnValue(false),
  isMobileOS: jest.fn().mockReturnValue(false),
  isIOS: jest.fn().mockReturnValue(false),
  currentOS: jest.fn().mockReturnValue('test'),
  closeToast: jest.fn()
}))
jest.mock('@tezos-x/octez.connect-transport-walletconnect', () => ({
  WalletConnectTransport: class WalletConnectTransport {}
}))
jest.mock('@walletconnect/sign-client', () => ({}))
jest.mock('@walletconnect/types', () => ({}))
jest.mock('@walletconnect/utils', () => ({ getSdkError: jest.fn() }))

/** A wallet: its connection key (P2P identity) plus the Tezos account it reports. */
const makeWallet = async (seed: string) => {
  const connection = await getKeypairFromSeed(`${seed}-connection`)
  const connectionKey = toHex(connection.publicKey)
  const tezos = await getKeypairFromSeed(`${seed}-tezos`)
  const publicKey = prefixPublicKey(toHex(tezos.publicKey))
  return {
    connectionKey,
    senderId: await getSenderId(connectionKey),
    account: { publicKey, address: await getAddressFromPublicKey(publicKey) },
    peer: {
      id: `${seed}-pairing`,
      type: 'p2p-pairing-response',
      name: seed,
      publicKey: connectionKey,
      version: '3',
      relayServer: 'relay.example',
      senderId: await getSenderId(connectionKey)
    }
  }
}

const accountMessage = (
  type: 'change_account_request' | 'permission_response',
  senderId: string,
  account: { publicKey: string; address: string }
) => ({
  id: 'msg-' + Math.random(),
  version: '2',
  senderId,
  type,
  publicKey: account.publicKey,
  address: account.address,
  network: { type: 'mainnet' },
  scopes: ['operation_request', 'sign']
})

/**
 * A dApp paired with `user` (active account) and, when given, a second saved
 * but inactive wallet. `send(wallet, msg)` delivers msg as if decrypted with
 * that wallet's connection key.
 */
const connectedDapp = async (inactive?: Awaited<ReturnType<typeof makeWallet>>) => {
  localStorage.clear()
  // No network: never start the real relay/extension transports.
  jest.spyOn(DAppClient.prototype, 'initInternalTransports').mockResolvedValue(undefined)
  const client = new DAppClient({
    name: 'test-dapp',
    disableDefaultEvents: true,
    disableWalletConnect: true
  })
  await client.subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, () => undefined)

  const user = await makeWallet('user')
  const storage = (client as any).storage
  await storage.set(
    StorageKey.TRANSPORT_P2P_PEERS_DAPP,
    inactive ? [user.peer, inactive.peer] : [user.peer]
  )

  const send = (wallet: { connectionKey: string }, msg: unknown) =>
    (client as any).handleResponse(msg, { origin: Origin.P2P, id: wallet.connectionKey })

  if (inactive) {
    // The inactive wallet granted permission earlier: it has a saved account.
    await (client as any).onNewAccount(
      accountMessage('permission_response', inactive.senderId, inactive.account),
      { origin: Origin.P2P, id: inactive.connectionKey }
    )
  }
  // The user's wallet granted permission most recently: it is the active one.
  await (client as any).onNewAccount(
    accountMessage('permission_response', user.senderId, user.account),
    { origin: Origin.P2P, id: user.connectionKey }
  )

  const closedEvents = { count: 0 }
  await client.subscribeToEvent(BeaconEvent.CHANNEL_CLOSED, () => {
    closedEvents.count += 1
  })
  const activeAddress = async () => (await client.getActiveAccount())?.address

  return { client, user, send, closedEvents, activeAddress, storage }
}

describe('DAppClient pairing and session checks', () => {
  afterEach(() => jest.restoreAllMocks())

  // --- must be refused ---

  it('drops an extension message whose senderId belongs to another paired extension', async () => {
    const { client, storage } = await connectedDapp()
    const a = await makeWallet('extension-a')
    const b = await makeWallet('extension-b')
    await storage.set(StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP, [
      { publicKey: a.connectionKey, extensionId: 'ext-A' },
      { publicKey: b.connectionKey, extensionId: 'ext-B' }
    ])
    const openRequests = (client as any).openRequests
    openRequests.set('req-1', new ExposedPromise())
    openRequests.set('req-2', new ExposedPromise())
    const answer = (id: string, senderId: string) =>
      (client as any).handleResponse(
        { id, version: '2', senderId, type: 'sign_payload_response', signature: 'sig' },
        { origin: Origin.EXTENSION, id: 'ext-B' }
      )
    const pendingReq1 = openRequests.get('req-1')
    const pendingReq2 = openRequests.get('req-2')

    await answer('req-1', a.senderId) // extension B answering as extension A
    await answer('req-2', b.senderId) // extension B answering as itself

    expect(pendingReq1.isResolved()).toBe(false)
    expect(pendingReq2.isResolved()).toBe(true)
    await client.destroy()
  })

  it('ignores "change account" from a wallet that is not the active one', async () => {
    const other = await makeWallet('other')
    const { client, user, send, activeAddress } = await connectedDapp(other)

    await send(other, accountMessage('change_account_request', other.senderId, other.account))

    expect(await activeAddress()).toBe(user.account.address)
    await client.destroy()
  })

  it('drops a message whose senderId belongs to a different wallet than the one that sent it', async () => {
    const other = await makeWallet('other')
    const { client, user, send, activeAddress } = await connectedDapp(other)

    // Sent (encrypted) by the other wallet, but claiming to be the user's wallet.
    await send(other, accountMessage('change_account_request', user.senderId, other.account))

    expect(await activeAddress()).toBe(user.account.address)
    await client.destroy()
  })

  it('rejects "change account" whose address does not match its public key', async () => {
    const other = await makeWallet('other')
    const { client, user, send, activeAddress } = await connectedDapp()

    // The user's own wallet, but with a different address.
    await send(
      user,
      accountMessage('change_account_request', user.senderId, {
        publicKey: user.account.publicKey,
        address: other.account.address
      })
    ).catch(() => undefined)

    expect(await activeAddress()).toBe(user.account.address)
    await client.destroy()
  })

  it('ignores "disconnect" from a wallet it never paired with', async () => {
    const unknown = await makeWallet('unknown')
    const { client, user, send, closedEvents, activeAddress } = await connectedDapp()

    await send(unknown, { id: 'm', version: '2', senderId: unknown.senderId, type: 'disconnect' })

    expect(closedEvents.count).toBe(0)
    expect(await activeAddress()).toBe(user.account.address)
    await client.destroy()
  })

  it('a saved but inactive wallet disconnecting removes only itself', async () => {
    const other = await makeWallet('other')
    const { client, user, send, closedEvents, activeAddress, storage } = await connectedDapp(other)

    await send(other, { id: 'm', version: '2', senderId: other.senderId, type: 'disconnect' })

    expect(closedEvents.count).toBe(0)
    expect(await activeAddress()).toBe(user.account.address)
    // Its saved account is gone; the user's stays. (Removing its peer record goes
    // through the live P2P transport, which this offline test does not start.)
    const accounts = await (client as any).accountManager.getAccounts()
    expect(accounts.map((a: any) => a.address)).toEqual([user.account.address])
    void storage
    await client.destroy()
  })

  it('stops accepting pairing replies once pairing stops listening (popup closed or paired)', async () => {
    const keys = await getKeypairFromSeed('dapp')
    const storage = {
      get: async () => [],
      set: async () => undefined,
      delete: async () => undefined
    }
    const transports = [
      new DappP2PTransport('dapp', keys, storage as any, {} as any),
      new DappPostMessageTransport('dapp', keys, storage as any)
    ]
    for (const transport of transports) {
      const clear = jest.spyOn((transport as any).client, 'clearPendingPairings')
      await transport.stopListeningForNewPeers()
      expect(clear).toHaveBeenCalledTimes(1)
    }
  })

  // --- normal use: must still work ---

  it('still accepts "change account" from the active wallet', async () => {
    const { client, user, send, activeAddress } = await connectedDapp()
    const second = await makeWallet('user-second-account')

    await send(user, accountMessage('change_account_request', user.senderId, second.account))

    expect(await activeAddress()).toBe(second.account.address)
    await client.destroy()
  })

  it('still ends the session when the active wallet disconnects', async () => {
    const { client, user, send, closedEvents } = await connectedDapp()
    // Clearing the active account waits on the live transport, which this
    // offline test does not start: settle it as "none".
    ;(client as any)._transport.resolve(undefined)

    await send(user, { id: 'm', version: '2', senderId: user.senderId, type: 'disconnect' })

    expect(closedEvents.count).toBe(1)
    await client.destroy()
  })
})
