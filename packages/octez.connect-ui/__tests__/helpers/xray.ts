/**
 * Test helpers that emulate Firefox content-script "Xray wrapper" effects.
 *
 * In a Firefox extension content script, objects created in the page
 * compartment are read through a security membrane when accessed from the
 * content-script compartment. Crossing that membrane can strip an object's
 * methods (they read as `undefined`), break its iterator, and unwrap a
 * promise so it resolves to `undefined` instead of its real value.
 *
 * These Proxies reproduce those effects so the pairing code can be exercised
 * against membrane-mangled values deterministically, with no real browser.
 */

/** A view of `obj` whose `method` reads as `undefined`, as if stripped by the membrane. */
export const stripMethod = <T extends object>(obj: T, method: PropertyKey): T =>
  new Proxy(obj, {
    get: (target, prop, receiver) =>
      prop === method ? undefined : Reflect.get(target, prop, receiver)
  })

/** A view of `obj` whose iteration is broken (`entries`/`Symbol.iterator` stripped). */
export const breakIteration = <T extends object>(obj: T): T =>
  new Proxy(obj, {
    get: (target, prop, receiver) =>
      prop === 'entries' || prop === Symbol.iterator
        ? undefined
        : Reflect.get(target, prop, receiver)
  })

/**
 * A thenable whose resolved value was lost crossing the membrane: it resolves
 * to `undefined` rather than the original string. Mirrors a peer-info promise
 * emitted in one compartment and awaited in another.
 */
export const mangledPeerInfo = (): PromiseLike<string> => ({
  then<R = string>(
    onfulfilled?: ((value: string) => R | PromiseLike<R>) | null
  ): PromiseLike<R> {
    return Promise.resolve(undefined as unknown as string).then(onfulfilled as any)
  }
})
