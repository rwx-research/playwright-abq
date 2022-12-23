/**
 * Copyright (c) Microsoft Corporation.
 * Copyright (c) ReadWriteExecute, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


import { formatResultFailure } from '../reporters/base';
import type { FullConfig, Reporter, TestResult } from '../../types/testReporter';
import type { Loader } from '../loader';
import * as Abq from '@rwx-research/abq';
import type { Socket } from 'net';
import type { TestStatus } from '../../types/test';
import { TestCase } from '../test';
import { Dispatcher, TestGroup } from '../dispatcher';
import { getAbqSocket } from '.';

export class AbqDispatcher extends Dispatcher {
  private _abqSocket: Socket;
  private _config: FullConfig;
  private _projectSetupGroups: TestGroup[];
  private _failedSetupProjectIds!: Set<string>;
  private _queueIndexedByTestId!: Map<string, TestGroup>;
  private _unusedProjectSetupGroupsByProjectId!: Map<string, TestGroup[]>;

  constructor(loader: Loader, reporter: Reporter, { testGroups, projectSetupGroups }: { testGroups: TestGroup[], projectSetupGroups: TestGroup[] }) {
    super(loader, testGroups, reporter);

    this._config = loader.fullConfig();
    this._projectSetupGroups = projectSetupGroups;
    this._abqSocket = getAbqSocket();
  }

  override async run() {
    this._failedSetupProjectIds = new Set();
    this._queueIndexedByTestId = new Map();
    this._unusedProjectSetupGroupsByProjectId = new Map();

    // 1. Allocate a single worker.
    this._workerSlots = [{ busy: false }];

    // 2. Schedule a single job.
    for (const testGroup of this._queue)
      this._queueIndexedByTestId.set(testGroup.tests[0].id, testGroup);

    for (const setupGroup of this._projectSetupGroups) {
      let groups = this._unusedProjectSetupGroupsByProjectId.get(setupGroup.projectId);
      if (!groups) {
        groups = [];
        this._unusedProjectSetupGroupsByProjectId.set(setupGroup.projectId, groups);
      }
      groups.push(setupGroup);
    }

    this._scheduleJob();
    this._checkFinished();
    // 3. More jobs are scheduled when the worker becomes free, or a new job is added.
    // 4. Wait for all jobs to finish.
    await this._finished;
  }

  protected override async _scheduleJob() {
    // 1. Find a job to run.
    if (this._isStopped)
      return;

    const testCase = await Abq.protocolRead(this._abqSocket) as Abq.TestCaseMessage;

    if (!testCase) {
      // we're done
      this._queue = [];
      this._checkFinished();
      return;
    }

    const testCaseId = testCase.test_case.id;

    // find the job and remove it from the queue
    // removing it from the queue is kind of arbitrary -- we don't expect the whole queue to be empty before we're done
    const job = this._queueIndexedByTestId.get(testCaseId);
    this._queueIndexedByTestId.delete(testCaseId);

    if (!job) {
      // eslint-disable-next-line no-console
      console.error('could not find job for test case id', testCaseId);
      return;
    }

    if (!this._failedSetupProjectIds.has(job.projectId)) {
      this._workerSlots[0].busy = true;
      // find the setup groups with the same project Id
      // If there are any that have not yet been run, run them
      for (const setupGroup of (this._unusedProjectSetupGroupsByProjectId.get(job.projectId) || [])) {
        await this._startJobInWorker(0, setupGroup);
        if (setupGroup.tests.some(test => !test.ok())) {
          this._failedSetupProjectIds.add(setupGroup.projectId);
          break;
        }
      }
      this._unusedProjectSetupGroupsByProjectId.delete(job.projectId);
    }

    if (this._failedSetupProjectIds.has(job.projectId)) {
      // if setup failed, skip the test
      for (const test of job.tests) {
        const result = test._appendTestResult();
        this._reporter.onTestBegin?.(test, result);
        result.status = 'skipped';
        this._reporter.onTestEnd?.(test, result);
      }
    } else {
      // run the test group
      await this._startJobInWorker(0, job);
    }

    const test = job.tests[0];
    const result = test.results[0];
    await this._submitTestResult(test, result);

    this._workerSlots[0].busy = false;

    // 4. Check the "finished" condition.
    this._checkFinished();

    // 5. We got a free worker - perhaps we can immediately start another job?
    this._scheduleJob();
  }

  private async _submitTestResult(test: TestCase, result: TestResult) {
    await Abq.protocolWrite(this._abqSocket, {
      test_result: {
        status: ((result: TestResult): Abq.TestResultStatus => {
          switch (result.status) {
            case 'passed': return { type: 'success' };
            case 'timedOut': return { type: 'timed_out' };
            case 'skipped': return { type: 'skipped' };
            case 'failed': return { type: 'failure' }; // TODO find exception & backtrace if possible
            case 'interrupted': return { type: 'error' }; // TODO find exception & backtrace if possible
          }
        })(result),
        id: test.id,
        display_name: test.title,
        output: formatResultFailure(this._config, test, result, '', true).map(error => '\n' + error.message).join(''),
        runtime: Math.trunc(result.duration * 1_000_000), // convert ms to ns
        // TODO: add flesh out results
        meta: {}
      }
    });
  }
}
