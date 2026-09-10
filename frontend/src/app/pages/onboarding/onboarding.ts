import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideCheck,
  LucideTarget
} from '@lucide/angular';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import {
  Goal,
  GoalCreateInput,
  GoalMetricKey,
  GoalMetricSourceType,
  GoalMetricState,
  GoalVariant
} from '../../core/goal.models';
import { GoalService } from '../../core/goal.service';
import {
  GOAL_VARIANT_OPTIONS,
  ONBOARDING_GOALS,
  ONBOARDING_METRICS,
  OnboardingGoalOption,
  goalOption
} from './onboarding.config';

interface WeightEntryResponse {
  id: string;
  measurementDate: string;
  weightKg: number;
  source: 'manual' | 'imported' | 'scale';
}

interface OnboardingCompleteResponse {
  onboarding_completed: boolean;
}

interface OptionalMetricInput {
  key: GoalMetricKey;
  targetValue: number | null;
  baseline: {
    value: number;
    measuredAt: string;
    sourceType: GoalMetricSourceType;
    sourceDomain?: 'health_weight_entries';
    sourceRecordId?: string;
  } | null;
}

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideArrowLeft,
    LucideArrowRight,
    LucideCheck,
    LucideTarget
  ],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss'
})
export class Onboarding implements OnInit {
  readonly goalOptions = ONBOARDING_GOALS;
  readonly metricOptions = ONBOARDING_METRICS;

  currentStep = signal(1);
  selectedGoal = signal<OnboardingGoalOption | null>(null);
  selectedVariant = signal<GoalVariant | null>(null);
  variantChosen = signal(false);
  targetDate = signal('');
  strengthExperience = signal('');
  hasLimitations = signal(false);
  limitationNotes = signal('');
  bodyMetricKey = signal<
    'body_weight' | 'waist_circumference' | null
  >(null);
  bodyTargetValue = signal<number | null>(null);
  bodyBaselineChoice = signal<
    'later' | 'observed' | 'manual'
  >('later');
  bodyBaselineValue = signal<number | null>(null);
  observedWeightBaseline = signal<
    OptionalMetricInput['baseline']
  >(null);
  swimBaseline = signal<number | null>(null);
  runBaseline = signal<number | null>(null);
  cyclingBaseline = signal<number | null>(null);
  activeGoal = signal<Goal | null>(null);
  latestWeight = signal<WeightEntryResponse | null>(null);
  loading = signal(true);
  completing = signal(false);
  completed = signal(false);
  error = signal<string | null>(null);
  optionalWarning = signal<string | null>(null);

  readonly variantOptions = computed(() => {
    const kind = this.selectedGoal()?.kind;
    return kind ? GOAL_VARIANT_OPTIONS[kind] ?? [] : [];
  });

  readonly stepSequence = computed(() => {
    const steps = [1];
    if (this.variantOptions().length > 0 || this.showsTargetDate()) {
      steps.push(2);
    }
    steps.push(3);
    if (this.showsMetricStep()) steps.push(4);
    steps.push(5);
    return steps;
  });

