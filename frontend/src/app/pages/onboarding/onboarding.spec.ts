/** @vitest-environment jsdom */

import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { Goal, GoalKind } from '../../core/goal.models';
import { ONBOARDING_GOALS } from './onboarding.config';
import { Onboarding } from './onboarding';


const goalId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const api = environment.apiUrl;

function goalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: goalId,
    user_id: userId,
    category: 'health',
    kind: 'more_active',
    variant: null,
    target_date: null,
    status: 'active',
    created_by_user_id: userId,
    created_at: '2026-09-10T08:00:00Z',
    updated_at: '2026-09-10T08:00:00Z',
    ...overrides
  };
}

function parsedGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: goalId,
    userId,
    category: 'health',
    kind: 'more_active',
    variant: null,
    targetDate: null,
    status: 'active',
    createdByUserId: userId,
    createdAt: '2026-09-10T08:00:00Z',
    updatedAt: '2026-09-10T08:00:00Z',
    ...overrides
  };
}

describe('Onboarding V2', () => {
  let http: HttpTestingController;
  let router: Router;
  const getAccessToken = vi.fn();
  const getMe = vi.fn();

  beforeEach(async () => {
    getAccessToken.mockReset().mockResolvedValue('access-token');
    getMe.mockReset().mockResolvedValue({
      access_status: 'active',
      role: 'user',
      onboarding_completed: true
    });
    await TestBed.configureTestingModule({
      imports: [Onboarding],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { getAccessToken, getMe }
        }
      ]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  async function tick(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  async function create(
    active: Record<string, unknown> | null = null,
    weights: unknown[] = []
  ) {
    const fixture = TestBed.createComponent(Onboarding);
    fixture.detectChanges();
    await tick();
    http.expectOne(`${api}/goals/active`).flush(active);
    http.expectOne(`${api}/health/weights`).flush(weights);
    await tick();
    if (active) {
      http.expectOne(`${api}/goals/${goalId}/metric-states`).flush([]);
      await tick();
    }
    fixture.detectChanges();
    return fixture;
  }

  function choose(component: Onboarding, kind: GoalKind): void {
    component.selectGoal(
      ONBOARDING_GOALS.find(option => option.kind === kind)!
    );
  }

  it('maps every visible option explicitly to the Goal taxonomy', () => {
    expect(ONBOARDING_GOALS.map(option => [
      option.category,
      option.kind
    ])).toEqual([
      ['health', 'more_active'],
      ['health', 'general_health'],
      ['body_composition', 'fat_loss'],
      ['body_composition', 'recomposition'],
      ['strength', 'muscle_gain'],
      ['strength', 'strength_gain'],
      ['strength', 'return_to_training'],
      ['endurance', 'running'],
      ['endurance', 'swimming'],
      ['endurance', 'cycling'],
      ['endurance', 'triathlon'],
      ['endurance', 'duathlon'],
      ['sport_performance', 'sport_performance']
    ]);
  });

  it('health keeps the flow minimal', async () => {
    const fixture = await create();
    choose(fixture.componentInstance, 'more_active');
    expect(fixture.componentInstance.stepSequence()).toEqual([1, 3, 5]);
    fixture.componentInstance.currentStep.set(3);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('lesión o molestia');
    expect(text).not.toContain('experiencia entrenando fuerza');
  });

  it('running shows only its real variants', async () => {
    const fixture = await create();
    choose(fixture.componentInstance, 'running');
    expect(fixture.componentInstance.variantOptions()).toEqual([
      { value: '5k', label: '5K' },
      { value: '10k', label: '10K' },
      { value: 'half_marathon', label: 'Media maratón' },
      { value: null, label: 'Sin distancia concreta' }
    ]);
  });

  it('triathlon exposes Sprint, Olympic and no variant', async () => {
    const fixture = await create();
    choose(fixture.componentInstance, 'triathlon');
    expect(fixture.componentInstance.variantOptions().map(
      item => item.value
    )).toEqual(['sprint', 'olympic', null]);
  });

  it('strength never shows endurance metrics', async () => {
    const fixture = await create();
    choose(fixture.componentInstance, 'strength_gain');
    expect(fixture.componentInstance.enduranceMetricKeys()).toEqual([]);
    expect(fixture.componentInstance.showsMetricStep()).toBe(false);
  });

  it('running omits GymOS weight and exercise questions', async () => {
    const fixture = await create();
    choose(fixture.componentInstance, 'running');
    fixture.componentInstance.currentStep.set(3);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('ejercicios favoritos');
    expect(text).not.toContain('equipamiento disponible');
    expect(text).not.toContain('peso actual');
  });

  it('baseline and target remain optional', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    choose(component, 'fat_loss');
    component.selectBodyMetric('body_weight');
    component.bodyBaselineChoice.set('later');
    expect(component.validationForStep(4)).toBeNull();
    expect(component.bodyTargetValue()).toBeNull();
  });

  it('includes an explicit target in the summary when present', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    choose(component, 'fat_loss');
    component.selectBodyMetric('waist_circumference');
    component.bodyTargetValue.set(84);
    component.currentStep.set(5);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent)
      .toContain('Cifra objetivo: Cintura: 84 cm');
  });

  it('offers a real recent weight for reuse', async () => {
    const fixture = await create(null, [{
      id: 'weight-1',
      measurementDate: '2026-09-09',
      weightKg: 77.1,
      source: 'scale'
    }]);
    const component = fixture.componentInstance;
    choose(component, 'fat_loss');
    component.selectBodyMetric('body_weight');
    component.currentStep.set(4);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Usar 77.1 kg');
  });

  it('can continue without an existing weight', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    choose(component, 'fat_loss');
    component.selectBodyMetric('body_weight');
    component.bodyBaselineChoice.set('later');
    expect(component.validationForStep(4)).toBeNull();
  });

  it('invalid target blocks advancement', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    choose(component, 'fat_loss');
    component.selectBodyMetric('body_weight');
    component.bodyTargetValue.set(500);
    component.currentStep.set(4);
    component.nextStep();
    expect(component.currentStep()).toBe(4);
    expect(component.error()).toContain('target');
  });

  it('invalid baseline blocks only that optional datum', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    choose(component, 'running');
    component.selectVariant(null);
    component.runBaseline.set(-1);
    expect(component.validationForStep(4)).toContain('Carrera');
    component.runBaseline.set(null);
    expect(component.validationForStep(4)).toBeNull();
  });

  it('back navigation keeps local answers', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    choose(component, 'triathlon');
    component.selectVariant('sprint');
    component.currentStep.set(4);
    component.swimBaseline.set(200);
    component.previousStep();
    expect(component.swimBaseline()).toBe(200);
  });

  it('creates the selected Goal before completion', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    choose(component, 'more_active');
    component.currentStep.set(5);
    const completion = component.completeOnboarding();
    await tick();
    const goalRequest = http.expectOne(`${api}/goals`);
    expect(goalRequest.request.body).toEqual({
      category: 'health',
      kind: 'more_active',
      variant: null,
      target_date: null
    });
    goalRequest.flush(goalRow());
    await tick();
    const onboarding = http.expectOne(`${api}/onboarding/complete`);
    expect(onboarding.request.body).toEqual({
      goal_id: goalId,
      profile: {}
    });
    onboarding.flush({ onboarding_completed: true, routine: null });
    await completion;
    expect(component.completed()).toBe(true);
  });

  it('retry reuses the Goal created by a partial attempt', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    choose(component, 'more_active');
    component.currentStep.set(5);
    const first = component.completeOnboarding();
    await tick();
    http.expectOne(`${api}/goals`).flush(goalRow());
    await tick();
    http.expectOne(`${api}/onboarding/complete`).flush(
      { detail: 'Temporary failure' },
      { status: 502, statusText: 'Bad Gateway' }
    );
    await first;

    const retry = component.completeOnboarding();
    await tick();
    const reused = http.expectOne(`${api}/goals/${goalId}`);
    expect(reused.request.method).toBe('PATCH');
    reused.flush(goalRow());
    await tick();
    http.expectOne(`${api}/onboarding/complete`).flush({
      onboarding_completed: true,
      routine: null
    });
    await retry;
    http.expectNone(request =>
      request.url === `${api}/goals` && request.method === 'POST'
    );
  });

  it('recovers an active Goal instead of creating another', async () => {
    const fixture = await create(goalRow({
      category: 'endurance',
      kind: 'running',
      variant: '10k'
    }));
    expect(fixture.componentInstance.selectedGoal()?.kind).toBe('running');
    expect(fixture.componentInstance.selectedVariant()).toBe('10k');
  });

  it('a required Goal failure never calls completion', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    choose(component, 'more_active');
    component.currentStep.set(5);
    const completion = component.completeOnboarding();
    await tick();
    http.expectOne(`${api}/goals`).flush(
      { detail: 'Goal unavailable' },
      { status: 503, statusText: 'Unavailable' }
    );
    await completion;
    http.expectNone(`${api}/onboarding/complete`);
    expect(component.completed()).toBe(false);
  });

  it('optional metric failure is recoverable', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    choose(component, 'fat_loss');
    component.selectBodyMetric('body_weight');
    component.bodyTargetValue.set(80);
    component.currentStep.set(5);
    const completion = component.completeOnboarding();
    await tick();
    http.expectOne(`${api}/goals`).flush(goalRow({
      category: 'body_composition',
      kind: 'fat_loss'
    }));
    await tick();
    http.expectOne(`${api}/goals/${goalId}/metrics`).flush(
      { detail: 'Metrics unavailable' },
      { status: 502, statusText: 'Bad Gateway' }
    );
    await tick();
    http.expectOne(`${api}/onboarding/complete`).flush({
      onboarding_completed: true,
      routine: null
    });
    await completion;
    expect(component.completed()).toBe(true);
    expect(component.optionalWarning()).toContain('opcionales');
  });

  it('preserves observed weight provenance in the baseline', async () => {
    const fixture = await create(null, [{
      id: 'weight-1',
      measurementDate: '2026-09-09',
      weightKg: 77.1,
      source: 'scale'
    }]);
    const component = fixture.componentInstance;
    choose(component, 'fat_loss');
    component.selectBodyMetric('body_weight');
    component.bodyBaselineChoice.set('observed');
    component.currentStep.set(5);
    const completion = component.completeOnboarding();
    await tick();
    http.expectOne(`${api}/goals`).flush(goalRow({
      category: 'body_composition', kind: 'fat_loss'
    }));
    await tick();
    http.expectOne(`${api}/goals/${goalId}/metrics`).flush([]);
    await tick();
    http.expectOne(`${api}/goals/${goalId}/metrics`).flush({
      id: 'metric-1',
      goal_id: goalId,
      metric_key: 'body_weight',
      unit: 'kg',
      target_value: null,
      created_at: '2026-09-10T08:00:00Z',
      updated_at: '2026-09-10T08:00:00Z'
    });
    await tick();
    const baseline = http.expectOne(
      `${api}/goals/${goalId}/metrics/metric-1/baseline`
    );
    expect(baseline.request.body).toMatchObject({
      value: 77.1,
      measured_at: '2026-09-09',
      source_type: 'scale',
      source_domain: 'health_weight_entries',
      source_record_id: 'weight-1'
    });
    baseline.flush({
      id: 'baseline-1',
      goal_metric_id: 'metric-1',
      value: 77.1,
      unit: 'kg',
      measured_at: '2026-09-09',
      source_type: 'scale',
      source_domain: 'health_weight_entries',
      source_record_id: 'weight-1',
      created_at: '2026-09-10T08:00:00Z',
      updated_at: '2026-09-10T08:00:00Z'
    });
    await tick();
    http.expectOne(`${api}/onboarding/complete`).flush({
      onboarding_completed: true,
      routine: null
    });
    await completion;
  });

  it('renders a compact final summary without progress claims', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    choose(component, 'triathlon');
    component.selectVariant('sprint');
    component.targetDate.set('2027-06-21');
    component.swimBaseline.set(200);
    component.runBaseline.set(5);
    component.currentStep.set(5);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Triatlón · Sprint');
    expect(text).toContain('2027-06-21');
    expect(text).toContain('Natación continua: 200 m');
    expect(text).toContain('Carrera continua: 5 km');
    expect(text).not.toContain('%');
    expect(text).not.toContain('readiness');
  });

  it('the final CTA refreshes access and redirects home', async () => {
    const fixture = await create();
    const navigate = vi.spyOn(router, 'navigateByUrl')
      .mockResolvedValue(true);
    await fixture.componentInstance.goHome();
    expect(getMe).toHaveBeenCalledWith(true);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('completion never requests routine generation', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    choose(component, 'more_active');
    component.currentStep.set(5);
    const completion = component.completeOnboarding();
    await tick();
    http.expectOne(`${api}/goals`).flush(goalRow());
    await tick();
    http.expectOne(`${api}/onboarding/complete`).flush({
      onboarding_completed: true,
      routine: null
    });
    await completion;
    http.expectNone(`${api}/routines/generate`);
  });
});
