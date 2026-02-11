# `@tezos-x/octez.connect-blockchain-substrate`

This package is part of the `@tezos-x/octez.connect-sdk` project. [Read more](https://github.com/trilitech/octez.connect)

## Introduction

This package adds support for `substrate` based blockchains. It can be used in combination with the `@tezos-x/octez.connect-dapp` or `@tezos-x/octez.connect-wallet` packages.

## Usage

```
import { DAppClient } from '@tezos-x/octez.connect-dapp'
import { SubstrateBlockchain } from '@tezos-x/octez.connect-blockchain-substrate'

const client = new DAppClient({
    name: 'Example DApp',
})

const substrateBlockchain = new SubstrateBlockchain()
client.addBlockchain(substrateBlockchain)
```
