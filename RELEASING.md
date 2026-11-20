# Releasing octez.connect

This is the one place that describes how a release is made. If a step here is
wrong, fix this file in the same pull request as the change that made it wrong.

## Who can release

- **Release owners** can push `v*` tags and approve the `npm-release`
  environment. They are listed in `MAINTAINERS.md`. There must always be at
  least two, so one can approve while the other is away.
- **npm owners** of the `@tezos-x/octez.connect-*` packages can change the npm
  Trusted Publisher settings. Check the list with
  `npm owner ls @tezos-x/octez.connect-core` before a release that changes
  publishing.
- Nobody publishes from a laptop. Releases go through
  `.github/workflows/release.yml` only, with npm Trusted Publishers (no npm
  token).

## What the release workflow enforces

A `v*` tag starts `.github/workflows/release.yml`:

1. **verify**: the tag must equal `v` + the version in the root
   `package.json`. The tagged commit must be on `master`. Then it runs the
   version check, the build, the unit tests and the end-to-end smoke tests.
2. **publish-packages** waits for approval on the `npm-release` environment.
   A release owner approves it in the Actions tab.
3. Packages are published in dependency order:
   - a stable version (`5.0.6`) goes to the `latest` dist-tag;
   - a prerelease (`5.0.6-rc.1`) goes to its channel (`rc`). The script
     refuses to put a prerelease on `latest`;
   - if the run stops part-way, re-run the job: packages already on npm are
     skipped.

## Steps

1. **Prepare the version** on a branch, and open a pull request:

   ```bash
   npm version 5.0.N --no-git-tag-version
   npm run version:sync
   npm install --package-lock-only --ignore-scripts
   ```

   Add the changelog entry. Merge after CI passes and a second maintainer
   approves.

2. **Release candidate.** For anything beyond a one-line fix, release
   `5.0.N-rc.1` first: same steps, with the prerelease version. Then run the
   wallet checklist below against the `rc` build.

3. **Tag** the merge commit on `master` and push the tag. Tags are signed:

   ```bash
   git checkout master && git pull
   git tag -s v5.0.N -m "octez.connect 5.0.N"
   git push origin v5.0.N
   ```

4. **Approve** the `publish-packages` job once `verify` is green.

5. **Check npm.** Every package shows the new version and the right dist-tag:

   ```bash
   npm view @tezos-x/octez.connect-sdk dist-tags
   ```

6. **Announce.** Write the GitHub release notes. Tell the wallet teams and the
   Octez.js maintainers (`@tezos-x/octez.js-dapp-wallet` pins this version). For a
   security fix, post on Agora and follow `SECURITY.md`.

## Real-wallet checklist

Run this on the release candidate. Record the result for each line in the
release pull request.

Wallets:

- [ ] Kukai web
- [ ] Kukai iOS
- [ ] Temple browser extension
- [ ] Temple mobile
- [ ] Umami desktop
- [ ] Umami iOS
- [ ] A WalletConnect wallet on Tezos X previewnet

For each wallet: connect, sign, disconnect, reconnect.

Browsers:

- [ ] Safari with the desktop wallet app installed: the wallet opens, with no
      blank tab.
- [ ] No wallet app installed, in Chrome, Firefox and Safari: the dApp page
      stays usable. **This one must pass.**
- [ ] The console shows no `papers.tech` errors.
- [ ] The wallet picker shows the expected featured wallets.

## Repository settings this relies on

These are settings, not code, so a repository admin has to set them. Check
them before the first release after a change of maintainers.

- Environment `npm-release`: required reviewers = the release owners, and
  "prevent self-review" on.
- npm Trusted Publisher, for each package: repository
  `trilitech/octez.connect`, workflow `release.yml`, environment
  `npm-release`.
- Tag ruleset on `v*`: only release owners can create, update or delete these
  tags.
- Branch protection on `master`: pull request with one approval, required CI
  checks, no force-push.
- No `NPM_AUTH_TOKEN` (or other npm token) secret in the repository or
  organisation settings.
