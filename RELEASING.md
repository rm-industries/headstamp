# Releasing Headstamp

The public package is `@rm-industries/oxlint-plugin-headstamp` on npm. It uses the
MIT license. Publishing a GitHub release triggers publication; ordinary pushes,
pull requests, and manual workflow runs do not publish.

## One-time npm setup

An npm organization owner must verify publish access to the `rm-industries` scope.
GitHub organization membership does not establish npm organization ownership.
The package was not publicly visible when this workflow was prepared, and the
local npm session was not authenticated. No bootstrap publication has been made.

Trusted publishing is configured in an existing package's npm settings. If the
package does not yet exist, bootstrap the initial version interactively with an
authorized npm account and 2FA, using the reviewed tarball from the workflow's
manual run. npm also supports staging a new package for review before approving
its first version; staging creates a public placeholder package. Those operations
are publication actions, separate from merging this workflow.

Once package settings are available, add a GitHub Actions trusted publisher with:

- Organization/user: `rm-industries`
- Repository: `headstamp`
- Workflow filename: `package-release.yml`
- Environment: `npm-release`
- Allowed action: enable direct `npm publish` (stage-only permission is insufficient)

Configure it when ready for the first CI publication: npm currently requires a new
trusted publisher to complete its first successful publication within two days.
The workflow uses a GitHub-hosted runner and Node 26, which supplies a sufficiently
recent npm CLI for OIDC. No `NPM_TOKEN` or other long-lived publish secret is used.
The publishing job uses the GitHub environment `npm-release`; configure any desired
reviewers in that environment before relying on environment approval protection.

The source repository remains private. npm trusted publishing works in this case,
but npm provenance is unavailable for private source repositories. The workflow
does not request provenance or change repository visibility.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and
[npm staged publishing](https://docs.npmjs.com/staged-publishing/).

## Prepare and review without publishing

1. Merge the release workflow through the normal PR process.
2. In GitHub Actions, manually run **Npm Release** against `main`.
3. Verify the format/lint job and Node 22.18, 24, and 26 test jobs pass.
4. Download the `npm-package` artifact and review its tarball. It contains only
   compiled JavaScript, declarations, the README, package metadata, and license.

Manual runs install from the lockfile without restoring a package-manager cache,
pack and dry-run publication, and upload the tarball. They skip the publishing job.
Release tooling is not included in the npm package.

## Publish a version

1. Update the package version and lockfile together in a PR. For example,
   `npm version patch --no-git-tag-version` prepares a patch version without
   creating a local tag. Review and merge the version change.
2. Create a tag named exactly `v` followed by the package version at the intended
   merged commit. The tagged commit must be reachable from `main`.
3. Publish a GitHub release for that tag. A draft does not trigger publication.
4. For a prerelease version, mark the GitHub release as a prerelease. Prereleases
   publish to npm's `next` dist-tag; stable versions publish to `latest`.
5. Follow **Npm Release** to completion and verify the version on npm.

The workflow reruns the existing CI matrix, checks that the tag and both lockfile
version fields agree with the package version, and verifies the prerelease flag.
It then builds and packs in a fresh preparation job with no publish permission.
The publishing job downloads that artifact, verifies its SHA-512 integrity, and
publishes that exact tarball using OIDC with lifecycle scripts disabled.

Retrying a release, including recording a bootstrapped version as a GitHub release,
is safe only when npm already contains the identical tarball. Identical versions
are skipped; different contents fail rather than attempting replacement. Registry
lookup errors other than an explicit missing-version response stop publication.
To release changed contents, publish a new version rather than moving an old tag.

The workflow does not automatically bump versions, create tags or GitHub releases,
merge PRs, or publish on branch pushes. Publishing the GitHub release is the
maintainer's explicit release action.
