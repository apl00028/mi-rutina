import {
  TelemetryService
} from '../../core/telemetry.service';

import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  LucideCheck,
  LucideCircle,
  LucideTrash2
} from '@lucide/angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import {
  SettingsService
} from '../../core/settings.service';
import {
  WorkoutSessionStateService
} from '../../core/workout-session-state.service';
import {
  buildExecutionPlan,
  findCurrentStep,
  hasPendingStepAfter,
  nextPendingStep,
  orderWarmupSteps,
  type ExecutionStep
} from '../../features/workout/domain/execution-plan';
import {
  RestTimerController,
  type RestTimerEnd
} from '../../features/workout/application/rest-timer.controller';
import {
  DEFAULT_INTER_SIDE_REST_SECONDS,
  transitionAfterInterSideRest,
  transitionWorkingSetCompletion,
  unilateralPhaseForSet,
  type UnilateralExecutionState
} from '../../features/workout/domain/working-set-execution';
import {
  detectPersonalRecords,
  type PersonalRecord
} from '../../features/workout/domain/personal-records';
import {
  calculateEpleyOneRepMax
} from '../../features/workout/domain/strength-metrics';

interface Exercise {
  exerciseId: string;
  name: string;
  sets: number;
  target?: string;
  recordType?: string | null;
  recordTypes?: string[] | null;
  prescription?: {
    recordType?: string | null;
    target?: {
      type?: string | null;
    } | null;
  } | null;
  targetRir?: {
    min: number;
    max: number;
  } | null;
  restSeconds?: number | null;
  unilateral?: boolean;
  interSideRestSeconds?: number | null;
}

interface CatalogExercise {
  id: string;
  recordTypes?: string[] | null;
  unilateral?: boolean;
}

interface ExerciseCatalogMetadata {
  recordTypes: string[];
  unilateral: boolean;
}

interface RoutineSession {
  sessionId: string;
  label: string;
  name: string;
  exercises: Exercise[];
}

interface Routine {
  routineId: string;
  schemaVersion: string;
  revision: number;
  sessions: RoutineSession[];
}

interface WorkoutSetInput {
  setId: string;
  exerciseId: string;
  setIndex: number;
  setType?: 'working' | 'warmup';
  weight?: number | null;
  reps?: number | null;
  rir?: number | null;
  durationSeconds?: number | null;
  completedAt?: string | null;
}

interface ExerciseDiscomfortInput {
  exerciseId: string;
  painScore: number;
  area?: string | null;
  note?: string | null;
}


interface Workout {
  workoutId: string;
  routineId: string;
  sessionId: string;
  status: 'in_progress' | 'finished';
  startedAt?: string;
  finishedAt?: string;
  restOverrideSeconds?: number | null;
  sets: WorkoutSetInput[];
  discomforts?: ExerciseDiscomfortInput[];
}

interface SetTimerState {
  exerciseId: string;
  setIndex: number;
  targetMinSeconds: number | null;
  targetMaxSeconds: number | null;
  startedAt: number | null;
  accumulatedSeconds: number;
  elapsedSeconds: number;
  status: 'running' | 'paused' | 'finished';
}

interface ExerciseHistory {
  workoutId: string;
  performedAt: string | null;
  sets: WorkoutSetInput[];
}

interface ExerciseProgressMetrics {
  maxWeight: number | null;
  totalReps: number | null;
  volume: number | null;
  bestSet: WorkoutSetInput | null;
}

type RecentTrendStatus =
  | 'improving'
  | 'stable'
  | 'declining'
  | 'insufficient_data';

interface ExerciseExecutionPerformance {
  workoutId: string;
  performedAt: string | null;
  time: number;
  sets: WorkoutSetInput[];
  totalReps: number;
  averageRir: number | null;
  bestE1rm: number | null;
  belowRangeSets: number;
  closeToFailureSets: number;
  pronouncedDrop: boolean;
}

interface ExerciseRecentTrend {
  status: RecentTrendStatus;
  exposures: number;
  executions: ExerciseExecutionPerformance[];
  e1rmValues: number[];
  e1rmChange: number | null;
}

type TodayPerformanceStatus =
  | 'above_usual'
  | 'normal'
  | 'below_usual'
  | 'insufficient_data';

interface TodayPerformance {
  status: TodayPerformanceStatus;
  label: string;
  summary: string;
  baselineE1rm: number | null;
  currentE1rm: number | null;
  percentChange: number | null;
  previousExposures: number;
  validSetsToday: number;
}

type ProgressionCategory =
  | 'increase_load'
  | 'increase_reps'
  | 'maintain'
  | 'consider_reduce'
  | 'insufficient_data';

interface ProgressionRecommendation {
  category: ProgressionCategory;
  title: string;
  reason: string;
}

interface PersonalRecordGroup {
  exerciseId: string;
  exerciseName: string;
  records: PersonalRecord[];
}

interface WorkoutFinishSummary {
  records: PersonalRecord[];
  groups: PersonalRecordGroup[];
}

interface RepTarget {
  min: number;
  max: number;
  isRange: boolean;
}

const E1RM_TREND_TOLERANCE_RATIO = 0.015;
const TODAY_PERFORMANCE_TOLERANCE_RATIO = 0.03;
const REPS_TREND_TOLERANCE = 1;

type AutosaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error';


@Component({
  selector: 'app-train',
  standalone: true,
  imports: [
    CommonModule,
    LucideCheck,
    LucideCircle,
    LucideTrash2
  ],
  templateUrl: './train.html',
  styleUrl: './train.scss'
})
export class Train implements OnInit, OnDestroy {
  routine = signal<Routine | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  activeWorkout = signal<Workout | null>(null);
  activeSession = signal<RoutineSession | null>(null);
  workoutHistory = signal<Workout[]>([]);
  workoutFinishSummary =
    signal<WorkoutFinishSummary | null>(null);

  workoutLoading = signal(false);
  workoutError = signal<string | null>(null);
  cancelConfirmationOpen = signal(false);
  cancellingWorkout = signal(false);
  autosaveStatus =
    signal<AutosaveStatus>('idle');
  private readonly restTimerController =
    new RestTimerController(
      event => this.handleRestTimerEnded(event)
    );
  readonly restTimer =
    this.restTimerController.state;
  readonly unilateralExecution =
    signal<UnilateralExecutionState | null>(null);
  setTimer =
    signal<SetTimerState | null>(null);
  expandedExerciseId =
    signal<string | null>(null);
  expandedSetKey =
    signal<string | null>(null);
  correctingSetKey =
    signal<string | null>(null);

  email = signal('');
  loginLoading = signal(false);
  loginMessage = signal<string | null>(null);

  private readonly apiUrl = environment.apiUrl;
  private readonly autosaveDelayMs = 750;

  private autosaveTimer:
    ReturnType<typeof setTimeout> | null = null;
  private setTimerInterval:
    ReturnType<typeof setInterval> | null = null;

  private currentSave:
    Promise<void> | null = null;

  private saveQueued = false;
  private workoutEditVersion = 0;
  private persistedEditVersion = 0;
  private finishingWorkout = false;
  private destroyed = false;

  constructor(
    private http: HttpClient,
    public auth: AuthService,
    public settingsService:
      SettingsService,
    private workoutSessionState:
      WorkoutSessionStateService,
    private router: Router,
    private telemetry:
      TelemetryService
  ) {}

  openTrainingSection(
    section: 'sessions' | 'routine' | 'analysis'
  ): void {

    const routes = {
      sessions: '/entrenar',
      routine: '/entrenar/rutina',
      analysis: '/entrenar/analisis'
    };

    void this.router.navigateByUrl(
      routes[section]
    );
  }


  changeTrainingDiscipline(
    discipline: string
  ): void {

    const routes:
      Record<string, string> = {
        strength: '/entrenar',
        swimming: '/entrenar/natacion',
        cycling: '/entrenar/bicicleta',
        running: '/entrenar/correr'
      };

    const target =
      routes[discipline];

    if (target) {
      void this.router.navigateByUrl(
        target
      );
    }
  }


  keepWorkoutInputVisible(
    event: FocusEvent
  ): void {
    const input =
      event.target;

    if (
      !(input instanceof HTMLElement)
    ) {
      return;
    }

    window.setTimeout(
      () => {
        if (
          document.activeElement !== input
        ) {
          return;
        }

        const setRow =
          input.closest('.set-row');

        if (
          !(setRow instanceof HTMLElement)
        ) {
          return;
        }

        setRow.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      },
      300
    );
  }


  async ngOnInit(): Promise<void> {
    this.workoutSessionState
      .setChecking();

    await this.loadRoutine();
    await this.loadWorkoutHistory();
    this.restoreActiveWorkout();
  }


  ngOnDestroy(): void {
    this.destroyed = true;
    this.unilateralExecution.set(null);
    this.workoutSessionState
      .setIdle();
    this.clearSetTimer();
    this.restTimerController.destroy();

    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }

    const workout = this.activeWorkout();

