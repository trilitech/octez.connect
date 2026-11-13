const TTL_MS = 30 * 60 * 1000
const MAX_PENDING = 32

/** This tab's sessionStorage, or undefined (not a browser, blocked, private mode...). */
const tabStorage = (): Storage | undefined => {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch {
    return undefined
  }
}

/**
 * Pairing request ids this dApp has handed out (QR code, deep link, extension).
 * A pairing reply is only accepted if it answers one of them, once.
 *
 * Kept in this tab's sessionStorage so a reply still counts if the browser
 * reloads the tab while the user is in their wallet app (common on mobile).
 * Per tab on purpose: another tab never accepts this tab's pairing. Falls back
 * to memory only when sessionStorage is not available.
 *
 * @internalapi
 */
export class PendingPairingRequests {
  private readonly requests = new Map<string, number>() // id -> expiry

  /** @param storageKey sessionStorage key; use a different one per transport. */
  constructor(private readonly storageKey: string) {
    try {
      const saved = JSON.parse(tabStorage()?.getItem(storageKey) ?? '[]')
      for (const entry of Array.isArray(saved) ? saved : []) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number') {
          this.requests.set(entry[0], entry[1])
        }
      }
    } catch {
      /* corrupt or unreadable: start empty */
    }
  }

  public add(id: string): void {
    this.prune()
    this.requests.set(id, Date.now() + TTL_MS)
    // Map keeps insertion order, so the first key is the oldest.
    while (this.requests.size > MAX_PENDING) {
      this.requests.delete(this.requests.keys().next().value as string)
    }
    this.save()
  }

  public hasPending(): boolean {
    this.prune()

    return this.requests.size > 0
  }

  /** True if `id` was pending. Clears every pending request, so only one reply wins. */
  public consume(id: string): boolean {
    this.prune()
    if (!this.requests.has(id)) {
      return false
    }
    this.clear()

    return true
  }

  /** Forget every pending request, e.g. when the pairing popup closes. */
  public clear(): void {
    this.requests.clear()
    this.save()
  }

  private prune(): void {
    const now = Date.now()
    let changed = false
    for (const [id, expiry] of this.requests) {
      if (expiry <= now) {
        this.requests.delete(id)
        changed = true
      }
    }
    if (changed) {
      this.save()
    }
  }

  private save(): void {
    try {
      const storage = tabStorage()
      if (this.requests.size === 0) {
        storage?.removeItem(this.storageKey)
      } else {
        storage?.setItem(this.storageKey, JSON.stringify([...this.requests]))
      }
    } catch {
      /* quota or blocked: memory still works for this page */
    }
  }
}
