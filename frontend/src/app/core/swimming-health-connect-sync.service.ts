import {
  computed,
  effect,
  EffectRef,
  Inject,
  Injectable,
  InjectionToken,
  Injector,
  OnDestroy,
  signal,
  untracked
} from '@angular/core';

import {
  App as NativeApp
} from '@capacitor/app';

import {
  Capacitor,
  PluginListenerHandle
} from '@capacitor/core';

import {
  AuthService
} from './auth.service';

import {
  HealthConnect,
  hasSwimmingHealthConnectPermissions
} from './health-connect.plugin';

import type {
  HealthConnectSwimmingMetricSession
} from './health-connect.plugin';

import {
  HealthConnectAccountService
} from './health-connect-account.service';

import {
  environment
} from '../../environments/environment';


type SwimmingNative =
  Pick<
    typeof HealthConnect,
    'permissionStatus'
    | 'readGarminSwimmingMetrics'
  >;


export const SWIMMING_HEALTH_CONNECT =
  new InjectionToken<SwimmingNative>(
    'SWIMMING_HEALTH_CONNECT',
    {
      providedIn: 'root',

      factory: () => ({
        permissionStatus:
          () =>
            HealthConnect
              .permissionStatus(),

        readGarminSwimmingMetrics:
          () =>
            HealthConnect
              .readGarminSwimmingMetrics()
      })
    }
  );



@Injectable({
  providedIn: 'root'
})
export class SwimmingHealthConnectSyncService
  implements OnDestroy {

  private listener?:
    PluginListenerHandle;

  private authEffect?:
    EffectRef;

  private foreground =
    signal(false);

  private lifecycle = 0;
  private generation = 0;

  private flight:
    Promise<void> | null = null;


  constructor(
    private auth: AuthService,
    private connection:
      HealthConnectAccountService,
    private injector: Injector,

        @Inject(
          SWIMMING_HEALTH_CONNECT
        )
        private native:
          SwimmingNative
  ) {}


  supported(): boolean {
    return (
      Capacitor.isNativePlatform()
      && Capacitor.getPlatform() ===
        'android'
    );
  }


  start(): void {
    if (
      !this.supported()
      || this.authEffect
    ) {
      return;
    }

    const lifecycle =
      ++this.lifecycle;

    const authenticatedUserId =
      computed(
        () => this.auth.user()?.id
      );

    this.authEffect =
      effect(
        () => {
          const userId =
            authenticatedUserId();

          const active =
            this.foreground();

          this.connection.revision();

          const generation =
            ++this.generation;

          if (!userId || !active) {
            return;
          }

          untracked(
            () => {
              void this.sync(
                generation
              );
            }
          );
        },
        {
          injector:
            this.injector
        }
      );

    void this.listen(
      lifecycle
    );
  }


  private async listen(
    lifecycle: number
  ): Promise<void> {

    try {
      const listener =
        await NativeApp.addListener(
          'appStateChange',
          ({ isActive }) => {
            if (
              lifecycle !==
              this.lifecycle
            ) {
              return;
            }

            if (
              this.foreground() ===
              isActive
            ) {
              return;
            }

            ++this.generation;

            this.foreground.set(
              isActive
            );
          }
        );

      if (
        lifecycle !== this.lifecycle
      ) {
        await listener.remove();
        return;
      }

      this.listener = listener;

      const state =
        await NativeApp.getState();

      if (
        lifecycle === this.lifecycle
      ) {
        this.foreground.set(
          state.isActive
        );
      }

    } catch {
      // Native lifecycle errors must
      // not block navigation.
    }
  }


  async sync(
    expectedGeneration?:
      number
  ): Promise<void> {

    if (!this.supported()) {
      return;
    }

    if (this.flight) {
      await this.flight;
      return;
    }

    const userId =
      this.auth.user()?.id;

    if (!userId) {
      return;
    }

    const generation =
      expectedGeneration
      ?? this.generation;

    this.flight =
      this.run(
        userId,
        generation
      )
      .finally(
        () => {
          this.flight = null;
        }
      );

    await this.flight;
  }


  private async run(
    userId: string,
    generation: number
  ): Promise<void> {

    const current = () =>
      this.auth.user()?.id ===
        userId
      && this.generation ===
        generation;

    try {
      const connected =
        await this.connection
          .enabled();

      if (
        !connected
        || !current()
      ) {
        return;
      }

      const permissions =
        await this.native
              .permissionStatus();

      if (
        !current()
        || !hasSwimmingHealthConnectPermissions(
          permissions
        )
      ) {
        return;
      }

      const result =
        await this.native
              .readGarminSwimmingMetrics();

      if (!current()) {
        return;
      }

      if (
        result.sessions.length === 0
      ) {
        return;
      }

      const sessions =
        result.sessions.map(
          session =>
            this.toPayload(
              result.sourcePackage,
              session
            )
        );

      const token =
        await this.auth
          .getAccessToken();

      if (
        !token
        || !current()
      ) {
        return;
      }

      const response =
        await fetch(
          `${environment.apiUrl}/swimming/sync-health-connect`,
          {
            method: 'POST',
            headers: {
              Authorization:
                `Bearer ${token}`,
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify({
                sessions
              })
          }
        );

      if (!response.ok) {
        throw new Error(
          `Swimming Health Connect sync failed: ${response.status}`
        );
      }

    } catch {
      // A future foreground/resume
      // retries automatically.
    }
  }


  private toPayload(
    sourcePackage: string,
    session:
      HealthConnectSwimmingMetricSession
  ) {
    return {
      sourcePackage,

      startTime:
        session.startTime,

      endTime:
        session.endTime,

      durationSeconds:
        session.durationSeconds,

      segmentCount:
        session.segmentCount
        ?? 0,

      segmentRepetitions:
        session.segmentRepetitions
        ?? 0,

      distanceMeters:
        session.distanceMeters,

      distanceRecordCount:
        session.distanceRecordCount
        ?? 0,

      rawDistanceTotalMeters:
        session.rawDistanceTotalMeters
        ?? session.distanceMeters
        ?? 0,

      distanceRecords:
        session.distanceRecords
        ?? [],

      heartRateAverageBpm:
        session.heartRateAverageBpm,

      heartRateMaxBpm:
        session.heartRateMaxBpm,

      heartRateSampleCount:
        session.heartRateSampleCount
        ?? 0,

      speedSampleCount:
        session.speedSampleCount
        ?? 0,

      speedAverageMetersPerSecond:
        session
          .speedAverageMetersPerSecond,

      speedMaxMetersPerSecond:
        session
          .speedMaxMetersPerSecond,

      paceSecondsPer100mFromSpeed:
        session
          .paceSecondsPer100mFromSpeed
    };
  }


  stop(): void {
    ++this.lifecycle;
    ++this.generation;

    this.authEffect?.destroy();
    this.authEffect = undefined;

    const listener =
      this.listener;

    this.listener = undefined;

    if (listener) {
      void listener
        .remove()
        .catch(
          () => undefined
        );
    }

    this.foreground.set(false);
  }


  ngOnDestroy(): void {
    this.stop();
  }
}
