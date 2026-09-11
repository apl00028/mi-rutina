import { RunningHealthConnectSyncService, RUNNING_HEALTH_CONNECT } from '../../core/running-health-connect-sync.service';
/**
 * @vitest-environment jsdom
 */

import {
  TestBed
} from '@angular/core/testing';
import {
  HttpClient
} from '@angular/common/http';
import {
  ActivatedRoute,
  Router
} from '@angular/router';
import {
  of,
  throwError
} from 'rxjs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import {
  Capacitor
} from '@capacitor/core';

import {
  AuthService
} from '../../core/auth.service';

import {
  HealthConnectAccountService
} from '../../core/health-connect-account.service';
import type {
  HealthConnectRunningMetricSession
} from '../../core/health-connect.plugin';
import { RunningService, PersistedRunningSession } from '../../core/running.service';
import {
  ENDURANCE_HEALTH_CONNECT,
  Endurance
} from './endurance';


const healthConnect = {
  readGarminSwimmingMetrics:
    vi.fn(),
  readGarminRunningMetrics:
    vi.fn()
};


describe('Endurance swimming integration', () => {
  const activatedRoute = {
    snapshot: {
      data: {
        discipline: 'swimming'
      }
    }
  };

  const http = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn()
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    healthConnect
      .readGarminSwimmingMetrics
      .mockReset();
    healthConnect
      .readGarminRunningMetrics
      .mockReset();
    activatedRoute.snapshot.data.discipline =
      'swimming';
    vi.spyOn(
      console,
      'info'
    ).mockImplementation(
      () => undefined
    );
    vi.spyOn(
      console,
      'error'
    ).mockImplementation(
      () => undefined
    );

    await TestBed.configureTestingModule({
      imports: [
        Endurance
      ],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: activatedRoute
        },
        {
          provide: Router,
          useValue: {
            navigateByUrl: vi.fn()
          }
        },
        {
          provide: HttpClient,
          useValue: http
        },
        {
          provide: AuthService,
          useValue: {
            user: () => ({ id: 'athlete' }),
            getAccessToken:
              vi.fn(async () => 'token')
          }
        },
        {
          provide: ENDURANCE_HEALTH_CONNECT,
          useValue: healthConnect
        }
      ]
    }).compileComponents();
  });


  afterEach(() => {
    vi.restoreAllMocks();
  });


  async function flushPromises():
    Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }


  function healthConnectSwimmingSession(
    overrides: Record<string, unknown> = {}
  ) {
    return {
      startTime:
        '2026-09-02T07:00:00Z',
      endTime:
        '2026-09-02T07:42:00Z',
      durationSeconds:
        2520,
      segmentCount:
        2,
      segmentRepetitions:
        612,
      distanceMeters:
        950,
      distanceRecordCount:
        1,
      rawDistanceTotalMeters:
        950,
      distanceRecords: [
        {
          startTime:
            '2026-09-02T07:00:00Z',
          endTime:
            '2026-09-02T07:42:00Z',
          durationSeconds:
            2520,
          distanceMeters:
            950
        }
      ],
      heartRateAverageBpm:
        132,
      heartRateMaxBpm:
        156,
      heartRateSampleCount:
        120,
      speedSampleCount:
        60,
      speedAverageMetersPerSecond:
        0.47,
      speedMaxMetersPerSecond:
        1.1,
      paceSecondsPer100mFromSpeed:
        212.7,
      ...overrides
    };
  }


  function mockAndroidHealthConnectSwimming(
    sessions = [
      healthConnectSwimmingSession()
    ]
  ) {
    vi.spyOn(
      Capacitor,
      'isNativePlatform'
    ).mockReturnValue(true);
    vi.spyOn(
      Capacitor,
      'getPlatform'
    ).mockReturnValue('android');

    healthConnect
      .readGarminSwimmingMetrics
      .mockResolvedValue({
        sourcePackage:
          'com.garmin.android.apps.connectmobile',
        lookbackDays: 30,
        count: sessions.length,
        sessions
      });

    http.get.mockReturnValue(
      of([])
    );
  }


  it('preserves unedited sessions when saving the active routine', async () => {
    const fixture =
      TestBed.createComponent(
        Endurance
      );

    const component =
      fixture.componentInstance;

    const stored = {
      routineId: 'swim-routine',
      schemaVersion: '4.2',
      revision: 3,
      discipline: 'swimming',
      sessions: [
        {
          sessionId: 'today',
          title: 'Hoy'
        },
        {
          sessionId: 'next',
          title: 'Próxima sesión'
        }
      ]
    };

    component.activeSwimmingRoutineRecord.set(
      stored
    );
    component.swimmingRoutineDraft.set({
      id: 'today',
      date: '2026-08-29',
      title: 'Hoy editada',
      objective: 'Técnica',
      poolLengthMeters: 25,
      estimatedDurationMinutes: 45,
      blocks: [
        {
          id: 'main',
          type: 'main',
          title: 'Principal',
          sets: [
            {
              repetitions: 4,
              distanceMeters: 100,
              stroke: 'freestyle',
              workType: 'swim',
              intensity: 'controlled',
              restSeconds: 20
            }
          ]
        }
      ],
      technicalFocus: []
    });

    http.put.mockImplementation(
      (_url, payload) => of(payload)
    );

    await component.saveSwimmingRoutine();

    const payload =
      http.put.mock.calls[0][1];

    expect(payload.sessions).toHaveLength(2);
    expect(payload.sessions[0].title)
      .toBe('Hoy editada');
    expect(payload.sessions[1])
      .toEqual(stored.sessions[1]);
  });


  it('keeps persisted FIT sessions when Health Connect fails', async () => {
    const fixture =
      TestBed.createComponent(
        Endurance
      );

    vi.spyOn(
      Capacitor,
      'isNativePlatform'
    ).mockReturnValue(true);
    vi.spyOn(
      Capacitor,
      'getPlatform'
    ).mockReturnValue('android');
    healthConnect
      .readGarminSwimmingMetrics
      .mockRejectedValue(
        new Error(
          'Health Connect unavailable'
        )
      );

    http.get.mockReturnValue(
      of([
        {
          start_time:
            '2026-08-27T08:00:00Z',
          pool_length_meters: 25,
          distance_meters: 1200,
          total_timer_time_seconds: 2400,
          total_strokes: 758,
          lengths: []
        }
      ])
    );

    await fixture.componentInstance
      .loadSwimming();

    expect(
      fixture.componentInstance
        .swimmingError()
    ).toBeNull();
    expect(
      fixture.componentInstance
        .swimmingSessions()
    ).toHaveLength(1);
    expect(
      fixture.componentInstance
        .swimmingSessions()[0]
      .fitEnriched
    ).toBe(true);
  });


  it('syncs Health Connect swimming after reading sessions', async () => {
    const fixture =
      TestBed.createComponent(
        Endurance
      );

    mockAndroidHealthConnectSwimming([
      healthConnectSwimmingSession({
        startTime:
          '2026-09-02T15:50:45Z',
        endTime:
          '2026-09-02T16:29:08.868Z',
        durationSeconds:
          2303.868,
        distanceMeters:
          1225,
        rawDistanceTotalMeters:
          1225
      }),
      healthConnectSwimmingSession({
        startTime:
          '2026-08-27T08:00:00Z',
        endTime:
          '2026-08-27T08:40:00Z',
        durationSeconds:
          2400,
        distanceMeters:
          1200,
        rawDistanceTotalMeters:
          1200
      }),
      healthConnectSwimmingSession({
        startTime:
          '2026-08-25T08:00:00Z',
        endTime:
          '2026-08-25T08:42:00Z',
        durationSeconds:
          2520,
        distanceMeters:
          950,
        rawDistanceTotalMeters:
          950
      })
    ]);
    http.post.mockReturnValue(
      of({
        synced: 3
      })
    );

    await fixture.componentInstance
      .loadSwimming();
    await flushPromises();

    expect(console.info)
      .toHaveBeenCalledWith(
        '[Aptus swimming sync] start',
        {
          count: 3
        }
      );

    expect(http.post)
      .toHaveBeenCalledWith(
        expect.stringContaining(
          '/swimming/sync-health-connect'
        ),
        {
          sessions: [
            expect.objectContaining({
              sourcePackage:
                'com.garmin.android.apps.connectmobile',
              startTime:
                '2026-09-02T15:50:45Z',
              endTime:
                '2026-09-02T16:29:08.868Z',
              durationSeconds:
                2303.868,
              distanceMeters:
                1225
            }),
            expect.objectContaining({
              startTime:
                '2026-08-27T08:00:00Z',
              distanceMeters:
                1200
            }),
            expect.objectContaining({
              startTime:
                '2026-08-25T08:00:00Z',
              durationSeconds:
                2520,
              segmentCount:
                2,
              segmentRepetitions:
                612,
              distanceMeters:
                950,
              distanceRecordCount:
                1,
              rawDistanceTotalMeters:
                950,
              heartRateAverageBpm:
                132,
              heartRateMaxBpm:
                156,
              speedAverageMetersPerSecond:
                0.47,
              speedMaxMetersPerSecond:
                1.1,
              paceSecondsPer100mFromSpeed:
                212.7
            })
          ]
        },
        expect.objectContaining({
          headers:
            expect.anything()
        })
      );
  });


  it('keeps rendering Health Connect swimming when sync fails', async () => {
    const fixture =
      TestBed.createComponent(
        Endurance
      );

    mockAndroidHealthConnectSwimming();
    http.post.mockReturnValue(
      throwError(
        () => new Error(
          'sync failed'
        )
      )
    );

    await fixture.componentInstance
      .loadSwimming();
    await flushPromises();
    await fixture.componentInstance
      .loadSwimming();
    await flushPromises();

    expect(http.post)
      .toHaveBeenCalledTimes(2);
    expect(console.error)
      .toHaveBeenCalledWith(
        '[Aptus swimming sync] failed',
        expect.any(Error)
      );
    expect(
      fixture.componentInstance
        .swimmingError()
    ).toBeNull();
    expect(
      fixture.componentInstance
        .swimmingSessions()
    ).toHaveLength(1);
    expect(
      fixture.componentInstance
        .swimmingSessions()[0]
        .distanceMeters
    ).toBe(950);
  });


  it('does not resend the same Health Connect swimming session', async () => {
    const fixture =
      TestBed.createComponent(
        Endurance
      );

    mockAndroidHealthConnectSwimming();
    http.post.mockReturnValue(
      of({
        synced: 1
      })
    );

    await fixture.componentInstance
      .loadSwimming();
    await flushPromises();
    await fixture.componentInstance
      .loadSwimming();
    await flushPromises();

    expect(http.post)
      .toHaveBeenCalledTimes(1);
  });
});


