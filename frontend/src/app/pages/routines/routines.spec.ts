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
import * as XLSX from 'xlsx';
import {
  AuthService
} from '../../core/auth.service';
import {
  Routines
} from './routines';

type ImportIssueLike = {
  severity:
    | 'error'
    | 'warning'
    | 'autocorrection';
  sheet: string;
  row?: number;
  column?: string;
  message: string;
};

type ImportValidationLike = {
  sessions: any[];
  errors: ImportIssueLike[];
  warnings: ImportIssueLike[];
  autocorrections: ImportIssueLike[];
};


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


  const catalogExercise = (
    id = 'bench-press',
    name = 'Press de banca'
  ) => ({
    id,
    name,
    muscle:
      'Pecho',
    equipment:
      'Barra',
    type:
      'strength',
    category:
      'compound'
  });


  function routineRow(
    overrides: Record<string, any> = {}
  ) {
    return {
      'Sesión':
        'A',
      'Orden':
        1,
      'Ejercicio':
        'Press de banca',
      'Series':
        3,
      'Tipo de objetivo':
        'repeticiones',
      'Objetivo mínimo':
        6,
      'Objetivo máximo':
        10,
      'RIR mínimo':
        1,
      'RIR máximo':
        3,
      'Descanso (s)':
        120,
      'Notas':
        '',
      '_GymOS exercise':
        'bench-press',
      ...overrides
    };
  }


  function workbookForImport(
    options: {
      routineRows?: Record<string, any>[];
      sessionRows?: Record<string, any>[];
      metadata?: any[] | null;
    } = {}
  ): XLSX.WorkBook {
    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        options.sessionRows ?? [
          {
            'Sesión': 'A',
            'Orden': 1,
            'Nombre': 'Sesión A',
            '_GymOS session': ''
          },
          {
            'Sesión': 'B',
            'Orden': 2,
            'Nombre': 'Sesión B',
            '_GymOS session': ''
          }
        ]
      ),
      'Sesiones'
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        options.routineRows ?? [
          routineRow(),
          routineRow({
            'Sesión': 'B',
            'Orden': 1
          })
        ]
      ),
      'Rutina'
    );

    if (
      options.metadata !== null
    ) {
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet(
          options.metadata ?? [
            [
              'templateVersion',
              2
            ],
            [
              'schemaVersion',
              '4.2'
            ],
            [
              'kind',
              'template'
            ]
          ]
        ),
        '_GymOS'
      );
    }

    return workbook;
  }


  function validateWorkbook(
    workbook: XLSX.WorkBook,
    exercises = [
      catalogExercise()
    ]
  ) {
    const fixture =
      TestBed.createComponent(
        Routines
      );
    const component =
      fixture.componentInstance as any;

    component.exercises.set(
      exercises
    );

    return component
      .validateImportedWorkbook(
        workbook
      ) as ImportValidationLike;
  }


  it.each([
    'reps',
    'Reps',
    ' REPETICIONES ',
    'repeticion',
    'repetición',
    'repeticiones',
    'repetitions'
  ])(
    'normalizes target type alias "%s" to repeticiones',
    targetType => {
      const validation =
        validateWorkbook(
          workbookForImport({
            routineRows: [
              routineRow({
                'Tipo de objetivo':
                  targetType
              }),
              routineRow({
                'Sesión': 'B',
                'Orden': 1
              })
            ]
          })
        );

      expect(validation.errors)
        .toHaveLength(0);
      expect(
        validation.sessions[0]
          .exercises[0]
          .repsMin
      ).toBe(6);

      if (
        targetType !== 'repeticiones'
      ) {
        expect(
          validation.autocorrections
            .some(
              issue =>
                issue.sheet === 'Rutina' &&
                issue.column ===
                  'Tipo de objetivo' &&
                issue.message.includes(
                  'repeticiones'
                )
            )
        ).toBe(true);
      }
    }
  );


  it.each([
    'duración',
    'duracion',
    'Duration',
    'seconds',
    'segundos',
    ' SEC '
  ])(
    'normalizes duration target type alias "%s" to duración',
    targetType => {
      const validation =
        validateWorkbook(
          workbookForImport({
            routineRows: [
              routineRow({
                'Tipo de objetivo':
                  targetType,
                'Objetivo mínimo':
                  45,
                'Objetivo máximo':
                  60
              }),
              routineRow({
                'Sesión': 'B',
                'Orden': 1
              })
            ]
          })
        );

      expect(validation.errors)
        .toHaveLength(0);
      expect(
        validation.sessions[0]
          .exercises[0]
      ).toMatchObject({
        targetType:
          'duración',
        repsMin:
          45,
        repsMax:
          60
      });

      if (
        targetType !== 'duración'
      ) {
        expect(
          validation.autocorrections
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              sheet: 'Rutina',
              row: 2,
              column:
                'Tipo de objetivo',
              message:
                `"${targetType}" → "duración"`
            })
          ])
        );
      }
    }
  );


  it('keeps canonical target type unchanged without an autocorrection', () => {
    const validation =
      validateWorkbook(
        workbookForImport()
      );

    expect(validation.errors)
      .toHaveLength(0);
    expect(
      validation.autocorrections
        .some(
          issue =>
            issue.column ===
            'Tipo de objetivo'
        )
    ).toBe(false);
  });


  it('keeps ambiguous target types as blocking errors', () => {
    const validation =
      validateWorkbook(
        workbookForImport({
          routineRows: [
            routineRow({
              'Tipo de objetivo':
                'fuerza'
            }),
            routineRow({
              'Sesión': 'B',
              'Orden': 1
            })
          ]
        })
      );

    expect(validation.errors)
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sheet: 'Rutina',
            row: 2,
            column:
              'Tipo de objetivo',
            message:
              'Usa "repeticiones" o "duración".'
          })
        ])
      );
  });


  it('rejects invalid duration ranges', () => {
    const maxBelowMin =
      validateWorkbook(
        workbookForImport({
          routineRows: [
            routineRow({
              'Tipo de objetivo':
                'duración',
              'Objetivo mínimo':
                60,
              'Objetivo máximo':
                45
            }),
            routineRow({
              'Sesión': 'B',
              'Orden': 1
            })
          ]
        })
      );

    expect(maxBelowMin.errors)
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sheet: 'Rutina',
            row: 2,
            column:
              'Objetivo mínimo/máximo'
          })
        ])
      );

    const zeroDuration =
      validateWorkbook(
        workbookForImport({
          routineRows: [
            routineRow({
              'Tipo de objetivo':
                'duración',
              'Objetivo mínimo':
                0,
              'Objetivo máximo':
                60
            }),
            routineRow({
              'Sesión': 'B',
              'Orden': 1
            })
          ]
        })
      );

    expect(zeroDuration.errors)
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sheet: 'Rutina',
            row: 2,
            column:
              'Objetivo mínimo/máximo',
            message:
              'La duración debe estar entre 1 y 3600 segundos y el máximo no puede ser menor que el mínimo.'
          })
        ])
      );
  });


  it('keeps unknown exercise IDs as blocking errors', () => {
    const validation =
      validateWorkbook(
        workbookForImport({
          routineRows: [
            routineRow({
              '_GymOS exercise':
                'unknown-exercise'
            }),
            routineRow({
              'Sesión': 'B',
              'Orden': 1
            })
          ]
        })
      );

    expect(validation.errors)
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sheet: 'Rutina',
            row: 2,
            column:
              '_GymOS exercise'
          })
        ])
      );
  });


  it('trims accidental whitespace in exercise IDs without fuzzy matching', () => {
    const validation =
      validateWorkbook(
        workbookForImport({
          routineRows: [
            routineRow({
              '_GymOS exercise':
                ' bench-press '
            }),
            routineRow({
              'Sesión': 'B',
              'Orden': 1
            })
          ]
        })
      );

    expect(validation.errors)
      .toHaveLength(0);
    expect(
      validation.autocorrections
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sheet: 'Rutina',
          row: 2,
          column:
            '_GymOS exercise',
          message:
            '" bench-press " → "bench-press"'
        })
      ])
    );
  });


  it('imports compatible legacy files without templateVersion as warnings only', () => {
    const validation =
      validateWorkbook(
        workbookForImport({
          metadata: null
        })
      );

    expect(validation.errors)
      .toHaveLength(0);
    expect(validation.warnings)
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sheet: '_GymOS',
            column:
              'templateVersion'
          })
        ])
      );
  });


  it('does not block import for warnings or autocorrections but blocks errors', () => {
    const warningOnly =
      validateWorkbook(
        workbookForImport({
          routineRows: [
            routineRow({
              'Ejercicio':
                'Nombre externo',
              'Tipo de objetivo':
                'Reps'
            }),
            routineRow({
              'Sesión': 'B',
              'Orden': 1
            })
          ]
        })
      );

    expect(warningOnly.errors)
      .toHaveLength(0);
    expect(warningOnly.warnings.length)
      .toBeGreaterThan(0);
    expect(
      warningOnly.autocorrections.length
    ).toBeGreaterThan(0);

    const withError =
      validateWorkbook(
        workbookForImport({
          routineRows: [
            routineRow({
              'Tipo de objetivo':
                'fuerza'
            }),
            routineRow({
              'Sesión': 'B',
              'Orden': 1
            })
          ]
        })
      );

    expect(withError.errors.length)
      .toBeGreaterThan(0);
  });


  it('regresses the production row 7 target type error into an autocorrection', () => {
    const exercises =
      Array.from(
        {
          length: 6
        },
        (_, index) =>
          catalogExercise(
            `exercise-${index + 1}`,
            `Ejercicio ${index + 1}`
          )
      );
    const routineRows =
      exercises.map(
        (exercise, index) =>
          routineRow({
            'Sesión':
              index < 3 ? 'A' : 'B',
            'Orden':
              index < 3
                ? index + 1
                : index - 2,
            'Ejercicio':
              exercise.name,
            '_GymOS exercise':
              exercise.id,
            'Tipo de objetivo':
              index === 5
                ? 'reps'
                : 'repeticiones'
          })
      );

    const validation =
      validateWorkbook(
        workbookForImport({
          routineRows
        }),
        exercises
      );

    expect(validation.errors)
      .toHaveLength(0);
    expect(
      validation.autocorrections
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sheet: 'Rutina',
          row: 7,
          column:
            'Tipo de objetivo',
          message:
            '"reps" → "repeticiones"'
        })
      ])
    );
  });


  it('imports a duration target as a timed exercise range in seconds', () => {
    const validation =
      validateWorkbook(
        workbookForImport({
          routineRows: [
            routineRow({
              'Tipo de objetivo':
                'duración',
              'Objetivo mínimo':
                45,
              'Objetivo máximo':
                60
            }),
            routineRow({
              'Sesión': 'B',
              'Orden': 1
            })
          ]
        })
      );

    expect(validation.errors)
      .toHaveLength(0);
    expect(
      validation.sessions[0]
        .exercises[0]
    ).toMatchObject({
      targetType:
        'duración',
      repsMin:
        45,
      repsMax:
        60
    });
  });


  it('imports plank as a valid timed exercise with RIR and rest', () => {
    const plank =
      catalogExercise(
        'plank',
        'Plancha'
      );
    const validation =
      validateWorkbook(
        workbookForImport({
          routineRows: [
            routineRow({
              'Ejercicio':
                'Plancha',
              '_GymOS exercise':
                'plank',
              'Series':
                2,
              'Tipo de objetivo':
                'duración',
              'Objetivo mínimo':
                45,
              'Objetivo máximo':
                60,
              'RIR mínimo':
                2,
              'RIR máximo':
                3,
              'Descanso (s)':
                60
            }),
            routineRow({
              'Sesión': 'B',
              'Orden': 1,
              'Ejercicio':
                'Plancha',
              '_GymOS exercise':
                'plank',
              'Tipo de objetivo':
                'duración',
              'Objetivo mínimo':
                45,
              'Objetivo máximo':
                60
            })
          ]
        }),
        [
          plank
        ]
      );

    expect(validation.errors)
      .toHaveLength(0);
    expect(
      validation.sessions[0]
        .exercises[0]
    ).toMatchObject({
      exerciseId:
        'plank',
      name:
        'Plancha',
      sets:
        2,
      targetType:
        'duración',
      repsMin:
        45,
      repsMax:
        60,
      rirMin:
        2,
      rirMax:
        3,
      restSeconds:
        60
    });
  });


  it('builds duration imports with the canonical Train timed-exercise payload', () => {
    const fixture =
      TestBed.createComponent(
        Routines
      );
    const component =
      fixture.componentInstance as any;

    component.routineName.set(
      'Rutina temporizada'
    );
    component.sessions.set([
      {
        sessionId:
          'session-a',
        name:
          'Core',
        exercises: [
          {
            exerciseId:
              'plank',
            name:
              'Plancha',
            sets:
              2,
            targetType:
              'duración',
            repsMin:
              45,
            repsMax:
              60,
            rirMin:
              2,
            rirMax:
              3,
            restSeconds:
              60,
            weight:
              null
          }
        ]
      }
    ]);

    const routine =
      component
        .buildCanonicalRoutine();
    const exercise =
      routine.sessions[0]
        .exercises[0];

    expect(exercise)
      .toMatchObject({
        exerciseId:
          'plank',
        recordType:
          'duration',
        recordTypes: [
          'duration'
        ],
        target:
          '45-60 s',
        prescription: {
          recordType:
            'duration',
          target: {
            type:
              'duration',
            min:
              45,
            max:
              60,
            unit:
              'seconds'
          },
          targetRir: {
            min:
              2,
            max:
              3
          },
          restSeconds:
            60
        }
      });
  });


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
