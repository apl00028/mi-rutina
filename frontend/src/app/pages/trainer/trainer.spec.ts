import {
  ComponentFixture,
  TestBed
} from '@angular/core/testing';

import {
  provideHttpClient
} from '@angular/common/http';

import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest
} from '@angular/common/http/testing';

import {
  provideRouter
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
  TrainerAthlete,
  TrainerRoutineTemplate
} from '../../core/trainer.service';

import {
  Trainer
} from './trainer';


describe(
  'Trainer page',
  () => {
    let fixture:
      ComponentFixture<Trainer>;
    let http:
      HttpTestingController;


    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [
          Trainer
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


    async function flushPromises() {
      await Promise.resolve();
      await Promise.resolve();
    }


    function createPage():
      ComponentFixture<Trainer> {
      fixture =
        TestBed.createComponent(
          Trainer
        );

      fixture.detectChanges();

      return fixture;
    }


    async function flushInitial(
      athletes: TrainerAthlete[] = [
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
      ],
      templates: TrainerRoutineTemplate[] = [
        {
          id:
            'strength-base',
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
      ]
    ): Promise<void> {
      await flushPromises();

      http.expectOne(
        `${environment.apiUrl}/trainer/athletes`
      ).flush(athletes);

      http.expectOne(
        `${environment.apiUrl}/trainer/templates`
      ).flush(templates);
    }


    async function settle(): Promise<void> {
      await flushPromises();
      fixture.detectChanges();
    }


    it(
      'loads and renders active athletes',
      async () => {
        createPage();
        await flushInitial();

        await settle();

        expect(
          fixture.nativeElement.textContent
        ).toContain('Athlete One');
        expect(
          fixture.nativeElement.textContent
        ).toContain('athlete@example.com');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Cliente desde 15/08/2026');
        expect(
          fixture.nativeElement.textContent
        ).toContain('ID athlete-1');
        expect(
          fixture.nativeElement.textContent
        ).toContain('active');
        expect(
          fixture.nativeElement
            .querySelector('.athlete-card')
            .getAttribute('href')
        ).toBe('/trainer/clients/athlete-1');
      }
    );


    it(
      'uses email as athlete title when display name is missing',
      async () => {
        createPage();
        await flushInitial([
          {
            athlete_id:
              'athlete-1',
            status:
              'active',
            email:
              'athlete@example.com',
            display_name:
              null,
            client_since:
              '2026-08-15T10:00:00Z'
          }
        ]);
        await settle();

        const athlete =
          fixture.componentInstance
            .athletes()[0]!;

        expect(
          fixture.componentInstance
            .athleteTitle(athlete)
        ).toBe('athlete@example.com');
        expect(
          fixture.componentInstance
            .athleteSubtitle(athlete)
        ).toBeNull();
        expect(
          fixture.nativeElement.textContent
        ).toContain('athlete@example.com');
        expect(
          fixture.nativeElement.textContent
        ).toContain('ID athlete-1');
      }
    );


    it(
      'uses UUID as athlete title when name and email are missing',
      async () => {
        createPage();
        await flushInitial([
          {
            athlete_id:
              'athlete-1',
            status:
              'active',
            email:
              null,
            display_name:
              null,
            client_since:
              '2026-08-15T10:00:00Z'
          }
        ]);
        await settle();

        const athlete =
          fixture.componentInstance
            .athletes()[0]!;

        expect(
          fixture.componentInstance
            .athleteTitle(athlete)
        ).toBe('athlete-1');
        expect(
          fixture.nativeElement.textContent
        ).toContain('ID athlete-1');
      }
    );


    it(
      'loads and renders templates',
      async () => {
        createPage();
        await flushInitial();

        await settle();

        fixture.componentInstance.setView(
          'templates'
        );
        fixture.detectChanges();

        expect(
          fixture.nativeElement.textContent
        ).toContain('Base fuerza');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Fuerza');
      }
    );


    it(
      'regenerates routine id when the selected template changes',
      async () => {
        createPage();
        await flushInitial(
          [
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
          ],
          [
            {
              id:
                'strength-base',
              name:
                'Base fuerza',
              discipline:
                'strength',
              data: {},
              created_at:
                '2026-09-01T10:00:00Z',
              updated_at:
                '2026-09-01T10:00:00Z'
            },
            {
              id:
                'run-base',
              name:
                'Base carrera',
              discipline:
                'running',
              data: {},
              created_at:
                '2026-09-01T10:00:00Z',
              updated_at:
                '2026-09-01T10:00:00Z'
            }
          ]
        );
        await settle();

        fixture.componentInstance.setView(
          'templates'
        );
        fixture.componentInstance.updateRoutineId(
          'manual-editable'
        );
        fixture.detectChanges();

        fixture.componentInstance.selectTemplate(
          fixture.componentInstance
            .templates()[1]
        );
        fixture.detectChanges();

        expect(
          fixture.componentInstance
            .routineId()
        )
          .toContain('run-base-athlete');
        expect(
          fixture.componentInstance
            .routineId()
        )
          .not
          .toBe('manual-editable');
      }
    );


    it(
      'regenerates routine id when the selected athlete changes',
      async () => {
        createPage();
        await flushInitial(
          [
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
            },
            {
              athlete_id:
                'client-2',
              status:
                'active',
              email:
                'client-2@example.com',
              display_name:
                'Client Two',
              client_since:
                '2026-08-16T10:00:00Z'
            }
          ]
        );
        await settle();

        fixture.componentInstance.setView(
          'templates'
        );
        fixture.componentInstance.updateRoutineId(
          'manual-editable'
        );
        fixture.detectChanges();

        fixture.componentInstance.updateAthlete(
          'client-2'
        );
        fixture.detectChanges();

        expect(
          fixture.componentInstance
            .routineId()
        )
          .toContain('strength-base-client-2');
        expect(
          fixture.componentInstance
            .routineId()
        )
          .not
          .toBe('manual-editable');
      }
    );


    it(
      'assigns a template with exactly athlete_id and routine_id',
      async () => {
        createPage();
        await flushInitial();
        await settle();

        fixture.componentInstance.setView(
          'templates'
        );
        fixture.componentInstance.updateRoutineId(
          'routine-custom'
        );
        fixture.detectChanges();

        const assignButton =
          (
            Array.from(
              fixture.nativeElement.querySelectorAll(
                'button.primary-button'
              )
            ) as HTMLButtonElement[]
          ).find(
            button =>
              button.textContent
                ?.includes('Asignar')
          ) as HTMLButtonElement;

        assignButton.click();
        fixture.detectChanges();

        await flushPromises();

        const request =
          http.expectOne(
            (
              `${environment.apiUrl}/trainer/templates/` +
              'strength-base/assign'
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
              'routine-custom'
          });

        request.flush({
          assignment_id:
            'assignment-1',
          athlete_id:
            'athlete-1',
          template_id:
            'strength-base',
          routine_id:
            'routine-custom',
          discipline:
            'strength',
          assigned_at:
            '2026-09-02T10:00:00Z'
        });

        await settle();

        expect(
          fixture.nativeElement.textContent
        ).toContain(
          'Rutina routine-custom asignada.'
        );
      }
    );


    it(
      'shows an error state when athletes fail to load',
      async () => {
        createPage();

        await flushPromises();

        http.expectOne(
          `${environment.apiUrl}/trainer/athletes`
        ).flush(
          {
            detail:
              'No autorizado'
          },
          {
            status:
              403,
            statusText:
              'Forbidden'
          }
        );

        http.expectOne(
          `${environment.apiUrl}/trainer/templates`
        ).flush([]);

        await settle();

        expect(
          fixture.nativeElement.textContent
        ).toContain('No autorizado');
      }
    );


    it(
      'blocks duplicate assignment submits while sending',
      async () => {
        createPage();
        await flushInitial();
        await settle();

        fixture.componentInstance.setView(
          'templates'
        );
        fixture.componentInstance.updateRoutineId(
          'routine-custom'
        );
        fixture.detectChanges();

        const assignButton =
          (
            Array.from(
              fixture.nativeElement.querySelectorAll(
                'button.primary-button'
              )
            ) as HTMLButtonElement[]
          ).find(
            button =>
              button.textContent
                ?.includes('Asignar')
          ) as HTMLButtonElement;

        assignButton.click();
        assignButton.click();
        fixture.detectChanges();

        await flushPromises();

        const requests:
          TestRequest[] =
          http.match(
            request =>
              request.method === 'POST' &&
              request.url ===
                (
                  `${environment.apiUrl}/trainer/templates/` +
                  'strength-base/assign'
                )
          );

        expect(requests)
          .toHaveLength(1);

        requests[0].flush({
          assignment_id:
            'assignment-1',
          athlete_id:
            'athlete-1',
          template_id:
            'strength-base',
          routine_id:
            'routine-custom',
          discipline:
            'strength',
          assigned_at:
            '2026-09-02T10:00:00Z'
        });
      }
    );
  }
);
