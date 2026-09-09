import {
  provideHttpClient,
  withInterceptors
} from '@angular/common/http';

import {
  HttpClient
} from '@angular/common/http';

import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';

import {
  TestBed
} from '@angular/core/testing';

import {
  Router
} from '@angular/router';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  firstValueFrom
} from 'rxjs';

import {
  ErrorReportingService
} from './error-reporting.service';

import {
  errorReportingInterceptor
} from './error-reporting.interceptor';

import {
  environment
} from '../../environments/environment';


describe(
  'errorReportingInterceptor',
  () => {

    const report =
      vi.fn()
        .mockResolvedValue(
          undefined
        );

    let client:
      HttpClient;

    let http:
      HttpTestingController;


    beforeEach(() => {
      vi.clearAllMocks();

      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(
            withInterceptors([
              errorReportingInterceptor
            ])
          ),

          provideHttpClientTesting(),

          {
            provide:
              ErrorReportingService,

            useValue: {
              report
            }
          },

          {
            provide:
              Router,

            useValue: {
              url:
                '/entrenar?tab=actual'
            }
          }
        ]
      });

      client =
        TestBed.inject(
          HttpClient
        );

      http =
        TestBed.inject(
          HttpTestingController
        );
    });


    it(
      'reports Aptus server errors with request correlation data',
      async () => {

        const url =
          (
            `${environment.apiUrl}`
            + '/workouts/'
            + '550e8400-e29b-41d4-a716-446655440000'
          );

        const promise =
          firstValueFrom(
            client.patch(
              url,
              {
                ignored:
                  'payload'
              }
            )
          );

        const request =
          http.expectOne(url);

        request.flush(
          {
            ignored:
              'response body'
          },
          {
            status:
              503,

            statusText:
              'Unavailable',

            headers: {
              'X-Request-ID':
                'request-123'
            }
          }
        );

        await expect(
          promise
        ).rejects.toMatchObject({
          status:
            503
        });

        expect(report)
          .toHaveBeenCalledTimes(1);

        const [
          error,
          context
        ] =
          report.mock.calls[0];

        expect(error.status)
          .toBe(503);

        expect(context)
          .toEqual({
            source:
              'http',

            route:
              '/entrenar?tab=actual',

            endpoint:
              (
                '/workouts/'
                + '550e8400-e29b-41d4-a716-446655440000'
              ),

            method:
              'PATCH',

            status:
              503,

            requestId:
              'request-123'
          });

        expect(
          JSON.stringify(
            context
          )
        ).not.toContain(
          'payload'
        );

        expect(
          JSON.stringify(
            context
          )
        ).not.toContain(
          'response body'
        );
      }
    );


    it(
      'reports Aptus network failures',
      async () => {

        const url =
          `${environment.apiUrl}/workouts`;

        const promise =
          firstValueFrom(
            client.get(url)
          );

        const request =
          http.expectOne(url);

        request.error(
          new ProgressEvent(
            'error'
          )
        );

        await expect(
          promise
        ).rejects.toMatchObject({
          status:
            0
        });

        expect(report)
          .toHaveBeenCalledTimes(1);

        expect(
          report.mock.calls[0][1]
        ).toMatchObject({
          source:
            'http',

          endpoint:
            '/workouts',

          method:
            'GET',

          status:
            0
        });
      }
    );


    it(
      'does not report expected client errors',
      async () => {

        const url =
          `${environment.apiUrl}/workouts`;

        const promise =
          firstValueFrom(
            client.get(url)
          );

        http.expectOne(url)
          .flush(
            null,
            {
              status:
                404,

              statusText:
                'Not Found'
            }
          );

        await expect(
          promise
        ).rejects.toMatchObject({
          status:
            404
        });

        expect(report)
          .not.toHaveBeenCalled();
      }
    );


    it(
      'does not report failures from external URLs',
      async () => {

        const url =
          'https://example.test/data';

        const promise =
          firstValueFrom(
            client.get(url)
          );

        http.expectOne(url)
          .flush(
            null,
            {
              status:
                503,

              statusText:
                'Unavailable'
            }
          );

        await expect(
          promise
        ).rejects.toMatchObject({
          status:
            503
        });

        expect(report)
          .not.toHaveBeenCalled();
      }
    );
  }
);
