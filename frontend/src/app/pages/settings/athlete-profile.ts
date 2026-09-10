import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AthleteExperienceLevel,
  AthleteProfile,
  AthleteProfileService
} from '../../core/athlete-profile.service';
import { GoalService } from '../../core/goal.service';


@Component({
  selector: 'app-settings-athlete-profile',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="settings-page athlete-settings-page">
      <a class="settings-back" routerLink="/ajustes" aria-label="Volver a Ajustes">← <span>Ajustes</span></a>
      <header class="settings-header">
        <p class="settings-eyebrow">Perfil deportivo</p>
        <h1>Tu contexto para entrenar</h1>
        <p>Datos estables que ayudan a entender cómo puedes entrenar. Guardarlos no cambia ninguna rutina.</p>
      </header>

      @if (loading()) {
        <section class="settings-panel profile-state" role="status">Cargando perfil deportivo…</section>
      } @else if (loadError()) {
        <section class="settings-panel profile-state">
          <p role="alert">{{ loadError() }}</p>
          <button type="button" class="settings-action" (click)="load()">Reintentar</button>
        </section>
      } @else if (!profile()) {
        <section class="settings-panel profile-state">
          <h2>Perfil no disponible</h2>
          <p>No encontramos un perfil deportivo persistido que se pueda editar con seguridad.</p>
        </section>
      } @else {
        <form class="profile-form" (submit)="save($event)">
          <section class="settings-panel form-section" aria-labelledby="availability-title">
            <div class="form-heading"><h2 id="availability-title">Disponibilidad</h2><p>No regenera ni modifica tus rutinas.</p></div>
            <label>Días disponibles por semana <span>(opcional)</span>
              <input type="number" min="2" max="6" [value]="weeklyAvailability() ?? ''" (input)="setNumber('availability', $event)">
            </label>
            <label>Duración habitual por sesión <span>(opcional)</span>
              <span class="input-with-unit"><input type="number" min="25" max="180" [value]="sessionDurationMin() ?? ''" (input)="setNumber('duration', $event)"><span>min</span></span>
            </label>
          </section>

          @if (strengthGoal()) {
            <section class="settings-panel form-section" aria-labelledby="experience-title">
              <div class="form-heading"><h2 id="experience-title">Experiencia de fuerza</h2><p>Se muestra porque tu objetivo activo es de fuerza.</p></div>
              <label>Nivel
                <select [value]="experienceLevel() ?? ''" (change)="setExperience($event)">
                  <option value="">Sin indicar</option><option value="beginner">Inicial</option><option value="returning">Retomando</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option>
                </select>
              </label>
            </section>
          }

          <section class="settings-panel form-section" aria-labelledby="limitations-title">
            <div class="form-heading"><h2 id="limitations-title">Restricciones y molestias</h2><p>Contexto deportivo breve; no es un historial médico.</p></div>
            <label>Lesiones o limitaciones
              <textarea rows="3" [value]="injuriesText()" (input)="injuriesText.set($any($event.target).value)" placeholder="Una por línea"></textarea>
            </label>
            <label>Zonas con molestias
              <textarea rows="3" [value]="painAreasText()" (input)="painAreasText.set($any($event.target).value)" placeholder="Una por línea"></textarea>
            </label>
          </section>

          @if (saveError()) { <p class="settings-status settings-status-error" role="alert">{{ saveError() }}</p> }
          @if (saved()) { <p class="settings-status settings-status-success" role="status">Perfil deportivo actualizado.</p> }
          <button type="submit" class="settings-action primary-action" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar perfil' }}</button>
        </form>
      }
    </section>
  `,
  styleUrls: ['./settings.scss', './profile-goals.scss']
})
export class SettingsAthleteProfile implements OnInit {
  readonly profile = signal<AthleteProfile | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly saved = signal(false);
  readonly strengthGoal = signal(false);
  readonly experienceLevel = signal<AthleteExperienceLevel | null>(null);
  readonly weeklyAvailability = signal<number | null>(null);
  readonly sessionDurationMin = signal<number | null>(null);
  readonly injuriesText = signal('');
  readonly painAreasText = signal('');
  readonly valid = computed(() => {
    const days = this.weeklyAvailability();
    const duration = this.sessionDurationMin();
    return (days === null || days >= 2 && days <= 6) &&
      (duration === null || duration >= 25 && duration <= 180);
  });

  constructor(
    private readonly profiles: AthleteProfileService,
    private readonly goals: GoalService
  ) {}

  async ngOnInit(): Promise<void> { await this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    const [profileResult, goalResult] = await Promise.allSettled([
      this.profiles.get(), this.goals.getActive()
    ]);
    if (profileResult.status === 'fulfilled') {
      this.applyProfile(profileResult.value);
    } else {
      this.loadError.set('No se pudo cargar el perfil deportivo.');
    }
    this.strengthGoal.set(
      goalResult.status === 'fulfilled' && goalResult.value?.category === 'strength'
    );
    this.loading.set(false);
  }

  setNumber(field: 'availability' | 'duration', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const parsed = value === '' ? null : Number(value);
    (field === 'availability' ? this.weeklyAvailability : this.sessionDurationMin).set(parsed);
    this.saved.set(false);
  }

  setExperience(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.experienceLevel.set(value ? value as AthleteExperienceLevel : null);
  }

  async save(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.valid() || this.saving()) {
      this.saveError.set('Revisa la disponibilidad y la duración de sesión.');
      return;
    }
    this.saving.set(true);
    this.saved.set(false);
    this.saveError.set(null);
    try {
      const profile = await this.profiles.update({
        ...(this.strengthGoal() ? { experienceLevel: this.experienceLevel() } : {}),
        weeklyAvailability: this.weeklyAvailability(),
        sessionDurationMin: this.sessionDurationMin(),
        injuries: this.lines(this.injuriesText()),
        painAreas: this.lines(this.painAreasText())
      });
      this.applyProfile(profile);
      this.saved.set(true);
    } catch {
      this.saveError.set('No se pudo guardar el perfil deportivo.');
    } finally {
      this.saving.set(false);
    }
  }

  private applyProfile(profile: AthleteProfile | null): void {
    this.profile.set(profile);
    if (!profile) return;
    this.experienceLevel.set(profile.experienceLevel);
    this.weeklyAvailability.set(profile.weeklyAvailability);
    this.sessionDurationMin.set(profile.sessionDurationMin);
    this.injuriesText.set(profile.injuries.join('\n'));
    this.painAreasText.set(profile.painAreas.join('\n'));
  }

  private lines(value: string): string[] {
    return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean).slice(0, 10);
  }
}
