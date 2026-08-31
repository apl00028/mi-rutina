import {
  Component,
  Inject,
  InjectionToken,
  OnInit,
  signal
} from '@angular/core';

import {
  DatePipe,
  DecimalPipe
} from '@angular/common';

import {
  ActivatedRoute,
  Router
} from '@angular/router';

import {
  HttpClient,
  HttpHeaders
} from '@angular/common/http';

import {
  firstValueFrom
} from 'rxjs';

import {
  Capacitor
} from '@capacitor/core';

import {
  HealthConnect
} from '../../core/health-connect.plugin';

import {
  AuthService
} from '../../core/auth.service';

import {
  environment
} from '../../../environments/environment';

import type {
  HealthConnectRunningMetrics,
  HealthConnectRunningMetricSession,
  HealthConnectSwimmingMetrics,
  HealthConnectSwimmingMetricSession
} from '../../core/health-connect.plugin';

import {
  deriveSwimmingMetrics
} from '../../features/swimming/domain/swimming-metrics';

import {
  compareSwimmingSessions
} from '../../features/swimming/domain/swimming-analysis';

import {
  analyseSwimmingLengths
} from '../../features/swimming/domain/swimming-session-detail-analysis';

import {
  evaluateSwimmingSessions
} from '../../features/swimming/domain/swimming-coach-analysis';

import {
  swimmingRoutineDistance
} from '../../features/swimming/domain/swimming-routine';

import type {
  SwimmingRoutine
} from '../../features/swimming/domain/swimming-routine';

import {
  runningRoutineDistance
} from '../../features/running/domain/running-routine';

import type {
  RunningRoutine
} from '../../features/running/domain/running-routine';

import type {
  SwimmingCoachAssessment
} from '../../features/swimming/domain/swimming-coach-analysis';

import type {
  SwimmingDetailedSessionAnalysis
} from '../../features/swimming/domain/swimming-session-detail-analysis';

import type {
  SwimmingSessionComparison
} from '../../features/swimming/domain/swimming-analysis';

import {
  TrainingNavigation
} from '../../features/training/components/training-navigation/training-navigation';

import type {
  TrainingDiscipline,
  TrainingNavigationTab
} from '../../features/training/components/training-navigation/training-navigation';

export interface SwimmingFitImportResponse {
  start_time?: string;

  pool_length_meters?: number;
  distance_meters?: number;

  total_elapsed_time_seconds?: number;
  total_timer_time_seconds?: number;
  total_moving_time_seconds?: number;

  heart_rate_average_bpm?: number;
  heart_rate_max_bpm?: number;

  total_strokes?: number;
  average_stroke_rate_spm?: number;

  average_speed_meters_per_second?: number;
  max_speed_meters_per_second?: number;
  average_pace_seconds_per_100m?: number;

  total_calories?: number;
  aerobic_training_effect?: number;
  anaerobic_training_effect?: number;

  lengths: Array<{
    start_time?: string;
    duration_seconds?: number;
    distance_meters?: number;
    total_strokes?: number;
    average_stroke_rate_spm?: number;
    swim_stroke?: string;
    length_type?: string;
  }>;
}


interface StoredSwimmingRoutine {
  routineId: string;
  schemaVersion: string;
  revision: number;
  discipline?: string;
  name?: string;

  sessions: Array<{
    sessionId: string;
    date?: string;
    title?: string;
    name?: string;
    objective?: string;
    poolLengthMeters?: number;
    estimatedDurationMinutes?: number;
    blocks?: SwimmingRoutine['blocks'];
    technicalFocus?: string[];
  }>;
}


interface StoredRunningRoutine {
  routineId: string;
  schemaVersion: string;
  revision: number;
  discipline?: string;
  name?: string;

  sessions: Array<{
    sessionId: string;
    date?: string;
    title?: string;
    name?: string;
    objective?: string;
    estimatedDurationMinutes?: number;
    blocks?: RunningRoutine['blocks'];
    notes?: string;
  }>;
}


export interface SwimmingSessionView {
  startTime: string;

  distanceMeters: number | null;
  durationSeconds: number;

  lengths: number | null;

  totalStrokes: number | null;
  strokesPerLength: number | null;
  metersPerStroke: number | null;

  elapsedPaceSecondsPer100m:
    number | null;

  heartRateAverageBpm: number | null;
  heartRateMaxBpm: number | null;

  movingTimeSeconds?: number | null;
  restTimeSeconds?: number | null;

  averagePaceSecondsPer100m?: number | null;
  averageStrokeRateSpm?: number | null;

  activeLengths?: number | null;
  totalLengthRecords?: number | null;

  totalCalories?: number | null;
  aerobicTrainingEffect?: number | null;
  anaerobicTrainingEffect?: number | null;

  fitEnriched?: boolean;

  detailedAnalysis?:
    SwimmingDetailedSessionAnalysis | null;
}


interface EnduranceHealthConnect {
  readGarminSwimmingMetrics():
    Promise<HealthConnectSwimmingMetrics>;

  readGarminRunningMetrics():
    Promise<HealthConnectRunningMetrics>;
}


export const ENDURANCE_HEALTH_CONNECT =
  new InjectionToken<EnduranceHealthConnect>(
    'ENDURANCE_HEALTH_CONNECT',
    {
      providedIn: 'root',
      factory: () => HealthConnect
    }
  );

const RUNNING_EXERCISE_TYPE = 33;
const RUNNING_TREADMILL_EXERCISE_TYPE = 34;


