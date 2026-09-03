import {
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
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  environment
} from '../../environments/environment';

import {
  AuthService
} from './auth.service';

import {
  TrainerService
} from './trainer.service';


describe(
  'TrainerService',
  () => {
    let service:
      TrainerService;
    let http:
      HttpTestingController;
    let getAccessToken:
      ReturnType<typeof vi.fn>;


    beforeEach(() => {
      getAccessToken =
        vi.fn()
          .mockResolvedValue(
            'access-token'
          );

      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          TrainerService,
          {
            provide: AuthService,
            useValue: {
              getAccessToken
            }
          }
        ]
      });

      service =
        TestBed.inject(
          TrainerService
        );

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


    it(
      'loads trainer athletes with the authenticated token',
      async () => {
        const promise =
          service.listAthletes();

        await flushPromises();

        const request =
          http.expectOne(
            `${environment.apiUrl}/trainer/athletes`
          );

        expect(request.request.method)
          .toBe('GET');
        expect(
          request.request.headers.get(
            'Authorization'
          )
        ).toBe('Bearer access-token');

        request.flush([
          {
            athlete_id:
              'athlete-1',
            status:
              'active',
            email:
              'athlete@example.com',
            display_name:
              'Athlete One',
            client_since:
              '2026-08-15T10:00:00Z'
          }
        ]);

        await expect(promise)
          .resolves
          .toEqual([
            {
              athlete_id:
                'athlete-1',
              status:
                'active',
              email:
                'athlete@example.com',
              display_name:
                'Athlete One',
              client_since:
                '2026-08-15T10:00:00Z'
            }
          ]);
      }
    );


    it(
      'loads trainer athlete overview with the authenticated token',
      async () => {
        const promise =
          service.getAthleteOverview(
            'athlete 1'
          );

        await flushPromises();

        const request =
          http.expectOne(
            (
              `${environment.apiUrl}/trainer/athletes/` +
              'athlete%201'
            )
          );

        expect(request.request.method)
          .toBe('GET');
        expect(
          request.request.headers.get(
            'Authorization'
          )
        ).toBe('Bearer access-token');

        request.flush(
          athleteOverviewResponse()
        );

        await expect(promise)
          .resolves
          .toMatchObject({
            athlete_id:
              'athlete-1',
            health: {
              weight_kg:
                81.4
            }
          });
      }
    );


    it(
      'loads trainer templates with the authenticated token',
      async () => {
        const promise =
          service.listTemplates();

        await flushPromises();

        const request =
          http.expectOne(
            `${environment.apiUrl}/trainer/templates`
          );

        expect(request.request.method)
          .toBe('GET');
        expect(
          request.request.headers.get(
            'Authorization'
          )
        ).toBe('Bearer access-token');

        request.flush([
          {
            id:
              'base-strength',
            name:
              'Base fuerza',
            discipline:
              'strength',
            data: {},
            created_at:
              '2026-09-01T10:00:00Z',
            updated_at:
              '2026-09-01T10:00:00Z'
          }
        ]);

        await expect(promise)
          .resolves
          .toHaveLength(1);
      }
    );


    it(
      'assigns a template with only athlete_id and routine_id in the body',
      async () => {
        const promise =
          service.assignTemplate(
            'base strength',
            'athlete-1',
            'routine-1'
          );

        await flushPromises();

        const request =
          http.expectOne(
            (
              `${environment.apiUrl}/trainer/templates/` +
              'base%20strength/assign'
            )
          );

        expect(request.request.method)
          .toBe('POST');
        expect(
          Object.keys(
            request.request.body as Record<
              string,
              string
            >
          ).sort()
        ).toEqual([
          'athlete_id',
          'routine_id'
        ]);
        expect(request.request.body)
          .toEqual({
            athlete_id:
              'athlete-1',
            routine_id:
              'routine-1'
          });

        request.flush({
          assignment_id:
            'assignment-1',
          athlete_id:
            'athlete-1',
          template_id:
            'base strength',
          routine_id:
            'routine-1',
          discipline:
            'strength',
          assigned_at:
            '2026-09-02T10:00:00Z'
        });

        await expect(promise)
          .resolves
          .toMatchObject({
            routine_id:
              'routine-1'
          });
      }
    );
  }
);


function athleteOverviewResponse() {
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
    }
  };
}
