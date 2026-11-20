'use strict'

const getPrereleaseTag = (version) => {
  const prerelease = version.split('-')[1]

  if (!prerelease) {
    return undefined
  }

  return prerelease.split('.')[0]
}

const hasExplicitTagArg = (extraArgs) =>
  extraArgs.some((arg, index) => {
    if (arg === '--tag') {
      return true
    }

    if (index > 0 && extraArgs[index - 1] === '--tag') {
      return true
    }

    return arg.startsWith('--tag=')
  })

const getExplicitTagArg = (extraArgs) => {
  for (let index = 0; index < extraArgs.length; index += 1) {
    const arg = extraArgs[index]

    if (arg === '--tag') {
      return extraArgs[index + 1]
    }

    if (arg.startsWith('--tag=')) {
      return arg.slice('--tag='.length)
    }
  }

  return undefined
}

const resolvePublishTag = ({ version, extraArgs, env }) => {
  if (hasExplicitTagArg(extraArgs)) {
    return undefined
  }

  return env.NPM_DIST_TAG ?? getPrereleaseTag(version)
}

// The dist-tag npm will actually apply: an explicit --tag wins, then the
// resolved tag, then npm's own default, which is `latest`.
const effectivePublishTag = ({ version, extraArgs, env }) =>
  getExplicitTagArg(extraArgs) ?? resolvePublishTag({ version, extraArgs, env }) ?? 'latest'

// A prerelease (e.g. 5.0.6-rc.1) must never become `latest`: every dApp that
// installs the package without a version would get the test build.
const assertSafePublishTag = ({ version, extraArgs, env }) => {
  const tag = effectivePublishTag({ version, extraArgs, env })

  if (getPrereleaseTag(version) && tag === 'latest') {
    throw new Error(
      `Refusing to publish prerelease ${version} under the "latest" dist-tag. ` +
        'Publish it under its prerelease channel (the default) or another non-latest tag.'
    )
  }

  return tag
}

// The tag that triggered the release must name the workspace version exactly.
const checkReleaseTag = ({ refName, version }) => {
  const expected = `v${version}`

  if (refName !== expected) {
    throw new Error(`Release tag ${refName} does not match the workspace version (expected ${expected}).`)
  }
}

const resolvePublishCommand = ({ publishArgs, env, nodeExecPath }) => {
  const npmExecPath = env.npm_execpath

  if (npmExecPath) {
    return {
      command: nodeExecPath,
      args: [npmExecPath, ...publishArgs]
    }
  }

  return {
    command: 'npm',
    args: publishArgs
  }
}

module.exports = {
  assertSafePublishTag,
  checkReleaseTag,
  effectivePublishTag,
  getExplicitTagArg,
  getPrereleaseTag,
  hasExplicitTagArg,
  resolvePublishCommand,
  resolvePublishTag
}
