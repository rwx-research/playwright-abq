# 🎭 Playwright

## Release

Before cutting a release, upstream Playwright creates a branch named eg. `release-1.29`.
They then cherry-pick fixes onto the branch before creating a release from that branch.

To improve compatibility, we'll follow roughly the same release process.

1. When upstream makes a release branch, create an `abq/release-*` branch from `release-*`.
1. Merge `abq/main` into `abq/release-*`.
  1. If there are any conflicts, stop merging and [resolve conflicts on abq/main](#resolving-conflicts) first.
1. Release `playwright-test-abq` [as described below](#releasing-playwright-test-abq).

Our `main` branch tracks upstream's `main`.

### Releasing playwright-test-abq

Update `version` in the root `package.json`.

Update the versions in [abq/version.ts](./packages/playwright-test/src/abq/version.ts) to match.

Commit the resulting `packages/*/package.json` changes.

Perform the release from the `abq/release-*` branch, after `package.json` versions
have been updated and committed.

Change the package name in [playwright-test/package.json](./packages/playwright-test/package.json) 
from `@playwright/test` to `@rwx-research/playwright-test-abq`.

```bash
node ./utils/workspace.js --ensure-consistent
npm run build
npm publish --access=public ./packages/playwright-test
```

### Resolving conflicts

Don't resolve merge conflicts directly in a release branch if at all possible.

First, find the parent commit in the upstream `release-*` branch that's in upstream's `main`.
Merge that commit into `abq/main` and resolve conflicts.
