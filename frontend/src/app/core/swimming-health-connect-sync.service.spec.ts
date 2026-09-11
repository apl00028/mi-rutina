import {
  signal
} from '@angular/core';

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


const lifecycle =
  vi.hoisted(
    () => ({
      addListener:
        vi.fn(),

      getState:
        vi.fn()
    })
  );


vi.mock(
  '@capacitor/app',
  () => ({
    App: lifecycle
  })
);


import {
  AuthService
} from './auth.service';

import {
  HealthConnectAccountService
} from './health-connect-account.service';

import {
  SwimmingHealthConnectSyncService,
  SWIMMING_HEALTH_CONNECT
} from './swimming-health-connect-sync.service';


describe(
  'Swimming Health Connect synchronization',
  () => {

    const user =
      signal<
        { id: string }
        | null
      >({
        id: 'athlete-a'
      });


    const connection = {
      revision:
        signal(0),

      enabled:
        vi.fn()
    };


    const auth = {
      user,

      getAccessToken:
        vi.fn()
    };


    const native = {
      permissionStatus:
        vi.fn(),

      readGarminSwimmingMetrics:
        vi.fn()
    };


    const remove =
      vi.fn();


    let state:
      (
        value: {
          isActive: boolean
        }
      ) => void;


    let service:
      SwimmingHealthConnectSyncService;


    const swimmingSession = {
      startTime:
        '2026-09-09T15:52:00Z',

      endTime:
        '2026-09-09T16:40:00Z',

      durationSeconds:
        2880,

      segmentCount:
        1,

      segmentRepetitions:
        500,

      distanceMeters:
        1000,

      distanceRecordCount:
        1,

      rawDistanceTotalMeters:
        1000,

      distanceRecords: [],

      heartRateAverageBpm:
        130,

      heartRateMaxBpm:
        155,

      heartRateSampleCount:
        100,

      speedSampleCount:
        50,

      speedAverageMetersPerSecond:
        0.35,

      speedMaxMetersPerSecond:
        0.9,

      paceSecondsPer100mFromSpeed:
        285
    };


    async function settle():
      Promise<void> {

      TestBed.tick();

      for (
        let i = 0;
        i < 20;
        i += 1
      ) {
        await Promise.resolve();
      }

      TestBed.tick();

      for (
        let i = 0;
        i < 20;
        i += 1
      ) {
        await Promise.resolve();
      }
    }


    beforeEach(() => {

      vi.useFakeTimers();
      vi.clearAllMocks();

      user.set({
        id: 'athlete-a'
      });

      connection
        .enabled
        .mockResolvedValue(
          true
        );

      auth
        .getAccessToken
        .mockResolvedValue(
          'access-token'
        );

      native
        .permissionStatus
        .mockResolvedValue({
          exercise: true,
          distance: true,
          speed: true,
          heartRate: true
        });

      native
        .readGarminSwimmingMetrics
        .mockResolvedValue({
          sourcePackage:
            'com.garmin.android.apps.connectmobile',

          lookbackDays:
            30,

          count:
            1,

          sessions: [
            swimmingSession
          ]
        });


      vi.spyOn(
        Capacitor,
        'isNativePlatform'
      ).mockReturnValue(
        true
      );

      vi.spyOn(
        Capacitor,
        'getPlatform'
      ).mockReturnValue(
        'android'
      );


      remove.mockResolvedValue(
        undefined
      );


      lifecycle
        .addListener
        .mockImplementation(
          async (
            _name,
            callback
          ) => {

            state = callback;

            return {
              remove
            };
          }
        );


      lifecycle
        .getState
        .mockResolvedValue({
          isActive: true
        });


      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () => ({
            ok: true
          })
        )
      );


      TestBed
        .configureTestingModule({
          providers: [
            {
              provide:
                AuthService,

              useValue:
                auth
            },

            {
              provide:
                HealthConnectAccountService,

              useValue:
                connection
            },

            {
              provide:
                SWIMMING_HEALTH_CONNECT,

              useValue:
                native
            }
          ]
        });


      service =
        TestBed.inject(
          SwimmingHealthConnectSyncService
        );
    });


    afterEach(() => {

      service.stop();

      vi.unstubAllGlobals();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });


    it(
      'automatically persists swimming when this Aptus account is connected',
      async () => {

        service.start();

        await settle();

        expect(
          native
            .readGarminSwimmingMetrics
        ).toHaveBeenCalledTimes(
          1
        );

        const fetchMock =
          vi.mocked(fetch);

        expect(
          fetchMock
        ).toHaveBeenCalledTimes(
          1
        );

        const [
          url,
          options
        ] =
          fetchMock.mock.calls[0];

        expect(
          String(url)
        ).toContain(
          '/swimming/sync-health-connect'
        );

        const body =
          JSON.parse(
            String(
              options?.body
            )
          );

        expect(
          body.sessions
        ).toHaveLength(
          1
        );

        expect(
          body.sessions[0]
            .startTime
        ).toBe(
          swimmingSession
            .startTime
        );
      }
    );


    it(
      'does not read or persist swimming for a disconnected Aptus account',
      async () => {

        connection
          .enabled
          .mockResolvedValue(
            false
          );

        service.start();

        await settle();

        expect(
          connection.enabled
        ).toHaveBeenCalled();

        expect(
          native
            .permissionStatus
        ).not.toHaveBeenCalled();

        expect(
          native
            .readGarminSwimmingMetrics
        ).not.toHaveBeenCalled();

        expect(
          fetch
        ).not.toHaveBeenCalled();
      }
    );


    it(
      'starts swimming sync after the current account explicitly connects',
      async () => {

        connection
          .enabled
          .mockResolvedValue(
            false
          );

        service.start();

        await settle();

        expect(
          native
            .readGarminSwimmingMetrics
        ).not.toHaveBeenCalled();

        connection
          .enabled
          .mockResolvedValue(
            true
          );

        connection
          .revision
          .update(
            value =>
              value + 1
          );

        await settle();

        expect(
          native
            .readGarminSwimmingMetrics
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          fetch
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    it(
      'does not resume swimming sync after logout',
      async () => {

        service.start();

        await settle();

        native
          .readGarminSwimmingMetrics
          .mockClear();

        vi.mocked(fetch)
          .mockClear();

        user.set(null);

        await settle();

        state({
          isActive: false
        });

        await settle();

        state({
          isActive: true
        });

        await settle();

        expect(
          native
            .readGarminSwimmingMetrics
        ).not.toHaveBeenCalled();

        expect(
          fetch
        ).not.toHaveBeenCalled();
      }
    );
  }
);
