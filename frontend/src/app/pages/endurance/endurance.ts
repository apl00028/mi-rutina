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


type TrainingDiscipline =
  | 'strength'
  | 'swimming'
  | 'cycling'
  | 'running';


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
    DecimalPipe
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
