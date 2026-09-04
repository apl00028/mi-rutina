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
  TrainerAthleteOverview,
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
      await Promise.resolve();
      await Promise.resolve();
    }


    async function expectRequest(
      url: string
    ): Promise<TestRequest> {
      let lastError:
        unknown;

      for (
        let attempt = 0;
        attempt < 10;
        attempt += 1
      ) {
        await flushPromises();

        try {
          return http.expectOne(url);
        } catch (error) {
          lastError =
            error;
        }
      }

      throw lastError;
    }


    function refreshButton():
      HTMLButtonElement {
      return (
        Array.from(
          fixture.nativeElement
            .querySelectorAll(
              'button.secondary-button'
            )
        ) as HTMLButtonElement[]
      ).find(
        button =>
          button.textContent
            ?.includes('Actualizar') ||
          button.textContent
            ?.includes('Actualizando') ||
          button.textContent
            ?.includes('Cargando')
      )!;
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
      ],
      overviews:
        Record<string, TrainerAthleteOverview> = {}
    ): Promise<void> {
      await flushPromises();

      http.expectOne(
        `${environment.apiUrl}/trainer/athletes`
      ).flush(athletes);

      http.expectOne(
        `${environment.apiUrl}/trainer/templates`
      ).flush(templates);

      await flushPromises();

      for (const athlete of athletes) {
        if (athlete.status !== 'active') {
          continue;
        }

        (
          await expectRequest(
            (
              `${environment.apiUrl}/trainer/athletes/` +
              encodeURIComponent(
                athlete.athlete_id
              )
            )
          )
        ).flush(
          overviews[athlete.athlete_id] ??
          overviewResponse(athlete)
        );
      }
    }


    async function settle(): Promise<void> {
      await flushPromises();
      fixture.detectChanges();
    }


    function clickButton(
      label: string
    ): void {
      const button =
        (
          Array.from(
            fixture.nativeElement
              .querySelectorAll('button')
          ) as HTMLButtonElement[]
        ).find(
          candidate =>
            candidate.textContent
              ?.includes(label)
        );

      expect(button).toBeTruthy();

      button!.click();
      fixture.detectChanges();
    }


    function showAthletesView(): void {
      fixture.componentInstance.setView(
        'athletes'
      );
      fixture.detectChanges();
    }


    function showTemplatesView(): void {
      fixture.componentInstance.setView(
        'templates'
      );
      fixture.detectChanges();
    }


    it(
      'loads and renders active athletes',
      async () => {
        createPage();
        await flushInitial();

        await settle();
        showAthletesView();

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
        ).not.toContain('ID athlete-1');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Activo');
        expect(
          fixture.nativeElement.textContent
        ).toContain('3 sesiones últimos 7 días');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Actividad reciente');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Fuerza base');
        expect(
          fixture.nativeElement.textContent
        ).toContain('2 rutinas activas');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Ver deportista');
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
        showAthletesView();

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
        ).not.toContain('ID athlete-1');
      }
    );


    it(
      'uses a human fallback when name and email are missing',
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
        showAthletesView();

        const athlete =
          fixture.componentInstance
            .athletes()[0]!;

        expect(
          fixture.componentInstance
            .athleteTitle(athlete)
        ).toBe('Deportista');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Deportista');
        expect(
          fixture.nativeElement.textContent
        ).not.toContain('athlete-1');
      }
    );


    it(
      'starts on the dashboard without rendering secondary lists',
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
                'athlete-2',
              status:
                'inactive',
              email:
                'inactive@example.com',
              display_name:
                'Inactive One',
              client_since:
                '2026-08-16T10:00:00Z'
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
                'swim-base',
              name:
                'Base natación',
              discipline:
                'swimming',
              data: {},
              created_at:
                '2026-09-01T10:00:00Z',
              updated_at:
                '2026-09-01T10:00:00Z'
            }
          ]
        );
        await settle();

        const text =
          fixture.nativeElement.textContent;

        expect(
          fixture.componentInstance
            .activeView()
        ).toBe('dashboard');
        expect(text).toContain(
          'Panel de entrenador'
        );
        expect(text).toContain(
          'Supervisa a tus deportistas y gestiona su planificación.'
        );
        expect(text).toContain(
          'Clientes activos'
        );
        expect(text).toContain(
          'Plantillas'
        );
        expect(text).toContain(
          'Sesiones · 7 días'
        );
        expect(text).toContain(
          '2'
        );
        expect(text).toContain(
          '3'
        );
        expect(text).toContain(
          'Acciones rápidas'
        );
        expect(
          fixture.nativeElement
            .querySelector('.athlete-card')
        ).toBeNull();
        expect(
          fixture.nativeElement
            .querySelector('.template-card')
        ).toBeNull();
        expect(text).not.toContain(
          'Athlete One'
        );
        expect(text).not.toContain(
          'Base fuerza'
        );
      }
    );


    it(
      'shows clients from the dashboard quick action',
      async () => {
        createPage();
        await flushInitial();
        await settle();

        clickButton('Ver clientes');

        expect(
          fixture.componentInstance
            .activeView()
        ).toBe('athletes');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Clientes');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Athlete One');
        expect(
          fixture.nativeElement
            .querySelector('.athlete-card')
        ).not.toBeNull();
      }
    );


    it(
      'shows templates from the dashboard quick action',
      async () => {
        createPage();
        await flushInitial();
        await settle();

        clickButton('Plantillas');

        expect(
          fixture.componentInstance
            .activeView()
        ).toBe('templates');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Base fuerza');
        expect(
          fixture.nativeElement
            .querySelector('.template-card')
        ).not.toBeNull();
      }
    );


    it(
      'returns from clients to the dashboard',
      async () => {
        createPage();
        await flushInitial();
        await settle();

        showAthletesView();
        clickButton('← Panel');

        expect(
          fixture.componentInstance
            .activeView()
        ).toBe('dashboard');
        expect(
          fixture.nativeElement
            .querySelector('.athlete-card')
        ).toBeNull();
      }
    );


    it(
      'returns from templates to the dashboard',
      async () => {
        createPage();
        await flushInitial();
        await settle();

        showTemplatesView();
        clickButton('← Panel');

        expect(
          fixture.componentInstance
            .activeView()
        ).toBe('dashboard');
        expect(
          fixture.nativeElement
            .querySelector('.template-card')
        ).toBeNull();
      }
    );


    it(
      'disables refresh while overviews are loading',
      async () => {
        createPage();

        await flushPromises();

        http.expectOne(
          `${environment.apiUrl}/trainer/athletes`
        ).flush([
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

        http.expectOne(
          `${environment.apiUrl}/trainer/templates`
        ).flush([]);

        const overviewRequest =
          await expectRequest(
            (
              `${environment.apiUrl}/trainer/athletes/` +
              'athlete-1'
            )
          );

        expect(
          fixture.componentInstance
            .loadingOverviews()
        ).toBe(true);

        showAthletesView();
        fixture.detectChanges();

        expect(
          refreshButton().disabled
        ).toBe(true);
        expect(
          refreshButton().textContent
        ).toContain('Actualizando');

        overviewRequest.flush(
          overviewResponse({
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
          })
        );

        await settle();

        expect(
          refreshButton().disabled
        ).toBe(false);
        expect(
          refreshButton().textContent
        ).toContain('Actualizar');
      }
    );


    it(
      'shows a complete sessions summary when every overview loads',
      async () => {
        createPage();
        await flushInitial();
        await settle();

        expect(
          fixture.componentInstance
            .summarySessionsLabel()
        ).toBe('3');
        expect(
          fixture.nativeElement.textContent
        ).not.toContain('parcial');
      }
    );


    it(
      'loads and renders templates',
      async () => {
        createPage();
        await flushInitial();

        await settle();

        showTemplatesView();

        expect(
          fixture.nativeElement.textContent
        ).toContain('Base fuerza');
        expect(
          fixture.nativeElement.textContent
        ).toContain('Fuerza');
      }
    );


    it(
      'switches to templates from the quick assignment action',
      async () => {
        createPage();
        await flushInitial();
        await settle();

        clickButton('Plantillas');

        expect(
          fixture.componentInstance
            .activeView()
        ).toBe('templates');
        expect(
          fixture.nativeElement.textContent
        ).toContain(
          'Asignar plantilla'
        );
      }
    );


    it(
      'keeps athletes visible when one overview fails',
      async () => {
        createPage();

        await flushPromises();

        http.expectOne(
          `${environment.apiUrl}/trainer/athletes`
        ).flush([
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
              'athlete-2',
            status:
              'active',
            email:
              'second@example.com',
            display_name:
              'Second Athlete',
            client_since:
              '2026-08-16T10:00:00Z'
          }
        ]);

        http.expectOne(
          `${environment.apiUrl}/trainer/templates`
        ).flush([]);

        await flushPromises();

        (
          await expectRequest(
            (
              `${environment.apiUrl}/trainer/athletes/` +
              'athlete-1'
            )
          )
        ).flush(
          overviewResponse({
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
          })
        );

        (
          await expectRequest(
            (
              `${environment.apiUrl}/trainer/athletes/` +
              'athlete-2'
            )
          )
        ).flush(
          {
            detail:
              'No disponible'
          },
          {
            status:
              502,
            statusText:
              'Bad Gateway'
          }
        );

        await settle();

        expect(
          fixture.nativeElement.textContent
        ).toContain(
          '3 · parcial'
        );
        expect(
          fixture.nativeElement.textContent
        ).toContain(
          'Datos disponibles de 1 de 2 clientes activos.'
        );
        expect(
          fixture.componentInstance
            .summarySessionsLabel()
        ).toBe('3 · parcial');

        showAthletesView();

        const text =
          fixture.nativeElement.textContent;

        expect(text).toContain(
          'Athlete One'
        );
        expect(text).toContain(
          'Second Athlete'
        );
        expect(text).toContain(
          'Actividad no disponible'
        );
        expect(text).toContain(
          '3 sesiones últimos 7 días'
        );
      }
    );


    it(
      'shows no completed sessions when overview has no last workout',
      async () => {
        const athlete = {
          athlete_id:
            'athlete-1',
          status:
            'active' as const,
          email:
            'athlete@example.com',
          display_name:
            'Athlete One',
          client_since:
            '2026-08-15T10:00:00Z'
        };

        createPage();
        await flushInitial(
          [
            athlete
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
            }
          ],
          {
            'athlete-1':
              overviewResponse(
                athlete,
                {
                  recent_training: {
                    last_completed:
                      null,
                    completed_last_7_days:
                      0
                  }
                }
              )
          }
        );
        await settle();
        showAthletesView();

        const text =
          fixture.nativeElement.textContent;

        expect(text).toContain(
          'Sin sesiones completadas'
        );
        expect(text).toContain(
          'Sin actividad esta semana'
        );
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

        showTemplatesView();
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

        showTemplatesView();
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

        showTemplatesView();
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
        showAthletesView();

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

        showTemplatesView();
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


    function overviewResponse(
      athlete: TrainerAthlete,
      patch: Partial<TrainerAthleteOverview> = {}
    ): TrainerAthleteOverview {
      return {
        athlete_id:
          athlete.athlete_id,
        status:
          athlete.status,
        email:
          athlete.email,
        display_name:
          athlete.display_name,
        client_since:
          athlete.client_since,
        health: {
          weight_measurement_date:
            null,
          waist_measurement_date:
            null,
          weight_kg:
            null,
          body_fat_percent:
            null,
          muscle_mass_kg:
            null,
          body_water_percent:
            null,
          visceral_fat_index:
            null,
          waist_cm:
            null
        },
        recent_training: {
          last_completed: {
            workout_id:
              'workout-1',
            routine_id:
              'routine-1',
            session_id:
              'session-1',
            session_name:
              'Fuerza base',
            finished_at:
              '2026-09-02T10:00:00Z'
          },
          completed_last_7_days:
            3
        },
        active_routines: {
          strength: {
            routine_id:
              'strength-routine',
            name:
              'Fuerza',
            activated_at:
              '2026-09-01T10:00:00Z'
          },
          swimming: {
            routine_id:
              'swimming-routine',
            name:
              'Natación',
            activated_at:
              '2026-09-01T10:00:00Z'
          },
          running:
            null,
          cycling:
            null
        },
        trainer: {
          last_assignment:
            null
        },
        ...patch
      };
    }
  }
);
