import { RoutineEditor } from '../../features/routines/components/routine-editor/routine-editor';
import { copyRoutine, newRoutine, RoutineDocument, RoutineEditorContext } from '../../features/routines/domain/routine-editor';
import { CommonModule } from '@angular/common';

import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';

import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HttpErrorResponse } from '@angular/common/http';

import { Subscription } from 'rxjs';

import {
  TrainerAthlete,
  TrainerAthleteActiveRoutines,
  TrainerAthleteOverview,
  TrainerDiscipline,
  TrainerRoutineTemplate,
  TrainerService,
} from '../../core/trainer.service';

type TrainerView = 'dashboard' | 'athletes' | 'templates';

@Component({
  selector: 'app-trainer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RoutineEditor],
  templateUrl: './trainer.html',
  styleUrl: './trainer.scss',
})
export class Trainer implements OnInit, OnDestroy {
  activeView = signal<TrainerView>('dashboard');

  athletes = signal<TrainerAthlete[]>([]);

  templates = signal<TrainerRoutineTemplate[]>([]);

  loadingAthletes = signal(true);

  loadingTemplates = signal(true);

  loadingOverviews = signal(false);

  expectedOverviewCount = signal(0);

  loadedOverviewCount = signal(0);

  failedOverviewCount = signal(0);

  athletesError = signal<string | null>(null);

  templatesError = signal<string | null>(null);

  assignmentError = signal<string | null>(null);

  assignmentSuccess = signal<string | null>(null);

  selectedTemplateId = signal<string | null>(null);

  selectedAthleteId = signal('');

  routineId = signal('');

  assigningTemplateId = signal<string | null>(null);

  assigningFromDetail = signal(false);

  athleteOverviews = signal<Record<string, TrainerAthleteOverview>>({});

  disciplineFilter = signal<TrainerDiscipline | 'all'>('all');
  readonly disciplineFilters = ['all', 'strength', 'swimming', 'running', 'cycling'] as const;
  filteredTemplates = computed(() =>
    this.templates().filter(
      (template) =>
        this.disciplineFilter() === 'all' || template.discipline === this.disciplineFilter(),
    ),
  );
  recentActivity = computed(() =>
    Object.values(this.athleteOverviews())
      .filter((athlete) => athlete.recent_training.last_completed?.finished_at)
      .sort(
        (a, b) =>
          Date.parse(b.recent_training.last_completed!.finished_at!) -
          Date.parse(a.recent_training.last_completed!.finished_at!),
      )
      .slice(0, 4),
  );

  templateAction = signal<'new' | 'create' | 'import' | 'edit' | 'duplicate' | 'delete' | null>(null);
  editorContext = signal<RoutineEditorContext | null>(null);
  actionTemplate = signal<TrainerRoutineTemplate | null>(null);
  templateName = signal('');
  templateBusy = signal(false);
  templateActionError = signal<string | null>(null);
  templateMessage = signal<string | null>(null);
  private templateRequestId = 0;
  private duplicateId: string | null = null;

  newTemplate(): void {
    this.cancelTemplateAction();
    this.templateMessage.set(null);
    this.templateAction.set('new');
  }

  cancelTemplateAction(): void {
    if (this.templateBusy()) return;
    ++this.templateRequestId;
    this.templateAction.set(null);
    this.editorContext.set(null);
    this.actionTemplate.set(null);
    this.templateActionError.set(null);
  }

  startTemplate(discipline: 'strength' | 'swimming' | 'running'): void {
    const mode = this.templateAction() === 'import' ? 'import' : 'create';
    this.openEditor(newRoutine(discipline), mode);
  }

