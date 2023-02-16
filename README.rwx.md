# 🎭 Playwright

## Release

Update `version` in the root `package.json`.

Change the package name in [playwright-test/package.json](./packages/playwright-test/package.json) 
from `@playwright/test` to `@rwx-research/playwright-test-abq`.

```bash
node ./utils/workspace.js --ensure-consistent
```

Update the versions in [abq/version.ts](./packages/playwright-test/src/abq/version.ts).

Commit the resulting `packages/*/package.json` changes.
Perform the release from the `main` branch, after `pakcage.json` versions have been updated.

```bash
npm run build
npm run test
npm publish --access=public packages/playwright-test
```
