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

interface ImportIssue {
  severity: 'error' | 'warning';
  sheet: string;
  row?: number;
  column?: string;
  message: string;
}

interface ImportValidationResult {
  sessions: RoutineSessionDraft[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
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
  importIssues = signal<ImportIssue[]>([]);

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

  private async getAuthHeaders(): Promise<HttpHeaders> {
    const token = await this.auth.getAccessToken();

    if (!token) {
      throw new Error('Necesitas iniciar sesión.');
    }

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  async loadExercises(): Promise<void> {
    this.loadingExercises.set(true);
    this.error.set(null);

    try {
      const headers = await this.getAuthHeaders();

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

    this.routineName.set('Mi rutina');

    this.sessions.set([
      {
        sessionId: crypto.randomUUID(),
        name: 'Sesión A',
        exercises: []
      }
    ]);

    this.saveMessage.set(null);
    this.saveError.set(null);

    this.importMessage.set(null);
    this.importError.set(null);
    this.importIssues.set([]);
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
    const sessionId = this.exercisePickerSessionId();

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
          exercise.sets < 1 ||
          exercise.sets > 10
        ) {
          return `${exercise.name}: las series deben estar entre 1 y 10.`;
        }

        if (
          !Number.isFinite(exercise.repsMin) ||
          !Number.isFinite(exercise.repsMax) ||
          exercise.repsMin < 1 ||
          exercise.repsMax > 100 ||
          exercise.repsMax < exercise.repsMin
        ) {
          return `${exercise.name}: el rango de repeticiones no es válido.`;
        }

        if (
          !Number.isFinite(exercise.rirMin) ||
          !Number.isFinite(exercise.rirMax) ||
          exercise.rirMin < 0 ||
          exercise.rirMax > 10 ||
          exercise.rirMax < exercise.rirMin
        ) {
          return `${exercise.name}: el rango de RIR no es válido.`;
        }

        if (
          !Number.isFinite(exercise.restSeconds) ||
          exercise.restSeconds < 0 ||
          exercise.restSeconds > 600
        ) {
          return `${exercise.name}: el descanso debe estar entre 0 y 600 segundos.`;
        }
      }
    }

    return null;
  }

