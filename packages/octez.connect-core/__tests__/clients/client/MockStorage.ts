import { Storage, StorageKey, StorageKeyReturnType } from '@tezos-x/octez.connect-types'

/**
 * A simple in-memory implementation of the octez.connect Storage abstract class
 */
export class MockStorage extends Storage {
  private readonly store: Partial<Record<StorageKey, unknown>> = {}

  public static override isSupported(): Promise<boolean> {
    return Promise.resolve(true)
  }

  public override async get<K extends StorageKey>(key: K): Promise<StorageKeyReturnType[K]> {
    return this.store[key] as StorageKeyReturnType[K]
  }

  public override async set<K extends StorageKey>(
    key: K,
    value: StorageKeyReturnType[K]
  ): Promise<void> {
    this.store[key] = value
  }

  public override async delete<K extends StorageKey>(key: K): Promise<void> {
    delete this.store[key]
  }

  public override async subscribeToStorageChanged(): Promise<void> {
    return
  }

  public override getPrefixedKey<K extends StorageKey>(key: K): string {
    return key
  }
}
