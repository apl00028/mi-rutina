import {
  ErrorHandler,
  Injectable
} from '@angular/core';

import {
  Router
} from '@angular/router';

import {
  ErrorReportingService
} from './error-reporting.service';


@Injectable()
export class AptusErrorHandler
  implements ErrorHandler {

  constructor(
    private readonly reporting:
      ErrorReportingService,

    private readonly router:
      Router
  ) {}


  handleError(
    error: unknown
  ): void {

    try {
      void this.reporting.report(
        error,
        {
          source:
            'angular_global',

          route:
            this.router.url
        }
      );
    } catch {
      /*
       * Error handling must never create
       * another application error.
       */
    }

    console.error(error);
  }
}
