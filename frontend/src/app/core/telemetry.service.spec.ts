import {
  provideHttpClient
} from '@angular/common/http';

import {
  provideHttpClientTesting,
  HttpTestingController
} from '@angular/common/http/testing';

import {
  TestBed
} from '@angular/core/testing';

import {
  describe,
  expect,
  it,
  beforeEach,
  vi
} from 'vitest';

import {
  AuthService
} from './auth.service';

import {
  TelemetryService
} from './telemetry.service';

import {
  environment
} from '../../environments/environment';


describe(
  'TelemetryService',
  () => {

    let service:
      TelemetryService;

    let http:
      HttpTestingController;

    let getAccessToken:
      ReturnType<typeof vi.fn>;


    beforeEach(() => {
      getAccessToken =
        vi.fn()
          .mockResolvedValue(
            'test-token'
          );

      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide:
              AuthService,
            useValue: {
              getAccessToken
            }
          }
        ]
      });

      service =
        TestBed.inject(
          TelemetryService
        );

      http =
        TestBed.inject(
          HttpTestingController
        );
    });


    it(
      'records a page view with authentication',
      async () => {

        const promise =
          service.pageView(
            '/salud'
          );

        await Promise.resolve();

        const request =
          http.expectOne(
            (
              `${environment.apiUrl}`
              + '/telemetry/events'
            )
          );

        expect(
          request.request.method
        ).toBe('POST');

        expect(
          request.request.headers.get(
            'Authorization'
          )
        ).toBe(
          'Bearer test-token'
        );

        expect(
          request.request.body
            .event_name
        ).toBe(
          'page_view'
        );

        expect(
          request.request.body.route
        ).toBe(
          '/salud'
        );

        expect(
          request.request.body
            .app_version
        ).toBe(
          environment.appVersion
        );

        expect(
          request.request.body.metadata
        ).toEqual({});

        request.flush(
          null,
          {
            status: 204,
            statusText:
              'No Content'
          }
        );

        await promise;

        http.verify();
      }
    );


    it(
      'removes query parameters and fragments',
      async () => {

        const promise =
          service.pageView(
            '/salud?tab=peso#chart'
          );

        await Promise.resolve();

        const request =
          http.expectOne(
            (
              `${environment.apiUrl}`
              + '/telemetry/events'
            )
          );

        expect(
          request.request.body.route
        ).toBe(
          '/salud'
        );

        request.flush(
          null,
          {
            status: 204,
            statusText:
              'No Content'
          }
        );

        await promise;

        http.verify();
      }
    );


    it(
      'does nothing without an access token',
      async () => {

        getAccessToken
          .mockResolvedValue(
            null
          );

        await service.pageView(
          '/salud'
        );

        http.expectNone(
          (
            `${environment.apiUrl}`
            + '/telemetry/events'
          )
        );

        http.verify();
      }
    );


    it(
      'does not propagate telemetry failures',
      async () => {

        const promise =
          service.pageView(
            '/salud'
          );

        await Promise.resolve();

        const request =
          http.expectOne(
            (
              `${environment.apiUrl}`
              + '/telemetry/events'
            )
          );

        request.flush(
          {
            detail:
              'Telemetry unavailable'
          },
          {
            status: 500,
            statusText:
              'Server Error'
          }
        );

        await expect(
          promise
        ).resolves.toBeUndefined();

        http.verify();
      }
    );
  }
);
