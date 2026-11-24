/**
 * @jest-environment jsdom
 */

// Tests for the reference wallet in examples/chrome-extension. The example has no test setup of
// its own, so they run here, with the wallet package's jest (jsdom), through relative requires.
// `@tezos-x/octez.js-local-forging` is a devDependency of this package for the same reason.

import { LocalForger } from '@tezos-x/octez.js-local-forging'
import { BeaconErrorType, BeaconMessageType } from '@tezos-x/octez.connect-types'

/* eslint-disable @typescript-eslint/no-var-requires */
const modal = require('../../../../examples/chrome-extension/src/popup/components/ApprovalModal')
const formatter = require('../../../../examples/chrome-extension/src/beacon/BeaconMessageFormatter')
/* eslint-enable @typescript-eslint/no-var-requires */

const { escapeHtml, safeIconUrl, renderApprovalModal, hideApprovalModal } = modal

const SOURCE = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb'
const DESTINATION = 'KT1BEqzn5Wx8uJrZNvuS9DVHmLvG9td3fDLi'
const BRANCH = 'BLockGenesisGenesisGenesisGenesisGenesisCCCCCeZiLHU'

const forgeOperation = async (contents: unknown[]): Promise<string> =>
  `03${await new LocalForger().forge({ branch: BRANCH, contents: contents as any })}`

const signRequest = (payload: string, signingType = 'operation', extra: object = {}) => ({
  id: 'r1',
  type: 'sign' as const,
  appName: 'App',
  payload,
  signingType,
  ...extra
})

const approveButton = (): HTMLButtonElement =>
  document.querySelector('#btn-approve') as HTMLButtonElement

describe('example wallet: escapeHtml and safeIconUrl', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    )
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(42)).toBe('42')
  })

  it.each([
    ['https://example.com/i.png', 'https://example.com/i.png'],
    ['http://example.com/i.png', 'http://example.com/i.png'],
    ['  https://example.com/i.png ', 'https://example.com/i.png'],
    ['data:image/png;base64,AAAA', 'data:image/png;base64,AAAA'],
    ['javascript:alert(1)', undefined],
    ['JaVaScRiPt:alert(1)', undefined],
    ['data:text/html,<script>alert(1)</script>', undefined],
    ['file:///etc/passwd', undefined],
    ['//example.com/i.png', undefined],
    [42, undefined],
    [undefined, undefined]
  ])('safeIconUrl(%j) -> %j', (input, expected) => {
    expect(safeIconUrl(input)).toBe(expected)
  })
})

describe('example wallet: renderApprovalModal with hostile input', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
  })
  afterEach(() => hideApprovalModal())

  it('does not turn a hostile app name, payload or icon into markup', async () => {
    const hostile = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>'
    await renderApprovalModal(
      signRequest(hostile, 'raw', {
        appName: hostile,
        appIcon: 'https://example.com/i.png" onerror="window.__pwned=3'
      }),
      jest.fn(),
      jest.fn()
    )

    const root = document.querySelector('#approval-modal') as HTMLElement
    expect(root.querySelector('script')).toBeNull()
    // The only image is the app icon; it has no event handler attribute.
    const images = Array.from(root.querySelectorAll('img'))
    expect(images).toHaveLength(1)
    expect(images[0].getAttributeNames()).not.toContain('onerror')
    expect(root.querySelectorAll('[onerror]')).toHaveLength(0)
    // The hostile text is shown as text.
    expect(root.textContent).toContain('<img src=x onerror=')
    expect((window as any).__pwned).toBeUndefined()
  })

  it('drops a javascript: icon', async () => {
    await renderApprovalModal(
      signRequest('hello', 'raw', { appIcon: 'javascript:alert(1)' }),
      jest.fn(),
      jest.fn()
    )
    expect(document.querySelector('#approval-modal img')).toBeNull()
  })

  it('escapes the permission scopes and the network', async () => {
    await renderApprovalModal(
      {
        id: 'p1',
        type: 'permission',
        appName: '<b>n</b>',
        scopes: ['<i>scope</i>'],
        network: { type: '<u>net</u>', rpcUrl: '<s>rpc</s>' }
      } as any,
      jest.fn(),
      jest.fn()
    )
    const root = document.querySelector('#approval-modal') as HTMLElement
    expect(root.querySelectorAll('b, i, u, s')).toHaveLength(0)
  })
})

