import { Component, computed, input } from '@angular/core';
import { GoalMetricState } from '../../core/goal.models';
import { ONBOARDING_METRICS } from '../onboarding/onboarding.config';


@Component({
  selector: 'app-goal-progress',
  standalone: true,
  template: `
    <section class="progress-section" aria-labelledby="goal-progress-title">
      <div class="section-heading">
        <p>Progreso / estado</p>
        <h2 id="goal-progress-title">Tu punto de partida</h2>
      </div>

      @for (state of states(); track state.metric.id) {
        <article class="metric-card">
          <h3>{{ metricLabel(state) }}</h3>
          <div class="metric-values" [class.single]="valueCount(state) === 1">
            @if (state.baseline; as baseline) {
              <div><span>Inicio</span><strong>{{ valueLabel(baseline.value, baseline.unit) }}</strong></div>
            }
            @if (hasCurrent(state)) {
              @if (state.baseline) { <span class="metric-arrow" aria-hidden="true">→</span> }
              <div><span>Actual</span><strong>{{ valueLabel(state.current.value!, state.current.unit) }}</strong></div>
            }
            @if (state.target; as target) {
              @if (state.baseline || hasCurrent(state)) { <span class="metric-arrow" aria-hidden="true">→</span> }
              <div><span>Objetivo</span><strong>{{ valueLabel(target.value, target.unit) }}</strong></div>
            }
          </div>

          @if (differenceLabel(state); as difference) {
            <p class="metric-difference">{{ difference }}</p>
          }
          @if (!state.current.available && (state.baseline || state.target)) {
            <p class="metric-note">{{ unavailableLabel(state) }}</p>
          }
          @if (!state.baseline && !state.target && !state.current.available) {
            <p class="metric-note">Esta métrica todavía no tiene valores registrados.</p>
          }
        </article>
      } @empty {
        <p class="progress-empty">Todavía no has definido una métrica de seguimiento.</p>
      }
    </section>
  `,
  styleUrl: './goal-progress.scss'
})
export class GoalProgress {
  readonly states = input.required<GoalMetricState[]>();

  metricLabel(state: GoalMetricState): string {
    return ONBOARDING_METRICS[state.metric.metricKey].label;
  }

  hasCurrent(state: GoalMetricState): boolean {
    return state.current.available && state.current.value !== null;
  }

  valueCount(state: GoalMetricState): number {
    return Number(Boolean(state.baseline)) +
      Number(this.hasCurrent(state)) + Number(Boolean(state.target));
  }

  valueLabel(value: number, unit: string): string {
    const formatted = value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
    return `${formatted} ${unit}`;
  }

  unavailableLabel(state: GoalMetricState): string {
    return state.current.reason === 'no_measurement_after_baseline'
      ? 'Todavía no hay una medición actual posterior al punto de partida.'
      : 'Todavía no disponemos de una medida fiable de tu estado actual.';
  }

  differenceLabel(state: GoalMetricState): string | null {
    const baseline = state.baseline;
    if (!baseline || !this.hasCurrent(state) ||
      state.current.unit !== baseline.unit || !state.current.measuredAt ||
      Date.parse(state.current.measuredAt) <= Date.parse(baseline.measuredAt)) {
      return null;
    }
    const difference = state.current.value! - baseline.value;
    if (Math.abs(difference) < Number.EPSILON) return 'Sin cambio desde el inicio';
    const amount = this.valueLabel(Math.abs(difference), baseline.unit);
    return `${amount} ${difference < 0 ? 'menos' : 'más'} desde el inicio`;
  }
}
