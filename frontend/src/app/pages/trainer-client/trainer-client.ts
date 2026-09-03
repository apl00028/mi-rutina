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


interface PerformanceCalendarEvent {
  id: string;
  discipline: TrainerDiscipline;
  finished_at: string | null;
  title: string;
}


interface PerformanceCalendarDay {
  dateKey: string;
  dayNumber: number;
  inMonth: boolean;
  events: PerformanceCalendarEvent[];
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

  performanceLoading =
    signal(false);

  performanceError =
    signal<string | null>(null);

  strengthSessions =
    signal<TrainerStrengthSession[]>([]);

  selectedPerformanceEventId =
    signal<string | null>(null);

  performanceCalendarMonth =
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

  readonly performanceEvents =
    computed(() => {
      const events =
        this.strengthSessions()
          .map(session =>
            this.strengthSessionToEvent(
              session
            )
          );

      return events.sort((left, right) =>
        this.eventTime(right) -
        this.eventTime(left)
      );
    });

  readonly currentPerformanceEvent =
    computed(() => {
      const events =
        this.performanceEvents();
      const selectedId =
        this.selectedPerformanceEventId();

      return (
        events.find(event =>
          event.id === selectedId
        ) ?? events[0] ?? null
      );
    });

  readonly currentStrengthSession =
    computed(() => {
      const selected =
        this.currentPerformanceEvent();

      if (
        !selected ||
        selected.discipline !== 'strength'
      ) {
        return null;
      }

      return (
        this.strengthSessions()
          .find(session =>
            this.strengthEventId(session) ===
              selected.id
          ) ?? null
      );
    });

  readonly selectedPerformanceDateKey =
    computed(() => {
      const selected =
        this.currentPerformanceEvent();

      return selected
        ? this.dateKeyFromValue(
          selected.finished_at
        )
        : null;
    });

  readonly selectedDayEvents =
    computed(() => {
      const dateKey =
        this.selectedPerformanceDateKey();

      return dateKey
        ? this.performanceEventsForDate(dateKey)
        : [];
    });

  readonly performanceCalendarDays =
    computed(() => {
      const monthKey =
        this.performanceCalendarMonth();

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
        (_, index): PerformanceCalendarDay => {
          const date =
            new Date(gridStart);

          date.setUTCDate(
            gridStart.getUTCDate() + index
          );

          const dateKey =
            this.dateKeyFromDate(date);
          const events =
            this.performanceEventsForDate(dateKey);

          return {
            dateKey,
            dayNumber:
              date.getUTCDate(),
            inMonth:
              this.monthKeyFromDate(date) ===
              monthKey,
            events,
            selected:
              events.some(event =>
                event.id ===
                  this.selectedPerformanceEventId()
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
      void this.loadStrengthSessions();
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


  async loadStrengthSessions():
    Promise<void> {
    const athleteId =
      this.route.snapshot.paramMap.get(
        'athleteId'
      );

    if (!athleteId) {
      return;
    }

    this.performanceLoading.set(true);
    this.performanceError.set(null);

    try {
      const sessions =
        await this.trainerService
          .listStrengthSessions(athleteId);

      this.strengthSessions.set(sessions);
      const firstEvent =
        this.performanceEvents()[0] ?? null;

      this.selectedPerformanceEventId.set(
        firstEvent?.id ?? null
      );
      this.performanceCalendarMonth.set(
        this.monthKeyFromValue(
          firstEvent?.finished_at
        )
      );
    } catch (error) {
      this.performanceError.set(
        this.errorMessage(
          error,
          'No se pudo cargar el rendimiento de fuerza.'
        )
      );
    } finally {
      this.performanceLoading.set(false);
    }
  }


  previousPerformanceMonth(): void {
    this.shiftPerformanceMonth(-1);
  }


  nextPerformanceMonth(): void {
    this.shiftPerformanceMonth(1);
  }


  selectPerformanceDay(
    day: PerformanceCalendarDay
  ): void {
    const event =
      day.events[0];

    if (event) {
      this.selectPerformanceEvent(event);
    }
  }


  selectPerformanceEvent(
    event: PerformanceCalendarEvent
  ): void {
    this.selectedPerformanceEventId.set(
      event.id
    );
    this.performanceCalendarMonth.set(
      this.monthKeyFromValue(
        event.finished_at
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


  performanceMonthLabel(): string {
    const monthKey =
      this.performanceCalendarMonth();

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


  performanceEventsForDate(
    dateKey: string
  ): PerformanceCalendarEvent[] {
    return this.performanceEvents()
      .filter(event =>
        this.dateKeyFromValue(
          event.finished_at
        ) === dateKey
      );
  }


  performanceEventTime(
    event: PerformanceCalendarEvent
  ): string {
    if (!event.finished_at) {
      return event.title;
    }

    const date =
      new Date(event.finished_at);

    if (Number.isNaN(date.getTime())) {
      return event.title;
    }

    return new Intl.DateTimeFormat(
      'es-ES',
      {
        hour: '2-digit',
        minute: '2-digit'
      }
    ).format(date);
  }


  performanceDisciplineInitial(
    discipline: TrainerDiscipline
  ): string {
    switch (discipline) {
      case 'swimming':
        return 'N';
      case 'running':
        return 'C';
      case 'cycling':
        return 'B';
      default:
        return 'F';
    }
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


  private strengthSessionToEvent(
    session: TrainerStrengthSession
  ): PerformanceCalendarEvent {
    return {
      id:
        this.strengthEventId(session),
      discipline:
        'strength',
      finished_at:
        session.finished_at,
      title:
        this.sessionTitle(session)
    };
  }


  private strengthEventId(
    session: TrainerStrengthSession
  ): string {
    return `strength:${session.workout_id}`;
  }


  private eventTime(
    event: PerformanceCalendarEvent
  ): number {
    if (!event.finished_at) {
      return 0;
    }

    const date =
      new Date(event.finished_at);

    return Number.isNaN(date.getTime())
      ? 0
      : date.getTime();
  }


  private shiftPerformanceMonth(
    delta: number
  ): void {
    const monthKey =
      this.performanceCalendarMonth();

    if (!monthKey) {
      return;
    }

    const date =
      new Date(`${monthKey}-01T00:00:00Z`);

    date.setUTCMonth(
      date.getUTCMonth() + delta
    );

    this.performanceCalendarMonth.set(
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
