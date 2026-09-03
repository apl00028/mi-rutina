import {
  ComponentFixture,
  TestBed
} from '@angular/core/testing';

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
  ActivatedRoute
} from '@angular/router';

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
  TrainerClient
} from './trainer-client';


describe(
  'TrainerClient page',
  () => {
    let fixture:
      ComponentFixture<TrainerClient>;
    let http:
      HttpTestingController;


    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [
          TrainerClient
        ],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                paramMap: {
                  get: () => 'athlete-1'
                }
              }
            }
          },
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


    async function flushPromises():
      Promise<void> {
      await Promise.resolve();
      await Promise.resolve();
    }


    async function createPage(
      response = athleteOverview()
    ): Promise<void> {
      fixture =
        TestBed.createComponent(
          TrainerClient
        );
      fixture.detectChanges();

      await flushPromises();

      http.expectOne(
        `${environment.apiUrl}/trainer/athletes/athlete-1`
      ).flush(response);

      await flushPromises();
      fixture.detectChanges();
    }


    it(
      'renders identity and client relationship',
      async () => {
        await createPage();

        const text =
          fixture.nativeElement.textContent;

        expect(text).toContain('Athlete One');
        expect(text).toContain('athlete@example.com');
        expect(text).toContain('Cliente desde');
        expect(text).toContain('15/08/2026');
        expect(text).toContain('Activo');
      }
    );


    it(
      'renders health metrics',
      async () => {
        await createPage();

        const text =
          fixture.nativeElement.textContent;

        expect(text).toContain('Peso');
        expect(text).toContain('81.4 kg');
        expect(text).toContain('Peso 01/09/2026');
        expect(text).toContain('Cintura 30/08/2026');
        expect(text).toContain('% grasa');
        expect(text).toContain('18.2%');
        expect(text).toContain('Cintura');
        expect(text).toContain('83.5 cm');
      }
    );


    it(
      'renders recent training',
      async () => {
        await createPage();

        const text =
          fixture.nativeElement.textContent;

        expect(text).not.toContain('workout-1');
        expect(text).toContain('Empuje');
        expect(text).toContain('02/09/2026');
        expect(text).toContain('Últimos 7 días');
        expect(text).toContain('3 sesiones');
      }
    );


    it(
      'renders active routines and last assignment',
      async () => {
        await createPage();

        const text =
          fixture.nativeElement.textContent;

        expect(text).toContain('Fuerza');
        expect(text).toContain('Plan fuerza');
        expect(text).toContain('Natación');
        expect(text).toContain('Última rutina asignada');
        expect(text).toContain('Base fuerza');
        expect(text).toContain('01/09/2026');
      }
    );


    it(
      'renders dashes for missing metrics',
      async () => {
        await createPage(
          athleteOverview({
            health: {
              weight_measurement_date: null,
              waist_measurement_date: null,
              weight_kg: null,
              body_fat_percent: null,
              muscle_mass_kg: null,
              body_water_percent: null,
              visceral_fat_index: null,
              waist_cm: null
            },
            recent_training: {
              last_completed: null,
              completed_last_7_days: 0
            },
            active_routines: {
              strength: null,
              swimming: null,
              running: null,
              cycling: null
            },
            trainer: {
              last_assignment: null
            }
          })
        );

        expect(
          fixture.nativeElement.textContent
        ).toContain('—');
      }
    );


    it(
      'opens and closes strength performance',
      async () => {
        await createPage();

        clickButton('Fuerza');
        await flushPromises();

        http.expectOne(
          (
            `${environment.apiUrl}/trainer/athletes/` +
            'athlete-1/strength-sessions'
          )
        ).flush([
          strengthSession()
        ]);

        await flushPromises();
        fixture.detectChanges();

        expect(
          fixture.nativeElement.textContent
        ).toContain('Press de banca');

        clickButton('Fuerza');
        fixture.detectChanges();

        expect(
          fixture.nativeElement.textContent
        ).not.toContain('Press de banca');
      }
    );


    it(
      'renders strength session exercises and sets',
      async () => {
        await createPage();

        await openStrength([
          strengthSession()
        ]);

        const text =
          fixture.nativeElement.textContent;

        expect(text).toContain('Rendimiento');
        expect(text).toContain('Empuje');
        expect(text).toContain('02/09/2026');
        expect(text).toContain('1 de 1');
        expect(text).toContain('Press de banca');
        expect(text).toContain('Serie 1');
        expect(text).toContain('8 reps');
        expect(text).toContain('30 kg');
        expect(text).toContain('RIR 2');
      }
    );


    it(
      'navigates between strength sessions',
      async () => {
        await createPage();

        await openStrength([
          strengthSession(),
          strengthSession({
            workout_id:
              'workout-2',
            session_name:
              'Pierna',
            finished_at:
              '2026-08-31T09:30:00Z',
            exercises: [
              {
                exercise_id:
                  'leg-press',
                exercise_name:
                  'Prensa',
                sets: []
              }
            ]
          })
        ]);

        expect(
          fixture.nativeElement.textContent
        ).toContain('1 de 2');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Empuje');

        clickButton('Siguiente');
        fixture.detectChanges();

        expect(
          fixture.nativeElement.textContent
        ).toContain('2 de 2');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Prensa');

        clickButton('Anterior');
        fixture.detectChanges();

        expect(
          fixture.nativeElement.textContent
        ).toContain('1 de 2');
      }
    );


    it(
      'renders dashes for null strength set values',
      async () => {
        await createPage();

        await openStrength([
          strengthSession({
            exercises: [
              {
                exercise_id:
                  'plank',
                exercise_name:
                  null,
                sets: [
                  {
                    set_index:
                      0,
                    set_order:
                      1,
                    set_type:
                      'working',
                    reps:
                      null,
                    weight_kg:
                      null,
                    rir:
                      null,
                    rpe:
                      null,
                    duration_seconds:
                      null
                  }
                ]
              }
            ]
          })
        ]);

        const text =
          fixture.nativeElement.textContent;

        expect(text).toContain('plank');
        expect(text).toContain('—');
      }
    );


    it(
      'renders empty state when strength has no sessions',
      async () => {
        await createPage();

        await openStrength([]);

        expect(
          fixture.nativeElement.textContent
        ).toContain(
          'No hay sesiones de fuerza completadas.'
        );
      }
    );


    function clickButton(
      label: string
    ): void {
      const buttons = Array.from(
        fixture.nativeElement
          .querySelectorAll('button')
      ) as HTMLButtonElement[];
      const button =
        buttons.find(candidate =>
          candidate.textContent
            ?.includes(label)
        );

      if (!button) {
        throw new Error(
          `Button not found: ${label}`
        );
      }

      button.click();
    }


    async function openStrength(
      response: unknown[]
    ): Promise<void> {
      clickButton('Fuerza');
      await flushPromises();

      http.expectOne(
        (
          `${environment.apiUrl}/trainer/athletes/` +
          'athlete-1/strength-sessions'
        )
      ).flush(response);

      await flushPromises();
      fixture.detectChanges();
    }
  }
);


