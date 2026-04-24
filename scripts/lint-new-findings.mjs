#!/usr/bin/env node
// Gate new lint findings on lines touched in this branch, without requiring
// the pre-existing backlog (tracked on the lint phase issues) to be cleaned first.
//
// Strategy:
//   1. List .ts files under packages/*/src changed vs base ref.
//   2. For each, compute the set of added/modified line numbers via `git diff -U0`.
//   3. Run eslint (JSON) against those files at HEAD.
//   4. Filter findings to ones landing on a touched line. New files = all lines.
//   5. Exit non-zero if any survive.
//
// Caveat: if you modify a line that already had a finding, it counts as new.
// That's intentional — if you touched the line, you own it.
//
// Base ref comes from LINT_BASE_REF, then known remote branches, then origin/HEAD.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'

const cwd = process.cwd()

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' })
  } catch (err) {
    if (allowFail) return ''
    throw err
  }
}

let mergeBase
function refExists(ref) {
  return git(['rev-parse', '--verify', '--quiet', ref], { allowFail: true }).trim().length > 0
}

function resolveBaseRef() {
  const envBaseRef = process.env.LINT_BASE_REF?.trim()
  const candidates = [
    envBaseRef,
    'origin/master',
    'origin/4.8-stable',
    git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { allowFail: true }).trim()
  ].filter((ref) => ref && ref.length > 0)

  for (const ref of candidates) {
    if (refExists(ref)) return ref
  }
  return null
}

const baseRef = resolveBaseRef()
if (!baseRef) {
  console.error('Could not find a usable base ref. Set LINT_BASE_REF explicitly in CI.')
  process.exit(2)
}

try {
  mergeBase = git(['merge-base', baseRef, 'HEAD']).trim()
} catch (err) {
  console.error(`Could not resolve merge-base with ${baseRef}: ${err.message}`)
  process.exit(2)
}

function listFiles(args) {
  return git(args, { allowFail: true })
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.length > 0)
}

const candidates = new Set([
  ...listFiles(['diff', '--name-only', '--diff-filter=ACMR', mergeBase, 'HEAD']),
  ...listFiles(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']),
  ...listFiles(['ls-files', '--others', '--exclude-standard'])
])

const changed = [...candidates]
  .filter(
    (f) => f.endsWith('.ts') && f.startsWith('packages/') && f.includes('/src/')
  )
  .filter((f) => existsSync(resolve(f)))
  .sort()

if (changed.length === 0) {
  console.log(`No changed .ts files under packages/*/src vs ${baseRef}. Skipping lint.`)
  process.exit(0)
}

// Parse `git diff -U0` hunk headers to get added/modified line ranges on the HEAD side.
function touchedLines(file) {
  const baseHas = git(['ls-tree', '-r', '--name-only', mergeBase, '--', file], { allowFail: true }).trim()
  if (!baseHas) return 'all' // new file

  const diffs = [
    git(['diff', '-U0', mergeBase, '--', file], { allowFail: true }),
    git(['diff', '-U0', 'HEAD', '--', file], { allowFail: true })
  ].join('\n')

  const lines = new Set()
  for (const line of diffs.split('\n')) {
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (!m) continue
    const start = parseInt(m[1], 10)
    const count = m[2] !== undefined ? parseInt(m[2], 10) : 1
    if (count === 0) continue // only deletions at this hunk
    for (let i = 0; i < count; i++) lines.add(start + i)
  }
  return lines
}

const touchedByFile = new Map()
for (const f of changed) touchedByFile.set(f, touchedLines(f))

console.log(`Checking ${changed.length} changed file(s) vs ${baseRef} for new lint findings.`)

// Run eslint on the changed files, JSON output.
const eslintResult = spawnSync('npx', ['eslint', '-f', 'json', ...changed], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024
})

if (!eslintResult.stdout) {
  console.error('eslint produced no JSON output.')
  console.error(eslintResult.stderr)
  process.exit(2)
}

let report
try {
  report = JSON.parse(eslintResult.stdout)
} catch (err) {
  console.error(`Failed to parse eslint JSON: ${err.message}`)
  console.error(eslintResult.stdout.slice(0, 1000))
  process.exit(2)
}

let newErrors = 0
let newWarnings = 0
const buckets = new Map()

for (const fileReport of report) {
  const rel = relative(cwd, fileReport.filePath)
  const touched = touchedByFile.get(rel)
  if (!touched) continue
  for (const m of fileReport.messages) {
    if (m.severity === 0) continue
    const onTouched = touched === 'all' || touched.has(m.line)
    if (!onTouched) continue
    if (m.severity === 2) newErrors++
    else newWarnings++
    const list = buckets.get(rel) ?? []
    list.push(m)
    buckets.set(rel, list)
  }
}

if (newErrors + newWarnings === 0) {
  console.log(`No new lint findings on touched lines vs ${baseRef}.`)
  process.exit(0)
}

for (const [file, msgs] of buckets) {
  console.log(`\n${file}`)
  for (const m of msgs) {
    const tag = m.severity === 2 ? 'error  ' : 'warning'
    console.log(`  ${String(m.line).padStart(4)}:${String(m.column).padEnd(3)} ${tag}  ${m.message}  ${m.ruleId || '(unknown)'}`)
  }
}

console.error(
  `\n✖ ${newErrors + newWarnings} new finding(s) on touched lines (${newErrors} error${newErrors === 1 ? '' : 's'}, ${newWarnings} warning${newWarnings === 1 ? '' : 's'}).`
)
process.exit(1)
