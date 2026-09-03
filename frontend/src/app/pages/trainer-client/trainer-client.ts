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


type StrengthMetricColumn =
  | 'reps'
  | 'weight'
  | 'duration'
  | 'effort';


interface StrengthCalendarDay {
  dateKey: string;
  dayNumber: number;
  inMonth: boolean;
  sessions: TrainerStrengthSession[];
  selected: boolean;
}


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

  selectedStrengthWorkoutId =
    signal<string | null>(null);

  strengthCalendarMonth =
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

  readonly currentStrengthSession =
    computed(() => {
      const sessions =
        this.strengthSessions();
      const selectedId =
        this.selectedStrengthWorkoutId();

      return (
        sessions.find(session =>
          session.workout_id === selectedId
        ) ?? sessions[0] ?? null
      );
    });

  readonly strengthCalendarDays =
    computed(() => {
      const monthKey =
        this.strengthCalendarMonth();

      if (!monthKey) {
        return [];
      }

      const monthStart =
        new Date(`${monthKey}-01T00:00:00Z`);
      const firstWeekday =
        monthStart.getUTCDay() || 7;
      const gridStart =
        new Date(monthStart);

      gridStart.setUTCDate(
        monthStart.getUTCDate() -
          firstWeekday +
          1
      );

      return Array.from(
        {
          length: 42
        },
        (_, index): StrengthCalendarDay => {
          const date =
            new Date(gridStart);

          date.setUTCDate(
            gridStart.getUTCDate() + index
          );

          const dateKey =
            this.dateKeyFromDate(date);
          const sessions =
            this.strengthSessionsForDate(dateKey);

          return {
            dateKey,
            dayNumber:
              date.getUTCDate(),
            inMonth:
              this.monthKeyFromDate(date) ===
              monthKey,
            sessions,
            selected:
              sessions.some(session =>
                session.workout_id ===
                  this.selectedStrengthWorkoutId()
              )
          };
        }
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
      this.selectedStrengthWorkoutId.set(
        sessions[0]?.workout_id ?? null
      );
      this.strengthCalendarMonth.set(
        this.monthKeyFromValue(
          sessions[0]?.finished_at
        )
      );
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


  previousStrengthMonth(): void {
    this.shiftStrengthMonth(-1);
  }


  nextStrengthMonth(): void {
    this.shiftStrengthMonth(1);
  }


  selectStrengthDay(
    day: StrengthCalendarDay
  ): void {
    const session =
      day.sessions[0];

    if (session) {
      this.selectStrengthSession(session);
    }
  }


  selectStrengthSession(
    session: TrainerStrengthSession
  ): void {
    this.selectedStrengthWorkoutId.set(
      session.workout_id
    );
    this.strengthCalendarMonth.set(
      this.monthKeyFromValue(
        session.finished_at
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


  strengthMonthLabel(): string {
    const monthKey =
      this.strengthCalendarMonth();

    if (!monthKey) {
      return '—';
    }

    return new Intl.DateTimeFormat(
      'es-ES',
      {
        month: 'long',
        year: 'numeric'
      }
    ).format(
      new Date(`${monthKey}-01T00:00:00Z`)
    );
  }


  strengthSessionsForDate(
    dateKey: string
  ): TrainerStrengthSession[] {
    return this.strengthSessions()
      .filter(session =>
        this.dateKeyFromValue(
          session.finished_at
        ) === dateKey
      );
  }


  strengthSessionDateKey(
    session: TrainerStrengthSession
  ): string {
    return (
      this.dateKeyFromValue(
        session.finished_at
      ) ?? ''
    );
  }


  strengthSessionTime(
    session: TrainerStrengthSession
  ): string {
    if (!session.finished_at) {
      return this.sessionTitle(session);
    }

    const date =
      new Date(session.finished_at);

    if (Number.isNaN(date.getTime())) {
      return this.sessionTitle(session);
    }

    return new Intl.DateTimeFormat(
      'es-ES',
      {
        hour: '2-digit',
        minute: '2-digit'
      }
    ).format(date);
  }


  strengthColumns(
    exercise: TrainerStrengthExercise
  ): StrengthMetricColumn[] {
    const columns: StrengthMetricColumn[] = [];
    const hasReps =
      exercise.sets.some(set =>
        set.reps !== null &&
        set.reps !== undefined
      );
    const hasWeight =
      exercise.sets.some(set =>
        set.weight_kg !== null &&
        set.weight_kg !== undefined
      );
    const hasDuration =
      exercise.sets.some(set =>
        set.duration_seconds !== null &&
        set.duration_seconds !== undefined
      );
    const hasEffort =
      exercise.sets.some(set =>
        (
          set.rir !== null &&
          set.rir !== undefined
        ) ||
        (
          set.rpe !== null &&
          set.rpe !== undefined
        )
      );

    if (hasReps) {
      columns.push('reps');
    }

    if (hasWeight) {
      columns.push('weight');
    }

    if (hasDuration) {
      columns.push('duration');
    }

    if (hasEffort) {
      columns.push('effort');
    }

    return columns;
  }


  strengthColumnLabel(
    column: StrengthMetricColumn
  ): string {
    switch (column) {
      case 'reps':
        return 'Reps';
      case 'weight':
        return 'Peso';
      case 'duration':
        return 'Duración';
      default:
        return 'RIR/RPE';
    }
  }


  strengthSetMetric(
    set: TrainerStrengthSet,
    column: StrengthMetricColumn
  ): string {
    switch (column) {
      case 'reps':
        return this.setValue(set.reps);
      case 'weight':
        return this.setValue(
          set.weight_kg,
          ' kg'
        );
      case 'duration':
        return this.setValue(
          set.duration_seconds,
          ' s'
        );
      default:
        return this.setRirOrRpe(set);
    }
  }


  strengthSetGridColumns(
    exercise: TrainerStrengthExercise
  ): string {
    return `1fr repeat(${
      this.strengthColumns(exercise).length
    }, minmax(0, 1fr))`;
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


  private shiftStrengthMonth(
    delta: number
  ): void {
    const monthKey =
      this.strengthCalendarMonth();

    if (!monthKey) {
      return;
    }

    const date =
      new Date(`${monthKey}-01T00:00:00Z`);

    date.setUTCMonth(
      date.getUTCMonth() + delta
    );

    this.strengthCalendarMonth.set(
      this.monthKeyFromDate(date)
    );
  }


  private monthKeyFromValue(
    value: string | null | undefined
  ): string | null {
    if (!value) {
      return null;
    }

    const date =
      new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return this.monthKeyFromDate(date);
  }


  private monthKeyFromDate(
    date: Date
  ): string {
    return date.toISOString().slice(0, 7);
  }


  private dateKeyFromValue(
    value: string | null | undefined
  ): string | null {
    if (!value) {
      return null;
    }

    const date =
      new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return this.dateKeyFromDate(date);
  }


  private dateKeyFromDate(
    date: Date
  ): string {
    return date.toISOString().slice(0, 10);
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
