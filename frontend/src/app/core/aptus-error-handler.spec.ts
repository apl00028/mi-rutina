import {
  TestBed
} from '@angular/core/testing';

import {
  Router
} from '@angular/router';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  AptusErrorHandler
} from './aptus-error-handler';

import {
  ErrorReportingService
} from './error-reporting.service';


describe(
  'AptusErrorHandler',
  () => {

    const report =
      vi.fn();

    let handler:
      AptusErrorHandler;

    let consoleError:
      ReturnType<typeof vi.spyOn>;


    beforeEach(() => {
      vi.clearAllMocks();

      report.mockResolvedValue(
        undefined
      );

      consoleError =
        vi.spyOn(
          console,
          'error'
        ).mockImplementation(
          () => undefined
        );

      TestBed.configureTestingModule({
        providers: [
          AptusErrorHandler,
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

      handler =
        TestBed.inject(
          AptusErrorHandler
        );
    });


    afterEach(() => {
      vi.restoreAllMocks();
    });


    it(
      'reports unexpected Angular errors with the current route',
      () => {

        const error =
          new Error(
            'Unexpected failure'
          );

        handler.handleError(
          error
        );

        expect(report)
          .toHaveBeenCalledExactlyOnceWith(
            error,
            {
              source:
                'angular_global',

              route:
                '/entrenar?tab=actual'
            }
          );

        expect(consoleError)
          .toHaveBeenCalledWith(
            error
          );
      }
    );


    it(
      'does not propagate a synchronous reporting failure',
      () => {

        report.mockImplementationOnce(
          () => {
            throw new Error(
              'Reporter failed'
            );
          }
        );

        expect(
          () => handler.handleError(
            new Error(
              'Original failure'
            )
          )
        ).not.toThrow();

        expect(consoleError)
          .toHaveBeenCalledTimes(1);
      }
    );
  }
);
