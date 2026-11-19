'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const m = require('../helpers/ci-metrics')

test('isHealthy accepts only 403 M_FORBIDDEN', () => {
  assert.equal(m.isHealthy(403, 'M_FORBIDDEN'), true)
  assert.equal(m.isHealthy(500, null), false)
  assert.equal(m.isHealthy(403, 'M_UNKNOWN'), false)
  assert.equal(m.isHealthy(200, 'M_FORBIDDEN'), false)
  assert.equal(m.isHealthy(0, 'TIMEOUT'), false)
})

test('summarizeRelayRows counts failures and latency percentiles per relay', () => {
  const rows = m.parseJsonl(
    [
      { relay: 'b', http_code: 403, errcode: 'M_FORBIDDEN', latency_ms: 100, ok: true },
      { relay: 'b', http_code: 500, errcode: null, latency_ms: 900, ok: false },
      { relay: 'b', http_code: 403, errcode: 'M_FORBIDDEN', latency_ms: 200, ok: true },
      { relay: 'a', http_code: 403, errcode: 'M_FORBIDDEN', latency_ms: 50, ok: true }
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n{"relay":"trunc'
  )
  assert.equal(rows.length, 4)
  const summary = m.summarizeRelayRows(rows)
  assert.deepEqual(summary.map((s) => s.relay), ['a', 'b'])
  assert.deepEqual(summary[1], { relay: 'b', probes: 3, failures: 1, failure_codes: { 500: 1 }, p50_ms: 200, max_ms: 900 })
  assert.match(m.relaySummaryMarkdown(summary), /\| b \| 3 \| 1 \| 500x1 \| 200 \| 900 \|/)
})

test('relaySummaryMarkdown handles no probes', () => {
  assert.match(m.relaySummaryMarkdown([]), /No probes recorded/)
})

const report = {
  suites: [
    {
      title: 'file.spec.ts',
      specs: [],
      suites: [
        {
          title: 'pairing',
          specs: [
            { title: 'fast', tests: [{ projectName: 'chromium', status: 'expected', results: [{ duration: 1000 }] }] },
            { title: 'flaky one', tests: [{ projectName: 'chromium', status: 'flaky', results: [{ duration: 5000 }, { duration: 3000 }] }] },
            { title: 'broken', tests: [{ projectName: 'chromium', status: 'unexpected', results: [{ duration: 2000 }] }] }
          ]
        }
      ]
    }
  ]
}

test('summarizePlaywright counts and ranks the slowest tests', () => {
  const s = m.summarizePlaywright(report, 2)
  assert.equal(s.tests, 3)
  assert.equal(s.failed, 1)
  assert.equal(s.flaky, 1)
  assert.equal(s.retried, 1)
  assert.equal(s.slowest.length, 2)
  assert.equal(s.slowest[0].title, 'file.spec.ts > pairing > flaky one')
  assert.equal(s.slowest[0].duration_ms, 8000)
})

test('buildE2eRecord maps exit code to status and elapsed seconds', () => {
  const rec = m.buildE2eRecord({
    suite: 'end-to-end',
    exitCode: 1,
    startedAt: 1_000_000,
    completedAt: 1_090_000,
    env: { GITHUB_RUN_ID: '7', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: 'abc' },
    playwright: m.summarizePlaywright(report)
  })
  assert.equal(rec.status, 'failed')
  assert.equal(rec.elapsed_seconds, 90)
  assert.equal(rec.run_id, '7')
  assert.match(m.e2eSummaryMarkdown(rec), /failed.*exit code 1/)
})
