# Source mirroring

The private `fiftyone-digital/metricpanel` monorepo is the canonical editable source for the
packages under `packages/`. This public repository is a one-way release mirror.

## Flow

1. Change and test a public package in the private product monorepo.
2. Update that package's version and documentation in the same private change.
3. Merge the private change to `main`.
4. The private `Sync public packages` workflow exports an explicit file allowlist and opens a pull
   request here using a narrowly scoped GitHub App installation token.
5. Public CI verifies the generated pull request and GitHub auto-merges it only after the required
   `verify` check passes.
6. The merge triggers the public release workflow. Any package version that does not exist on npm
   is built, inspected, published, installed from the registry, and assigned a generated GitHub
   release through npm Trusted Publishing.

The synchronization never copies private root configuration, applications, environment files, or
release credentials. It replaces only the configured package directories and the generated
`.mirror-manifest.json` file. The manifest records the private source commit and SHA-256 hash for
every mirrored file.

## Ownership boundary

- Private monorepo: package implementation, tests, package README, version, package metadata.
- Public monorepo: CI, Trusted Publishing workflow, mirror verification, contribution/security
  policy, and repository documentation.

Do not patch mirrored package files directly in this repository. Emergency fixes should still be
made in the private canonical source and synchronized so the two repositories cannot diverge.
