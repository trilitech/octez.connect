# `@tezos-x/octez.connect-wallet`

Use this package in your wallet to instanciate a WalletClient object and communicate to dApps.

This is a primary package in the Trilitech-maintained octez.connect SDK line and may be installed directly.

## Install

```sh
npm install @tezos-x/octez.connect-wallet
```
## Signing payloads

A sign request carries a hex `payload` and a `signingType`. Treat the payload as untrusted input from the dApp and decide what to show the user from its content, not from the label alone.

- `operation`: the payload starts with `03`. Decode it and show the operations it contains (destination, amount, parameters), and treat the request like an operation request: same review, same confirmation.
- `micheline`: the payload starts with `05`. Decode and show the expression. Text is carried as a framed message (see below).
- `raw`: the payload must not start with `03` followed by two hex digits, whatever comes after (`03abcd `, `03abc` and `03abcdzz` are decoded by lenient hex decoders into bytes starting with `03`), because that would be an operation signed without the review an operation request gets. Refuse it, or show it as an operation. Payloads starting with `01`, `02`, `11`, `12` or `13` followed by two hex digits look like consensus watermarks and are unusual for `raw`.
- Unknown signing types must be rejected.
- Decode hex strictly: accept only an even number of `0-9a-fA-F` characters (after an optional `0x`) and reject anything else. Do not use a lenient decoder such as `Buffer.from(payload, 'hex')`, which stops at the first invalid character and silently returns the bytes before it.

For text, prefer a framed message: `05` + `01` + 4-byte big-endian byte length + UTF-8 bytes. A dApp can build it with `encodeTezosSignedMessage(text)` from `@tezos-x/octez.connect-utils`; a wallet can use the same function to recognise and display it. By convention the text starts with `Tezos Signed Message: `, followed by the dApp's domain, a timestamp and the message.

`signMessage` in `@tezos-x/octez.connect-utils` signs the bytes it is given with no watermark and no framing. It is meant for the transport keypair only. Never use it to sign with a user's account key or with a payload supplied by a dApp.

## Package provenance

This package is published from the Trilitech-maintained octez.connect repository:
[trilitech/octez.connect](https://github.com/trilitech/octez.connect)

- Original Beacon lineage: [airgap-it/beacon-sdk](https://github.com/airgap-it/beacon-sdk)
- External maintenance line Trilitech may selectively import from: [ecadlabs/beacon-sdk-taquito-patches](https://github.com/ecadlabs/beacon-sdk-taquito-patches)

## Notes

- Trilitech publishes these packages under the `@tezos-x/octez.connect-*` scope
- Release notes live on the [GitHub Releases page](https://github.com/trilitech/octez.connect/releases); package policy lives in [CONTRIBUTING.md](https://github.com/trilitech/octez.connect/blob/master/CONTRIBUTING.md) and [MAINTAINERS.md](https://github.com/trilitech/octez.connect/blob/master/MAINTAINERS.md)
