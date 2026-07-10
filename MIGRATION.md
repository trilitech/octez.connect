# Migrating to octez.connect v5 (multi-network) — from v4.8.6

**Headline:** v5 adds **multi-network support** — a single pairing can grant a dApp
accounts on several Tezos networks at once (e.g. mainnet + ghostnet), and
operations can target a specific network by its CAIP‑2 chain id. This is the
main reason to upgrade.

**Protocol hard fork:** v5 removes the legacy flat "v2" wire format. The wire
is now **wrapped v3/v4 only** — every message ships as a
`{ id, version, senderId, message }` envelope, stamped with the version
negotiated against the peer (`min(peer.version, '4')`, floor `'3'`).
**Your code does not change**: the dApp API (`requestPermissions()`,
`requestOperation()`, …) and the wallet API (`newMessageCallback` payloads,
`respond()` inputs) keep their exact flat shapes — both SDK boundaries
normalize to and from the wire internally, and version numbers never appear in
integrator code. The break is only **against pre‑fork SDK peers** (see the
matrix below). Existing paired sessions survive the upgrade — persisted
account identifiers are unchanged for single‑network (legacy) accounts.

> The package names did **not** change (`@tezos-x/octez.connect-*` in both
> v4.8.6 and v5). This is **not** a rename migration — your imports stay the
> same. For many apps the upgrade is a version bump plus a short, well‑defined
> list of required edits below.

---

## 1. Interop / backward‑compatibility matrix

| dApp | Wallet | Result |
|------|--------|--------|
| **v4.8.6 (flat v2)** | **v5** | ❌ Rejected fast with a typed error: the v5 wallet answers the legacy request with a flat `ErrorResponse` tombstone (`UNKNOWN_ERROR` + "protocol version 2 is no longer supported…"), so the old dApp fails cleanly instead of hanging. |
| **v5** | **v4.8.6** | ❌ Rejected at request time with `VersionUnsupportedBeaconError` — the default `requiredMinimumVersion` is now `'3'`, below which no shared wire dialect exists. |
| **v5 (wrapped‑capable peer, `peer.version >= 3`)** | **v5** | ✅ Wrapped v3/v4. A v3 peer receives `'3'` envelopes and never sees v4 fields. |
| **v5** | **v5** | ✅ Full multi-network over wrapped v4. |
| any dApp | any **WalletConnect** wallet | ✅ Unaffected by the beacon fork — WC wallets never parsed beacon envelopes (the SDK synthesizes them internally). Multi-network over WC needs a wallet that approves multi‑chain session namespaces (see §3). |

**How the handshake works:** each peer advertises its protocol version at
pairing time (`peer.version`); the outgoing envelope is stamped with
`min(peer.version, '4')`, floor `'3'`. The dApp only uses multi-network
features when the wallet advertises version ≥ 4. Malformed or absent versions
are treated as "below v4" (and served the `'3'` floor), so a hostile or legacy
peer can never trip the new code paths. WalletConnect peers carry **no**
beacon version (never fabricated); their multi-network capability is
negotiated via session namespaces instead.

**Graceful degradation (important nuance):** by default a v5 dApp that requests
multiple networks from a single‑network wallet receives a **single** account
with **no error** — best‑effort. If your dApp *requires* multi-network, set
`requiredMinimumVersion: '4'` (see §3) so a non‑v4 wallet is rejected cleanly
with `VersionUnsupportedBeaconError` instead of silently degrading.

---

## 2. The minimum upgrade (no new features)

Bump every `@tezos-x/octez.connect-*` dependency from `4.8.6` to
`5.0.0-beta.x`, then apply the required edits below. These are **breaking
changes independent of multi-network** — you must handle them even if you never
touch a second network.

### 2.1 dApp — required edits

