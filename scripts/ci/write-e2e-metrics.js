'use strict'

// Writes ci-metrics/e2e-<suite>.json and appends a Markdown section to
// $GITHUB_STEP_SUMMARY. Report-only: it never throws, so the caller keeps the
// test step's own exit code.
//
// Usage: node scripts/ci/write-e2e-metrics.js <suite> <exit-code> <started-epoch-seconds> [playwright-json]

const fs = require('node:fs')
const path = require('node:path')
const { buildE2eRecord, summarizePlaywright, e2eSummaryMarkdown } = require('../helpers/ci-metrics')

try {
  const [suite, exitCodeArg, startedArg, playwrightPath] = process.argv.slice(2)
  let playwright = null
  if (playwrightPath && fs.existsSync(playwrightPath)) {
    try {
      playwright = summarizePlaywright(JSON.parse(fs.readFileSync(playwrightPath, 'utf8')))
    } catch (error) {
      console.error(`Could not parse ${playwrightPath}: ${error.message}`)
    }
  }
  const record = buildE2eRecord({
    suite,
    exitCode: Number(exitCodeArg),
    startedAt: Number(startedArg) * 1000,
    completedAt: Date.now(),
    env: process.env,
    playwright
  })
  const outFile = path.join('ci-metrics', `e2e-${suite}.json`)
  fs.mkdirSync('ci-metrics', { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2) + '\n')
  const markdown = e2eSummaryMarkdown(record)
  console.log(markdown)
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n')
} catch (error) {
  console.error(`write-e2e-metrics error (ignored): ${error && error.stack ? error.stack : error}`)
}
