import { Storage, StorageKey, StorageKeyReturnType, defaultValues } from '@tezos-x/octez.connect-types'

/**
 * @internalapi
 *
 * A storage that can be used in chrome extensions
 */
export class ChromeStorage implements Storage {
  public static async isSupported(): Promise<boolean> {
    return (
      typeof window !== 'undefined' &&
      typeof chrome !== 'undefined' &&
      Boolean(chrome) &&
      Boolean(chrome.runtime) &&
      Boolean(chrome.runtime.id)
    )
  }

  public async get<K extends StorageKey>(key: K): Promise<StorageKeyReturnType[K]> {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (storageContent) => {
        if (storageContent[key]) {
          resolve(storageContent[key] as unknown as StorageKeyReturnType[K])
        } else {
          const defaultValue = defaultValues[key]

          if (typeof defaultValue === 'object') {
            resolve(JSON.parse(JSON.stringify(defaultValue)) as StorageKeyReturnType[K])
          } else {
            resolve(defaultValue)
          }
        }
      })
    })
  }

  public async set<K extends StorageKey>(key: K, value: StorageKeyReturnType[K]): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve()
      })
    })
  }

  public async delete<K extends StorageKey>(key: K): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: undefined }, () => {
        resolve()
      })
    })
  }

  public async subscribeToStorageChanged(
    _callback: (arg: {
      eventType: 'storageCleared' | 'entryModified'
      key: string | null
      oldValue: string | null
      newValue: string | null
    }) => {}
  ): Promise<void> {
    // TODO
  }

  public getPrefixedKey(key: string): string {
    return key
  }
}
