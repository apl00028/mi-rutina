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


  async function createLoadedTrain(
    workouts: any[] = []
  ) {
    const fixture =
      TestBed.createComponent(
        Train
      );

    fixture.detectChanges();

    await waitForHttpTick();

    http
      .expectOne(
        `${environment.apiUrl}/routines/active`
      )
      .flush(routine());

    await waitForHttpTick();

    http
      .expectOne(
        `${environment.apiUrl}/workouts`
      )
      .flush(workouts);

    await fixture.whenStable();
    fixture.detectChanges();

    return fixture;
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

    await waitForHttpTick();

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

    await waitForHttpTick();

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
      exercises:
        session.exercises.map(
          exercise => ({
            ...exercise,
            restSeconds: 0
          })
        )
    });

    const complete =
      component.completeSet(
        'dumbbell-bench-press',
        0
      );

    expect(
      component.restTimer()
    ).toBeNull();

    await waitForHttpTick();

    const save =
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

    await waitForHttpTick();

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

    await waitForHttpTick();

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

    await waitForHttpTick();

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

    await waitForHttpTick();

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

    await waitForHttpTick();

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

    await waitForHttpTick();

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

    await waitForHttpTick();

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
