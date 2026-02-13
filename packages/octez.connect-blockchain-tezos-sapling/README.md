# `@tezos-x/octez.connect-blockchain-tezos-sapling`

This package is part of the `@tezos-x/octez.connect-sdk` project. [Read more](https://github.com/trilitech/octez.connect)

## Introduction

This package adds support for `tezos-sapling`, the sapling integration on the Tezos blockchain. It can be used in combination with the `@tezos-x/octez.connect-dapp` or `@tezos-x/octez.connect-wallet` packages.

## Usage

```
import { DAppClient } from '@tezos-x/octez.connect-dapp'
import { TezosSaplingBlockchain } from '@tezos-x/octez.connect-blockchain-tezos-sapling'

const client = new DAppClient({
    name: 'Example DApp',
})

const tezosSaplingBlockchain = new TezosSaplingBlockchain()
client.addBlockchain(tezosSaplingBlockchain)
```

Check our documentation for more information. [Documentation](https://octez-connect.tezos.com)
