import {
  inject
} from '@angular/core';

import {
  HttpErrorResponse,
  HttpInterceptorFn
} from '@angular/common/http';

import {
  Router
} from '@angular/router';

import {
  catchError,
  throwError
} from 'rxjs';

import {
  ErrorReportingService
} from './error-reporting.service';

import {
  environment
} from '../../environments/environment';


export const errorReportingInterceptor:
  HttpInterceptorFn =
  (request, next) => {

    const reporting =
      inject(
        ErrorReportingService
      );

    const router =
      inject(
        Router
      );

    return next(request).pipe(
      catchError(
        (error: unknown) => {

          const isAptusApi =
            request.url.startsWith(
              environment.apiUrl
            );

          if (
            isAptusApi
            && error instanceof
              HttpErrorResponse
            && (
              error.status === 0
              || error.status >= 500
            )
          ) {
            const endpoint =
              request.url
                .slice(
                  environment.apiUrl.length
                )
                || '/';

            void reporting.report(
              error,
              {
                source:
                  'http',

                route:
                  router.url,

                endpoint,

                method:
                  request.method,

                status:
                  error.status,

                requestId:
                  error.headers.get(
                    'X-Request-ID'
                  ) ?? undefined
              }
            );
          }

          return throwError(
            () => error
          );
        }
      )
    );
  };
