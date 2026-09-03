import {
  CommonModule
} from '@angular/common';

import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  OnInit,
  computed,
  signal
} from '@angular/core';

import {
  ActivatedRoute,
  RouterLink
} from '@angular/router';

import {
  TrainerAthleteActiveRoutines,
  TrainerAthleteOverview,
  TrainerDiscipline,
  TrainerService
} from '../../core/trainer.service';


@Component({
  selector: 'app-trainer-client',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink
  ],
  templateUrl: './trainer-client.html',
  styleUrl: './trainer-client.scss'
})
export class TrainerClient implements OnInit {
  overview =
    signal<TrainerAthleteOverview | null>(null);

  loading =
    signal(true);

  error =
    signal<string | null>(null);

  readonly disciplines: TrainerDiscipline[] = [
    'strength',
    'swimming',
    'running',
    'cycling'
  ];

  readonly title =
    computed(() => {
      const athlete =
        this.overview();

      if (!athlete) {
        return 'Cliente';
      }

      return (
        athlete.display_name?.trim() ||
        athlete.email?.trim() ||
        athlete.athlete_id
      );
    });


  constructor(
    private route: ActivatedRoute,
    private trainerService: TrainerService
  ) {}


  ngOnInit(): void {
    void this.load();
  }


  async load(): Promise<void> {
    const athleteId =
      this.route.snapshot.paramMap.get(
        'athleteId'
      );

    if (!athleteId) {
      this.loading.set(false);
      this.error.set(
        'No se pudo identificar el cliente.'
      );
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const overview =
        await this.trainerService
          .getAthleteOverview(athleteId);

      this.overview.set(overview);
    } catch (error) {
      this.error.set(
        this.errorMessage(
          error,
          'No se pudo cargar la ficha del cliente.'
        )
      );
    } finally {
      this.loading.set(false);
    }
  }


  athleteSubtitle(
    athlete: TrainerAthleteOverview
  ): string | null {
    if (
      athlete.display_name?.trim() &&
      athlete.email?.trim()
    ) {
      return athlete.email;
    }

    return null;
  }


  metric(
    value: number | string | null | undefined,
    suffix = ''
  ): string {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return '—';
    }

    return `${value}${suffix}`;
  }


  formatDate(
    value: string | null | undefined
  ): string {
    if (!value) {
      return '—';
    }

    const date =
      new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(
      'es-ES',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }
    ).format(date);
  }


  disciplineLabel(
    discipline: TrainerDiscipline
  ): string {
    switch (discipline) {
      case 'swimming':
        return 'Natación';
      case 'cycling':
        return 'Bicicleta';
      case 'running':
        return 'Carrera';
      default:
        return 'Fuerza';
    }
  }


  activeRoutine(
    routines: TrainerAthleteActiveRoutines,
    discipline: TrainerDiscipline
  ) {
    return routines[discipline];
  }


  private errorMessage(
    error: unknown,
    fallback: string
  ): string {
    if (
      error instanceof HttpErrorResponse
    ) {
      const detail =
        error.error?.detail;

      if (typeof detail === 'string') {
        return detail;
      }
    }

    if (
      error instanceof Error &&
      error.message
    ) {
      return error.message;
    }

    return fallback;
  }
}