describe('example wallet: decoded view of an operation payload', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
  })
  afterEach(() => hideApprovalModal())

  it('shows the fee, the limits, the entrypoint and the full JSON of a contract call', async () => {
    const payload = await forgeOperation([
      {
        kind: 'transaction',
        source: SOURCE,
        fee: '5000000000',
        counter: '7',
        gas_limit: '123456',
        storage_limit: '4321',
        amount: '0',
        destination: DESTINATION,
        parameters: { entrypoint: 'drain_everything', value: { prim: 'Unit' } }
      }
    ])

    const decoding = renderApprovalModal(signRequest(payload), jest.fn(), jest.fn())
    // While decoding, Approve is disabled.
    expect(approveButton().disabled).toBe(true)
    await decoding

    const view = (document.querySelector('#decoded-operation') as HTMLElement).textContent as string
    expect(view).toContain('5000 XTZ (5000000000 mutez)')
    expect(view).toContain('Gas limit: 123456')
    expect(view).toContain('Storage limit: 4321')
    expect(view).toContain('Entrypoint: drain_everything')
    expect(view).toContain(`Destination: ${DESTINATION}`)

    const pre = document.querySelector('#decoded-operation pre') as HTMLElement
    const full = JSON.parse(pre.textContent as string)
    expect(full).toMatchObject({
      kind: 'transaction',
      fee: '5000000000',
      parameters: { entrypoint: 'drain_everything', value: { prim: 'Unit' } }
    })
    expect(approveButton().disabled).toBe(false)
  })

  it('shows every field of an operation kind it does not summarise', async () => {
    const payload = await forgeOperation([
      {
        kind: 'set_deposits_limit',
        source: SOURCE,
        fee: '1',
        counter: '1',
        gas_limit: '1',
        storage_limit: '0',
        limit: '777'
      }
    ])
    await renderApprovalModal(signRequest(payload), jest.fn(), jest.fn())

    const view = (document.querySelector('#decoded-operation') as HTMLElement).textContent as string
    expect(view).toContain('Unknown operation kind')
    expect(view).toContain('"limit": "777"')
    expect(approveButton().disabled).toBe(false)
  })

  it.each([
    ['not hex', '03zz'],
    ['truncated operation', '03aabbcc'],
    ['no contents', '03' + 'a'.repeat(64)]
  ])('keeps Approve disabled when decoding fails (%s)', async (_label, payload) => {
    const onApprove = jest.fn()
    await renderApprovalModal(signRequest(payload), onApprove, jest.fn())

    expect(approveButton().disabled).toBe(true)
    approveButton().click()
    expect(onApprove).not.toHaveBeenCalled()
    expect((document.querySelector('#decoded-operation') as HTMLElement).textContent).toContain(
      'cannot be approved'
    )
  })

  it('does not disable Approve for a raw payload', async () => {
    await renderApprovalModal(signRequest('hello', 'raw'), jest.fn(), jest.fn())
    expect(approveButton().disabled).toBe(false)
    expect(document.querySelector('#raw-watermark-warning')).toBeNull()
  })

  it.each(['01', '02', '11', '12', '13'])(
    'warns for a raw payload starting with %s',
    async (byte) => {
      await renderApprovalModal(signRequest(`${byte}00ff`, 'raw'), jest.fn(), jest.fn())
      const warning = document.querySelector('#raw-watermark-warning') as HTMLElement
      expect(warning).not.toBeNull()
      expect(warning.textContent).toContain(byte)
      expect(approveButton().disabled).toBe(false)
    }
  )
})

describe('example wallet: toUIFormat refuses an inconsistent sign request', () => {
  const base = { id: 'r1', version: '2', senderId: 's', type: BeaconMessageType.SignPayloadRequest }

  it('refuses a missing signing type', () => {
    let error: any
    try {
      formatter.toUIFormat({ ...base, payload: '03ab' })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(formatter.RequestRefusedError)
    expect(error.errorType).toBe(BeaconErrorType.SIGNATURE_TYPE_NOT_SUPPORTED)
  })

  it('refuses an operation payload that is not an operation', () => {
    expect(() =>
      formatter.toUIFormat({ ...base, signingType: 'operation', payload: '05ab' })
    ).toThrow(formatter.RequestRefusedError)
  })

  it('refuses a raw payload that starts like an operation', () => {
    expect(() => formatter.toUIFormat({ ...base, signingType: 'raw', payload: '03abcd ' })).toThrow(
      formatter.RequestRefusedError
    )
  })

  it('includes the description in the error sent to the dApp', () => {
    expect(
      formatter.toBeaconError(
        { id: 'r1' },
        BeaconErrorType.PARAMETERS_INVALID_ERROR,
        '',
        undefined,
        'why'
      )
    ).toMatchObject({
      id: 'r1',
      errorType: BeaconErrorType.PARAMETERS_INVALID_ERROR,
      description: 'why'
    })
  })
})