function strengthSession(
  patch: Record<string, unknown> = {}
) {
  return {
    workout_id:
      'workout-1',
    routine_id:
      'routine-strength',
    session_id:
      'push',
    session_name:
      'Empuje',
    started_at:
      '2026-09-02T08:30:00Z',
    finished_at:
      '2026-09-02T09:30:00Z',
    exercises: [
      {
        exercise_id:
          'bench-press',
        exercise_name:
          'Press de banca',
        sets: [
          {
            set_index:
              0,
            set_order:
              1,
            set_type:
              'working',
            reps:
              8,
            weight_kg:
              30,
            rir:
              2,
            rpe:
              null,
            duration_seconds:
              null
          }
        ]
      }
    ],
    ...patch
  };
}


function athleteOverview(
  patch: Record<string, unknown> = {}
) {
  return {
    athlete_id:
      'athlete-1',
    status:
      'active',
    email:
      'athlete@example.com',
    display_name:
      'Athlete One',
    client_since:
      '2026-08-15T10:00:00Z',
    health: {
      weight_measurement_date:
        '2026-09-01',
      waist_measurement_date:
        '2026-08-30',
      weight_kg:
        81.4,
      body_fat_percent:
        18.2,
      muscle_mass_kg:
        62.1,
      body_water_percent:
        55.3,
      visceral_fat_index:
        7,
      waist_cm:
        83.5
    },
    recent_training: {
      last_completed: {
        workout_id:
          'workout-1',
        routine_id:
          'routine-strength',
        session_id:
          'push',
        session_name:
          'Empuje',
        finished_at:
          '2026-09-02T09:30:00Z'
      },
      completed_last_7_days:
        3
    },
    active_routines: {
      strength: {
        routine_id:
          'routine-strength',
        name:
          'Plan fuerza',
        activated_at:
          '2026-08-20T10:00:00Z'
      },
      swimming:
        null,
      running:
        null,
      cycling:
        null
    },
    trainer: {
      last_assignment: {
        template_id:
          'template-1',
        routine_id:
          'assigned-routine',
        name:
          'Base fuerza',
        discipline:
          'strength',
        assigned_at:
          '2026-09-01T12:00:00Z'
      }
    },
    ...patch
  };
}
