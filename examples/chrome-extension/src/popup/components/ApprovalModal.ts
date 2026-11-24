import { localForger } from '@tezos-x/octez.js-local-forging'
import type { UIRequest, UIPermissionRequest, UISignRequest, UIOperationRequest } from '../../beacon/types'

type ApproveHandler = (approval: any) => Promise<void>
type RejectHandler = () => Promise<void>

let modalElement: HTMLElement | null = null

// Everything a dApp sends (name, icon, payload, operation fields) is untrusted text.
// It must be escaped before it goes into innerHTML.
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Only http(s) and data:image URLs are shown; anything else (javascript:, file:, ...) is dropped.
export function safeIconUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
    return trimmed
  }
  return undefined
}

// Returns a promise that settles once the decoded view of an operation payload is ready (it
// resolves immediately for every other request). The Approve button of an operation payload
// stays disabled until the operation has been decoded.
export function renderApprovalModal(
  request: UIRequest,
  onApprove: ApproveHandler,
  onReject: RejectHandler
): Promise<void> {
  // Remove existing modal if any
  hideApprovalModal()

  // Hide the main app content
  const appElement = document.getElementById('app')
  if (appElement) {
    appElement.style.display = 'none'
  }

  modalElement = document.createElement('div')
  modalElement.id = 'approval-modal'
  modalElement.className = 'w-[360px] bg-gray-900 flex flex-col'

  const content = getModalContent(request)
  const mustDecode = request.type === 'sign' && request.signingType === 'operation'

  modalElement.innerHTML = `
    <!-- Header -->
    <div class="bg-gray-800 px-4 py-3 border-b border-gray-700">
      <div class="flex items-center gap-2">
        ${safeIconUrl(request.appIcon) ? `<img src="${escapeHtml(safeIconUrl(request.appIcon))}" class="w-6 h-6 rounded" alt="" />` : ''}
        <div>
          <h3 class="font-semibold">${getRequestTitle(request)}</h3>
          <p class="text-xs text-gray-400">${escapeHtml(request.appName)}</p>
        </div>
      </div>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      ${content}
    </div>

    <!-- Footer -->
    <div class="bg-gray-800 px-4 py-3 border-t border-gray-700 flex gap-3">
      <button
        id="btn-reject"
        class="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 rounded-md font-medium transition"
      >
        Reject
      </button>
      <button
        id="btn-approve"
        class="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
        ${mustDecode ? 'disabled' : ''}
      >
        Approve
      </button>
    </div>
  `

  // Event handlers
  modalElement.querySelector('#btn-approve')?.addEventListener('click', async () => {
    const btn = modalElement?.querySelector('#btn-approve') as HTMLButtonElement
    if (btn.disabled) return
    btn.disabled = true
    btn.textContent = 'Processing...'

    try {
      const approval = getApprovalData(request)
      await onApprove(approval)
    } catch (error) {
      btn.disabled = false
      btn.textContent = 'Approve'
    }
  })

  modalElement.querySelector('#btn-reject')?.addEventListener('click', () => {
    onReject()
  })

  document.body.appendChild(modalElement)

  if (request.type === 'sign' && request.signingType === 'operation') {
    return showDecodedOperation(modalElement, request.payload)
  }

  return Promise.resolve()
}

export function hideApprovalModal(): void {
  if (modalElement) {
    modalElement.remove()
    modalElement = null
  }

  // Restore the main app content
  const appElement = document.getElementById('app')
  if (appElement) {
    appElement.style.display = ''
  }
}

function getRequestTitle(request: UIRequest): string {
  switch (request.type) {
    case 'permission':
      return 'Connection Request'
    case 'sign':
      return 'Sign Payload'
    case 'operation':
      return 'Operation Request'
    default:
      return 'Request'
  }
}

function getModalContent(request: UIRequest): string {
  switch (request.type) {
    case 'permission':
      return getPermissionContent(request)
    case 'sign':
      return getSignContent(request)
    case 'operation':
      return getOperationContent(request)
    default:
      return '<p class="text-gray-400">Unknown request type</p>'
  }
}