@Component({
  selector: 'app-endurance',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    TrainingNavigation
  ],
  templateUrl: './endurance.html',
  styleUrl: './endurance.scss'
})
export class Endurance
  implements OnInit {

  private readonly apiUrl =
    environment.apiUrl;

  discipline =
    signal<TrainingDiscipline>(
      'running'
    );


  readonly swimmingTabs:
    TrainingNavigationTab[] = [
      {
        id: 'session',
        label: 'Sesión'
      },
      {
        id: 'routine',
        label: 'Rutina'
      },
      {
        id: 'analytics',
        label: 'Análisis'
      }
    ];


  readonly runningTabs:
    TrainingNavigationTab[] = [
      {
        id: 'session',
        label: 'Sesión'
      },
      {
        id: 'routine',
        label: 'Rutina'
      },
      {
        id: 'analytics',
        label: 'Análisis'
      }
    ];

  readonly runningLoading =
    signal(false);

  readonly runningError =
    signal<string | null>(null);

  readonly runningSessions =
    signal<HealthConnectRunningMetricSession[]>(
      []
    );

  readonly selectedRunningSessionIndex =
    signal(0);

  readonly runningView =
    signal<
      'session'
      | 'routine'
      | 'analytics'
    >('session');

  readonly runningRoutine =
    signal<RunningRoutine | null>(
      null
    );

  readonly activeRunningRoutineRecord =
    signal<StoredRunningRoutine | null>(
      null
    );

  readonly runningRoutineLoading =
    signal(false);

  readonly runningRoutineError =
    signal<string | null>(
      null
    );

  readonly runningRoutineDraft =
    signal<RunningRoutine | null>(
      null
    );

  readonly runningRoutineEditing =
    signal(false);

  readonly runningRoutineSaving =
    signal(false);

  readonly runningRoutineSaveError =
    signal<string | null>(
      null
    );

  readonly runningRoutineSaveMessage =
    signal<string | null>(
      null
    );


  readonly runningRoutineImportText =
    signal('');






  readonly swimmingLoading =
    signal(false);

  readonly swimmingError =
    signal<string | null>(
      null
    );

  readonly swimmingSessions =
    signal<SwimmingSessionView[]>(
      []
    );

  readonly selectedSwimmingSessionIndex =
    signal(0);

  readonly comparisonSwimmingSessionAIndex =
    signal(0);

  readonly comparisonSwimmingSessionBIndex =
    signal(1);

  readonly swimmingView =
    signal<
      'session'
      | 'routine'
      | 'analytics'
    >(
      'session'
    );

  readonly swimmingRoutine =
    signal<SwimmingRoutine | null>(
      null
    );

  readonly activeSwimmingRoutineRecord =
    signal<StoredSwimmingRoutine | null>(
      null
    );

  readonly swimmingRoutineDraft =
    signal<SwimmingRoutine | null>(
      null
    );

  readonly swimmingRoutineEditing =
    signal(false);

  readonly swimmingRoutineSaving =
    signal(false);

  readonly swimmingRoutineSaveError =
    signal<string | null>(
      null
    );

  readonly swimmingRoutineSaveMessage =
    signal<string | null>(
      null
    );

  readonly swimmingRoutineLoading =
    signal(false);

  readonly swimmingRoutineError =
    signal<string | null>(
      null
    );


  swimmingRoutineTotalDistance():
    number {

    const routine =
      this.swimmingRoutine();

    return routine
      ? swimmingRoutineDistance(
          routine
        )
      : 0;
  }


  runningRoutineTotalDistance():
    number {

    const routine =
      this.runningRoutine();

    return routine
      ? runningRoutineDistance(
          routine
        )
      : 0;
  }


  readonly swimmingRequiresAndroid =
    signal(false);

  readonly swimmingFitImporting =
    signal(false);

  readonly swimmingFitImportError =
    signal<string | null>(
      null
    );

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private auth: AuthService,
    @Inject(ENDURANCE_HEALTH_CONNECT)
    private healthConnect:
      EnduranceHealthConnect
  ) {}


  ngOnInit(): void {

    const discipline =
      this.route.snapshot.data[
        'discipline'
      ];

    if (
      discipline === 'swimming' ||
      discipline === 'cycling' ||
      discipline === 'running'
    ) {
      this.discipline.set(
        discipline
      );
    }

    if (
      this.discipline() ===
      'swimming'
    ) {
      void this.loadSwimming();
      void this.loadActiveSwimmingRoutine();
    } else if (
      this.discipline() ===
      'running'
    ) {
      void this.loadRunning();
      void this.loadActiveRunningRoutine();
    }
  }


  changeTrainingDiscipline(
    discipline: string
  ): void {

    const routes:
      Record<string, string> = {
        strength: '/entrenar',
        swimming:
          '/entrenar/natacion',
        cycling:
          '/entrenar/bicicleta',
        running:
          '/entrenar/correr'
      };

    const target =
      routes[discipline];

    if (target) {
      void this.router.navigateByUrl(
        target
      );
    }
  }


  private async loadActiveSwimmingRoutine():
    Promise<void> {

    if (this.swimmingRoutineLoading()) {
      return;
    }

    this.swimmingRoutineLoading.set(true);
    this.swimmingRoutineError.set(null);

    try {
      const token =
        await this.auth.getAccessToken();

      if (!token) {
        throw new Error(
          'Necesitas iniciar sesión.'
        );
      }

      const headers =
        new HttpHeaders({
          Authorization:
            `Bearer ${token}`
        });

      const stored =
        await firstValueFrom(
          this.http.get<StoredSwimmingRoutine>(
            `${this.apiUrl}/routines/active`,
            {
              headers,
              params: {
                discipline: 'swimming'
              }
            }
          )
        );

      const session =
        stored.sessions?.[0];

      this.activeSwimmingRoutineRecord.set(
        stored
      );

      if (!session) {
        throw new Error(
          'La rutina activa de natación no contiene ninguna sesión.'
        );
      }

      this.swimmingRoutine.set({
        id: session.sessionId,
        date: session.date ?? '',
        title:
          session.title
          ?? session.name
          ?? stored.name
          ?? 'Rutina de natación',
        objective:
          session.objective
          ?? '',
        poolLengthMeters:
          session.poolLengthMeters
          ?? 25,
        estimatedDurationMinutes:
          session.estimatedDurationMinutes
          ?? 0,
        blocks:
          session.blocks
          ?? [],
        technicalFocus:
          session.technicalFocus
          ?? []
      });

    } catch (error: any) {

      this.swimmingRoutine.set(null);
      this.activeSwimmingRoutineRecord.set(
        null
      );

      if (error?.status === 404) {
        return;
      }

      this.swimmingRoutineError.set(
        error?.error?.detail
        ?? error?.message
        ?? 'No se pudo cargar la rutina de natación.'
      );

    } finally {
      this.swimmingRoutineLoading.set(false);
    }
  }


  private async loadActiveRunningRoutine():
    Promise<void> {

    if (this.runningRoutineLoading()) {
      return;
    }

    this.runningRoutineLoading.set(true);
    this.runningRoutineError.set(null);

    try {
      const token =
        await this.auth.getAccessToken();

      if (!token) {
        throw new Error(
          'Necesitas iniciar sesión.'
        );
      }

      const headers =
        new HttpHeaders({
          Authorization:
            `Bearer ${token}`
        });

      const stored =
        await firstValueFrom(
          this.http.get<StoredRunningRoutine>(
            `${this.apiUrl}/routines/active`,
            {
              headers,
              params: {
                discipline: 'running'
              }
            }
          )
        );

      const session =
        stored.sessions?.[0];

      this.activeRunningRoutineRecord.set(
        stored
      );

      if (!session) {
        throw new Error(
          'La rutina activa de carrera no contiene ninguna sesión.'
        );
      }

      this.runningRoutine.set({
        id: session.sessionId,
        date: session.date ?? '',
        title:
          session.title
          ?? session.name
          ?? stored.name
          ?? 'Rutina de carrera',
        objective:
          session.objective
          ?? '',
        estimatedDurationMinutes:
          session.estimatedDurationMinutes
          ?? 0,
        blocks:
          session.blocks
          ?? [],
        notes:
        session.notes
        ?? ''
      });

    } catch (error: any) {

      this.runningRoutine.set(null);
      this.activeRunningRoutineRecord.set(
        null
      );

      if (error?.status === 404) {
        return;
      }

      this.runningRoutineError.set(
        error?.error?.detail
        ?? error?.message
        ?? 'No se pudo cargar la rutina de carrera.'
      );

    } finally {
      this.runningRoutineLoading.set(false);
    }
  }


  updateRunningRoutineImportText(
    value: string
  ): void {

    this.runningRoutineImportText.set(
      value
    );

    this.runningRoutineSaveError.set(
      null
    );
  }


  async importRunningRoutineJson():
    Promise<void> {

    const raw =
      this.runningRoutineImportText()
        .trim();

    if (!raw) {

      this.runningRoutineSaveError.set(
        'Pega primero una rutina de Health OS.'
      );

      return;
    }


    let routine:
      StoredRunningRoutine;


    try {

      routine =
        JSON.parse(raw) as StoredRunningRoutine;

    } catch {

      this.runningRoutineSaveError.set(
        'El JSON de la rutina no es válido.'
      );

      return;
    }


    if (
      !routine
      || typeof routine !== 'object'
      || !routine.routineId
      || !routine.schemaVersion
      || !Number.isFinite(
        routine.revision
      )
      || routine.discipline !==
        'running'
      || !Array.isArray(
        routine.sessions
      )
      || routine.sessions.length === 0
    ) {

      this.runningRoutineSaveError.set(
        'La rutina no tiene el formato esperado para carrera.'
      );

      return;
    }


    const session =
      routine.sessions[0];


    if (
      !session
      || !session.sessionId
      || !session.title
      || !Array.isArray(
        session.blocks
      )
      || session.blocks.length === 0
    ) {

      this.runningRoutineSaveError.set(
        'La rutina necesita al menos una sesión de carrera con bloques.'
      );

      return;
    }


    const invalidBlock =
      session.blocks.some(
        block =>
          !block
          || !block.id
          || !block.title
          || !Array.isArray(
            block.sets
          )
          || block.sets.length === 0
      );


    if (invalidBlock) {

      this.runningRoutineSaveError.set(
        'Cada bloque debe contener al menos una prescripción.'
      );

      return;
    }


    const invalidSet =
      session.blocks.some(
        block =>
          block.sets.some(
            set => {

              if (
                !set
                || !Number.isFinite(
                  set.repetitions
                )
                || set.repetitions <= 0
              ) {
                return true;
              }


              if (
                set.targetType ===
                  'duration'
              ) {

                return (
                  set.durationSeconds == null
                  || !Number.isFinite(
                    set.durationSeconds
                  )
                  || set.durationSeconds <= 0
                );
              }


              if (
                set.targetType ===
                  'distance'
              ) {

                return (
                  set.distanceMeters == null
                  || !Number.isFinite(
                    set.distanceMeters
                  )
                  || set.distanceMeters <= 0
                );
              }


              return true;
            }
          )
      );


    if (invalidSet) {

      this.runningRoutineSaveError.set(
        'Hay una prescripción de carrera no válida.'
      );

      return;
    }


    this.runningRoutineSaving.set(
      true
    );

    this.runningRoutineSaveError.set(
      null
    );

    this.runningRoutineSaveMessage.set(
      null
    );


    try {

      const token =
        await this.auth.getAccessToken();


      if (!token) {

        throw new Error(
          'Necesitas iniciar sesión.'
        );
      }


      const headers =
        new HttpHeaders({
          Authorization:
            `Bearer ${token}`,
          'Content-Type':
            'application/json'
        });


      const created =
        await firstValueFrom(
          this.http.post<StoredRunningRoutine>(
            `${this.apiUrl}/routines`,
            routine,
            { headers }
          )
        );


      const activated =
        await firstValueFrom(
          this.http.put<StoredRunningRoutine>(
            `${this.apiUrl}/routines/${
              encodeURIComponent(
                created.routineId
              )
            }/activate`,
            {},
            { headers }
          )
        );


      const activatedSession =
        activated.sessions[0];


      if (!activatedSession) {

        throw new Error(
          'La rutina importada no contiene ninguna sesión.'
        );
      }


      this.activeRunningRoutineRecord.set(
        activated
      );


      this.runningRoutine.set({

        id:
          activatedSession.sessionId,

        date:
          activatedSession.date
          ?? '',

        title:
          activatedSession.title
          ?? activatedSession.name
          ?? activated.name
          ?? 'Rutina de carrera',

        objective:
          activatedSession.objective
          ?? '',

        estimatedDurationMinutes:
          activatedSession
            .estimatedDurationMinutes
          ?? 0,

        blocks:
          activatedSession.blocks
          ?? [],

        notes:
          activatedSession.notes
          ?? ''
      });


      this.runningRoutineImportText.set(
        ''
      );


      this.runningRoutineSaveMessage.set(
        'Rutina de Health OS importada y activada.'
      );


    } catch (error: any) {

      this.runningRoutineSaveError.set(
        error?.error?.detail
        ?? error?.message
        ?? 'No se pudo importar la rutina de carrera.'
      );

    } finally {

      this.runningRoutineSaving.set(
        false
      );
    }
  }


  async createDefaultRunningRoutine():
    Promise<void> {

    this.runningRoutineSaving.set(true);

    this.runningRoutineSaveError.set(
      null
    );

    this.runningRoutineSaveMessage.set(
      null
    );

    try {

      const token =
        await this.auth.getAccessToken();

      if (!token) {
        throw new Error(
          'Necesitas iniciar sesión.'
        );
      }

      const headers =
        new HttpHeaders({
          Authorization:
            `Bearer ${token}`,
          'Content-Type':
            'application/json'
        });

      const routine:
        StoredRunningRoutine = {

          routineId:
            `running-${Date.now()}`,

          schemaVersion:
            '4.2',

          revision:
            1,

          discipline:
            'running',

          name:
            'Rodaje aeróbico controlado',

          sessions: [
            {
              sessionId:
                'running-session-1',

              date:
                new Date()
                  .toISOString()
                  .slice(0, 10),

              title:
                'Rodaje aeróbico controlado',

              objective:
                'Acumular carrera continua manteniendo control de intensidad.',

              estimatedDurationMinutes:
                40,

              blocks: [
                {
                  id:
                    'warmup',

                  type:
                    'warmup',

                  title:
                    'Calentamiento',

                  sets: [
                    {
                      repetitions:
                        1,

                      targetType:
                        'duration',

                      durationSeconds:
                        600,

                      intensityMode:
                        'heartRateMax',

                      heartRateMaxBpm:
                        145,

                      recoverySeconds:
                        0
                    }
                  ]
                },

                {
                  id:
                    'main',

                  type:
                    'main',

                  title:
                    'Bloque principal',

                  sets: [
                    {
                      repetitions:
                        1,

                      targetType:
                        'duration',

                      durationSeconds:
                        1500,

                      intensityMode:
                        'heartRateMax',

                      heartRateMaxBpm:
                        155,

                      recoverySeconds:
                        0,

                      instruction:
                        'Mantener esfuerzo cómodo y estable.'
                    }
                  ]
                },

                {
                  id:
                    'cooldown',

                  type:
                    'cooldown',

                  title:
                    'Vuelta a la calma',

                  sets: [
                    {
                      repetitions:
                        1,

                      targetType:
                        'duration',

                      durationSeconds:
                        300,

                      intensityMode:
                        'free',

                      recoverySeconds:
                        0
                    }
                  ]
                }
              ],

              notes:
                'No perseguir ritmo. Si para respetar el límite de FC hay que reducir ritmo, se reduce.'
            }
          ]
        };


      const created =
        await firstValueFrom(
          this.http.post<StoredRunningRoutine>(
            `${this.apiUrl}/routines`,
            routine,
            { headers }
          )
        );


      const activated =
        await firstValueFrom(
          this.http.put<StoredRunningRoutine>(
            `${this.apiUrl}/routines/${
              encodeURIComponent(
                created.routineId
              )
            }/activate`,
            {},
            { headers }
          )
        );


      this.activeRunningRoutineRecord.set(
        activated
      );


      const session =
        activated.sessions[0];

      if (!session) {
        throw new Error(
          'La rutina creada no contiene ninguna sesión.'
        );
      }


      this.runningRoutine.set({
        id:
          session.sessionId,

        date:
          session.date
          ?? '',

        title:
          session.title
          ?? session.name
          ?? activated.name
          ?? 'Rutina de carrera',

        objective:
          session.objective
          ?? '',

        estimatedDurationMinutes:
          session.estimatedDurationMinutes
          ?? 0,

        blocks:
          session.blocks
          ?? [],

        notes:
          session.notes
          ?? ''
      });


      this.runningRoutineSaveMessage.set(
        'Rutina de carrera creada y activada.'
      );


    } catch (error: any) {

      this.runningRoutineSaveError.set(
        error?.error?.detail
        ?? error?.message
        ?? 'No se pudo crear la rutina de carrera.'
      );

    } finally {

      this.runningRoutineSaving.set(
        false
      );
    }
  }


  startEditingRunningRoutine():
    void {

    const routine =
      this.runningRoutine();

    if (!routine) {
      return;
    }

    this.runningRoutineDraft.set(
      structuredClone(routine)
    );

    this.runningRoutineSaveError.set(
      null
    );

    this.runningRoutineSaveMessage.set(
      null
    );

    this.runningRoutineEditing.set(true);
  }


  cancelEditingRunningRoutine():
    void {

    this.runningRoutineDraft.set(null);

    this.runningRoutineEditing.set(
      false
    );

    this.runningRoutineSaveError.set(
      null
    );
  }


  updateRunningRoutineField(
    field:
      | 'title'
      | 'objective'
      | 'date'
      | 'estimatedDurationMinutes'
      | 'notes',
    value: string
  ): void {

    const draft =
      this.runningRoutineDraft();

    if (!draft) {
      return;
    }

    if (
      field ===
        'estimatedDurationMinutes'
    ) {
      const numeric =
        Number(value);

      this.runningRoutineDraft.set({
        ...draft,
        [field]:
          Number.isFinite(numeric)
            ? Math.max(0, numeric)
            : 0
      });

      return;
    }

    this.runningRoutineDraft.set({
      ...draft,
      [field]: value
    });
  }


  updateRunningRoutineBlockTitle(
    blockIndex: number,
    value: string
  ): void {

    const draft =
      this.runningRoutineDraft();

    if (!draft) {
      return;
    }

    const blocks =
      structuredClone(draft.blocks);

    const block =
      blocks[blockIndex];

    if (!block) {
      return;
    }

    block.title = value;

    this.runningRoutineDraft.set({
      ...draft,
      blocks
    });
  }


  updateRunningRoutineSetField(
    blockIndex: number,
    setIndex: number,
    field:
      | 'repetitions'
      | 'targetType'
      | 'durationSeconds'
      | 'distanceMeters'
      | 'intensityMode'
      | 'heartRateMaxBpm'
      | 'heartRateMinBpm'
      | 'heartRateMaxRangeBpm'
      | 'rpeMin'
      | 'rpeMax'
      | 'paceMinSecondsPerKm'
      | 'paceMaxSecondsPerKm'
      | 'recoverySeconds'
      | 'instruction',
    value: string
  ): void {

    const draft =
      this.runningRoutineDraft();

    if (!draft) {
      return;
    }

    const blocks =
      structuredClone(draft.blocks);

    const set =
      blocks[blockIndex]
        ?.sets[setIndex];

    if (!set) {
      return;
    }

    const numericFields = [
      'repetitions',
      'durationSeconds',
      'distanceMeters',
      'heartRateMaxBpm',
      'heartRateMinBpm',
      'heartRateMaxRangeBpm',
      'rpeMin',
      'rpeMax',
      'paceMinSecondsPerKm',
      'paceMaxSecondsPerKm',
      'recoverySeconds'
    ];

    if (numericFields.includes(field)) {

      const numeric =
        Number(value);

      (set as any)[field] =
        Number.isFinite(numeric)
          ? Math.max(0, numeric)
          : 0;

    } else {

      (set as any)[field] =
        value;
    }


    if (field === 'targetType') {

      if (value === 'duration') {

        delete set.distanceMeters;

        if (
          set.durationSeconds == null
        ) {
          set.durationSeconds = 600;
        }

      } else if (
        value === 'distance'
      ) {

        delete set.durationSeconds;

        if (
          set.distanceMeters == null
        ) {
          set.distanceMeters = 1000;
        }
      }
    }


    if (field === 'intensityMode') {

      delete set.heartRateMaxBpm;
      delete set.heartRateMinBpm;
      delete set.heartRateMaxRangeBpm;

      delete set.rpeMin;
      delete set.rpeMax;

      delete set.paceMinSecondsPerKm;
      delete set.paceMaxSecondsPerKm;
    }


    this.runningRoutineDraft.set({
      ...draft,
      blocks
    });
  }


  addRunningRoutineSet(
    blockIndex: number
  ): void {

    const draft =
      this.runningRoutineDraft();

    if (!draft) {
      return;
    }

    const blocks =
      structuredClone(draft.blocks);

    const block =
      blocks[blockIndex];

    if (!block) {
      return;
    }

    block.sets.push({
      repetitions: 1,

      targetType: 'duration',

      durationSeconds: 600,

      intensityMode: 'free',

      recoverySeconds: 0,

      instruction: ''
    });

    this.runningRoutineDraft.set({
      ...draft,
      blocks
    });
  }


  removeRunningRoutineSet(
    blockIndex: number,
    setIndex: number
  ): void {

    const draft =
      this.runningRoutineDraft();

    if (!draft) {
      return;
    }

    const blocks =
      structuredClone(draft.blocks);

    const block =
      blocks[blockIndex];

    if (!block) {
      return;
    }

    block.sets.splice(
      setIndex,
      1
    );

    this.runningRoutineDraft.set({
      ...draft,
      blocks
    });
  }


  async saveRunningRoutine():
    Promise<void> {

    const draft =
      this.runningRoutineDraft();

    const stored =
      this.activeRunningRoutineRecord();

    if (!draft || !stored) {
      return;
    }


    if (!draft.title.trim()) {

      this.runningRoutineSaveError.set(
        'La rutina necesita un título.'
      );

      return;
    }


    if (
      !Number.isFinite(
        draft.estimatedDurationMinutes
      )
      || draft.estimatedDurationMinutes < 0
    ) {

      this.runningRoutineSaveError.set(
        'La duración estimada no es válida.'
      );

      return;
    }


    if (
      draft.blocks.length === 0
      || draft.blocks.some(
        block =>
          block.sets.length === 0
      )
    ) {

      this.runningRoutineSaveError.set(
        'Cada bloque debe contener al menos una serie.'
      );

      return;
    }


    const invalidSet =
      draft.blocks.some(
        block =>
          block.sets.some(
            set => {

              if (
                !Number.isFinite(
                  set.repetitions
                )
                || set.repetitions <= 0
              ) {
                return true;
              }


              const recovery =
                set.recoverySeconds
                ?? 0;

              if (
                !Number.isFinite(recovery)
                || recovery < 0
              ) {
                return true;
              }


              if (
                set.targetType ===
                  'duration'
              ) {

                return (
                  set.durationSeconds == null
                  || !Number.isFinite(
                    set.durationSeconds
                  )
                  || set.durationSeconds <= 0
                );
              }


              return (
                set.distanceMeters == null
                || !Number.isFinite(
                  set.distanceMeters
                )
                || set.distanceMeters <= 0
              );
            }
          )
      );


    if (invalidSet) {

      this.runningRoutineSaveError.set(
        'Las series necesitan repeticiones y duración o distancia mayores que 0.'
      );

      return;
    }


    this.runningRoutineSaving.set(true);

    this.runningRoutineSaveError.set(
      null
    );

    this.runningRoutineSaveMessage.set(
      null
    );


    try {

      const token =
        await this.auth.getAccessToken();


      if (!token) {

        throw new Error(
          'Necesitas iniciar sesión.'
        );
      }


      const headers =
        new HttpHeaders({
          Authorization:
            `Bearer ${token}`,
          'Content-Type':
            'application/json'
        });


      const session =
        stored.sessions[0];


      if (!session) {

        throw new Error(
          'La rutina activa no contiene ninguna sesión.'
        );
      }


      const payload:
        StoredRunningRoutine = {

          ...stored,

          discipline: 'running',

          revision:
            stored.revision + 1,

          name:
            draft.title,

          sessions: [
            {
              ...session,

              sessionId:
                draft.id,

              date:
                draft.date,

              title:
                draft.title,

              objective:
                draft.objective,

              estimatedDurationMinutes:
                draft.estimatedDurationMinutes,

              blocks:
                draft.blocks,

              notes:
                draft.notes
            },

            ...stored.sessions.slice(1)
          ]
        };


      const saved =
        await firstValueFrom(
          this.http.put<StoredRunningRoutine>(
            `${this.apiUrl}/routines/${
              encodeURIComponent(
                stored.routineId
              )
            }`,
            payload,
            { headers }
          )
        );


      this.activeRunningRoutineRecord.set(
        saved
      );

      this.runningRoutine.set(
        structuredClone(draft)
      );

      this.runningRoutineDraft.set(
        null
      );

      this.runningRoutineEditing.set(
        false
      );

      this.runningRoutineSaveMessage.set(
        'Rutina de carrera guardada.'
      );


    } catch (error: any) {

      this.runningRoutineSaveError.set(
        error?.error?.detail
        ?? error?.message
        ?? 'No se pudo guardar la rutina de carrera.'
      );

    } finally {

      this.runningRoutineSaving.set(
        false
      );
    }
  }


  async loadRunning(): Promise<void> {

    if (this.runningLoading()) {
      return;
    }

    this.runningLoading.set(true);
    this.runningError.set(null);

    try {
      const result =
        await this.healthConnect
          .readGarminRunningMetrics();

      const sessions = [
        ...result.sessions
      ].sort(
        (left, right) =>
          new Date(
            right.startTime
          ).getTime()
          -
          new Date(
            left.startTime
          ).getTime()
      );

      this.runningSessions.set(
        sessions
      );

      this.selectedRunningSessionIndex.set(
        0
      );

    } catch (error: any) {
      this.runningError.set(
        error?.message
        ?? 'No se pudieron cargar las sesiones de carrera.'
      );

    } finally {
      this.runningLoading.set(false);
    }
  }


  startEditingSwimmingRoutine():
    void {

    const routine =
      this.swimmingRoutine();

    if (!routine) {
      return;
    }

    this.swimmingRoutineDraft.set(
      structuredClone(routine)
    );

    this.swimmingRoutineSaveError.set(
      null
    );
    this.swimmingRoutineSaveMessage.set(
      null
    );
    this.swimmingRoutineEditing.set(true);
  }


  cancelEditingSwimmingRoutine():
    void {

    this.swimmingRoutineDraft.set(null);
    this.swimmingRoutineEditing.set(false);
    this.swimmingRoutineSaveError.set(
      null
    );
  }


  updateSwimmingRoutineField(
    field:
      | 'title'
      | 'objective'
      | 'date'
      | 'poolLengthMeters'
      | 'estimatedDurationMinutes',
    value: string
  ): void {

    const draft =
      this.swimmingRoutineDraft();

    if (!draft) {
      return;
    }

    if (
      field === 'poolLengthMeters'
      || field ===
        'estimatedDurationMinutes'
    ) {
      const numeric =
        Number(value);

      this.swimmingRoutineDraft.set({
        ...draft,
        [field]:
          Number.isFinite(numeric)
            ? Math.max(0, numeric)
            : 0
      });

      return;
    }

    this.swimmingRoutineDraft.set({
      ...draft,
      [field]: value
    });
  }


  updateSwimmingRoutineBlockTitle(
    blockIndex: number,
    value: string
  ): void {

    const draft =
      this.swimmingRoutineDraft();

    if (!draft) {
      return;
    }

    const blocks =
      structuredClone(draft.blocks);

    const block =
      blocks[blockIndex];

    if (!block) {
      return;
    }

    block.title = value;

    this.swimmingRoutineDraft.set({
      ...draft,
      blocks
    });
  }


  updateSwimmingRoutineSetField(
    blockIndex: number,
    setIndex: number,
    field:
      | 'repetitions'
      | 'distanceMeters'
      | 'stroke'
      | 'workType'
      | 'intensity'
      | 'restSeconds'
      | 'instruction',
    value: string
  ): void {

    const draft =
      this.swimmingRoutineDraft();

    if (!draft) {
      return;
    }

    const blocks =
      structuredClone(draft.blocks);

    const set =
      blocks[blockIndex]
        ?.sets[setIndex];

    if (!set) {
      return;
    }

    if (
      field === 'repetitions'
      || field === 'distanceMeters'
      || field === 'restSeconds'
    ) {
      const numeric =
        Number(value);

      (set as any)[field] =
        Number.isFinite(numeric)
          ? Math.max(0, numeric)
          : 0;
    } else {
      (set as any)[field] = value;
    }

    this.swimmingRoutineDraft.set({
      ...draft,
      blocks
    });
  }


  addSwimmingRoutineSet(
    blockIndex: number
  ): void {

    const draft =
      this.swimmingRoutineDraft();

    if (!draft) {
      return;
    }

    const blocks =
      structuredClone(draft.blocks);

    const block =
      blocks[blockIndex];

    if (!block) {
      return;
    }

    block.sets.push({
      repetitions: 1,
      distanceMeters:
        draft.poolLengthMeters || 25,
      stroke: 'freestyle',
      workType: 'swim',
      intensity: 'easy',
      restSeconds: 20,
      instruction: ''
    });

    this.swimmingRoutineDraft.set({
      ...draft,
      blocks
    });
  }


  removeSwimmingRoutineSet(
    blockIndex: number,
    setIndex: number
  ): void {

    const draft =
      this.swimmingRoutineDraft();

    if (!draft) {
      return;
    }

    const blocks =
      structuredClone(draft.blocks);

    const block =
      blocks[blockIndex];

    if (!block) {
      return;
    }

    block.sets.splice(
      setIndex,
      1
    );

    this.swimmingRoutineDraft.set({
      ...draft,
      blocks
    });
  }


  updateSwimmingTechnicalFocus(
    index: number,
    value: string
  ): void {

    const draft =
      this.swimmingRoutineDraft();

    if (!draft) {
      return;
    }

    const technicalFocus = [
      ...draft.technicalFocus
    ];

    technicalFocus[index] =
      value;

    this.swimmingRoutineDraft.set({
      ...draft,
      technicalFocus
    });
  }


  addSwimmingTechnicalFocus():
    void {

    const draft =
      this.swimmingRoutineDraft();

    if (!draft) {
      return;
    }

    this.swimmingRoutineDraft.set({
      ...draft,
      technicalFocus: [
        ...draft.technicalFocus,
        ''
      ]
    });
  }


  removeSwimmingTechnicalFocus(
    index: number
  ): void {

    const draft =
      this.swimmingRoutineDraft();

    if (!draft) {
      return;
    }

    this.swimmingRoutineDraft.set({
      ...draft,
      technicalFocus:
        draft.technicalFocus.filter(
          (_, focusIndex) =>
            focusIndex !== index
        )
    });
  }


  async saveSwimmingRoutine():
    Promise<void> {

    const draft =
      this.swimmingRoutineDraft();

    const stored =
      this.activeSwimmingRoutineRecord();

    if (!draft || !stored) {
      return;
    }

    if (!draft.title.trim()) {
      this.swimmingRoutineSaveError.set(
        'La rutina necesita un título.'
      );
      return;
    }

    if (
      draft.poolLengthMeters <= 0
    ) {
      this.swimmingRoutineSaveError.set(
        'La longitud de piscina debe ser mayor que 0.'
      );
      return;
    }

    if (
      draft.blocks.length === 0
      || draft.blocks.some(
        block =>
          block.sets.length === 0
      )
    ) {
      this.swimmingRoutineSaveError.set(
        'Cada bloque debe contener al menos una serie.'
      );
      return;
    }

    if (
      draft.blocks.some(
        block =>
          block.sets.some(
            set =>
              !Number.isFinite(
                set.repetitions
              )
              || set.repetitions <= 0
              || !Number.isFinite(
                set.distanceMeters
              )
              || set.distanceMeters <= 0
              || !Number.isFinite(
                set.restSeconds
              )
              || set.restSeconds < 0
          )
      )
    ) {
      this.swimmingRoutineSaveError.set(
        'Las series necesitan repeticiones y distancia mayores que 0.'
      );
      return;
    }

    this.swimmingRoutineSaving.set(true);
    this.swimmingRoutineSaveError.set(
      null
    );
    this.swimmingRoutineSaveMessage.set(
      null
    );

    try {
      const token =
        await this.auth.getAccessToken();

      if (!token) {
        throw new Error(
          'Necesitas iniciar sesión.'
        );
      }

      const headers =
        new HttpHeaders({
          Authorization:
            `Bearer ${token}`,
          'Content-Type':
            'application/json'
        });

      const session =
        stored.sessions[0];

      if (!session) {
        throw new Error(
          'La rutina activa no contiene ninguna sesión.'
        );
      }

      const payload:
        StoredSwimmingRoutine = {
          ...stored,

          discipline: 'swimming',

          revision:
            stored.revision + 1,

          name:
            draft.title,

          sessions: [
            {
              ...session,

              sessionId:
                draft.id,

              date:
                draft.date,

              title:
                draft.title,

              objective:
                draft.objective,

              poolLengthMeters:
                draft.poolLengthMeters,

              estimatedDurationMinutes:
                draft.estimatedDurationMinutes,

              blocks:
                draft.blocks,

              technicalFocus:
                draft.technicalFocus
            },
            ...stored.sessions.slice(1)
          ]
        };

      const saved =
        await firstValueFrom(
          this.http.put<StoredSwimmingRoutine>(
            `${this.apiUrl}/routines/${
              encodeURIComponent(
                stored.routineId
              )
            }`,
            payload,
            { headers }
          )
        );

      this.activeSwimmingRoutineRecord.set(
        saved
      );

      this.swimmingRoutine.set(
        structuredClone(draft)
      );

      this.swimmingRoutineDraft.set(null);
      this.swimmingRoutineEditing.set(false);

      this.swimmingRoutineSaveMessage.set(
        'Rutina de natación guardada.'
      );

    } catch (error: any) {

      this.swimmingRoutineSaveError.set(
        error?.error?.detail
        ?? error?.message
        ?? 'No se pudo guardar la rutina de natación.'
      );

    } finally {

      this.swimmingRoutineSaving.set(false);
    }
  }


  async importSwimmingFit(
    event: Event
  ): Promise<void> {

    const input =
      event.target as HTMLInputElement;

    const file =
      input.files?.[0];

    if (!file) {
      return;
    }

    this.swimmingFitImportError.set(
      null
    );

    this.swimmingFitImporting.set(
      true
    );

    try {
      const token =
        await this.auth.getAccessToken();

      if (!token) {
        throw new Error(
          'Necesitas iniciar sesión.'
        );
      }

      const headers =
        new HttpHeaders({
          Authorization:
            `Bearer ${token}`
        });

      const formData =
        new FormData();

      formData.append(
        'file',
        file,
        file.name
      );

      await firstValueFrom(
        this.http.post<SwimmingFitImportResponse>(
          `${this.apiUrl}/swimming/import-fit`,
          formData,
          { headers }
        )
      );

      await this.loadSwimming();

    } catch (error: any) {

      this.swimmingFitImportError.set(
        error?.error?.detail ??
        error?.message ??
        'No se pudo importar el archivo FIT.'
      );

    } finally {

      this.swimmingFitImporting.set(
        false
      );

      input.value = '';
    }
  }


  async loadSwimming():
    Promise<void> {

    if (this.swimmingLoading()) {
      return;
    }

    this.swimmingLoading.set(true);
    this.swimmingError.set(null);
    this.swimmingRequiresAndroid.set(false);

    try {
      const fitSessions =
        await this.loadPersistedSwimmingSessions();

      const fitViews =
        fitSessions.map(
          session =>
            this.toSwimmingSessionViewFromFit(
              session
            )
        );

      let sessions =
        fitViews;

      const isAndroid =
        Capacitor.isNativePlatform()
        && Capacitor.getPlatform() ===
          'android';

      if (isAndroid) {
        try {
          const result =
            await this.healthConnect
              .readGarminSwimmingMetrics();

          const healthConnectViews =
            result.sessions.map(
              session =>
                this.toSwimmingSessionView(
                  session
                )
            );

          sessions =
            this.mergeSwimmingSessions(
              healthConnectViews,
              fitViews
            );

        } catch (error: unknown) {
          if (fitViews.length === 0) {
            throw error;
          }
        }

      } else {
        this.swimmingRequiresAndroid.set(
          true
        );
      }

      sessions.sort(
        (left, right) =>
          new Date(
            right.startTime
          ).getTime()
          -
          new Date(
            left.startTime
          ).getTime()
      );

      this.swimmingSessions.set(
        sessions
      );

      this.selectedSwimmingSessionIndex.set(
        0
      );

      this.comparisonSwimmingSessionAIndex.set(
        0
      );

      this.comparisonSwimmingSessionBIndex.set(
        sessions.length > 1
          ? 1
          : 0
      );

    } catch (error: any) {

      this.swimmingError.set(
        error?.error?.detail ??
        error?.message ??
        'No se pudieron cargar las sesiones de natación.'
      );

    } finally {
      this.swimmingLoading.set(false);
    }
  }


  private async loadPersistedSwimmingSessions():
    Promise<SwimmingFitImportResponse[]> {

    const token =
      await this.auth.getAccessToken();

    if (!token) {
      throw new Error(
        'Necesitas iniciar sesión.'
      );
    }

    const headers =
      new HttpHeaders({
        Authorization:
          `Bearer ${token}`
      });

    return await firstValueFrom(
      this.http.get<
        SwimmingFitImportResponse[]
      >(
        `${this.apiUrl}/swimming/sessions`,
        { headers }
      )
    );
  }


  private toSwimmingSessionViewFromFit(
    fit: SwimmingFitImportResponse
  ): SwimmingSessionView {

    const distanceMeters =
      typeof fit.distance_meters === 'number'
      && Number.isFinite(
        fit.distance_meters
      )
        ? fit.distance_meters
        : null;

    const durationSeconds =
      fit.total_timer_time_seconds
      ?? fit.total_elapsed_time_seconds
      ?? fit.total_moving_time_seconds
      ?? 0;

    const movingTimeSeconds =
      fit.total_moving_time_seconds
      ?? null;

    const restTimeSeconds =
      movingTimeSeconds !== null
        ? Math.max(
            0,
            durationSeconds -
              movingTimeSeconds
          )
        : null;

    const activeLengths =
      fit.lengths.filter(
        length =>
          length.length_type !== 'idle'
      ).length;

    const totalStrokes =
      fit.total_strokes
      ?? null;

    const strokesPerLength =
      totalStrokes !== null
      && activeLengths > 0
        ? totalStrokes /
          activeLengths
        : null;

    const metersPerStroke =
      distanceMeters !== null
      && totalStrokes !== null
      && totalStrokes > 0
        ? distanceMeters /
          totalStrokes
        : null;

    const elapsedPaceSecondsPer100m =
      distanceMeters !== null
      && distanceMeters > 0
        ? durationSeconds /
          distanceMeters *
          100
        : null;

    const detailedAnalysis =
      analyseSwimmingLengths(
        fit.lengths,
        fit.pool_length_meters
          ?? 25
      );

    return {
      startTime:
        fit.start_time ?? '',

      distanceMeters,

      durationSeconds,

      lengths:
        activeLengths > 0
          ? activeLengths
          : null,

      totalStrokes,

      strokesPerLength,

      metersPerStroke,

      elapsedPaceSecondsPer100m,

      heartRateAverageBpm:
        fit.heart_rate_average_bpm
        ?? null,

      heartRateMaxBpm:
        fit.heart_rate_max_bpm
        ?? null,

      movingTimeSeconds,

      restTimeSeconds,

      averagePaceSecondsPer100m:
        fit.average_pace_seconds_per_100m
        ?? null,

      averageStrokeRateSpm:
        fit.average_stroke_rate_spm
        ?? null,

      activeLengths:
        activeLengths > 0
          ? activeLengths
          : null,

      totalLengthRecords:
        fit.lengths.length,

      totalCalories:
        fit.total_calories
        ?? null,

      aerobicTrainingEffect:
        fit.aerobic_training_effect
        ?? null,

      anaerobicTrainingEffect:
        fit.anaerobic_training_effect
        ?? null,

      fitEnriched: true,

      detailedAnalysis
    };
  }


  private mergeSwimmingSessions(
    healthConnectSessions:
      SwimmingSessionView[],
    fitSessions:
      SwimmingSessionView[]
  ): SwimmingSessionView[] {

    const usedFit =
      new Set<number>();

    const merged =
      healthConnectSessions.map(
        healthSession => {

          const matchIndex =
            fitSessions.findIndex(
              (fitSession, index) => {

                if (
                  usedFit.has(index)
                ) {
                  return false;
                }

                const timeDifference =
                  Math.abs(
                    new Date(
                      healthSession.startTime
                    ).getTime()
                    -
                    new Date(
                      fitSession.startTime
                    ).getTime()
                  );

                const distanceMatches =
                  healthSession.distanceMeters ===
                    null
                  || fitSession.distanceMeters ===
                    null
                  || Math.abs(
                    healthSession.distanceMeters
                    -
                    fitSession.distanceMeters
                  ) <= 5;

                return (
                  timeDifference <=
                    2 * 60 * 1000
                  && distanceMatches
                );
              }
            );

          if (matchIndex === -1) {
            return healthSession;
          }

          usedFit.add(
            matchIndex
          );

          const fitSession =
            fitSessions[
              matchIndex
            ];

          return {
            ...healthSession,

            lengths:
              fitSession.lengths
              ?? healthSession.lengths,

            totalStrokes:
              fitSession.totalStrokes
              ?? healthSession.totalStrokes,

            strokesPerLength:
              fitSession.strokesPerLength
              ?? healthSession.strokesPerLength,

            metersPerStroke:
              fitSession.metersPerStroke
              ?? healthSession.metersPerStroke,

            heartRateAverageBpm:
              fitSession.heartRateAverageBpm
              ?? healthSession.heartRateAverageBpm,

            heartRateMaxBpm:
              fitSession.heartRateMaxBpm
              ?? healthSession.heartRateMaxBpm,

            movingTimeSeconds:
              fitSession.movingTimeSeconds,

            restTimeSeconds:
              fitSession.restTimeSeconds,

            averagePaceSecondsPer100m:
              fitSession.averagePaceSecondsPer100m,

            averageStrokeRateSpm:
              fitSession.averageStrokeRateSpm,

            activeLengths:
              fitSession.activeLengths,

            totalLengthRecords:
              fitSession.totalLengthRecords,

            totalCalories:
              fitSession.totalCalories,

            aerobicTrainingEffect:
              fitSession.aerobicTrainingEffect,

            anaerobicTrainingEffect:
              fitSession.anaerobicTrainingEffect,

            detailedAnalysis:
              fitSession.detailedAnalysis,

            fitEnriched: true
          };
        }
      );

    fitSessions.forEach(
      (fitSession, index) => {
        if (!usedFit.has(index)) {
          merged.push(
            fitSession
          );
        }
      }
    );

    return merged;
  }


  private toSwimmingSessionView(
    session:
      HealthConnectSwimmingMetricSession
  ): SwimmingSessionView {

    const distanceMeters =
      typeof session.distanceMeters ===
        'number'
      && Number.isFinite(
        session.distanceMeters
      )
        ? session.distanceMeters
        : null;

    const totalStrokes =
      session.segmentRepetitions > 0
        ? session.segmentRepetitions
        : null;

    const metrics =
      distanceMeters !== null
        ? deriveSwimmingMetrics({
            distanceMeters,
            durationSeconds:
              session.durationSeconds,
            totalStrokes
          })
        : null;

    return {
      startTime:
        session.startTime,

      distanceMeters,

      durationSeconds:
        session.durationSeconds,

      lengths:
        metrics?.lengths
        ?? null,

      totalStrokes:
        metrics?.totalStrokes
        ?? totalStrokes,

      strokesPerLength:
        metrics?.strokesPerLength
        ?? null,

      metersPerStroke:
        metrics?.metersPerStroke
        ?? null,

      elapsedPaceSecondsPer100m:
        metrics
          ?.elapsedPaceSecondsPer100m
        ?? null,

      heartRateAverageBpm:
        session.heartRateAverageBpm
        ?? null,

      heartRateMaxBpm:
        session.heartRateMaxBpm
        ?? null
    };
  }


  comparisonSwimmingSessionA():
    SwimmingSessionView | null {

    return this.swimmingSessions()[
      this.comparisonSwimmingSessionAIndex()
    ] ?? null;
  }


  comparisonSwimmingSessionB():
    SwimmingSessionView | null {

    return this.swimmingSessions()[
      this.comparisonSwimmingSessionBIndex()
    ] ?? null;
  }


  swimmingFreestyleSummary(
    session: SwimmingSessionView
  ) {

    return (
      session.detailedAnalysis
        ?.strokes.find(
          item =>
            item.stroke ===
            'freestyle'
        )
      ?? null
    );
  }


  swimmingLongestBlockMeters(
    session: SwimmingSessionView
  ): number | null {

    const value =
      session.detailedAnalysis
        ?.longestBlockMeters;

    return (
      typeof value === 'number'
      && Number.isFinite(value)
    )
      ? value
      : null;
  }


  selectedSwimmingCoachAssessment():
    SwimmingCoachAssessment | null {

    const sessionA =
      this.comparisonSwimmingSessionA();

    const sessionB =
      this.comparisonSwimmingSessionB();

    if (
      !sessionA
      || !sessionB
      || sessionA === sessionB
    ) {
      return null;
    }

    return evaluateSwimmingSessions(
      {
        distanceMeters:
          sessionA.distanceMeters,

        heartRateAverageBpm:
          sessionA.heartRateAverageBpm,

        detailedAnalysis:
          sessionA.detailedAnalysis
          ?? null
      },
      {
        distanceMeters:
          sessionB.distanceMeters,

        heartRateAverageBpm:
          sessionB.heartRateAverageBpm,

        detailedAnalysis:
          sessionB.detailedAnalysis
          ?? null
      }
    );
  }


  selectedSwimmingComparison():
    SwimmingSessionComparison | null {

    const sessionA =
      this.comparisonSwimmingSessionA();

    const sessionB =
      this.comparisonSwimmingSessionB();

    if (
      !sessionA
      || !sessionB
      || sessionA === sessionB
    ) {
      return null;
    }

    return compareSwimmingSessions(
      sessionA,
      sessionB
    );
  }


  selectComparisonSwimmingSessionA(
    value: string
  ): void {

    const index = Number(value);

    if (
      !Number.isInteger(index)
      || index < 0
      || index >= this.swimmingSessions().length
    ) {
      return;
    }

    const previousA =
      this.comparisonSwimmingSessionAIndex();

    const currentB =
      this.comparisonSwimmingSessionBIndex();

    this.comparisonSwimmingSessionAIndex.set(
      index
    );

    if (index === currentB) {
      this.comparisonSwimmingSessionBIndex.set(
        previousA
      );
    }
  }


  selectComparisonSwimmingSessionB(
    value: string
  ): void {

    const index = Number(value);

    if (
      !Number.isInteger(index)
      || index < 0
      || index >= this.swimmingSessions().length
    ) {
      return;
    }

    const currentA =
      this.comparisonSwimmingSessionAIndex();

    const previousB =
      this.comparisonSwimmingSessionBIndex();

    this.comparisonSwimmingSessionBIndex.set(
      index
    );

    if (index === currentA) {
      this.comparisonSwimmingSessionAIndex.set(
        previousB
      );
    }
  }


  selectedSwimmingSession():
    SwimmingSessionView | null {

    const sessions =
      this.swimmingSessions();

    const index =
      this.selectedSwimmingSessionIndex();

    return sessions[index]
      ?? null;
  }


  selectSwimmingSession(
    value: string
  ): void {

    const index =
      Number(value);

    if (
      Number.isInteger(index)
      && index >= 0
      && index <
        this.swimmingSessions().length
    ) {
      this.selectedSwimmingSessionIndex.set(
        index
      );
    }
  }


  selectedRunningSession():
    HealthConnectRunningMetricSession | null {

    return this.runningSessions()[
      this.selectedRunningSessionIndex()
    ] ?? null;
  }


  selectRunningSession(
    value: string
  ): void {

    const index =
      Number(value);

    if (
      Number.isInteger(index)
      && index >= 0
      && index <
        this.runningSessions().length
    ) {
      this.selectedRunningSessionIndex.set(
        index
      );
    }
  }


  setEnduranceView(
    view: string
  ): void {

    if (this.discipline() === 'swimming') {
      this.setSwimmingView(view);
    } else if (
      this.discipline() === 'running'
    ) {
      this.setRunningView(view);
    }
  }


  setRunningView(
    view: string
  ): void {

    if (
      view === 'session'
      || view === 'routine'
      || view === 'analytics'
    ) {
      this.runningView.set(view);
    }
  }


  runningSessionTypeLabel(
    exerciseType: number
  ): string {

    if (
      exerciseType ===
        RUNNING_TREADMILL_EXERCISE_TYPE
    ) {
      return 'Cinta';
    }

    if (
      exerciseType ===
        RUNNING_EXERCISE_TYPE
    ) {
      return 'Exterior';
    }

    return 'Carrera';
  }


  formatRunningDistance(
    distanceMeters:
      number | null | undefined
  ): string {

    if (
      distanceMeters === null
      || distanceMeters === undefined
      || !Number.isFinite(distanceMeters)
      || distanceMeters < 0
    ) {
      return '—';
    }

    if (distanceMeters >= 1000) {
      return `${(
        distanceMeters / 1000
      ).toFixed(2)} km`;
    }

    return `${Math.round(distanceMeters)} m`;
  }


  formatRunningPace(
    secondsPerKm:
      number | null | undefined
  ): string {

    if (
      secondsPerKm === null
      || secondsPerKm === undefined
      || !Number.isFinite(secondsPerKm)
      || secondsPerKm <= 0
    ) {
      return '—';
    }

    return `${this.formatDuration(
      secondsPerKm
    )} /km`;
  }


  formatRunningSpeed(
    metersPerSecond:
      number | null | undefined
  ): string {

    if (
      metersPerSecond === null
      || metersPerSecond === undefined
      || !Number.isFinite(metersPerSecond)
      || metersPerSecond < 0
    ) {
      return '—';
    }

    return `${(
      metersPerSecond * 3.6
    ).toFixed(1)} km/h`;
  }


  swimmingRoutineSetGroups(
    repetitions: number,
    distanceMeters: number,
    poolLengthMeters: number
  ): number[][] {

    if (
      repetitions <= 0
      || distanceMeters <= 0
      || poolLengthMeters <= 0
    ) {
      return [];
    }

    const lengthsPerRepetition =
      Math.max(
        1,
        Math.round(
          distanceMeters
          / poolLengthMeters
        )
      );

    return Array.from(
      { length: repetitions },
      (_, repetitionIndex) =>
        Array.from(
          { length: lengthsPerRepetition },
          (_, lengthIndex) =>
            (
              repetitionIndex
              * lengthsPerRepetition
            )
            + lengthIndex
        )
    );
  }


  swimmingStrokeLabel(
    stroke: string
  ): string {

    const labels:
      Record<string, string> = {
        freestyle: 'Crol',
        backstroke: 'Espalda',
        breaststroke: 'Braza',
        mixed: 'Mixto'
      };

    return labels[stroke]
      ?? stroke;
  }


  swimmingWorkTypeLabel(
    type: string
  ): string {

    const labels:
      Record<string, string> = {
        swim: 'Nado',
        technique: 'Técnica',
        kick: 'Piernas',
        pull: 'Pull'
      };

    return labels[type]
      ?? type;
  }


  swimmingIntensityLabel(
    intensity: string
  ): string {

    const labels:
      Record<string, string> = {
        easy: 'Suave',
        controlled: 'Controlado',
        strong: 'Fuerte'
      };

    return labels[intensity]
      ?? intensity;
  }


  setSwimmingView(
    view: string
  ): void {

    if (
      view === 'session'
      || view === 'routine'
      || view === 'analytics'
    ) {
      this.swimmingView.set(
        view
      );
    }
  }



  formatPercentagePointDelta(
    value: number | null
  ): string {

    if (
      value === null
      || !Number.isFinite(value)
    ) {
      return '—';
    }

    if (Math.abs(value) < 0.05) {
      return 'Sin cambio relevante';
    }

    const sign =
      value > 0
        ? '+'
        : '';

    return (
      `${sign}${value.toFixed(1)} pp`
    );
  }


  formatPaceDelta(
    seconds: number | null
  ): string {

    if (
      seconds === null
      || !Number.isFinite(seconds)
    ) {
      return '—';
    }

    if (Math.abs(seconds) < 0.05) {
      return 'Sin cambio relevante';
    }

    const value =
      Math.abs(seconds).toFixed(1);

    return seconds < 0
      ? `${value} s/100 m más rápido`
      : `${value} s/100 m más lento`;
  }


  formatHeartRateDelta(
    bpm: number | null
  ): string {

    if (
      bpm === null
      || !Number.isFinite(bpm)
    ) {
      return '—';
    }

    if (Math.abs(bpm) < 0.5) {
      return 'Sin cambio relevante';
    }

    const value =
      Math.abs(Math.round(bpm));

    return bpm > 0
      ? `+${value} ppm`
      : `-${value} ppm`;
  }


  formatPercentChange(
    value: number | null
  ): string {

    if (
      value === null
      || !Number.isFinite(value)
    ) {
      return '—';
    }

    const sign =
      value > 0
        ? '+'
        : '';

    return (
      `${sign}${value.toFixed(1)} %`
    );
  }


  formatOptionalDuration(
    seconds: number | null | undefined
  ): string {

    if (
      seconds === null
      || seconds === undefined
      || !Number.isFinite(seconds)
    ) {
      return '—';
    }

    return this.formatDuration(
      seconds
    );
  }


  formatDuration(
    seconds: number
  ): string {

    if (
      !Number.isFinite(seconds)
      || seconds < 0
    ) {
      return '—';
    }

    const rounded =
      Math.round(seconds);

    const minutes =
      Math.floor(rounded / 60);

    const remainingSeconds =
      rounded % 60;

    return (
      `${minutes}:${
        remainingSeconds
          .toString()
          .padStart(2, '0')
      }`
    );
  }


  formatPace(
    secondsPer100m:
      number | null
  ): string {

    if (
      secondsPer100m === null
      || !Number.isFinite(
        secondsPer100m
      )
      || secondsPer100m <= 0
    ) {
      return '—';
    }

    return (
      `${this.formatDuration(
        secondsPer100m
      )} /100 m`
    );
  }



  disciplineLabel(): string {

    const labels:
      Record<
        TrainingDiscipline,
        string
      > = {
        strength: 'Fuerza',
        swimming: 'Natación',
        cycling: 'Bicicleta',
        running: 'Correr'
      };

    return labels[
      this.discipline()
    ];
  }


  disciplineDescription(): string {

    const descriptions:
      Record<
        TrainingDiscipline,
        string
      > = {
        strength:
          'Entrenamiento de fuerza.',
        swimming:
          'Analiza tus sesiones de natación y tu evolución.',
        cycling:
          'Registra tus sesiones de bicicleta.',
        running:
          'Registra tus sesiones de carrera.'
      };

    return descriptions[
      this.discipline()
    ];
  }
}
