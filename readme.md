# octez.connect SDK

[![npm](https://img.shields.io/npm/v/@tezos-x/octez.connect-sdk.svg?colorB=brightgreen)](https://www.npmjs.com/package/@tezos-x/octez.connect-sdk)
[![documentation](https://img.shields.io/badge/documentation-online-brightgreen.svg)](https://airgap-it.github.io/octez.connect-sdk/)
[![GitHub Action](https://github.com/trilitech/octez.connect-sdk/workflows/Build%2C%20Test%20and%20Analyze/badge.svg)](https://github.com/trilitech/octez.connect-sdk/actions?query=workflow%3A%22Build%2C+Test+and+Analyze%22+branch%3Amain)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)


## Intro

The `octez.connect-sdk` simplifies and abstracts the communication between dApps and wallets over different transport layers.

Developers that plan to develop complex smart contract interactions can use [Taquito](https://github.com/ecadlabs/taquito) with the `BeaconWallet`, which uses this SDK under the hood, but provides helpful methods to interact with contracts.

## Installation

```
npm i --save @tezos-x/octez.connect-sdk
```

## Example DApp integration

```ts
import { DAppClient } from '@tezos-x/octez.connect-sdk'

const dAppClient = new DAppClient({ name: 'My Sample DApp' })

// Listen for all the active account changes
dAppClient.subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, async (account) => {
  // An active account has been set, update the dApp UI
  console.log(`${BeaconEvent.ACTIVE_ACCOUNT_SET} triggered: `, account)
})

try {
  console.log('Requesting permissions...')
  const permissions = await dAppClient.requestPermissions()
  console.log('Got permissions:', permissions.address)
} catch (error) {
  console.error('Got error:', error)
}
```

For a more complete example, take a look at the `example-dapp.html` file.

## Example Wallet integration

```ts
const client = new WalletClient({ name: 'My Wallet' })
await client.init() // Establish P2P connection

client
  .connect(async (message) => {
    // Example: Handle PermissionRequest. A wallet should handle all request types
    if (message.type === BeaconMessageType.PermissionRequest) {
      // Show a UI to the user where he can confirm sharing an account with the DApp

      const response: PermissionResponseInput = {
        type: BeaconMessageType.PermissionResponse,
        network: message.network, // Use the same network that the user requested
        scopes: [PermissionScope.OPERATION_REQUEST], // Ignore the scopes that have been requested and instead give only operation permissions
        id: message.id,
        publicKey: 'tezos public key'
      }

      // Send response back to DApp
      await client.respond(response)
    }
  })
  .catch((error) => console.error('connect error', error))
```

For a more complete example, take a look at the `example-wallet.html` file.

## Adding a wallet to octez.connect-sdk

Please create a PR and add your wallet [here](https://github.com/trilitech/octez.connect-sdk/blob/master/scripts/generate-wallet-list.ts).

For iOS wallets, the wallet needs to define a custom url scheme to support the same-device functionality.

## Development

```
$ npm i
$ npm run build
$ npm run test
```

Once the SDK is built, you can open the `dapp.html` or `wallet.html` file in your browser and try out the basic functionality. To support browser extensions as well, the file should be viewed over a webserver. You can navigate to the example folder and easily start one with `python -m SimpleHTTPServer 8000` (or `python3 -m http.server 8000` with Python 3.x) and then open the examples with `http://localhost:8000/`.
