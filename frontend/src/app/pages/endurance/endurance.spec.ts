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

    vi.spyOn(
      fixture.componentInstance,
      'runningHealthConnectSupported'
    ).mockReturnValue(true);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return {
      fixture,
      readGarminRunningMetrics
    };
  }


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
      'Disponible en Android'
    );

    expect(
      fixture.nativeElement.textContent
    ).toContain(
      'Health Connect solo está disponible'
    );
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
