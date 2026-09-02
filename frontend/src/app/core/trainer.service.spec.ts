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
              'active'
          }
        ]);

        await expect(promise)
          .resolves
          .toEqual([
            {
              athlete_id:
                'athlete-1',
              status:
                'active'
            }
          ]);
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
