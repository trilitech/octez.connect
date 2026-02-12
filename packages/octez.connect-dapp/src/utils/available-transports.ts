import { PostMessageTransport } from '@tezos-x/octez.connect-transport-postmessage'

/**
 * An object with promises to indicate whether or not that transport is available.
 */
export const availableTransports: any = {
  extension: PostMessageTransport.isAvailable(), // TODO: Remove this?
  availableExtensions: PostMessageTransport.getAvailableExtensions()
}
