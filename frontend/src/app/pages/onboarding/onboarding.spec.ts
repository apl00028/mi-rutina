/**
 * @vitest-environment jsdom
 */

import {
  TestBed
} from '@angular/core/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import {
  provideHttpClient
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import {
  provideRouter
} from '@angular/router';
import {
  Router
} from '@angular/router';

import {
  environment
} from '../../../environments/environment';
import {
  AuthService
} from '../../core/auth.service';
import {
  Onboarding
} from './onboarding';


describe('Onboarding focus labels', () => {
  let http:
    HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Onboarding
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            getAccessToken:
              vi.fn()
                .mockResolvedValue(
                  'access-token'
                )
          }
        }
      ]
    }).compileComponents();

    http =
      TestBed.inject(
        HttpTestingController
      );
  });


  afterEach(() => {
    http.verify();
  });


  async function createComponent() {
    const fixture =
      TestBed.createComponent(
        Onboarding
      );

    fixture.detectChanges();

    await fixture.whenStable();
    await new Promise(
      resolve =>
        setTimeout(resolve, 0)
    );

    http
      .expectOne(
        `${environment.apiUrl}/exercises`
      )
      .flush([]);

    return fixture;
  }


  it('maps every current session focus value to a user-facing label', async () => {
    const fixture =
      await createComponent();

    const component =
      fixture.componentInstance;

    expect(
      component.focusLabel(
        'full_body'
      )
    ).toBe('Cuerpo completo');

    expect(
      component.focusLabel('upper')
    ).toBe('Torso');

    expect(
      component.focusLabel('lower')
    ).toBe('Pierna');
  });


  it('uses conservative labels for missing or unknown focus values', async () => {
    const fixture =
      await createComponent();

    const component =
      fixture.componentInstance;

    expect(
      component.focusLabel(null)
    ).toBe('Enfoque general');

    expect(
      component.focusLabel(undefined)
    ).toBe('Enfoque general');

    expect(
      component.focusLabel('')
    ).toBe('Enfoque general');

    expect(
      component.focusLabel(
        'push_pull'
      )
    ).toBe('push pull');

    expect(
      component.focusLabel(
        'Empuje y tirón'
      )
    ).toBe('Empuje y tirón');
  });


  it('renders the final summary with labels instead of internal focus ids', async () => {
    const fixture =
      await createComponent();

    fixture
      .componentInstance
      .proposal
      .set({
        structure_id:
          'upper_lower_full',
        structure_label:
          'Torso / Pierna / Full body',
        sessions: [
          {
            session_id:
              'session-1',
            name:
              'Sesión 1',
            focus:
              'upper',
            exercises: []
          },
          {
            session_id:
              'session-2',
            name:
              'Sesión 2',
            focus:
              'full_body',
            exercises: []
          },
          {
            session_id:
              'session-3',
            name:
              'Sesión 3',
            focus:
              null as unknown as string,
            exercises: []
          }
        ],
        warnings: [],
        rationale: []
      });

    fixture.detectChanges();

    const text =
      (
        fixture.nativeElement as HTMLElement
      ).textContent ?? '';

    expect(text).toContain('Torso');
    expect(text).toContain(
      'Cuerpo completo'
    );
    expect(text).toContain(
      'Enfoque general'
    );
    expect(text).not.toContain('upper');
    expect(text).not.toContain(
      'full_body'
    );
    expect(text).not.toContain(
      'undefined'
    );
    expect(text).not.toContain(
      '[object Object]'
    );
  });
});


