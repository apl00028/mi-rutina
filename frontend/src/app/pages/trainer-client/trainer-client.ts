import { CommonModule } from '@angular/common';

import { HttpErrorResponse } from '@angular/common/http';

import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  OnInit,
  computed,
  signal,
} from '@angular/core';

import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  TrainerAthleteActiveRoutines,
  TrainerAthleteOverview,
  TrainerDiscipline,
  TrainerPerformanceSession,
  TrainerStrengthExercise,
  TrainerStrengthSession,
  TrainerStrengthSet,
  TrainerSwimmingLength,
  TrainerSwimmingSessionDetail,
  TrainerService,
} from '../../core/trainer.service';

type StrengthMetricColumn = 'reps' | 'weight' | 'duration' | 'effort';

interface PerformanceCalendarEvent {
  id: string;
  discipline: TrainerDiscipline;
  event_at: string | null;
  title: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_seconds?: number | null;
}

interface PerformanceCalendarDay {
  dateKey: string;
  dayNumber: number;
  inMonth: boolean;
  events: PerformanceCalendarEvent[];
  selected: boolean;
}

interface PerformanceCalendarMark {
  discipline: TrainerDiscipline;
  label: string;
}

@Component({
  selector: 'app-trainer-client',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './trainer-client.html',
  styleUrl: './trainer-client.scss',
})
export class TrainerClient implements OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  private focusAfterRender(selector: string): void {
    afterNextRender(
      () => {
        const target = this.host.nativeElement.querySelector<HTMLElement>(selector);
        target?.focus({ preventScroll: true });
        target?.scrollIntoView?.({ block: 'nearest' });
      },
      { injector: this.injector },
    );
  }

  overview = signal<TrainerAthleteOverview | null>(null);

  loading = signal(true);

  error = signal<string | null>(null);

  performanceLoading = signal(false);

  performanceError = signal<string | null>(null);

  strengthSessions = signal<TrainerStrengthSession[]>([]);

  swimmingSessions = signal<TrainerPerformanceSession[]>([]);

  runningSessions = signal<TrainerPerformanceSession[]>([]);

  swimmingDetailLoading = signal(false);

  swimmingDetailError = signal<string | null>(null);

  swimmingDetailCache = signal<Record<string, TrainerSwimmingSessionDetail>>({});

  selectedPerformanceEventId = signal<string | null>(null);

  private swimmingDetailRequest = 0;

  selectedPerformanceDateKey = signal<string | null>(null);

  performanceCalendarMonth = signal<string | null>(null);

  readonly disciplines: TrainerDiscipline[] = ['strength', 'swimming', 'running', 'cycling'];

  readonly title = computed(() => {
    const athlete = this.overview();

    if (!athlete) {
      return 'Cliente';
    }

    return athlete.display_name?.trim() || athlete.email?.trim() || 'Deportista';
  });

  readonly performanceEvents = computed(() => {
    const events = [
      ...this.strengthSessions().map((session) => this.strengthSessionToEvent(session)),
      ...this.swimmingSessions().map((session) => this.performanceSessionToEvent(session)),
      ...this.runningSessions().map((session) => this.performanceSessionToEvent(session)),
    ];

    return events.sort((left, right) => this.eventTime(right) - this.eventTime(left));
  });

  readonly currentPerformanceEvent = computed(() => {
    const events = this.performanceEvents();
    const selectedId = this.selectedPerformanceEventId();

    return events.find((event) => event.id === selectedId) ?? null;
  });

  readonly currentStrengthSession = computed(() => {
    const selected = this.currentPerformanceEvent();

    if (!selected || selected.discipline !== 'strength') {
      return null;
    }

    return (
      this.strengthSessions().find((session) => this.strengthEventId(session) === selected.id) ??
      null
    );
  });

  readonly currentEnduranceEvent = computed(() => {
    const selected = this.currentPerformanceEvent();

    return selected && selected.discipline !== 'strength' ? selected : null;
  });

  readonly currentSwimmingDetail = computed(() => {
    const selected = this.currentPerformanceEvent();

    if (!selected || selected.discipline !== 'swimming') {
      return null;
    }

    const sessionId = this.swimmingSessionIdFromEvent(selected);

    return sessionId ? (this.swimmingDetailCache()[sessionId] ?? null) : null;
  });

  readonly selectedDayEvents = computed(() => {
    const dateKey = this.selectedPerformanceDateKey();

    return dateKey ? this.performanceEventsForDate(dateKey) : [];
  });

  readonly performanceCalendarDays = computed(() => {
    const monthKey = this.performanceCalendarMonth();

    if (!monthKey) {
      return [];
    }

    const monthStart = new Date(`${monthKey}-01T00:00:00Z`);
    const firstWeekday = monthStart.getUTCDay() || 7;
    const gridStart = new Date(monthStart);

    gridStart.setUTCDate(monthStart.getUTCDate() - firstWeekday + 1);

    return Array.from(
      {
        length:
          Math.ceil(
            (firstWeekday -
              1 +
              new Date(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0).getDate()) /
              7,
          ) * 7,
      },
      (_, index): PerformanceCalendarDay => {
        const date = new Date(gridStart);

        date.setUTCDate(gridStart.getUTCDate() + index);

        const dateKey = date.toISOString().slice(0, 10);
        const events = this.performanceEventsForDate(dateKey);

        return {
          dateKey,
          dayNumber: date.getUTCDate(),
          inMonth: date.toISOString().slice(0, 7) === monthKey,
          events,
          selected: dateKey === this.selectedPerformanceDateKey(),
        };
      },
    );
  });

  constructor(
    private route: ActivatedRoute,
    private trainerService: TrainerService,
  ) {}

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    const athleteId = this.route.snapshot.paramMap.get('athleteId');

    if (!athleteId) {
      this.loading.set(false);
      this.error.set('No se pudo identificar el cliente.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const overview = await this.trainerService.getAthleteOverview(athleteId);

      this.overview.set(overview);
      void this.loadPerformanceSessions();
    } catch (error) {
      this.error.set(this.errorMessage(error, 'No se pudo cargar la ficha del cliente.'));
    } finally {
      this.loading.set(false);
    }
  }

  async loadPerformanceSessions(): Promise<void> {
    const athleteId = this.route.snapshot.paramMap.get('athleteId');

    if (!athleteId) {
      return;
    }

    this.performanceLoading.set(true);
    this.performanceError.set(null);

    try {
      const results = await Promise.allSettled([
        this.trainerService.listStrengthSessions(athleteId),
        this.trainerService.listSwimmingSessions(athleteId),
        this.trainerService.listRunningSessions(athleteId),
      ]);
      const [strength, swimming, running] = results;
      this.strengthSessions.set(strength.status === 'fulfilled' ? strength.value : []);
      this.swimmingSessions.set(swimming.status === 'fulfilled' ? swimming.value : []);
      this.runningSessions.set(running.status === 'fulfilled' ? running.value : []);
      const missing = ['fuerza', 'natación', 'carrera'].filter(
        (_, i) => results[i].status === 'rejected',
      );
      if (missing.length)
        this.performanceError.set(`No se pudieron cargar las sesiones de ${missing.join(', ')}.`);
      this.selectedPerformanceEventId.set(null);
      this.selectedPerformanceDateKey.set(null);
      this.performanceCalendarMonth.set(
        this.monthKeyFromValue(this.performanceEvents()[0]?.event_at ?? new Date().toISOString()),
      );
    } catch (error) {
      this.performanceError.set(this.errorMessage(error, 'No se pudo cargar el rendimiento.'));
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

  selectPerformanceDay(day: PerformanceCalendarDay): void {
    this.selectedPerformanceDateKey.set(day.dateKey);
    this.closePerformanceDetail();
  }

  closePerformanceDetail(): void {
    this.selectedPerformanceEventId.set(null);
    ++this.swimmingDetailRequest;
    this.swimmingDetailLoading.set(false);
    this.swimmingDetailError.set(null);
    this.focusAfterRender('.day-sessions');
  }

  healthMetrics(athlete: TrainerAthleteOverview) {
    const health = athlete.health;
    return [
      { label: 'Peso', value: health.weight_kg, unit: ' kg', date: health.weight_measurement_date },
      {
        label: 'Cintura',
        value: health.waist_cm,
        unit: ' cm',
        date: health.waist_measurement_date,
      },
      {
        label: '% grasa',
        value: health.body_fat_percent,
        unit: '%',
        date: health.weight_measurement_date,
      },
      {
        label: 'Masa muscular',
        value: health.muscle_mass_kg,
        unit: ' kg',
        date: health.weight_measurement_date,
      },
      {
        label: 'Agua corporal',
        value: health.body_water_percent,
        unit: '%',
        date: health.weight_measurement_date,
      },
      {
        label: 'Grasa visceral',
        value: health.visceral_fat_index,
        unit: '',
        date: health.weight_measurement_date,
      },
    ].filter((row) => row.value !== null && row.value !== undefined && Number.isFinite(row.value));
  }

  activeRoutineCount(athlete: TrainerAthleteOverview): number {
    return Object.values(athlete.active_routines).filter(Boolean).length;
  }

  selectedDayLabel(): string {
    const key = this.selectedPerformanceDateKey();
    return key
      ? new Intl.DateTimeFormat('es-ES', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${key}T12:00:00Z`))
      : '';
  }

  calendarDayLabel(day: PerformanceCalendarDay): string {
    return `${new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(
      new Date(`${day.dateKey}T12:00:00Z`),
    )}, ${this.completedSessionsLabel(day.events.length)}`;
  }

  elapsedSessionSeconds(event: PerformanceCalendarEvent): number | null {
    if (!event.started_at || !event.finished_at) return null;
    const seconds = (Date.parse(event.finished_at) - Date.parse(event.started_at)) / 1000;
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  selectPerformanceEvent(event: PerformanceCalendarEvent): void {
    this.selectedPerformanceDateKey.set(this.dateKeyFromValue(event.event_at));
    this.selectedPerformanceEventId.set(event.id);
    this.performanceCalendarMonth.set(this.monthKeyFromValue(event.event_at));
    this.focusAfterRender('.detail-back');
    void this.loadSelectedSwimmingDetail();
  }

  athleteSubtitle(athlete: TrainerAthleteOverview): string | null {
    if (athlete.display_name?.trim() && athlete.email?.trim()) {
      return athlete.email;
    }

    return null;
  }

  metric(value: number | string | null | undefined, suffix = ''): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }

    return `${value}${suffix}`;
  }

  statusLabel(statusValue: string): string {
    return statusValue === 'active' ? 'Activo' : statusValue;
  }

  completedSessionsLabel(count: number): string {
    return count === 1 ? '1 sesión' : `${count} sesiones`;
  }

  lastWorkoutTitle(athlete: TrainerAthleteOverview): string {
    const workout = athlete.recent_training.last_completed;

    return workout?.session_name?.trim() || 'Sesión registrada';
  }

  routineTitle(routines: TrainerAthleteActiveRoutines, discipline: TrainerDiscipline): string {
    const routine = this.activeRoutine(routines, discipline);

    const assignment = this.overview()?.trainer.last_assignment;
    return (
      routine?.name?.trim() ||
      (routine && assignment?.routine_id === routine.routine_id ? assignment.name?.trim() : null) ||
      (routine ? 'Rutina sin nombre' : 'Sin rutina')
    );
  }

  assignmentTitle(athlete: TrainerAthleteOverview): string {
    const assignment = athlete.trainer.last_assignment;

    return assignment?.name?.trim() || 'Rutina asignada';
  }

  sessionTitle(session: TrainerStrengthSession): string {
    return session.session_name?.trim() || 'Sesión de fuerza';
  }

  exerciseTitle(exercise: TrainerStrengthExercise): string {
    return exercise.exercise_name?.trim() || 'Ejercicio sin nombre';
  }

  setValue(value: number | null | undefined, suffix = ''): string {
    if (value === null || value === undefined) {
      return '—';
    }

    return `${value}${suffix}`;
  }

  setRirOrRpe(set: TrainerStrengthSet): string {
    return (
      [set.rir != null ? `RIR ${set.rir}` : null, set.rpe != null ? `RPE ${set.rpe}` : null]
        .filter(Boolean)
        .join(' · ') || '—'
    );
  }

  performanceMonthLabel(): string {
    const monthKey = this.performanceCalendarMonth();

    if (!monthKey) {
      return '—';
    }

    return new Intl.DateTimeFormat('es-ES', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${monthKey}-01T00:00:00Z`));
  }

  performanceEventsForDate(dateKey: string): PerformanceCalendarEvent[] {
    return this.performanceEvents().filter(
      (event) => this.dateKeyFromValue(event.event_at) === dateKey,
    );
  }

  calendarDayMarks(day: PerformanceCalendarDay): PerformanceCalendarMark[] {
    return this.disciplines
      .map((discipline) => {
        const count = day.events.filter((event) => event.discipline === discipline).length;

        if (count === 0) {
          return null;
        }

        return {
          discipline,
          label:
            count > 1
              ? `${this.performanceDisciplineInitial(discipline)}×${count}`
              : this.performanceDisciplineInitial(discipline),
        };
      })
      .filter((mark): mark is PerformanceCalendarMark => mark !== null);
  }

  performanceEventTime(event: PerformanceCalendarEvent): string {
    if (!event.event_at) {
      return event.title;
    }

    const date = new Date(event.event_at);

    if (Number.isNaN(date.getTime())) {
      return event.title;
    }

    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  performanceDisciplineInitial(discipline: TrainerDiscipline): string {
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

  async loadSelectedSwimmingDetail(): Promise<void> {
    const requestId = ++this.swimmingDetailRequest;
    this.swimmingDetailError.set(null);
    this.swimmingDetailLoading.set(false);
    const selected = this.currentPerformanceEvent();
    if (!selected || selected.discipline !== 'swimming') return;

    const athleteId = this.route.snapshot.paramMap.get('athleteId');
    const sessionId = this.swimmingSessionIdFromEvent(selected);

    if (!athleteId || !sessionId || this.swimmingDetailCache()[sessionId]) {
      return;
    }

    this.swimmingDetailLoading.set(true);
    this.swimmingDetailError.set(null);

    try {
      const detail = await this.trainerService.getSwimmingSession(athleteId, sessionId);

      this.swimmingDetailCache.set({
        ...this.swimmingDetailCache(),
        [sessionId]: detail,
      });
    } catch (error) {
      if (requestId !== this.swimmingDetailRequest) return;
      this.swimmingDetailError.set(
        this.errorMessage(error, 'No se pudo cargar el detalle de natación.'),
      );
    } finally {
      if (requestId === this.swimmingDetailRequest) this.swimmingDetailLoading.set(false);
    }
  }

  swimmingLengthTitle(length: TrainerSwimmingLength, index: number): string {
    const distance = this.formatDistance(length.distance_meters);

    return distance === '—' ? `Largo ${index + 1}` : `Largo ${index + 1} · ${distance}`;
  }

  swimmingLengthMeta(length: TrainerSwimmingLength): string {
    return [
      length.stroke ? this.swimmingStrokeLabel(length.stroke) : null,
      length.length_type === 'active'
        ? 'Activo'
        : length.length_type === 'idle'
          ? 'Descanso'
          : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  swimmingActiveLengths(swimming: TrainerSwimmingSessionDetail): TrainerSwimmingLength[] {
    return swimming.lengths.filter((length) => length.length_type === 'active');
  }

  swimmingActiveLengthCount(swimming: TrainerSwimmingSessionDetail): number | null {
    return swimming.lengths.length ? this.swimmingActiveLengths(swimming).length : null;
  }

  swimmingStrokesPerActiveLength(swimming: TrainerSwimmingSessionDetail): number | null {
    const activeCount = this.swimmingActiveLengthCount(swimming);

    if (!activeCount || swimming.total_strokes === null) {
      return null;
    }

    return swimming.total_strokes / activeCount;
  }

  swimmingObservedStrokes(swimming: TrainerSwimmingSessionDetail): string {
    return this.swimmingStrokeNames(swimming).join(', ');
  }

  swimmingStrokeNames(swimming: TrainerSwimmingSessionDetail): string[] {
    const labels = new Set<string>();

    for (const length of swimming.lengths) {
      if (length.stroke) {
        labels.add(this.swimmingStrokeLabel(length.stroke));
      }
    }

    return Array.from(labels);
  }

  swimmingRestSeconds(swimming: TrainerSwimmingSessionDetail): number | null {
    if (swimming.total_timer_time_seconds === null || swimming.total_moving_time_seconds === null) {
      return null;
    }

    return Math.max(0, swimming.total_timer_time_seconds - swimming.total_moving_time_seconds);
  }

  hasSwimmingCardio(swimming: TrainerSwimmingSessionDetail): boolean {
    return swimming.heart_rate_average_bpm !== null || swimming.heart_rate_max_bpm !== null;
  }

  hasSwimmingTechnique(swimming: TrainerSwimmingSessionDetail): boolean {
    return (
      swimming.total_strokes !== null ||
      swimming.average_stroke_rate_spm !== null ||
      this.swimmingActiveLengthCount(swimming) !== null ||
      this.swimmingStrokeNames(swimming).length > 0
    );
  }

  hasSwimmingLoad(swimming: TrainerSwimmingSessionDetail): boolean {
    return (
      swimming.total_calories !== null ||
      swimming.aerobic_training_effect !== null ||
      swimming.anaerobic_training_effect !== null
    );
  }

  hasSwimmingTimes(swimming: TrainerSwimmingSessionDetail): boolean {
    return (
      swimming.total_elapsed_time_seconds !== null ||
      swimming.total_timer_time_seconds !== null ||
      swimming.total_moving_time_seconds !== null ||
      this.swimmingRestSeconds(swimming) !== null
    );
  }

  formatDecimal(value: number | null | undefined, maximumFractionDigits = 1): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '—';
    }

    return new Intl.NumberFormat('es-ES', {
      maximumFractionDigits,
    }).format(value);
  }

  formatPacePer100m(value: number | null | undefined): string {
    const pace = this.formatDuration(value);

    return pace === '—' ? pace : `${pace}/100 m`;
  }

  swimmingStrokeLabel(stroke: string): string {
    const labels: Record<string, string> = {
      freestyle: 'Crol',
      backstroke: 'Espalda',
      breaststroke: 'Braza',
      butterfly: 'Mariposa',
      mixed: 'Mixto',
      drill: 'Técnica',
    };

    return labels[stroke] ?? stroke;
  }

  strengthColumns(exercise: TrainerStrengthExercise): StrengthMetricColumn[] {
    const columns: StrengthMetricColumn[] = [];
    const hasReps = exercise.sets.some((set) => set.reps !== null && set.reps !== undefined);
    const hasWeight = exercise.sets.some(
      (set) => set.weight_kg !== null && set.weight_kg !== undefined,
    );
    const hasDuration = exercise.sets.some(
      (set) => set.duration_seconds !== null && set.duration_seconds !== undefined,
    );
    const hasEffort = exercise.sets.some(
      (set) =>
        (set.rir !== null && set.rir !== undefined) || (set.rpe !== null && set.rpe !== undefined),
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

  strengthColumnLabel(column: StrengthMetricColumn): string {
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

  strengthSetMetric(set: TrainerStrengthSet, column: StrengthMetricColumn): string {
    switch (column) {
      case 'reps':
        return this.setValue(set.reps);
      case 'weight':
        return this.setValue(set.weight_kg, ' kg');
      case 'duration':
        return this.setValue(set.duration_seconds, ' s');
      default:
        return this.setRirOrRpe(set);
    }
  }

  strengthSetGridColumns(exercise: TrainerStrengthExercise): string {
    return `1fr repeat(${this.strengthColumns(exercise).length}, minmax(0, 1fr))`;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) {
      return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  formatDistance(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '—';
    }

    return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m`;
  }

  formatDuration(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '—';
    }

    const totalSeconds = Math.round(value);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds} s`;
  }

  disciplineLabel(discipline: TrainerDiscipline): string {
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

  activeRoutine(routines: TrainerAthleteActiveRoutines, discipline: TrainerDiscipline) {
    return routines[discipline];
  }

  private strengthSessionToEvent(session: TrainerStrengthSession): PerformanceCalendarEvent {
    return {
      id: this.strengthEventId(session),
      discipline: 'strength',
      event_at: session.finished_at,
      title: this.sessionTitle(session),
    };
  }

  private performanceSessionToEvent(session: TrainerPerformanceSession): PerformanceCalendarEvent {
    return {
      id: `${session.discipline}:${session.id}`,
      discipline: session.discipline,
      event_at: session.event_at,
      started_at: session.started_at,
      finished_at: session.finished_at,
      duration_seconds: session.duration_seconds,
      title:
        session.title?.trim() &&
        session.title !== session.session_id &&
        session.title !== session.id
          ? session.title
          : this.disciplineLabel(session.discipline),
    };
  }

  private swimmingSessionIdFromEvent(event: PerformanceCalendarEvent): string | null {
    return event.id.startsWith('swimming:') ? event.id.slice('swimming:'.length) : null;
  }

  private strengthEventId(session: TrainerStrengthSession): string {
    return `strength:${session.workout_id}`;
  }

  private eventTime(event: PerformanceCalendarEvent): number {
    if (!event.event_at) {
      return 0;
    }

    const date = new Date(event.event_at);

    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  private shiftPerformanceMonth(delta: number): void {
    const monthKey = this.performanceCalendarMonth();

    if (!monthKey) {
      return;
    }

    const date = new Date(`${monthKey}-01T00:00:00Z`);

    date.setUTCMonth(date.getUTCMonth() + delta);

    this.selectedPerformanceDateKey.set(null);
    this.closePerformanceDetail();
    this.performanceCalendarMonth.set(date.toISOString().slice(0, 7));
  }

  private monthKeyFromValue(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return this.monthKeyFromDate(date);
  }

  private monthKeyFromDate(date: Date): string {
    return this.dateKeyFromDate(date).slice(0, 7);
  }

  private dateKeyFromValue(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return this.dateKeyFromDate(date);
  }

  private dateKeyFromDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const detail = error.error?.detail;

      if (typeof detail === 'string') {
        return detail;
      }
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return fallback;
  }
}