describe('Endurance running session', () => {
  const runningApi = {
    listSessions: vi.fn(),
    syncSessions: vi.fn()
  };

  const http = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn()
  };


  beforeEach(async () => {
    vi.clearAllMocks();
    healthConnect
      .readGarminSwimmingMetrics
      .mockReset();
    healthConnect
      .readGarminRunningMetrics
      .mockReset();

    http.get.mockReset();
    http.post.mockReset();
    http.put.mockReset();

    runningApi.listSessions.mockReset().mockResolvedValue([]);
    runningApi.syncSessions.mockReset().mockImplementation(async (sessions: HealthConnectRunningMetricSession[]) => ({
      synced: sessions.length,
      results: sessions.map((session, index) => ({
        index, recordId: session.recordId, sourcePackage: session.sourcePackage,
        session: persistedSession({ source_record_id: session.recordId, source_package: session.sourcePackage })
      }))
    }));

    await TestBed.configureTestingModule({
      imports: [
        Endurance
      ],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: {
                discipline: 'running'
              }
            }
          }
        },
        {
          provide: Router,
          useValue: {
            navigateByUrl: vi.fn()
          }
        },
        {
          provide: HttpClient,
          useValue: http
        },
        {
          provide: AuthService,
          useValue: {
            user: () => ({ id: 'athlete' }),
            getAccessToken:
              vi.fn(async () => 'token')
          }
        },
        {
          provide: ENDURANCE_HEALTH_CONNECT,
          useValue: healthConnect
        },
        {
          provide: HealthConnectAccountService,
          useValue: {
            revision: () => 0,
            enabled: vi.fn(
              async () => true
            )
          }
        },
        { provide: RUNNING_HEALTH_CONNECT, useValue: healthConnect },
        { provide: RunningService, useValue: runningApi }
      ]
    }).compileComponents();
    vi.spyOn(TestBed.inject(RunningHealthConnectSyncService), 'supported').mockReturnValue(true);
  });


  afterEach(() => {
    vi.restoreAllMocks();
  });


  function runningSession(
    overrides: Partial<HealthConnectRunningMetricSession> = {}
  ): HealthConnectRunningMetricSession {
    return {
      recordId: 'hc-running-1',
      sourcePackage: 'com.garmin.android.apps.connectmobile',
      exerciseType: 33,
      startTime: '2026-08-30T08:00:00Z',
      endTime: '2026-08-30T08:25:00Z',
      durationSeconds: 1500,
      lapCount: 5,
      segmentCount: 2,
      hasRoute: true,
      distanceMeters: 5000,
      heartRateAverageBpm: 148,
      heartRateMaxBpm: 171,
      heartRateSampleCount: 100,
      speedAverageMetersPerSecond: 4,
      speedMaxMetersPerSecond: 5,
      speedSampleCount: 100,
      paceSecondsPerKmFromSpeed: 250,
      ...overrides
    };
  }

  function persistedSession(overrides: Partial<PersistedRunningSession> = {}): PersistedRunningSession {
    return {
      id: 'persisted-1', source: 'health_connect',
      source_package: 'com.garmin.android.apps.connectmobile', source_record_id: 'hc-running-1',
      started_at: '2026-08-30T08:00:00Z', ended_at: '2026-08-30T08:25:00Z',
      data: { schema_version: 1, exercise_type: 33, distance_meters: 5000,
        speed_average_meters_per_second: 4 },
      ...overrides
    };
  }


  function mockRunningSessions(
    sessions: ReturnType<typeof runningSession>[]
  ) {
    const readGarminRunningMetrics =
      vi.fn().mockResolvedValue({
        sourcePackage:
          'com.garmin.android.apps.connectmobile',
        lookbackDays: 30,
        count: sessions.length,
        sessions
      });

    healthConnect
      .readGarminRunningMetrics
      .mockImplementation(
        readGarminRunningMetrics
      );

    return readGarminRunningMetrics;
  }


  async function renderRunning(
    sessions: ReturnType<typeof runningSession>[]
  ) {
    const readGarminRunningMetrics =
      mockRunningSessions(sessions);
    const fixture =
      TestBed.createComponent(Endurance);

    vi.spyOn(
      fixture.componentInstance,
      'runningHealthConnectSupported'
    ).mockReturnValue(true);

    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.runningLoading()).toBe(false));
    fixture.detectChanges();

    return {
      fixture,
      readGarminRunningMetrics
    };
  }


  it('preserves per-record identity, timestamps and metrics when reading and rereading running', async () => {
    const session = runningSession({
      recordId: 'health-connect-record-30-08',
      sourcePackage: 'test.record.writer'
    });
    const { fixture, readGarminRunningMetrics } =
      await renderRunning([session]);

    // The per-record writer must survive independently of the response-level
    // Garmin filter. The complete session includes the existing metrics.
    expect(fixture.componentInstance.runningSessions()).toEqual([session]);
    expect(fixture.componentInstance.selectedRunningSession()).toEqual(session);

    const updated = {
      ...session,
      distanceMeters: 5100,
      durationSeconds: 1560,
      endTime: '2026-08-30T08:26:00Z'
    };
    readGarminRunningMetrics.mockResolvedValue({
      sourcePackage: 'com.garmin.android.apps.connectmobile',
      lookbackDays: 30,
      count: 1,
      sessions: [updated]
    });

    await fixture.componentInstance.loadRunning();

    expect(fixture.componentInstance.runningSessions()).toEqual([updated]);
    expect(fixture.componentInstance.selectedRunningSession()?.recordId)
      .toBe(session.recordId);
  });


  it('does not call Health Connect for running on web', async () => {
    const readGarminRunningMetrics =
      mockRunningSessions([
        runningSession()
      ]);

    const fixture =
      TestBed.createComponent(
        Endurance
      );

    vi.spyOn(
      fixture.componentInstance,
      'runningHealthConnectSupported'
    ).mockReturnValue(false);

    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.runningLoading()).toBe(false));
    fixture.detectChanges();

    expect(
      readGarminRunningMetrics
    ).not.toHaveBeenCalled();

    expect(
      fixture.componentInstance
        .runningError()
    ).toBeNull();

    expect(
      fixture.nativeElement.textContent
    ).toContain(
      'Sin sesiones de carrera'
    );

    expect(runningApi.listSessions).toHaveBeenCalledOnce();
    expect(runningApi.syncSessions).not.toHaveBeenCalled();
  });


  it('shows persisted sessions on web with elapsed duration, pace and unknown metrics', async () => {
    runningApi.listSessions.mockResolvedValue([persistedSession()]);
    const fixture = TestBed.createComponent(Endurance);
    vi.spyOn(fixture.componentInstance, 'runningHealthConnectSupported').mockReturnValue(false);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.runningLoading()).toBe(false));
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('5.00 km');
    expect(text).toContain('25:00');
    expect(text).toContain('4:10 /km');
    expect(fixture.componentInstance.selectedRunningSession()?.lapCount).toBeUndefined();
    expect(text).toContain('—');
    expect(healthConnect.readGarminRunningMetrics).not.toHaveBeenCalled();
    expect(runningApi.syncSessions).not.toHaveBeenCalled();
  });

  it('deduplicates by writer and record, prefers local metrics, and keeps same-time records', async () => {
    runningApi.listSessions.mockResolvedValue([persistedSession({
      data: { schema_version: 1, exercise_type: 33, distance_meters: 4000 }
    })]);
    const local = runningSession();
    const { fixture } = await renderRunning([
      local, runningSession({ recordId: 'other' }), runningSession({ sourcePackage: 'other.writer' })
    ]);
    expect(fixture.componentInstance.runningSessions()).toHaveLength(3);
    expect(fixture.componentInstance.runningSessions().find(s =>
      s.recordId === local.recordId && s.sourcePackage === local.sourcePackage
    )).toEqual(local);
    expect(fixture.nativeElement.querySelectorAll('#running-session option')).toHaveLength(3);
    expect(runningApi.listSessions).toHaveBeenCalledOnce();
  });

  it('keeps local sessions visible when GET and sync fail', async () => {
    runningApi.listSessions.mockRejectedValue(new Error('GET failed'));
    runningApi.syncSessions.mockRejectedValue(new Error('POST failed'));
    const { fixture } = await renderRunning([runningSession()]);
    expect(fixture.componentInstance.runningSessions()).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('5.00 km');
    expect(fixture.componentInstance.runningError()).toContain('sesiones guardadas');
    expect(fixture.componentInstance.runningSyncError()).toContain('sincronizar');
  });

  it('keeps persisted sessions when Health Connect fails', async () => {
    runningApi.listSessions.mockResolvedValue([persistedSession()]);
    healthConnect.readGarminRunningMetrics.mockRejectedValue(new Error('HC unavailable'));
    const fixture = TestBed.createComponent(Endurance);
    vi.spyOn(fixture.componentInstance, 'runningHealthConnectSupported').mockReturnValue(true);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.runningLoading()).toBe(false));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('5.00 km');
    expect(fixture.componentInstance.runningError()).toBe('HC unavailable');
    expect(runningApi.syncSessions).not.toHaveBeenCalled();
  });

  it('shows a web GET error without attempting Health Connect', async () => {
    runningApi.listSessions.mockRejectedValue(new Error('offline'));
    const fixture = TestBed.createComponent(Endurance);
    vi.spyOn(fixture.componentInstance, 'runningHealthConnectSupported').mockReturnValue(false);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.runningLoading()).toBe(false));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las sesiones');
    expect(healthConnect.readGarminRunningMetrics).not.toHaveBeenCalled();
  });

  it('keeps successful GET and local data when sync rejects or partially fails', async () => {
    runningApi.listSessions.mockResolvedValue([persistedSession({ source_record_id: 'persisted-only' })]);
    runningApi.syncSessions.mockResolvedValue({ synced: 1, results: [
      { index: 0, recordId: 'hc-running-1', sourcePackage: runningSession().sourcePackage, session: persistedSession() },
      { index: 1, recordId: 'failed', sourcePackage: runningSession().sourcePackage,
        error: { status_code: 502, detail: 'Unavailable' } }
    ] });
    const { fixture } = await renderRunning([runningSession(), runningSession({ recordId: 'failed' })]);
    expect(fixture.componentInstance.runningSessions()).toHaveLength(3);
    expect(fixture.componentInstance.runningSyncError()).toBeTruthy();
    runningApi.syncSessions.mockRejectedValue(new Error('offline'));
    await fixture.componentInstance.loadRunning();
    expect(fixture.componentInstance.runningSessions()).toHaveLength(3);
  });

  it('handles empty sources without syncing an empty batch', async () => {
    const { fixture } = await renderRunning([]);
    expect(fixture.nativeElement.textContent).toContain('Sin sesiones de carrera');
    expect(runningApi.syncSessions).not.toHaveBeenCalled();
  });

  it('sends all native fields in batches of 25 and continues after a failed batch', async () => {
    const sessions = Array.from({ length: 51 }, (_, i) => runningSession({ recordId: `record-${i}` }));
    runningApi.syncSessions.mockRejectedValueOnce(new Error('first batch failed'));
    const { fixture } = await renderRunning(sessions);
    expect(runningApi.syncSessions.mock.calls.map(call => call[0].length)).toEqual([25, 25, 1]);
    expect(runningApi.syncSessions.mock.calls.flatMap(call => call[0])).toEqual(sessions);
    expect(fixture.componentInstance.runningSessions()).toHaveLength(51);
    expect(fixture.componentInstance.runningSyncError()).toBeTruthy();
  });

  it('resyncs corrected metrics and retains selection by identity after reordering', async () => {
    const { fixture, readGarminRunningMetrics } = await renderRunning([
      runningSession(), runningSession({ recordId: 'selected', startTime: '2026-08-29T08:00:00Z' })
    ]);
    fixture.componentInstance.selectRunningSession('1');
    const corrected = runningSession({ recordId: 'selected', startTime: '2026-08-31T08:00:00Z',
      endTime: '2026-08-31T08:25:00Z', distanceMeters: 6000 });
    readGarminRunningMetrics.mockResolvedValue({ sessions: [corrected, runningSession()] });
    await fixture.componentInstance.loadRunning();
    expect(fixture.componentInstance.selectedRunningSession()).toEqual(corrected);
    expect(fixture.componentInstance.selectedRunningSessionIndex()).toBe(0);
    expect(runningApi.syncSessions).toHaveBeenCalledTimes(2);
    expect(runningApi.syncSessions.mock.calls[1][0][0]).toEqual(corrected);
  });

  it('publishes local sessions while GET is pending and avoids concurrent duplicate loads', async () => {
    let resolveGet!: (value: PersistedRunningSession[]) => void;
    runningApi.listSessions.mockReturnValue(new Promise(resolve => { resolveGet = resolve; }));
    mockRunningSessions([runningSession(), runningSession({ recordId: 'selected-late' })]);
    const fixture = TestBed.createComponent(Endurance);
    vi.spyOn(fixture.componentInstance, 'runningHealthConnectSupported').mockReturnValue(true);
    const loading = fixture.componentInstance.loadRunning();
    await Promise.resolve();
    await fixture.componentInstance.loadRunning();

    // Account-scoped Health Connect adds an asynchronous
    // connection check before the native read. The important
    // contract is that local sessions appear while the
    // persisted GET is still pending, not within one exact
    // microtask.
    await vi.waitFor(() =>
      expect(
        fixture.componentInstance.runningSessions()
      ).toHaveLength(2)
    );

    fixture.componentInstance.selectRunningSession('1');
    expect(runningApi.listSessions).toHaveBeenCalledOnce();
    expect(healthConnect.readGarminRunningMetrics).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(runningApi.syncSessions).toHaveBeenCalledOnce());
    resolveGet([]);
    await loading;
    expect(fixture.componentInstance.runningSessions()).toHaveLength(2);
    expect(fixture.componentInstance.selectedRunningSession()?.recordId).toBe('selected-late');
  });

  it('loads the active running routine for the running discipline', async () => {
    http.get.mockReturnValue(
      of({
        routineId: 'running-routine',
        schemaVersion: '4.2',
        revision: 1,
        discipline: 'running',
        name: 'Plan de carrera',
        sessions: [
          {
            sessionId: 'run-today',
            date: '2026-08-31',
            title: 'Rodaje fácil',
            objective: 'Construir base aeróbica',
            estimatedDurationMinutes: 35,
            blocks: [
              {
                id: 'warmup',
                type: 'warmup',
                title: 'Calentamiento',
                sets: [
                  {
                    repetitions: 1,
                    targetType: 'duration',
                    durationSeconds: 600,
                    intensityMode: 'free',
                    recoverySeconds: 0
                  }
                ]
              },
              {
                id: 'main',
                type: 'main',
                title: 'Bloque principal',
                sets: [
                  {
                    repetitions: 1,
                    targetType: 'distance',
                    distanceMeters: 4000,
                    intensityMode: 'free',
                    recoverySeconds: 0
                  }
                ]
              }
            ],
            notes: 'Ritmo cómodo'
          }
        ]
      })
    );

    const { fixture } =
      await renderRunning([]);

    expect(http.get)
      .toHaveBeenCalledWith(
        expect.stringContaining(
          '/routines/active'
        ),
        expect.objectContaining({
          params: {
            discipline: 'running'
          }
        })
      );

    expect(
      fixture.componentInstance
        .runningRoutine()
    ).toEqual(
      expect.objectContaining({
        id: 'run-today',
        title: 'Rodaje fácil',
        objective:
          'Construir base aeróbica',
        estimatedDurationMinutes: 35
      })
    );

    expect(
      fixture.componentInstance
        .runningRoutineTotalDistance()
    ).toBe(4000);

    expect(
      fixture.componentInstance
        .runningRoutineError()
    ).toBeNull();
  });


  it('saves an edited running routine and preserves later sessions', async () => {
    const fixture =
      TestBed.createComponent(
        Endurance
      );

    const component =
      fixture.componentInstance;

    const stored = {
      routineId: 'running-routine',
      schemaVersion: '4.2',
      revision: 2,
      discipline: 'running',
      name: 'Plan anterior',
      sessions: [
        {
          sessionId: 'today',
          title: 'Hoy'
        },
        {
          sessionId: 'next',
          title: 'Próxima sesión'
        }
      ]
    };

    component.activeRunningRoutineRecord.set(
      stored
    );

    component.runningRoutineDraft.set({
      id: 'today',
      date: '2026-08-31',
      title: 'Rodaje controlado',
      objective: 'Construir base aeróbica',
      estimatedDurationMinutes: 40,
      blocks: [
        {
          id: 'main',
          type: 'main',
          title: 'Bloque principal',
          sets: [
            {
              repetitions: 1,
              targetType: 'distance',
              distanceMeters: 5000,
              intensityMode: 'free',
              recoverySeconds: 0,
              instruction:
                'Mantener esfuerzo estable'
            }
          ]
        }
      ],
      notes: 'Postura relajada'
    });

    http.put.mockImplementation(
      (_url, payload) => of(payload)
    );

    await component.saveRunningRoutine();

    expect(http.put)
      .toHaveBeenCalledOnce();

    const payload =
      http.put.mock.calls[0][1];

    expect(payload.discipline)
      .toBe('running');

    expect(payload.revision)
      .toBe(3);

    expect(payload.sessions)
      .toHaveLength(2);

    expect(payload.sessions[0])
      .toEqual(
        expect.objectContaining({
          sessionId: 'today',
          title: 'Rodaje controlado',
          objective:
            'Construir base aeróbica',
          estimatedDurationMinutes: 40
        })
      );

    expect(payload.sessions[1])
      .toEqual(stored.sessions[1]);

    expect(
      component.runningRoutine()
    ).toEqual(
      expect.objectContaining({
        title: 'Rodaje controlado'
      })
    );

    expect(
      component.runningRoutineEditing()
    ).toBe(false);

    expect(
      component.runningRoutineSaveMessage()
    ).toBe(
      'Rutina de carrera guardada.'
    );
  });


  it('does not save an invalid running set', async () => {
    const fixture =
      TestBed.createComponent(
        Endurance
      );

    const component =
      fixture.componentInstance;

    component.activeRunningRoutineRecord.set({
      routineId: 'running-routine',
      schemaVersion: '4.2',
      revision: 1,
      discipline: 'running',
      sessions: [
        {
          sessionId: 'today'
        }
      ]
    });

    component.runningRoutineDraft.set({
      id: 'today',
      date: '2026-08-31',
      title: 'Rodaje',
      objective: '',
      estimatedDurationMinutes: 30,
      blocks: [
        {
          id: 'main',
          type: 'main',
          title: 'Principal',
          sets: [
            {
              repetitions: 1,
              targetType: 'distance',
              distanceMeters: 0,
              intensityMode: 'free',
              recoverySeconds: 0
            }
          ]
        }
      ],
      notes: ''
    });

    await component.saveRunningRoutine();

    expect(http.put)
      .not.toHaveBeenCalled();

    expect(
      component.runningRoutineSaveError()
    ).toBe(
      'Las series necesitan repeticiones y duración o distancia mayores que 0.'
    );
  });


  it('loads and renders running sessions on the running route', async () => {
    http.get.mockReturnValue(
      of({
        routineId: 'running-routine',
        schemaVersion: '4.2',
        revision: 1,
        discipline: 'running',
        name: 'Plan de carrera',
        sessions: [
          {
            sessionId: 'run-today',
            date: '2026-08-31',
            title: 'Rodaje fácil',
            objective: 'Construir base aeróbica',
            estimatedDurationMinutes: 35,
            blocks: [
              {
                id: 'warmup',
                type: 'warmup',
                title: 'Calentamiento',
                sets: [
                  {
                    repetitions: 1,
                    targetType: 'duration',
                    durationSeconds: 600,
                    intensityMode: 'free',
                    recoverySeconds: 0
                  }
                ]
              },
              {
                id: 'main',
                type: 'main',
                title: 'Bloque principal',
                sets: [
                  {
                    repetitions: 1,
                    targetType: 'distance',
                    distanceMeters: 4000,
                    intensityMode: 'free',
                    recoverySeconds: 0,
                    instruction: 'Mantener ritmo cómodo'
                  }
                ]
              }
            ],
            notes: 'Cadencia estable'
          }
        ]
      })
    );

    const {
      fixture,
      readGarminRunningMetrics
    } = await renderRunning([
      runningSession()
    ]);

    const text =
      fixture.nativeElement.textContent;

    expect(readGarminRunningMetrics)
      .toHaveBeenCalledOnce();
    expect(text).toContain('Sesión');
    expect(text).toContain('Rutina');
    expect(text).toContain('Análisis');
    expect(text).toContain('5.00 km');
    expect(text).toContain('25:00');
    expect(text).toContain('4:10 /km');
    expect(text).toContain('14.4 km/h');
    expect(text).toContain('18.0 km/h');
    expect(text).toContain('Exterior');

    const routineTab = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.training-view-tabs button'
      ) as NodeListOf<HTMLButtonElement>
    ).find(
      button =>
        button.textContent.trim() === 'Rutina'
    );

    routineTab?.click();
    fixture.detectChanges();

    const routineText =
      fixture.nativeElement.textContent;

    expect(
      fixture.componentInstance.runningView()
    ).toBe('routine');

    expect(routineText)
      .toContain('Rodaje fácil');

    expect(routineText)
      .toContain('Construir base aeróbica');

    expect(routineText)
      .toContain('35');

    expect(routineText)
      .toContain('4.00 km');

    expect(routineText)
      .toContain('Calentamiento');

    expect(routineText)
      .toContain('Bloque principal');

    expect(routineText)
      .toContain('Mantener ritmo cómodo');

    expect(routineText)
      .toContain('Cadencia estable');

    expect(routineText)
      .not.toContain('Próximamente');
  });


  it('selects between outdoor and treadmill sessions', async () => {
    const { fixture } =
      await renderRunning([
        runningSession(),
        runningSession({
          recordId: 'hc-treadmill-2',
          exerciseType: 34,
          startTime:
            '2026-08-29T08:00:00Z',
          endTime:
            '2026-08-29T08:05:00Z',
          durationSeconds: 300,
          distanceMeters: 800,
          hasRoute: false
        })
      ]);

    const select =
      fixture.nativeElement.querySelector(
        '#running-session'
      ) as HTMLSelectElement;

    select.value = '1';
    select.dispatchEvent(
      new Event('change')
    );
    fixture.detectChanges();

    const headerType =
      fixture.nativeElement.querySelector(
        '.endurance-session-header .eyebrow'
      ).textContent.trim();

    expect(
      fixture.componentInstance
        .selectedRunningSessionIndex()
    ).toBe(1);
    expect(headerType).toBe('Cinta');
    expect(
      fixture.nativeElement.textContent
    ).toContain('800 m');
  });


  it('renders unavailable running metrics without deriving pace', async () => {
    const session = runningSession({
      heartRateAverageBpm: undefined,
      heartRateMaxBpm: undefined,
      speedAverageMetersPerSecond: undefined,
      speedMaxMetersPerSecond: undefined,
      paceSecondsPerKmFromSpeed: undefined
    });
    const { fixture } =
      await renderRunning([session]);

    const metricValues = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.endurance-metrics-grid strong'
      ) as NodeListOf<HTMLElement>
    ).map(
      element => element.textContent.trim()
    );

    expect(
      fixture.componentInstance
        .formatRunningPace(undefined)
    ).toBe('—');
    expect(metricValues.filter(
      value => value === '—'
    ).length).toBeGreaterThanOrEqual(5);
  });


  it('renders Health Connect running errors', async () => {
    healthConnect
      .readGarminRunningMetrics
      .mockRejectedValue(
        new Error('Health Connect unavailable')
      );

    const fixture =
      TestBed.createComponent(Endurance);

    vi.spyOn(
      fixture.componentInstance,
      'runningHealthConnectSupported'
    ).mockReturnValue(true);

    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.runningLoading()).toBe(false));
    fixture.detectChanges();

    expect(
      fixture.componentInstance.runningError()
    ).toBe('Health Connect unavailable');
    expect(
      fixture.nativeElement.textContent
    ).toContain(
      'No se pudieron cargar las sesiones'
    );
  });
});