    if (
      workout?.status === 'in_progress' &&
      this.workoutEditVersion >
      this.persistedEditVersion &&
      !this.currentSave &&
      !this.cancellingWorkout()
    ) {
      void this.saveLatestWorkout({
        showLoading: false
      });
    }
  }

  async loadRoutine(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const token = await this.auth.getAccessToken();

      if (!token) {
        this.error.set('Necesitas iniciar sesión.');
        return;
      }

      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`
      });

      const routine = await new Promise<Routine>((resolve, reject) => {
        this.http
          .get<Routine>(
            `${this.apiUrl}/routines/active`,
            { headers }
          )
          .subscribe({
            next: resolve,
            error: reject
          });
      });

      const normalized =
        this.normalizeRoutine(routine);

      if (!normalized) {
        this.error.set(
          'La rutina activa no tiene sesiones disponibles.'
        );
        this.routine.set(null);
        return;
      }

      const exerciseMetadata =
        await this.loadExerciseMetadata(headers);

      this.routine.set(
        this.enrichRoutineWithExerciseMetadata(
          normalized,
          exerciseMetadata
        )
      );

    } catch (err: any) {
      if (err?.status === 404) {
        this.error.set(
          'Todavía no tienes una rutina activa. Completa el onboarding o activa una rutina antes de entrenar.'
        );
        return;
      }

      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo cargar la rutina.'
      );
    } finally {
      this.loading.set(false);
    }
  }


  private async loadExerciseMetadata(
    headers: HttpHeaders
  ): Promise<Map<string, ExerciseCatalogMetadata>> {
    try {
      const exercises =
        await new Promise<CatalogExercise[]>((resolve, reject) => {
          this.http
            .get<CatalogExercise[]>(
              `${this.apiUrl}/exercises`,
              { headers }
            )
            .subscribe({
              next: resolve,
              error: reject
            });
        });

      return new Map(
        exercises
          .filter(
            exercise =>
              typeof exercise?.id === 'string' &&
              exercise.id.trim()
          )
          .map(
            exercise => [
              exercise.id,
              {
                recordTypes:
                  this.cleanRecordTypes(
                    exercise.recordTypes
                  ),
                unilateral:
                  exercise.unilateral === true
              }
            ]
          )
      );

    } catch (err) {
      console.error(
        'No se pudo cargar la metadata de ejercicios',
        err
      );
      return new Map();
    }
  }


  private enrichRoutineWithExerciseMetadata(
    routine: Routine,
    catalogMetadata:
      Map<string, ExerciseCatalogMetadata>
  ): Routine {
    return {
      ...routine,
      sessions:
        routine.sessions.map(session => ({
          ...session,
          exercises:
            session.exercises.map(exercise => {
              const currentRecordTypes =
                this.exerciseRecordTypes(exercise);
              const metadata =
                catalogMetadata.get(
                  exercise.exerciseId
                );
              const recordTypes =
                currentRecordTypes.length
                  ? currentRecordTypes
                  : metadata?.recordTypes ?? [];

              return {
                ...exercise,
                ...(recordTypes.length
                  ? { recordTypes }
                  : {}),
                unilateral:
                  metadata?.unilateral ??
                  exercise.unilateral ??
                  false
              };
            })
        }))
    };
  }


  private cleanRecordTypes(
    value: unknown
  ): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return [
      ...new Set(
        value
          .filter(
            item =>
              typeof item === 'string' &&
              item.trim()
          )
          .map(item =>
            item.trim()
          )
      )
    ];
  }


  private normalizeRoutine(
    value: Routine | null
  ): Routine | null {
    if (
      !value ||
      !Array.isArray(value.sessions)
    ) {
      return null;
    }

    const sessions =
      value.sessions
        .filter(
          session =>
            typeof session?.sessionId === 'string' &&
            session.sessionId.trim() &&
            Array.isArray(session.exercises)
        )
        .map(
          session => ({
            ...session,
            exercises:
              session.exercises.filter(
                exercise =>
                  typeof exercise?.exerciseId === 'string' &&
                  exercise.exerciseId.trim() &&
                  typeof exercise?.name === 'string' &&
                  exercise.name.trim() &&
                  Number.isInteger(exercise.sets) &&
                  exercise.sets > 0
              )
          })
        )
        .filter(
          session =>
            session.exercises.length > 0
        );

    if (!sessions.length) {
      return null;
    }

    return {
      ...value,
      sessions
    };
  }

  async loadWorkoutHistory(): Promise<void> {
    try {
      const token = await this.auth.getAccessToken();

      if (!token) {
        return;
      }

      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`
      });

      const workouts = await new Promise<Workout[]>((resolve, reject) => {
        this.http
          .get<Workout[]>(
            `${this.apiUrl}/workouts`,
            { headers }
          )
          .subscribe({
            next: resolve,
            error: reject
          });
      });

      this.workoutHistory.set(workouts);

    } catch (err) {
      console.error(
        'No se pudo cargar el historial de entrenamientos',
        err
      );
    }
  }

  restoreActiveWorkout(): void {
    this.unilateralExecution.set(null);

    const routine = this.routine();

    if (!routine) {
      this.workoutSessionState
        .setIdle();
      return;
    }

    const active = this.workoutHistory().find(
      workout => workout.status === 'in_progress'
    );

    if (!active) {
      this.workoutSessionState
        .setIdle();
      return;
    }

    const session = routine.sessions.find(
      session => session.sessionId === active.sessionId
    );

    if (!session) {
      this.workoutSessionState
        .setIdle();
      return;
    }

    this.activeWorkout.set(active);
    this.activeSession.set(session);
    this.workoutSessionState
      .setActive();
    this.syncExpandedWorkoutStep();
  }


  restDurationLabel(
    seconds: number | null | undefined
  ): string {
    const value =
      Number(seconds);

    if (
      !Number.isFinite(value) ||
      value <= 0
    ) {
      return '';
    }

    const totalSeconds =
      Math.floor(value);

    const minutes =
      Math.floor(totalSeconds / 60);

    const remainingSeconds =
      totalSeconds % 60;

    if (
      minutes > 0 &&
      remainingSeconds > 0
    ) {
      return (
        `${minutes} min ` +
        `${remainingSeconds} s`
      );
    }

    if (minutes > 0) {
      return `${minutes} min`;
    }

    return `${remainingSeconds} s`;
  }


  restTimerLabel(): string {
    const timer =
      this.restTimer();

    if (!timer) {
      return '';
    }

    return this.formatRestTime(
      timer.remainingSeconds
    );
  }


  setTimerLabel(
    exerciseId: string,
    setIndex: number
  ): string {
    const timer =
      this.setTimerForSet(
        exerciseId,
        setIndex
      );

    if (!timer) {
      return this.formatRestTime(0);
    }

    return this.formatRestTime(
      timer.elapsedSeconds
    );
  }


  setTimerStatusLabel(
    exercise: Exercise,
    setIndex: number
  ): string {
    const timer =
      this.setTimerForSet(
        exercise.exerciseId,
        setIndex
      );
    const elapsedSeconds =
      timer?.elapsedSeconds ??
      this.getCurrentSet(
        exercise.exerciseId,
        setIndex
      )?.durationSeconds ??
      0;
    const target =
      this.durationTargetRangeSeconds(
        exercise
      );

    if (
      target?.max !== null &&
      target?.max !== undefined &&
      elapsedSeconds >= target.max
    ) {
      return 'Parte superior del rango alcanzada';
    }

    if (
      target?.min !== null &&
      target?.min !== undefined &&
      elapsedSeconds >= target.min
    ) {
      return 'Objetivo mínimo alcanzado';
    }

    return 'Cronómetro';
  }


  setTimerForSet(
    exerciseId: string,
    setIndex: number
  ): SetTimerState | null {
    const timer =
      this.setTimer();

    if (
      timer?.exerciseId !== exerciseId ||
      timer.setIndex !== setIndex
    ) {
      return null;
    }

    return timer;
  }


  exerciseRecordTypes(
    exercise: Exercise
  ): string[] {
    const direct =
      this.cleanRecordTypes(
        exercise.recordTypes
      );

    if (direct.length) {
      return direct;
    }

    const candidates = [
      exercise.recordType,
      exercise.prescription?.recordType,
      exercise.prescription?.target?.type === 'duration'
        ? 'duration'
        : null
    ];

    return this.cleanRecordTypes(
      candidates
    );
  }


  isDurationExercise(
    exercise: Exercise
  ): boolean {
    return this
      .exerciseRecordTypes(exercise)
      .includes('duration');
  }


  supportsWeight(
    exercise: Exercise
  ): boolean {
    const recordTypes =
      this.exerciseRecordTypes(exercise);

    if (!recordTypes.length) {
      return true;
    }

    return recordTypes.some(
        type =>
          type === 'weight_reps' ||
          type === 'assisted_reps' ||
          type.includes('weight')
      );
  }


  supportsReps(
    exercise: Exercise
  ): boolean {
    const recordTypes =
      this.exerciseRecordTypes(exercise);

    if (!recordTypes.length) {
      return true;
    }

    return recordTypes.some(
        type =>
          type === 'weight_reps' ||
          type === 'bodyweight_reps' ||
          type === 'assisted_reps' ||
          type === 'guided_repetitions' ||
          type.includes('reps')
      );
  }


  supportsRir(
    exercise: Exercise
  ): boolean {
    return (
      this.settingsService
        .settings()
        .showRir &&
      Boolean(exercise.targetRir)
    );
  }


  targetLabel(
    exercise: Exercise
  ): string {
    return this.isDurationExercise(exercise)
      ? 'Duración objetivo'
      : 'Reps objetivo';
  }


  durationInputLabel(
    exercise: Exercise,
    setIndex: number
  ): string {
    return (
      'Duración realizada en segundos para ' +
      exercise.name +
      ', serie ' +
      (setIndex + 1)
    );
  }


  private formatRestTime(
    seconds: number
  ): string {
    const safeSeconds =
      Math.max(
        0,
        Math.ceil(seconds)
      );

    const minutes =
      Math.floor(safeSeconds / 60);

    const remaining =
      safeSeconds % 60;

    return [
      minutes,
      remaining
    ]
      .map(value =>
        String(value).padStart(2, '0')
      )
      .join(':');
  }


  private findSessionExercise(
    exerciseId: string
  ): Exercise | null {
    return (
      this
        .activeSession()
        ?.exercises
        .find(
          exercise =>
            exercise.exerciseId === exerciseId
        ) ??
      null
    );
  }

  getPreviousSet(
    exerciseId: string,
    setIndex: number
  ): WorkoutSetInput | null {
    return (
      this
        .getPreviousExerciseHistory(exerciseId)
        ?.sets
        .find(
          set =>
            set.setIndex === setIndex
        ) ??
      null
    );
  }


  getPreviousExerciseHistory(
    exerciseId: string
  ): ExerciseHistory | null {
    const latest =
      this
        .getRecentExerciseHistories(
          exerciseId
        )[0];

    if (!latest) {
      return null;
    }

    return {
      workoutId:
        latest.workout.workoutId,
      performedAt:
        latest.performedAt,
      sets:
        latest.sets
    };
  }


  private getRecentExerciseHistories(
    exerciseId: string
  ): {
    workout: Workout;
    sets: WorkoutSetInput[];
    performedAt: string | null;
    time: number;
  }[] {
    const currentWorkoutId =
      this.activeWorkout()?.workoutId;

    const histories =
      this
        .workoutHistory()
        .filter(
          workout =>
            workout.workoutId !== currentWorkoutId &&
            workout.status === 'finished' &&
            Array.isArray(workout.sets)
        )
        .map(workout => {
          const sets =
            workout.sets
              .filter(
                set =>
                  set.exerciseId === exerciseId &&
                  this.isWorkingSet(set) &&
                  Boolean(set.completedAt) &&
                  Number.isInteger(set.setIndex) &&
                  (
                    (
                      set.weight !== null &&
                      set.weight !== undefined &&
                      Number.isFinite(set.weight)
                    ) ||
                    (
                      set.reps !== null &&
                      set.reps !== undefined &&
                      Number.isFinite(set.reps)
                    ) ||
                    (
                      set.durationSeconds !== null &&
                      set.durationSeconds !== undefined &&
                      Number.isFinite(
                        set.durationSeconds
                      )
                    )
                  )
              )
              .sort(
                (first, second) =>
                  first.setIndex -
                  second.setIndex
              );

          if (!sets.length) {
            return null;
          }

          return {
            workout,
            sets,
            performedAt:
              workout.finishedAt ??
              workout.startedAt ??
              null,
            time:
              this.workoutTime(workout)
          };
        })
        .filter(
          (
            value
          ): value is {
            workout: Workout;
            sets: WorkoutSetInput[];
            performedAt: string | null;
            time: number;
          } =>
            value !== null
        )
        .sort(
          (first, second) =>
            second.time -
            first.time
        );

    return histories;
  }


  private isWorkingSet(
    set: WorkoutSetInput
  ): boolean {
    return (
      set.setType === undefined ||
      set.setType === 'working'
    );
  }


  private workoutTime(
    workout: Workout
  ): number {
    const rawDate =
      workout.finishedAt ??
      workout.startedAt;

    if (!rawDate) {
      return 0;
    }

    const time =
      Date.parse(rawDate);

    return Number.isFinite(time)
      ? time
      : 0;
  }


  previousExerciseSummary(
    exerciseId: string
  ): string {
    const history =
      this.getPreviousExerciseHistory(
        exerciseId
      );

    if (!history) {
      return '';
    }

    return history.sets
      .map(set =>
        this.formatHistoricalSet(set)
      )
      .filter(Boolean)
      .join(' · ');
  }


  previousSetWeightLabel(
    exerciseId: string,
    setIndex: number
  ): string {
    const previousSet =
      this.getPreviousSet(
        exerciseId,
        setIndex
      );

    if (
      previousSet?.weight === null ||
      previousSet?.weight === undefined ||
      !Number.isFinite(previousSet.weight)
    ) {
      return '';
    }

    return `${previousSet.weight} kg`;
  }


  usePreviousWeight(
    exerciseId: string,
    setIndex: number
  ): void {
    const previousSet =
      this.getPreviousSet(
        exerciseId,
        setIndex
      );

    if (
      previousSet?.weight === null ||
      previousSet?.weight === undefined ||
      !Number.isFinite(previousSet.weight)
    ) {
      return;
    }

    this.updateSet(
      exerciseId,
      setIndex,
      'weight',
      String(previousSet.weight)
    );
  }


  exerciseProgressSignal(
    exercise: Exercise
  ): string {
    if (
      this.completedSetCount(exercise) <
      exercise.sets
    ) {
      return '';
    }

    const previous =
      this.getPreviousExerciseHistory(
        exercise.exerciseId
      );

    if (!previous) {
      return '';
    }

    const currentMetrics =
      this.exerciseMetrics(
        this.currentCompletedSets(
          exercise.exerciseId
        )
      );
    const previousMetrics =
      this.exerciseMetrics(
        previous.sets
      );

    if (
      currentMetrics.maxWeight !== null &&
      previousMetrics.maxWeight !== null &&
      currentMetrics.maxWeight >
      previousMetrics.maxWeight
    ) {
      return 'Mejor carga';
    }

    if (
      currentMetrics.volume !== null &&
      previousMetrics.volume !== null &&
      currentMetrics.volume >
      previousMetrics.volume
    ) {
      return 'Más volumen';
    }

    if (
      currentMetrics.totalReps !== null &&
      previousMetrics.totalReps !== null &&
      currentMetrics.totalReps >
      previousMetrics.totalReps
    ) {
      const diff =
        currentMetrics.totalReps -
        previousMetrics.totalReps;

      return `+${diff} rep${diff === 1 ? '' : 's'}`;
    }

    if (
      currentMetrics.maxWeight !== null &&
      previousMetrics.maxWeight !== null &&
      currentMetrics.totalReps !== null &&
      previousMetrics.totalReps !== null &&
      currentMetrics.maxWeight ===
      previousMetrics.maxWeight &&
      currentMetrics.totalReps ===
      previousMetrics.totalReps
    ) {
      return 'Similar';
    }

    return '';
  }


  progressionRecommendation(
    exercise: Exercise
  ): ProgressionRecommendation | null {
    const target =
      this.parseRepTarget(
        exercise.target
      );

    if (
      !target ||
      !target.isRange ||
      !exercise.targetRir
    ) {
      return null;
    }

    const history =
      this.getPreviousExerciseHistory(
        exercise.exerciseId
      );

    if (!history) {
      return null;
    }

    const comparableSets =
      history.sets
        .filter(
          set =>
            set.setIndex < exercise.sets &&
            set.reps !== null &&
            set.reps !== undefined &&
            Number.isFinite(set.reps)
        );

    const validSets =
      comparableSets.filter(
        set =>
          set.rir !== null &&
          set.rir !== undefined &&
          Number.isFinite(set.rir)
      );

    const minimumEvidence =
      exercise.sets > 1
        ? 2
        : 1;

    if (
      validSets.length < minimumEvidence ||
      validSets.length !== comparableSets.length
    ) {
      return null;
    }

    const reps =
      validSets.map(set => set.reps ?? 0);
    const rirs =
      validSets.map(set => set.rir ?? 0);
    const weights =
      validSets.map(set => set.weight);
    const trend =
      this.exerciseRecentTrend(
        exercise
      );
    const todayPerformance =
      this.todayPerformance(
        exercise
      );
    const belowUsualToday =
      todayPerformance.status ===
      'below_usual';
    const trendDeclining =
      trend.status === 'declining';
    const trendStableOrBetter =
      trend.status === 'stable' ||
      trend.status === 'improving' ||
      trend.status === 'insufficient_data';

    const allWeightsPositive =
      weights.every(
        weight =>
          weight !== null &&
          weight !== undefined &&
          Number.isFinite(weight) &&
          weight > 0
      );

    const allAtTop =
      reps.every(
        value =>
          value >= target.max
      );
    const allInsideRange =
      reps.every(
        value =>
          value >= target.min
      );
    const anyBelowRange =
      reps.some(
        value =>
          value < target.min
      );
    const allRirEnough =
      rirs.every(
        value =>
          value >= exercise.targetRir!.min
      );
    const anyRirTooLow =
      rirs.some(
        value =>
          value < exercise.targetRir!.min ||
          value <= 1
      );
    const pronouncedDrop =
      Math.max(...reps) -
      Math.min(...reps) >=
      4;

    if (
      allAtTop &&
      allRirEnough &&
      !pronouncedDrop &&
      allWeightsPositive &&
      !trendDeclining &&
      !belowUsualToday
    ) {
      return {
        category:
          'increase_load',
        title:
          'Podrías subir ligeramente la carga',
        reason:
          `La última vez completaste el rango ${target.min}-${target.max} con RIR suficiente.`
      };
    }

    if (
      (
        anyBelowRange &&
        anyRirTooLow
      ) ||
      trendDeclining ||
      belowUsualToday
    ) {
      return {
        category:
          'consider_reduce',
        title:
          'Mantén o baja un poco la carga',
        reason:
          belowUsualToday
            ? 'El rendimiento de hoy está por debajo de tu referencia reciente; consolida antes de subir.'
            : trendDeclining
            ? 'La tendencia reciente cae; consolida antes de progresar.'
            : `La última vez quedaste por debajo del rango ${target.min}-${target.max} y cerca del fallo.`
      };
    }

    if (
      allInsideRange &&
      allRirEnough &&
      !allAtTop &&
      !pronouncedDrop &&
      trendStableOrBetter
    ) {
      return {
        category:
          'increase_reps',
        title:
          'Intenta una repetición más',
        reason:
          `La última vez entraste en el rango ${target.min}-${target.max} sin agotar el RIR objetivo.`
      };
    }

    if (
      allAtTop &&
      allRirEnough &&
      !allWeightsPositive
    ) {
      return {
        category:
          'increase_reps',
        title:
          'Progresa sin subir kg',
        reason:
          'La última vez llegaste a la parte alta del rango, pero Aptus no tiene una carga comparable para este ejercicio.'
      };
    }

    return {
      category:
        'maintain',
      title:
        'Mantén la carga',
      reason:
        trend.status !== 'insufficient_data' &&
        trend.status !== 'stable'
          ? 'Hay señales mixtas en la tendencia reciente; repite condiciones comparables.'
          : pronouncedDrop
          ? 'La última vez hubo una caída clara entre series; consolida antes de subir.'
          : 'La última vez no hubo evidencia suficiente para subir de forma conservadora.'
    };
  }


  progressionRecommendationText(
    exercise: Exercise
  ): string {
    const recommendation =
      this.progressionRecommendation(
        exercise
      );

    if (!recommendation) {
      return '';
    }

    return `${recommendation.title}. ${recommendation.reason}`;
  }


  todayPerformance(
    exercise: Exercise
  ): TodayPerformance {
    const empty =
      this.emptyTodayPerformance(
        'Datos insuficientes',
        'Aptus necesita al menos 3 exposiciones recientes y 2 series válidas hoy.'
      );

    if (
      !this.isExternallyLoadedExercise(
        exercise
      )
    ) {
      return {
        ...empty,
        summary:
          'Disponible por ahora sólo para ejercicios con carga externa.'
      };
    }

    const currentSets =
      this.currentCompletedSets(
        exercise.exerciseId
      );
    const currentE1rms =
      currentSets
        .map(set =>
          this.estimatedOneRepMax(
            exercise,
            set
          )
        )
        .filter(
          (
            value
          ): value is number =>
            value !== null
        );
    const validSetsToday =
      currentE1rms.length;

    if (validSetsToday === 0) {
      return empty;
    }

    const executions =
      this
        .getRecentExerciseHistories(
          exercise.exerciseId
        )
        .slice(0, 5)
        .map(history =>
          this.executionPerformance(
            exercise,
            history,
            this.parseRepTarget(
              exercise.target
            )
          )
        )
        .filter(
          execution =>
            execution.bestE1rm !== null
        );

    const baselineValues =
      executions
        .map(
          execution =>
            execution.bestE1rm
        )
        .filter(
          (
            value
          ): value is number =>
            value !== null
        );

    if (baselineValues.length < 3) {
      return {
        ...empty,
        previousExposures:
          baselineValues.length
      };
    }

    const baselineE1rm =
      this.median(baselineValues);

    if (baselineE1rm === null) {
      return {
        ...empty,
        previousExposures:
          baselineValues.length
      };
    }

    const currentE1rm =
      currentE1rms.length
        ? this.median(currentE1rms)
        : null;
    const percentChange =
      baselineE1rm !== null &&
      currentE1rm !== null
        ? (
            (
              currentE1rm -
              baselineE1rm
            ) /
            baselineE1rm
          ) * 100
        : null;
    const preliminary =
      currentE1rm !== null &&
      percentChange !== null
        ? this.todayPerformanceChangeText(
            percentChange
          )
        : null;

    if (validSetsToday < 2) {
      return {
        status:
          'insufficient_data',
        label:
          'Datos insuficientes',
        summary:
          preliminary
            ? `${preliminary} preliminar; completa otra serie para clasificar.`
            : 'Completa otra serie para clasificar el rendimiento de hoy.',
        baselineE1rm,
        currentE1rm,
        percentChange,
        previousExposures:
          baselineValues.length,
        validSetsToday
      };
    }

    if (currentE1rm === null) {
      return {
        ...empty,
        baselineE1rm,
        previousExposures:
          baselineValues.length,
        validSetsToday
      };
    }

    const baselineRir =
      this.median(
        executions
          .map(
            execution =>
              execution.averageRir
          )
          .filter(
            (
              value
            ): value is number =>
              value !== null
          )
      );
    const currentRir =
      this.averageRir(
        currentSets
      );
    const comparableEffort =
      baselineRir === null ||
      currentRir === null ||
      currentRir <= baselineRir + 0.5;
    const notMuchEasier =
      baselineRir === null ||
      currentRir === null ||
      currentRir <= baselineRir + 1;
    const tolerance =
      Math.max(
        baselineE1rm *
          TODAY_PERFORMANCE_TOLERANCE_RATIO,
        1.5
      );
    const lowerLimit =
      baselineE1rm - tolerance;
    const upperLimit =
      baselineE1rm + tolerance;
    const lowSets =
      currentE1rms.filter(
        value =>
          value < lowerLimit
      ).length;
    const highSets =
      currentE1rms.filter(
        value =>
          value > upperLimit
      ).length;

    if (
      currentE1rm < lowerLimit &&
      lowSets >= 2 &&
      comparableEffort
    ) {
      return {
        status:
          'below_usual',
        label:
          'Por debajo de lo habitual',
        summary:
          `${this.todayPerformanceChangeText(percentChange)} frente a tu referencia reciente.`,
        baselineE1rm,
        currentE1rm,
        percentChange,
        previousExposures:
          baselineValues.length,
        validSetsToday
      };
    }

    if (
      currentE1rm > upperLimit &&
      highSets >= 2 &&
      notMuchEasier
    ) {
      return {
        status:
          'above_usual',
        label:
          'Mejor de lo habitual',
        summary:
          `${this.todayPerformanceChangeText(percentChange)} frente a tu referencia reciente.`,
        baselineE1rm,
        currentE1rm,
        percentChange,
        previousExposures:
          baselineValues.length,
        validSetsToday
      };
    }

    return {
      status:
        'normal',
      label:
        'Rendimiento habitual',
      summary:
        'Dentro de tu rango reciente.',
      baselineE1rm,
      currentE1rm,
      percentChange,
      previousExposures:
        baselineValues.length,
      validSetsToday
    };
  }


  todayPerformanceSummary(
    exercise: Exercise
  ): string {
    const performance =
      this.todayPerformance(
        exercise
      );

    return `Estado de hoy · ${performance.label}. ${performance.summary}`;
  }


  exerciseRecentTrend(
    exercise: Exercise
  ): ExerciseRecentTrend {
    const target =
      this.parseRepTarget(
        exercise.target
      );
    const executions =
      this
        .getRecentExerciseHistories(
          exercise.exerciseId
        )
        .slice(0, 5)
        .reverse()
        .map(history =>
          this.executionPerformance(
            exercise,
            history,
            target
          )
        );
    const e1rmValues =
      executions
        .map(item => item.bestE1rm)
        .filter(
          (
            value
          ): value is number =>
            value !== null
        );

    if (executions.length < 3) {
      return {
        status:
          'insufficient_data',
        exposures:
          executions.length,
        executions,
        e1rmValues,
        e1rmChange:
          null
      };
    }

    return this.classifyRecentTrend(
      executions
    );
  }


  exerciseTrendSummary(
    exercise: Exercise
  ): string {
    const trend =
      this.exerciseRecentTrend(
        exercise
      );

    if (
      trend.status ===
      'insufficient_data'
    ) {
      return 'Sin tendencia suficiente';
    }

    const labels:
      Record<RecentTrendStatus, string> = {
        improving:
          'Mejorando',
        stable:
          'Estable',
        declining:
          'Bajando',
        insufficient_data:
          'Sin tendencia suficiente'
      };
    const e1rmText =
      trend.e1rmValues.length >= 3
        ? ` · e1RM: ${trend.e1rmValues
            .map(value =>
              `${this.formatDecimal(value)} kg`
            )
            .join(' -> ')}`
        : '';

    return `Tendencia · ${labels[trend.status]}${e1rmText}`;
  }


  private parseRepTarget(
    target: string | undefined
  ): RepTarget | null {
    if (!target) {
      return null;
    }

    const values =
      target
        .match(/\d+(?:[.,]\d+)?/g)
        ?.map(value =>
          Number(
            value.replace(',', '.')
          )
        )
        .filter(Number.isFinite) ??
      [];

    if (!values.length) {
      return null;
    }

    const min =
      values[0];
    const max =
      values.length > 1
        ? values[1]
        : values[0];

    if (
      min <= 0 ||
      max < min
    ) {
      return null;
    }

    return {
      min,
      max,
      isRange:
        min !== max
    };
  }


  private executionPerformance(
    exercise: Exercise,
    history: {
      workout: Workout;
      sets: WorkoutSetInput[];
      performedAt: string | null;
      time: number;
    },
    target: RepTarget | null
  ): ExerciseExecutionPerformance {
    const comparableSets =
      history.sets.filter(
        set =>
          set.reps !== null &&
          set.reps !== undefined &&
          Number.isFinite(set.reps)
      );
    const reps =
      comparableSets.map(
        set => set.reps ?? 0
      );
    const rirs =
      comparableSets
        .map(set => set.rir)
        .filter(
          (
            value
          ): value is number =>
            value !== null &&
            value !== undefined &&
            Number.isFinite(value)
        );
    const e1rms =
      comparableSets
        .map(set =>
          this.estimatedOneRepMax(
            exercise,
            set
          )
        )
        .filter(
          (
            value
          ): value is number =>
            value !== null
        );
    const belowRangeSets =
      target
        ? reps.filter(
            value =>
              value < target.min
          ).length
        : 0;
    const closeToFailureSets =
      comparableSets.filter(
        set =>
          set.rir !== null &&
          set.rir !== undefined &&
          Number.isFinite(set.rir) &&
          set.rir <= 1
      ).length;

    return {
      workoutId:
        history.workout.workoutId,
      performedAt:
        history.performedAt,
      time:
        history.time,
      sets:
        history.sets,
      totalReps:
        reps.reduce(
          (sum, value) => sum + value,
          0
        ),
      averageRir:
        rirs.length
          ? rirs.reduce(
              (sum, value) => sum + value,
              0
            ) / rirs.length
          : null,
      bestE1rm:
        e1rms.length
          ? Math.max(...e1rms)
          : null,
      belowRangeSets,
      closeToFailureSets,
      pronouncedDrop:
        reps.length > 1 &&
        Math.max(...reps) -
        Math.min(...reps) >= 4
    };
  }


  estimatedOneRepMax(
    exercise: Exercise,
    set: WorkoutSetInput
  ): number | null {
    if (
      !this.isExternallyLoadedExercise(
        exercise
      )
    ) {
      return null;
    }

    return calculateEpleyOneRepMax(
      set.weight,
      set.reps
    );
  }


  personalRecordLabel(
    type: PersonalRecord['type']
  ): string {
    const labels:
      Record<PersonalRecord['type'], string> = {
        'max-weight': 'Mayor peso',
        'estimated-1rm': 'Nuevo e1RM',
        'max-reps': 'Más repeticiones',
        duration: 'Mayor duración'
      };

    return labels[type];
  }


  personalRecordValue(
    record: PersonalRecord
  ): string {
    if (record.type === 'max-reps') {
      return `${record.value} reps`;
    }

    if (record.type === 'duration') {
      return this.formatDurationSeconds(
        record.value
      );
    }

    return `${new Intl.NumberFormat(
      'es-ES',
      {
        minimumFractionDigits:
          record.type === 'estimated-1rm'
            ? 1
            : 0,
        maximumFractionDigits:
          record.type === 'estimated-1rm'
            ? 1
            : 3
      }
    ).format(record.value)} kg`;
  }


  private isExternallyLoadedExercise(
    exercise: Exercise
  ): boolean {
    const recordTypes =
      this.exerciseRecordTypes(exercise);

    if (!recordTypes.length) {
      return true;
    }

    return (
      recordTypes.includes(
        'weight_reps'
      ) &&
      !recordTypes.includes(
        'duration'
      ) &&
      !recordTypes.includes(
        'bodyweight_reps'
      )
    );
  }


  private classifyRecentTrend(
    executions: ExerciseExecutionPerformance[]
  ): ExerciseRecentTrend {
    const e1rmValues =
      executions
        .map(item => item.bestE1rm)
        .filter(
          (
            value
          ): value is number =>
            value !== null
        );
    const first =
      executions[0];
    const last =
      executions[
        executions.length - 1
      ];
    const firstE1rm =
      e1rmValues[0] ?? null;
    const lastE1rm =
      e1rmValues[
        e1rmValues.length - 1
      ] ?? null;
    const e1rmChange =
      firstE1rm !== null &&
      lastE1rm !== null
        ? lastE1rm - firstE1rm
        : null;
    const enoughE1rm =
      e1rmValues.length >= 3;
    const e1rmTolerance =
      firstE1rm !== null
        ? Math.max(
            firstE1rm *
              E1RM_TREND_TOLERANCE_RATIO,
            1
          )
        : 0;
    const repsChange =
      last.totalReps - first.totalReps;
    const rirChange =
      first.averageRir !== null &&
      last.averageRir !== null
        ? last.averageRir -
          first.averageRir
        : null;
    const recentBadSessions =
      executions.filter(
        item =>
          item.belowRangeSets > 0 ||
          item.closeToFailureSets > 0 ||
          item.pronouncedDrop
      ).length;

    let status: RecentTrendStatus =
      'stable';

    if (
      enoughE1rm &&
      e1rmChange !== null &&
      e1rmChange > e1rmTolerance &&
      repsChange >= -REPS_TREND_TOLERANCE &&
      (
        rirChange === null ||
        rirChange >= -1
      ) &&
      recentBadSessions <= 1
    ) {
      status = 'improving';
    } else if (
      enoughE1rm &&
      e1rmChange !== null &&
      e1rmChange < -e1rmTolerance &&
      (
        repsChange <= REPS_TREND_TOLERANCE ||
        recentBadSessions >= 2 ||
        (
          rirChange !== null &&
          rirChange < -1
        )
      )
    ) {
      status = 'declining';
    } else if (
      !enoughE1rm &&
      repsChange > REPS_TREND_TOLERANCE &&
      (
        rirChange === null ||
        rirChange >= -1
      ) &&
      recentBadSessions <= 1
    ) {
      status = 'improving';
    } else if (
      !enoughE1rm &&
      repsChange < -REPS_TREND_TOLERANCE &&
      (
        recentBadSessions >= 2 ||
        (
          rirChange !== null &&
          rirChange < -1
        )
      )
    ) {
      status = 'declining';
    }

    return {
      status,
      exposures:
        executions.length,
      executions,
      e1rmValues,
      e1rmChange
    };
  }


  private emptyTodayPerformance(
    label: string,
    summary: string
  ): TodayPerformance {
    return {
      status:
        'insufficient_data',
      label,
      summary,
      baselineE1rm:
        null,
      currentE1rm:
        null,
      percentChange:
        null,
      previousExposures:
        0,
      validSetsToday:
        0
    };
  }


  private todayPerformanceChangeText(
    percentChange: number | null
  ): string {
    if (percentChange === null) {
      return 'Sin comparación porcentual';
    }

    const rounded =
      Math.round(percentChange);
    const sign =
      rounded > 0
        ? '+'
        : '';

    return `≈ ${sign}${rounded}%`;
  }


  private median(
    values: number[]
  ): number | null {
    if (!values.length) {
      return null;
    }

    const sorted =
      [...values].sort(
        (first, second) =>
          first - second
      );
    const middle =
      Math.floor(sorted.length / 2);

    return sorted.length % 2
      ? sorted[middle]
      : (
          sorted[middle - 1] +
          sorted[middle]
        ) / 2;
  }


  private averageRir(
    sets: WorkoutSetInput[]
  ): number | null {
    const rirs =
      sets
        .map(set => set.rir)
        .filter(
          (
            value
          ): value is number =>
            value !== null &&
            value !== undefined &&
            Number.isFinite(value)
        );

    return rirs.length
      ? rirs.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / rirs.length
      : null;
  }


  private formatDecimal(
    value: number
  ): string {
    return value.toFixed(1);
  }


  private formatHistoricalSet(
    set: WorkoutSetInput
  ): string {
    const parts: string[] = [];

    if (
      set.weight !== null &&
      set.weight !== undefined &&
      Number.isFinite(set.weight)
    ) {
      parts.push(`${set.weight} kg`);
    }

    if (
      set.reps !== null &&
      set.reps !== undefined &&
      Number.isFinite(set.reps)
    ) {
      if (parts.length) {
        parts.push(`× ${set.reps}`);
      } else {
        parts.push(`${set.reps} reps`);
      }
    }

    if (
      set.durationSeconds !== null &&
      set.durationSeconds !== undefined &&
      Number.isFinite(set.durationSeconds)
    ) {
      parts.push(
        this.formatDurationSeconds(
          set.durationSeconds
        )
      );
    }

    if (
      this.settingsService
        .settings()
        .showRir &&
      set.rir !== null &&
      set.rir !== undefined &&
      Number.isFinite(set.rir)
    ) {
      parts.push(`RIR ${set.rir}`);
    }

    return parts.join(' ');
  }


  private formatDurationSeconds(
    seconds: number
  ): string {
    const safeSeconds =
      Math.max(
        0,
        Math.round(seconds)
      );

    if (safeSeconds < 60) {
      return `${safeSeconds} s`;
    }

    const minutes =
      Math.floor(safeSeconds / 60);
    const remaining =
      safeSeconds % 60;

    return remaining
      ? `${minutes} min ${remaining} s`
      : `${minutes} min`;
  }


  private currentCompletedSets(
    exerciseId: string
  ): WorkoutSetInput[] {
    const workout =
      this.activeWorkout();

    if (!workout) {
      return [];
    }

    return workout.sets
      .filter(
        set =>
          set.exerciseId === exerciseId &&
          this.isWorkingSet(set) &&
          Boolean(set.completedAt)
      )
      .sort(
        (first, second) =>
          first.setIndex -
          second.setIndex
      );
  }


  private exerciseMetrics(
    sets: WorkoutSetInput[]
  ): ExerciseProgressMetrics {
    const workingSets =
      sets.filter(
        set =>
          this.isWorkingSet(set)
      );

    const validWeights =
      workingSets
        .map(set => set.weight)
        .filter(
          (
            value
          ): value is number =>
            value !== null &&
            value !== undefined &&
            Number.isFinite(value)
        );

    const validReps =
      workingSets
        .map(set => set.reps)
        .filter(
          (
            value
          ): value is number =>
            value !== null &&
            value !== undefined &&
            Number.isFinite(value)
        );

    const weightedSets =
      workingSets.filter(
        set =>
          set.weight !== null &&
          set.weight !== undefined &&
          Number.isFinite(set.weight) &&
          set.weight > 0 &&
          set.reps !== null &&
          set.reps !== undefined &&
          Number.isFinite(set.reps) &&
          set.reps > 0
      );

    const volume =
      weightedSets.length === workingSets.length &&
      weightedSets.length > 0
        ? weightedSets.reduce(
            (total, set) =>
              total +
              (set.weight ?? 0) *
              (set.reps ?? 0),
            0
          )
        : null;

    return {
      maxWeight:
        validWeights.length
          ? Math.max(...validWeights)
          : null,
      totalReps:
        validReps.length
          ? validReps.reduce(
              (total, value) =>
                total + value,
              0
            )
          : null,
      volume,
      bestSet:
        this.bestSet(workingSets)
    };
  }


  private bestSet(
    sets: WorkoutSetInput[]
  ): WorkoutSetInput | null {
    return sets.reduce<WorkoutSetInput | null>(
      (best, set) => {
        if (!best) {
          return set;
        }

        const setWeight =
          set.weight ?? -1;
        const bestWeight =
          best.weight ?? -1;

        if (setWeight > bestWeight) {
          return set;
        }

        if (
          setWeight === bestWeight &&
          (set.reps ?? -1) >
          (best.reps ?? -1)
        ) {
          return set;
        }

        return best;
      },
      null
    );
  }

  getCurrentSet(
    exerciseId: string,
    setIndex: number
  ): WorkoutSetInput | null {
    const workout = this.activeWorkout();

    if (!workout) {
      return null;
    }

    return workout.sets.find(
      set =>
        set.exerciseId === exerciseId &&
        set.setIndex === setIndex
    ) ?? null;
  }


  completedSetCount(
    exercise: Exercise
  ): number {
    const workout =
      this.activeWorkout();

    if (!workout) {
      return 0;
    }

    return workout.sets.filter(
      set =>
        set.exerciseId === exercise.exerciseId &&
        this.isWorkingSet(set) &&
        Boolean(set.completedAt)
    ).length;
  }


  exerciseProgressLabel(
    exercise: Exercise
  ): string {
    return `${this.completedSetCount(exercise)} / ${exercise.sets}`;
  }


  isExerciseCompleted(
    exercise: Exercise
  ): boolean {
    return (
      this.completedSetCount(exercise) >=
      exercise.sets
    );
  }


  isExerciseExpanded(
    exerciseId: string
  ): boolean {
    return (
      this.expandedExerciseId() ===
      exerciseId
    );
  }


  openExercise(
    exerciseId: string
  ): void {
    const exercise =
      this.findSessionExercise(
        exerciseId
      );

    if (!exercise) {
      return;
    }

    this.expandedExerciseId.set(
      exerciseId
    );
    this.expandedSetKey.set(null);
  }


  toggleExercise(
    exerciseId: string
  ): void {
    this.openExercise(exerciseId);
  }


  isSetExpanded(
    exerciseId: string,
    setIndex: number
  ): boolean {
    return (
      this.expandedSetKey() ===
      this.setExpansionKey(
        exerciseId,
        setIndex
      )
    );
  }


  toggleSet(
    exerciseId: string,
    setIndex: number
  ): void {
    const exercise =
      this.findSessionExercise(
        exerciseId
      );

    if (!exercise) {
      return;
    }

    const key =
      this.setExpansionKey(
        exerciseId,
        setIndex
      );

    this.expandedExerciseId.set(
      exerciseId
    );
    this.expandedSetKey.set(
      this.expandedSetKey() === key
        ? null
        : key
    );
  }


  isCorrectingSet(
    exerciseId: string,
    setIndex: number
  ): boolean {
    return (
      this.correctingSetKey() ===
      this.setExpansionKey(
        exerciseId,
        setIndex
      )
    );
  }


  startSetCorrection(
    exerciseId: string,
    setIndex: number
  ): void {
    if (
      !this.isSetCompleted(
        exerciseId,
        setIndex
      )
    ) {
      return;
    }

    const key =
      this.setExpansionKey(
        exerciseId,
        setIndex
      );

    this.correctingSetKey.set(key);
    this.expandedExerciseId.set(
      exerciseId
    );
    this.expandedSetKey.set(key);
  }


  confirmSetCorrection(
    exerciseId: string,
    setIndex: number
  ): void {
    if (
      !this.isCorrectingSet(
        exerciseId,
        setIndex
      )
    ) {
      return;
    }

    /*
     * Los valores ya se actualizan mediante
     * updateSet() y su autosave.
     *
     * No llamamos a completeSet():
     * - no cambiamos completedAt
     * - no iniciamos otro descanso
     * - no desmarcamos la serie
     */
    this.correctingSetKey.set(null);
    this.expandedSetKey.set(null);

    this.advanceAfterRest();
  }


  setSummary(
    exercise: Exercise,
    setIndex: number
  ): string {
    const set =
      this.getCurrentSet(
        exercise.exerciseId,
        setIndex
      );

    if (
      !set ||
      !this.isSetCompleted(
        exercise.exerciseId,
        setIndex
      )
    ) {
      return this.isNextSet(
        exercise,
        setIndex
      )
        ? 'siguiente'
        : 'pendiente';
    }

    const parts: string[] = [];

    if (
      set.weight !== null &&
      set.weight !== undefined &&
      Number.isFinite(set.weight)
    ) {
      parts.push(`${set.weight} kg`);
    }

    if (
      set.reps !== null &&
      set.reps !== undefined &&
      Number.isFinite(set.reps)
    ) {
      parts.push(`${set.reps} reps`);
    }

    if (
      set.durationSeconds !== null &&
      set.durationSeconds !== undefined &&
      Number.isFinite(set.durationSeconds)
    ) {
      parts.push(
        this.formatDurationSeconds(
          set.durationSeconds
        )
      );
    }

    if (
      this.settingsService
        .settings()
        .showRir &&
      set.rir !== null &&
      set.rir !== undefined &&
      Number.isFinite(set.rir)
    ) {
      parts.push(`RIR ${set.rir}`);
    }

    return parts.length
      ? parts.join(' · ')
      : 'completada';
  }


  isSetInProgress(
    exercise: Exercise,
    setIndex: number
  ): boolean {
    return (
      this.isSetExpanded(
        exercise.exerciseId,
        setIndex
      ) &&
      !this.isSetCompleted(
        exercise.exerciseId,
        setIndex
      )
    );
  }


  private setExpansionKey(
    exerciseId: string,
    setIndex: number
  ): string {
    return `${exerciseId}:${setIndex}`;
  }


  private advanceAfterRest(): void {
    /*
     * Warmups do not have an expandable set editor.
     * This UI transition therefore advances through
     * working steps only, using the shared plan order.
     *
     * No usamos restorableWorkoutContext():
     * ese método está pensado para restaurar un
     * formulario que ya tenía datos introducidos.
     *
     * Aquí queremos avanzar incluso hacia un set
     * completamente nuevo y todavía vacío.
     */
    const nextStep =
      nextPendingStep(
        this.workingExecutionPlan(),
        step => this.isExecutionStepCompleted(step)
      );

    if (nextStep) {
      this.expandedExerciseId.set(
        nextStep.exerciseId
      );

      this.expandedSetKey.set(
        this.setExpansionKey(
          nextStep.exerciseId,
          nextStep.setIndex
        )
      );

      /*
       * Esperamos a que Angular renderice
       * el ejercicio/serie que acabamos de abrir.
       */
      window.setTimeout(
        () => {
          const expandedSet =
            document.querySelector(
              '.set-row.set-expanded'
            );

          if (
            expandedSet instanceof HTMLElement
          ) {
            expandedSet.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          }
        },
        80
      );

      return;
    }

    /*
     * No quedan sets pendientes.
     */
    this.expandedExerciseId.set(null);
    this.expandedSetKey.set(null);
  }


  private handleRestTimerEnded(
    event: RestTimerEnd
  ): void {
    if (
      event.context.reason ===
      'between-sides'
    ) {
      const nextState =
        transitionAfterInterSideRest(
          this.unilateralExecution(),
          {
            exerciseId:
              event.context.exerciseId,
            setIndex:
              event.context.setIndex
          }
        );

      this.unilateralExecution.set(
        nextState
      );

      if (nextState?.phase === 'second') {
        this.expandedExerciseId.set(
          nextState.exerciseId
        );
        this.expandedSetKey.set(
          this.setExpansionKey(
            nextState.exerciseId,
            nextState.setIndex
          )
        );
      }

      return;
    }

    this.advanceAfterRest();
  }


  private syncExpandedWorkoutStep(): void {
    const context =
      this.restorableWorkoutContext();

    if (!context) {
      this.expandedExerciseId.set(null);
      this.expandedSetKey.set(null);
      return;
    }

    this.expandedExerciseId.set(
      context.exercise.exerciseId
    );
    this.expandedSetKey.set(
      this.setExpansionKey(
        context.exercise.exerciseId,
        context.setIndex
      )
    );
  }


  private restorableWorkoutContext():
    {
      exercise: Exercise;
      setIndex: number;
    } | null {
    const session =
      this.activeSession();
    const workout =
      this.activeWorkout();

    if (!session || !workout) {
      return null;
    }

    const step =
      this.workingExecutionPlan().find(
        candidate => {
          const set =
            this.getCurrentSet(
              candidate.exerciseId,
              candidate.setIndex
            );

          return (
            set !== null &&
            !set.completedAt &&
            this.hasRecordedSetInput(set)
          );
        }
      );

    if (!step) {
      return null;
    }

    const exercise =
      session.exercises.find(
        candidate =>
          candidate.exerciseId ===
          step.exerciseId
      );

    return exercise
      ? {
          exercise,
          setIndex: step.setIndex
        }
      : null;
  }


  private hasRecordedSetInput(
    set: WorkoutSetInput
  ): boolean {
    return [
      set.weight,
      set.reps,
      set.rir,
      set.durationSeconds
    ].some(
      value =>
        value !== null &&
        value !== undefined &&
        Number.isFinite(value)
    );
  }


  private syncExpandedAfterSetToggle(
    exerciseId: string,
    setIndex: number,
    markedCompleted: boolean
  ): void {
    const exercise =
      this.findSessionExercise(
        exerciseId
      );

    if (!exercise) {
      return;
    }

    if (!markedCompleted) {
      this.expandedExerciseId.set(
        exerciseId
      );
      this.expandedSetKey.set(
        this.setExpansionKey(
          exerciseId,
          setIndex
        )
      );
      return;
    }

    this.expandedExerciseId.set(
      exerciseId
    );
    this.expandedSetKey.set(null);
  }


  isNextSet(
    exercise: Exercise,
    setIndex: number
  ): boolean {
    const nextStep =
      nextPendingStep(
        this.workingExecutionPlan(),
        step => this.isExecutionStepCompleted(step)
      );

    return (
      nextStep?.exerciseId ===
      exercise.exerciseId &&
      nextStep.setIndex === setIndex
    );
  }


  unilateralPhaseLabel(
    exercise: Exercise,
    setIndex: number
  ): string {
    const phase =
      unilateralPhaseForSet(
        exercise.unilateral === true,
        this.unilateralExecution(),
        {
          exerciseId:
            exercise.exerciseId,
          setIndex
        }
      );

    if (phase === 'first') {
      return 'Lado 1';
    }

    if (phase === 'second') {
      return 'Lado 2';
    }

    if (phase === 'between-sides') {
      return 'Cambio de lado';
    }

    return '';
  }


  completeSetActionLabel(
    exercise: Exercise,
    setIndex: number
  ): string {
    const phase =
      unilateralPhaseForSet(
        exercise.unilateral === true,
        this.unilateralExecution(),
        {
          exerciseId:
            exercise.exerciseId,
          setIndex
        }
      );

    if (phase === 'first') {
      return 'Completar lado 1';
    }

    if (phase === 'second') {
      return 'Completar lado 2';
    }

    if (phase === 'between-sides') {
      return 'Descanso entre lados';
    }

    return 'Completar';
  }


  isBetweenSides(
    exercise: Exercise,
    setIndex: number
  ): boolean {
    return unilateralPhaseForSet(
      exercise.unilateral === true,
      this.unilateralExecution(),
      {
        exerciseId:
          exercise.exerciseId,
        setIndex
      }
    ) === 'between-sides';
  }


  private hasPendingSetAfter(
    exerciseId: string,
    setIndex: number
  ): boolean {
    const plan =
      this.executionPlan();

    const currentStep =
      findCurrentStep(
        plan,
        {
          kind:
            setIndex < 0
              ? 'warmup'
              : 'working',
          exerciseId,
          setIndex
        }
      );

    if (!currentStep) {
      return false;
    }

    return hasPendingStepAfter(
      plan,
      currentStep,
      step =>
        this.isExecutionStepCompleted(
          step
        )
    );
  }


  private executionPlan(): ExecutionStep[] {
    const session =
      this.activeSession();
    const workout =
      this.activeWorkout();

    if (!session) {
      return [];
    }

    return buildExecutionPlan(
      session.exercises.map(
        exercise => ({
          exerciseId:
            exercise.exerciseId,
          workingSetCount:
            exercise.sets,
          warmupSetIndices:
            (workout?.sets ?? [])
              .filter(
                set =>
                  set.exerciseId ===
                  exercise.exerciseId &&
                  set.setType === 'warmup'
              )
              .map(set => set.setIndex)
        })
      )
    );
  }


  private workingExecutionPlan(): ExecutionStep[] {
    return this.executionPlan().filter(
      step => step.kind === 'working'
    );
  }


  private isExecutionStepCompleted(
    step: ExecutionStep
  ): boolean {
    return this.isSetCompleted(
      step.exerciseId,
      step.setIndex
    );
  }

  async sendMagicLink(event: Event): Promise<void> {
    event.preventDefault();

    if (!this.email().trim()) {
      return;
    }

    this.loginLoading.set(true);
    this.loginMessage.set(null);

    try {
      await this.auth.signInWithMagicLink(
        this.email().trim()
      );

      this.loginMessage.set(
        'Te hemos enviado un enlace de acceso por email.'
      );

    } catch (err: any) {
      this.loginMessage.set(
        err?.message ??
        'No se pudo enviar el enlace de acceso.'
      );
    } finally {
      this.loginLoading.set(false);
    }
  }

  async startWorkout(
    session: RoutineSession
  ): Promise<void> {
    const routine = this.routine();

    if (!routine) {
      return;
    }

    if (
      this.workoutLoading() ||
      this.cancellingWorkout()
    ) {
      return;
    }

    if (this.activeWorkout()) {
      this.workoutError.set(
        'Ya tienes un entrenamiento en curso.'
      );
      return;
    }

    this.workoutLoading.set(true);
    this.workoutError.set(null);
    this.workoutFinishSummary.set(null);

    try {
      const token = await this.auth.getAccessToken();

      if (!token) {
        throw new Error('Necesitas iniciar sesión.');
      }

      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`
      });

      const workout: Workout = {
        workoutId: crypto.randomUUID(),
        routineId: routine.routineId,
        sessionId: session.sessionId,
        status: 'in_progress',
        sets: []
      };

      const created = await new Promise<Workout>((resolve, reject) => {
        this.http
          .post<Workout>(
            `${this.apiUrl}/workouts`,
            workout,
            { headers }
          )
          .subscribe({
            next: resolve,
            error: reject
          });
      });

      void this.telemetry.track({
        event_name:
          'workout_started',
        route:
          '/entrenar',
        metadata: {}
      });

      this.activeWorkout.set(created);
      this.activeSession.set(session);
      this.unilateralExecution.set(null);
      this.workoutSessionState
        .setActive();
      this.syncExpandedWorkoutStep();
      this.cancelConfirmationOpen.set(false);
      this.workoutEditVersion = 0;
      this.persistedEditVersion = 0;
      this.autosaveStatus.set('saved');

      this.workoutHistory.set([
        created,
        ...this.workoutHistory()
      ]);

    } catch (err: any) {
      this.workoutError.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo iniciar el entrenamiento.'
      );
    } finally {
      this.workoutLoading.set(false);
    }
  }

  exerciseDiscomfort(
    exerciseId: string
  ): ExerciseDiscomfortInput | null {
    const workout = this.activeWorkout();

    if (!workout) {
      return null;
    }

    return (
      workout.discomforts ?? []
    ).find(
      discomfort =>
        discomfort.exerciseId === exerciseId
    ) ?? null;
  }


  updateExerciseDiscomfort(
    exerciseId: string,
    field:
      | 'painScore'
      | 'area'
      | 'note',
    value: string
  ): void {
    const workout = this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    const current =
      this.exerciseDiscomfort(
        exerciseId
      );

    const discomforts =
      [
        ...(workout.discomforts ?? [])
      ];

    let next:
      ExerciseDiscomfortInput;

    if (field === 'painScore') {
      const score = Number(value);

      if (
        !Number.isInteger(score) ||
        score < 0 ||
        score > 10
      ) {
        return;
      }

      next = {
        exerciseId,
        painScore: score,
        area:
          current?.area ?? null,
        note:
          current?.note ?? null
      };
    } else {
      next = {
        exerciseId,
        painScore:
          current?.painScore ?? 0,
        area:
          field === 'area'
            ? (
                value.trim() || null
              )
            : (
                current?.area ?? null
              ),
        note:
          field === 'note'
            ? (
                value.trim() || null
              )
            : (
                current?.note ?? null
              )
      };
    }

    const index =
      discomforts.findIndex(
        discomfort =>
          discomfort.exerciseId === exerciseId
      );

    const hasMeaningfulEntry =
      next.painScore > 0 ||
      Boolean(next.note);

    if (!hasMeaningfulEntry) {
      if (index < 0) {
        return;
      }

      discomforts.splice(index, 1);
    } else if (index >= 0) {
      discomforts[index] = next;
    } else {
      discomforts.push(next);
    }

    this.activeWorkout.set({
      ...workout,
      discomforts
    });

    this.markWorkoutEdited();
  }


  clearExerciseDiscomfort(
    exerciseId: string
  ): void {
    const workout = this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    const discomforts =
      (
        workout.discomforts ?? []
      ).filter(
        discomfort =>
          discomfort.exerciseId !== exerciseId
      );

    this.activeWorkout.set({
      ...workout,
      discomforts
    });

    this.markWorkoutEdited();
  }


  warmupSets(
    exerciseId: string
  ): WorkoutSetInput[] {
    const workout = this.activeWorkout();

    if (!workout) {
      return [];
    }

    return orderWarmupSteps(
      workout.sets.filter(
        set =>
          set.exerciseId === exerciseId &&
          set.setType === 'warmup'
      )
    );
  }


  addWarmupSet(
    exerciseId: string
  ): void {
    const workout = this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    const warmups =
      this.warmupSets(exerciseId);

    const nextIndex =
      warmups.length === 0
        ? -1
        : Math.min(
            ...warmups.map(
              set => set.setIndex
            )
          ) - 1;

    const warmup: WorkoutSetInput = {
      setId: crypto.randomUUID(),
      exerciseId,
      setIndex: nextIndex,
      setType: 'warmup',
      weight: null,
      reps: null,
      rir: null,
      durationSeconds: null
    };

    this.activeWorkout.set({
      ...workout,
      sets: [
        ...workout.sets,
        warmup
      ]
    });

    this.markWorkoutEdited();
  }


  removeWarmupSet(
    setId: string
  ): void {
    const workout = this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    const exists =
      workout.sets.some(
        set =>
          set.setId === setId &&
          set.setType === 'warmup'
      );

    if (!exists) {
      return;
    }

    this.activeWorkout.set({
      ...workout,
      sets:
        workout.sets.filter(
          set =>
            !(
              set.setId === setId &&
              set.setType === 'warmup'
            )
        )
    });

    this.markWorkoutEdited();
  }


  toggleWarmupCompleted(
    setId: string
  ): void {
    const workout = this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    const warmup =
      workout.sets.find(
        set =>
          set.setId === setId &&
          set.setType === 'warmup'
      );

    if (!warmup) {
      return;
    }

    const shouldStartRestTimer =
      !warmup.completedAt;

    this.activeWorkout.set({
      ...workout,
      sets:
        workout.sets.map(
          set =>
            set.setId === setId &&
            set.setType === 'warmup'
              ? {
                  ...set,
                  completedAt:
                    set.completedAt
                      ? null
                      : new Date().toISOString()
                }
              : set
        )
    });

    if (shouldStartRestTimer) {
      this.clearSetTimer();

      if (
        this.hasPendingSetAfter(
          warmup.exerciseId,
          warmup.setIndex
        )
      ) {
        if (
          this.settingsService
            .settings()
            .automaticRestTimer
        ) {
          this.startRestTimerForSet(
            warmup.exerciseId,
            warmup.setIndex
          );
        }
      } else {
        this.clearRestTimer();
      }
    }

    this.markWorkoutEdited();
  }


  updateWarmupSet(
    setId: string,
    field:
      | 'weight'
      | 'reps'
      | 'durationSeconds',
    value: string
  ): void {
    const workout = this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    const numericValue =
      value === ''
        ? null
        : Number(value);

    if (
      numericValue !== null &&
      (
        Number.isNaN(numericValue) ||
        numericValue < 0
      )
    ) {
      return;
    }

    const exists =
      workout.sets.some(
        set =>
          set.setId === setId &&
          set.setType === 'warmup'
      );

    if (!exists) {
      return;
    }

    this.activeWorkout.set({
      ...workout,
      sets:
        workout.sets.map(
          set =>
            set.setId === setId &&
            set.setType === 'warmup'
              ? {
                  ...set,
                  [field]: numericValue
                }
              : set
        )
    });

    this.markWorkoutEdited();
  }


  private markWorkoutEdited(): void {
    this.workoutEditVersion += 1;
    this.scheduleAutosave();
  }


  updateSet(
    exerciseId: string,
    setIndex: number,
    field: 'weight' | 'reps' | 'rir' | 'durationSeconds',
    value: string
  ): void {
    const workout = this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    const numericValue =
      value === ''
        ? null
        : Number(value);

    if (
      numericValue !== null &&
      (
        Number.isNaN(numericValue) ||
        numericValue < 0
      )
    ) {
      return;
    }

    const existing = workout.sets.find(
      set =>
        set.exerciseId === exerciseId &&
        set.setIndex === setIndex
    );
    const wasCompleted =
      Boolean(existing?.completedAt);

    let sets: WorkoutSetInput[];

    if (existing) {
      sets = workout.sets.map(set =>
        set.exerciseId === exerciseId &&
        set.setIndex === setIndex
          ? {
              ...set,
              [field]: numericValue
            }
          : set
      );

    } else {
      sets = [
        ...workout.sets,
        {
          setId: crypto.randomUUID(),
          exerciseId,
          setIndex,
          weight:
            field === 'weight'
              ? numericValue
              : null,
          reps:
            field === 'reps'
              ? numericValue
              : null,
          rir:
            field === 'rir'
              ? numericValue
              : null,
          durationSeconds:
            field === 'durationSeconds'
              ? numericValue
              : null
        }
      ];
    }

    this.activeWorkout.set({
      ...workout,
      sets
    });

    this.workoutEditVersion += 1;
    this.scheduleAutosave();
  }

  async completeSet(
    exerciseId: string,
    setIndex: number
  ): Promise<void> {
    const workout = this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    if (
      this.workoutLoading() ||
      this.cancellingWorkout()
    ) {
      return;
    }

    const existing = workout.sets.find(
      set =>
        set.exerciseId === exerciseId &&
        set.setIndex === setIndex
    );
    const wasCompleted =
      Boolean(existing?.completedAt);
    const exercise =
      this.findSessionExercise(
        exerciseId
      );

    if (!wasCompleted) {
      const transition =
        transitionWorkingSetCompletion(
          exercise?.unilateral === true,
          this.unilateralExecution(),
          {
            exerciseId,
            setIndex
          }
        );

      this.unilateralExecution.set(
        transition.state
      );

      if (
        transition.action ===
        'start-inter-side-rest'
      ) {
        this.clearSetTimer();
        this.expandedExerciseId.set(
          exerciseId
        );
        this.expandedSetKey.set(
          this.setExpansionKey(
            exerciseId,
            setIndex
          )
        );
        this.startInterSideRest(
          exercise,
          setIndex
        );
        return;
      }

      if (
        this.restTimer()?.reason ===
        'between-sides'
      ) {
        this.clearRestTimer();
      }
    }

    let sets: WorkoutSetInput[];

    let shouldStartRestTimer = false;

    if (existing) {
      shouldStartRestTimer =
        !existing.completedAt;

      sets = workout.sets.map(set =>
        set.exerciseId === exerciseId &&
        set.setIndex === setIndex
          ? {
              ...set,
              completedAt: set.completedAt
                ? null
                : new Date().toISOString()
            }
          : set
      );

    } else {
      shouldStartRestTimer = true;

      sets = [
        ...workout.sets,
        {
          setId: crypto.randomUUID(),
          exerciseId,
          setIndex,
          completedAt: new Date().toISOString()
        }
      ];
    }

    this.activeWorkout.set({
      ...workout,
      sets
    });
    this.workoutEditVersion += 1;

    this.syncExpandedAfterSetToggle(
      exerciseId,
      setIndex,
      !wasCompleted
    );

    if (shouldStartRestTimer) {
      this.clearSetTimer();

      if (
        this.hasPendingSetAfter(
          exerciseId,
          setIndex
        )
      ) {
        if (
          this.settingsService
            .settings()
            .automaticRestTimer
        ) {
          this.startRestTimerForSet(
            exerciseId,
            setIndex
          );
        }
      } else {
        this.clearRestTimer();
      }
    }

    await this.saveWorkout();
  }


  requestFinishWorkout(): void {
    if (
      this.settingsService
        .settings()
        .confirmBeforeFinish &&
      !window.confirm(
        '¿Finalizar este entrenamiento?'
      )
    ) {
      return;
    }

    void this.finishWorkout();
  }


  startTimedSet(
    exerciseId: string,
    setIndex: number
  ): void {
    const exercise =
      this.findSessionExercise(
        exerciseId
      );

    if (
      !exercise ||
      !this.isDurationExercise(exercise) ||
      this.workoutLoading() ||
      this.cancellingWorkout()
    ) {
      return;
    }

    const target =
      this.durationTargetRangeSeconds(
        exercise
      );
    const currentSet =
      this.getCurrentSet(
        exerciseId,
        setIndex
      );
    const initialSeconds =
      Number.isFinite(
        currentSet?.durationSeconds
      )
        ? Math.max(
            0,
            Number(
              currentSet?.durationSeconds
            )
          )
        : 0;

    this.clearSetTimerInterval();

    this.setTimer.set({
      exerciseId,
      setIndex,
      targetMinSeconds:
        target?.min ?? null,
      targetMaxSeconds:
        target?.max ?? null,
      startedAt:
        Date.now(),
      accumulatedSeconds:
        initialSeconds,
      elapsedSeconds:
        initialSeconds,
      status:
        'running'
    });

    this.setTimerInterval =
      setInterval(
        () => this.reconcileSetTimer(),
        250
      );

    this.reconcileSetTimer();
  }


  pauseSetTimer(): void {
    const timer =
      this.reconciledSetTimer();

    if (
      !timer ||
      timer.status !== 'running'
    ) {
      return;
    }

    this.setTimer.set({
      ...timer,
      startedAt: null,
      accumulatedSeconds:
        timer.elapsedSeconds,
      status:
        'paused'
    });

    this.clearSetTimerInterval();
  }


  resumeSetTimer(): void {
    const timer =
      this.setTimer();

    if (
      !timer ||
      timer.status !== 'paused'
    ) {
      return;
    }

    this.setTimer.set({
      ...timer,
      startedAt:
        Date.now(),
      status:
        'running'
    });

    this.setTimerInterval =
      setInterval(
        () => this.reconcileSetTimer(),
        250
      );

    this.reconcileSetTimer();
  }


  async finishTimedSet(): Promise<void> {
    const timer =
      this.reconciledSetTimer();

    if (!timer) {
      return;
    }

    const elapsedSeconds =
      Math.max(
        1,
        Math.round(timer.elapsedSeconds)
      );

    this.clearSetTimerInterval();
    this.setTimer.set({
      ...timer,
      startedAt: null,
      accumulatedSeconds:
        elapsedSeconds,
      elapsedSeconds,
      status:
        'finished'
    });

    this.setDurationForSet(
      timer.exerciseId,
      timer.setIndex,
      elapsedSeconds
    );
  }


  private durationTargetRangeSeconds(
    exercise: Exercise
  ): {
    min: number;
    max: number;
  } | null {
    const target =
      this.parseRepTarget(
        exercise.target
      );

    if (!target) {
      return null;
    }

    return {
      min:
        Math.floor(target.min),
      max:
        Math.floor(target.max)
    };
  }


  private setDurationForSet(
    exerciseId: string,
    setIndex: number,
    durationSeconds: number
  ): void {
    const workout =
      this.activeWorkout();

    if (!workout) {
      return;
    }

    const existing =
      workout.sets.find(
        set =>
          set.exerciseId === exerciseId &&
          set.setIndex === setIndex
      );

    const sets =
      existing
        ? workout.sets.map(set =>
            set.exerciseId === exerciseId &&
            set.setIndex === setIndex
              ? {
                  ...set,
                  durationSeconds
                }
              : set
          )
        : [
            ...workout.sets,
            {
              setId:
                crypto.randomUUID(),
              exerciseId,
              setIndex,
              durationSeconds
            }
          ];

    this.activeWorkout.set({
      ...workout,
      sets
    });

    this.workoutEditVersion += 1;
    this.scheduleAutosave();
  }


  private reconciledSetTimer():
    SetTimerState | null {
    this.reconcileSetTimer();
    return this.setTimer();
  }


  private reconcileSetTimer(): void {
    const timer =
      this.setTimer();

    if (!timer) {
      this.clearSetTimerInterval();
      return;
    }

    if (
      timer.status !== 'running' ||
      timer.startedAt === null
    ) {
      return;
    }

    const elapsedSeconds =
      Math.max(
        0,
        timer.accumulatedSeconds +
        (Date.now() - timer.startedAt) /
        1000
      );
    const roundedElapsed =
      Math.floor(elapsedSeconds);

    if (
      roundedElapsed !==
      timer.elapsedSeconds
    ) {
      this.setTimer.set({
        ...timer,
        elapsedSeconds:
          roundedElapsed
      });
    }
  }


  private clearSetTimerInterval(): void {
    if (!this.setTimerInterval) {
      return;
    }

    clearInterval(this.setTimerInterval);
    this.setTimerInterval = null;
  }


  private clearSetTimer(): void {
    this.clearSetTimerInterval();
    this.setTimer.set(null);
  }


  sessionPlannedRestSeconds(): number[] {
    const session =
      this.activeSession();

    if (!session) {
      return [];
    }

    return session.exercises
      .map(
        exercise =>
          Number(exercise.restSeconds)
      )
      .filter(
        value =>
          Number.isFinite(value) &&
          value > 0
      )
      .map(
        value =>
          Math.floor(value)
      );
  }


  sessionDefaultRestSeconds(): number {
    const planned =
      this.sessionPlannedRestSeconds();

    if (!planned.length) {
      return 150;
    }

    /*
     * Para crear un descanso global partimos
     * del descanso más largo prescrito en la sesión.
     *
     * Así no reducimos accidentalmente la recuperación
     * de los ejercicios que requieren más descanso.
     */
    return Math.max(...planned);
  }


  sessionPlannedRestLabel(): string {
    const planned =
      this.sessionPlannedRestSeconds();

    if (!planned.length) {
      return 'Según el plan';
    }

    const minimum =
      Math.min(...planned);

    const maximum =
      Math.max(...planned);

    if (minimum === maximum) {
      return (
        this.formatRestClock(minimum) +
        ' · Según el plan'
      );
    }

    return (
      this.formatRestClock(minimum) +
      '–' +
      this.formatRestClock(maximum) +
      ' · Según el plan'
    );
  }


  private formatRestClock(
    seconds: number
  ): string {
    const minutes =
      Math.floor(seconds / 60);

    const remainingSeconds =
      seconds % 60;

    return (
      `${minutes}:` +
      `${remainingSeconds}`.padStart(
        2,
        '0'
      )
    );
  }


  sessionRestOverrideLabel(): string {
    const seconds =
      this.sessionRestOverrideSeconds();

    if (seconds === null) {
      return this.sessionPlannedRestLabel();
    }

    return this.formatRestClock(
      seconds
    );
  }


  sessionRestOverrideSeconds(): number | null {
    const value =
      this.activeWorkout()?.restOverrideSeconds;

    return (
      Number.isFinite(value) &&
      Number(value) >= 0
    )
      ? Math.floor(Number(value))
      : null;
  }


  setSessionRestOverride(
    seconds: number
  ): void {
    const workout = this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout() ||
      !Number.isFinite(seconds)
    ) {
      return;
    }

    const normalized =
      Math.min(
        3600,
        Math.max(
          0,
          Math.floor(seconds)
        )
      );

    this.activeWorkout.set({
      ...workout,
      restOverrideSeconds:
        normalized
    });

    this.markWorkoutEdited();
  }


  adjustSessionRestOverride(
    deltaSeconds: number
  ): void {
    const workout = this.activeWorkout();

    if (!workout) {
      return;
    }

    const current =
      this.sessionRestOverrideSeconds();

    /*
     * Si todavía estamos usando los descansos del plan,
     * el primer ajuste parte del descanso planificado
     * más largo de esta sesión.
     */
    const base =
      current ??
      this.sessionDefaultRestSeconds();

    this.setSessionRestOverride(
      base + deltaSeconds
    );
  }


  clearSessionRestOverride(): void {
    const workout = this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    this.activeWorkout.set({
      ...workout,
      restOverrideSeconds:
        null
    });

    this.markWorkoutEdited();
  }


  private startRestTimerForSet(
    exerciseId: string,
    setIndex: number
  ): void {
    const exercise =
      this.findSessionExercise(
        exerciseId
      );

    const sessionOverride =
      this.sessionRestOverrideSeconds();

    const restSeconds =
      sessionOverride !== null
        ? sessionOverride
        : Number(exercise?.restSeconds);

    this.clearSetTimer();

    if (!exercise) {
      this.clearRestTimer();
      return;
    }

    const set =
      this.getCurrentSet(
        exerciseId,
        setIndex
      );

    this.restTimerController.start({
      exerciseId,
      reason: 'between-sets',
      sourceKind:
        set?.setType === 'warmup'
          ? 'warmup'
          : 'working',
      setIndex,
      setLabel:
        this.restTimerSetLabel(
          exerciseId,
          setIndex
        ),
      exerciseName:
        exercise.name
    }, restSeconds);
  }


  private startInterSideRest(
    exercise: Exercise | null,
    setIndex: number
  ): void {
    if (!exercise) {
      this.unilateralExecution.set(null);
      this.clearRestTimer();
      return;
    }

    const configuredDuration =
      Number(
        exercise.interSideRestSeconds
      );
    const restSeconds =
      Number.isFinite(configuredDuration) &&
      configuredDuration > 0
        ? Math.floor(configuredDuration)
        : DEFAULT_INTER_SIDE_REST_SECONDS;

    this.restTimerController.start({
      exerciseId:
        exercise.exerciseId,
      reason: 'between-sides',
      sourceKind: 'working',
      setIndex,
      exerciseName:
        exercise.name,
      setLabel:
        `serie ${setIndex + 1} · entre lados`
    }, restSeconds);
  }


  private restTimerSetLabel(
    exerciseId: string,
    setIndex: number
  ): string {
    const set =
      this.getCurrentSet(
        exerciseId,
        setIndex
      );

    if (set?.setType === 'warmup') {
      const warmupIndex =
        this.warmupSets(
          exerciseId
        ).findIndex(
          warmup =>
            warmup.setIndex === setIndex
        );

      if (warmupIndex >= 0) {
        return `calentamiento ${warmupIndex + 1}`;
      }

      return 'calentamiento';
    }

    return `serie ${setIndex + 1}`;
  }


  addRestTime(
    seconds: number
  ): void {
    this.restTimerController.adjust(
      seconds
    );
  }


  skipRestTimer(): void {
    this.restTimerController.skip();
  }


  private clearRestTimer(): void {
    this.restTimerController.clear();
  }

  isSetCompleted(
    exerciseId: string,
    setIndex: number
  ): boolean {
    const workout = this.activeWorkout();

    if (!workout) {
      return false;
    }

    return workout.sets.some(
      set =>
        set.exerciseId === exerciseId &&
        set.setIndex === setIndex &&
        Boolean(set.completedAt)
    );
  }

  async saveWorkout(): Promise<void> {
    const workout = this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    this.cancelAutosaveTimer();

    try {
      await this.saveLatestWorkout({
        showLoading: true
      });

    } catch (err: any) {
      this.workoutError.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo guardar el entrenamiento.'
      );
    }
  }


  private async persistWorkout(
    workout: Workout,
    options: {
      showLoading: boolean;
    } = {
      showLoading: true
    }
  ): Promise<Workout> {
    if (options.showLoading) {
      this.workoutLoading.set(true);
    }

    this.workoutError.set(null);

    try {
      const token = await this.auth.getAccessToken();

      if (!token) {
        throw new Error('Necesitas iniciar sesión.');
      }

      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`
      });

      return await new Promise<Workout>((resolve, reject) => {
        this.http
          .put<Workout>(
            `${this.apiUrl}/workouts/${workout.workoutId}`,
            workout,
            { headers }
          )
          .subscribe({
            next: resolve,
            error: reject
          });
      });

    } finally {
      if (options.showLoading) {
        this.workoutLoading.set(false);
      }
    }
  }


  private cloneWorkout(
    workout: Workout
  ): Workout {
    return JSON.parse(
      JSON.stringify(workout)
    ) as Workout;
  }


  private updateWorkoutHistory(
    workout: Workout
  ): void {
    const current =
      this.workoutHistory();

    if (
      current.some(
        item =>
          item.workoutId === workout.workoutId
      )
    ) {
      this.workoutHistory.set(
        current.map(item =>
          item.workoutId === workout.workoutId
            ? workout
            : item
        )
      );
      return;
    }

    this.workoutHistory.set([
      workout,
      ...current
    ]);
  }


  private removeWorkoutFromHistory(
    workoutId: string
  ): void {
    this.workoutHistory.set(
      this.workoutHistory()
        .filter(
          workout =>
            workout.workoutId !== workoutId
        )
    );
  }


  private scheduleAutosave(): void {
    if (this.destroyed) {
      return;
    }

    const workout =
      this.activeWorkout();

    if (
      !workout ||
      workout.status !== 'in_progress' ||
      this.finishingWorkout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    this.autosaveStatus.set('idle');

    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
    }

    this.autosaveTimer =
      setTimeout(
        () => {
          this.autosaveTimer = null;
          void this.runAutosave();
        },
        this.autosaveDelayMs
      );
  }


  private cancelAutosaveTimer(): void {
    if (!this.autosaveTimer) {
      return;
    }

    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
  }


  private async runAutosave():
    Promise<void> {

    if (
      this.destroyed ||
      this.finishingWorkout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    if (this.currentSave) {
      this.saveQueued = true;
      return;
    }

    try {
      await this.saveLatestWorkout({
        showLoading: false
      });

    } catch {
      // Autosave errors are surfaced through autosaveStatus/workoutError.
    }
  }


  private async saveLatestWorkout(
    options: {
      showLoading: boolean;
    }
  ): Promise<void> {

    while (this.currentSave) {
      this.saveQueued = true;

      try {
        await this.currentSave;
      } catch {
        // The latest state is still attempted below.
      }
    }

    const workout =
      this.activeWorkout();

    if (!workout) {
      return;
    }

    const snapshot =
      this.cloneWorkout(workout);

    const snapshotVersion =
      this.workoutEditVersion;

    this.saveQueued = false;
    this.autosaveStatus.set('saving');

    const save =
      this.persistWorkout(
        snapshot,
        options
      )
        .then(saved => {
          const current =
            this.activeWorkout();

          if (
            current &&
            current.workoutId === saved.workoutId &&
            !this.finishingWorkout &&
            !this.cancellingWorkout() &&
            this.workoutEditVersion === snapshotVersion
          ) {
            this.activeWorkout.set(saved);
            this.persistedEditVersion =
              snapshotVersion;
          }

          if (!this.cancellingWorkout()) {
            this.updateWorkoutHistory(saved);
          }

          if (
            this.workoutEditVersion === snapshotVersion
          ) {
            this.autosaveStatus.set('saved');
          }
        })
        .catch(error => {
          if (
            this.workoutEditVersion === snapshotVersion
          ) {
            this.autosaveStatus.set('error');
          }

          throw error;
        })
        .finally(() => {
          this.currentSave = null;

          if (
            this.saveQueued &&
            !this.destroyed &&
            !this.finishingWorkout &&
            !this.cancellingWorkout()
          ) {
            this.saveQueued = false;
            void this.runAutosave();
          }
        });

    this.currentSave = save;

    await save;
  }

  async finishWorkout(): Promise<void> {
    const workout = this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    if (
      this.workoutLoading() ||
      this.cancellingWorkout()
    ) {
      return;
    }

    this.clearSetTimer();
    this.clearRestTimer();
    this.unilateralExecution.set(null);

    this.cancelAutosaveTimer();
    this.finishingWorkout = true;

    if (this.currentSave) {
      try {
        await this.currentSave;
      } catch {
        // Finalization below persists the current in-memory workout.
      }
    }

    const currentWorkout =
      this.activeWorkout();

    if (!currentWorkout) {
      this.finishingWorkout = false;
      return;
    }

    const finishedWorkout: Workout = {
      ...currentWorkout,
      status: 'finished',
      finishedAt: new Date().toISOString()
    };

    try {
      const saved =
        await this.persistWorkout(
          finishedWorkout,
          {
            showLoading: true
          }
        );

      const records =
        detectPersonalRecords({
          currentWorkout: saved,
          previousWorkouts:
            this.workoutHistory(),
          exercises:
            this.activeSession()
              ?.exercises ?? []
        });

      this.workoutFinishSummary.set({
        records,
        groups:
          this.groupPersonalRecords(
            records
          )
      });

      void this.telemetry.track({
        event_name:
          'workout_completed',
        route:
          '/entrenar',
        metadata: {}
      });

      this.updateWorkoutHistory(saved);
      this.persistedEditVersion =
        this.workoutEditVersion;
      this.autosaveStatus.set('saved');

      this.activeWorkout.set(null);
      this.activeSession.set(null);
      this.workoutSessionState
        .setIdle();
      this.expandedExerciseId.set(null);
      this.expandedSetKey.set(null);
      this.cancelConfirmationOpen.set(false);

    } catch (err: any) {
      this.workoutError.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo finalizar el entrenamiento.'
      );
    } finally {
      this.finishingWorkout = false;
    }
  }


  private groupPersonalRecords(
    records: PersonalRecord[]
  ): PersonalRecordGroup[] {
    const groups =
      new Map<string, PersonalRecordGroup>();

    for (const record of records) {
      const current =
        groups.get(record.exerciseId);

      if (current) {
        current.records.push(record);
        continue;
      }

      groups.set(record.exerciseId, {
        exerciseId: record.exerciseId,
        exerciseName: record.exerciseName,
        records: [record]
      });
    }

    return [...groups.values()];
  }


  openCancelWorkoutConfirmation(): void {
    if (
      !this.activeWorkout() ||
      this.workoutLoading() ||
      this.cancellingWorkout()
    ) {
      return;
    }

    this.workoutError.set(null);
    this.cancelConfirmationOpen.set(true);
  }


  closeCancelWorkoutConfirmation(): void {
    if (this.cancellingWorkout()) {
      return;
    }

    this.cancelConfirmationOpen.set(false);
  }


  async cancelWorkout(): Promise<void> {
    const workout =
      this.activeWorkout();

    if (
      !workout ||
      this.cancellingWorkout()
    ) {
      return;
    }

    this.cancellingWorkout.set(true);
    this.workoutLoading.set(true);
    this.workoutError.set(null);
    this.cancelAutosaveTimer();
    this.saveQueued = false;
    this.clearSetTimer();
    this.clearRestTimer();
    this.unilateralExecution.set(null);

    if (this.currentSave) {
      try {
        await this.currentSave;
      } catch {
        // Cancellation removes the transient workout; stale autosave failure is ignored.
      }
    }

    const currentWorkout =
      this.activeWorkout();

    if (!currentWorkout) {
      this.cancelConfirmationOpen.set(false);
      this.cancellingWorkout.set(false);
      this.workoutLoading.set(false);
      return;
    }

    try {
      const token =
        await this.auth.getAccessToken();

      if (!token) {
        throw new Error('Necesitas iniciar sesión.');
      }

      const headers =
        new HttpHeaders({
          Authorization:
            `Bearer ${token}`
        });

      await new Promise<void>((resolve, reject) => {
        this.http
          .delete<void>(
            `${this.apiUrl}/workouts/${currentWorkout.workoutId}`,
            { headers }
          )
          .subscribe({
            next: () => resolve(),
            error: reject
          });
      });

      this.removeWorkoutFromHistory(
        currentWorkout.workoutId
      );
      this.activeWorkout.set(null);
      this.activeSession.set(null);
      this.workoutSessionState
        .setIdle();
      this.expandedExerciseId.set(null);
      this.expandedSetKey.set(null);
      this.cancelConfirmationOpen.set(false);
      this.autosaveStatus.set('idle');
      this.workoutEditVersion = 0;
      this.persistedEditVersion = 0;
      this.saveQueued = false;

    } catch (err: any) {
      this.workoutError.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo cancelar el entrenamiento.'
      );
    } finally {
      this.cancellingWorkout.set(false);
      this.workoutLoading.set(false);
    }
  }
}
