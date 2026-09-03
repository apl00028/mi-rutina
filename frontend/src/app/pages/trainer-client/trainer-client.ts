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
  TrainerStrengthExercise,
  TrainerStrengthSession,
  TrainerStrengthSet,
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

  strengthOpen =
    signal(false);

  strengthLoading =
    signal(false);

  strengthLoaded =
    signal(false);

  strengthError =
    signal<string | null>(null);

  strengthSessions =
    signal<TrainerStrengthSession[]>([]);

  strengthIndex =
    signal(0);

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

  readonly currentStrengthSession =
    computed(() => {
      const sessions =
        this.strengthSessions();

      return sessions[
        this.strengthIndex()
      ] ?? null;
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


  async toggleStrengthPerformance():
    Promise<void> {
    const open =
      !this.strengthOpen();

    this.strengthOpen.set(open);

    if (
      open &&
      !this.strengthLoaded() &&
      !this.strengthLoading()
    ) {
      await this.loadStrengthSessions();
    }
  }


  async loadStrengthSessions():
    Promise<void> {
    const athleteId =
      this.route.snapshot.paramMap.get(
        'athleteId'
      );

    if (!athleteId) {
      return;
    }

    this.strengthLoading.set(true);
    this.strengthError.set(null);

    try {
      const sessions =
        await this.trainerService
          .listStrengthSessions(athleteId);

      this.strengthSessions.set(sessions);
      this.strengthIndex.set(0);
      this.strengthLoaded.set(true);
    } catch (error) {
      this.strengthError.set(
        this.errorMessage(
          error,
          'No se pudo cargar el rendimiento de fuerza.'
        )
      );
    } finally {
      this.strengthLoading.set(false);
    }
  }


  previousStrengthSession(): void {
    this.strengthIndex.update(index =>
      Math.max(
        0,
        index - 1
      )
    );
  }


  nextStrengthSession(): void {
    this.strengthIndex.update(index =>
      Math.min(
        this.strengthSessions().length - 1,
        index + 1
      )
    );
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


  statusLabel(
    statusValue: string
  ): string {
    return statusValue === 'active'
      ? 'Activo'
      : statusValue;
  }


  completedSessionsLabel(
    count: number
  ): string {
    return count === 1
      ? '1 sesión'
      : `${count} sesiones`;
  }


  lastWorkoutTitle(
    athlete: TrainerAthleteOverview
  ): string {
    const workout =
      athlete.recent_training.last_completed;

    return (
      workout?.session_name?.trim() ||
      workout?.session_id?.trim() ||
      '—'
    );
  }


  routineTitle(
    routines: TrainerAthleteActiveRoutines,
    discipline: TrainerDiscipline
  ): string {
    const routine =
      this.activeRoutine(
        routines,
        discipline
      );

    return (
      routine?.name?.trim() ||
      routine?.routine_id?.trim() ||
      '—'
    );
  }


  assignmentTitle(
    athlete: TrainerAthleteOverview
  ): string {
    const assignment =
      athlete.trainer.last_assignment;

    return (
      assignment?.name?.trim() ||
      assignment?.routine_id?.trim() ||
      '—'
    );
  }


  sessionTitle(
    session: TrainerStrengthSession
  ): string {
    return (
      session.session_name?.trim() ||
      session.session_id?.trim() ||
      '—'
    );
  }


  exerciseTitle(
    exercise: TrainerStrengthExercise
  ): string {
    return (
      exercise.exercise_name?.trim() ||
      exercise.exercise_id
    );
  }


  setValue(
    value: number | null | undefined,
    suffix = ''
  ): string {
    if (
      value === null ||
      value === undefined
    ) {
      return '—';
    }

    return `${value}${suffix}`;
  }


  setRirOrRpe(
    set: TrainerStrengthSet
  ): string {
    if (
      set.rir !== null &&
      set.rir !== undefined
    ) {
      return `RIR ${set.rir}`;
    }

    if (
      set.rpe !== null &&
      set.rpe !== undefined
    ) {
      return `RPE ${set.rpe}`;
    }

    return '—';
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
