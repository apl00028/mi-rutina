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
  Train
} from './train';


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
    ]
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
      .flush(routine());

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
        values.completedAt ??
        '2026-08-18T18:10:00Z'
    };
  }


  it('renders the first training screen with active routine and no history', async () => {
    const fixture =
      await createLoadedTrain();

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
    expect(text).toContain('120s');
    expect(text).not.toContain(
      'Última vez'
    );
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
    expect(text).toContain(
      'Siguiente'
    );

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
      'Completada - desmarcar'
    );

    const completedButton =
      fixture
        .nativeElement
        .querySelector(
          'button[aria-label="Desmarcar serie completada de Press banca con mancuernas, serie 1"]'
        ) as HTMLButtonElement | null;

    expect(completedButton)
      .toBeTruthy();
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
        ?.finished
    ).toBe(true);

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
      component.restTimerLabel()
    ).toBe('00:00');
    expect(
      component.restTimer()
        ?.finished
    ).toBe(true);

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
