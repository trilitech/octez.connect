'use strict'

// Pure helpers for the CI observability scripts (relay health poller and the
// e2e timing record). No I/O here so they can be unit tested.

const RELAY_COUNT = 8
const relayHosts = Array.from({ length: RELAY_COUNT }, (_, i) => `beacon-node-${i + 1}.octez.io`)

const probeBody = {
  type: 'm.login.password',
  identifier: { type: 'm.id.user', user: 'probe0000' },
  password: 'ed:x:y'
}

// A healthy Synapse answers an invalid login with 403 M_FORBIDDEN. Anything
// else (500, timeout, 200, other errcode) is a relay fault.
function isHealthy(httpCode, errcode) {
  return httpCode === 403 && errcode === 'M_FORBIDDEN'
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null
  const rank = Math.ceil((p / 100) * sortedValues.length)
  return sortedValues[Math.min(sortedValues.length, Math.max(1, rank)) - 1]
}

function parseJsonl(text) {
  const rows = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      // ignore a truncated last line (the poller may be killed mid-write)
    }
  }
  return rows
}

// rows: {ts, relay, http_code, errcode, latency_ms, ok}
function summarizeRelayRows(rows) {
  const byRelay = new Map()
  for (const row of rows) {
    if (!byRelay.has(row.relay)) byRelay.set(row.relay, [])
    byRelay.get(row.relay).push(row)
  }
  return [...byRelay.keys()].sort().map((relay) => {
    const probes = byRelay.get(relay)
    const failures = probes.filter((r) => !r.ok)
    const latencies = probes.map((r) => r.latency_ms).sort((a, b) => a - b)
    const codes = {}
    for (const f of failures) codes[f.http_code] = (codes[f.http_code] || 0) + 1
    return {
      relay,
      probes: probes.length,
      failures: failures.length,
      failure_codes: codes,
      p50_ms: percentile(latencies, 50),
      max_ms: latencies.length ? latencies[latencies.length - 1] : null
    }
  })
}

function relaySummaryMarkdown(summary, meta = {}) {
  const lines = ['### Relay health timeline', '']
  if (meta.durationSeconds !== undefined) {
    lines.push(`Probed for ${meta.durationSeconds}s (stop reason: ${meta.stopReason || 'n/a'}). Healthy = HTTP 403 M_FORBIDDEN on an invalid login.`, '')
  }
  if (summary.length === 0) return lines.concat('No probes recorded.', '').join('\n')
  lines.push('| relay | probes | failures | failure codes | p50 ms | max ms |', '|---|---:|---:|---|---:|---:|')
  for (const s of summary) {
    const codes = Object.entries(s.failure_codes).map(([c, n]) => `${c}x${n}`).join(' ') || '-'
    lines.push(`| ${s.relay} | ${s.probes} | ${s.failures} | ${codes} | ${s.p50_ms} | ${s.max_ms} |`)
  }
  return lines.concat('').join('\n')
}

// Walk a Playwright JSON report (reporter: json) and flatten to per-test rows.
function collectPlaywrightTests(report) {
  const tests = []
  const walk = (suite, titles) => {
    const here = suite.title ? titles.concat(suite.title) : titles
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const results = t.results || []
        const duration = results.reduce((sum, r) => sum + (r.duration || 0), 0)
        tests.push({
          title: here.concat(spec.title).filter(Boolean).join(' > '),
          project: t.projectName,
          status: t.status, // expected | unexpected | flaky | skipped
          retries: Math.max(0, results.length - 1),
          duration_ms: duration
        })
      }
    }
    for (const child of suite.suites || []) walk(child, here)
  }
  for (const suite of report.suites || []) walk(suite, [])
  return tests
}

function summarizePlaywright(report, slowestN = 5) {
  const tests = collectPlaywrightTests(report)
  return {
    tests: tests.length,
    passed: tests.filter((t) => t.status === 'expected').length,
    failed: tests.filter((t) => t.status === 'unexpected').length,
    flaky: tests.filter((t) => t.status === 'flaky').length,
    skipped: tests.filter((t) => t.status === 'skipped').length,
    retried: tests.filter((t) => t.retries > 0).length,
    slowest: [...tests].sort((a, b) => b.duration_ms - a.duration_ms).slice(0, slowestN)
  }
}

function buildE2eRecord({ suite, exitCode, startedAt, completedAt, env = {}, playwright = null }) {
  const started = new Date(startedAt)
  const completed = new Date(completedAt)
  return {
    suite,
    status: exitCode === 0 ? 'passed' : 'failed',
    exit_code: exitCode,
    elapsed_seconds: Math.round((completed - started) / 1000),
    started_at: started.toISOString(),
    completed_at: completed.toISOString(),
    run_id: env.GITHUB_RUN_ID || null,
    run_attempt: env.GITHUB_RUN_ATTEMPT || null,
    job: env.GITHUB_JOB || null,
    sha: env.GITHUB_SHA || null,
    playwright
  }
}

function e2eSummaryMarkdown(record) {
  const lines = [
    `### E2E timing: ${record.suite}`,
    '',
    `- status: **${record.status}** (exit code ${record.exit_code})`,
    `- elapsed: ${record.elapsed_seconds}s (${record.started_at} to ${record.completed_at})`,
    `- run: ${record.run_id}, attempt ${record.run_attempt}, sha ${record.sha}`
  ]
  const pw = record.playwright
  if (pw) {
    lines.push(`- tests: ${pw.tests} (passed ${pw.passed}, failed ${pw.failed}, flaky ${pw.flaky}, skipped ${pw.skipped}, retried ${pw.retried})`)
    if (pw.slowest.length) {
      lines.push('', '| slowest tests | ms | retries |', '|---|---:|---:|')
      for (const t of pw.slowest) lines.push(`| ${t.title.replace(/\|/g, '\\|')} | ${t.duration_ms} | ${t.retries} |`)
    }
  }
  return lines.concat('').join('\n')
}

module.exports = {
  relayHosts,
  probeBody,
  isHealthy,
  percentile,
  parseJsonl,
  summarizeRelayRows,
  relaySummaryMarkdown,
  collectPlaywrightTests,
  summarizePlaywright,
  buildE2eRecord,
  e2eSummaryMarkdown
}
