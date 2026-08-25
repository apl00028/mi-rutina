/**
 * @vitest-environment jsdom
 */

import {
  signal
} from '@angular/core';
import {
  TestBed
} from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import {
  provideHttpClient
} from '@angular/common/http';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  environment
} from '../../../environments/environment';
import {
  AuthService
} from '../../core/auth.service';
import {
  WorkoutSessionStateService
} from '../../core/workout-session-state.service';
import {
  Train
} from './train';


beforeAll(() => {
  Object.defineProperty(
    HTMLElement.prototype,
    'scrollIntoView',
    {
      configurable: true,
      value: vi.fn()
    }
  );
});


describe('Train first workout flow', () => {
  let http:
    HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Train
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            user:
              signal({
                email:
                  'test@example.com'
              }),
            getAccessToken:
              vi.fn()
                .mockResolvedValue(
                  'access-token'
                ),
            signInWithMagicLink:
              vi.fn()
          }
        }
      ]
    }).compileComponents();

    http =
      TestBed.inject(
        HttpTestingController
      );

    localStorage.removeItem(
      'aptus-settings-v1'
    );

    vi.spyOn(
      crypto,
      'randomUUID'
    ).mockReturnValue(
      '00000000-0000-4000-8000-000000000001'
    );
  });


  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });


  function routine() {
    return {
      routineId:
        'routine-1',
      schemaVersion:
        '4.2',
      revision: 1,
      sessions: [
        {
          sessionId:
            'session-1',
          label:
            'Sesión 1',
          name:
            'Torso',
          exercises: [
            {
              exerciseId:
                'dumbbell-bench-press',
              name:
                'Press banca con mancuernas',
              sets: 2,
              target:
                '6-10',
              targetRir: {
                min: 1,
                max: 3
              },
              restSeconds:
                120
            }
          ]
        }
      ]
    };
  }


  function twoExerciseRoutine() {
    return {
      ...routine(),
      sessions: [
        {
          ...routine().sessions[0],
          exercises: [
            {
              ...routine()
                .sessions[0]
                .exercises[0],
              sets:
                2
            },
            {
              exerciseId:
                'lat-pulldown',
              name:
                'Jalón al pecho',
              sets: 2,
              target:
                '8-12',
              targetRir: {
                min: 1,
                max: 3
              },
              restSeconds:
                90
            }
          ]
        }
      ]
    };
  }


  async function waitForHttpTick() {
    await new Promise(
      resolve =>
        setTimeout(resolve, 0)
    );
  }


  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
  }


  async function waitForRequest(
    url: string
  ) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const matches =
        http.match(url);

      if (matches.length) {
        return matches[0];
      }

      await waitForHttpTick();
    }

    return http.expectOne(url);
  }


  async function createLoadedTrain(
    workouts: any[] = [],
    exercises: any[] = [
      {
        id:
          'dumbbell-bench-press',
        recordTypes:
          ['weight_reps']
      },
      {
        id:
          'plank',
        recordTypes:
          ['duration']
      }
    ],
    routinePayload: any = routine()
  ) {
    const fixture =
      TestBed.createComponent(
        Train
      );

    fixture.detectChanges();

    await waitForHttpTick();
    await waitForHttpTick();
    await waitForHttpTick();

    http
      .expectOne(
        `${environment.apiUrl}/routines/active`
      )
      .flush(routinePayload);

    await fixture.whenStable();
    await waitForHttpTick();

    http
      .expectOne(
        `${environment.apiUrl}/exercises`
      )
      .flush(exercises);

    await flushPromises();

    const workoutsRequest =
      await waitForRequest(
        `${environment.apiUrl}/workouts`
      );

    workoutsRequest.flush(workouts);

    await waitForHttpTick();
    await fixture.whenStable();
    fixture.detectChanges();

    return fixture;
  }


  function pageText(
    fixture: {
      nativeElement: HTMLElement;
    }
  ): string {
    return (
      (
        fixture.nativeElement as HTMLElement
      ).textContent ?? ''
    ).replace(/\s+/g, ' ');
  }


  function activeWorkout() {
    return {
      workoutId:
        'active-workout',
      routineId:
        'routine-1',
      sessionId:
        'session-1',
      status:
        'in_progress',
      sets: []
    };
  }


  function finishedWorkout(
    sets: any[],
    options: {
      workoutId?: string;
      status?: 'finished' | 'in_progress';
      finishedAt?: string;
    } = {}
  ) {
    return {
      workoutId:
        options.workoutId ??
        'finished-history',
      routineId:
        'routine-1',
      sessionId:
        'session-1',
      status:
        options.status ??
        'finished',
      finishedAt:
        options.finishedAt ??
        '2026-08-18T18:00:00Z',
      sets
    };
  }


  function historySet(
    setIndex: number,
    values: {
      exerciseId?: string;
      weight?: number | null;
      reps?: number | null;
      rir?: number | null;
      durationSeconds?: number | null;
      completedAt?: string | null;
    }
  ) {
    return {
      setId:
        `history-set-${setIndex}`,
      exerciseId:
        values.exerciseId ??
        'dumbbell-bench-press',
      setIndex,
      weight:
        values.weight,
      reps:
        values.reps,
      rir:
        values.rir,
      durationSeconds:
        values.durationSeconds,
      completedAt:
        values.completedAt === undefined
          ? '2026-08-18T18:10:00Z'
          : values.completedAt
    };
  }


  function trendWorkout(
    workoutId: string,
    finishedAt: string,
    values: {
      weight?: number | null;
      reps?: number | null;
      rir?: number | null;
      exerciseId?: string;
    }
  ) {
    return finishedWorkout(
      [
        historySet(0, {
          ...values,
          completedAt:
            finishedAt
        }),
        historySet(1, {
          ...values,
          completedAt:
            finishedAt
        })
      ],
      {
        workoutId,
        finishedAt
      }
    );
  }




  it('stores exercise discomfort independently from workout sets', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);

    const component =
      fixture.componentInstance;

    vi.spyOn(
      component as any,
      'scheduleAutosave'
    ).mockImplementation(() => {});

    component.updateExerciseDiscomfort(
      'dumbbell-bench-press',
      'painScore',
      '3'
    );

    component.updateExerciseDiscomfort(
      'dumbbell-bench-press',
      'area',
      'Hombro derecho'
    );

    component.updateExerciseDiscomfort(
      'dumbbell-bench-press',
      'note',
      'Molestia al bajar'
    );

    expect(
      component.exerciseDiscomfort(
        'dumbbell-bench-press'
      )
    ).toEqual({
      exerciseId:
        'dumbbell-bench-press',
      painScore:
        3,
      area:
        'Hombro derecho',
      note:
        'Molestia al bajar'
    });

    expect(
      component.activeWorkout()
        ?.sets
    ).toEqual([]);

    (component as any)
      .cancelAutosaveTimer();

    (component as any)
      .persistedEditVersion =
        (component as any)
          .workoutEditVersion;
  });


  it('clears exercise discomfort without touching sets', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          discomforts: [
            {
              exerciseId:
                'dumbbell-bench-press',
              painScore:
                4,
              area:
                'Codo',
              note:
                null
            }
          ]
        }
      ]);

    const component =
      fixture.componentInstance;

    vi.spyOn(
      component as any,
      'scheduleAutosave'
    ).mockImplementation(() => {});

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '80'
    );

    component.clearExerciseDiscomfort(
      'dumbbell-bench-press'
    );

    expect(
      component.exerciseDiscomfort(
        'dumbbell-bench-press'
      )
    ).toBeNull();

    expect(
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      )?.weight
    ).toBe(80);

    (component as any)
      .cancelAutosaveTimer();

    (component as any)
      .persistedEditVersion =
        (component as any)
          .workoutEditVersion;
  });


  it('adds warmup sets with negative indices without colliding with working sets', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);

    const component =
      fixture.componentInstance;

    vi.spyOn(
      component as any,
      'scheduleAutosave'
    ).mockImplementation(() => {});

    component.addWarmupSet(
      'dumbbell-bench-press'
    );

    component.addWarmupSet(
      'dumbbell-bench-press'
    );

    const warmups =
      component.warmupSets(
        'dumbbell-bench-press'
      );

    expect(warmups).toHaveLength(2);

    expect(
      warmups.map(set => set.setIndex)
    ).toEqual([
      -1,
      -2
    ]);

    expect(
      warmups.every(
        set =>
          set.setType === 'warmup'
      )
    ).toBe(true);

    expect(
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      )
    ).toBeNull();

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '80'
    );

    expect(
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      )?.setType
    ).toBeUndefined();

    expect(
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      )?.weight
    ).toBe(80);
    (component as any)
      .cancelAutosaveTimer();

    // Avoid ngOnDestroy starting a persistence request
    // after the TestBed injector has been destroyed.
    (component as any).persistedEditVersion =
      (component as any).workoutEditVersion;

  });


  it('updates and removes warmup sets independently from working sets', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);

    const component =
      fixture.componentInstance;

    vi.spyOn(
      component as any,
      'scheduleAutosave'
    ).mockImplementation(() => {});

    component.addWarmupSet(
      'dumbbell-bench-press'
    );

    const warmup =
      component.warmupSets(
        'dumbbell-bench-press'
      )[0];

    expect(warmup).toBeTruthy();

    component.updateWarmupSet(
      warmup.setId,
      'weight',
      '40'
    );

    component.updateWarmupSet(
      warmup.setId,
      'reps',
      '12'
    );

    expect(
      component.warmupSets(
        'dumbbell-bench-press'
      )[0]
    ).toMatchObject({
      setType: 'warmup',
      setIndex: -1,
      weight: 40,
      reps: 12
    });

    component.toggleWarmupCompleted(
      warmup.setId
    );

    expect(
      component.warmupSets(
        'dumbbell-bench-press'
      )[0].completedAt
    ).toBeTruthy();

    component.toggleWarmupCompleted(
      warmup.setId
    );

    expect(
      component.warmupSets(
        'dumbbell-bench-press'
      )[0].completedAt
    ).toBeNull();

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '80'
    );

    expect(
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      )?.weight
    ).toBe(80);

    component.removeWarmupSet(
      warmup.setId
    );

    expect(
      component.warmupSets(
        'dumbbell-bench-press'
      )
    ).toHaveLength(0);

    expect(
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      )?.weight
    ).toBe(80);
    (component as any)
      .cancelAutosaveTimer();

    // Avoid ngOnDestroy starting a persistence request
    // after the TestBed injector has been destroyed.
    (component as any).persistedEditVersion =
      (component as any).workoutEditVersion;

  });


  it('does not count completed warmups as working-set progress', async () => {
    const workout = {
      ...activeWorkout(),
      sets: [
        {
          setId:
            'warmup-set-1',
          exerciseId:
            'dumbbell-bench-press',
          setIndex:
            -1,
          setType:
            'warmup',
          weight:
            40,
          reps:
            10,
          rir:
            null,
          durationSeconds:
            null,
          completedAt:
            '2026-08-20T15:00:00Z'
        }
      ]
    };

    const fixture =
      await createLoadedTrain([
        workout
      ]);

    const component =
      fixture.componentInstance;

    const exercise =
      component.activeSession()!
        .exercises[0];

    expect(
      component.completedSetCount(
        exercise
      )
    ).toBe(0);

    expect(
      component.exerciseProgressLabel(
        exercise
      )
    ).toBe('0 / 2');

    expect(
      component.exerciseProgressSignal(
        exercise
      )
    ).toBe('');
    (component as any)
      .cancelAutosaveTimer();

    // Avoid ngOnDestroy starting a persistence request
    // after the TestBed injector has been destroyed.
    (component as any).persistedEditVersion =
      (component as any).workoutEditVersion;

  });


  it('renders the first training screen with active routine and no history', async () => {
    const fixture =
      await createLoadedTrain();
    const sessionState =
      TestBed.inject(
        WorkoutSessionStateService
      );

    const text =
      (
        fixture.nativeElement as HTMLElement
      ).textContent ?? '';

    expect(text).toContain(
      'Elige tu sesión'
    );
    expect(text).toContain(
      'Press banca con mancuernas'
    );
    expect(text).toContain('6-10');
    expect(text).toContain('2 min');
    expect(text).not.toContain(
      'Última vez'
    );
    expect(sessionState.state())
      .toBe('idle');
    expect(
      sessionState.shouldHideBottomNav()
    ).toBe(false);
    expect(text).not.toContain(
      'undefined'
    );
    expect(text).not.toContain('NaN');
  });


  it('shows a stable empty state when there is no active routine', async () => {
    const fixture =
      TestBed.createComponent(
        Train
      );

    fixture.detectChanges();

    await flushPromises();

    http
      .expectOne(
        `${environment.apiUrl}/routines/active`
      )
      .flush(
        {
          detail:
            'Active routine not found'
        },
        {
          status: 404,
          statusText: 'Not Found'
        }
      );

    await waitForHttpTick();

    http
      .expectOne(
        `${environment.apiUrl}/workouts`
      )
      .flush([]);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.componentInstance.error()
    ).toContain(
      'rutina activa'
    );
  });


  it('starts a workout once and blocks a second start while pending', async () => {
    const fixture =
      await createLoadedTrain();

    const component =
      fixture.componentInstance;

    const session =
      component.routine()!.sessions[0];

    const first =
      component.startWorkout(session);
    const second =
      component.startWorkout(session);

    await waitForHttpTick();

    const request =
      http.expectOne(
        `${environment.apiUrl}/workouts`
      );

    http.expectNone(
      `${environment.apiUrl}/workouts`
    );

    expect(request.request.method)
      .toBe('POST');
    expect(request.request.body)
      .toMatchObject({
        routineId:
          'routine-1',
        sessionId:
          'session-1',
        status:
          'in_progress',
        sets: []
      });

    request.flush({
      ...request.request.body,
      startedAt:
        '2026-08-20T15:00:00Z'
    });

    await Promise.all([
      first,
      second
    ]);

    expect(
      component.activeWorkout()
        ?.workoutId
    ).toBe(
      '00000000-0000-4000-8000-000000000001'
    );
  });


  it('starts a new workout with every exercise collapsed', async () => {
    const fixture =
      await createLoadedTrain(
        [],
        undefined,
        twoExerciseRoutine()
      );
    const component =
      fixture.componentInstance;
    const sessionState =
      TestBed.inject(
        WorkoutSessionStateService
      );
    const session =
      component.routine()!.sessions[0];

    const start =
      component.startWorkout(session);

    await waitForHttpTick();

    const request =
      http.expectOne(
        `${environment.apiUrl}/workouts`
      );

    request.flush({
      ...request.request.body,
      startedAt:
        '2026-08-20T15:00:00Z'
    });

    await start;
    fixture.detectChanges();

    expect(component.expandedExerciseId())
      .toBeNull();
    expect(component.expandedSetKey())
      .toBeNull();
    expect(sessionState.state())
      .toBe('active');
    expect(
      sessionState.shouldHideBottomNav()
    ).toBe(true);
    expect(
      fixture.nativeElement.querySelectorAll(
        '.exercise-expanded'
      ).length
    ).toBe(0);
  });


  it('restores the active set when resuming persisted in-progress input', async () => {
    const fixture =
      await createLoadedTrain(
        [
          {
            workoutId:
              'active-workout',
            routineId:
              'routine-1',
            sessionId:
              'session-1',
            status:
              'in_progress',
            sets: [
              historySet(0, {
                weight: 80,
                reps: 8,
                rir: 2,
                completedAt:
                  '2026-08-20T15:05:00Z'
              }),
              historySet(1, {
                weight: 80,
                reps: 6,
                rir: 2,
                completedAt: null
              })
            ]
          }
        ],
        undefined,
        twoExerciseRoutine()
      );
    const component =
      fixture.componentInstance;
    const sessionState =
      TestBed.inject(
        WorkoutSessionStateService
      );

    expect(sessionState.state())
      .toBe('active');
    expect(
      sessionState.shouldHideBottomNav()
    ).toBe(true);
    expect(
      component.expandedExerciseId()
    ).toBe('dumbbell-bench-press');
    expect(
      component.isSetExpanded(
        'dumbbell-bench-press',
        1
      )
    ).toBe(true);
    expect(
      pageText(fixture)
    ).toContain('En curso');
  });


  it('returns the shell session state to idle when leaving training', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);
    const sessionState =
      TestBed.inject(
        WorkoutSessionStateService
      );

    expect(sessionState.state())
      .toBe('active');

    fixture.destroy();

    expect(sessionState.state())
      .toBe('idle');
    expect(
      sessionState.shouldHideBottomNav()
    ).toBe(false);
  });


  it('does not invent a resume context when only completed progress exists', async () => {
    const fixture =
      await createLoadedTrain(
        [
          {
            workoutId:
              'active-workout',
            routineId:
              'routine-1',
            sessionId:
              'session-1',
            status:
              'in_progress',
            sets: [
              historySet(0, {
                weight: 80,
                reps: 8,
                rir: 2,
                completedAt:
                  '2026-08-20T15:05:00Z'
              })
            ]
          }
        ],
        undefined,
        twoExerciseRoutine()
      );

    const component =
      fixture.componentInstance;
    const sessionState =
      TestBed.inject(
        WorkoutSessionStateService
      );

    expect(sessionState.state())
      .toBe('active');
    expect(component.expandedExerciseId())
      .toBeNull();
    expect(component.expandedSetKey())
      .toBeNull();

    expect(
      fixture.nativeElement.querySelectorAll(
        '.set-expanded'
      ).length
    ).toBe(0);
  });


  it('opens an exercise without opening a set automatically', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);
    const component =
      fixture.componentInstance;

    component.openExercise(
      'dumbbell-bench-press'
    );
    fixture.detectChanges();

    expect(
      component.expandedExerciseId()
    ).toBe('dumbbell-bench-press');
    expect(component.expandedSetKey())
      .toBeNull();
    expect(
      fixture.nativeElement.querySelectorAll(
        '.set-expanded'
      ).length
    ).toBe(0);
  });


  it('clicking a pending set expands its exercise and only that set', async () => {
    const fixture =
      await createLoadedTrain(
        [
          activeWorkout()
        ],
        undefined,
        twoExerciseRoutine()
      );
    const component =
      fixture.componentInstance;

    component.toggleSet(
      'dumbbell-bench-press',
      0
    );
    component.toggleSet(
      'lat-pulldown',
      1
    );
    fixture.detectChanges();

    expect(
      component.expandedExerciseId()
    ).toBe('lat-pulldown');
    expect(
      component.isSetExpanded(
        'dumbbell-bench-press',
        0
      )
    ).toBe(false);
    expect(
      component.isSetExpanded(
        'lat-pulldown',
        1
      )
    ).toBe(true);
    expect(
      pageText(fixture)
    ).toContain('En curso');
  });


  it('completing a set collapses it and keeps the next set folded', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);
    const component =
      fixture.componentInstance;

    component.toggleSet(
      'dumbbell-bench-press',
      0
    );

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await waitForHttpTick();

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    save.flush(save.request.body);
    await complete;
    fixture.detectChanges();

    expect(
      component.isSetExpanded(
        'dumbbell-bench-press',
        0
      )
    ).toBe(false);
    expect(
      component.isSetExpanded(
        'dumbbell-bench-press',
        1
      )
    ).toBe(false);
    expect(
      pageText(fixture)
    ).toContain('Siguiente');
  });



  it('confirms a correction without uncompleting the set and advances to the next pending set', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 80,
              reps: 8,
              rir: 2,
              completedAt:
                '2026-08-20T15:05:00Z'
            })
          ]
        }
      ]);

    const component =
      fixture.componentInstance;

    vi.spyOn(
      component as any,
      'scheduleAutosave'
    ).mockImplementation(() => {});

    const originalCompletedAt =
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      )?.completedAt;

    component.startSetCorrection(
      'dumbbell-bench-press',
      0
    );

    expect(
      component.isCorrectingSet(
        'dumbbell-bench-press',
        0
      )
    ).toBe(true);

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '82.5'
    );

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'reps',
      '9'
    );

    component.confirmSetCorrection(
      'dumbbell-bench-press',
      0
    );

    const corrected =
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      );

    expect(corrected?.weight)
      .toBe(82.5);

    expect(corrected?.reps)
      .toBe(9);

    expect(corrected?.completedAt)
      .toBe(originalCompletedAt);

    expect(
      component.isSetCompleted(
        'dumbbell-bench-press',
        0
      )
    ).toBe(true);

    expect(
      component.isCorrectingSet(
        'dumbbell-bench-press',
        0
      )
    ).toBe(false);

    expect(
      component.isSetExpanded(
        'dumbbell-bench-press',
        1
      )
    ).toBe(true);

    (component as any)
      .cancelAutosaveTimer();

    (component as any)
      .persistedEditVersion =
        (component as any)
          .workoutEditVersion;
  });


  it('lets a completed set reopen for corrections', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);
    const component =
      fixture.componentInstance;

    component.toggleSet(
      'dumbbell-bench-press',
      0
    );

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await waitForHttpTick();
    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );
    save.flush(save.request.body);
    await complete;

    component.toggleSet(
      'dumbbell-bench-press',
      0
    );

    expect(
      component.isSetExpanded(
        'dumbbell-bench-press',
        0
      )
    ).toBe(true);
  });


  it('keeps a completed exercise folded but allows reopening it manually', async () => {
    const fixture =
      await createLoadedTrain(
        [
          activeWorkout()
        ],
        undefined,
        twoExerciseRoutine()
      );
    const component =
      fixture.componentInstance;

    for (const setIndex of [0, 1]) {
      component.toggleSet(
        'dumbbell-bench-press',
        setIndex
      );

      const complete =
        component.completeSet(
          'dumbbell-bench-press',
          setIndex
        );

      await waitForHttpTick();
      const save =
        http.expectOne(
          `${environment.apiUrl}/workouts/active-workout`
        );
      save.flush(save.request.body);
      await complete;
    }

    expect(
      component.isExerciseCompleted(
        component.activeSession()!.exercises[0]
      )
    ).toBe(true);
    expect(
      component.expandedExerciseId()
    ).toBe('dumbbell-bench-press');
    expect(component.expandedSetKey())
      .toBeNull();

    component.openExercise(
      'dumbbell-bench-press'
    );

    expect(
      component.expandedExerciseId()
    ).toBe('dumbbell-bench-press');
  });


  it('manual exercise changes keep entered set data', async () => {
    const fixture =
      await createLoadedTrain(
        [
          activeWorkout()
        ],
        undefined,
        twoExerciseRoutine()
      );
    const component =
      fixture.componentInstance;

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '80'
    );

    const save =
      component.saveWorkout();

    await waitForHttpTick();

    const request =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    request.flush(request.request.body);
    await save;

    component.openExercise(
      'lat-pulldown'
    );

    expect(
      component.expandedExerciseId()
    ).toBe('lat-pulldown');
    expect(
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      )?.weight
    ).toBe(80);
  });


  it('records, persists, and can unmark a completed set', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    const component =
      fixture.componentInstance;

    expect(
      component.activeWorkout()
    ).toBeTruthy();

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '0'
    );
    component.updateSet(
      'dumbbell-bench-press',
      0,
      'reps',
      '8'
    );
    component.updateSet(
      'dumbbell-bench-press',
      0,
      'rir',
      '2.5'
    );
    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '-1'
    );

    expect(
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      )?.weight
    ).toBe(0);

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await waitForHttpTick();

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    expect(save.request.method)
      .toBe('PUT');
    expect(
      save.request.body.sets[0]
        .completedAt
    ).toBeTruthy();

    save.flush(save.request.body);

    await complete;

    const unmark =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await waitForHttpTick();

    const unmarkSave =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    expect(
      unmarkSave.request.body.sets[0]
        .completedAt
    ).toBeNull();

    unmarkSave.flush(
      unmarkSave.request.body
    );

    await unmark;
  });


  it('renders mobile-friendly set labels, progress, and reversible completion state', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    const component =
      fixture.componentInstance;

    component.openExercise(
      'dumbbell-bench-press'
    );
    component.toggleSet(
      'dumbbell-bench-press',
      0
    );
    fixture.detectChanges();

    let text =
      (
        fixture.nativeElement as HTMLElement
      ).textContent ?? '';

    expect(text).toContain(
      'Reps objetivo'
    );
    expect(text).toContain(
      'RIR objetivo'
    );
    expect(text).toContain(
      '0 / 2 series'
    );
    expect(text).toContain('En curso');

    const weightInput =
      fixture
        .nativeElement
        .querySelector(
          'input[aria-label="Peso en kg para Press banca con mancuernas, serie 1"]'
        ) as HTMLInputElement | null;

    expect(weightInput)
      .toBeTruthy();
    expect(
      weightInput?.getAttribute(
        'inputmode'
      )
    ).toBe('decimal');
    expect(
      weightInput?.getAttribute(
        'enterkeyhint'
      )
    ).toBe('next');

    const rirInput =
      fixture
        .nativeElement
        .querySelector(
          'input[aria-label="RIR realizado para Press banca con mancuernas, serie 1"]'
        ) as HTMLInputElement | null;

    expect(rirInput)
      .toBeTruthy();
    expect(
      rirInput?.getAttribute(
        'inputmode'
      )
    ).toBe('decimal');

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '80'
    );
    component.updateSet(
      'dumbbell-bench-press',
      0,
      'reps',
      '8'
    );
    component.updateSet(
      'dumbbell-bench-press',
      0,
      'rir',
      '2'
    );

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await waitForHttpTick();

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    save.flush(save.request.body);

    await complete;
    fixture.detectChanges();

    text =
      (
        fixture.nativeElement as HTMLElement
      ).textContent ?? '';

    expect(text).toContain(
      '1 / 2 series'
    );
    expect(text).toContain(
      'Serie 1'
    );
    expect(text).toContain(
      '80 kg · 8 reps · RIR 2'
    );
    expect(
      component.isSetExpanded(
        'dumbbell-bench-press',
        0
      )
    ).toBe(false);

    const completedSummary =
      fixture
        .nativeElement
        .querySelector(
          'button[aria-expanded="false"]'
        ) as HTMLButtonElement | null;

    expect(completedSummary)
      .toBeTruthy();

    completedSummary?.click();
    fixture.detectChanges();

    const buttons =
      Array.from(
        fixture.nativeElement.querySelectorAll(
          'button'
        ) as NodeListOf<HTMLButtonElement>
      );

    const correctButton =
      buttons.find(
        button =>
          button.textContent?.trim() ===
          'Corregir'
      );

    expect(correctButton)
      .toBeTruthy();
  });


  it('omits RIR from collapsed summaries when no RIR was recorded', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: [
            historySet(0, {
              weight: 80,
              reps: 8,
              rir: null,
              completedAt:
                '2026-08-20T15:05:00Z'
            })
          ]
        }
      ]);

    const component =
      fixture.componentInstance;

    component.openExercise(
      'dumbbell-bench-press'
    );
    fixture.detectChanges();

    expect(
      component.setSummary(
        component.activeSession()!.exercises[0],
        0
      )
    ).toBe('80 kg · 8 reps');
    expect(
      component.setSummary(
        component.activeSession()!.exercises[0],
        0
      )
    ).not.toContain('RIR 0');
  });


  it('hides RIR in training when the setting is disabled without deleting stored values', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: [
            historySet(0, {
              weight: 80,
              reps: 8,
              rir: 2,
              completedAt:
                '2026-08-20T15:05:00Z'
            })
          ]
        }
      ]);

    const component =
      fixture.componentInstance;

    component.settingsService.update({
      showRir: false
    });
    component.openExercise(
      'dumbbell-bench-press'
    );
    component.toggleSet(
      'dumbbell-bench-press',
      0
    );
    fixture.detectChanges();

    expect(pageText(fixture))
      .not.toContain('RIR objetivo');
    expect(
      fixture.nativeElement.querySelector(
        'input[aria-label="RIR realizado para Press banca con mancuernas, serie 1"]'
      )
    ).toBeNull();
    expect(
      component.setSummary(
        component.activeSession()!.exercises[0],
        0
      )
    ).toBe('80 kg · 8 reps');
    expect(
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      )?.rir
    ).toBe(2);
  });


  it('renders the latest finished exercise history by exercise id', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'active-workout',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          finishedAt:
            '2026-08-20T18:00:00Z',
          sets: [
            {
              setId:
                'active-set',
              exerciseId:
                'dumbbell-bench-press',
              setIndex: 0,
              weight: 100,
              reps: 1,
              completedAt:
                '2026-08-20T18:10:00Z'
            }
          ]
        },
        {
          workoutId:
            'older-finished',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'finished',
          finishedAt:
            '2026-08-10T18:00:00Z',
          sets: [
            {
              setId:
                'old-set',
              exerciseId:
                'dumbbell-bench-press',
              setIndex: 0,
              weight: 75,
              reps: 8,
              rir: 2,
              completedAt:
                '2026-08-10T18:10:00Z'
            }
          ]
        },
        {
          workoutId:
            'latest-finished',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'finished',
          finishedAt:
            '2026-08-18T18:00:00Z',
          sets: [
            {
              setId:
                'latest-set-1',
              exerciseId:
                'dumbbell-bench-press',
              setIndex: 0,
              weight: 82.5,
              reps: 8,
              rir: 2,
              completedAt:
                '2026-08-18T18:10:00Z'
            },
            {
              setId:
                'latest-set-2',
              exerciseId:
                'dumbbell-bench-press',
              setIndex: 1,
              weight: 82.5,
              reps: 7,
              rir: 3,
              completedAt:
                '2026-08-18T18:15:00Z'
            },
            {
              setId:
                'similar-name',
              exerciseId:
                'barbell-bench-press',
              setIndex: 0,
              weight: 120,
              reps: 5,
              completedAt:
                '2026-08-18T18:20:00Z'
            }
          ]
        }
      ]);

    const component =
      fixture.componentInstance;

    expect(
      component.getPreviousExerciseHistory(
        'dumbbell-bench-press'
      )?.workoutId
    ).toBe('latest-finished');
    expect(
      component.previousExerciseSummary(
        'dumbbell-bench-press'
      )
    ).toBe(
      '82.5 kg × 8 @2 · 82.5 kg × 7 @3'
    );

    component.openExercise(
      'dumbbell-bench-press'
    );
    fixture.detectChanges();

    const text =
      pageText(fixture);

    expect(text).toContain(
      'Última vez'
    );
    expect(text).toContain(
      '82.5 kg × 8 @2 · 82.5 kg × 7 @3'
    );
    expect(text).not.toContain(
      '100 kg × 1'
    );
    expect(text).not.toContain(
      '120 kg × 5'
    );
  });


  it('ignores in-progress workouts and exercises that only share a name', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'active-workout',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        },
        {
          workoutId:
            'unfinished-history',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          finishedAt:
            '2026-08-19T18:00:00Z',
          sets: [
            {
              setId:
                'unfinished-set',
              exerciseId:
                'dumbbell-bench-press',
              setIndex: 0,
              weight: 90,
              reps: 10,
              completedAt:
                '2026-08-19T18:10:00Z'
            }
          ]
        },
        {
          workoutId:
            'similar-name-only',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'finished',
          finishedAt:
            '2026-08-18T18:00:00Z',
          sets: [
            {
              setId:
                'similar-set',
              exerciseId:
                'barbell-bench-press',
              setIndex: 0,
              weight: 100,
              reps: 6,
              completedAt:
                '2026-08-18T18:10:00Z'
            }
          ]
        }
      ]);

    const component =
      fixture.componentInstance;

    expect(
      component.getPreviousExerciseHistory(
        'dumbbell-bench-press'
      )
    ).toBeNull();

    const session =
      component.activeSession()!;

    component.activeSession.set({
      ...session,
      exercises: [
        {
          ...session.exercises[0],
          exerciseId:
            'barbell-bench-press'
        }
      ]
    });
    component.openExercise(
      'barbell-bench-press'
    );
    fixture.detectChanges();

    expect(
      component.getPreviousExerciseHistory(
        'barbell-bench-press'
      )?.workoutId
    ).toBe('similar-name-only');
    expect(
      pageText(fixture)
    ).toContain('100 kg × 6');
  });


  it('handles different set counts and invalid historical data safely', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'active-workout',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        },
        {
          workoutId:
            'invalid-history',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'finished',
          finishedAt:
            '2026-08-19T18:00:00Z',
          sets: [
            {
              setId:
                'invalid-set',
              exerciseId:
                'dumbbell-bench-press',
              setIndex: 0,
              completedAt:
                '2026-08-19T18:10:00Z'
            }
          ]
        },
        {
          workoutId:
            'valid-history',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'finished',
          finishedAt:
            '2026-08-18T18:00:00Z',
          sets: [
            {
              setId:
                'set-1',
              exerciseId:
                'dumbbell-bench-press',
              setIndex: 0,
              weight: 70,
              reps: 10,
              completedAt:
                '2026-08-18T18:10:00Z'
            },
            {
              setId:
                'set-2',
              exerciseId:
                'dumbbell-bench-press',
              setIndex: 1,
              weight: 70,
              reps: 8,
              completedAt:
                '2026-08-18T18:15:00Z'
            },
            {
              setId:
                'extra-set',
              exerciseId:
                'dumbbell-bench-press',
              setIndex: 2,
              weight: 65,
              reps: 8,
              completedAt:
                '2026-08-18T18:20:00Z'
            }
          ]
        }
      ]);

    const component =
      fixture.componentInstance;

    expect(
      component.getPreviousSet(
        'dumbbell-bench-press',
        0
      )?.weight
    ).toBe(70);
    expect(
      component.getPreviousSet(
        'dumbbell-bench-press',
        2
      )?.weight
    ).toBe(65);

    component.openExercise(
      'dumbbell-bench-press'
    );
    fixture.detectChanges();

    const text =
      pageText(fixture);

    expect(text).toContain(
      '70 kg × 10 · 70 kg × 8 · 65 kg × 8'
    );
    expect(text).not.toContain(
      'undefined'
    );
    expect(text).not.toContain('NaN');
  });


  it('reuses only the previous weight for the matching set', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'active-workout',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        },
        {
          workoutId:
            'finished-history',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'finished',
          finishedAt:
            '2026-08-18T18:00:00Z',
          sets: [
            {
              setId:
                'history-set',
              exerciseId:
                'dumbbell-bench-press',
              setIndex: 0,
              weight: 80,
              reps: 8,
              rir: 2,
              completedAt:
                '2026-08-18T18:10:00Z'
            }
          ]
        }
      ]);

    vi.useFakeTimers();

    const component =
      fixture.componentInstance;

    component.usePreviousWeight(
      'dumbbell-bench-press',
      0
    );

    const currentSet =
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      );

    expect(currentSet?.weight)
      .toBe(80);
    expect(currentSet?.reps)
      .toBeNull();
    expect(currentSet?.rir)
      .toBeNull();
    expect(currentSet?.completedAt)
      .toBeUndefined();

    await vi.advanceTimersByTimeAsync(750);

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    expect(
      save.request.body.sets[0]
    ).toMatchObject({
      exerciseId:
        'dumbbell-bench-press',
      setIndex: 0,
      weight: 80,
      reps: null,
      rir: null
    });
    expect(
      save.request.body.sets[0]
        .completedAt
    ).toBeUndefined();

    save.flush(save.request.body);

    await vi.runOnlyPendingTimersAsync();
  });


  it('shows only mathematically clear basic progress after completing the exercise', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'active-workout',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        },
        {
          workoutId:
            'finished-history',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'finished',
          finishedAt:
            '2026-08-18T18:00:00Z',
          sets: [
            {
              setId:
                'history-set-1',
              exerciseId:
                'dumbbell-bench-press',
              setIndex: 0,
              weight: 80,
              reps: 8,
              completedAt:
                '2026-08-18T18:10:00Z'
            },
            {
              setId:
                'history-set-2',
              exerciseId:
                'dumbbell-bench-press',
              setIndex: 1,
              weight: 80,
              reps: 8,
              completedAt:
                '2026-08-18T18:15:00Z'
            }
          ]
        }
      ]);

    const component =
      fixture.componentInstance;

    expect(
      component.exerciseProgressSignal(
        component.activeSession()!.exercises[0]
      )
    ).toBe('');

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '80'
    );
    component.updateSet(
      'dumbbell-bench-press',
      0,
      'reps',
      '9'
    );
    component.updateSet(
      'dumbbell-bench-press',
      1,
      'weight',
      '80'
    );
    component.updateSet(
      'dumbbell-bench-press',
      1,
      'reps',
      '8'
    );

    let complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await waitForHttpTick();

    let save =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    save.flush(save.request.body);

    await complete;

    complete =
      component.completeSet(
        'dumbbell-bench-press',
        1
      );

    await waitForHttpTick();

    save =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    save.flush(save.request.body);

    await complete;
    fixture.detectChanges();

    expect(
      component.exerciseProgressSignal(
        component.activeSession()!.exercises[0]
      )
    ).toBe('Más volumen');
    expect(
      pageText(fixture)
    ).toContain('Más volumen');
  });


  it('does not show a progression suggestion without history', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);

    const component =
      fixture.componentInstance;
    const exercise =
      component.activeSession()!.exercises[0];

    expect(
      component.progressionRecommendation(
        exercise
      )
    ).toBeNull();
    expect(
      pageText(fixture)
    ).not.toContain('Sugerencia');
  });


  it('suggests increasing load after reaching the top of the range with enough RIR', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        finishedWorkout([
          historySet(0, {
            weight: 80,
            reps: 10,
            rir: 2
          }),
          historySet(1, {
            weight: 80,
            reps: 10,
            rir: 2
          })
        ])
      ]);

    const recommendation =
      fixture
        .componentInstance
        .progressionRecommendation(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      recommendation?.category
    ).toBe('increase_load');
    expect(
      recommendation?.title
    ).toBe(
      'Podrías subir ligeramente la carga'
    );

    fixture
      .componentInstance
      .openExercise(
        'dumbbell-bench-press'
      );
    fixture.detectChanges();

    expect(
      pageText(fixture)
    ).toContain('Sugerencia');
  });


  it('suggests adding reps when inside the range without reaching the top', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        finishedWorkout([
          historySet(0, {
            weight: 80,
            reps: 8,
            rir: 2
          }),
          historySet(1, {
            weight: 80,
            reps: 8,
            rir: 2
          })
        ])
      ]);

    const recommendation =
      fixture
        .componentInstance
        .progressionRecommendation(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      recommendation?.category
    ).toBe('increase_reps');
    expect(
      recommendation?.title
    ).toBe(
      'Intenta una repetición más'
    );
  });


  it('does not suggest increasing load when reps are low and RIR is near failure', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        finishedWorkout([
          historySet(0, {
            weight: 80,
            reps: 5,
            rir: 0
          }),
          historySet(1, {
            weight: 80,
            reps: 6,
            rir: 1
          })
        ])
      ]);

    const recommendation =
      fixture
        .componentInstance
        .progressionRecommendation(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      recommendation?.category
    ).toBe('consider_reduce');
    expect(
      recommendation?.title
    ).toBe(
      'Mantén o baja un poco la carga'
    );
  });


  it('keeps the recommendation conservative after a strong drop between sets', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        finishedWorkout([
          historySet(0, {
            weight: 80,
            reps: 10,
            rir: 2
          }),
          historySet(1, {
            weight: 80,
            reps: 6,
            rir: 2
          })
        ])
      ]);

    const recommendation =
      fixture
        .componentInstance
        .progressionRecommendation(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      recommendation?.category
    ).toBe('maintain');
    expect(
      recommendation?.title
    ).toBe('Mantén la carga');
  });


  it('omits the suggestion when RIR or a rep range is missing', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        finishedWorkout([
          historySet(0, {
            weight: 80,
            reps: 10
          }),
          historySet(1, {
            weight: 80,
            reps: 10,
            rir: 2
          })
        ])
      ]);

    const component =
      fixture.componentInstance;
    const exercise =
      component.activeSession()!.exercises[0];

    expect(
      component.progressionRecommendation(
        exercise
      )
    ).toBeNull();

    component.activeSession.set({
      ...component.activeSession()!,
      exercises: [
        {
          ...exercise,
          target:
            '10'
        }
      ]
    });

    expect(
      component.progressionRecommendation(
        component.activeSession()!.exercises[0]
      )
    ).toBeNull();
  });


  it('does not recommend increasing kilograms for zero-weight history', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        finishedWorkout([
          historySet(0, {
            weight: 0,
            reps: 10,
            rir: 2
          }),
          historySet(1, {
            weight: 0,
            reps: 10,
            rir: 2
          })
        ])
      ]);

    const recommendation =
      fixture
        .componentInstance
        .progressionRecommendation(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      recommendation?.category
    ).toBe('increase_reps');
    expect(
      recommendation?.title
    ).toBe(
      'Progresa sin subir kg'
    );
  });


  it('keeps progression recommendations read-only', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        finishedWorkout([
          historySet(0, {
            weight: 80,
            reps: 10,
            rir: 2
          }),
          historySet(1, {
            weight: 80,
            reps: 10,
            rir: 2
          })
        ])
      ]);

    const component =
      fixture.componentInstance;
    const before =
      JSON.stringify(
        component.activeWorkout()
      );

    component.progressionRecommendation(
      component.activeSession()!.exercises[0]
    );
    fixture.detectChanges();

    expect(
      JSON.stringify(
        component.activeWorkout()
      )
    ).toBe(before);
    http.expectNone(
      `${environment.apiUrl}/workouts/active-workout`
    );
  });


  it('calculates Epley e1RM only for externally loaded sets', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);
    const component =
      fixture.componentInstance;
    const exercise =
      component.activeSession()!.exercises[0];

    expect(
      component.estimatedOneRepMax(
        exercise,
        historySet(0, {
          weight: 90,
          reps: 10
        })
      )
    ).toBe(120);

    expect(
      component.estimatedOneRepMax(
        {
          ...exercise,
          recordTypes:
            ['duration']
        },
        historySet(0, {
          weight: 90,
          reps: 10
        })
      )
    ).toBeNull();

    expect(
      component.estimatedOneRepMax(
        {
          ...exercise,
          recordTypes:
            ['bodyweight_reps']
        },
        historySet(0, {
          weight: 90,
          reps: 10
        })
      )
    ).toBeNull();

    expect(
      component.estimatedOneRepMax(
        exercise,
        historySet(0, {
          weight: 0,
          reps: 10
        })
      )
    ).toBeNull();
  });


  it('returns insufficient today performance with fewer than 3 previous exposures', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 80,
              reps: 8,
              rir: 2,
              completedAt:
                '2026-08-21T18:00:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);

    const performance =
      fixture
        .componentInstance
        .todayPerformance(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      performance.status
    ).toBe('insufficient_data');
    expect(
      performance.previousExposures
    ).toBe(2);
  });


  it('does not classify below usual from one valid set today', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 70,
              reps: 6,
              rir: 0,
              completedAt:
                '2026-08-21T18:00:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);

    const performance =
      fixture
        .componentInstance
        .todayPerformance(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      performance.status
    ).toBe('insufficient_data');
    expect(
      performance.summary
    ).toContain('preliminar');
  });


  it('classifies normal today performance within recent e1RM noise', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 80,
              reps: 10,
              rir: 2,
              completedAt:
                '2026-08-21T18:00:00Z'
            }),
            historySet(1, {
              weight: 80,
              reps: 10,
              rir: 2,
              completedAt:
                '2026-08-21T18:05:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 81,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);

    expect(
      fixture
        .componentInstance
        .todayPerformance(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        )
        .status
    ).toBe('normal');
  });


  it('classifies clear consistent improvement as above usual', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 90,
              reps: 10,
              rir: 2,
              completedAt:
                '2026-08-21T18:00:00Z'
            }),
            historySet(1, {
              weight: 90,
              reps: 10,
              rir: 2,
              completedAt:
                '2026-08-21T18:05:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);

    const performance =
      fixture
        .componentInstance
        .todayPerformance(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      performance.status
    ).toBe('above_usual');
    expect(
      performance.label
    ).toBe('Mejor de lo habitual');
  });


  it('classifies clear consistent drop with comparable effort as below usual', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 70,
              reps: 8,
              rir: 0,
              completedAt:
                '2026-08-21T18:00:00Z'
            }),
            historySet(1, {
              weight: 70,
              reps: 8,
              rir: 0,
              completedAt:
                '2026-08-21T18:05:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);

    expect(
      fixture
        .componentInstance
        .todayPerformance(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        )
        .status
    ).toBe('below_usual');
  });


  it('does not classify below usual from one isolated bad set', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 70,
              reps: 6,
              rir: 0,
              completedAt:
                '2026-08-21T18:00:00Z'
            }),
            historySet(1, {
              weight: 80,
              reps: 10,
              rir: 2,
              completedAt:
                '2026-08-21T18:05:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);

    expect(
      fixture
        .componentInstance
        .todayPerformance(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        )
        .status
    ).toBe('normal');
  });


  it('does not flag a false drop when today has much higher RIR', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 70,
              reps: 8,
              rir: 5,
              completedAt:
                '2026-08-21T18:00:00Z'
            }),
            historySet(1, {
              weight: 70,
              reps: 8,
              rir: 5,
              completedAt:
                '2026-08-21T18:05:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);

    expect(
      fixture
        .componentInstance
        .todayPerformance(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        )
        .status
    ).toBe('normal');
  });


  it('classifies same load and fewer reps with equal or lower RIR as below usual', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 80,
              reps: 6,
              rir: 0,
              completedAt:
                '2026-08-21T18:00:00Z'
            }),
            historySet(1, {
              weight: 80,
              reps: 6,
              rir: 0,
              completedAt:
                '2026-08-21T18:05:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);

    expect(
      fixture
        .componentInstance
        .todayPerformance(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        )
        .status
    ).toBe('below_usual');
  });


  it('returns insufficient today performance for bodyweight and duration exercises', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 80,
              reps: 10,
              rir: 2,
              completedAt:
                '2026-08-21T18:00:00Z'
            }),
            historySet(1, {
              weight: 80,
              reps: 10,
              rir: 2,
              completedAt:
                '2026-08-21T18:05:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);
    const component =
      fixture.componentInstance;
    const exercise =
      component.activeSession()!.exercises[0];

    expect(
      component.todayPerformance({
        ...exercise,
        recordTypes:
          ['bodyweight_reps']
      }).status
    ).toBe('insufficient_data');
    expect(
      component.todayPerformance({
        ...exercise,
        recordTypes:
          ['duration']
      }).status
    ).toBe('insufficient_data');
  });


  it('blocks increase load recommendation when today is below usual', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 70,
              reps: 8,
              rir: 0,
              completedAt:
                '2026-08-21T18:00:00Z'
            }),
            historySet(1, {
              weight: 70,
              reps: 8,
              rir: 0,
              completedAt:
                '2026-08-21T18:05:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);

    const recommendation =
      fixture
        .componentInstance
        .progressionRecommendation(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      recommendation?.category
    ).toBe('consider_reduce');
    expect(
      recommendation?.reason
    ).toContain('rendimiento de hoy');
  });


  it('keeps normal today performance recommendation unchanged', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 80,
              reps: 10,
              rir: 2,
              completedAt:
                '2026-08-21T18:00:00Z'
            }),
            historySet(1, {
              weight: 80,
              reps: 10,
              rir: 2,
              completedAt:
                '2026-08-21T18:05:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);

    expect(
      fixture
        .componentInstance
        .progressionRecommendation(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        )
        ?.category
    ).toBe('increase_load');
  });


  it('does not force an increase load recommendation when today is above usual', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 90,
              reps: 8,
              rir: 2,
              completedAt:
                '2026-08-21T18:00:00Z'
            }),
            historySet(1, {
              weight: 90,
              reps: 8,
              rir: 2,
              completedAt:
                '2026-08-21T18:05:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 8,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 8,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 8,
            rir: 2
          }
        )
      ]);
    const component =
      fixture.componentInstance;
    const exercise =
      component.activeSession()!.exercises[0];

    expect(
      component.todayPerformance(
        exercise
      ).status
    ).toBe('above_usual');
    expect(
      component.progressionRecommendation(
        exercise
      )?.category
    ).toBe('increase_reps');
  });


  it('shows today performance without autosaving and recalculates restored workouts', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 70,
              reps: 8,
              rir: 0,
              completedAt:
                '2026-08-21T18:00:00Z'
            }),
            historySet(1, {
              weight: 70,
              reps: 8,
              rir: 0,
              completedAt:
                '2026-08-21T18:05:00Z'
            })
          ]
        },
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);
    const component =
      fixture.componentInstance;
    const before =
      JSON.stringify(
        component.activeWorkout()
      );

    component.openExercise(
      'dumbbell-bench-press'
    );
    fixture.detectChanges();

    expect(
      pageText(fixture)
    ).toContain('Estado de hoy');
    expect(
      component.todayPerformance(
        component.activeSession()!.exercises[0]
      ).status
    ).toBe('below_usual');
    expect(
      JSON.stringify(
        component.activeWorkout()
      )
    ).toBe(before);
    http.expectNone(
      `${environment.apiUrl}/workouts/active-workout`
    );
  });


  it('uses the best e1RM per finished execution and the latest 3-5 exposures', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        trendWorkout(
          'ignored-old',
          '2026-08-10T18:00:00Z',
          {
            weight: 200,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 80,
            reps: 8,
            rir: 2
          }
        ),
        finishedWorkout(
          [
            historySet(0, {
              weight: 82,
              reps: 8,
              rir: 2,
              completedAt:
                '2026-08-12T18:00:00Z'
            }),
            historySet(1, {
              weight: 90,
              reps: 10,
              rir: 2,
              completedAt:
                '2026-08-12T18:00:00Z'
            })
          ],
          {
            workoutId:
              'w2',
            finishedAt:
              '2026-08-12T18:00:00Z'
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 92,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w4',
          '2026-08-14T18:00:00Z',
          {
            weight: 94,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w5',
          '2026-08-15T18:00:00Z',
          {
            weight: 96,
            reps: 10,
            rir: 2
          }
        )
      ]);

    const trend =
      fixture
        .componentInstance
        .exerciseRecentTrend(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      trend.exposures
    ).toBe(5);
    expect(
      trend.status
    ).toBe('improving');
    expect(
      trend.e1rmValues.map(value =>
        Math.round(value)
      )
    ).toEqual([
      101,
      120,
      123,
      125,
      128
    ]);
  });


  it('classifies stable and ignores tiny e1RM noise', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 90,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 90.5,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 91,
            reps: 10,
            rir: 2
          }
        )
      ]);

    const trend =
      fixture
        .componentInstance
        .exerciseRecentTrend(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      trend.status
    ).toBe('stable');
  });


  it('classifies declining when recent performance falls with low RIR', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 90,
            reps: 10,
            rir: 3
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 87.5,
            reps: 8,
            rir: 1
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 85,
            reps: 7,
            rir: 0
          }
        )
      ]);

    const trend =
      fixture
        .componentInstance
        .exerciseRecentTrend(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      trend.status
    ).toBe('declining');
  });


  it('does not force declining from one isolated bad session among good exposures', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 90,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'bad-day',
          '2026-08-12T18:00:00Z',
          {
            weight: 80,
            reps: 6,
            rir: 0
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 91,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w4',
          '2026-08-14T18:00:00Z',
          {
            weight: 92,
            reps: 10,
            rir: 2
          }
        )
      ]);

    const trend =
      fixture
        .componentInstance
        .exerciseRecentTrend(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      trend.status
    ).toBe('improving');
  });


  it('modulates load progression when the recent trend is declining', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 100,
            reps: 10,
            rir: 3
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 90,
            reps: 7,
            rir: 0
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 80,
            reps: 10,
            rir: 2
          }
        )
      ]);

    const recommendation =
      fixture
        .componentInstance
        .progressionRecommendation(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(
      recommendation?.category
    ).toBe('consider_reduce');
  });


  it('shows compact trend copy without autosaving', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        trendWorkout(
          'w1',
          '2026-08-11T18:00:00Z',
          {
            weight: 90,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w2',
          '2026-08-12T18:00:00Z',
          {
            weight: 92,
            reps: 10,
            rir: 2
          }
        ),
        trendWorkout(
          'w3',
          '2026-08-13T18:00:00Z',
          {
            weight: 94,
            reps: 10,
            rir: 2
          }
        )
      ]);
    const before =
      JSON.stringify(
        fixture
          .componentInstance
          .activeWorkout()
      );

    fixture
      .componentInstance
      .openExercise(
        'dumbbell-bench-press'
      );
    fixture.detectChanges();

    expect(
      pageText(fixture)
    ).toContain(
      'Tendencia · Mejorando'
    );
    expect(
      pageText(fixture)
    ).toContain('e1RM');
    expect(
      JSON.stringify(
        fixture
          .componentInstance
          .activeWorkout()
      )
    ).toBe(before);
    http.expectNone(
      `${environment.apiUrl}/workouts/active-workout`
    );
  });


  it('uses exercise id and ignores in-progress history for progression suggestions', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        finishedWorkout(
          [
            historySet(0, {
              exerciseId:
                'barbell-bench-press',
              weight: 100,
              reps: 10,
              rir: 2
            }),
            historySet(1, {
              exerciseId:
                'barbell-bench-press',
              weight: 100,
              reps: 10,
              rir: 2
            })
          ],
          {
            workoutId:
              'similar-name-history'
          }
        ),
        finishedWorkout(
          [
            historySet(0, {
              weight: 90,
              reps: 10,
              rir: 2
            }),
            historySet(1, {
              weight: 90,
              reps: 10,
              rir: 2
            })
          ],
          {
            workoutId:
              'unfinished-history',
            status:
              'in_progress',
            finishedAt:
              '2026-08-19T18:00:00Z'
          }
        )
      ]);

    const recommendation =
      fixture
        .componentInstance
        .progressionRecommendation(
          fixture
            .componentInstance
            .activeSession()!
            .exercises[0]
        );

    expect(recommendation)
      .toBeNull();
  });


  it('does not clear the active workout when finish persistence fails and allows retry', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    const component =
      fixture.componentInstance;

    const first =
      component.finishWorkout();
    const second =
      component.finishWorkout();

    await waitForHttpTick();

    const failed =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    http.expectNone(
      `${environment.apiUrl}/workouts/workout-1`
    );

    expect(failed.request.body.status)
      .toBe('finished');

    failed.flush(
      {
        detail:
          'Workouts service is unavailable'
      },
      {
        status: 502,
        statusText: 'Bad Gateway'
      }
    );

    await Promise.all([
      first,
      second
    ]);

    expect(
      component.activeWorkout()
        ?.status
    ).toBe('in_progress');
    expect(
      component.workoutError()
    ).toBe(
      'Workouts service is unavailable'
    );

    const retry =
      component.finishWorkout();

    await waitForHttpTick();

    const saved =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    saved.flush(
      saved.request.body
    );

    await retry;

    expect(
      component.activeWorkout()
    ).toBeNull();
    expect(
      component.activeSession()
    ).toBeNull();
    const sessionState =
      TestBed.inject(
        WorkoutSessionStateService
      );

    expect(sessionState.state())
      .toBe('idle');
    expect(
      sessionState.shouldHideBottomNav()
    ).toBe(false);
  });


  it('asks for confirmation before finishing from the UI action', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);

    const component =
      fixture.componentInstance;
    const confirm =
      vi.spyOn(
        window,
        'confirm'
      )
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

    component.requestFinishWorkout();

    expect(confirm)
      .toHaveBeenCalledWith(
        '¿Finalizar este entrenamiento?'
      );
    http.expectNone(
      `${environment.apiUrl}/workouts/active-workout`
    );

    component.requestFinishWorkout();
    await waitForHttpTick();

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    save.flush(save.request.body);
    await fixture.whenStable();
  });


  it('shows a safe cancellation action and asks for confirmation first', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);

    expect(
      pageText(fixture)
    ).toContain(
      'Cancelar entrenamiento'
    );

    const cancelButton =
      Array
        .from(
          fixture.nativeElement.querySelectorAll(
            'button'
          )
        )
        .find(
          (button: any) =>
            button.textContent.includes(
              'Cancelar entrenamiento'
            )
        ) as HTMLButtonElement;

    cancelButton.click();
    fixture.detectChanges();

    expect(
      pageText(fixture)
    ).toContain(
      '¿Cancelar este entrenamiento?'
    );
    expect(
      fixture.componentInstance.activeWorkout()
    ).toBeTruthy();

    http.expectNone(
      `${environment.apiUrl}/workouts/active-workout`
    );
  });


  it('closes cancellation confirmation and keeps the workout when continuing', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);

    const component =
      fixture.componentInstance;

    component.openCancelWorkoutConfirmation();
    fixture.detectChanges();

    const keepTrainingButton =
      Array
        .from(
          fixture.nativeElement.querySelectorAll(
            'button'
          )
        )
        .find(
          (button: any) =>
            button.textContent.includes(
              'Seguir entrenando'
            )
        ) as HTMLButtonElement;

    keepTrainingButton.click();
    fixture.detectChanges();

    expect(
      component.cancelConfirmationOpen()
    ).toBe(false);
    expect(
      component.activeWorkout()
        ?.workoutId
    ).toBe('active-workout');
    http.expectNone(
      `${environment.apiUrl}/workouts/active-workout`
    );
  });


  it('cancels exactly once and returns to session selection', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          sets: [
            historySet(0, {
              weight: 80,
              reps: 8
            })
          ]
        }
      ]);

    const component =
      fixture.componentInstance;

    component.openCancelWorkoutConfirmation();

    const first =
      component.cancelWorkout();
    const second =
      component.cancelWorkout();

    await waitForHttpTick();

    const request =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    http.expectNone(
      `${environment.apiUrl}/workouts/active-workout`
    );

    expect(request.request.method)
      .toBe('DELETE');

    request.flush(null);

    await Promise.all([
      first,
      second
    ]);
    fixture.detectChanges();

    expect(
      component.activeWorkout()
    ).toBeNull();
    expect(
      component.activeSession()
    ).toBeNull();
    const sessionState =
      TestBed.inject(
        WorkoutSessionStateService
      );

    expect(sessionState.state())
      .toBe('idle');
    expect(
      sessionState.shouldHideBottomNav()
    ).toBe(false);
    expect(
      component.workoutHistory()
        .some(
          workout =>
            workout.workoutId ===
            'active-workout'
        )
    ).toBe(false);
    expect(
      pageText(fixture)
    ).toContain('Elige tu sesión');
  });


  it('neutralizes a pending autosave when cancelling', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);

    vi.useFakeTimers();

    const component =
      fixture.componentInstance;

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '40'
    );

    component.openCancelWorkoutConfirmation();

    const cancel =
      component.cancelWorkout();

    await flushPromises();

    const request =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    expect(request.request.method)
      .toBe('DELETE');

    request.flush(null);
    await cancel;

    await vi.advanceTimersByTimeAsync(1000);

    http.expectNone(
      `${environment.apiUrl}/workouts/active-workout`
    );
  });


  it('waits for an in-flight autosave before deleting without recreating the workout', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);

    vi.useFakeTimers();

    const component =
      fixture.componentInstance;

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '40'
    );

    await vi.advanceTimersByTimeAsync(750);

    const autosave =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '45'
    );

    const cancel =
      component.cancelWorkout();

    autosave.flush(
      autosave.request.body
    );

    await flushPromises();
    await flushPromises();
    const deleteTick =
      waitForHttpTick();
    await vi.advanceTimersByTimeAsync(0);
    await deleteTick;

    const deletion =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    expect(deletion.request.method)
      .toBe('DELETE');

    deletion.flush(null);

    await cancel;
    await vi.advanceTimersByTimeAsync(1000);

    http.expectNone(
      `${environment.apiUrl}/workouts/active-workout`
    );
    expect(
      component.activeWorkout()
    ).toBeNull();
  });


  it('clears the rest timer when cancelling', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);

    vi.useFakeTimers();
    vi.setSystemTime(
      new Date(
        '2026-08-20T15:00:00Z'
      )
    );

    const component =
      fixture.componentInstance;

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await flushPromises();

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    save.flush(save.request.body);
    await complete;

    expect(
      component.restTimer()
    ).toBeTruthy();

    const cancel =
      component.cancelWorkout();

    await flushPromises();

    const deletion =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    deletion.flush(null);
    await cancel;

    expect(
      component.restTimer()
    ).toBeNull();
  });


  it('keeps the active workout and allows retry when cancellation fails', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);

    const component =
      fixture.componentInstance;

    component.openCancelWorkoutConfirmation();

    const failedCancel =
      component.cancelWorkout();

    await waitForHttpTick();

    const failed =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    failed.flush(
      {
        detail:
          'Workouts service is unavailable'
      },
      {
        status: 502,
        statusText: 'Bad Gateway'
      }
    );

    await failedCancel;

    expect(
      component.activeWorkout()
        ?.workoutId
    ).toBe('active-workout');
    expect(
      component.cancelConfirmationOpen()
    ).toBe(true);
    expect(
      component.workoutError()
    ).toBe(
      'Workouts service is unavailable'
    );

    const retry =
      component.cancelWorkout();

    await waitForHttpTick();

    const deletion =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    deletion.flush(null);
    await retry;

    expect(
      component.activeWorkout()
    ).toBeNull();
  });


  it('can start the same session again after cancelling and keeps history/progression clean', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout(),
        finishedWorkout([
          historySet(0, {
            weight: 70,
            reps: 8,
            rir: 2
          }),
          historySet(1, {
            weight: 70,
            reps: 8,
            rir: 2
          })
        ])
      ]);

    const component =
      fixture.componentInstance;

    const cancel =
      component.cancelWorkout();

    await waitForHttpTick();

    const deletion =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    deletion.flush(null);
    await cancel;

    expect(
      component.workoutHistory()
        .some(
          workout =>
            workout.workoutId ===
            'active-workout'
        )
    ).toBe(false);

    const session =
      component.routine()!.sessions[0];

    const restart =
      component.startWorkout(session);

    await waitForHttpTick();

    const create =
      http.expectOne(
        `${environment.apiUrl}/workouts`
      );

    expect(create.request.method)
      .toBe('POST');

    create.flush({
      ...create.request.body,
      workoutId:
        'restarted-workout',
      startedAt:
        '2026-08-20T16:00:00Z'
    });

    await restart;

    expect(
      component.activeWorkout()
        ?.workoutId
    ).toBe('restarted-workout');
    expect(
      component.getPreviousExerciseHistory(
        'dumbbell-bench-press'
      )?.workoutId
    ).toBe('finished-history');
    expect(
      component.progressionRecommendation(
        component.activeSession()!.exercises[0]
      )
    ).toBeTruthy();
  });


  it('debounces quick set edits into one autosave with the latest state', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();

    const component =
      fixture.componentInstance;

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '40'
    );
    component.updateSet(
      'dumbbell-bench-press',
      0,
      'reps',
      '8'
    );
    component.updateSet(
      'dumbbell-bench-press',
      0,
      'rir',
      '2'
    );

    await vi.advanceTimersByTimeAsync(749);

    http.expectNone(
      `${environment.apiUrl}/workouts/workout-1`
    );

    await vi.advanceTimersByTimeAsync(1);

    const request =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    expect(request.request.method)
      .toBe('PUT');
    expect(request.request.body.sets)
      .toMatchObject([
        {
          exerciseId:
            'dumbbell-bench-press',
          setIndex: 0,
          weight: 40,
          reps: 8,
          rir: 2
        }
      ]);

    request.flush(
      request.request.body
    );

    await vi.runOnlyPendingTimersAsync();

    expect(
      component.autosaveStatus()
    ).toBe('saved');
  });


  it('keeps in-memory data after autosave failure and retries on the next change', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();

    const component =
      fixture.componentInstance;

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '42'
    );

    await vi.advanceTimersByTimeAsync(750);

    const failed =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    failed.flush(
      {
        detail:
          'temporary failure'
      },
      {
        status: 502,
        statusText: 'Bad Gateway'
      }
    );

    await vi.runOnlyPendingTimersAsync();

    expect(
      component.getCurrentSet(
        'dumbbell-bench-press',
        0
      )?.weight
    ).toBe(42);
    expect(
      component.autosaveStatus()
    ).toBe('error');

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'reps',
      '9'
    );

    await vi.advanceTimersByTimeAsync(750);

    const retry =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    expect(
      retry.request.body.sets[0]
    ).toMatchObject({
      weight: 42,
      reps: 9
    });

    retry.flush(
      retry.request.body
    );

    await vi.runOnlyPendingTimersAsync();

    expect(
      component.autosaveStatus()
    ).toBe('saved');
  });


  it('finishing waits for an in-flight autosave and persists the latest finished state once', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();

    const component =
      fixture.componentInstance;

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '40'
    );

    await vi.advanceTimersByTimeAsync(750);

    const autosave =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '45'
    );

    const finish =
      component.finishWorkout();

    autosave.flush(
      autosave.request.body
    );

    await vi.runOnlyPendingTimersAsync();

    const finalSave =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    expect(finalSave.request.body.status)
      .toBe('finished');
    expect(
      finalSave.request.body.sets[0]
        .weight
    ).toBe(45);

    finalSave.flush(
      finalSave.request.body
    );

    await finish;
    await vi.advanceTimersByTimeAsync(1000);

    http.expectNone(
      `${environment.apiUrl}/workouts/workout-1`
    );
    expect(
      component.activeWorkout()
    ).toBeNull();
  });


  it('flushes dirty state on destroy and cleans the pending debounce timer', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();

    fixture
      .componentInstance
      .updateSet(
        'dumbbell-bench-press',
        0,
        'weight',
        '40'
      );

    fixture.destroy();

    await vi.advanceTimersByTimeAsync(0);

    const destroySave =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    expect(
      destroySave.request.body.sets[0]
        .weight
    ).toBe(40);

    destroySave.flush(
      destroySave.request.body
    );

    await vi.advanceTimersByTimeAsync(1000);

    http.expectNone(
      `${environment.apiUrl}/workouts/workout-1`
    );
  });



  it('uses the session rest override instead of the exercise rest time', async () => {
    const fixture =
      await createLoadedTrain([
        {
          ...activeWorkout(),
          restOverrideSeconds: 60
        }
      ]);

    const component =
      fixture.componentInstance;

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'weight',
      '80'
    );

    component.updateSet(
      'dumbbell-bench-press',
      0,
      'reps',
      '8'
    );

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await waitForHttpTick();

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/active-workout`
      );

    save.flush(save.request.body);

    await complete;

    expect(
      component.restTimer()?.remainingSeconds
    ).toBe(60);
  });


  it('can adjust and clear the session rest override without changing the routine', async () => {
    const fixture =
      await createLoadedTrain([
        activeWorkout()
      ]);

    const component =
      fixture.componentInstance;

    vi.spyOn(
      component as any,
      'scheduleAutosave'
    ).mockImplementation(() => {});

    const originalRest =
      component.activeSession()
        ?.exercises[0]
        .restSeconds;

    component.setSessionRestOverride(
      150
    );

    expect(
      component.sessionRestOverrideSeconds()
    ).toBe(150);

    component.adjustSessionRestOverride(
      30
    );

    expect(
      component.sessionRestOverrideSeconds()
    ).toBe(180);

    component.adjustSessionRestOverride(
      -30
    );

    expect(
      component.sessionRestOverrideSeconds()
    ).toBe(150);

    component.clearSessionRestOverride();

    expect(
      component.sessionRestOverrideSeconds()
    ).toBeNull();

    expect(
      component.activeSession()
        ?.exercises[0]
        .restSeconds
    ).toBe(originalRest);

    (component as any)
      .cancelAutosaveTimer();

    (component as any)
      .persistedEditVersion =
        (component as any)
          .workoutEditVersion;
  });


  it('starts a rest timer from the completed exercise rest seconds', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();
    vi.setSystemTime(
      new Date(
        '2026-08-20T15:00:00Z'
      )
    );

    const component =
      fixture.componentInstance;

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    expect(
      component.restTimerLabel()
    ).toBe('02:00');
    expect(
      component.restTimer()
        ?.exerciseName
    ).toBe(
      'Press banca con mancuernas'
    );

    await flushPromises();

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    save.flush(save.request.body);

    await complete;

    await vi.advanceTimersByTimeAsync(
      30_000
    );

    expect(
      component.restTimerLabel()
    ).toBe('01:30');

    http.expectNone(
      `${environment.apiUrl}/workouts/workout-1`
    );
  });


  it('renders duration exercises with duration fields instead of kg and reps', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    const component =
      fixture.componentInstance;

    component.activeSession.set({
      ...component.activeSession()!,
      exercises: [
        {
          exerciseId:
            'plank',
          name:
            'Plancha',
          sets: 1,
          target:
            '45-60 s',
          recordTypes:
            ['duration'],
          targetRir: {
            min: 2,
            max: 3
          },
          restSeconds:
            60
        }
      ]
    });

    component.openExercise('plank');
    component.toggleSet('plank', 0);
    fixture.detectChanges();

    expect(
      pageText(fixture)
    ).toContain(
      'Duración objetivo 45-60 s'
    );
    expect(
      pageText(fixture)
    ).not.toContain(
      'Reps objetivo 45-60 s'
    );

    const inputLabels =
      Array
        .from(
          fixture.nativeElement.querySelectorAll(
            '.set-inputs label > span'
          )
        )
        .map(
          (element: any) =>
            element.textContent.trim()
        );

    expect(inputLabels)
      .toEqual([
        'Duración',
        'RIR'
      ]);
    expect(
      pageText(fixture)
    ).toContain('Iniciar');
    expect(
      pageText(fixture)
    ).toContain('00:00');
  });


  it('runs duration exercises as a stopwatch and copies elapsed seconds without completing', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();
    vi.setSystemTime(
      new Date(
        '2026-08-20T15:00:00Z'
      )
    );

    const component =
      fixture.componentInstance;

    component.activeSession.set({
      ...component.activeSession()!,
      exercises: [
        {
          exerciseId:
            'plank',
          name:
            'Plancha',
          sets: 1,
          target:
            '45-60 s',
          recordTypes:
            ['duration'],
          targetRir: {
            min: 2,
            max: 3
          },
          restSeconds:
            60
        }
      ]
    });

    component.toggleSet('plank', 0);
    component.startTimedSet(
      'plank',
      0
    );

    fixture.detectChanges();

    expect(
      pageText(fixture)
    ).toContain('Pausar');
    expect(
      pageText(fixture)
    ).toContain('Finalizar');
    expect(
      component.setTimerLabel(
        'plank',
        0
      )
    ).toBe('00:00');

    await vi.advanceTimersByTimeAsync(
      10_000
    );

    expect(
      component.setTimerLabel(
        'plank',
        0
      )
    ).toBe('00:10');

    component.pauseSetTimer();

    await vi.advanceTimersByTimeAsync(
      5_000
    );

    expect(
      component.setTimerLabel(
        'plank',
        0
      )
    ).toBe('00:10');

    component.resumeSetTimer();

    await vi.advanceTimersByTimeAsync(
      37_000
    );

    expect(
      component.setTimerStatusLabel(
        component.activeSession()!.exercises[0],
        0
      )
    ).toBe(
      'Objetivo mínimo alcanzado'
    );
    expect(
      component.setTimerLabel(
        'plank',
        0
      )
    ).toBe('00:47');

    component.finishTimedSet();

    expect(
      component.getCurrentSet(
        'plank',
        0
      )?.durationSeconds
    ).toBe(47);
    expect(
      component.isSetCompleted(
        'plank',
        0
      )
    ).toBe(false);
    expect(
      component.restTimer()
    ).toBeNull();

    http.expectNone(
        `${environment.apiUrl}/workouts/workout-1`
      );

    component.updateSet(
      'plank',
      0,
      'rir',
      '2'
    );

    const complete =
      component.completeSet(
        'plank',
        0
      );

    await flushPromises();

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    expect(save.request.body.sets[0])
      .toMatchObject({
        exerciseId:
          'plank',
        setIndex: 0,
        durationSeconds: 47,
        rir: 2
      });
    expect(
      save.request.body.sets[0].completedAt
    ).toBeTruthy();

    save.flush(save.request.body);

    await complete;

    expect(
      component.setSummary(
        component.activeSession()!.exercises[0],
        0
      )
    ).toBe('47 s · RIR 2');

    expect(
      component.restTimerLabel()
    ).toBe('01:00');
    expect(
      component.setTimer()
    ).toBeNull();
  });


  it('keeps the duration stopwatch running beyond the upper target', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();
    vi.setSystemTime(
      new Date(
        '2026-08-20T15:00:00Z'
      )
    );

    const component =
      fixture.componentInstance;

    component.activeSession.set({
      ...component.activeSession()!,
      exercises: [
        {
          exerciseId:
            'plank',
          name:
            'Plancha',
          sets: 1,
          target:
            '45-60 s',
          recordTypes:
            ['duration'],
          restSeconds:
            60
        }
      ]
    });

    component.startTimedSet(
      'plank',
      0
    );

    await vi.advanceTimersByTimeAsync(
      62_000
    );

    expect(
      component.setTimerLabel(
        'plank',
        0
      )
    ).toBe('01:02');
    expect(
      component.setTimerStatusLabel(
        component.activeSession()!.exercises[0],
        0
      )
    ).toBe(
      'Parte superior del rango alcanzada'
    );
    expect(
      component.setTimer()
      ?.status
    ).toBe('running');
  });


  it('cleans the duration stopwatch interval on destroy', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();
    const clearIntervalSpy =
      vi.spyOn(
        globalThis,
        'clearInterval'
      );

    const component =
      fixture.componentInstance;

    component.activeSession.set({
      ...component.activeSession()!,
      exercises: [
        {
          exerciseId:
            'plank',
          name:
            'Plancha',
          sets: 1,
          target:
            '45-60 s',
          recordTypes:
            ['duration']
        }
      ]
    });

    component.startTimedSet(
      'plank',
      0
    );

    await vi.advanceTimersByTimeAsync(
      1000
    );

    fixture.destroy();

    expect(
      clearIntervalSpy
    ).toHaveBeenCalled();
    expect(
      component.setTimer()
    ).toBeNull();
  });


  it('does not start a rest timer for zero or missing rest', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();

    const component =
      fixture.componentInstance;

    const session =
      component.activeSession()!;

    component.activeSession.set({
      ...session,
      exercises: [
        ...session.exercises.map(
          exercise => ({
            ...exercise,
            restSeconds: 0
          })
        ),
        {
          exerciseId:
            'plank',
          name:
            'Plancha',
          sets: 1,
          target:
            '30s'
        }
      ]
    });

    let complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    expect(
      component.restTimer()
    ).toBeNull();

    await flushPromises();

    let save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    save.flush(save.request.body);

    await complete;

    complete =
      component.completeSet(
        'plank',
        0
      );

    expect(
      component.restTimer()
    ).toBeNull();

    await flushPromises();

    save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    save.flush(save.request.body);

    await complete;
  });


  it('respects the automatic rest timer setting', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    const component =
      fixture.componentInstance;

    component.settingsService.update({
      automaticRestTimer: false
    });

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await waitForHttpTick();

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    save.flush(save.request.body);

    await complete;

    expect(component.restTimer())
      .toBeNull();
  });


  it('replaces the active rest timer when another set is completed', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();
    vi.setSystemTime(
      new Date(
        '2026-08-20T15:00:00Z'
      )
    );

    const component =
      fixture.componentInstance;

    const session =
      component.activeSession()!;

    component.activeSession.set({
      ...session,
      exercises: [
        ...session.exercises,
        {
          exerciseId:
            'seated-row',
          name:
            'Remo sentado',
          sets: 1,
          target:
            '10-12',
          restSeconds:
            60
        }
      ]
    });

    let complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await flushPromises();

    let save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    save.flush(save.request.body);

    await complete;

    expect(
      component.restTimerLabel()
    ).toBe('02:00');

    await vi.advanceTimersByTimeAsync(
      10_000
    );

    complete =
      component.completeSet(
        'seated-row',
        0
      );

    await flushPromises();

    save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    save.flush(save.request.body);

    await complete;

    expect(
      component.restTimer()
        ?.exerciseId
    ).toBe('seated-row');
    expect(
      component.restTimerLabel()
    ).toBe('01:00');
  });


  it('supports adding, reducing, and skipping rest time without saving', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();
    vi.setSystemTime(
      new Date(
        '2026-08-20T15:00:00Z'
      )
    );

    const component =
      fixture.componentInstance;

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await flushPromises();

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    save.flush(save.request.body);

    await complete;

    component.addRestTime(30);

    expect(
      component.restTimerLabel()
    ).toBe('02:30');

    component.addRestTime(-30);
    component.addRestTime(-300);

    expect(
      component.restTimerLabel()
    ).toBe('00:00');

    component.skipRestTimer();

    expect(
      component.restTimer()
    ).toBeNull();

    http.expectNone(
      `${environment.apiUrl}/workouts/workout-1`
    );
  });


  it('marks rest as finished at zero and clears the interval', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();
    vi.setSystemTime(
      new Date(
        '2026-08-20T15:00:00Z'
      )
    );

    const component =
      fixture.componentInstance;

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await flushPromises();

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    save.flush(save.request.body);

    await complete;

    await vi.advanceTimersByTimeAsync(
      120_000
    );

    expect(
      component.restTimer()
    ).toBeNull();
    expect(
      component.restTimerLabel()
    ).toBe('');

    await vi.advanceTimersByTimeAsync(
      2_000
    );

    http.expectNone(
      `${environment.apiUrl}/workouts/workout-1`
    );
  });


  it('clears the rest timer when finishing the workout', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();

    const component =
      fixture.componentInstance;

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await flushPromises();

    let save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    save.flush(save.request.body);

    await complete;

    expect(
      component.restTimer()
    ).toBeTruthy();

    const finish =
      component.finishWorkout();

    await flushPromises();

    save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    save.flush(save.request.body);

    await finish;

    expect(
      component.restTimer()
    ).toBeNull();

    await vi.advanceTimersByTimeAsync(
      2_000
    );

    http.expectNone(
      `${environment.apiUrl}/workouts/workout-1`
    );
  });


  it('cleans the rest timer on destroy', async () => {
    const fixture =
      await createLoadedTrain([
        {
          workoutId:
            'workout-1',
          routineId:
            'routine-1',
          sessionId:
            'session-1',
          status:
            'in_progress',
          sets: []
        }
      ]);

    vi.useFakeTimers();

    const component =
      fixture.componentInstance;

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    await flushPromises();

    const save =
      http.expectOne(
        `${environment.apiUrl}/workouts/workout-1`
      );

    save.flush(save.request.body);

    await complete;

    expect(
      component.restTimer()
    ).toBeTruthy();

    fixture.destroy();

    await vi.advanceTimersByTimeAsync(
      2_000
    );

    http.expectNone(
      `${environment.apiUrl}/workouts/workout-1`
    );
  });
});
