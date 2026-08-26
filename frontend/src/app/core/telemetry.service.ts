import {
  Injectable
} from '@angular/core';

import {
  HttpClient,
  HttpHeaders
} from '@angular/common/http';

import {
  firstValueFrom
} from 'rxjs';

import {
  Capacitor
} from '@capacitor/core';

import {
  AuthService
} from './auth.service';

import {
  environment
} from '../../environments/environment';


export type TelemetryEventName =
  | 'page_view'
  | 'workout_started'
  | 'workout_completed'
  | 'coach_request'
  | 'health_connect_read'
  | 'health_connect_error';


interface TelemetryEvent {
  event_name: TelemetryEventName;
  route?: string;
  platform?: string;
  app_version?: string;
  metadata?: Record<
    string,
    string | number | boolean | null
  >;
}


@Injectable({
  providedIn: 'root'
})
export class TelemetryService {

  private readonly apiUrl =
    environment.apiUrl;


  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}


  async track(
    event: TelemetryEvent
  ): Promise<void> {

    try {
      const token =
        await this.auth.getAccessToken();

      if (!token) {
        return;
      }

      const headers =
        new HttpHeaders({
          Authorization:
            `Bearer ${token}`
        });

      await firstValueFrom(
        this.http.post<void>(
          `${this.apiUrl}/telemetry/events`,
          {
            ...event,

            platform:
              event.platform ??
              Capacitor.getPlatform(),

            app_version:
              event.app_version ??
              environment.appVersion,

            metadata:
              event.metadata ?? {}
          },
          {
            headers
          }
        )
      );

    } catch {
      /*
       * Telemetry must never affect the
       * user's normal Aptus experience.
       */
    }
  }


  async pageView(
    route: string
  ): Promise<void> {

    const safeRoute =
      route
        .split('?')[0]
        .split('#')[0];

    await this.track({
      event_name:
        'page_view',

      route:
        safeRoute
    });
  }
}