function getPermissionContent(request: UIPermissionRequest): string {
  const scopes = request.scopes.map((s) => `<span class="px-2 py-1 bg-gray-700 rounded text-xs">${escapeHtml(s)}</span>`).join(' ')

  return `
    <div class="space-y-3">
      <div>
        <span class="text-xs text-gray-400">Requested Permissions</span>
        <div class="mt-1 flex flex-wrap gap-2">${scopes}</div>
      </div>
      ${
        request.network
          ? `
        <div>
          <span class="text-xs text-gray-400">Network</span>
          <div class="mt-1 px-3 py-2 bg-gray-700 rounded text-sm">
            ${escapeHtml(request.network.type)}
            ${request.network.rpcUrl ? `<span class="text-gray-400 text-xs ml-2">${escapeHtml(request.network.rpcUrl)}</span>` : ''}
          </div>
        </div>
      `
          : ''
      }
      <div class="bg-yellow-900/20 border border-yellow-700/50 rounded p-3">
        <p class="text-xs text-yellow-300">
          This will allow ${escapeHtml(request.appName)} to request operations from your wallet.
        </p>
      </div>
    </div>
  `
}

const RAW_WATERMARK_REGEX = /^(?:0x)?(01|02|11|12|13)[0-9a-fA-F]{2}/i

function getSignContent(request: UISignRequest): string {
  const truncatedPayload = request.payload.length > 200 ? request.payload.slice(0, 200) + '...' : request.payload
  const isOperation = request.signingType === 'operation'
  const watermark = request.signingType === 'raw' ? RAW_WATERMARK_REGEX.exec(request.payload) : null

  // Consensus operations and blocks carry these first bytes. A raw payload that starts like one
  // is not a message: signing it could sign a consensus operation or a block.
  const watermarkWarning = watermark
    ? `
      <div id="raw-watermark-warning" class="bg-red-900/30 border border-red-600 rounded p-3">
        <p class="text-xs text-red-300 font-semibold">
          This raw payload starts with the byte ${escapeHtml(watermark[1])}, which Tezos uses to
          mark consensus operations and blocks. Do not approve it unless you know exactly what it is.
        </p>
      </div>`
    : ''

  const operationWarning = isOperation
    ? `
      <div class="bg-red-900/30 border border-red-600 rounded p-3">
        <p class="text-xs text-red-300 font-semibold">
          This is a Tezos operation. Approving it is the same as sending the transaction:
          once signed, anyone can submit it to the network.
        </p>
      </div>
      <div>
        <span class="text-xs text-gray-400">Decoded operation</span>
        <div id="decoded-operation" class="mt-1 space-y-2">
          <div class="px-3 py-2 bg-gray-700 rounded text-xs text-gray-400">Decoding...</div>
        </div>
      </div>`
    : ''

  return `
    <div class="space-y-3">
      ${operationWarning}
      ${watermarkWarning}
      <div>
        <span class="text-xs text-gray-400">Signing Type</span>
        <div class="mt-1 px-3 py-2 bg-gray-700 rounded text-sm">${escapeHtml(request.signingType)}</div>
      </div>
      <div>
        <span class="text-xs text-gray-400">Payload</span>
        <div class="mt-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded font-mono text-xs break-all max-h-32 overflow-y-auto">
          ${escapeHtml(truncatedPayload)}
        </div>
      </div>
      <div class="bg-yellow-900/20 border border-yellow-700/50 rounded p-3">
        <p class="text-xs text-yellow-300">
          Verify the payload before signing. Malicious payloads could be dangerous.
        </p>
      </div>
    </div>
  `
}

interface DecodedContent {
  kind?: unknown
  source?: unknown
  destination?: unknown
  amount?: unknown
  fee?: unknown
  gas_limit?: unknown
  storage_limit?: unknown
  delegate?: unknown
  parameters?: { entrypoint?: unknown } | null
}

function formatMutez(amount: unknown): string {
  const text = String(amount ?? '')
  if (!/^\d+$/.test(text)) return `${text} (mutez)`

  return `${Number(text) / 1_000_000} XTZ (${text} mutez)`
}

const KNOWN_KINDS = ['transaction', 'delegation', 'reveal', 'origination']

