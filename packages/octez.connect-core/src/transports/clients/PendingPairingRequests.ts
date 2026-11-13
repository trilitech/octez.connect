const TTL_MS = 30 * 60 * 1000
const MAX_PENDING = 32

/**
 * Pairing request ids this dApp has handed out (QR code, deep link, extension).
 * A pairing reply is only accepted if it answers one of them, once.
 *
 * In memory on purpose (same as the ECAD 4.8.5 fix): storage cannot make
 * "use once" hold across tabs, so a reload while a pairing is still open
 * needs a fresh QR code or deep link. Already-paired sessions are unaffected.
 *
 * @internalapi
 */
export class PendingPairingRequests {
  private readonly requests = new Map<string, number>() // id -> expiry

  public add(id: string): void {
    this.prune()
    this.requests.set(id, Date.now() + TTL_MS)
    // Map keeps insertion order, so the first key is the oldest.
    while (this.requests.size > MAX_PENDING) {
      this.requests.delete(this.requests.keys().next().value as string)
    }
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
  }

  private prune(): void {
    const now = Date.now()
    for (const [id, expiry] of this.requests) {
      if (expiry <= now) {
        this.requests.delete(id)
      }
    }
  }
}
