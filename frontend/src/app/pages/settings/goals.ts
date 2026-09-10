import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  Goal,
  GoalClosingStatus,
  GoalCreateInput,
  GoalMetricKey,
  GoalMetricState,
  GoalVariant
} from '../../core/goal.models';
import { GoalService } from '../../core/goal.service';
import { GoalDefinition } from '../home/goal-definition';
import {
  GOAL_VARIANT_OPTIONS,
  ONBOARDING_METRICS,
  goalOption,
  metricKeysForGoal
} from '../onboarding/onboarding.config';

interface MetricEdit {
  baseline: string;
  baselineDate: string;
  target: string;
}

@Component({
  selector: 'app-settings-goals',
  standalone: true,
  imports: [RouterLink, GoalDefinition],
  template: `
    <section class="settings-page goal-settings-page">
      <a class="settings-back" routerLink="/ajustes" aria-label="Volver a Ajustes">← <span>Ajustes</span></a>
      <header class="settings-header">
        <p class="settings-eyebrow">Objetivo y progreso</p>
        <h1>Configura tu objetivo</h1>
        <p>Actualiza el destino y su punto de partida. Tu estado actual procede de mediciones reales y es de solo lectura.</p>
      </header>

      @if (loading()) {
        <section class="settings-panel profile-state" role="status">Cargando objetivos…</section>
      } @else {
        <div class="goal-sections">
          @if (activeGoal(); as goal) {
            <section class="settings-panel goal-summary" aria-labelledby="active-goal-title">
              <h2 id="active-goal-title">{{ goalTitle(goal) }}</h2>
              @if (goal.targetDate) { <p class="goal-date">{{ formatDate(goal.targetDate) }}</p> }
              <span class="goal-status">Activo</span>

              <div class="goal-actions">
                <button type="button" class="settings-action" (click)="startEditGoal()">Editar objetivo</button>
                <button type="button" class="settings-action" (click)="changingGoal.set(!changingGoal())">Cambiar objetivo</button>
                <button type="button" class="settings-action" (click)="confirmation.set('completed')">Marcar como conseguido</button>
                <button type="button" class="settings-danger-action" (click)="confirmation.set('abandoned')">Abandonar objetivo</button>
              </div>

              @if (editingGoal()) {
                <form class="goal-edit" (submit)="saveGoal($event)">
                  @if (variantOptions().length) {
                    <label>Modalidad
                      <select [value]="editVariant() ?? ''" (change)="setVariant($event)">
                        <option value="">Sin modalidad concreta</option>
                        @for (option of variantOptions(); track option.label) { @if (option.value) { <option [value]="option.value">{{ option.label }}</option> } }
                      </select>
                    </label>
                  }
                  <label>Fecha objetivo <span>(opcional)</span>
                    <input type="date" [value]="editTargetDate()" (input)="editTargetDate.set($any($event.target).value)">
                  </label>
                  <div class="goal-actions"><button type="button" class="settings-action" (click)="editingGoal.set(false)">Cancelar</button><button type="submit" class="settings-action primary-action" [disabled]="busy()">Guardar cambios</button></div>
                </form>
              }

              @if (changingGoal()) {
                <div class="goal-edit">
                  <p>Elige primero el nuevo objetivo. El actual solo se abandonará tras tu confirmación.</p>
                  <app-goal-definition [deferCreate]="true" (requested)="requestReplacement($event)" />
                </div>
              }
            </section>

            @if (confirmation(); as action) {
              <section class="confirm-panel" role="dialog" aria-modal="true" aria-labelledby="goal-confirm-title">
                <h3 id="goal-confirm-title">{{ action === 'completed' ? '¿Objetivo conseguido?' : '¿Abandonar este objetivo?' }}</h3>
                <p>{{ action === 'completed' ? 'Se conservará en tu histórico como completado.' : 'No se borrará; permanecerá en tu histórico como abandonado.' }}</p>
                <div class="goal-actions"><button type="button" class="settings-action" (click)="confirmation.set(null)">Cancelar</button><button type="button" [class]="action === 'abandoned' ? 'settings-danger-action' : 'settings-action primary-action'" (click)="closeGoal(action)" [disabled]="busy()">Confirmar</button></div>
              </section>
            }

            @if (replacement()) {
              <section class="confirm-panel" role="dialog" aria-modal="true" aria-labelledby="replace-goal-title">
                <h3 id="replace-goal-title">Cambiar objetivo</h3>
                <p>El objetivo actual se marcará como abandonado y después se creará el nuevo. Esta acción no lo marca como conseguido.</p>
                <div class="goal-actions"><button type="button" class="settings-action" (click)="replacement.set(null)">Cancelar</button><button type="button" class="settings-danger-action" (click)="confirmReplacement()" [disabled]="busy()">Abandonar actual y crear nuevo</button></div>
              </section>
            }

            <section class="settings-panel" aria-labelledby="metrics-title">
              <div class="form-heading"><h2 id="metrics-title">Baseline, target y Current</h2><p>Baseline corrige el punto de partida. Current nunca se edita aquí.</p></div>
              @for (state of metricStates(); track state.metric.id) {
                <article class="metric-card">
                  <h3>{{ metricLabel(state.metric.metricKey) }}</h3>
                  <div class="metric-current"><span>Current · solo lectura</span><strong>{{ currentLabel(state) }}@if (state.current.available && state.current.measuredAt) { <small>{{ formatDate(state.current.measuredAt) }}</small> }</strong></div>
                  <div class="metric-edit">
                    <label>Baseline <span>({{ displayUnit(state.metric.metricKey) }})</span>
                      <input type="number" inputmode="decimal" [min]="metricConfig(state.metric.metricKey).minimum" [max]="metricConfig(state.metric.metricKey).maximum" [step]="metricConfig(state.metric.metricKey).displayUnit === 'km' ? 0.1 : 0.1" [value]="metricEdit(state.metric.id).baseline" (input)="setMetricEdit(state.metric.id, 'baseline', $event)">
                    </label>
                    <label>Fecha del baseline
                      <input type="date" [value]="metricEdit(state.metric.id).baselineDate" (input)="setMetricEdit(state.metric.id, 'baselineDate', $event)">
                    </label>
                    <label>Target <span>({{ displayUnit(state.metric.metricKey) }}, vacío para quitar)</span>
                      <input type="number" inputmode="decimal" [min]="metricConfig(state.metric.metricKey).minimum" [max]="metricConfig(state.metric.metricKey).maximum" step="0.1" [value]="metricEdit(state.metric.id).target" (input)="setMetricEdit(state.metric.id, 'target', $event)">
                    </label>
                    <button type="button" class="settings-action" (click)="saveMetric(state)" [disabled]="busy()">Guardar métrica</button>
                  </div>
                </article>
              } @empty { <p class="profile-state">Este objetivo todavía no tiene métricas de seguimiento.</p> }

              @if (missingMetricKeys().length) {
                <div class="metric-options">
                  @for (key of missingMetricKeys(); track key) { <button type="button" class="settings-action" (click)="addMetric(key)" [disabled]="busy()">Añadir {{ metricLabel(key).toLocaleLowerCase() }}</button> }
                </div>
              }
            </section>
          } @else {
            <section class="settings-panel goal-summary">
              <h2>Sin objetivo activo</h2><p>Puedes crear uno sin repetir el onboarding.</p>
              <app-goal-definition (created)="goalCreated($event)" />
            </section>
          }

          @if (error()) { <p class="settings-status settings-status-error" role="alert">{{ error() }}</p> }
          @if (message()) { <p class="settings-status settings-status-success" role="status">{{ message() }}</p> }

          <section class="settings-panel" aria-labelledby="goal-history-title">
            <div class="form-heading"><h2 id="goal-history-title">Histórico</h2><p>Objetivos anteriores, sin analítica adicional.</p></div>
            <ul class="goal-history">
              @for (goal of closedGoals(); track goal.id) { <li><strong>{{ goalTitle(goal) }}</strong><span>{{ statusLabel(goal.status) }} · {{ formatDate(goal.updatedAt) }}</span></li> }
              @empty { <li><span>Todavía no hay objetivos anteriores.</span></li> }
            </ul>
          </section>
        </div>
      }
    </section>
  `,
  styleUrls: ['./settings.scss', './profile-goals.scss']
})
export class SettingsGoals implements OnInit {
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly activeGoal = signal<Goal | null>(null);
  readonly history = signal<Goal[]>([]);
  readonly metricStates = signal<GoalMetricState[]>([]);
  readonly editingGoal = signal(false);
  readonly changingGoal = signal(false);
  readonly confirmation = signal<GoalClosingStatus | null>(null);
  readonly replacement = signal<GoalCreateInput | null>(null);
  readonly editVariant = signal<GoalVariant | null>(null);
  readonly editTargetDate = signal('');
  readonly metricEdits = signal<Record<string, MetricEdit>>({});
  readonly closedGoals = computed(() => this.history().filter(goal => goal.status !== 'active'));
  readonly variantOptions = computed(() => {
    const kind = this.activeGoal()?.kind;
    return kind ? GOAL_VARIANT_OPTIONS[kind] ?? [] : [];
  });
  readonly missingMetricKeys = computed(() => {
    const goal = this.activeGoal();
    if (!goal) return [];
    const present = new Set(this.metricStates().map(state => state.metric.metricKey));
    return metricKeysForGoal(goal.kind).filter(key => !present.has(key));
  });

