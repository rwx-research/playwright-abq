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

import type { Socket } from 'net';
import type { FullConfig, FullResult, Suite, TestError } from '../../types/testReporter';
import { FullConfigInternal, FullProjectInternal } from '../types';
import { sendManifest } from './manifest';
import { spawnedMessage } from './version';
import * as Abq from '@rwx-research/abq';

export { AbqDispatcher } from './abqDispatcher';

export type InitializeResult = FullResult & {
  enabled: boolean;
  exit: boolean;
}

const abqConfig = Abq.getAbqConfiguration();

let abqSocket: Socket | null = null;

export function getAbqSocket(): Socket {
  if (!abqSocket)
    throw new Error('ABQ socket is not yet initialized.');

  return abqSocket;
}

export function isEnabled(): boolean {
  return abqConfig.enabled;
}

export function checkForConfigurationIncompatibility(config: FullConfigInternal, projectFilter: string[]): TestError[] {
  if (!abqConfig.enabled) return [];

  applyAbqConfiguration(config);

  const fatalErrors: TestError[] = [];

  let projectConfig: FullProjectInternal | undefined;
  if (config.projects.length === 1) {
    projectConfig = config.projects[0];
  } else if (projectFilter.length === 1) {
    projectConfig = config.projects.find(pc => pc.name === projectFilter[0]);

    if (!projectConfig) {
      fatalErrors.push(createStacklessError(`Project configuration not found for project '${projectFilter[0]}'.`));
      return fatalErrors;
    }
  } else {
    fatalErrors.push(createStacklessError(`${config.projects.length} projects are configured. Specify a single --project per ABQ run.`));
    return fatalErrors;
  }

  if (!config.fullyParallel || (projectConfig && !projectConfig._fullyParallel))
    fatalErrors.push(createStacklessError('ABQ only supports fullyParallel = true'));

  return fatalErrors;
}

export function applyAbqConfiguration(config: FullConfig) {
  if (config.workers !== 1) {
    // eslint-disable-next-line no-console
    console.warn(`Warning: ABQ only supports 1 worker. Overriding configuration value of '${config.workers}'.`);
    config.workers = 1;
  }

  if (config.shard) {
    // eslint-disable-next-line no-console
    console.warn(`Warning: ABQ does not support Playwright sharding. Overriding configuration value of '${JSON.stringify(config.shard)}'.`);
    config.shard = null;
  }
}

export function updateReporterArg(reporterName: string, arg: any) {
  if (!process.env.ABQ_RUNNER) return;

  const hasMultipleRunners = process.env.ABQ_RUNNER !== '1';

  const warnNoMerge = (argField: string) => {
    // eslint-disable-next-line no-console
    console.warn(`ABQ with multiple workers does not support merging ${reporterName} results. Consider adding '$ABQ_RUNNER' to the ${reporterName} reporter's '${argField}'.`);
  };

  switch (reporterName) {
    case 'html':
      if (arg && typeof arg === 'object' && arg.outputFolder && arg.outputFolder.includes('$ABQ_RUNNER')) {
        arg.outputFolder = arg.outputFolder.replace('$ABQ_RUNNER', process.env.ABQ_RUNNER);
      } else if (process.env.PLAYWRIGHT_HTML_REPORT && process.env.PLAYWRIGHT_HTML_REPORT.includes('$ABQ_RUNNER')) {
        process.env.PLAYWRIGHT_HTML_REPORT = process.env.PLAYWRIGHT_HTML_REPORT.replace('$ABQ_RUNNER', process.env.ABQ_RUNNER);
      } else if (hasMultipleRunners) {
        warnNoMerge('outputFolder');
      }
      break;
    case 'json':
      if (arg && typeof arg === 'object' && arg.outputFile && arg.outputFile.includes('$ABQ_RUNNER')) {
        arg.outputFile = arg.outputFile.replace('$ABQ_RUNNER', process.env.ABQ_RUNNER);
      } else if (process.env.PLAYWRIGHT_JSON_OUTPUT_NAME && process.env.PLAYWRIGHT_JSON_OUTPUT_NAME.includes('$ABQ_RUNNER')) {
        process.env.PLAYWRIGHT_JSON_OUTPUT_NAME = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME.replace('$ABQ_RUNNER', process.env.ABQ_RUNNER);
      } else if (hasMultipleRunners) {
        warnNoMerge('outputFile');
      }
      break;
    case 'junit':
      if (arg && typeof arg === 'object' && arg.outputFile && arg.outputFile.includes('$ABQ_RUNNER')) {
        arg.outputFile = arg.outputFile.replace('$ABQ_RUNNER', process.env.ABQ_RUNNER);
      } else if (process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME && process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME.includes('$ABQ_RUNNER')) {
        process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME = process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME.replace('$ABQ_RUNNER', process.env.ABQ_RUNNER);
      } else if (hasMultipleRunners) {
        warnNoMerge('outputFile');
      }
      break;
  }
}

export async function initialize(rootSuite: Suite): Promise<InitializeResult> {
  if (!abqConfig.enabled) {
    return { status: 'passed', enabled: false, exit: false };
  }

  abqSocket = await Abq.connect(abqConfig, spawnedMessage);

  if (abqConfig.shouldGenerateManifest) {
    await sendManifest(rootSuite, abqSocket);
    // we should quit and abq will relaunch the native runner
    abqSocket.destroy();
    abqSocket = null;
    return { status: 'passed', enabled: true, exit: true };
  }

  const initMsg: Abq.InitMessage = await Abq.protocolRead(abqSocket) as Abq.InitMessage;
  await Abq.protocolWrite(abqSocket, Abq.initSuccessMessage());

  if (initMsg.fast_exit) {
    abqSocket.destroy();
    abqSocket = null;
    return { status: 'passed', enabled: true, exit: true };
  }

  return { status: 'passed', enabled: true, exit: false };
}

function createStacklessError(message: string): TestError {
  return { message, __isNotAFatalError: true } as any;
}
