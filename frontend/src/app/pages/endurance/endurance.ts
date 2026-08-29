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
  Capacitor
} from '@capacitor/core';

import {
  HealthConnect
} from '../../core/health-connect.plugin';

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


  constructor(
    private route: ActivatedRoute,
    private router: Router
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


  async loadSwimming():
    Promise<void> {

    if (this.swimmingLoading()) {
      return;
    }

    this.swimmingError.set(null);
    this.swimmingRequiresAndroid.set(false);

    if (
      !Capacitor.isNativePlatform() ||
      Capacitor.getPlatform() !==
        'android'
    ) {
      this.swimmingRequiresAndroid.set(
        true
      );

      return;
    }

    this.swimmingLoading.set(true);

    try {
      const result =
        await HealthConnect
          .readGarminSwimmingMetrics();

      const sessions =
        result.sessions
          .map(
            session =>
              this.toSwimmingSessionView(
                session
              )
          )
          .sort(
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

    } catch (error: unknown) {

      this.swimmingError.set(
        error instanceof Error
          ? error.message
          : 'No se pudieron leer las sesiones de natación.'
      );

    } finally {
      this.swimmingLoading.set(false);
    }
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
