# `@tezos-x/octez.connect-blockchain-tezos`

This package is part of the `@tezos-x/octez.connect-sdk` project. [Read more](https://github.com/trilitech/octez.connect)

## Introduction

This package adds support for the `tezos` blockchain. It can be used in combination with the `@tezos-x/octez.connect-dapp` or `@tezos-x/octez.connect-wallet` packages.

## Usage

```
import { DAppClient } from '@tezos-x/octez.connect-dapp'
import { TezosBlockchain } from '@tezos-x/octez.connect-blockchain-tezos'

const client = new DAppClient({
    name: 'Example DApp',
})

const tezosBlockchain = new TezosBlockchain()
client.addBlockchain(tezosBlockchain)
```
