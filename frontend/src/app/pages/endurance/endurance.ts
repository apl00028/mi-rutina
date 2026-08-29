import {
  Component,
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
  HealthConnectSwimmingMetricSession
} from '../../core/health-connect.plugin';

import {
  deriveSwimmingMetrics
} from '../../features/swimming/domain/swimming-metrics';

import {
  compareSwimmingSessions
} from '../../features/swimming/domain/swimming-analysis';

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
}


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
        id: 'analytics',
        label: 'Análisis'
      }
    ];


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
    signal<'session' | 'analytics'>(
      'session'
    );

  readonly swimmingRequiresAndroid =
    signal(false);

  readonly swimmingFitImporting =
    signal(false);

  readonly swimmingFitImportError =
    signal<string | null>(
      null
    );

  readonly importedSwimmingFit =
    signal<SwimmingFitImportResponse | null>(
      null
    );

  readonly fitSwimmingSessions =
    signal<SwimmingFitImportResponse[]>(
      []
    );


  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private auth: AuthService
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

    this.importedSwimmingFit.set(
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

      const result =
        await firstValueFrom(
          this.http.post<SwimmingFitImportResponse>(
            `${this.apiUrl}/swimming/import-fit`,
            formData,
            { headers }
          )
        );

      this.importedSwimmingFit.set(
        result
      );

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

      this.fitSwimmingSessions.set(
        fitSessions
      );

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
        const result =
          await HealthConnect
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

      fitEnriched: true
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


  setSwimmingView(
    view: string
  ): void {

    if (
      view === 'session'
      || view === 'analytics'
    ) {
      this.swimmingView.set(
        view
      );
    }
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
