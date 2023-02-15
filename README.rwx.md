# 🎭 Playwright

## Release

Update `version` in the root `package.json`.

```bash
node ./utils/workspace.js --ensure-consistent
```

Commit the resulting `packages/*/package.json` changes.
Perform the release from the `main` branch, after `pakcage.json` versions have been updated.

```bash
npm run build
npm run test
npm publish --access=public packages/playwright-test
```
