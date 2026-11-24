'use strict'

// Report-only relay health poller for CI. Probes every beacon-node relay with
// an invalid Matrix login every POLL_INTERVAL_SECONDS and writes a JSONL
// timeline plus a per-relay table to $GITHUB_STEP_SUMMARY. Never fails the
// workflow (always exits 0) and needs no secrets.
//
// It stops when the "end-to-end" job of the current run completes (checked via
// GITHUB_TOKEN, needs `actions: read`), or at POLL_MAX_DURATION_SECONDS.
// Local use:
//   POLL_MAX_DURATION_SECONDS=60 node scripts/ci/poll-relay-health.js

const fs = require('node:fs')
const path = require('node:path')
const {
  relayHosts,
  probeBody,
  isHealthy,
  parseJsonl,
  summarizeRelayRows,
  relaySummaryMarkdown
} = require('../helpers/ci-metrics')

const env = process.env
const intervalMs = Number(env.POLL_INTERVAL_SECONDS || 15) * 1000
const maxMs = Number(env.POLL_MAX_DURATION_SECONDS || 1200) * 1000
const timeoutMs = Number(env.POLL_TIMEOUT_SECONDS || 15) * 1000
const stopCheckAfterMs = Number(env.POLL_STOP_CHECK_AFTER_SECONDS || 30) * 1000
const watchJob = env.POLL_WATCH_JOB_NAME || ''
const outFile = env.POLL_OUTPUT_FILE || 'ci-metrics/relay-health.jsonl'
const apiUrl = env.GITHUB_API_URL || 'https://api.github.com'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function probe(host) {
  const started = Date.now()
  let httpCode = 0
  let errcode = null
  try {
    const res = await fetch(`https://${host}/_matrix/client/r0/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(probeBody),
      signal: AbortSignal.timeout(timeoutMs)
    })
    httpCode = res.status
    const text = await res.text()
    try {
      errcode = JSON.parse(text).errcode || null
    } catch {
      errcode = null
    }
  } catch (error) {
    errcode = error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR'
  }
  return {
    ts: new Date(started).toISOString(),
    relay: host,
    http_code: httpCode,
    errcode,
    latency_ms: Date.now() - started,
    ok: isHealthy(httpCode, errcode)
  }
}

// True once the watched job of this run has status "completed". Any API
// problem returns false: we then simply run to the time limit.
async function watchedJobCompleted() {
  if (!watchJob || !env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) return false
  try {
    const res = await fetch(
      `${apiUrl}/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/jobs?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        signal: AbortSignal.timeout(10000)
      }
    )
    if (!res.ok) return false
    const { jobs = [] } = await res.json()
    const job = jobs.find((j) => j.name === watchJob)
    return Boolean(job) && job.status === 'completed'
  } catch {
    return false
  }
}

async function main() {
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, '')
  const start = Date.now()
  let stopReason = 'max duration'
  console.log(`Relay health monitor: ${relayHosts.length} relays every ${intervalMs / 1000}s, max ${maxMs / 1000}s, watching job "${watchJob || 'none'}"`)

  for (;;) {
    const tickStart = Date.now()
    const rows = await Promise.all(relayHosts.map(probe))
    fs.appendFileSync(outFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
    const bad = rows.filter((r) => !r.ok)
    console.log(`${rows[0].ts} ok=${rows.length - bad.length}/${rows.length}` + bad.map((r) => ` ${r.relay}:${r.http_code}/${r.errcode}`).join(''))

    const elapsed = Date.now() - start
    if (elapsed >= stopCheckAfterMs && (await watchedJobCompleted())) {
      stopReason = `${watchJob} completed`
      break
    }
    if (Date.now() - start + intervalMs >= maxMs) break
    await sleep(Math.max(0, intervalMs - (Date.now() - tickStart)))
  }

  const markdown = relaySummaryMarkdown(summarizeRelayRows(parseJsonl(fs.readFileSync(outFile, 'utf8'))), {
    durationSeconds: Math.round((Date.now() - start) / 1000),
    stopReason
  })
  console.log(markdown)
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, markdown + '\n')
}

main().then(
  () => process.exit(0),
  (error) => {
    // Report-only: a poller bug must not fail the workflow.
    console.error(`Relay health monitor error (ignored): ${error && error.stack ? error.stack : error}`)
    process.exit(0)
  }
)
