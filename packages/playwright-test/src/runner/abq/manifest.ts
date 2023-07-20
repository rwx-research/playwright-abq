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

import type { Socket } from "net";
import type { Suite, TestCase } from "../../../types/testReporter";
import * as Abq from "@rwx-research/abq";

export async function sendManifest(rootSuite: Suite, abqSocket: Socket) {
  Abq.protocolWrite(abqSocket, {
    manifest: {
      members: rootSuite.suites.map(generateManifestSuite),
      init_meta: {},
    },
  });
}

function generateManifestSuite(suite: Suite): Abq.Group {
  return {
    type: "group",
    name: suite.title,
    tags: extractTags(suite.title),
    meta: suite.location ? { fileName: suite.location.file } : {},
    members: [
      ...suite.suites.map(generateManifestSuite),
      ...suite.tests.map(generateManifestTest),
    ],
  };
}

function generateManifestTest(test: TestCase): Abq.Test {
  const meta: Record<string, string | undefined> = {};
  test.annotations.forEach(
    ({ type, description }: { type: string; description?: string }): void => {
      {
        meta[type] = description;
      }
    }
  );

  return {
    type: "test",
    id: test.id,
    tags: extractTags(test.title),
    meta: meta,
  };
}

function extractTags(title: string): string[] {
  // borrowed from JSONReporter._serializeTestSpec
  return (title.match(/@[\S]+/g) || []).map((t: string): string =>
    t.substring(1)
  );
}
