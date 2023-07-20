const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const BASEPATH = __dirname;

const MANIFEST_RAW_FILE = "manifest.raw.json";
const RESULTS_RAW_FILE = "results.raw.json";

const MANIFEST_CLEAN_FILE = "manifest.clean.json";
const RESULTS_CLEAN_FILE = "results.clean.json";

const UPDATE = !!process.env["UPDATE"];

const tests = ["smoketest"];

function cleanMembers(testPath, members) {
  for (const member of members) {
    if (member["type"] === "group") {
      cleanMembers(testPath, member["members"]);
    } else {
      console.assert(member["type"] === "test");
      member["id"] = "STRIPPED";
    }

    const meta = member["meta"];
    if ("fileName" in meta) {
      meta["fileName"] = path.relative(testPath, meta["fileName"]);
    }
  }
}

function cleanManifest(testPath, manifest) {
  cleanMembers(testPath, manifest["manifest"]["members"]);

  const nativeRunner = manifest["native_runner_specification"];
  nativeRunner["language_version"] = "STRIPPED";
  nativeRunner["host"] = "STRIPPED";

  return manifest;
}

function cleanResults(results) {
  for (const resultsList of results) {
    for (const result of resultsList) {
      result["result"]["runtime"]["Nanoseconds"] = "STRIPPED";
      result["result"]["stderr"] = "STRIPPED";
      result["result"]["stdout"] = "STRIPPED";
      result["result"]["timestamp"] = 1234567890;
    }
  }
  return results;
}

function checkOrUpdate(actual, expectedFile) {
  fs.writeFileSync(expectedFile, JSON.stringify(actual, null, 2));
  if (UPDATE || !fs.existsSync(expectedFile)) {
    cp.execSync(`git add ${expectedFile}`, { stdio: "inherit" });
  } else {
    cp.execSync(`git diff --exit-code ${expectedFile}`, { stdio: "inherit" });
  }
}

function runTest(testPath) {
  process.chdir(testPath);

  cp.execSync(`npm install`, { stdio: "inherit" });

  cp.execSync(
    `abq_tester_harness e2e --results ${RESULTS_RAW_FILE} --manifest ${MANIFEST_RAW_FILE} -- npm test`,
    {
      stdio: "inherit",
    }
  );

  const rawResults = JSON.parse(
    fs.readFileSync(RESULTS_RAW_FILE).toString("utf-8")
  );
  const rawManifest = JSON.parse(
    fs.readFileSync(MANIFEST_RAW_FILE).toString("utf-8")
  );

  fs.rmSync(RESULTS_RAW_FILE);
  fs.rmSync(MANIFEST_RAW_FILE);

  const manifest = cleanManifest(testPath, rawManifest);
  const results = cleanResults(rawResults);

  checkOrUpdate(manifest, MANIFEST_CLEAN_FILE);
  checkOrUpdate(results, RESULTS_CLEAN_FILE);
}

for (const test of tests) {
  const testPath = path.join(BASEPATH, test);

  runTest(testPath);
}
