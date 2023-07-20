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
import type {
  FullConfig,
  FullResult,
  Suite,
  TestError,
} from "../../../types/testReporter";
import { FullConfigInternal, FullProjectInternal } from "../../common/types";
import * as manifest from "./manifest";
import { spawnedMessage } from "./version";
import * as Abq from "@rwx-research/abq";

export { AbqDispatcher } from "./abqDispatcher";

export type InitializeResult = FullResult & {
  enabled: boolean;
  exit: boolean;
};

const abqConfig = Abq.getAbqConfiguration();

let abqSocket: Socket | null = null;

export function getAbqSocket() {
  if (!abqSocket) throw new Error("ABQ socket is not yet initialized.");

  return abqSocket;
}

export function enabled() {
  return abqConfig.enabled;
}

export function shouldGenerateManifest() {
  return abqConfig.shouldGenerateManifest;
}

export function checkForConfigurationIncompatibility(
  config: FullConfigInternal,
  projectFilter: string[]
): TestError[] {
  if (!abqConfig.enabled) return [];

  applyAbqConfiguration(config);

  const fatalErrors: TestError[] = [];

  let projectConfig: FullProjectInternal | undefined;
  if (config.projects.length === 1) {
    projectConfig = config.projects[0];
  } else if (projectFilter.length === 1) {
    projectConfig = config.projects.find((pc) => pc.name === projectFilter[0]);

    if (!projectConfig) {
      fatalErrors.push(
        createStacklessError(
          `Project configuration not found for project '${projectFilter[0]}'.`
        )
      );
      return fatalErrors;
    }
  } else {
    fatalErrors.push(
      createStacklessError(
        `${config.projects.length} projects are configured. Specify a single --project per ABQ run.`
      )
    );
    return fatalErrors;
  }

  if (
    !config.fullyParallel ||
    (projectConfig && !projectConfig._internal.fullyParallel)
  )
    fatalErrors.push(
      createStacklessError("ABQ only supports fullyParallel = true")
    );

  return fatalErrors;
}

function applyAbqConfiguration(config: FullConfig) {
  if (config.workers !== 1) {
    // eslint-disable-next-line no-console
    console.warn(
      `Warning: ABQ only supports 1 worker. Overriding configuration value of '${config.workers}'.`
    );
    config.workers = 1;
  }

  if (config.shard) {
    // eslint-disable-next-line no-console
    console.warn(
      `Warning: ABQ does not support Playwright sharding. Overriding configuration value of '${JSON.stringify(
        config.shard
      )}'.`
    );
    config.shard = null;
  }
}

export type ConnectResult =
  | {
      enabled: false;
    }
  | {
      enabled: true;
      shouldGenerateManifestThenExit: boolean;
      fastExit: boolean;
    };

export async function connect(): Promise<ConnectResult> {
  if (!abqConfig.enabled) {
    return { enabled: false };
  }

  abqSocket = await Abq.connect(abqConfig, spawnedMessage);

  if (abqConfig.shouldGenerateManifest) {
    return {
      enabled: true,
      shouldGenerateManifestThenExit: true,
      fastExit: false,
    };
  }

  const initMsg: Abq.InitMessage = (await Abq.protocolRead(
    abqSocket
  )) as Abq.InitMessage;
  await Abq.protocolWrite(abqSocket, Abq.initSuccessMessage());

  if (initMsg.fast_exit) {
    return {
      enabled: true,
      shouldGenerateManifestThenExit: false,
      fastExit: true,
    };
  }

  return {
    enabled: true,
    shouldGenerateManifestThenExit: false,
    fastExit: false,
  };
}

export async function sendManifest(rootSuite: Suite): Promise<void> {
  if (!abqSocket) throw new Error("ABQ socket is not initialized.");

  await manifest.sendManifest(rootSuite, abqSocket);

  // we should quit and abq will relaunch the native runner
  abqSocket.destroy();
  abqSocket = null;
}

function createStacklessError(message: string): TestError {
  return { message, __isNotAFatalError: true } as any;
}
