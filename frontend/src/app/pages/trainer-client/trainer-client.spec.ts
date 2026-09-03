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
      await Promise.resolve();
      await Promise.resolve();
    }


    async function createPage(
      response = athleteOverview(),
      strengthResponse: unknown[] = [],
      swimmingResponse: unknown[] = [],
      runningResponse: unknown[] = []
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

      http.expectOne(
        strengthSessionsUrl()
      ).flush(strengthResponse);
      http.expectOne(
        swimmingSessionsUrl()
      ).flush(swimmingResponse);
      http.expectOne(
        runningSessionsUrl()
      ).flush(runningResponse);

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
      'renders strength session exercises and sets',
      async () => {
        await createPage(
          athleteOverview(),
          [
            strengthSession()
          ]
        );

        const text =
          fixture.nativeElement.textContent;

        expect(text).toContain('Rendimiento');
        expect(text).toContain('Sesiones · 02/09/2026');
        expect(text).toContain('Empuje');
        expect(text).toContain('02/09/2026');
        expect(text).toContain('septiembre de 2026');
        expect(text).toContain('Press de banca');
        expect(text).toContain('Serie 1');
        expect(text).toContain('Reps');
        expect(text).toContain('8');
        expect(text).toContain('30 kg');
        expect(text).toContain('RIR 2');
        expect(text).not.toContain('Duración');
      }
    );


    it(
      'shows strength sessions on the shared calendar',
      async () => {
        await createPage(
          athleteOverview(),
          [
            strengthSession()
          ]
        );

        const markedDay =
          calendarMarkedDay('2');

        expect(
          markedDay.classList.contains(
            'has-session'
          )
        ).toBe(true);
        expect(
          markedDay.classList.contains(
            'selected'
          )
        ).toBe(true);
        expect(
          markedDay.textContent
        ).toContain('F');
      }
    );


    it(
      'shows swimming sessions on the shared calendar',
      async () => {
        await createPage(
          athleteOverview(),
          [],
          [
            performanceSession(
              'swimming'
            )
          ]
        );

        const markedDay =
          calendarMarkedDay('3');

        expect(markedDay.textContent)
          .toContain('N');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Técnica de crol');
      }
    );


    it(
      'shows running sessions on the shared calendar',
      async () => {
        await createPage(
          athleteOverview(),
          [],
          [],
          [
            performanceSession(
              'running'
            )
          ]
        );

        const markedDay =
          calendarMarkedDay('4');

        expect(markedDay.textContent)
          .toContain('C');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Control aeróbico');
      }
    );


    it(
      'shows multiple disciplines on the same day',
      async () => {
        await createPage(
          athleteOverview(),
          [
            strengthSession()
          ],
          [
            performanceSession(
              'swimming',
              {
                event_at:
                  '2026-09-02T10:30:00Z'
              }
            )
          ]
        );

        const markedDay =
          calendarMarkedDay('2');

        expect(markedDay.textContent)
          .toContain('F');
        expect(markedDay.textContent)
          .toContain('N');
      }
    );


    it(
      'shows swimming and running on the same day',
      async () => {
        await createPage(
          athleteOverview(),
          [],
          [
            performanceSession(
              'swimming',
              {
                event_at:
                  '2026-09-04T07:00:00Z'
              }
            )
          ],
          [
            performanceSession(
              'running'
            )
          ]
        );

        const markedDay =
          calendarMarkedDay('4');

        expect(markedDay.textContent)
          .toContain('N');
        expect(markedDay.textContent)
          .toContain('C');
      }
    );


    it(
      'shows one repeated discipline mark with a counter',
      async () => {
        await createPage(
          athleteOverview(),
          [
            strengthSession(),
            strengthSession({
              workout_id:
                'workout-2',
              session_name:
                'Pierna',
              finished_at:
                '2026-09-02T17:30:00Z'
            })
          ]
        );

        expect(
          calendarMarkedDay('2').textContent
        ).toContain('F×2');
      }
    );


    it(
      'marks days with sessions and selects by calendar day',
      async () => {
        await createPage(
          athleteOverview(),
          [
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
          ]
        );

        expect(
          fixture.nativeElement.textContent
        ).toContain('septiembre de 2026');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Empuje');

        clickButton('←');
        fixture.detectChanges();

        expect(
          fixture.nativeElement.textContent
        ).toContain('agosto de 2026');

        calendarMarkedDay('31').click();
        fixture.detectChanges();

        expect(
          fixture.nativeElement.textContent
        ).toContain('Sesiones · 31/08/2026');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Prensa');
      }
    );


    it(
      'shows a selector for multiple sessions on the same day',
      async () => {
        await createPage(
          athleteOverview(),
          [
            strengthSession(),
            strengthSession({
              workout_id:
                'workout-2',
              session_name:
                'Pierna',
              finished_at:
                '2026-09-02T17:30:00Z',
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
          ]
        );

        const text =
          fixture.nativeElement.textContent;

        expect(text).toContain('Empuje');
        expect(text).toContain('Pierna');
        expect(text).toContain('19:30');

        clickButton('Pierna');
        fixture.detectChanges();

        expect(
          fixture.nativeElement.textContent
        ).toContain('Prensa');
      }
    );


    it(
      'lists sessions from different disciplines on the selected day',
      async () => {
        await createPage(
          athleteOverview(),
          [
            strengthSession()
          ],
          [
            performanceSession(
              'swimming',
              {
                event_at:
                  '2026-09-02T10:30:00Z'
              }
            )
          ],
          [
            performanceSession(
              'running',
              {
                event_at:
                  '2026-09-02T11:30:00Z',
                finished_at:
                  '2026-09-02T11:30:00Z'
              }
            )
          ]
        );

        const text =
          fixture.nativeElement.textContent;

        expect(text).toContain('Empuje');
        expect(text).toContain('Técnica de crol');
        expect(text).toContain('Control aeróbico');
      }
    );


    it(
      'selects swimming and running without breaking the detail view',
      async () => {
        await createPage(
          athleteOverview(),
          [
            strengthSession()
          ],
          [
            performanceSession(
              'swimming',
              {
                event_at:
                  '2026-09-02T10:30:00Z'
              }
            )
          ],
          [
            performanceSession(
              'running',
              {
                event_at:
                  '2026-09-02T11:30:00Z',
                finished_at:
                  '2026-09-02T11:30:00Z'
              }
            )
          ]
        );

        clickButton('Técnica de crol');
        fixture.detectChanges();

        expect(
          fixture.nativeElement.textContent
        ).toContain(
          'Detalle de natación próximamente.'
        );

        clickButton('Control aeróbico');
        fixture.detectChanges();

        expect(
          fixture.nativeElement.textContent
        ).toContain(
          'Detalle de carrera próximamente.'
        );
      }
    );


    it(
      'keeps late swimming sessions on the observed start day',
      async () => {
        await createPage(
          athleteOverview(),
          [],
          [
            performanceSession(
              'swimming',
              {
                event_at:
                  '2026-09-02T23:50:00Z',
                started_at:
                  '2026-09-02T23:50:00Z',
                finished_at:
                  null,
                duration_seconds:
                  1800
              }
            )
          ]
        );

        expect(
          calendarMarkedDay('2').textContent
        ).toContain('N');
        expect(
          calendarDay('3').classList.contains(
            'has-session'
          )
        ).toBe(false);
      }
    );


    it(
      'changes calendar month without new requests',
      async () => {
        await createPage(
          athleteOverview(),
          [
            strengthSession()
          ]
        );

        clickButton('←');
        fixture.detectChanges();

        expect(
          fixture.nativeElement.textContent
        ).toContain('agosto de 2026');

        clickButton('→');
        fixture.detectChanges();

        expect(
          fixture.nativeElement.textContent
        ).toContain('septiembre de 2026');

        http.expectNone(
          strengthSessionsUrl()
        );
        http.expectNone(
          swimmingSessionsUrl()
        );
        http.expectNone(
          runningSessionsUrl()
        );
      }
    );


    it(
      'keeps days without sessions disabled',
      async () => {
        await createPage(
          athleteOverview(),
          [
            strengthSession()
          ]
        );

        expect(
          calendarDay('3').disabled
        ).toBe(true);
      }
    );


    it(
      'keeps discipline indicators ready for multiple sports',
      async () => {
        await createPage();

        const component =
          fixture.componentInstance;
        const text =
          fixture.nativeElement.textContent;

        expect(
          component.performanceDisciplineInitial(
            'strength'
          )
        ).toBe('F');
        expect(
          component.performanceDisciplineInitial(
            'swimming'
          )
        ).toBe('N');
        expect(
          component.performanceDisciplineInitial(
            'running'
          )
        ).toBe('C');
        expect(
          component.performanceDisciplineInitial(
            'cycling'
          )
        ).toBe('B');
        expect(text).toContain('No hay sesiones completadas.');
      }
    );


    it(
      'restarts visible set numbering by exercise',
      async () => {
        await createPage(
          athleteOverview(),
          [
            strengthSession({
              exercises: [
                {
                  exercise_id:
                    'bench-press',
                  exercise_name:
                    'Press de banca',
                  sets: [
                    strengthSet({
                      set_order:
                        3
                    }),
                    strengthSet({
                      set_index:
                        1,
                      set_order:
                        4
                    })
                  ]
                },
                {
                  exercise_id:
                    'leg-press',
                  exercise_name:
                    'Prensa',
                  sets: [
                    strengthSet({
                      set_index:
                        2,
                      set_order:
                        5
                    })
                  ]
                }
              ]
            })
          ]
        );

        const rows =
          setRows();

        expect(rows[1].textContent)
          .toContain('Serie 1');
        expect(rows[2].textContent)
          .toContain('Serie 2');
        expect(rows[4].textContent)
          .toContain('Serie 1');
      }
    );


    it(
      'shows duration only when it is present',
      async () => {
        await createPage(
          athleteOverview(),
          [
            strengthSession({
              exercises: [
                {
                  exercise_id:
                    'plank',
                  exercise_name:
                    'Plancha',
                  sets: [
                    strengthSet({
                      set_index:
                        0,
                      set_order:
                        1,
                      reps:
                        null,
                      weight_kg:
                        null,
                      duration_seconds:
                        47
                    })
                  ]
                }
              ]
            })
          ]
        );

        const text =
          (
            fixture.nativeElement
              .querySelector('.performance-section')
              ?.textContent ?? ''
          );

        expect(text).toContain('Plancha');
        expect(text).toContain('Duración');
        expect(text).toContain('47 s');
        expect(text).not.toContain('Peso');
      }
    );


    it(
      'shows a message for sessions without exercises',
      async () => {
        await createPage(
          athleteOverview(),
          [
            strengthSession({
              exercises: []
            })
          ]
        );

        expect(
          fixture.nativeElement.textContent
        ).toContain(
          'Sesión completada sin detalle de series registrado.'
        );
      }
    );


    it(
      'renders empty state when performance has no sessions',
      async () => {
        await createPage();

        expect(
          fixture.nativeElement.textContent
        ).toContain(
          'No hay sesiones completadas.'
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


    function calendarDay(
      label: string
    ): HTMLButtonElement {
      const buttons = Array.from(
        fixture.nativeElement
          .querySelectorAll(
            '.calendar-day:not(.outside-month)'
          )
      ) as HTMLButtonElement[];
      const button =
        buttons.find(candidate =>
          candidate.textContent
            ?.trim()
            .startsWith(label)
        );

      if (!button) {
        throw new Error(
          `Calendar day not found: ${label}`
        );
      }

      return button;
    }


    function calendarMarkedDay(
      label: string
    ): HTMLButtonElement {
      const buttons = Array.from(
        fixture.nativeElement
          .querySelectorAll(
            '.calendar-day.has-session'
          )
      ) as HTMLButtonElement[];
      const button =
        buttons.find(candidate =>
          candidate.textContent
            ?.trim()
            .startsWith(label)
        );

      if (!button) {
        throw new Error(
          `Marked calendar day not found: ${label}`
        );
      }

      return button;
    }


    function setRows(): HTMLElement[] {
      return Array.from(
        fixture.nativeElement
          .querySelectorAll('.set-row')
      ) as HTMLElement[];
    }


    function strengthSessionsUrl(): string {
      return (
        `${environment.apiUrl}/trainer/athletes/` +
        'athlete-1/strength-sessions'
      );
    }


    function swimmingSessionsUrl(): string {
      return (
        `${environment.apiUrl}/trainer/athletes/` +
        'athlete-1/swimming-sessions'
      );
    }


    function runningSessionsUrl(): string {
      return (
        `${environment.apiUrl}/trainer/athletes/` +
        'athlete-1/running-sessions'
      );
    }
  }
);


function strengthSet(
  patch: Record<string, unknown> = {}
) {
  return {
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
      null,
    ...patch
  };
}


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
          strengthSet()
        ]
      }
    ],
    ...patch
  };
}


function performanceSession(
  discipline: 'swimming' | 'running',
  patch: Record<string, unknown> = {}
) {
  return {
    id:
      `${discipline}-1`,
    discipline,
    title:
      discipline === 'swimming'
        ? 'Técnica de crol'
        : 'Control aeróbico',
    started_at:
      discipline === 'swimming'
        ? '2026-09-03T07:00:00Z'
        : '2026-09-04T06:00:00Z',
    event_at:
      discipline === 'swimming'
        ? '2026-09-03T07:00:00Z'
        : '2026-09-04T06:40:00Z',
    finished_at:
      discipline === 'running'
        ? '2026-09-04T06:40:00Z'
        : null,
    duration_seconds:
      discipline === 'swimming'
        ? 2700
        : null,
    routine_id:
      discipline === 'running'
        ? 'run-routine'
        : null,
    session_id:
      discipline === 'running'
        ? 'run-session'
        : null,
    source:
      discipline === 'swimming'
        ? 'garmin_fit'
        : null,
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