  private openEditor(routine: RoutineDocument, mode: RoutineEditorContext['mode']): void {
    this.editorContext.set({
      routine, mode, saveLabel: 'Guardar plantilla',
      cancel: () => this.cancelTemplateAction(),
      save: async (data) => {
        if (this.templateBusy()) return;
        const requestId = this.templateRequestId;
        const name = data.name?.trim();
        if (!name) throw new Error('Indica un nombre para la plantilla.');
        const payload = { name, discipline: routine.discipline as TrainerDiscipline, data: { ...data, routineId: routine.routineId, name } };
        this.templateBusy.set(true);
        try {
          const saved = mode === 'edit'
            ? await this.trainerService.updateTemplate(routine.routineId, payload)
            : await this.trainerService.createTemplate({ id: routine.routineId, ...payload });
          if (requestId !== this.templateRequestId) return;
          this.applySavedTemplate(saved, mode === 'edit' ? 'Plantilla actualizada.' : 'Plantilla creada.');
        } catch (error) {
          throw new Error(this.templateError(error, 'No se pudo guardar la plantilla.'));
        } finally { if (requestId === this.templateRequestId) this.templateBusy.set(false); }
      },
    });
  }

  async manageTemplate(action: 'edit' | 'duplicate' | 'delete'): Promise<void> {
    const selected = this.selectedTemplate();
    if (!selected || this.templateBusy()) return;
    const requestId = ++this.templateRequestId;
    this.templateAction.set(action);
    this.templateBusy.set(true);
    this.templateActionError.set(null);
    this.templateMessage.set(null);
    try {
      const template = await this.trainerService.getTemplate(selected.id);
      if (requestId !== this.templateRequestId) return;
      this.actionTemplate.set(template);
      this.templateName.set(action === 'duplicate' ? `${template.name} · copia` : template.name);
      if (action === 'duplicate') this.duplicateId = `routine-${crypto.randomUUID()}`;
      if (action === 'edit' && template.discipline !== 'cycling') {
        this.openEditor({ ...template.data, routineId: template.id, name: template.name, discipline: template.discipline } as unknown as RoutineDocument, 'edit');
      }
    } catch (error) {
      if (requestId === this.templateRequestId) this.templateActionError.set(this.templateError(error, 'No se pudo cargar la plantilla.'));
    } finally {
      if (requestId === this.templateRequestId) this.templateBusy.set(false);
    }
  }

  async saveTemplateCopyOrName(): Promise<void> {
    const template = this.actionTemplate();
    const name = this.templateName().trim();
    if (!template || this.templateBusy()) return;
    if (!name) { this.templateActionError.set('Indica un nombre para la plantilla.'); return; }
    const requestId = this.templateRequestId;
    this.templateBusy.set(true);
    this.templateActionError.set(null);
    try {
      const duplicate = this.templateAction() === 'duplicate';
      const data = duplicate
        ? copyRoutine(template.data as unknown as RoutineDocument)
        : structuredClone(template.data) as unknown as RoutineDocument;
      if (duplicate) data.routineId = this.duplicateId!;
      data.name = name;
      if (!duplicate) data.revision += 1;
      data.updatedAt = new Date().toISOString();
      const payload = { name, discipline: template.discipline, data: { ...data } };
      const saved = duplicate
        ? await this.trainerService.createTemplate({ id: data.routineId, ...payload })
        : await this.trainerService.updateTemplate(template.id, payload);
      if (requestId !== this.templateRequestId) return;
      this.applySavedTemplate(saved, duplicate ? 'Plantilla duplicada.' : 'Plantilla actualizada.');
    } catch (error) {
      if (requestId === this.templateRequestId) this.templateActionError.set(this.templateError(error, 'No se pudo guardar la plantilla.'));
    } finally { if (requestId === this.templateRequestId) this.templateBusy.set(false); }
  }

