import {
  ApplicationConfig,
  ErrorHandler,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  provideHttpClient,
  withInterceptors
} from '@angular/common/http';

import { routes } from './app.routes';
import { AptusErrorHandler } from './core/aptus-error-handler';
import { errorReportingInterceptor } from './core/error-reporting.interceptor';

import localeEs from '@angular/common/locales/es';

import {
  registerLocaleData
} from '@angular/common';

registerLocaleData(
  localeEs
);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: AptusErrorHandler },
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([
        errorReportingInterceptor
      ])
    ),
    {
      provide: LOCALE_ID,
      useValue: 'es-ES'
    }
  ]
};