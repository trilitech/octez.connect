/* eslint import/no-extraneous-dependencies: ["error", { "devDependencies": true }] */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import webpack from 'webpack'
import { test, expect } from '@playwright/test'

interface Harness {
  create(name: string): Promise<void>
  connect(name: string): Promise<void>
  disconnect(name: string): Promise<void>
  count(): number
  messages(name: string): { message: string; context: { origin: string; id: string } }[]
  send(name: string, plaintext: string): Promise<void>
}
declare global {
  interface Window {
    lifecycleFixture: { createHarness(): Promise<Harness> }
    lifecycle: Harness
  }
}

let bundleDirectory: string
test.beforeAll(async () => {
  bundleDirectory = await mkdtemp(path.join(tmpdir(), 'octez-postmessage-'))
  const alias: Record<string, string> = {}
  for (const directory of await readdir(path.resolve('packages'))) {
    const root = path.resolve('packages', directory)
    const manifest: unknown = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
    if (
      typeof manifest === 'object' &&
      manifest !== null &&
      'name' in manifest &&
      'module' in manifest &&
      typeof manifest.name === 'string' &&
      typeof manifest.module === 'string'
    ) {
      alias[manifest.name] = path.join(root, manifest.module)
    }
  }
  // The SDK's CJS bundle targets ES6 and erases uninitialized fields. Resolve
  // built ESM explicitly so this test covers native class-field initialization.
  await new Promise<void>((resolve, reject) => {
    const compiler = webpack({
      mode: 'development',
      target: 'web',
      devtool: false,
      entry: path.resolve('e2e/fixtures/postmessage-lifecycle.js'),
      output: {
        path: bundleDirectory,
        filename: 'fixture.js',
        library: 'lifecycleFixture',
        libraryTarget: 'var'
      },
      resolve: {
        alias,
        fallback: { crypto: false, fs: false, stream: require.resolve('stream-browserify') }
      },
      plugins: [new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] })]
    })
    compiler.run((error, stats) =>
      compiler.close((closeError) => {
        if (error || closeError) {
          reject(error || closeError)
        } else if (stats?.hasErrors()) {
          reject(new Error(stats.toString({ all: false, errors: true })))
        } else {
          resolve()
        }
      })
    )
  })
})
test.afterAll(async () => {
  if (bundleDirectory) {
    await rm(bundleDirectory, { recursive: true, force: true })
  }
})
test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:1234')
  await page.addScriptTag({ path: path.join(bundleDirectory, 'fixture.js') })
  await page.evaluate(async () => {
    window.lifecycle = await window.lifecycleFixture.createHarness()
  })
})

test('constructor-time encrypted delivery remains available before connect', async ({ page }) => {
  const messages = await page.evaluate(async () => {
    await window.lifecycle.create('a')
    await window.lifecycle.send('a', 'before connect')

    return window.lifecycle.messages('a')
  })
  expect(messages).toEqual([
    { message: 'before connect', context: { origin: 'extension', id: 'fixture-extension' } }
  ])
})

test('disconnect before connect removes the constructor-owned handler', async ({ page }) => {
  const counts = await page.evaluate(async () => {
    await window.lifecycle.create('a')
    const created = window.lifecycle.count()
    await window.lifecycle.disconnect('a')
    await window.lifecycle.disconnect('a')

    return [created, window.lifecycle.count()]
  })
  expect(counts).toEqual([1, 0])
})

test('connect and reconnect deliver once and release their handlers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.lifecycle
    await h.create('a')
    await h.connect('a')
    await h.connect('a')
    await h.send('a', 'connected')
    const connected = h.count()
    await h.disconnect('a')
    const disconnected = h.count()
    await h.send('a', 'after disconnect')
    await h.connect('a')
    await h.send('a', 'reconnected')
    const reconnected = h.count()
    await h.disconnect('a')

    return {
      counts: [connected, disconnected, reconnected, h.count()],
      messages: h.messages('a').map((item) => item.message)
    }
  })
  expect(result.messages).toEqual(['connected', 'reconnected'])
  expect(result.counts).toEqual([1, 0, 1, 0])
})

test('disconnecting one instance preserves another instance and key isolation', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const h = window.lifecycle
    await h.create('a')
    await h.create('b')
    await h.send('a', 'only a')
    await h.disconnect('a')
    await h.send('a', 'disconnected a')
    await h.send('b', 'only b')

    return {
      a: h.messages('a').map((item) => item.message),
      b: h.messages('b').map((item) => item.message)
    }
  })
  expect(result).toEqual({ a: ['only a'], b: ['only b'] })
})