describe('Onboarding completion flow', () => {
  let http:
    HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Onboarding
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            getAccessToken:
              vi.fn()
                .mockResolvedValue(
                  'access-token'
                )
          }
        }
      ]
    }).compileComponents();

    http =
      TestBed.inject(
        HttpTestingController
      );
  });


  afterEach(() => {
    http.verify();
  });


  async function createReadyComponent() {
    const fixture =
      TestBed.createComponent(
        Onboarding
      );

    const component =
      fixture.componentInstance;

    component.displayName.set('Adrián');
    component.age.set(35);
    component.sex.set('male');
    component.heightCm.set(178);
    component.weightKg.set(78);
    component.motivations.set([
      'strength'
    ]);
    component.primaryGoal.set(
      'strength_gain'
    );
    component.experienceLevel.set(
      'intermediate'
    );
    component.weeklyAvailability.set(4);
    component.sessionDurationMin.set(60);
    component.trainingLocation.set(
      'commercial_gym'
    );
    component.proposal.set({
      structure_id:
        'upper_lower_four',
      structure_label:
        'Torso / Pierna',
      sessions: [
        {
          session_id:
            'session-1',
          name:
            'Sesión 1',
          focus:
            'upper',
          exercises: [
            {
              exercise_id:
                'dumbbell-bench-press',
              name:
                'Press banca con mancuernas',
              movement_pattern:
                'horizontal_push',
              role:
                'main',
              record_type:
                'weight_reps',
              sets: 3,
              target:
                '4-6',
              target_rir:
                '2',
              rest_seconds:
                180
            }
          ]
        }
      ],
      warnings: [],
      rationale: []
    });

    fixture.detectChanges();

    await fixture.whenStable();
    await new Promise(
      resolve =>
        setTimeout(resolve, 0)
    );

    http
      .expectOne(
        `${environment.apiUrl}/exercises`
      )
      .flush([]);

    return fixture;
  }


  async function waitForHttpTick() {
    await new Promise(
      resolve =>
        setTimeout(resolve, 0)
    );
  }


  it('persists onboarding once and navigates to training on success', async () => {
    const fixture =
      await createReadyComponent();

    const router =
      TestBed.inject(Router);

    const navigate =
      vi.spyOn(
        router,
        'navigateByUrl'
      ).mockResolvedValue(true);

    const promise =
      fixture
        .componentInstance
        .completeOnboarding();

    await waitForHttpTick();

    const request =
      http.expectOne(
        `${environment.apiUrl}/onboarding/complete`
      );

    expect(request.request.method)
      .toBe('POST');
    expect(
      request.request.headers.get(
        'Authorization'
      )
    ).toBe('Bearer access-token');

    expect(
      request.request.body.profile
        .primary_goal
    ).toBe('strength_gain');

    request.flush({
      onboarding_completed: true,
      routine: {
        routineId:
          'routine-onboarding-1',
        schemaVersion:
          '4.2',
        revision: 1,
        sessions: [
          {
            sessionId:
              'session-1',
            exercises: [
              {
                exerciseId:
                  'dumbbell-bench-press',
                name:
                  'Press banca con mancuernas',
                sets: 3,
                target:
                  '4-6',
                restSeconds:
                  180
              }
            ]
          }
        ]
      }
    });

    await promise;

    expect(navigate)
      .toHaveBeenCalledWith(
        '/entrenar'
      );
  });


  it('blocks a second completion submit while the first one is pending', async () => {
    const fixture =
      await createReadyComponent();

    const router =
      TestBed.inject(Router);

    vi.spyOn(
      router,
      'navigateByUrl'
    ).mockResolvedValue(true);

    const component =
      fixture.componentInstance;

    const first =
      component.completeOnboarding();

    const second =
      component.completeOnboarding();

    await waitForHttpTick();

    const request =
      http.expectOne(
        `${environment.apiUrl}/onboarding/complete`
      );

    http.expectNone(
      `${environment.apiUrl}/onboarding/complete`
    );

    request.flush({
      onboarding_completed: true,
      routine: {
        routineId:
          'routine-onboarding-1',
        schemaVersion:
          '4.2',
        revision: 1,
        sessions: [
          {
            sessionId:
              'session-1',
            exercises: [
              {
                exerciseId:
                  'dumbbell-bench-press',
                name:
                  'Press banca con mancuernas',
                sets: 3,
                target:
                  '4-6',
                restSeconds:
                  180
              }
            ]
          }
        ]
      }
    });

    await Promise.all([
      first,
      second
    ]);
  });


  it('keeps answers and allows retry when completion fails', async () => {
    const fixture =
      await createReadyComponent();

    const router =
      TestBed.inject(Router);

    const navigate =
      vi.spyOn(
        router,
        'navigateByUrl'
      ).mockResolvedValue(true);

    const failed =
      fixture
        .componentInstance
        .completeOnboarding();

    await waitForHttpTick();

    const failedRequest =
      http.expectOne(
        `${environment.apiUrl}/onboarding/complete`
      );

    failedRequest.flush(
      {
        detail:
          'Could not complete Aptus onboarding'
      },
      {
        status: 502,
        statusText: 'Bad Gateway'
      }
    );

    await failed;

    expect(navigate)
      .not.toHaveBeenCalled();
    expect(
      fixture
        .componentInstance
        .completeError()
    ).toBe(
      'Could not complete Aptus onboarding'
    );
    expect(
      fixture
        .componentInstance
        .displayName()
    ).toBe('Adrián');
    expect(
      fixture
        .componentInstance
        .completing()
    ).toBe(false);

    const retry =
      fixture
        .componentInstance
        .completeOnboarding();

    await waitForHttpTick();

    const retryRequest =
      http.expectOne(
        `${environment.apiUrl}/onboarding/complete`
      );

    retryRequest.flush({
      onboarding_completed: true,
      routine: {
        routineId:
          'routine-onboarding-1',
        schemaVersion:
          '4.2',
        revision: 1,
        sessions: [
          {
            sessionId:
              'session-1',
            exercises: [
              {
                exerciseId:
                  'dumbbell-bench-press',
                name:
                  'Press banca con mancuernas',
                sets: 3,
                target:
                  '4-6',
                restSeconds:
                  180
              }
            ]
          }
        ]
      }
    });

    await retry;

    expect(navigate)
      .toHaveBeenCalledWith(
        '/entrenar'
      );
  });
});
