# `@tezos-x/octez.connect-blockchain-tezos-sapling`

This package is part of the `@tezos-x/octez.connect-sdk` project. [Read more](https://github.com/trilitech/octez.connect-sdk)

## Introduction

This package adds support for `tezos-sapling`, the sapling integration on the Tezos blockchain. It can be used in combination with the `@tezos-x/octez.connect-dapp` or `@tezos-x/octez.connect-wallet` packages.

## Usage

```
import { DAppClient } from '@airga/octez.connect-dapp'
import { TezosSaplingBlockchain } from '@airga/octez.connect-blockchain-tezos-sapling'

const client = new DAppClient({
    name: 'Example DApp',
})

const tezosSaplingBlockchain = new TezosSaplingBlockchain()
client.addBlockchain(tezosSaplingBlockchain)
```