  private buildCanonicalRoutine(): CanonicalRoutine {
    const now = new Date().toISOString();

    return {
      routineId: `routine-${crypto.randomUUID()}`,
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

              restSeconds: exercise.restSeconds,
              weight: exercise.weight ?? null,

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

                restSeconds: exercise.restSeconds,
                weight: exercise.weight ?? null
              }
            })
          )
        })
      )
    };
  }

  async saveAndActivateRoutine(): Promise<void> {
    const validationError = this.validateRoutine();

    if (validationError) {
      this.saveError.set(validationError);
      this.saveMessage.set(null);
      return;
    }

    this.savingRoutine.set(true);
    this.saveError.set(null);
    this.saveMessage.set(null);

    try {
      const token = await this.auth.getAccessToken();

      if (!token) {
        throw new Error('Necesitas iniciar sesión.');
      }

      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      const routine = this.buildCanonicalRoutine();

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

  private readGymOSMetadata(
    workbook: XLSX.WorkBook
  ): Record<string, string> {
    const sheet =
      workbook.Sheets['_GymOS'];

    if (!sheet) {
      return {};
    }

    const rows =
      XLSX.utils.sheet_to_json<any[]>(
        sheet,
        {
          header: 1,
          defval: ''
        }
      );

    const metadata:
      Record<string, string> = {};

    for (const row of rows) {
      const key =
        String(row?.[0] ?? '').trim();

      const value =
        String(row?.[1] ?? '').trim();

      if (key) {
        metadata[key] = value;
      }
    }

    return metadata;
  }

  private addImportIssue(
    target: ImportIssue[],
    issue: ImportIssue
  ): void {
    target.push(issue);
  }

  private validateImportedWorkbook(
    workbook: XLSX.WorkBook
  ): ImportValidationResult {
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];

    const metadata =
      this.readGymOSMetadata(workbook);

    if (
      metadata['templateVersion'] !== '2'
    ) {
      this.addImportIssue(errors, {
        severity: 'error',
        sheet: '_GymOS',
        column: 'templateVersion',
        message:
          `GymOS requiere templateVersion 2. Se encontró "${metadata['templateVersion'] || 'ausente'}".`
      });
    }

    if (
      metadata['schemaVersion'] !== '4.2'
    ) {
      this.addImportIssue(errors, {
        severity: 'error',
        sheet: '_GymOS',
        column: 'schemaVersion',
        message:
          `GymOS requiere schemaVersion 4.2. Se encontró "${metadata['schemaVersion'] || 'ausente'}".`
      });
    }

    const sessionSheet =
      workbook.Sheets['Sesiones'];

    const routineSheet =
      workbook.Sheets['Rutina'];

    if (!sessionSheet) {
      this.addImportIssue(errors, {
        severity: 'error',
        sheet: 'Sesiones',
        message:
          'Falta la hoja obligatoria "Sesiones".'
      });
    }

    if (!routineSheet) {
      this.addImportIssue(errors, {
        severity: 'error',
        sheet: 'Rutina',
        message:
          'Falta la hoja obligatoria "Rutina".'
      });
    }

    if (
      !sessionSheet ||
      !routineSheet
    ) {
      return {
        sessions: [],
        errors,
        warnings
      };
    }

    const sessionRows =
      XLSX.utils.sheet_to_json<
        Record<string, any>
      >(
        sessionSheet,
        { defval: '' }
      );

    const routineRows =
      XLSX.utils.sheet_to_json<
        Record<string, any>
      >(
        routineSheet,
        { defval: '' }
      );

    if (
      sessionRows.length < 2 ||
      sessionRows.length > 6
    ) {
      this.addImportIssue(errors, {
        severity: 'error',
        sheet: 'Sesiones',
        message:
          `La rutina debe contener entre 2 y 6 sesiones. Se encontraron ${sessionRows.length}.`
      });
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
      RoutineSessionDraft[] = [];

    const sessionByKey =
      new Map<
        string,
        RoutineSessionDraft
      >();

    const sessionOrders =
      new Set<number>();

    const sessionIdHints =
      new Set<string>();

    sessionRows.forEach(
      (row, index) => {
        const excelRow =
          index + 2;

        const key =
          String(
            row['Sesión'] ?? ''
          ).trim();

        const name =
          String(
            row['Nombre'] ?? ''
          ).trim();

        const order =
          Number(row['Orden']);

        const sessionId =
          String(
            row['_GymOS session'] ?? ''
          ).trim();

        if (!key) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Sesiones',
            row: excelRow,
            column: 'Sesión',
            message:
              'Falta la clave de sesión.'
          });
        }

        if (
          !Number.isInteger(order) ||
          order < 1 ||
          order > 6
        ) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Sesiones',
            row: excelRow,
            column: 'Orden',
            message:
              'El orden debe ser un entero entre 1 y 6.'
          });
        } else if (
          sessionOrders.has(order)
        ) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Sesiones',
            row: excelRow,
            column: 'Orden',
            message:
              `El orden ${order} está repetido.`
          });
        } else {
          sessionOrders.add(order);
        }

        if (!name) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Sesiones',
            row: excelRow,
            column: 'Nombre',
            message:
              'Falta el nombre de la sesión.'
          });
        }

        if (
          key &&
          sessionByKey.has(key)
        ) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Sesiones',
            row: excelRow,
            column: 'Sesión',
            message:
              `La sesión "${key}" está repetida.`
          });
        }

        if (
          sessionId &&
          sessionIdHints.has(sessionId)
        ) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Sesiones',
            row: excelRow,
            column: '_GymOS session',
            message:
              'El archivo repite un identificador interno de sesión.'
          });
        }

        if (sessionId) {
          sessionIdHints.add(sessionId);
        }

        const session: RoutineSessionDraft = {
          sessionId:
            sessionId ||
            crypto.randomUUID(),

          name:
            name ||
            `Sesión ${key}`,

          exercises: []
        };

        importedSessions.push(session);

        if (
          key &&
          !sessionByKey.has(key)
        ) {
          sessionByKey.set(
            key,
            session
          );
        }
      }
    );

    const ordersBySession =
      new Map<
        string,
        Set<number>
      >();

    const exerciseIdsBySession =
      new Map<
        string,
        Set<string>
      >();

    let totalExercises = 0;

    routineRows.forEach(
      (row, index) => {
        const excelRow =
          index + 2;

        const rowErrorsBefore =
          errors.length;

        const sessionKey =
          String(
            row['Sesión'] ?? ''
          ).trim();

        const session =
          sessionByKey.get(
            sessionKey
          );

        if (!session) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Rutina',
            row: excelRow,
            column: 'Sesión',
            message:
              `La sesión "${sessionKey || '(vacía)'}" no existe en la hoja Sesiones.`
          });
        }

        const order =
          Number(row['Orden']);

        if (
          !Number.isInteger(order) ||
          order < 1
        ) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Rutina',
            row: excelRow,
            column: 'Orden',
            message:
              'El orden debe ser un entero positivo.'
          });
        } else if (sessionKey) {
          const usedOrders =
            ordersBySession.get(
              sessionKey
            ) ??
            new Set<number>();

          if (
            usedOrders.has(order)
          ) {
            this.addImportIssue(errors, {
              severity: 'error',
              sheet: 'Rutina',
              row: excelRow,
              column: 'Orden',
              message:
                `El orden ${order} está repetido dentro de la sesión ${sessionKey}.`
            });
          }

          usedOrders.add(order);

          ordersBySession.set(
            sessionKey,
            usedOrders
          );
        }

        const exerciseId =
          String(
            row['_GymOS exercise'] ?? ''
          ).trim();

        const suppliedName =
          String(
            row['Ejercicio'] ?? ''
          ).trim();

        let canonicalExercise:
          Exercise | undefined;

        if (!exerciseId) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Rutina',
            row: excelRow,
            column: '_GymOS exercise',
            message:
              'Falta el ID canónico. GymOS no identifica ejercicios únicamente por nombre.'
          });
        } else {
          canonicalExercise =
            catalogById.get(
              exerciseId
            );

          if (!canonicalExercise) {
            this.addImportIssue(errors, {
              severity: 'error',
              sheet: 'Rutina',
              row: excelRow,
              column: '_GymOS exercise',
              message:
                `El ID "${exerciseId}" no existe en el catálogo actual de GymOS.`
            });
          }
        }

        if (
          canonicalExercise &&
          suppliedName &&
          suppliedName !==
            canonicalExercise.name
        ) {
          this.addImportIssue(warnings, {
            severity: 'warning',
            sheet: 'Rutina',
            row: excelRow,
            column: 'Ejercicio',
            message:
              `"${suppliedName}" no coincide con "${exerciseId}". GymOS utilizará el nombre canónico "${canonicalExercise.name}".`
          });
        }

        if (
          canonicalExercise &&
          sessionKey
        ) {
          const usedExerciseIds =
            exerciseIdsBySession.get(
              sessionKey
            ) ??
            new Set<string>();

          if (
            usedExerciseIds.has(
              canonicalExercise.id
            )
          ) {
            this.addImportIssue(warnings, {
              severity: 'warning',
              sheet: 'Rutina',
              row: excelRow,
              column: '_GymOS exercise',
              message:
                `El ejercicio "${canonicalExercise.name}" aparece más de una vez en la sesión ${sessionKey}.`
            });
          }

          usedExerciseIds.add(
            canonicalExercise.id
          );

          exerciseIdsBySession.set(
            sessionKey,
            usedExerciseIds
          );
        }

        const sets =
          Number(row['Series']);

        if (
          !Number.isInteger(sets) ||
          sets < 1 ||
          sets > 10
        ) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Rutina',
            row: excelRow,
            column: 'Series',
            message:
              'Las series deben estar entre 1 y 10.'
          });
        }

        const targetType =
          this.normalizeHeader(
            row['Tipo de objetivo']
          );

        if (
          ![
            'repeticiones',
            'repeticion',
            'reps',
            'rep'
          ].includes(targetType)
        ) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Rutina',
            row: excelRow,
            column: 'Tipo de objetivo',
            message:
              'En esta versión usa "repeticiones".'
          });
        }

        const repsMin =
          Number(
            row['Objetivo mínimo']
          );

        const repsMaxRaw =
          row['Objetivo máximo'];

        const repsMax =
          repsMaxRaw === '' ||
          repsMaxRaw === null ||
          repsMaxRaw === undefined
            ? repsMin
            : Number(repsMaxRaw);

        if (
          !Number.isFinite(repsMin) ||
          !Number.isFinite(repsMax) ||
          repsMin < 1 ||
          repsMin > 100 ||
          repsMax < repsMin ||
          repsMax > 100
        ) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Rutina',
            row: excelRow,
            column:
              'Objetivo mínimo/máximo',
            message:
              'Las repeticiones deben estar entre 1 y 100 y el máximo no puede ser menor que el mínimo.'
          });
        }

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

        if (
          !Number.isFinite(rirMin) ||
          !Number.isFinite(rirMax) ||
          rirMin < 0 ||
          rirMin > 10 ||
          rirMax < rirMin ||
          rirMax > 10
        ) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Rutina',
            row: excelRow,
            column: 'RIR',
            message:
              'El RIR debe estar entre 0 y 10 y el máximo no puede ser menor que el mínimo.'
          });
        }

        const restSeconds =
          Number(
            row['Descanso (s)']
          );

        if (
          !Number.isFinite(
            restSeconds
          ) ||
          restSeconds < 0 ||
          restSeconds > 600
        ) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Rutina',
            row: excelRow,
            column: 'Descanso (s)',
            message:
              'El descanso debe estar entre 0 y 600 segundos.'
          });
        }

        totalExercises += 1;

        if (
          session &&
          session.exercises.length >= 20
        ) {
          this.addImportIssue(errors, {
            severity: 'error',
            sheet: 'Rutina',
            row: excelRow,
            column: 'Sesión',
            message:
              `La sesión ${sessionKey} supera el máximo de 20 ejercicios.`
          });
        }

        const rowHasErrors =
          errors.length >
          rowErrorsBefore;

        if (
          !rowHasErrors &&
          session &&
          canonicalExercise
        ) {
          session.exercises.push({
            exerciseId:
              canonicalExercise.id,

            name:
              canonicalExercise.name,

            sets,

            repsMin,
            repsMax,

            rirMin,
            rirMax,

            restSeconds,

            weight: null
          });
        }
      }
    );

    if (
      totalExercises > 100
    ) {
      this.addImportIssue(errors, {
        severity: 'error',
        sheet: 'Rutina',
        message:
          `La rutina contiene ${totalExercises} ejercicios. El máximo permitido es 100.`
      });
    }

    importedSessions.forEach(
      session => {
        if (
          !session.exercises.length
        ) {
          this.addImportIssue(warnings, {
            severity: 'warning',
            sheet: 'Sesiones',
            message:
              `${session.name} no contiene ejercicios válidos.`
          });
        }
      }
    );

    return {
      sessions:
        importedSessions,

      errors,
      warnings
    };
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
    this.importIssues.set([]);

    this.saveMessage.set(null);
    this.saveError.set(null);

    try {
      if (
        !this.exercises().length
      ) {
        throw new Error(
          'La biblioteca de ejercicios todavía no está disponible.'
        );
      }

      const buffer =
        await file.arrayBuffer();

      const workbook =
        XLSX.read(
          buffer,
          {
            type: 'array'
          }
        );

      const validation =
        this.validateImportedWorkbook(
          workbook
        );

      this.importIssues.set([
        ...validation.errors,
        ...validation.warnings
      ]);

      if (
        validation.errors.length
      ) {
        this.importError.set(
          `No se puede importar todavía. Se encontraron ${validation.errors.length} error(es).`
        );

        return;
      }

      this.sessions.set(
        validation.sessions
      );

      this.routineName.set(
        file.name.replace(
          /\.(xlsx|xls)$/i,
          ''
        )
      );

      this.creating.set(true);

      this.importMessage.set(
        validation.warnings.length
          ? `Rutina válida con ${validation.warnings.length} aviso(s). Revísala antes de guardarla y activarla.`
          : 'Rutina validada correctamente. Revísala antes de guardarla y activarla.'
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

  downloadChatGPTRoutineTemplate(): void {
    this.importError.set(null);
    this.importMessage.set(null);

    if (!this.exercises().length) {
      this.importError.set(
        'No se puede generar la plantilla porque la biblioteca de ejercicios no está disponible.'
      );

      return;
    }

    const workbook =
      XLSX.utils.book_new();

    const instructions = [
      [
        'Plantilla de Rutina GymOS',
        'Versión 2'
      ],
      [
        'IMPORTANTE',
        '_GymOS exercise es la identidad autoritativa de cada ejercicio.'
      ],
      [
        'ChatGPT',
        'Usa exclusivamente ejercicios presentes en la hoja Biblioteca.'
      ],
      [
        'ChatGPT',
        'Copia literalmente Ejercicio y _GymOS exercise desde Biblioteca.'
      ],
      [
        'ChatGPT',
        'No inventes, traduzcas, abrevies ni modifiques IDs.'
      ],
      [
        'Sesiones',
        'La rutina debe contener entre 2 y 6 sesiones.'
      ],
      [
        'Series',
        'Cada ejercicio debe tener entre 1 y 10 series.'
      ],
      [
        'Repeticiones',
        'Usa objetivos entre 1 y 100 repeticiones.'
      ],
      [
        'RIR',
        'Usa valores entre 0 y 10.'
      ],
      [
        'Descanso',
        'Usa entre 0 y 600 segundos.'
      ],
      [
        'Importación',
        'GymOS volverá a validar todos los IDs contra su catálogo actual.'
      ],
      [
        'Activación',
        'Importar no activa automáticamente la rutina. Primero debe revisarse.'
      ]
    ];

    const sessions = [
      {
        'Sesión': 'A',
        'Orden': 1,
        'Nombre': 'Sesión A',
        'Enfoque': '',
        'Duración estimada (min)': '',
        'Notas de sesión': '',
        '_GymOS session': ''
      },
      {
        'Sesión': 'B',
        'Orden': 2,
        'Nombre': 'Sesión B',
        'Enfoque': '',
        'Duración estimada (min)': '',
        'Notas de sesión': '',
        '_GymOS session': ''
      }
    ];

    const routine = [
      {
        'Sesión': '',
        'Orden': '',
        'Ejercicio': '',
        'Series': '',
        'Tipo de objetivo':
          'repeticiones',
        'Objetivo mínimo': '',
        'Objetivo máximo': '',
        'RIR mínimo': '',
        'RIR máximo': '',
        'Descanso (s)': '',
        'Notas': '',
        '_GymOS exercise': ''
      }
    ];

    const library =
      this.exercises()
        .filter(
          exercise =>
            !exercise.custom
        )
        .map(
          exercise => ({
            '_GymOS exercise':
              exercise.id,

            'Ejercicio':
              exercise.name,

            'Músculo':
              exercise.muscle,

            'Equipamiento':
              exercise.equipment,

            'Tipo':
              exercise.type,

            'Categoría':
              exercise.category,

            'Notas':
              exercise.notes ?? ''
          })
        );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(
        instructions
      ),
      'Instrucciones'
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        sessions
      ),
      'Sesiones'
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        routine
      ),
      'Rutina'
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        library
      ),
      'Biblioteca'
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Tipos de objetivo'],
        ['repeticiones']
      ]),
      '_Catálogos'
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
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
      ]),
      '_GymOS'
    );

    workbook.Workbook = {
      Sheets: workbook.SheetNames.map(
        sheetName => ({
          Hidden:
            sheetName === '_GymOS'
              ? 2
              : sheetName === '_Catálogos'
                ? 1
                : 0
        })
      )
    } as any;

    XLSX.writeFile(
      workbook,
      'GymOS_plantilla_rutina_v2.xlsx'
    );
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

      this.exportRecordsOpen.set(false);

    } catch (err: any) {
      this.exportRecordsError.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudieron exportar los registros.'
      );
    } finally {
      this.exportingRecords.set(false);
    }
  }
}