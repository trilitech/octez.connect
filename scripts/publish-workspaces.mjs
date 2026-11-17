import { spawnSync } from 'node:child_process'

import publishWorkspaceHelpers from './helpers/publish-workspaces.js'
import { getWorkspacePackages, topologicallySortWorkspaces } from './workspace-utils.mjs'

const { assertSafePublishTag, resolvePublishCommand, resolvePublishTag } = publishWorkspaceHelpers
const extraArgs = process.argv.slice(2)
const dryRun = extraArgs.includes('--dry-run')
const packages = topologicallySortWorkspaces(getWorkspacePackages()).filter(
  (pkg) => !pkg.manifest.private
)

const runNpm = (args, options) => {
  const command = resolvePublishCommand({
    publishArgs: args,
    env: process.env,
    nodeExecPath: process.execPath
  })

  return spawnSync(command.command, command.args, options)
}

// `npm view name@version version` prints the version when it exists and fails
// with E404 when it does not.
const isAlreadyPublished = (pkg) => {
  const spec = `${pkg.manifest.name}@${pkg.manifest.version}`
  const result = runNpm(['view', spec, 'version', '--json'], {
    cwd: pkg.directory,
    encoding: 'utf8'
  })

  if (result.status === 0) {
    return result.stdout.trim() !== ''
  }

  if (/E404|404 Not Found/.test(`${result.stdout}${result.stderr}`)) {
    return false
  }

  console.error(result.stderr)
  throw new Error(`Could not check whether ${spec} is already on npm.`)
}

// Check every package before publishing any, so a bad tag stops the run
// before the registry has changed.
for (const pkg of packages) {
  assertSafePublishTag({ version: pkg.manifest.version, extraArgs, env: process.env })
}

for (const pkg of packages) {
  const spec = `${pkg.manifest.name}@${pkg.manifest.version}`

  // A re-run after a partial publish skips what already went out.
  if (!dryRun && isAlreadyPublished(pkg)) {
    console.log(`${spec} is already on npm, skipping.`)
    continue
  }

  const publishArgs = ['publish', '--access', 'public']
  const distTag = resolvePublishTag({
    version: pkg.manifest.version,
    extraArgs,
    env: process.env
  })

  if (distTag) {
    publishArgs.push('--tag', distTag)
  }

  publishArgs.push(...extraArgs)
  const result = runNpm(publishArgs, { cwd: pkg.directory, stdio: 'inherit' })

  if (result.status !== 0) {
    // Dependants of a failed package would point at a version that is not on
    // npm, so stop here. A re-run resumes from this package.
    console.error(
      `Publish failed at ${spec}. Fix the cause and re-run the workflow; packages already on npm are skipped.`
    )
    process.exit(result.status ?? 1)
  }
}
