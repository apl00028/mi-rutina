import { Component, computed, input, output, signal } from '@angular/core';
import {
  Goal,
  GoalCreateInput,
  GoalVariant
} from '../../core/goal.models';
import { GoalService } from '../../core/goal.service';
import {
  GOAL_VARIANT_OPTIONS,
  ONBOARDING_GOALS,
  OnboardingGoalOption
} from '../onboarding/onboarding.config';


@Component({
  selector: 'app-goal-definition',
  standalone: true,
  template: `
    @if (!editing()) {
      <button type="button" class="goal-cta" (click)="editing.set(true)">
        Definir objetivo
      </button>
    } @else {
      <form class="goal-form" (submit)="save($event)" aria-label="Definir objetivo">
        <label for="home-goal-kind">¿Qué quieres conseguir?</label>
        <select id="home-goal-kind" required (change)="selectGoal($event)">
          <option value="">Selecciona un objetivo</option>
          @for (option of goalOptions; track option.category + ':' + option.kind) {
            <option [value]="option.category + ':' + option.kind">{{ option.label }}</option>
          }
        </select>

        @if (variantOptions().length) {
          <label for="home-goal-variant">Modalidad</label>
          <select id="home-goal-variant" (change)="selectVariant($event)">
            <option value="">Sin modalidad concreta</option>
            @for (option of variantOptions(); track option.label) {
              @if (option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            }
          </select>
        }

        @if (showsTargetDate()) {
          <label for="home-goal-date">Fecha objetivo <span>(opcional)</span></label>
          <input id="home-goal-date" type="date" (input)="setTargetDate($event)">
        }

        @if (error()) {
          <p class="goal-form-error" role="alert">{{ error() }}</p>
        }

        <div class="goal-form-actions">
          <button type="button" class="secondary" (click)="cancel()">Cancelar</button>
          <button type="submit" [disabled]="saving() || !selectedGoal()">
            {{ saving() ? 'Guardando…' : 'Guardar objetivo' }}
          </button>
        </div>
      </form>
    }
  `,
  styles: [`
    :host { display: block; }
    .goal-cta, .goal-form button {
      min-height: 44px; border: 0; border-radius: var(--aptus-radius-sm);
      padding: 0 16px; background: var(--aptus-brand); color: var(--aptus-accent-contrast);
      font: inherit; font-weight: 800; cursor: pointer;
    }
    .goal-form { display: grid; gap: 10px; margin-top: 14px; }
    label { font-size: .82rem; font-weight: 800; }
    label span { color: var(--aptus-text-muted); font-weight: 500; }
    select, input {
      width: 100%; min-height: 44px; box-sizing: border-box; border: 1px solid var(--aptus-border);
      border-radius: var(--aptus-radius-sm); padding: 0 11px; background: var(--aptus-surface);
      color: var(--aptus-text); font: inherit;
    }
    .goal-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
    .goal-form .secondary { border: 1px solid var(--aptus-border); background: transparent; color: var(--aptus-text); }
    button:disabled { opacity: .55; cursor: default; }
    button:focus-visible, select:focus-visible, input:focus-visible { outline: 3px solid var(--aptus-focus-ring); outline-offset: 2px; }
    .goal-form-error { margin: 0; color: var(--aptus-danger, #b42318); font-size: .8rem; }
    @media (max-width: 520px) { .goal-form-actions { flex-direction: column-reverse; } .goal-form-actions button { width: 100%; } }
  `]
})
export class GoalDefinition {
  readonly deferCreate = input(false);
  readonly created = output<Goal>();
  readonly requested = output<GoalCreateInput>();
  readonly goalOptions = ONBOARDING_GOALS;
  readonly editing = signal(false);
  readonly selectedGoal = signal<OnboardingGoalOption | null>(null);
  readonly selectedVariant = signal<GoalVariant | null>(null);
  readonly targetDate = signal('');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly variantOptions = computed(() => {
    const kind = this.selectedGoal()?.kind;
    return kind ? GOAL_VARIANT_OPTIONS[kind] ?? [] : [];
  });

  constructor(private readonly goals: GoalService) {}

  selectGoal(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const [category, kind] = value.split(':');
    this.selectedGoal.set(
      ONBOARDING_GOALS.find(option =>
        option.category === category && option.kind === kind
      ) ?? null
    );
    this.selectedVariant.set(null);
    this.error.set(null);
  }

  selectVariant(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedVariant.set(value ? value as GoalVariant : null);
  }

  setTargetDate(event: Event): void {
    this.targetDate.set((event.target as HTMLInputElement).value);
  }

  showsTargetDate(): boolean {
    return [
      'running', 'swimming', 'cycling', 'triathlon', 'duathlon',
      'sport_performance'
    ].includes(this.selectedGoal()?.kind ?? '');
  }

  cancel(): void {
    this.editing.set(false);
    this.selectedGoal.set(null);
    this.selectedVariant.set(null);
    this.targetDate.set('');
    this.error.set(null);
  }

  async save(event: Event): Promise<void> {
    event.preventDefault();
    const selected = this.selectedGoal();
    if (!selected || this.saving()) return;
    const input: GoalCreateInput = {
      category: selected.category,
      kind: selected.kind,
      variant: this.selectedVariant(),
      targetDate: this.targetDate() || null
    };
    if (this.deferCreate()) {
      this.requested.emit(input);
      this.cancel();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const goal = await this.goals.create(input);
      this.created.emit(goal);
      this.cancel();
    } catch {
      this.error.set('No se pudo guardar el objetivo. Inténtalo de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }
}