  constructor(private readonly goals: GoalService) {}
  async ngOnInit(): Promise<void> { await this.load(); }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    const [active, history] = await Promise.allSettled([this.goals.getActive(), this.goals.list()]);
    if (active.status === 'fulfilled') {
      this.activeGoal.set(active.value);
      if (active.value) await this.loadMetrics(active.value.id);
    } else this.error.set('No se pudo cargar el objetivo activo.');
    if (history.status === 'fulfilled') this.history.set(history.value);
    else this.error.set(this.error() ?? 'No se pudo cargar el histórico de objetivos.');
    this.loading.set(false);
  }

  async loadMetrics(goalId: string): Promise<void> {
    try {
      const states = await this.goals.listMetricStates(goalId);
      this.metricStates.set(states);
      this.metricEdits.set(Object.fromEntries(states.map(state => [state.metric.id, {
        baseline: state.baseline ? String(this.fromCanonical(state.metric.metricKey, state.baseline.value)) : '',
        baselineDate: state.baseline?.measuredAt.slice(0, 10) ?? this.today(),
        target: state.target ? String(this.fromCanonical(state.metric.metricKey, state.target.value)) : ''
      }])));
    } catch {
      this.metricStates.set([]);
      this.error.set('El objetivo está disponible, pero sus métricas no se pudieron cargar.');
    }
  }

  startEditGoal(): void {
    const goal = this.activeGoal(); if (!goal) return;
    this.editVariant.set(goal.variant); this.editTargetDate.set(goal.targetDate ?? '');
    this.editingGoal.set(true); this.error.set(null);
  }

  setVariant(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.editVariant.set(value ? value as GoalVariant : null);
  }

  async saveGoal(event: Event): Promise<void> {
    event.preventDefault(); const goal = this.activeGoal(); if (!goal) return;
    this.busy.set(true); this.error.set(null); this.message.set(null);
    try {
      const updated = await this.goals.update(goal.id, {
        variant: this.editVariant(), targetDate: this.editTargetDate() || null
      });
      this.replaceHistory(updated); this.activeGoal.set(updated); this.editingGoal.set(false);
      this.message.set('Objetivo actualizado.');
    } catch { this.error.set('No se pudo actualizar el objetivo. Revisa la variante y la fecha.'); }
    finally { this.busy.set(false); }
  }

  async closeGoal(status: GoalClosingStatus): Promise<void> {
    const goal = this.activeGoal(); if (!goal) return;
    this.busy.set(true); this.error.set(null);
    try {
      const closed = await this.goals.changeStatus(goal.id, status);
      this.replaceHistory(closed); this.activeGoal.set(null); this.metricStates.set([]);
      this.confirmation.set(null);
      this.message.set(status === 'completed' ? 'Objetivo marcado como conseguido.' : 'Objetivo abandonado.');
    } catch { this.error.set('No se pudo cerrar el objetivo.'); }
    finally { this.busy.set(false); }
  }

  requestReplacement(input: GoalCreateInput): void {
    this.replacement.set(input); this.changingGoal.set(false);
  }

  async confirmReplacement(): Promise<void> {
    const current = this.activeGoal(); const next = this.replacement();
    if (!current || !next) return;
    this.busy.set(true); this.error.set(null); this.message.set(null);
    try {
      const closed = await this.goals.changeStatus(current.id, 'abandoned');
      this.replaceHistory(closed);
      try {
        const created = await this.goals.create(next);
        await this.activateCreated(created);
        this.message.set('Objetivo cambiado. El anterior permanece en el histórico.');
      } catch {
        try {
          const restored = await this.goals.create({
            category: current.category, kind: current.kind,
            variant: current.variant, targetDate: current.targetDate
          });
          await this.activateCreated(restored);
          this.error.set('No se pudo crear el nuevo objetivo. Se restauró el anterior como un nuevo Goal activo.');
        } catch {
          this.activeGoal.set(null); this.metricStates.set([]);
          this.error.set('El objetivo anterior se abandonó, pero no se pudo crear ni restaurar un Goal activo.');
        }
      }
      this.replacement.set(null);
    } catch { this.error.set('No se pudo abandonar el objetivo actual. No se creó ningún Goal nuevo.'); }
    finally { this.busy.set(false); }
  }

  async goalCreated(goal: Goal): Promise<void> { await this.activateCreated(goal); this.message.set('Objetivo creado.'); }

  async addMetric(key: GoalMetricKey): Promise<void> {
    const goal = this.activeGoal(); if (!goal) return;
    this.busy.set(true); this.error.set(null);
    try { await this.goals.createMetric(goal.id, { metricKey: key }); await this.loadMetrics(goal.id); }
    catch { this.error.set('No se pudo añadir esa métrica al objetivo.'); }
    finally { this.busy.set(false); }
  }

  metricEdit(id: string): MetricEdit { return this.metricEdits()[id] ?? { baseline: '', baselineDate: this.today(), target: '' }; }
  setMetricEdit(id: string, field: keyof MetricEdit, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.metricEdits.update(rows => ({ ...rows, [id]: { ...this.metricEdit(id), [field]: value } }));
  }

  async saveMetric(state: GoalMetricState): Promise<void> {
    const goal = this.activeGoal(); if (!goal) return;
    const edit = this.metricEdit(state.metric.id);
    const target = this.parseMetricValue(state.metric.metricKey, edit.target, true);
    const baseline = this.parseMetricValue(state.metric.metricKey, edit.baseline, true);
    if (target === undefined || baseline === undefined ||
      (state.baseline !== null && baseline === null) ||
      (edit.baseline && !edit.baselineDate)) {
      this.error.set('Revisa los valores y la fecha de la métrica.'); return;
    }
    this.busy.set(true); this.error.set(null); this.message.set(null);
    try {
      await this.goals.updateMetricTarget(goal.id, state.metric.id, target);
      if (baseline !== null) await this.goals.putMetricBaseline(goal.id, state.metric.id, {
        value: baseline, measuredAt: edit.baselineDate, sourceType: 'manual'
      });
      await this.loadMetrics(goal.id); this.message.set('Métrica actualizada.');
    } catch { this.error.set('No se pudo actualizar la métrica.'); }
    finally { this.busy.set(false); }
  }

  metricConfig(key: GoalMetricKey) { return ONBOARDING_METRICS[key]; }
  metricLabel(key: GoalMetricKey): string { return ONBOARDING_METRICS[key].label; }
  displayUnit(key: GoalMetricKey): string { return ONBOARDING_METRICS[key].displayUnit; }
  currentLabel(state: GoalMetricState): string {
    return state.current.available && state.current.value !== null
      ? `${this.fromCanonical(state.metric.metricKey, state.current.value).toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${this.displayUnit(state.metric.metricKey)}`
      : 'Sin Current fiable';
  }
  goalTitle(goal: Goal): string {
    const label = goalOption(goal.category, goal.kind)?.label ?? goal.kind;
    const variant = (GOAL_VARIANT_OPTIONS[goal.kind] ?? []).find(item => item.value === goal.variant);
    return variant?.value ? `${label} · ${variant.label}` : label;
  }
  statusLabel(status: Goal['status']): string { return status === 'completed' ? 'Completado' : status === 'abandoned' ? 'Abandonado' : 'Activo'; }
  formatDate(value: string): string {
    const iso = value.includes('T') ? value : `${value}T12:00:00Z`;
    const date = new Date(iso);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(date) : '';
  }

  private async activateCreated(goal: Goal): Promise<void> {
    this.activeGoal.set(goal); this.replaceHistory(goal); await this.loadMetrics(goal.id);
  }
  private replaceHistory(goal: Goal): void {
    this.history.update(rows => [goal, ...rows.filter(item => item.id !== goal.id)]);
  }
  private fromCanonical(key: GoalMetricKey, value: number): number { return value / ONBOARDING_METRICS[key].canonicalMultiplier; }
  private parseMetricValue(key: GoalMetricKey, raw: string, optional: boolean): number | null | undefined {
    if (!raw.trim()) return optional ? null : undefined;
    const display = Number(raw); const config = ONBOARDING_METRICS[key];
    if (!Number.isFinite(display) || display < config.minimum || display > config.maximum) return undefined;
    return display * config.canonicalMultiplier;
  }
  private today(): string { return new Date().toISOString().slice(0, 10); }
}