  readonly progressLabel = computed(() => {
    const index = this.stepSequence().indexOf(this.currentStep());
    return `${Math.max(index, 0) + 1} de ${this.stepSequence().length}`;
  });

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
    private readonly goals: GoalService,
    private readonly router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    const [activeResult] = await Promise.allSettled([
      this.goals.getActive(),
      this.loadLatestWeight()
    ]);
    if (activeResult.status === 'fulfilled' && activeResult.value) {
      await this.recoverActiveGoal(activeResult.value);
    } else if (activeResult.status === 'rejected') {
      this.error.set(
        'No hemos podido comprobar tu objetivo. Puedes reintentarlo al finalizar.'
      );
    }
    this.loading.set(false);
  }

  private async authHeaders(): Promise<HttpHeaders> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Necesitas iniciar sesión.');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private async loadLatestWeight(): Promise<void> {
    try {
      const entries = await firstValueFrom(
        this.http.get<WeightEntryResponse[]>(
          `${environment.apiUrl}/health/weights`,
          { headers: await this.authHeaders() }
        )
      );
      const valid = entries.filter(
        entry => Number.isFinite(entry.weightKg) && entry.measurementDate
      );
      this.latestWeight.set(valid.sort(
        (left, right) => right.measurementDate.localeCompare(
          left.measurementDate
        )
      )[0] ?? null);
    } catch {
      this.latestWeight.set(null);
    }
  }

  private async recoverActiveGoal(goal: Goal): Promise<void> {
    this.activeGoal.set(goal);
    this.selectedGoal.set(goalOption(goal.category, goal.kind) ?? null);
    this.selectedVariant.set(goal.variant);
    this.variantChosen.set(true);
    this.targetDate.set(goal.targetDate ?? '');
    try {
      const states = await this.goals.listMetricStates(goal.id);
      this.recoverMetricState(states);
    } catch {
      this.optionalWarning.set(
        'Tu objetivo se ha recuperado, pero algunos datos opcionales no están disponibles.'
      );
    }
  }

  private recoverMetricState(states: GoalMetricState[]): void {
    for (const state of states) {
      const key = state.metric.metricKey;
      if (key === 'body_weight' || key === 'waist_circumference') {
        this.bodyMetricKey.set(key);
        this.bodyTargetValue.set(state.target?.value ?? null);
        if (state.baseline) {
          this.bodyBaselineValue.set(state.baseline.value);
          this.bodyBaselineChoice.set(
            state.baseline.sourceDomain === 'health_weight_entries'
              ? 'observed'
              : 'manual'
          );
          if (state.baseline.sourceDomain === 'health_weight_entries') {
            this.observedWeightBaseline.set({
              value: state.baseline.value,
              measuredAt: state.baseline.measuredAt,
              sourceType: state.baseline.sourceType,
              sourceDomain: 'health_weight_entries',
              sourceRecordId: state.baseline.sourceRecordId ?? undefined
            });
          }
        }
      } else if (state.baseline) {
        this.setEnduranceBaseline(
          key,
          this.fromCanonical(key, state.baseline.value)
        );
      }
    }
  }

  selectGoal(option: OnboardingGoalOption): void {
    if (this.selectedGoal()?.kind === option.kind) return;
    this.selectedGoal.set(option);
    this.selectedVariant.set(null);
    this.variantChosen.set(false);
    this.targetDate.set('');
    this.bodyMetricKey.set(null);
    this.bodyTargetValue.set(null);
    this.bodyBaselineChoice.set('later');
    this.bodyBaselineValue.set(null);
    this.observedWeightBaseline.set(null);
    this.swimBaseline.set(null);
    this.runBaseline.set(null);
    this.cyclingBaseline.set(null);
    this.error.set(null);
  }

  selectVariant(value: GoalVariant | null): void {
    this.selectedVariant.set(value);
    this.variantChosen.set(true);
    this.error.set(null);
  }

  selectBodyMetric(
    value: 'body_weight' | 'waist_circumference' | null
  ): void {
    this.bodyMetricKey.set(value);
    this.bodyTargetValue.set(null);
    this.bodyBaselineValue.set(null);
    this.observedWeightBaseline.set(null);
    this.bodyBaselineChoice.set('later');
  }

  setLimitations(value: boolean): void {
    this.hasLimitations.set(value);
    if (!value) this.limitationNotes.set('');
  }

  showsTargetDate(): boolean {
    return [
      'running',
      'swimming',
      'cycling',
      'triathlon',
      'duathlon',
      'sport_performance'
    ].includes(this.selectedGoal()?.kind ?? '');
  }

  showsMetricStep(): boolean {
    const category = this.selectedGoal()?.category;
    return category === 'body_composition' || category === 'endurance';
  }

  isStrength(): boolean {
    return this.selectedGoal()?.category === 'strength';
  }

  enduranceMetricKeys(): GoalMetricKey[] {
    switch (this.selectedGoal()?.kind) {
      case 'running': return ['continuous_run_distance'];
      case 'swimming': return ['continuous_swim_distance'];
      case 'cycling': return ['cycling_distance'];
      case 'triathlon': return [
        'continuous_swim_distance',
        'continuous_run_distance',
        'cycling_distance'
      ];
      case 'duathlon': return [
        'continuous_run_distance',
        'cycling_distance'
      ];
      default: return [];
    }
  }

  enduranceBaseline(key: GoalMetricKey): number | null {
    if (key === 'continuous_swim_distance') return this.swimBaseline();
    if (key === 'continuous_run_distance') return this.runBaseline();
    if (key === 'cycling_distance') return this.cyclingBaseline();
    return null;
  }

  setEnduranceBaseline(key: GoalMetricKey, value: number | null): void {
    if (key === 'continuous_swim_distance') this.swimBaseline.set(value);
    if (key === 'continuous_run_distance') this.runBaseline.set(value);
    if (key === 'cycling_distance') this.cyclingBaseline.set(value);
  }

  updateEnduranceBaseline(key: GoalMetricKey, value: string): void {
    this.setEnduranceBaseline(key, value === '' ? null : Number(value));
  }

  private validateDate(): string | null {
    const value = this.targetDate();
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
      ? 'Introduce una fecha objetivo válida.'
      : null;
  }

  private metricValueError(
    key: GoalMetricKey,
    value: number | null,
    label: string
  ): string | null {
    if (value === null) return null;
    const metric = ONBOARDING_METRICS[key];
    return Number.isFinite(value) &&
      value >= metric.minimum &&
      value <= metric.maximum
      ? null
      : `${label} no tiene un valor válido.`;
  }

  validationForStep(step = this.currentStep()): string | null {
    if (step === 1 && !this.selectedGoal()) {
      return 'Elige qué quieres conseguir.';
    }
    if (step === 2) {
      if (this.variantOptions().length && !this.variantChosen()) {
        return 'Elige una modalidad o continúa sin una concreta.';
      }
      return this.validateDate();
    }
    if (step === 3) {
      if (this.isStrength() && !this.strengthExperience()) {
        return 'Indica tu experiencia para adaptar los próximos pasos.';
      }
      if (this.hasLimitations() && !this.limitationNotes().trim()) {
        return 'Describe brevemente la molestia o limitación.';
      }
    }
    if (step === 4) {
      const bodyKey = this.bodyMetricKey();
      if (bodyKey) {
        const targetError = this.metricValueError(
          bodyKey,
          this.bodyTargetValue(),
          'El target'
        );
        if (targetError) return targetError;
        if (
          this.bodyBaselineChoice() === 'observed' &&
          (
            bodyKey !== 'body_weight' ||
            (!this.latestWeight() && !this.observedWeightBaseline())
          )
        ) {
          return 'No hay un peso reciente que podamos reutilizar.';
        }
        if (this.bodyBaselineChoice() === 'manual') {
          const baselineError = this.metricValueError(
            bodyKey,
            this.bodyBaselineValue(),
            'El punto de partida'
          );
          if (baselineError) return baselineError;
          if (this.bodyBaselineValue() === null) {
            return 'Introduce el punto de partida o elige configurarlo más tarde.';
          }
        }
      }
      for (const key of this.enduranceMetricKeys()) {
        const baselineError = this.metricValueError(
          key,
          this.enduranceBaseline(key),
          ONBOARDING_METRICS[key].label
        );
        if (baselineError) return baselineError;
      }
    }
    return null;
  }

  nextStep(): void {
    const validation = this.validationForStep();
    if (validation) {
      this.error.set(validation);
      return;
    }
    const steps = this.stepSequence();
    const index = steps.indexOf(this.currentStep());
    if (index < steps.length - 1) {
      this.currentStep.set(steps[index + 1]);
      this.error.set(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  previousStep(): void {
    const steps = this.stepSequence();
    const index = steps.indexOf(this.currentStep());
    if (index > 0) {
      this.currentStep.set(steps[index - 1]);
      this.error.set(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  goalTitle(): string {
    const goal = this.selectedGoal();
    if (!goal) return '';
    const variant = this.variantOptions().find(
      option => option.value === this.selectedVariant()
    );
    return variant?.value ? `${goal.label} · ${variant.label}` : goal.label;
  }

  baselineSummary(): string[] {
    const rows: string[] = [];
    const bodyKey = this.bodyMetricKey();
    if (bodyKey && this.bodyBaselineChoice() !== 'later') {
      const value = this.bodyBaselineChoice() === 'observed'
        ? this.observedWeightBaseline()?.value ??
          this.latestWeight()?.weightKg ?? null
        : this.bodyBaselineValue();
      if (value !== null) {
        rows.push(
          `${ONBOARDING_METRICS[bodyKey].label}: ${value} ${ONBOARDING_METRICS[bodyKey].displayUnit}`
        );
      }
    }
    for (const key of this.enduranceMetricKeys()) {
      const value = this.enduranceBaseline(key);
      if (value !== null) {
        rows.push(
          `${ONBOARDING_METRICS[key].label}: ${value} ${ONBOARDING_METRICS[key].displayUnit}`
        );
      }
    }
    return rows;
  }

  targetSummary(): string | null {
    const key = this.bodyMetricKey();
    const value = this.bodyTargetValue();
    if (!key || value === null) return null;
    return `${ONBOARDING_METRICS[key].label}: ${value} ${ONBOARDING_METRICS[key].displayUnit}`;
  }

  private toCanonical(key: GoalMetricKey, value: number): number {
    return value * ONBOARDING_METRICS[key].canonicalMultiplier;
  }

  private fromCanonical(key: GoalMetricKey, value: number): number {
    return value / ONBOARDING_METRICS[key].canonicalMultiplier;
  }

  private optionalMetricInputs(): OptionalMetricInput[] {
    const inputs: OptionalMetricInput[] = [];
    const bodyKey = this.bodyMetricKey();
    if (bodyKey) {
      let baseline: OptionalMetricInput['baseline'] = null;
      if (this.bodyBaselineChoice() === 'observed') {
        baseline = this.observedWeightBaseline();
        if (!baseline && this.latestWeight()) {
          const weight = this.latestWeight()!;
          baseline = {
            value: weight.weightKg,
            measuredAt: weight.measurementDate,
            sourceType: weight.source,
            sourceDomain: 'health_weight_entries',
            sourceRecordId: weight.id
          };
        }
      } else if (
        this.bodyBaselineChoice() === 'manual' &&
        this.bodyBaselineValue() !== null
      ) {
        baseline = {
          value: this.bodyBaselineValue()!,
          measuredAt: new Date().toISOString().slice(0, 10),
          sourceType: 'manual'
        };
      }
      inputs.push({
        key: bodyKey,
        targetValue: this.bodyTargetValue(),
        baseline
      });
    }
    for (const key of this.enduranceMetricKeys()) {
      const value = this.enduranceBaseline(key);
      if (value !== null) {
        inputs.push({
          key,
          targetValue: null,
          baseline: {
            value: this.toCanonical(key, value),
            measuredAt: new Date().toISOString().slice(0, 10),
            sourceType: 'manual'
          }
        });
      }
    }
    return inputs;
  }

  private async ensureGoal(): Promise<Goal> {
    const selected = this.selectedGoal();
    if (!selected) throw new Error('Elige un objetivo.');
    const input: GoalCreateInput = {
      category: selected.category,
      kind: selected.kind,
      variant: this.selectedVariant(),
      targetDate: this.targetDate() || null
    };
    const current = this.activeGoal();
    if (current) {
      return await this.saveAgainstCurrent(current, input);
    }
    try {
      const created = await this.goals.create(input);
      this.activeGoal.set(created);
      return created;
    } catch (error: any) {
      if (error?.status === 409) {
        const recovered = await this.goals.getActive();
        if (recovered) {
          return await this.saveAgainstCurrent(recovered, input);
        }
      }
      throw error;
    }
  }

  private async saveAgainstCurrent(
    current: Goal,
    input: GoalCreateInput
  ): Promise<Goal> {
    if (
      current.category === input.category &&
      current.kind === input.kind
    ) {
      const updated = await this.goals.update(current.id, input);
      this.activeGoal.set(updated);
      return updated;
    }
    await this.goals.changeStatus(current.id, 'abandoned');
    this.activeGoal.set(null);
    const created = await this.goals.create(input);
    this.activeGoal.set(created);
    return created;
  }

  private async persistOptionalMetrics(goal: Goal): Promise<void> {
    const desired = this.optionalMetricInputs();
    if (!desired.length) return;
    let metrics = await this.goals.listMetrics(goal.id);
    const failures: string[] = [];
    for (const input of desired) {
      try {
        let metric = metrics.find(item => item.metricKey === input.key);
        if (!metric) {
          metric = await this.goals.createMetric(goal.id, {
            metricKey: input.key,
            targetValue: input.targetValue
          });
          metrics = [...metrics, metric];
        } else if (metric.targetValue !== input.targetValue) {
          metric = await this.goals.updateMetricTarget(
            goal.id,
            metric.id,
            input.targetValue
          );
        }
        if (input.baseline) {
          await this.goals.putMetricBaseline(
            goal.id,
            metric.id,
            input.baseline
          );
        }
      } catch {
        failures.push(ONBOARDING_METRICS[input.key].label);
      }
    }
    if (failures.length) {
      this.optionalWarning.set(
        `Tu objetivo se guardó. Podrás completar más tarde: ${failures.join(', ')}.`
      );
    }
  }

  private profilePayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (this.isStrength()) {
      payload['experience_level'] = this.strengthExperience();
    }
    if (this.hasLimitations() && this.limitationNotes().trim()) {
      payload['injuries'] = [this.limitationNotes().trim()];
    }
    return payload;
  }

  private allStepsValid(): string | null {
    for (const step of this.stepSequence()) {
      const error = this.validationForStep(step);
      if (error) return error;
    }
    return null;
  }

  async completeOnboarding(): Promise<void> {
    if (this.completing()) return;
    const validation = this.allStepsValid();
    if (validation) {
      this.error.set(validation);
      return;
    }
    this.completing.set(true);
    this.error.set(null);
    this.optionalWarning.set(null);
    try {
      const goal = await this.ensureGoal();
      try {
        await this.persistOptionalMetrics(goal);
      } catch {
        this.optionalWarning.set(
          'Tu objetivo se guardó. Los datos opcionales se podrán completar más tarde.'
        );
      }
      const response = await firstValueFrom(
        this.http.post<OnboardingCompleteResponse>(
          `${environment.apiUrl}/onboarding/complete`,
          { goal_id: goal.id, profile: this.profilePayload() },
          { headers: await this.authHeaders() }
        )
      );
      if (!response.onboarding_completed) {
        throw new Error('No se pudo completar el onboarding.');
      }
      this.completed.set(true);
    } catch (error: any) {
      this.error.set(
        error?.error?.detail ??
        error?.message ??
        'No se pudo completar el onboarding. Inténtalo de nuevo.'
      );
    } finally {
      this.completing.set(false);
    }
  }

  async goHome(): Promise<void> {
    try {
      await this.auth.getMe(true);
    } catch {
      // The access guard remains the authority if refresh is unavailable.
    }
    await this.router.navigateByUrl('/');
  }
}
