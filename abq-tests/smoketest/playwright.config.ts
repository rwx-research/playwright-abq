/* eslint-disable notice/notice */

import { defineConfig } from "@playwright/test";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  fullyParallel: true,
  shard: null,
  workers: process.env.ABQ_RUNNER ? 1 : undefined,
  reporter: "line",
});
