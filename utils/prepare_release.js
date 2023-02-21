#!/usr/bin/env node
/**
 * Copyright (c) Microsoft Corporation.
 * Copyright (c) ReadWriteExecute, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const packages = {
  "playwright-core": "@rwx-research/playwright-core-abq",
  "playwright-test": "@rwx-research/playwright-test-abq"
};

const spawnedMessage = (function() {
  const abqVersionTs = path.resolve(__dirname, "..", "packages", "playwright-test", "src", "abq", "version.ts");
  try {
    execSync(
      `tsc ${abqVersionTs} --module commonjs --moduleResolution node --outDir tmp`,
      {
        cwd: path.resolve(__dirname, ".."),
        timeout: 30000
      }
    );
    return require("../tmp/version").spawnedMessage;
  } catch (e) {
    console.error("Error resolving spawnedMessage from TypeScript to JavaScript", e);
    process.exit(1);
  }
})();

function checkRootVersion() {
  const rootPackage = require("../package.json");
  if (rootPackage.version !== spawnedMessage.testFrameworkVersion) {
    console.error(`Root package.json version of ${rootPackage.version} should match spawnedMessage test framework version of ${spawnedMessage.testFrameworkVersion}`);
    process.exit(1);
  }
}

function updatePackage(package, newName) {
  const packageJsonPath = path.resolve(__dirname, "..", "packages", package, "package.json");
  const packageJson = require(packageJsonPath);

  if (packageJson.version !== spawnedMessage.adapterVersion) {
    console.error(`${package} version of ${packageJson.version} should match spawnedMessage adapter version of ${spawnedMessage.adapterVersion}`);
    process.exit(1);
  }

  packageJson.name = newName;

  console.log(`Updating ${packageJsonPath}`);
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
}

console.log("Checking version...");
checkRootVersion();

console.log("Updating package names...");
for (const [package, newName] of Object.entries(packages)) {
  updatePackage(package, newName);
}

console.log("Done");
