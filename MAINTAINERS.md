# Maintainers

This repository maintains the Trilitech octez.connect package line under the
`@tezos-x/octez.connect-*` scope.

## Stewardship model

- Historical lineage: `airgap-it/beacon-sdk`
- External maintenance line we monitor: `ecadlabs/beacon-sdk-taquito-patches`
- Supported packages from this repo: `@tezos-x/octez.connect-*`
- Decision authority for releases and intake: Trilitech maintainers

## Intake policy

- Prefer narrowly scoped ports from published upstream releases or pinned
  commits.
- Record the source release, `gitHead`, or commit in commit messages and pull
  requests.
- Do not treat external repos as automatic authority.
- Keep Trilitech deltas explicit and reviewable.

## Release policy

- Merge via pull request into `master`
- Require passing CI before merge
- Publish from signed tags through `.github/workflows/release.yml`
- Use npm Trusted Publishers, not long-lived automation tokens
- Release owners (may push `v*` tags and approve the `npm-release` environment):
  the maintainers listed below. See `RELEASING.md`.

## Maintainers

- Pietro Abate ([@abate](https://github.com/abate)), tech lead
- Devon Nathan ([@devon-n](https://github.com/devon-n))

## Operational notes

- The workflow filename configured in npm Trusted Publishers must match
  `.github/workflows/release.yml` exactly.
