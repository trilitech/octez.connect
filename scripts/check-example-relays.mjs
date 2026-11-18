// The example pages are what the end-to-end tests load. Every relay they
// list must be one we run (*.octez.io): a third-party relay makes pairing
// depend on a server we cannot fix, and the tests then fail at random.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const examplesDir = new URL('../examples/', import.meta.url).pathname
// A bare quoted hostname (no scheme), as used in matrixNodes lists.
const quotedHost = /['"]([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::\d+)?['"]/gi
const looksLikeRelay = (host) =>
  host.startsWith('beacon-') || host.includes('matrix') || host.endsWith('papers.tech')

const problems = []
for (const file of readdirSync(examplesDir).filter((f) => f.endsWith('.html'))) {
  const lines = readFileSync(join(examplesDir, file), 'utf8').split('\n')
  lines.forEach((line, index) => {
    if (line.trim().startsWith('//')) return
    for (const [, host] of line.matchAll(quotedHost)) {
      if (looksLikeRelay(host) && !host.endsWith('.octez.io')) {
        problems.push(`examples/${file}:${index + 1}: ${host}`)
      }
    }
  })
}

if (problems.length > 0) {
  console.error('Example pages list relays that are not ours (*.octez.io):')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('Example pages list only *.octez.io relays.')