  async deleteTemplate(): Promise<void> {
    const template = this.actionTemplate();
    if (!template || this.templateAction() !== 'delete' || this.templateBusy()) return;
    const requestId = this.templateRequestId;
    this.templateBusy.set(true);
    this.templateActionError.set(null);
    try {
      await this.trainerService.deleteTemplate(template.id);
      this.templates.update(items => items.filter(item => item.id !== template.id));
      if (requestId !== this.templateRequestId) return;
      this.templateAction.set(null);
      this.actionTemplate.set(null);
      this.templateMessage.set('Plantilla eliminada.');
      this.backToTemplateList();
    } catch (error) {
      if (requestId !== this.templateRequestId) return;
      this.templateActionError.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'Esta plantilla tiene asignaciones y no puede eliminarse.'
          : 'No se pudo eliminar la plantilla. Inténtalo de nuevo.',
      );
    } finally { if (requestId === this.templateRequestId) this.templateBusy.set(false); }
  }

  private applySavedTemplate(template: TrainerRoutineTemplate, message: string): void {
    this.templates.update(items => [template, ...items.filter(item => item.id !== template.id)]);
    this.disciplineFilter.set('all');
    this.templateAction.set(null);
    this.editorContext.set(null);
    this.actionTemplate.set(null);
    this.templateMessage.set(message);
    this.selectTemplate(template);
  }

  private templateError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) return 'La plantilla ya no está disponible. Vuelve a la biblioteca y actualiza el listado.';
      if (error.status === 422) return 'El contenido de la rutina no es válido. Revisa las sesiones antes de guardar.';
      return fallback;
    }
    return error instanceof Error ? error.message : fallback;
  }

  private overviewLoadId = 0;
  private routeSubscription: Subscription | null = null;

  selectedTemplate = computed(
    () => this.templates().find((template) => template.id === this.selectedTemplateId()) ?? null,
  );

  activeAthleteCount = computed(
    () => this.athletes().filter((athlete) => athlete.status === 'active').length,
  );

  templateCount = computed(() => this.templates().length);

  totalSessionsLast7Days = computed(() =>
    Object.values(this.athleteOverviews()).reduce(
      (total, overview) => total + overview.recent_training.completed_last_7_days,
      0,
    ),
  );

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private trainerService: TrainerService,
  ) {}

  ngOnInit(): void {
    this.routeSubscription = this.route.queryParamMap.subscribe((params) => {
      ++this.templateRequestId;
      this.templateAction.set(null);
      this.editorContext.set(null);
      this.actionTemplate.set(null);
      this.templateBusy.set(false);
      this.templateActionError.set(null);
      this.activeView.set(this.viewFromQuery(params.get('view')));
      this.selectedTemplateId.set(params.get('template'));
      this.assigningFromDetail.set(false);
    });

    void this.loadAthletes();
    void this.loadTemplates();
  }

  ngOnDestroy(): void {
    ++this.overviewLoadId;
    ++this.templateRequestId;
    this.routeSubscription?.unsubscribe();
  }

  setView(view: TrainerView): void {
    this.activeView.set(view);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        view: this.viewQueryValue(view),
        template: null,
      },
      queryParamsHandling: 'merge',
    });
  }

  async loadAthletes(): Promise<void> {
    this.loadingAthletes.set(true);
    this.athletesError.set(null);

    try {
      const athletes = await this.trainerService.listAthletes();

      this.athletes.set(athletes);

      this.athleteOverviews.set({});
      this.expectedOverviewCount.set(0);
      this.loadedOverviewCount.set(0);
      this.failedOverviewCount.set(0);

      void this.loadAthleteOverviews(athletes);
    } catch (error) {
      this.athletesError.set(this.errorMessage(error, 'No se pudieron cargar los clientes.'));
    } finally {
      this.loadingAthletes.set(false);
    }
  }

  private async loadAthleteOverviews(athletes: TrainerAthlete[]): Promise<void> {
    const loadId = ++this.overviewLoadId;

    const activeAthletes = athletes.filter((athlete) => athlete.status === 'active');

    if (activeAthletes.length === 0) {
      this.expectedOverviewCount.set(0);
      this.loadedOverviewCount.set(0);
      this.failedOverviewCount.set(0);
      this.loadingOverviews.set(false);
      return;
    }

    this.expectedOverviewCount.set(activeAthletes.length);
    this.loadedOverviewCount.set(0);
    this.failedOverviewCount.set(0);
    this.loadingOverviews.set(true);

    const results = await Promise.allSettled(
      activeAthletes.map((athlete) => this.trainerService.getAthleteOverview(athlete.athlete_id)),
    );

    if (loadId !== this.overviewLoadId) {
      return;
    }

    const overviews: Record<string, TrainerAthleteOverview> = {};

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        overviews[activeAthletes[index].athlete_id] = result.value;
      }
    });

    this.loadedOverviewCount.set(Object.keys(overviews).length);
    this.failedOverviewCount.set(results.filter((result) => result.status === 'rejected').length);

    this.athleteOverviews.set(overviews);

    this.loadingOverviews.set(false);
  }

  async loadTemplates(): Promise<void> {
    this.loadingTemplates.set(true);
    this.templatesError.set(null);

    try {
      const templates = await this.trainerService.listTemplates();

      this.templates.set(templates);
    } catch (error) {
      this.templatesError.set(this.errorMessage(error, 'No se pudieron cargar las plantillas.'));
    } finally {
      this.loadingTemplates.set(false);
    }
  }

  selectTemplate(template: TrainerRoutineTemplate): void {
    this.selectedTemplateId.set(template.id);
    this.assignmentError.set(null);
    this.assignmentSuccess.set(null);
    this.assigningFromDetail.set(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: 'templates', template: template.id },
      queryParamsHandling: 'merge',
    });
  }

  assignTemplateFromDetail(): void {
    if (!this.selectedTemplate()) {
      return;
    }

    this.assignmentSuccess.set(null);
    this.assignmentError.set(null);
    this.selectedAthleteId.set('');
    this.assigningFromDetail.set(true);
    this.generateRoutineId();
  }

  showTemplateDetail(): void {
    this.assigningFromDetail.set(false);
  }

  backToTemplateList(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { template: null },
      queryParamsHandling: 'merge',
    });
    this.selectedTemplateId.set(null);
    this.assigningFromDetail.set(false);
    this.assignmentError.set(null);
    this.assignmentSuccess.set(null);
  }

  updateAthlete(athleteId: string): void {
    if (this.assigningTemplateId() || athleteId === this.selectedAthleteId()) return;
    this.selectedAthleteId.set(athleteId);
    this.assignmentError.set(null);
    this.generateRoutineId();
  }

  generateRoutineId(): void {
    const generated = this.generatedRoutineId();

    this.routineId.set(generated);
  }

  async assignSelectedTemplate(): Promise<void> {
    const template = this.selectedTemplate();

    const athleteId = this.selectedAthleteId().trim();

    const routineId = this.routineId().trim();

    if (
      !template ||
      !athleteId ||
      !routineId ||
      !this.athletes().some(
        (athlete) => athlete.athlete_id === athleteId && athlete.status === 'active',
      ) ||
      this.assigningTemplateId()
    ) {
      return;
    }

    this.assigningTemplateId.set(template.id);
    this.assignmentError.set(null);
    this.assignmentSuccess.set(null);

    try {
      await this.trainerService.assignTemplate(template.id, athleteId, routineId);

      this.assignmentSuccess.set(
        `${template.name} asignada a ${this.athleteTitle(this.athletes().find((a) => a.athlete_id === athleteId)!)}.`,
      );
      this.assigningFromDetail.set(false);
      this.routineId.set('');
      void this.loadAthleteOverviews(this.athletes());
    } catch (error) {
      this.assignmentError.set(this.errorMessage(error, 'No se pudo asignar la plantilla.'));
    } finally {
      this.assigningTemplateId.set(null);
    }
  }

  isAssigning(template: TrainerRoutineTemplate): boolean {
    return this.assigningTemplateId() === template.id;
  }

  canAssign(): boolean {
    return (
      !!this.selectedTemplate() &&
      this.athletes().some(
        (a) => a.athlete_id === this.selectedAthleteId() && a.status === 'active',
      ) &&
      !!this.routineId().trim() &&
      !this.assigningTemplateId()
    );
  }

  templateSessions(template: TrainerRoutineTemplate): Record<string, unknown>[] {
    return this.arrayObjects(template.data['sessions']);
  }

  templateSessionTitle(session: Record<string, unknown>, index: number): string {
    return (
      this.stringValue(session['name']) ||
      this.stringValue(session['title']) ||
      `Sesión ${index + 1}`
    );
  }

  templateSessionMeta(session: Record<string, unknown>): string | null {
    const poolLength = this.numberValue(session['poolLengthMeters']);

    return poolLength === null ? null : `Piscina ${poolLength} m`;
  }

  templateExercises(session: Record<string, unknown>): Record<string, unknown>[] {
    return this.arrayObjects(session['exercises']);
  }

  templateExerciseTitle(exercise: Record<string, unknown>, index: number): string {
    return (
      this.stringValue(exercise['name']) ||
      this.stringValue(exercise['exerciseName']) ||
      `Ejercicio ${index + 1}`
    );
  }

  templateExerciseMeta(exercise: Record<string, unknown>): string | null {
    const prescription = this.objectValue(exercise['prescription']);
    const value = (key: string) => prescription[key] ?? exercise[key];
    const target = this.objectValue(value('target'));
    const targetText =
      this.stringValue(value('target')) ||
      (this.rangeLabel(target)
        ? `${this.rangeLabel(target)} ${target['type'] === 'duration' ? 's' : 'reps'}`
        : null) ||
      (this.rangeLabel(value('reps')) ? `${this.rangeLabel(value('reps'))} reps` : null);
    return (
      [
        this.numberValue(value('sets')) !== null ? `${value('sets')} series` : null,
        targetText,
        this.rangeLabel(value('targetRir')) ? `RIR ${this.rangeLabel(value('targetRir'))}` : null,
        this.numberValue(value('weight')) !== null ? `${value('weight')} kg` : null,
        this.numberValue(value('restSeconds')) !== null
          ? `Descanso ${value('restSeconds')} s`
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || null
    );
  }

  private objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private rangeLabel(value: unknown): string | null {
    if (this.numberValue(value) !== null) return String(value);
    const range = this.objectValue(value);
    const min = this.numberValue(range['min']);
    const max = this.numberValue(range['max']);
    if (min !== null && max !== null) return min === max ? `${min}` : `${min}–${max}`;
    return min !== null ? `≥ ${min}` : max !== null ? `≤ ${max}` : null;
  }

  templateBlocks(session: Record<string, unknown>): Record<string, unknown>[] {
    return this.arrayObjects(session['blocks']);
  }

  templateBlockTitle(block: Record<string, unknown>, index: number): string {
    return (
      this.stringValue(block['title']) ||
      this.stringValue(block['name']) ||
      this.blockTypeLabel(this.stringValue(block['type'])) ||
      `Bloque ${index + 1}`
    );
  }

  templateBlockSets(block: Record<string, unknown>): Record<string, unknown>[] {
    return this.arrayObjects(block['sets']);
  }

  templateSwimSetLabel(set: Record<string, unknown>): string {
    const repetitions = this.numberValue(set['repetitions']);

    const distance = this.numberValue(set['distanceMeters']);

    if (repetitions !== null && distance !== null) {
      return `${repetitions} x ${distance} m`;
    }

    if (distance !== null) {
      return `${distance} m`;
    }

    return 'Serie';
  }

  templateSwimSetDetails(set: Record<string, unknown>): string[] {
    return [
      this.swimLabel(set['stroke']),
      this.swimLabel(set['workType']),
      this.swimLabel(set['intensity']),
      this.numberValue(set['restSeconds']) === null
        ? null
        : `Descanso ` + `${this.numberValue(set['restSeconds'])} s`,
      this.stringValue(set['instruction']),
    ].filter((value): value is string => !!value);
  }

  blockTypeLabel(type: string | null): string | null {
    return type
      ? ((
          {
            warmup: 'Calentamiento',
            main: 'Principal',
            technique: 'Técnica',
            cooldown: 'Vuelta a la calma',
            intervals: 'Intervalos',
            sprints: 'Sprints',
          } as Record<string, string>
        )[type] ?? null)
      : null;
  }

  swimLabel(value: unknown): string | null {
    const key = this.stringValue(value);
    return key
      ? ((
          {
            freestyle: 'Crol',
            backstroke: 'Espalda',
            breaststroke: 'Braza',
            mixed: 'Mixto',
            swim: 'Nado',
            technique: 'Técnica',
            kick: 'Piernas',
            pull: 'Tracción',
            easy: 'Suave',
            controlled: 'Controlado',
            strong: 'Intenso',
          } as Record<string, string>
        )[key] ?? key)
      : null;
  }

  sessionNotes(session: Record<string, unknown>): string[] {
    return [this.stringValue(session['objective']), this.stringValue(session['notes'])].filter(
      (value): value is string => !!value,
    );
  }

  runningSetLabel(set: Record<string, unknown>): string {
    const target =
      set['targetType'] === 'distance' && this.numberValue(set['distanceMeters']) !== null
        ? `${set['distanceMeters']} m`
        : set['targetType'] === 'duration' && this.numberValue(set['durationSeconds']) !== null
          ? `${set['durationSeconds']} s`
          : null;
    return target
      ? `${this.numberValue(set['repetitions']) !== null ? set['repetitions'] + ' × ' : ''}${target}`
      : 'Serie';
  }

  runningSetDetails(set: Record<string, unknown>): string[] {
    const n = (key: string) => this.numberValue(set[key]);
    const parts: (string | null)[] = [this.stringValue(set['instruction'])];
    if (n('recoverySeconds') !== null) parts.push(`Recuperación ${set['recoverySeconds']} s`);
    switch (set['intensityMode']) {
      case 'heartRateMax':
        if (n('heartRateMaxBpm') !== null) parts.push(`FC ≤ ${set['heartRateMaxBpm']} ppm`);
        break;
      case 'heartRateRange':
        if (n('heartRateMinBpm') !== null && n('heartRateMaxRangeBpm') !== null)
          parts.push(`FC ${set['heartRateMinBpm']}–${set['heartRateMaxRangeBpm']} ppm`);
        break;
      case 'rpeRange':
        if (n('rpeMin') !== null && n('rpeMax') !== null)
          parts.push(`RPE ${set['rpeMin']}–${set['rpeMax']}`);
        break;
      case 'paceRange':
        if (n('paceMinSecondsPerKm') !== null && n('paceMaxSecondsPerKm') !== null)
          parts.push(
            `Ritmo ${this.runningPace(n('paceMinSecondsPerKm')!)}–${this.runningPace(n('paceMaxSecondsPerKm')!)}/km`,
          );
        break;
      case 'sprint':
        parts.push('Sprint');
        break;
      case 'free':
        parts.push('Intensidad libre');
        break;
    }
    return parts.filter((value): value is string => !!value);
  }

  private runningPace(seconds: number): string {
    const rounded = Math.round(seconds);
    return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
  }

  hasTemplateDetail(template: TrainerRoutineTemplate): boolean {
    return this.templateSessions(template).length > 0;
  }

  disciplineLabel(discipline: string): string {
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

  athleteTitle(athlete: TrainerAthlete): string {
    return athlete.display_name?.trim() || athlete.email?.trim() || 'Deportista';
  }

  athleteSubtitle(athlete: TrainerAthlete): string | null {
    if (athlete.display_name?.trim() && athlete.email?.trim()) {
      return athlete.email;
    }

    return null;
  }

  athleteOverview(athlete: TrainerAthlete): TrainerAthleteOverview | null {
    return this.athleteOverviews()[athlete.athlete_id] ?? null;
  }

  athleteInitials(athlete: TrainerAthlete): string {
    const source = this.athleteTitle(athlete).trim();

    const parts = source.split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    return source.slice(0, 2).toUpperCase();
  }

  statusLabel(status: TrainerAthlete['status']): string {
    return status === 'active' ? 'Activo' : 'Inactivo';
  }

  activeRoutineCount(routines: TrainerAthleteActiveRoutines): number {
    return Object.values(routines).filter(Boolean).length;
  }

  athleteActivityLabel(overview: TrainerAthleteOverview | null): string {
    if (!overview) {
      return this.loadingOverviews() ? 'Cargando actividad...' : 'Actividad no disponible';
    }

    return overview.recent_training.completed_last_7_days > 0
      ? 'Actividad reciente'
      : 'Sin actividad esta semana';
  }

  recentSessionLabel(overview: TrainerAthleteOverview | null): string {
    const completed = overview?.recent_training.last_completed;

    if (!overview) {
      return this.loadingOverviews() ? 'Cargando última sesión...' : 'Última sesión no disponible';
    }

    if (!completed) {
      return 'Sin sesiones completadas';
    }

    return completed.session_name?.trim() || 'Sesión completada';
  }

  recentSessionDate(overview: TrainerAthleteOverview | null): string | null {
    const finishedAt = overview?.recent_training.last_completed?.finished_at;

    return finishedAt ? this.formatTrainingDate(finishedAt) : null;
  }

  sessionsLast7DaysLabel(overview: TrainerAthleteOverview | null): string {
    if (!overview) {
      return this.loadingOverviews() ? 'Cargando sesiones...' : 'Sesiones no disponibles';
    }

    const count = overview.recent_training.completed_last_7_days;

    return count === 1 ? '1 sesión últimos 7 días' : `${count} sesiones últimos 7 días`;
  }

  summarySessionsLabel(): string {
    if (this.loadingAthletes() || this.loadingOverviews()) {
      return '…';
    }

    if (
      this.athletesError() ||
      (this.failedOverviewCount() > 0 && this.loadedOverviewCount() === 0)
    )
      return '—';
    if (this.failedOverviewCount() > 0) {
      return `${this.totalSessionsLast7Days()} · parcial`;
    }

    return String(this.totalSessionsLast7Days());
  }

  summarySessionsDescription(): string | null {
    if (this.loadingOverviews()) {
      return 'Cargando actividad de clientes activos.';
    }

    if (this.failedOverviewCount() > 0) {
      return (
        'Datos disponibles de ' +
        `${this.loadedOverviewCount()} de ` +
        `${this.expectedOverviewCount()} clientes activos.`
      );
    }

    return null;
  }

  formatTrainingDate(value: string): string {
    return this.formatClientSince(value);
  }

  formatClientSince(value: string): string {
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

  private viewFromQuery(value: string | null): TrainerView {
    if (value === 'clients') {
      return 'athletes';
    }

    if (value === 'templates') {
      return 'templates';
    }

    return 'dashboard';
  }

  private viewQueryValue(view: TrainerView): string | null {
    if (view === 'athletes') {
      return 'clients';
    }

    if (view === 'templates') {
      return 'templates';
    }

    return null;
  }

  private arrayObjects(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object' && !Array.isArray(item),
    );
  }

  private stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private numberValue(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private generatedRoutineId(): string {
    return `routine-${crypto.randomUUID()}`;
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409)
        return 'Esta asignación ya existe. Comprueba la ficha del cliente antes de iniciar otra asignación.';
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
