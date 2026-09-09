import {
  TestBed
} from '@angular/core/testing';

import {
  Capacitor
} from '@capacitor/core';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  ErrorReportingService
} from './error-reporting.service';


const crashlytics =
  vi.hoisted(() => ({
    recordException:
      vi.fn(),
    log:
      vi.fn()
  }));


vi.mock(
  '@capacitor-firebase/crashlytics',
  () => ({
    FirebaseCrashlytics:
      crashlytics
  })
);


describe(
  'ErrorReportingService',
  () => {

    let service:
      ErrorReportingService;


    beforeEach(() => {
      vi.clearAllMocks();

      vi.spyOn(
        Capacitor,
        'isNativePlatform'
      ).mockReturnValue(true);

      service =
        TestBed.inject(
          ErrorReportingService
        );
    });


    afterEach(() => {
      vi.restoreAllMocks();
    });


    it(
      'records native errors with a compact JavaScript stack',
      async () => {

        const error =
          new Error(
            'Workout failed'
          );

        error.stack = [
          'Error: Workout failed',
          '    at finishWorkout (https://aptus.test/main.js:120:14)',
          '    at async save (https://aptus.test/chunk.js:45:8)'
        ].join('\n');

        await service.report(
          error,
          {
            source:
              'workout_finish'
          }
        );

        expect(
          crashlytics.recordException
        ).toHaveBeenCalledTimes(1);

        expect(
          crashlytics.recordException
        ).toHaveBeenCalledWith({
          message:
            'Error: Workout failed',

          stacktrace: [
            {
              functionName:
                'finishWorkout',
              fileName:
                'main.js',
              lineNumber:
                120
            },
            {
              functionName:
                'async save',
              fileName:
                'chunk.js',
              lineNumber:
                45
            }
          ],

          keysAndValues: [
            {
              key:
                'source',
              value:
                'workout_finish',
              type:
                'string'
            }
          ]
        });
      }
    );


    it(
      'does not call Crashlytics on web',
      async () => {

        vi.mocked(
          Capacitor.isNativePlatform
        ).mockReturnValue(false);

        await service.report(
          new Error('Web failure'),
          {
            source:
              'global'
          }
        );

        await service.breadcrumb(
          'page opened'
        );

        expect(
          crashlytics.recordException
        ).not.toHaveBeenCalled();

        expect(
          crashlytics.log
        ).not.toHaveBeenCalled();
      }
    );


    it(
      'never propagates a Crashlytics failure',
      async () => {

        crashlytics.recordException
          .mockRejectedValueOnce(
            new Error(
              'Crashlytics unavailable'
            )
          );

        await expect(
          service.report(
            new Error(
              'Original error'
            ),
            {
              source:
                'global'
            }
          )
        ).resolves.toBeUndefined();
      }
    );


    it(
      'keeps technical correlation context and removes identifiers from paths',
      async () => {

        await service.report(
          new Error(
            'Server unavailable'
          ),
          {
            source:
              'http',

            route:
              '/entrenar/550e8400-e29b-41d4-a716-446655440000?tab=sets',

            endpoint:
              '/api/v1/workouts/550e8400-e29b-41d4-a716-446655440000?token=secret',

            method:
              'patch',

            status:
              503,

            requestId:
              'server-request-123'
          }
        );

        const options =
          crashlytics.recordException
            .mock.calls[0][0];

        expect(
          options.keysAndValues
        ).toEqual([
          {
            key:
              'source',
            value:
              'http',
            type:
              'string'
          },
          {
            key:
              'route',
            value:
              '/entrenar/:id',
            type:
              'string'
          },
          {
            key:
              'endpoint',
            value:
              '/api/v1/workouts/:id',
            type:
              'string'
          },
          {
            key:
              'method',
            value:
              'PATCH',
            type:
              'string'
          },
          {
            key:
              'status',
            value:
              503,
            type:
              'int'
          },
          {
            key:
              'request_id',
            value:
              'server-request-123',
            type:
              'string'
          }
        ]);
      }
    );


    it(
      'redacts credentials, email, UUIDs and query values from messages',
      async () => {

        await service.report(
          (
            'Failed for athlete@example.com '
            + '550e8400-e29b-41d4-a716-446655440000 '
            + 'Bearer abcdefghijklmnopqrstuvwxyz '
            + '?access_token=my-secret'
          ),
          {
            source:
              'manual'
          }
        );

        const message =
          crashlytics.recordException
            .mock.calls[0][0]
            .message;

        expect(message)
          .toContain('[email]');

        expect(message)
          .toContain('[id]');

        expect(message)
          .toContain(
            'Bearer [redacted]'
          );

        expect(message)
          .toContain(
            '?access_token=[redacted]'
          );

        expect(message)
          .not.toContain(
            'athlete@example.com'
          );

        expect(message)
          .not.toContain(
            '550e8400-e29b-41d4-a716-446655440000'
          );

        expect(message)
          .not.toContain(
            'my-secret'
          );
      }
    );


    it(
      'sanitizes breadcrumbs before sending them',
      async () => {

        await service.breadcrumb(
          'Opened workout for athlete@example.com'
        );

        expect(
          crashlytics.log
        ).toHaveBeenCalledWith({
          message:
            'Opened workout for [email]'
        });
      }
    );

    it(
      'reports the same error object only once',
      async () => {

        const error =
          new Error(
            'Duplicated failure'
          );

        await service.report(
          error,
          {
            source:
              'http'
          }
        );

        await service.report(
          error,
          {
            source:
              'angular_global'
          }
        );

        expect(
          crashlytics.recordException
        ).toHaveBeenCalledTimes(1);
      }
    );


    it(
      'allows a retry when Crashlytics itself failed',
      async () => {

        const error =
          new Error(
            'Retryable failure'
          );

        crashlytics.recordException
          .mockRejectedValueOnce(
            new Error(
              'Crashlytics unavailable'
            )
          );

        await service.report(
          error,
          {
            source:
              'http'
          }
        );

        await service.report(
          error,
          {
            source:
              'angular_global'
          }
        );

        expect(
          crashlytics.recordException
        ).toHaveBeenCalledTimes(2);
      }
    );


    it(
      'never sends the original HTTP error message',
      async () => {

        const error =
          new Error(
            'Http failure for https://api.test/workouts/'
            + '550e8400-e29b-41d4-a716-446655440000'
            + '?email=private@example.com'
          );

        await service.report(
          error,
          {
            source:
              'http',

            endpoint:
              '/workouts/'
              + '550e8400-e29b-41d4-a716-446655440000',

            method:
              'GET',

            status:
              503
          }
        );

        const options =
          crashlytics.recordException
            .mock.calls[0][0];

        expect(
          options.message
        ).toBe(
          'HTTP request failed (503)'
        );

        expect(
          options.message
        ).not.toContain(
          'private@example.com'
        );

        expect(
          options.message
        ).not.toContain(
          '550e8400-e29b-41d4-a716-446655440000'
        );
      }
    );

  }
);
