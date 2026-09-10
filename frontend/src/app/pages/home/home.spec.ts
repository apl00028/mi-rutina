/** @vitest-environment jsdom */
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { GoalMetricState } from '../../core/goal.models';
import { WorkoutOutboxService } from '../../core/workout-outbox.service';
import { GoalProgress } from './goal-progress';
import { Home } from './home';

const api = environment.apiUrl;
const goalRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'goal-1', user_id: 'user-1', category: 'endurance', kind: 'triathlon',
  variant: 'sprint', target_date: '2027-06-21', status: 'active',
  created_by_user_id: 'user-1', created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z', ...overrides
});

function metricState(
  key: GoalMetricState['metric']['metricKey'],
  options: { baseline?: number; target?: number; current?: number; reason?: 'no_reliable_resolver' | 'no_measurement' | 'no_measurement_after_baseline' } = {}
): any {
  const unit = key === 'body_weight' ? 'kg' : key === 'waist_circumference' ? 'cm' : 'm';
  return {
    metric: { id: `metric-${key}`, goal_id: 'goal-1', metric_key: key, unit,
      target_value: options.target ?? null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    baseline: options.baseline === undefined ? null : { id: `baseline-${key}`, goal_metric_id: `metric-${key}`,
      value: options.baseline, unit, measured_at: '2026-01-01T00:00:00Z', source_type: 'manual',
      source_domain: null, source_record_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    target: options.target === undefined ? null : { value: options.target, unit },
    current: options.current === undefined
      ? { metric_key: key, value: null, unit, measured_at: null, source: null,
          available: false, reason: options.reason ?? 'no_reliable_resolver' }
      : { metric_key: key, value: options.current, unit, measured_at: '2026-02-01T00:00:00Z',
          source: { source_type: 'scale', source_domain: 'health_weight_entries', source_record_id: 'weight-1' },
          available: true, reason: null }
  };
}

describe('Home V2', () => {
  let http: HttpTestingController;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    navigateByUrl = vi.fn(async () => true);
    await TestBed.configureTestingModule({ imports: [Home], providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { user: signal({ id: 'user-1' }), getAccessToken: async () => 'token' } },
      { provide: WorkoutOutboxService, useValue: { reconciledSnapshots: () => [] } },
      { provide: Router, useValue: { navigateByUrl } }
    ] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());
  async function settle(): Promise<void> { for (let index = 0; index < 30; index++) await Promise.resolve(); }

  async function render(
    goal: Record<string, unknown> | null = goalRow(),
    states: Record<string, unknown>[] = [],
    options: { goalError?: boolean; historyError?: boolean; activeRoutine?: boolean; workouts?: unknown[]; nutrition?: unknown[] } = {}
  ) {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges(); await settle();
    const goalRequest = http.expectOne(`${api}/goals/active`);
    options.goalError ? goalRequest.flush({}, { status: 503, statusText: 'Unavailable' }) : goalRequest.flush(goal);
    const activeRoutine = http.expectOne(`${api}/routines/active`);
    options.activeRoutine === false
      ? activeRoutine.flush({}, { status: 404, statusText: 'Not found' })
      : activeRoutine.flush({ routineId: 'routine-1', sessions: [] });
    http.expectOne(`${api}/nutrition/plans`).flush(options.nutrition ?? []);
    const workouts = http.expectOne(`${api}/workouts`);
    options.historyError
      ? workouts.flush({}, { status: 503, statusText: 'Unavailable' })
      : workouts.flush(options.workouts ?? []);
    http.expectOne(`${api}/routines`).flush([]);
    http.expectOne(`${api}/running/sessions`).flush([]);
    http.expectOne(`${api}/swimming/sessions`).flush([]);
    if (goal && !options.goalError) {
      await settle();
      http.expectOne(`${api}/goals/goal-1/metric-states`).flush(states);
    }
    await settle(); fixture.detectChanges();
    return fixture;
  }

  const text = (fixture: ReturnType<typeof TestBed.createComponent<Home>>) =>
    (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ');

  it('shows the active Goal, variant and optional target date first', async () => {
    const fixture = await render();
    expect(text(fixture)).toContain('Triatlón · Sprint');
    expect(text(fixture)).toContain('21 de junio de 2027');
    const sections = [...fixture.nativeElement.querySelectorAll('.goal-section, .today-section, app-goal-progress, .activity-section')];
    expect(sections.map((node: Element) => node.className || node.tagName.toLowerCase()))
      .toEqual(['goal-section', 'today-section', 'app-goal-progress', 'activity-section']);
    expect(text(fixture)).not.toContain('goal-1');
  });

  it('supports an active Goal without a target date or metrics', async () => {
    const fixture = await render(goalRow({ category: 'health', kind: 'more_active', variant: null, target_date: null }));
    expect(text(fixture)).toContain('Estar más activo');
    expect(text(fixture)).toContain('Todavía no has definido una métrica de seguimiento');
  });

  it('treats no Goal as valid and creates one with the focused mini-flow', async () => {
    const fixture = await render(null);
    expect(text(fixture)).toContain('Define tu objetivo para que Aptus pueda contextualizar tu progreso');
    const cta = fixture.nativeElement.querySelector('.goal-cta') as HTMLButtonElement;
    expect(cta.textContent).toContain('Definir objetivo');
    cta.click(); fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('#home-goal-kind') as HTMLSelectElement;
    select.value = 'health:general_health'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    (fixture.nativeElement.querySelector('.goal-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle();
    const request = http.expectOne(`${api}/goals`);
    expect(request.request.body).toEqual({ category: 'health', kind: 'general_health', variant: null, target_date: null });
    request.flush(goalRow({ category: 'health', kind: 'general_health', variant: null, target_date: null }));
    await settle();
    http.expectOne(`${api}/goals/goal-1/metric-states`).flush([]);
    await settle(); fixture.detectChanges();
    expect(text(fixture)).toContain('Mejorar mi salud');
    expect(text(fixture)).not.toContain('lesiones');
  });

  it('shows factual training states without claiming a scheduled session', async () => {
    const fixture = await render(goalRow(), [], { activeRoutine: false });
    expect(text(fixture)).toContain('Sin rutina activa');
    expect(text(fixture)).not.toContain('planificada para hoy');
  });

  it('shows an in-progress workout as the primary continuation action', async () => {
    const fixture = await render(goalRow(), [], { workouts: [{ workoutId: 'w', routineId: 'r', sessionId: 's', status: 'in_progress', sets: [] }] });
    expect(text(fixture)).toContain('Continuar entrenamiento');
    (fixture.nativeElement.querySelector('.training-card') as HTMLButtonElement).click();
    expect(navigateByUrl).toHaveBeenCalledWith('/entrenar');
  });

  it('keeps Goal visible when activity history partially fails', async () => {
    const fixture = await render(goalRow(), [], { historyError: true });
    expect(text(fixture)).toContain('Triatlón · Sprint');
    expect(text(fixture)).toContain('No se pudo cargar entrenamientos');
    expect(text(fixture)).toContain('Todavía no hay actividades registradas');
  });

  it('distinguishes a Goal request error from no Goal', async () => {
    const fixture = await render(null, [], { goalError: true });
    expect(text(fixture)).toContain('No se pudo cargar tu objetivo');
    expect(text(fixture)).not.toContain('Define tu objetivo para que Aptus');
    expect(text(fixture)).toContain('Tu siguiente acción');
  });

  it('exposes understandable independent loading states', async () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    expect(text(fixture)).toContain('Cargando tu objetivo');
    expect(text(fixture)).toContain('Comprobando tu entrenamiento');
    expect(text(fixture)).toContain('Actualizando actividades');
    await settle();
    http.match(() => true).forEach(request => request.flush(null));
    await settle();
  });
});

describe('GoalProgress', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [GoalProgress] }).compileComponents();
  });

  async function renderStates(rows: any[]) {
    const fixture = TestBed.createComponent(GoalProgress);
    fixture.componentRef.setInput('states', rows.map(state => ({
      metric: { ...state.metric, goalId: state.metric.goal_id, metricKey: state.metric.metric_key,
        targetValue: state.metric.target_value, createdAt: state.metric.created_at, updatedAt: state.metric.updated_at },
      baseline: state.baseline && { ...state.baseline, goalMetricId: state.baseline.goal_metric_id,
        measuredAt: state.baseline.measured_at, sourceType: state.baseline.source_type,
        sourceDomain: state.baseline.source_domain, sourceRecordId: state.baseline.source_record_id,
        createdAt: state.baseline.created_at, updatedAt: state.baseline.updated_at },
      target: state.target,
      current: { ...state.current, metricKey: state.current.metric_key, measuredAt: state.current.measured_at }
    } as GoalMetricState)));
    fixture.detectChanges();
    return (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ');
  }

  it('renders baseline-only without manufacturing Current', async () => {
    const value = await renderStates([metricState('waist_circumference', { baseline: 91 })]);
    expect(value).toContain('Inicio91 cm');
    expect(value).not.toContain('Objetivo');
    expect(value).toContain('medida fiable');
  });

  it('renders target-only without manufacturing a baseline', async () => {
    const value = await renderStates([metricState('waist_circumference', { target: 84 })]);
    expect(value).toContain('Objetivo84 cm');
    expect(value).not.toContain('Inicio');
  });

  it('renders baseline and target while Current unavailable remains normal', async () => {
    const value = await renderStates([metricState('continuous_swim_distance', { baseline: 200, target: 750 })]);
    expect(value).toContain('Inicio200 m');
    expect(value).toContain('Objetivo750 m');
    expect(value).toContain('medida fiable de tu estado actual');
    expect(value).not.toContain('%');
  });

  it('renders body-weight Current and a factual absolute difference', async () => {
    const value = await renderStates([metricState('body_weight', { baseline: 91, current: 87, target: 84 })]);
    expect(value).toContain('Inicio91 kg');
    expect(value).toContain('Actual87 kg');
    expect(value).toContain('Objetivo84 kg');
    expect(value).toContain('4 kg menos desde el inicio');
    expect(value).not.toContain('%');
  });

  it('renders every configured triathlon dimension without an aggregate score', async () => {
    const value = await renderStates([
      metricState('continuous_swim_distance', { baseline: 200, target: 750 }),
      metricState('continuous_run_distance', { baseline: 2000, target: 5000 }),
      metricState('cycling_distance', { target: 20000 })
    ]);
    expect(value).toContain('Natación continua');
    expect(value).toContain('Carrera continua');
    expect(value).toContain('Bicicleta continua');
    expect(value).not.toContain('Preparación global');
    expect(value).not.toContain('%');
  });
});