function renderDecodedContent(content: DecodedContent): string {
  let details = `<div class="font-medium capitalize">${escapeHtml(content.kind)}</div>`
  const line = (label: string, value: string) =>
    `<div class="text-xs text-gray-400 break-all">${label}: ${escapeHtml(value)}</div>`

  // Fields of a kind that is not known are not summarised: the full JSON below shows all of them.
  if (typeof content.kind === 'string' && KNOWN_KINDS.includes(content.kind)) {
    if (content.source !== undefined) details += line('Source', String(content.source))
    if (content.destination !== undefined) details += line('Destination', String(content.destination))
    if (content.amount !== undefined) details += line('Amount', formatMutez(content.amount))
    if (content.fee !== undefined) details += line('Fee', formatMutez(content.fee))
    if (content.gas_limit !== undefined) details += line('Gas limit', String(content.gas_limit))
    if (content.storage_limit !== undefined) {
      details += line('Storage limit', String(content.storage_limit))
    }
    if (content.delegate !== undefined) details += line('Delegate', String(content.delegate))
    if (content.parameters && content.parameters.entrypoint !== undefined) {
      details += line('Entrypoint', String(content.parameters.entrypoint))
    }
  } else {
    details += `<div class="text-xs text-yellow-300">Unknown operation kind. All fields are shown below.</div>`
  }

  // The complete decoded operation, so that nothing the summary leaves out can stay hidden.
  details += `<pre class="mt-2 p-2 bg-gray-900 border border-gray-700 rounded font-mono text-xs whitespace-pre-wrap break-all max-h-40 overflow-y-auto">${escapeHtml(JSON.stringify(content, null, 2))}</pre>`

  return `<div class="px-3 py-2 bg-gray-700 rounded">${details}</div>`
}

// Decodes the bytes the user is about to sign with the octez.js local forger, so that the
// prompt shows the operation and not only the hex. The Approve button is enabled only when the
// operation was decoded; while decoding, and when it fails, it stays disabled.
async function showDecodedOperation(root: HTMLElement, payload: string): Promise<void> {
  const target = root.querySelector('#decoded-operation')
  const approve = root.querySelector('#btn-approve') as HTMLButtonElement | null
  if (!target) return

  try {
    const hex = payload.replace(/^0x/i, '')
    // Drop the "03" watermark: the forger parses the bare forged operation.
    const parsed = await localForger.parse(hex.slice(2))
    const contents = (parsed.contents ?? []) as DecodedContent[]
    if (!contents.length) {
      target.innerHTML =
        '<div class="px-3 py-2 bg-gray-700 rounded text-xs text-red-300">The operation contains no contents. It cannot be approved.</div>'

      return
    }
    target.innerHTML = contents.map(renderDecodedContent).join('')
    if (approve) approve.disabled = false
  } catch {
    target.innerHTML =
      '<div class="px-3 py-2 bg-gray-700 rounded text-xs text-red-300">This operation could not be decoded, so it cannot be approved.</div>'
  }
}

function getOperationContent(request: UIOperationRequest): string {
  const opsHtml = request.operations
    .map((op, i) => {
      let details = `<div class="font-medium capitalize">${escapeHtml(op.kind)}</div>`

      if (op.destination) {
        const truncDest = escapeHtml(`${op.destination.slice(0, 8)}...${op.destination.slice(-6)}`)
        details += `<div class="text-xs text-gray-400">To: ${truncDest}</div>`
      }

      if (op.amount) {
        const tez = parseInt(op.amount) / 1_000_000
        details += `<div class="text-xs text-gray-400">Amount: ${escapeHtml(tez)} XTZ</div>`
      }

      if (op.delegate) {
        const truncDelegate = escapeHtml(`${op.delegate.slice(0, 8)}...${op.delegate.slice(-6)}`)
        details += `<div class="text-xs text-gray-400">Delegate: ${truncDelegate}</div>`
      }

      return `<div class="px-3 py-2 bg-gray-700 rounded">${details}</div>`
    })
    .join('')

  return `
    <div class="space-y-3">
      <div>
        <span class="text-xs text-gray-400">Network</span>
        <div class="mt-1 px-3 py-2 bg-gray-700 rounded text-sm">
          ${escapeHtml(request.network.type)}
        </div>
      </div>
      <div>
        <span class="text-xs text-gray-400">Operations (${request.operations.length})</span>
        <div class="mt-1 space-y-2">${opsHtml}</div>
      </div>
      <div class="bg-yellow-900/20 border border-yellow-700/50 rounded p-3">
        <p class="text-xs text-yellow-300">
          This will broadcast operations to the Tezos network. Verify all details carefully.
        </p>
      </div>
    </div>
  `
}

function getApprovalData(request: UIRequest): any {
  switch (request.type) {
    case 'permission':
      return {
        scopes: request.scopes,
        network: request.network
      }
    case 'sign':
      return {}
    case 'operation':
      return {}
    default:
      return {}
  }
}
