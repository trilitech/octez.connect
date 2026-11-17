import publishWorkspaceHelpers from './helpers/publish-workspaces.js'
import { readJson, rootPackagePath } from './workspace-utils.mjs'

const { checkReleaseTag } = publishWorkspaceHelpers
const refName = process.argv[2] ?? process.env.GITHUB_REF_NAME

if (!refName) {
  console.error('Usage: node scripts/check-release-tag.mjs <tag> (or set GITHUB_REF_NAME)')
  process.exit(1)
}

try {
  checkReleaseTag({ refName, version: readJson(rootPackagePath).version })
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

console.log(`Release tag ${refName} matches the workspace version.`)