| # | Change | What to do |
|---|--------|-----------|
| 1 | **WalletConnect is now opt‑in.** In v4.8.6 the WC transport was built automatically (with a shared default `projectId`). In v5, WC is **only** enabled when you pass `walletConnectOptions`. | If you offer WalletConnect wallets (e.g. Kukai), pass `walletConnectOptions: { projectId: '<your-id>' }` to `DAppClient`. Omitting it now means **no WC pairing at all** (no error — it just isn't offered). Get a `projectId` from WalletConnect Cloud. |
| 2 | **`DAppClientOptions.disclaimerText` removed** → replaced by `termsAndConditionsUrl` (+ new optional `privacyPolicyUrl`). | Rename the option. |
| 3 | **`DAppClientOptions.requestTimeoutMs` removed** and the built‑in per‑request timeout is gone. | If you relied on requests auto‑rejecting after a timeout, wrap your calls in your own `Promise.race` / `AbortController`. |
| 4 | **`disconnect()` and `removeAllPeers()` dropped their options arguments;** the types `DAppClientDisconnectOptions` and `DAppClientRemoveAllPeersOptions` are removed. | Call `disconnect()` / `removeAllPeers(sendDisconnectToPeers?)` without an options object; delete those type imports. |
| 5 | **`PeerUnreachableBeaconError` removed.** | Remove any `import`/`instanceof` of it. |
| 6 | **Tezos blockchain identifier is `'tezos'`, not `'xtz'`.** | If you look up or register the Tezos handler, use `'tezos'` (`blockchains.get('tezos')`, `addBlockchain(new TezosBlockchain())`). |

### 2.2 Wallet — required edits

| # | Change | What to do |
|---|--------|-----------|
| 1 | **`WalletClient.subscribeToDisconnect()` / `unsubscribeFromDisconnect()` removed** (and the `DisconnectListener` type). | Remove those registrations — disconnects are handled internally now. There is no public replacement. |
| 2 | **`WalletClient.connect()` now filters to a request‑type allowlist.** Your message callback no longer fires for response‑type messages echoed back by the relay. | Usually desirable; only act if you depended on seeing echoed responses. |
| 3 | **Tezos blockchain identifier is `'tezos'`, not `'xtz'`.** | Register/look up the Tezos handler under `'tezos'`. |

### 2.3 Both — runtime

- **WalletConnect bumped `2.18.0` → `2.23.6`.** The SDK bundles it (not a peer
  dependency), so no action is needed **unless** you install `@walletconnect/*`
  yourself — then move your copy to `2.23.x` to avoid duplicates.
  **Kukai‑iOS note:** the 4.8‑stable line pins WC to `2.18.0` for Kukai iOS
  compatibility; **v5 deliberately stays on `2.23.x`** (required for
  multi-network). Do **not** pin v5 back to `2.18.0`. Re‑verify Kukai iOS
  pairing against `2.23.6`.
- Node/npm engine requirements are **unchanged** from v4.8.6
  (`node ≥ 22.12`, `npm ≥ 11`).
- **Deep imports into `@tezos-x/octez.connect-core`** moved from
  `dist/cjs/index.js` to `dist/cjs/src/index.js` (and the esm/types
  equivalents). Package‑name imports are unaffected; only hard‑coded deep file
  paths break.

If your app uses none of the removed options/APIs and doesn't rely on implicit
WalletConnect, the upgrade really is just the version bump.

---

## 3. Opting into multi-network

### 3.1 dApp

```ts
import { DAppClient } from '@tezos-x/octez.connect-dapp'
import { TezosBlockchain } from '@tezos-x/octez.connect-blockchain-tezos'

const client = new DAppClient({
  name: 'My dApp',
  network: { type: NetworkType.MAINNET },
  walletConnectOptions: { projectId: '<your-id>' }, // if you want WC
  // Optional: require a multi-network-capable wallet (rejects v4.8.6 wallets
  // with VersionUnsupportedBeaconError instead of degrading to one account).
  requiredMinimumVersion: '4'
})

// TezosBlockchain is registered by DEFAULT since the hard fork — no
// addBlockchain call needed (calling it again to override is still allowed).

// Ask for several networks at once (CAIP-2 chain ids):
await client.requestPermissions({
  networks: [
    { chainId: 'tezos:NetXdQprcVkpaWU' }, // mainnet
    { chainId: 'tezos:NetXnHfVqm9iesp' }  // ghostnet
  ]
})

// One AccountInfo is materialised per granted network; each carries network.chainId:
const accounts = await client.getAccounts()

// Target a specific network on an operation:
await client.requestOperation({
  network: 'tezos:NetXnHfVqm9iesp',
  operationDetails: [ /* ... */ ]
})
```

Key points:
- **No registration needed:** `DAppClient` and `WalletClient` register
  `TezosBlockchain` by default. `addBlockchain` remains public for other
  chains or overrides.
- **Over WalletConnect**, `requestPermissions({ networks })` drives the WC
  **session proposal**: your preferred network stays in
  `requiredNamespaces`, the extra networks go to `optionalNamespaces` — a
  single-network wallet (e.g. Kukai iOS today) simply ignores the optionals
  and keeps working with one network; a multi-network wallet approves
  accounts per chain. Networks must map to a known genesis id (see the
  table in §5) — unmapped ids are excluded from the WC proposal. The
  proposal is fixed at pairing time: widening the network set on a live WC
  session requires re-pairing.
- `requestPermissions({ networks })` is **additive** — omit `networks` and
  behaviour is exactly as before (one account).
- `requestOperation({ network })` takes a **CAIP‑2 string**
  (`tezos:<NetID>`). On a multi-network session it is **required** (omitting it
  throws `NetworksUnsupportedBeaconError` — "specify a network"); on a
  single-network/legacy session it is optional.
- New error types to handle: `NetworksUnsupportedBeaconError`,
  `VersionUnsupportedBeaconError`, `InvalidRequiredMinimumVersionError`,
  `InvalidBeaconVersionError` (all exported from `@tezos-x/octez.connect-core`
  and the umbrella SDK).

### 3.2 Wallet

To support multi-network, on a permission request read the optional
`message.networks` array and return an `accounts` map keyed by CAIP‑2 chain id;
otherwise respond exactly as before (the dApp handles the single-account case).

```ts
// Incoming PermissionRequest may carry:
//   networks?: { chainId: string; rpcUrl?: string; name?: string }[]
if (Array.isArray(message.networks) && message.networks.length > 0) {
  response.accounts = {}
  for (const n of message.networks) {
    response.accounts[n.chainId] = {
      publicKey,                // per-network key/address
      address,
      name: n.name              // optional label for your UI
    }
  }
}
await client.respond(response)
```

Also: **`OperationRequest.network` is now `Network | string`.** On the
multi-network path it arrives as a CAIP‑2 string; discriminate with `typeof`:

```ts
const net = typeof request.network === 'string'
  ? resolveNetworkFromCaip2(request.network) // your mapping
  : request.network
```

A wallet that ignores `message.networks` stays fully compatible — it simply
returns a single account and the dApp treats the session as single-network.

---

## 4. Everything else that changed in v5 (advantages & burdens)

### New capabilities (advantages)

| Area | Change | Benefit |
|------|--------|---------|
| Multi-network | `networks` request + `accounts` fanout + CAIP‑2 operation routing | One pairing spans several chains; fewer pairing round‑trips. |
| Version negotiation | `peer.version` handshake, `requiredMinimumVersion`, strict version parsing (`BEACON_VERSION` `3`→`4`) | dApps can require capabilities and reject incompatible wallets with a clear, typed error instead of failing mysteriously. |
| WalletConnect opt‑in | The WC transport now defaults **off** and is enabled only via `walletConnectOptions` (the `disableWalletConnect` flag already existed in 4.8.6, but WC used to default **on**) | No unwanted WC provider/crypto shims loaded when you don't use WC; predictable behaviour in restricted environments. |
| Structured errors & diagnostics | New `BEACON_ERROR_CODES` / error‑code modules, `gatherDiagnostics`, `buildErrorContext`, `ErrorContext`, `DiagnosticSnapshot` | Programmatic error discrimination and better bug reports. |
| Wallet list | Now downloaded from a **pinned** release and shipped as JSON (`@tezos-x/octez.connect-ui/data/*.json`, a new exported subpath); v4.8.6 generated it at build | Reproducible builds; you can import the list directly. |

> **Scope note:** several fixes on this line — the Matrix **offline relay‑node
> retention** and the **Firefox MV3 / Xray** pairing‑UI hardening
> (`hasWalletConnectSymKey`) — are **already present in v4.8.6**. They were lost
> in the interim 5.0.0 rewrite and restored, so relative to v4.8.6 they are
> parity, **not** new v5 capabilities, and require no migration action.

### Costs / things to watch (burdens)

- **WalletConnect becomes opt‑in** — the single most likely silent regression.
  Apps that relied on the implicit default `projectId` lose WC until they pass
  `walletConnectOptions`.
- **A few removed options/APIs** (`disclaimerText`, `requestTimeoutMs`,
  `disconnect`/`removeAllPeers` options, `subscribeToDisconnect`,
  `PeerUnreachableBeaconError`) require small code edits — see §2.
- **No built‑in request timeout** anymore — add your own if you need one.
- **WalletConnect 2.23.x** — re‑verify wallets sensitive to the WC relay
  version (notably Kukai iOS).
- **`addBlockchain(new TezosBlockchain())` is a new precondition** for the
  multi-network response path (throws if missing).
- **Wire note (advanced):** for peers negotiated at protocol v2+, the message
  serializer uses plain JSON rather than the bs58check envelope. This is
  transparent unless you inspect/validate raw transport bytes; pairing and
  postMessage still use the v1 (bs58) format by default.

---

## 5. Quick reference

**New `DAppClientOptions`:** `requiredMinimumVersion?: string` (decimal‑integer
string in `[3, BEACON_VERSION]`; default `'3'` = accept any wallet the SDK can
still talk to — the flat v2 wire was removed by the hard fork, so `'2'` is no
longer a legal value).

**NetworkType ↔ genesis chain id table** (used at the WalletConnect boundary;
RPC‑sourced and locked by unit test):

| NetworkType | Genesis (CAIP‑2 reference) |
|---|---|
| `mainnet` | `NetXdQprcVkpaWU` |
| `ghostnet` | `NetXnHfVqm9iesp` |
| `shadownet` | `NetXsqzbfFenSTS` |
| `ushuaianet` | `NetXpX8WSZkAZZA` |

`weeklynet`/`dailynet` (rotating genesis), `custom`, and networks without a
public RPC (`tallinnnet`, `seoulnet`, `tezlink-shadownet`,
`tezosx-previewnet`) are not statically mappable — multi-network requests for
them travel over P2P/postmessage only (chain ids pass through opaquely).
`disableWalletConnect?: boolean` **already existed in v4.8.6** — it is not new;
only its interaction with the WC opt‑in default changed (see §2.1).

**New request/response types** (`@tezos-x/octez.connect-types`):
`RequestPermissionNetwork` (`{ chainId; rpcUrl?; name? }`),
`PermissionResponseAccount` / `PermissionResponseAccounts`,
`RequestPermissionInput.networks?`, `RequestOperationInput.network?`,
`Network.chainId?`, `OperationRequest.network: Network | string`.

**Removed (breaking):** `DAppClientOptions.disclaimerText`,
`DAppClientOptions.requestTimeoutMs`, `DAppClientDisconnectOptions`,
`DAppClientRemoveAllPeersOptions`, `PeerUnreachableBeaconError`,
`WalletClient.subscribeToDisconnect` / `unsubscribeFromDisconnect`.

**Changed defaults/behaviour:** WalletConnect opt‑in; `BEACON_VERSION` `3` → `4`;
Tezos identifier `'xtz'` → `'tezos'` (with a `'xtz'` legacy registry alias);
no built‑in request timeout; WalletConnect `2.18.0` → `2.23.6`;
`requiredMinimumVersion` default `'2'` → `'3'`.

**Removed by the hard fork:** the flat v2 wire format (the flat message types
remain as the public API shapes; a v5 wallet answers legacy v2 requests with a
typed error tombstone); the `dapp-v2.html`/`wallet-v2.html` examples (use
`dapp.html`/`wallet.html`).

> Note: passing `network` to `requestPermissions()` already threw in v4.8.6
> (set `network` on the `DAppClient` constructor) — unchanged in v5, listed
> only to avoid confusion.

---

*Applies to `@tezos-x/octez.connect-*` `5.0.0-beta.x`. Package names and Node/npm
engine requirements are unchanged from v4.8.6.*
