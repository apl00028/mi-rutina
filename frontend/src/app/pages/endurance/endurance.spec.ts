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
  of
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
});


describe('Endurance running session', () => {

  beforeEach(async () => {
    vi.clearAllMocks();
    healthConnect
      .readGarminSwimmingMetrics
      .mockReset();
    healthConnect
      .readGarminRunningMetrics
      .mockReset();

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
          useValue: {
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn()
          }
        },
        {
          provide: AuthService,
          useValue: {
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


  function runningSession(
    overrides: Record<string, unknown> = {}
  ) {
    return {
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

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return {
      fixture,
      readGarminRunningMetrics
    };
  }


  it('loads and renders running sessions on the running route', async () => {
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

    expect(
      fixture.componentInstance.runningView()
    ).toBe('routine');
    expect(
      fixture.nativeElement.textContent
    ).toContain('Próximamente');
  });


  it('selects between outdoor and treadmill sessions', async () => {
    const { fixture } =
      await renderRunning([
        runningSession(),
        runningSession({
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

    fixture.detectChanges();
    await fixture.whenStable();
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
