import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { TrainerClient } from './trainer-client';
const api = `${environment.apiUrl}/trainer/athletes/athlete-1`;

describe('Trainer client experience', () => {
  let fixture: ComponentFixture<TrainerClient>;
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrainerClient],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'athlete-1' } } },
        },
        {
          provide: AuthService,
          useValue: { getAccessToken: vi.fn().mockResolvedValue('access-token') },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  async function settle() {
    for (let i = 0; i < 12; i++) await Promise.resolve();
    fixture.detectChanges();
  }
  function text(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ');
  }
  async function start(
    overview: Record<string, unknown> = athleteOverview(),
    strength: unknown[] = [strengthSession()],
    swimming: unknown[] = [performanceSession('swimming')],
    running: unknown[] = [performanceSession('running')],
    failSwimming = false,
  ) {
    fixture = TestBed.createComponent(TrainerClient);
    fixture.detectChanges();
    await settle();
    http.expectOne(api).flush(overview);
    await settle();
    http.expectOne(`${api}/strength-sessions`).flush(strength);
    const swimRequest = http.expectOne(`${api}/swimming-sessions`);
    if (failSwimming) swimRequest.flush({}, { status: 503, statusText: 'Unavailable' });
    else swimRequest.flush(swimming);
    http.expectOne(`${api}/running-sessions`).flush(running);
    await settle();
  }
  async function day(number: number) {
    const button = (
      Array.from(
        fixture.nativeElement.querySelectorAll('.calendar-day:not(.outside-month)'),
      ) as HTMLButtonElement[]
    ).find((b) => b.querySelector('span')?.textContent?.trim() === `${number}`)!;
    expect(button).toBeTruthy();
    button.click();
    await settle();
  }
  async function openSession(label: string) {
    const button = (
      Array.from(
        fixture.nativeElement.querySelectorAll('.same-day-list button'),
      ) as HTMLButtonElement[]
    ).find((b) => b.textContent?.includes(label))!;
    expect(button, label).toBeTruthy();
    button.click();
    await settle();
  }
  async function closeDetail() {
    fixture.componentInstance.closePerformanceDetail();
    await settle();
  }
  async function openSwim() {
    await day(3);
    await openSession('Técnica de crol');
  }

  it('places calendar before collapsed routines and health, with one compact identity', async () => {
    await start();
    expect(fixture.nativeElement.querySelectorAll('h1')).toHaveLength(1);
    expect(text()).toContain('Athlete One');
    expect(text()).toContain('Cliente desde 15/08/2026');
    expect(fixture.nativeElement.querySelector('.back-link').getAttribute('href')).toBe(
      '/trainer?view=clients',
    );
    const sections = Array.from(
      fixture.nativeElement.querySelectorAll('.performance-section, .secondary-section'),
    ) as HTMLElement[];
    expect(sections[0].className).toBe('performance-section');
    expect(sections.slice(1).every((s) => !(s as HTMLDetailsElement).open)).toBe(true);
    expect(text()).not.toContain('Entrenamiento reciente');
    expect(text()).not.toContain('Trainer');
    expect(text()).toContain('Última asignación: Base fuerza');
  });
  it('starts with only the calendar and fetches no session detail', async () => {
    await start();
    expect(fixture.nativeElement.querySelector('.calendar-grid')).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('.day-sessions, .strength-detail, .endurance-detail'),
    ).toBeNull();
    http.expectNone(`${api}/swimming-sessions/swimming-1`);
  });
  it('shows only the selected day, switches days and opens a session only after its row is tapped', async () => {
    await start();
    await day(2);
    expect(fixture.nativeElement.querySelector('.day-sessions').textContent).toContain('Empuje');
    expect(fixture.nativeElement.querySelector('.day-sessions').textContent).not.toContain(
      'Técnica de crol',
    );
    expect(fixture.nativeElement.querySelector('.strength-detail')).toBeNull();
    await day(3);
    expect(fixture.nativeElement.querySelector('.day-sessions').textContent).not.toContain(
      'Empuje',
    );
    http.expectNone(`${api}/swimming-sessions/swimming-1`);
    await day(2);
    await openSession('Empuje');
    expect(fixture.nativeElement.querySelector('.calendar-grid, .secondary-section')).toBeNull();
    expect(text()).toContain('Press de banca');
    expect(text()).toContain('30 kg');
    expect(text()).toContain('RIR 2');
    await closeDetail();
    expect(fixture.nativeElement.querySelector('.day-sessions').textContent).toContain('Empuje');
  });
  it('handles days without sessions without suggesting a complete history', async () => {
    await start();
    await day(1);
    expect(text()).toContain('No hay sesiones disponibles para este día.');
    expect(text()).toContain('hasta 25 por modalidad');
    expect(
      fixture.nativeElement.querySelector('.calendar-day.selected').getAttribute('aria-pressed'),
    ).toBe('true');
  });
  it('keeps the calendar usable when every source is empty', async () => {
    await start(athleteOverview(), [], [], []);
    expect(fixture.nativeElement.querySelectorAll('.calendar-day').length).toBeGreaterThanOrEqual(
      28,
    );
    await day(1);
    expect(text()).toContain('No hay sesiones disponibles para este día.');
  });
  it('shows each session on the selected day without expanding either', async () => {
    await start(
      athleteOverview(),
      [strengthSession()],
      [performanceSession('swimming', { event_at: '2026-09-02T10:30:00Z' })],
    );
    await day(2);
    expect(fixture.nativeElement.querySelectorAll('.same-day-list button')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.strength-detail, .endurance-detail')).toBeNull();
  });
  it('does not hide successful sources when another discipline fails', async () => {
    await start(athleteOverview(), [strengthSession()], [], [], true);
    expect(text()).toContain('No se pudieron cargar las sesiones de natación');
    await day(2);
    await openSession('Empuje');
    expect(text()).toContain('Press de banca');
  });
  it('clears the day on month changes without fetching another history', async () => {
    await start();
    await day(2);
    const old = fixture.componentInstance.performanceCalendarMonth();
    (
      fixture.nativeElement.querySelector('[aria-label="Mes anterior"]') as HTMLButtonElement
    ).click();
    await settle();
    expect(fixture.componentInstance.performanceCalendarMonth()).not.toBe(old);
    expect(fixture.nativeElement.querySelector('.day-sessions')).toBeNull();
  });
  it('groups sessions using the same local date as their displayed time', async () => {
    const timestamp = new Date(2026, 8, 3, 0, 15).toISOString();
    await start(
      athleteOverview(),
      [],
      [performanceSession('swimming', { event_at: timestamp })],
      [],
    );
    await day(3);
    expect(fixture.nativeElement.querySelector('.day-sessions').textContent).toContain('00:15');
  });
  it('renders only actual health values, including zero and measurement dates', async () => {
    const overview = athleteOverview();
    await start({
      ...overview,
      health: {
        ...overview.health,
        body_fat_percent: null,
        muscle_mass_kg: null,
        body_water_percent: null,
        visceral_fat_index: 0,
      },
    });
    const health = fixture.nativeElement.querySelector('.health-section');
    expect(health.querySelectorAll('dt')).toHaveLength(3);
    expect(health.textContent).toContain('81.4 kg');
    expect(health.textContent).toContain('83.5 cm');
    expect(health.textContent).toContain('01/09/2026');
    expect(health.textContent).not.toContain('% grasa');
    expect(health.textContent).not.toContain('Masa muscular');
    expect(health.textContent).not.toContain('—');
  });
  it('uses honest names when identities, routines or exercises lack them', async () => {
    const overview = athleteOverview();
    await start(
      {
        ...overview,
        display_name: null,
        email: null,
        active_routines: {
          ...overview.active_routines,
          strength: { routine_id: 'GymOS_technical_id', name: null, activated_at: null },
        },
      },
      [
        strengthSession({
          session_name: null,
          exercises: [{ exercise_id: 'private-id', exercise_name: null, sets: [] }],
        }),
      ],
      [],
      [],
    );
    expect(text()).toContain('Deportista');
    expect(text()).toContain('Rutina sin nombre');
    expect(text()).not.toContain('GymOS_technical_id');
    await day(2);
    await openSession('Sesión de fuerza');
    expect(text()).toContain('Ejercicio sin nombre');
    expect(text()).not.toContain('private-id');
  });
  it('shows recorded duration only for the relevant strength exercises and restarts set numbering', async () => {
    await start(
      athleteOverview(),
      [
        strengthSession({
          exercises: [
            {
              exercise_id: 'a',
              exercise_name: 'Plancha',
              sets: [
                strengthSet({
                  reps: null,
                  weight_kg: null,
                  rir: null,
                  duration_seconds: 45,
                  set_order: 5,
                }),
              ],
            },
            {
              exercise_id: 'b',
              exercise_name: 'Remo',
              sets: [strengthSet({ set_order: 6, rir: null, rpe: 8 })],
            },
          ],
        }),
      ],
      [],
      [],
    );
    await day(2);
    await openSession('Empuje');
    const blocks = fixture.nativeElement.querySelectorAll('.exercise-block');
    expect(blocks[0].textContent).toContain('45 s');
    expect(blocks[0].textContent).not.toContain('Peso');
    expect(blocks[1].textContent).not.toContain('Duración');
    expect(blocks[1].textContent).toContain('RPE 8');
    expect(blocks[0].textContent).toContain('Serie 1');
    expect(blocks[1].textContent).toContain('Serie 1');
  });
  it('supports a strength session with no recorded exercises', async () => {
    await start(athleteOverview(), [strengthSession({ exercises: [] })], [], []);
    await day(2);
    await openSession('Empuje');
    expect(text()).toContain('sin detalle de series registrado');
  });
  it('fetches rich swimming metrics only after selection, with collapsed lengths', async () => {
    await start();
    await openSwim();
    http.expectOne(`${api}/swimming-sessions/swimming-1`).flush(swimmingDetail());
    await settle();
    expect(text()).toContain('1.20 km');
    expect(text()).toContain('FC media');
    expect(text()).toContain('138');
    expect(text()).toContain('Brazadas totales');
    expect(text()).toContain('758');
    expect(text()).toContain('Efecto aeróbico');
    expect(fixture.nativeElement.querySelector('.swimming-lengths').open).toBe(false);
    expect(text()).not.toContain('garmin_fit');
  });
  it('omits unavailable swimming fields and lengths', async () => {
    await start();
    await openSwim();
    const detail = swimmingDetail();
    const minimal = Object.fromEntries(
      Object.entries(detail).map(([key, value]) => [key, typeof value === 'number' ? null : value]),
    );
    http
      .expectOne(`${api}/swimming-sessions/swimming-1`)
      .flush({ ...minimal, total_distance_meters: 500, lengths: [], technical_focus: [] });
    await settle();
    expect(text()).toContain('500 m');
    expect(text()).not.toContain('FC media');
    expect(text()).not.toContain('Brazadas totales');
    expect(fixture.nativeElement.querySelector('.swimming-lengths')).toBeNull();
  });
  it('caches swimming detail and permits explicit retry after an error', async () => {
    await start();
    await openSwim();
    http
      .expectOne(`${api}/swimming-sessions/swimming-1`)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(text()).toContain('No se pudo cargar el detalle');
    void fixture.componentInstance.loadSelectedSwimmingDetail();
    await settle();
    http.expectOne(`${api}/swimming-sessions/swimming-1`).flush(swimmingDetail());
    await settle();
    await closeDetail();
    await openSwim();
    http.expectNone(`${api}/swimming-sessions/swimming-1`);
    expect(text()).toContain('1.20 km');
  });
  it('keeps a late response or error from replacing a different selected swimming session', async () => {
    await start(
      athleteOverview(),
      [],
      [
        performanceSession('swimming'),
        performanceSession('swimming', { id: 'swimming-2', title: 'Segunda sesión' }),
      ],
      [],
    );
    await openSwim();
    const first = http.expectOne(`${api}/swimming-sessions/swimming-1`);
    await closeDetail();
    await day(3);
    await openSession('Segunda sesión');
    http
      .expectOne(`${api}/swimming-sessions/swimming-2`)
      .flush(
        swimmingDetail({ id: 'swimming-2', title: 'Segunda sesión', total_distance_meters: 800 }),
      );
    await settle();
    first.flush({}, { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(text()).toContain('800 m');
    expect(fixture.componentInstance.swimmingDetailError()).toBeNull();
  });
  it('renders running timestamps and elapsed time without inventing unsupported metrics', async () => {
    await start();
    await day(4);
    await openSession('Control aeróbico');
    expect(text()).toContain('Tiempo entre inicio y fin');
    expect(text()).toContain('40:00');
    expect(text()).toContain('No hay más métricas disponibles');
    expect(text()).not.toContain('próximamente');
    expect(text()).not.toContain('FC media');
    expect(text()).not.toContain('Distancia total');
  });
});

function strengthSet(patch: Record<string, unknown> = {}) {
  return {
    set_index: 0,
    set_order: 1,
    set_type: 'working',
    reps: 8,
    weight_kg: 30,
    rir: 2,
    rpe: null,
    duration_seconds: null,
    ...patch,
  };
}

function strengthSession(patch: Record<string, unknown> = {}) {
  return {
    workout_id: 'workout-1',
    routine_id: 'routine-strength',
    session_id: 'push',
    session_name: 'Empuje',
    started_at: '2026-09-02T08:30:00Z',
    finished_at: '2026-09-02T09:30:00Z',
    exercises: [
      {
        exercise_id: 'bench-press',
        exercise_name: 'Press de banca',
        sets: [strengthSet()],
      },
    ],
    ...patch,
  };
}

function performanceSession(
  discipline: 'swimming' | 'running',
  patch: Record<string, unknown> = {},
) {
  return {
    id: `${discipline}-1`,
    discipline,
    title: discipline === 'swimming' ? 'Técnica de crol' : 'Control aeróbico',
    started_at: discipline === 'swimming' ? '2026-09-03T07:00:00Z' : '2026-09-04T06:00:00Z',
    event_at: discipline === 'swimming' ? '2026-09-03T07:00:00Z' : '2026-09-04T06:40:00Z',
    finished_at: discipline === 'running' ? '2026-09-04T06:40:00Z' : null,
    duration_seconds: discipline === 'swimming' ? 2700 : null,
    routine_id: discipline === 'running' ? 'run-routine' : null,
    session_id: discipline === 'running' ? 'run-session' : null,
    source: discipline === 'swimming' ? 'garmin_fit' : null,
    ...patch,
  };
}

function swimmingDetail(patch: Record<string, unknown> = {}) {
  return {
    id: 'swimming-1',
    discipline: 'swimming',
    title: 'Natación',
    event_at: '2026-09-02T10:30:00Z',
    started_at: '2026-09-02T10:30:00Z',
    duration_seconds: 2439,
    total_distance_meters: 1200,
    pool_length_meters: 25,
    total_elapsed_time_seconds: 2451.623,
    total_timer_time_seconds: 2439.193,
    total_moving_time_seconds: 2016.384,
    average_pace_seconds_per_100m: 168.07,
    total_strokes: 758,
    heart_rate_average_bpm: 138,
    heart_rate_max_bpm: 162,
    total_calories: 389,
    aerobic_training_effect: 3.3,
    anaerobic_training_effect: 2.3,
    average_stroke_rate_spm: 23,
    average_speed_meters_per_second: 0.595,
    max_speed_meters_per_second: 1.724,
    objective: null,
    technical_focus: ['Crol cómodo'],
    lengths: [
      {
        start_time: '2026-09-02T10:30:00Z',
        duration_seconds: 30,
        distance_meters: 25,
        total_strokes: 16,
        average_stroke_rate_spm: 23,
        stroke: 'freestyle',
        length_type: 'active',
      },
      {
        start_time: '2026-09-02T10:31:00Z',
        duration_seconds: 28,
        distance_meters: 25,
        total_strokes: 15,
        average_stroke_rate_spm: 24,
        stroke: 'freestyle',
        length_type: 'active',
      },
      {
        start_time: '2026-09-02T10:32:00Z',
        duration_seconds: 20,
        distance_meters: null,
        total_strokes: null,
        average_stroke_rate_spm: null,
        stroke: null,
        length_type: 'idle',
      },
    ],
    ...patch,
  };
}

function athleteOverview(patch: Record<string, unknown> = {}) {
  return {
    athlete_id: 'athlete-1',
    status: 'active',
    email: 'athlete@example.com',
    display_name: 'Athlete One',
    client_since: '2026-08-15T10:00:00Z',
    health: {
      weight_measurement_date: '2026-09-01',
      waist_measurement_date: '2026-08-30',
      weight_kg: 81.4,
      body_fat_percent: 18.2,
      muscle_mass_kg: 62.1,
      body_water_percent: 55.3,
      visceral_fat_index: 7,
      waist_cm: 83.5,
    },
    recent_training: {
      last_completed: {
        workout_id: 'workout-1',
        routine_id: 'routine-strength',
        session_id: 'push',
        session_name: 'Empuje',
        finished_at: '2026-09-02T09:30:00Z',
      },
      completed_last_7_days: 3,
    },
    active_routines: {
      strength: {
        routine_id: 'routine-strength',
        name: 'Plan fuerza',
        activated_at: '2026-08-20T10:00:00Z',
      },
      swimming: null,
      running: null,
      cycling: null,
    },
    trainer: {
      last_assignment: {
        template_id: 'template-1',
        routine_id: 'assigned-routine',
        name: 'Base fuerza',
        discipline: 'strength',
        assigned_at: '2026-09-01T12:00:00Z',
      },
    },
    ...patch,
  };
}
