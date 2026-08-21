/**
 * @vitest-environment jsdom
 */

import {
  signal
} from '@angular/core';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import {
  provideHttpClient
} from '@angular/common/http';
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
  environment
} from '../../../environments/environment';
import {
  AuthService
} from '../../core/auth.service';
import {
  Routines
} from './routines';


describe('Routines training analytics', () => {
  let http:
    HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Routines
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
  });


  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });


  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
  }


  function analytics(
    overrides: any = {}
  ) {
    return {
      period:
        '4w',
      fromDate:
        '2026-07-23T00:00:00+00:00',
      toDate:
        '2026-08-20T00:00:00+00:00',
      summary: {
        workouts: 3,
        completedSets: 12,
        totalVolume: 8450,
        uniqueExercises: 5
      },
      muscleGroups: [
        {
          muscle:
            'Pecho',
          completedSets: 8
        },
        {
          muscle:
            'Espalda',
          completedSets: 4
        }
      ],
      exercises: [
        {
          exerciseId:
            'bench-press',
          name:
            'Press de banca',
          recordTypes: [
            'weight_reps'
          ],
          sessions: 2,
          completedSets: 6,
          maxWeight: 100,
          bestSet:
            '100 kg x 5 reps',
          bestE1rm: 116.7,
          firstE1rm: 110,
          lastE1rm: 116.7,
          e1rmChange: 6.7,
          e1rmChangePercent: 6.1,
          trend:
            'improving',
          trendExposures: 3,
          plateau: false,
          signal:
            'Progreso consistente',
          totalVolume: 3000,
          lastMark:
            '95 kg x 6 reps'
        }
      ],
      progress: [
        {
          exerciseId:
            'bench-press',
          name:
            'Press de banca',
          points: [
            {
              workoutId:
                'workout-1',
              date:
                '2026-08-10T10:00:00+00:00',
              maxWeight: 100,
              bestE1rm: 116.7,
              bestReps: 5,
              totalReps: 16,
              validSets: 2,
              rir: 2
            },
            {
              workoutId:
                'workout-2',
              date:
                '2026-08-17T10:00:00+00:00',
              maxWeight: 105,
              bestE1rm: 120,
              bestReps: 6,
              totalReps: 18,
              validSets: 2,
              rir: 2
            }
          ]
        }
      ],
      ...overrides
    };
  }


  async function createLoadedComponent(
    analyticsPayload = analytics()
  ) {
    const fixture =
      TestBed.createComponent(
        Routines
      );

    fixture.detectChanges();

    await flushPromises();

    http
      .expectOne(
        `${environment.apiUrl}/exercises`
      )
      .flush([]);

    http
      .expectOne(
        request =>
          request.url ===
          `${environment.apiUrl}/analytics/training` &&
          request.params.get('period') === '4w'
      )
      .flush(analyticsPayload);

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
      fixture.nativeElement
        .textContent ?? ''
    ).replace(/\s+/g, ' ');
  }


  it('renders training analytics metrics', async () => {
    const fixture =
      await createLoadedComponent();

    const text =
      pageText(fixture);

    expect(text).toContain(
      'Planificación'
    );
    expect(text).not.toContain(
      'Rutinas'
    );
    expect(text).toContain(
      'Gestionar rutina'
    );
    expect(text).toContain(
      'Crear rutina manual'
    );
    expect(text).toContain(
      'Entrenamientos 3'
    );
    expect(text).toContain(
      'Series completadas 12'
    );
    expect(text).toContain(
      'Volumen total 8450 kg'
    );
    expect(text).toContain(
      'Ejercicios realizados 5'
    );
    expect(text).toContain(
      'Press de banca'
    );
    expect(text).toContain(
      'Mejorando'
    );
    expect(text).toContain(
      '+6,7 kg (+6,1%)'
    );
  });


  it('renders selected exercise trend summary and e1RM curve', async () => {
    const fixture =
      await createLoadedComponent();
    const root =
      fixture.nativeElement as HTMLElement;
    const text =
      pageText(fixture);

    expect(text).toContain(
      'Tendencia Mejorando'
    );
    expect(text).toContain(
      'e1RM actual 116,7 kg'
    );
    expect(text).toContain(
      'Cambio reciente +6,7 kg (+6,1%)'
    );
    expect(text).toContain(
      'Exposiciones 3'
    );
    expect(text).toContain(
      'Progreso consistente'
    );
    expect(text).toContain(
      '1RM estimado'
    );
    expect(text).toContain(
      '110 kg -> 116,7 kg'
    );

    expect(
      root.querySelector(
        '.e1rm-chart svg polyline'
      )
    ).toBeTruthy();
  });


  it('groups exercises by trend and can select from a trend group', async () => {
    const fixture =
      await createLoadedComponent(
        analytics({
          exercises: [
            {
              exerciseId:
                'bench-press',
              name:
                'Press de banca',
              recordTypes:
                ['weight_reps'],
              sessions: 4,
              completedSets: 8,
              firstE1rm: 110,
              lastE1rm: 110.5,
              e1rmChange: 0.5,
              e1rmChangePercent: 0.5,
              trend:
                'stable',
              trendExposures: 4,
              plateau: true,
              signal:
                'Sin mejora relevante en 4 exposiciones'
            },
            {
              exerciseId:
                'lat-pulldown',
              name:
                'Jalón al pecho',
              recordTypes:
                ['weight_reps'],
              sessions: 3,
              completedSets: 6,
              firstE1rm: 80,
              lastE1rm: 75,
              e1rmChange: -5,
              e1rmChangePercent: -6.3,
              trend:
                'declining',
              trendExposures: 3,
              plateau: false,
              signal:
                'Rendimiento reciente en descenso'
            }
          ],
          progress: [
            {
              exerciseId:
                'bench-press',
              name:
                'Press de banca',
              points: [
                {
                  workoutId:
                    'bench-1',
                  date:
                    '2026-08-10T10:00:00+00:00',
                  bestE1rm: 110,
                  totalReps: 16,
                  validSets: 2
                }
              ]
            },
            {
              exerciseId:
                'lat-pulldown',
              name:
                'Jalón al pecho',
              points: [
                {
                  workoutId:
                    'lat-1',
                  date:
                    '2026-08-10T10:00:00+00:00',
                  bestE1rm: 80,
                  totalReps: 20,
                  validSets: 2
                }
              ]
            }
          ]
        })
      );
    const root =
      fixture.nativeElement as HTMLElement;

    expect(
      pageText(fixture)
    ).toContain(
      'Estables Press de banca +0,5 kg (+0,5%) 4 exposiciones · plateau'
    );
    expect(
      pageText(fixture)
    ).toContain(
      'En descenso Jalón al pecho -5 kg (-6,3%) 3 exposiciones'
    );

    const latButton =
      Array.from(
        root.querySelectorAll(
          '.trend-exercise'
        )
      ).find(button =>
        button.textContent?.includes(
          'Jalón al pecho'
        )
      ) as HTMLButtonElement;

    latButton.click();
    fixture.detectChanges();

    expect(
      fixture.componentInstance
        .selectedAnalyticsExerciseId()
    ).toBe('lat-pulldown');
  });


  it('shows a comparable metric fallback for non e1RM exercises', async () => {
    const fixture =
      await createLoadedComponent(
        analytics({
          exercises: [
            {
              exerciseId:
                'plank',
              name:
                'Plancha',
              recordTypes:
                ['duration'],
              sessions: 2,
              completedSets: 4,
              trend:
                'insufficient_data',
              trendExposures: 2
            }
          ],
          progress: [
            {
              exerciseId:
                'plank',
              name:
                'Plancha',
              points: [
                {
                  workoutId:
                    'plank-1',
                  date:
                    '2026-08-10T10:00:00+00:00',
                  totalReps: null,
                  validSets: 0
                }
              ]
            }
          ]
        })
      );

    expect(
      pageText(fixture)
    ).toContain(
      'Sin métrica de fuerza comparable'
    );
  });


  it('reloads analytics when the period changes', async () => {
    const fixture =
      await createLoadedComponent();

    const root =
      fixture.nativeElement as HTMLElement;

    const buttons =
      Array.from(
        root.querySelectorAll(
          '.period-selector button'
        )
      ) as HTMLButtonElement[];

    const button =
      buttons.find(
        item =>
          item.textContent
            ?.includes('3 meses')
      );

    expect(button).toBeTruthy();

    button?.click();
    fixture.detectChanges();
    await flushPromises();

    http
      .expectOne(
        request =>
          request.url ===
          `${environment.apiUrl}/analytics/training` &&
          request.params.get('period') === '3m'
      )
      .flush(
        analytics({
          period:
            '3m',
          summary: {
            workouts: 4,
            completedSets: 16,
            totalVolume: 12000,
            uniqueExercises: 6
          }
        })
      );

    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      pageText(fixture)
    ).toContain(
      'Entrenamientos 4'
    );
  });


  it('renders the empty state for periods without workouts', async () => {
    const fixture =
      await createLoadedComponent(
        analytics({
          summary: {
            workouts: 0,
            completedSets: 0,
            totalVolume: 0,
            uniqueExercises: 0
          },
          muscleGroups: [],
          exercises: [],
          progress: []
        })
      );

    expect(
      pageText(fixture)
    ).toContain(
      'No hay entrenamientos completados en este período.'
    );
  });


  it('renders analytics errors separately from empty data', async () => {
    const fixture =
      TestBed.createComponent(
        Routines
      );

    fixture.detectChanges();
    await flushPromises();

    http
      .expectOne(
        `${environment.apiUrl}/exercises`
      )
      .flush([]);

    http
      .expectOne(
        request =>
          request.url ===
          `${environment.apiUrl}/analytics/training`
      )
      .flush(
        {
          detail:
            'Not Found'
        },
        {
          status: 404,
          statusText: 'Not Found'
        }
      );

    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      pageText(fixture)
    ).toContain(
      'No se pudo cargar el análisis de entrenamiento.'
    );

    expect(
      pageText(fixture)
    ).not.toContain(
      'Not Found'
    );
  });


  it('does not render Not Found for an empty 200 response', async () => {
    const fixture =
      await createLoadedComponent(
        analytics({
          summary: {
            workouts: 0,
            completedSets: 0,
            totalVolume: 0,
            uniqueExercises: 0
          },
          muscleGroups: [],
          exercises: [],
          progress: []
        })
      );

    const text =
      pageText(fixture);

    expect(text).toContain(
      'No hay entrenamientos completados en este período.'
    );
    expect(text).not.toContain(
      'Not Found'
    );
  });


  it('renders muscle ranking', async () => {
    const fixture =
      await createLoadedComponent();

    const text =
      pageText(fixture);

    expect(text).toContain(
      'Pecho 8 series'
    );
    expect(text).toContain(
      'Espalda 4 series'
    );
  });
});
