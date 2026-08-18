import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import * as XLSX from 'xlsx';

import { AuthService } from '../../core/auth.service';

interface Exercise {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  type: string;
  category: string;
  notes?: string;
  custom?: boolean;
}

interface RoutineExercise {
  exerciseId: string;
  name: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  rirMin: number;
  rirMax: number;
  restSeconds: number;
  weight?: number | null;
}

interface RoutineSessionDraft {
  sessionId: string;
  name: string;
  exercises: RoutineExercise[];
}

interface CanonicalRoutine {
  routineId: string;
  schemaVersion: string;
  revision: number;
  name?: string;
  sessions: any[];
  createdAt?: string;
  updatedAt?: string;
}

interface WorkoutSet {
  setId: string;
  exerciseId: string;
  setIndex: number;
  weight?: number | null;
  reps?: number | null;
  rir?: number | null;
  durationSeconds?: number | null;
  completedAt?: string | null;
}

interface Workout {
  workoutId: string;
  routineId: string;
  sessionId: string;
  status: 'in_progress' | 'finished';
  startedAt?: string;
  finishedAt?: string;
  sets: WorkoutSet[];
}

interface StoredRoutine {
  routineId: string;
  name?: string;
  sessions: {
    sessionId: string;
    name?: string;
    label?: string;
  }[];
}

@Component({
  selector: 'app-routines',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './routines.html',
  styleUrl: './routines.scss'
})
export class Routines implements OnInit {
  exercises = signal<Exercise[]>([]);
  loadingExercises = signal(false);
  error = signal<string | null>(null);

  creating = signal(false);
  routineName = signal('Mi rutina');

  savingRoutine = signal(false);
  saveMessage = signal<string | null>(null);
  saveError = signal<string | null>(null);

  importMessage = signal<string | null>(null);
  importError = signal<string | null>(null);

  exportRecordsOpen = signal(false);

  exportPeriod = signal<
    '2weeks' | '1month' | '3months' | 'custom'
  >('1month');

  exportFrom = signal('');
  exportTo = signal('');

  exportingRecords = signal(false);
  exportRecordsError = signal<string | null>(null);

  sessions = signal<RoutineSessionDraft[]>([
    {
      sessionId: crypto.randomUUID(),
      name: 'Sesión A',
      exercises: []
    }
  ]);

  exercisePickerSessionId = signal<string | null>(null);
  exerciseSearch = signal('');

  private readonly apiUrl = 'http://127.0.0.1:8080/api/v1';

  constructor(
    private http: HttpClient,
    public auth: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadExercises();
  }

