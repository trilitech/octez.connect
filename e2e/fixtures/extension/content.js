/* eslint-disable */
// Runs inside the extension content-script world — the isolated compartment that,
// in Firefox, sits behind the Xray membrane. It stands in for a dApp embedded in a
// browser-extension content script: it builds a DAppClient with WalletConnect
// disabled and drives pairing on demand. Results are written onto the shared page
// DOM (a marker element) so the test driver, running in the page world, can read them.
;(function () {
  var WC_ERROR_PATTERNS = [
    'this.provider.request is not a function',
    'a.entries() is not iterable',
    'provider.request',
    'connection timed out',
    'iterator value undefined is not an entry object'
  ]

  var wcErrors = []
  var record = function (message) {
    if (!message) {
      return
    }
    var text = String(message).toLowerCase()
    if (WC_ERROR_PATTERNS.some(function (pattern) { return text.indexOf(pattern.toLowerCase()) !== -1 })) {
      wcErrors.push(String(message))
    }
  }

  window.addEventListener('error', function (event) { record(event.message) })
  window.addEventListener('unhandledrejection', function (event) {
    record(event.reason && (event.reason.message || event.reason))
  })

  // Marker lives on the shared page DOM so Playwright (page world) can assert on it.
  var marker = document.createElement('div')
  marker.id = 'ext-harness'
  marker.setAttribute('data-ready', 'false')
  marker.setAttribute('data-wc-errors', '0')
  document.body.appendChild(marker)

  var client
  try {
    client = beacon.getDAppClientInstance({
      name: 'Extension Harness DApp',
      network: { type: beacon.NetworkType.MAINNET },
      disableWalletConnect: true
    })
    marker.setAttribute('data-ready', 'true')
  } catch (error) {
    record(error && (error.message || error))
    marker.setAttribute('data-init-error', String(error))
  }

  var button = document.createElement('button')
  button.id = 'ext-connect'
  button.textContent = 'connect'
  button.addEventListener('click', function () {
    if (!client) {
      return
    }
    client.requestPermissions().catch(function (error) {
      record(error && (error.message || error))
    })
  })
  document.body.appendChild(button)

  setInterval(function () {
    marker.setAttribute('data-wc-errors', String(wcErrors.length))
  }, 200)
})()
