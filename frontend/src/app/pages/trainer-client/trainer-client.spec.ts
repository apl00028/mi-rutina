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
        expect(text).toContain('active');
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

        expect(text).toContain('workout-1');
        expect(text).toContain('Empuje');
        expect(text).toContain('02/09/2026');
        expect(text).toContain('Últimos 7 días');
        expect(text).toContain('3');
      }
    );


    it(
      'renders active routines and last assignment',
      async () => {
        await createPage();

        const text =
          fixture.nativeElement.textContent;

        expect(text).toContain('Fuerza');
        expect(text).toContain('routine-strength');
        expect(text).toContain('Natación');
        expect(text).toContain('Última rutina asignada');
        expect(text).toContain('assigned-routine');
        expect(text).toContain('01/09/2026');
      }
    );


    it(
      'renders dashes for missing metrics',
      async () => {
        await createPage(
          athleteOverview({
            health: {
              measurement_date: null,
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
  }
);


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
      measurement_date:
        '2026-09-01',
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
        discipline:
          'strength',
        assigned_at:
          '2026-09-01T12:00:00Z'
      }
    },
    ...patch
  };
}