  async loadExercises(): Promise<void> {
    this.loadingExercises.set(true);
    this.error.set(null);

    try {
      const token = await this.auth.getAccessToken();

      if (!token) {
        throw new Error('Necesitas iniciar sesión.');
      }

      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`
      });

      const exercises = await new Promise<Exercise[]>(
        (resolve, reject) => {
          this.http
            .get<Exercise[]>(
              `${this.apiUrl}/exercises`,
              { headers }
            )
            .subscribe({
              next: resolve,
              error: reject
            });
        }
      );

      this.exercises.set(exercises);

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo cargar la biblioteca de ejercicios.'
      );
    } finally {
      this.loadingExercises.set(false);
    }
  }

  startManualRoutine(): void {
    this.creating.set(true);

    this.saveMessage.set(null);
    this.saveError.set(null);

    this.importMessage.set(null);
    this.importError.set(null);
  }

  addSession(): void {
    const nextLetter = String.fromCharCode(
      65 + this.sessions().length
    );

    this.sessions.update(current => [
      ...current,
      {
        sessionId: crypto.randomUUID(),
        name: `Sesión ${nextLetter}`,
        exercises: []
      }
    ]);
  }

  removeSession(sessionId: string): void {
    if (this.sessions().length <= 1) {
      return;
    }

    this.sessions.update(current =>
      current.filter(
        session => session.sessionId !== sessionId
      )
    );
  }

  openExercisePicker(sessionId: string): void {
    this.exercisePickerSessionId.set(sessionId);
    this.exerciseSearch.set('');
  }

  closeExercisePicker(): void {
    this.exercisePickerSessionId.set(null);
  }

  filteredExercises(): Exercise[] {
    const query = this.exerciseSearch()
      .trim()
      .toLowerCase();

    if (!query) {
      return this.exercises();
    }

    return this.exercises().filter(exercise =>
      [
        exercise.name,
        exercise.muscle,
        exercise.equipment,
        exercise.type,
        exercise.id
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }

  addExerciseToSession(exercise: Exercise): void {
    const sessionId =
      this.exercisePickerSessionId();

    if (!sessionId) {
      return;
    }

    this.sessions.update(current =>
      current.map(session =>
        session.sessionId === sessionId
          ? {
              ...session,
              exercises: [
                ...session.exercises,
                {
                  exerciseId: exercise.id,
                  name: exercise.name,
                  sets: 3,
                  repsMin: 8,
                  repsMax: 12,
                  rirMin: 1,
                  rirMax: 3,
                  restSeconds: 120,
                  weight: null
                }
              ]
            }
          : session
      )
    );

    this.closeExercisePicker();
  }

  updateExerciseField(
    sessionId: string,
    exerciseIndex: number,
    field: keyof RoutineExercise,
    value: string
  ): void {
    this.sessions.update(current =>
      current.map(session => {
        if (session.sessionId !== sessionId) {
          return session;
        }

        return {
          ...session,
          exercises: session.exercises.map(
            (exercise, index) => {
              if (index !== exerciseIndex) {
                return exercise;
              }

              const numericFields: (keyof RoutineExercise)[] = [
                'sets',
                'repsMin',
                'repsMax',
                'rirMin',
                'rirMax',
                'restSeconds',
                'weight'
              ];

              return {
                ...exercise,
                [field]: numericFields.includes(field)
                  ? (
                      value === ''
                        ? null
                        : Number(value)
                    )
                  : value
              } as RoutineExercise;
            }
          )
        };
      })
    );
  }

  removeExercise(
    sessionId: string,
    exerciseIndex: number
  ): void {
    this.sessions.update(current =>
      current.map(session =>
        session.sessionId === sessionId
          ? {
              ...session,
              exercises:
                session.exercises.filter(
                  (_, index) =>
                    index !== exerciseIndex
                )
            }
          : session
      )
    );
  }

  private validateRoutine(): string | null {
    if (!this.routineName().trim()) {
      return 'Indica un nombre para la rutina.';
    }

    if (this.sessions().length === 0) {
      return 'La rutina debe tener al menos una sesión.';
    }

    for (const session of this.sessions()) {
      if (session.exercises.length === 0) {
        return `${session.name} no tiene ejercicios.`;
      }

      for (const exercise of session.exercises) {
        if (!exercise.exerciseId) {
          return `Hay un ejercicio sin exerciseId en ${session.name}.`;
        }

        if (
          !Number.isFinite(exercise.sets) ||
          exercise.sets < 1
        ) {
          return `${exercise.name}: el número de series no es válido.`;
        }

        if (
          !Number.isFinite(exercise.repsMin) ||
          !Number.isFinite(exercise.repsMax) ||
          exercise.repsMin < 1 ||
          exercise.repsMax < exercise.repsMin
        ) {
          return `${exercise.name}: el rango de repeticiones no es válido.`;
        }

        if (
          !Number.isFinite(exercise.rirMin) ||
          !Number.isFinite(exercise.rirMax) ||
          exercise.rirMin < 0 ||
          exercise.rirMax < exercise.rirMin
        ) {
          return `${exercise.name}: el rango de RIR no es válido.`;
        }

        if (
          !Number.isFinite(exercise.restSeconds) ||
          exercise.restSeconds < 0
        ) {
          return `${exercise.name}: el descanso no es válido.`;
        }
      }
    }

    return null;
  }

  private buildCanonicalRoutine(): CanonicalRoutine {
    const now = new Date().toISOString();

    return {
      routineId:
        `routine-${crypto.randomUUID()}`,

      schemaVersion: '4.2',
      revision: 1,

      name: this.routineName().trim(),

      createdAt: now,
      updatedAt: now,

      sessions: this.sessions().map(
        (session, sessionIndex) => ({
          sessionId: session.sessionId,

          name: session.name,
          label: session.name,

          order: sessionIndex + 1,

          exercises: session.exercises.map(
            (exercise, exerciseIndex) => ({
              exerciseId: exercise.exerciseId,
              id: exercise.exerciseId,

              name: exercise.name,

              order: exerciseIndex + 1,

              sets: exercise.sets,

              target:
                `${exercise.repsMin}-${exercise.repsMax} reps`,

              targetRir: {
                min: exercise.rirMin,
                max: exercise.rirMax
              },

              restSeconds:
                exercise.restSeconds,

              weight:
                exercise.weight ?? null,

              prescription: {
                sets: exercise.sets,

                reps: {
                  min: exercise.repsMin,
                  max: exercise.repsMax
                },

                targetRir: {
                  min: exercise.rirMin,
                  max: exercise.rirMax
                },

                restSeconds:
                  exercise.restSeconds,

                weight:
                  exercise.weight ?? null
              }
            })
          )
        })
      )
    };
  }

  async saveAndActivateRoutine(): Promise<void> {
    const validationError =
      this.validateRoutine();

    if (validationError) {
      this.saveError.set(validationError);
      this.saveMessage.set(null);
      return;
    }

    this.savingRoutine.set(true);

    this.saveError.set(null);
    this.saveMessage.set(null);

    try {
      const token =
        await this.auth.getAccessToken();

      if (!token) {
        throw new Error(
          'Necesitas iniciar sesión.'
        );
      }

      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      const routine =
        this.buildCanonicalRoutine();

      const created =
        await new Promise<CanonicalRoutine>(
          (resolve, reject) => {
            this.http
              .post<CanonicalRoutine>(
                `${this.apiUrl}/routines`,
                routine,
                { headers }
              )
              .subscribe({
                next: resolve,
                error: reject
              });
          }
        );

      const activated =
        await new Promise<CanonicalRoutine>(
          (resolve, reject) => {
            this.http
              .put<CanonicalRoutine>(
                `${this.apiUrl}/routines/${encodeURIComponent(
                  created.routineId
                )}/activate`,
                {},
                { headers }
              )
              .subscribe({
                next: resolve,
                error: reject
              });
          }
        );

      this.saveMessage.set(
        `Rutina "${activated.name ?? this.routineName()}" guardada y activada.`
      );

      this.creating.set(false);

    } catch (err: any) {
      this.saveError.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo guardar la rutina.'
      );
    } finally {
      this.savingRoutine.set(false);
    }
  }

  private normalizeHeader(
    value: unknown
  ): string {
    return String(value ?? '')
      .trim()
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .toLowerCase();
  }

  private readSheetRows(
    workbook: XLSX.WorkBook,
    sheetName: string
  ): Record<string, any>[] {
    const sheet =
      workbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error(
        `Falta la hoja "${sheetName}".`
      );
    }

    return XLSX.utils.sheet_to_json<
      Record<string, any>
    >(
      sheet,
      {
        defval: ''
      }
    );
  }

  async importRoutineFile(
    event: Event
  ): Promise<void> {
    const input =
      event.target as HTMLInputElement;

    const file =
      input.files?.[0];

    if (!file) {
      return;
    }

    this.importMessage.set(null);
    this.importError.set(null);

    this.saveMessage.set(null);
    this.saveError.set(null);

    try {
      const buffer =
        await file.arrayBuffer();

      const workbook =
        XLSX.read(
          buffer,
          {
            type: 'array'
          }
        );

      const sessionRows =
        this.readSheetRows(
          workbook,
          'Sesiones'
        );

      const routineRows =
        this.readSheetRows(
          workbook,
          'Rutina'
        );

      if (!sessionRows.length) {
        throw new Error(
          'La hoja Sesiones está vacía.'
        );
      }

      if (!routineRows.length) {
        throw new Error(
          'La hoja Rutina está vacía.'
        );
      }

      const catalogById =
        new Map(
          this.exercises().map(
            exercise => [
              exercise.id,
              exercise
            ]
          )
        );

      const importedSessions:
        RoutineSessionDraft[] =
        sessionRows.map(
          (row, index) => {
            const sessionKey =
              String(
                row['Sesión'] ?? ''
              ).trim();

            if (!sessionKey) {
              throw new Error(
                `Sesiones, fila ${index + 2}: falta Sesión.`
              );
            }

            const sessionId =
              String(
                row['_GymOS session'] ?? ''
              ).trim() ||
              crypto.randomUUID();

            return {
              sessionId,

              name:
                String(
                  row['Nombre'] ?? ''
                ).trim() ||
                `Sesión ${sessionKey}`,

              exercises: []
            };
          }
        );

      const sessionByKey =
        new Map<
          string,
          RoutineSessionDraft
        >();

      sessionRows.forEach(
        (row, index) => {
          const key =
            String(
              row['Sesión'] ?? ''
            ).trim();

          sessionByKey.set(
            key,
            importedSessions[index]
          );
        }
      );

      routineRows.forEach(
        (row, index) => {
          const excelRow =
            index + 2;

          const sessionKey =
            String(
              row['Sesión'] ?? ''
            ).trim();

          const session =
            sessionByKey.get(sessionKey);

          if (!session) {
            throw new Error(
              `Rutina, fila ${excelRow}: la sesión "${sessionKey}" no existe en la hoja Sesiones.`
            );
          }

          const exerciseId =
            String(
              row['_GymOS exercise'] ?? ''
            ).trim();

          const exerciseName =
            String(
              row['Ejercicio'] ?? ''
            ).trim();

          if (!exerciseId) {
            throw new Error(
              `Rutina, fila ${excelRow}: falta _GymOS exercise. GymOS no importa ejercicios únicamente por nombre.`
            );
          }

          const canonicalExercise =
            catalogById.get(exerciseId);

          if (!canonicalExercise) {
            throw new Error(
              `Rutina, fila ${excelRow}: el ID "${exerciseId}" no existe en el catálogo actual de GymOS.`
            );
          }

          const sets =
            Number(row['Series']);

          const targetType =
            this.normalizeHeader(
              row['Tipo de objetivo']
            );

          const targetMin =
            Number(
              row['Objetivo mínimo']
            );

          const targetMaxRaw =
            row['Objetivo máximo'];

          const targetMax =
            targetMaxRaw === '' ||
            targetMaxRaw === null ||
            targetMaxRaw === undefined
              ? targetMin
              : Number(targetMaxRaw);

          const rirMin =
            Number(
              row['RIR mínimo']
            );

          const rirMaxRaw =
            row['RIR máximo'];

          const rirMax =
            rirMaxRaw === '' ||
            rirMaxRaw === null ||
            rirMaxRaw === undefined
              ? rirMin
              : Number(rirMaxRaw);

          const restSeconds =
            Number(
              row['Descanso (s)']
            );

          if (
            !Number.isInteger(sets) ||
            sets < 1
          ) {
            throw new Error(
              `Rutina, fila ${excelRow}: Series no es válido.`
            );
          }

          if (
            ![
              'repeticiones',
              'repeticion',
              'reps',
              'rep'
            ].includes(targetType)
          ) {
            throw new Error(
              `Rutina, fila ${excelRow}: el tipo de objetivo "${row['Tipo de objetivo']}" todavía no es compatible con el constructor Angular.`
            );
          }

          if (
            !Number.isFinite(targetMin) ||
            !Number.isFinite(targetMax) ||
            targetMin < 1 ||
            targetMax < targetMin
          ) {
            throw new Error(
              `Rutina, fila ${excelRow}: rango de repeticiones no válido.`
            );
          }

          if (
            !Number.isFinite(rirMin) ||
            !Number.isFinite(rirMax) ||
            rirMin < 0 ||
            rirMax < rirMin
          ) {
            throw new Error(
              `Rutina, fila ${excelRow}: rango de RIR no válido.`
            );
          }

          if (
            !Number.isFinite(restSeconds) ||
            restSeconds < 0
          ) {
            throw new Error(
              `Rutina, fila ${excelRow}: descanso no válido.`
            );
          }

          if (
            exerciseName &&
            exerciseName !==
              canonicalExercise.name
          ) {
            console.warn(
              `GymOS: "${exerciseName}" sustituido por "${canonicalExercise.name}" porque el ID autoritativo es "${exerciseId}".`
            );
          }

          session.exercises.push({
            exerciseId:
              canonicalExercise.id,

            name:
              canonicalExercise.name,

            sets,

            repsMin:
              targetMin,

            repsMax:
              targetMax,

            rirMin,

            rirMax,

            restSeconds,

            weight: null
          });
        }
      );

      for (
        const session
        of importedSessions
      ) {
        if (
          !session.exercises.length
        ) {
          throw new Error(
            `${session.name} no contiene ejercicios.`
          );
        }
      }

      this.sessions.set(
        importedSessions
      );

      this.routineName.set(
        file.name.replace(
          /\.(xlsx|xls)$/i,
          ''
        )
      );

      this.creating.set(true);

      this.importMessage.set(
        `Rutina importada correctamente: ${importedSessions.length} sesiones. Revísala antes de guardarla y activarla.`
      );

    } catch (err: any) {
      this.importError.set(
        err?.message ??
        'No se pudo importar la rutina.'
      );
    } finally {
      input.value = '';
    }
  }

  openExportRecords(): void {
    this.exportRecordsOpen.set(true);
    this.exportRecordsError.set(null);
  }

  closeExportRecords(): void {
    this.exportRecordsOpen.set(false);
    this.exportRecordsError.set(null);
  }

  private getExportDateRange(): {
    from: Date;
    to: Date;
    label: string;
  } {
    const now = new Date();

    if (
      this.exportPeriod() ===
      'custom'
    ) {
      if (
        !this.exportFrom() ||
        !this.exportTo()
      ) {
        throw new Error(
          'Selecciona una fecha inicial y una fecha final.'
        );
      }

      const from =
        new Date(
          `${this.exportFrom()}T00:00:00`
        );

      const to =
        new Date(
          `${this.exportTo()}T23:59:59.999`
        );

      if (
        Number.isNaN(
          from.getTime()
        ) ||
        Number.isNaN(
          to.getTime()
        )
      ) {
        throw new Error(
          'El rango de fechas no es válido.'
        );
      }

      if (from > to) {
        throw new Error(
          'La fecha inicial no puede ser posterior a la final.'
        );
      }

      return {
        from,
        to,
        label:
          `${this.exportFrom()}_${this.exportTo()}`
      };
    }

    const to =
      new Date(now);

    const from =
      new Date(now);

    switch (
      this.exportPeriod()
    ) {
      case '2weeks':
        from.setDate(
          from.getDate() - 14
        );

        return {
          from,
          to,
          label:
            'ultimas_2_semanas'
        };

      case '3months':
        from.setMonth(
          from.getMonth() - 3
        );

        return {
          from,
          to,
          label:
            'ultimos_3_meses'
        };

      case '1month':
      default:
        from.setMonth(
          from.getMonth() - 1
        );

        return {
          from,
          to,
          label:
            'ultimo_mes'
        };
    }
  }

  private async getAuthHeaders(): Promise<HttpHeaders> {
    const token =
      await this.auth.getAccessToken();

    if (!token) {
      throw new Error(
        'Necesitas iniciar sesión.'
      );
    }

    return new HttpHeaders({
      Authorization:
        `Bearer ${token}`
    });
  }

  async exportTrainingRecords(): Promise<void> {
    this.exportingRecords.set(true);
    this.exportRecordsError.set(null);

    try {
      const {
        from,
        to,
        label
      } =
        this.getExportDateRange();

      const headers =
        await this.getAuthHeaders();

      const [
        workouts,
        routines
      ] =
        await Promise.all([
          new Promise<Workout[]>(
            (resolve, reject) => {
              this.http
                .get<Workout[]>(
                  `${this.apiUrl}/workouts`,
                  { headers }
                )
                .subscribe({
                  next: resolve,
                  error: reject
                });
            }
          ),

          new Promise<StoredRoutine[]>(
            (resolve, reject) => {
              this.http
                .get<StoredRoutine[]>(
                  `${this.apiUrl}/routines`,
                  { headers }
                )
                .subscribe({
                  next: resolve,
                  error: reject
                });
            }
          )
        ]);

      const exerciseById =
        new Map(
          this.exercises().map(
            exercise => [
              exercise.id,
              exercise
            ]
          )
        );

      const routineById =
        new Map(
          routines.map(
            routine => [
              routine.routineId,
              routine
            ]
          )
        );

      const rows:
        Record<string, any>[] =
        [];

      for (
        const workout
        of workouts
      ) {
        if (
          workout.status !==
          'finished'
        ) {
          continue;
        }

        const routine =
          routineById.get(
            workout.routineId
          );

        const session =
          routine?.sessions?.find(
            item =>
              item.sessionId ===
              workout.sessionId
          );

        const sessionName =
          session?.label ||
          session?.name ||
          workout.sessionId;

        for (
          const set
          of workout.sets ?? []
        ) {
          if (!set.completedAt) {
            continue;
          }

          const completedAt =
            new Date(
              set.completedAt
            );

          if (
            completedAt < from ||
            completedAt > to
          ) {
            continue;
          }

          const exercise =
            exerciseById.get(
              set.exerciseId
            );

          rows.push({
            'Fecha':
              completedAt
                .toISOString()
                .slice(0, 10),

            'Fecha y hora':
              set.completedAt,

            'Rutina':
              routine?.name ??
              workout.routineId,

            'Sesión':
              sessionName,

            'Ejercicio':
              exercise?.name ??
              set.exerciseId,

            '_GymOS exercise':
              set.exerciseId,

            'Serie':
              set.setIndex + 1,

            'Peso (kg)':
              set.weight ?? '',

            'Repeticiones':
              set.reps ?? '',

            'RIR':
              set.rir ?? '',

            'Duración (s)':
              set.durationSeconds ?? '',

            'Workout ID':
              workout.workoutId,

            'Routine ID':
              workout.routineId,

            'Session ID':
              workout.sessionId,

            'Inicio entrenamiento':
              workout.startedAt ?? '',

            'Fin entrenamiento':
              workout.finishedAt ?? ''
          });
        }
      }

      rows.sort(
        (a, b) =>
          String(
            a['Fecha y hora']
          ).localeCompare(
            String(
              b['Fecha y hora']
            )
          )
      );

      if (!rows.length) {
        throw new Error(
          'No hay series completadas en el periodo seleccionado.'
        );
      }

      const workoutIds =
        new Set(
          rows.map(
            row =>
              row['Workout ID']
          )
        );

      const exerciseIds =
        new Set(
          rows.map(
            row =>
              row['_GymOS exercise']
          )
        );

      const totalVolume =
        rows.reduce(
          (sum, row) => {
            const weight =
              Number(
                row['Peso (kg)']
              );

            const reps =
              Number(
                row['Repeticiones']
              );

            if (
              !Number.isFinite(
                weight
              ) ||
              !Number.isFinite(
                reps
              )
            ) {
              return sum;
            }

            return (
              sum +
              weight * reps
            );
          },
          0
        );

      const summaryRows = [
        {
          'Métrica':
            'Periodo desde',

          'Valor':
            from.toISOString()
        },

        {
          'Métrica':
            'Periodo hasta',

          'Valor':
            to.toISOString()
        },

        {
          'Métrica':
            'Entrenamientos',

          'Valor':
            workoutIds.size
        },

        {
          'Métrica':
            'Series completadas',

          'Valor':
            rows.length
        },

        {
          'Métrica':
            'Ejercicios distintos',

          'Valor':
            exerciseIds.size
        },

        {
          'Métrica':
            'Volumen registrado (kg × reps)',

          'Valor':
            totalVolume
        }
      ];

      const workbook =
        XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          summaryRows
        ),
        'Resumen'
      );

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          rows
        ),
        'Registros'
      );

      XLSX.writeFile(
        workbook,
        `GymOS_registros_${label}.xlsx`
      );

      this.exportRecordsOpen.set(
        false
      );

    } catch (err: any) {
      this.exportRecordsError.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudieron exportar los registros.'
      );
    } finally {
      this.exportingRecords.set(
        false
      );
    }
  }
}