import {
  CommonModule
} from '@angular/common';

import {
  Component,
  OnInit,
  computed,
  signal
} from '@angular/core';

import {
  FormsModule
} from '@angular/forms';

import {
  RouterLink
} from '@angular/router';

import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  TrainerAthlete,
  TrainerAthleteActiveRoutines,
  TrainerAthleteOverview,
  TrainerRoutineTemplate,
  TrainerService
} from '../../core/trainer.service';


type TrainerView =
  | 'athletes'
  | 'templates';


@Component({
  selector: 'app-trainer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink
  ],
  templateUrl: './trainer.html',
  styleUrl: './trainer.scss'
})
export class Trainer implements OnInit {
  activeView =
    signal<TrainerView>('athletes');

  athletes =
    signal<TrainerAthlete[]>([]);

  templates =
    signal<TrainerRoutineTemplate[]>([]);

  loadingAthletes =
    signal(true);

  loadingTemplates =
    signal(true);

  loadingOverviews =
    signal(false);

  expectedOverviewCount =
    signal(0);

  loadedOverviewCount =
    signal(0);

  failedOverviewCount =
    signal(0);

  athletesError =
    signal<string | null>(null);

  templatesError =
    signal<string | null>(null);

  assignmentError =
    signal<string | null>(null);

  assignmentSuccess =
    signal<string | null>(null);

  selectedTemplateId =
    signal<string | null>(null);

  selectedAthleteId =
    signal('');

  routineId =
    signal('');

  assigningTemplateId =
    signal<string | null>(null);

  athleteOverviews =
    signal<Record<string, TrainerAthleteOverview>>(
      {}
    );

  private overviewLoadId = 0;

  selectedTemplate =
    computed(() =>
      this.templates().find(
        template =>
          template.id ===
          this.selectedTemplateId()
      ) ?? null
    );

  activeAthleteCount =
    computed(() =>
      this.athletes().filter(
        athlete =>
          athlete.status === 'active'
      ).length
    );

  templateCount =
    computed(() =>
      this.templates().length
    );

  totalSessionsLast7Days =
    computed(() =>
      Object.values(
        this.athleteOverviews()
      ).reduce(
        (total, overview) =>
          total +
          overview.recent_training
            .completed_last_7_days,
        0
      )
    );


  constructor(
    private trainerService:
      TrainerService
  ) {}


  ngOnInit(): void {
    void this.loadAthletes();
    void this.loadTemplates();
  }


  setView(
    view: TrainerView
  ): void {
    this.activeView.set(view);
  }


  async loadAthletes():
    Promise<void> {
    this.loadingAthletes.set(true);
    this.athletesError.set(null);

    try {
      const athletes =
        await this.trainerService
          .listAthletes();

      this.athletes.set(
        athletes
      );

      this.athleteOverviews.set({});
      this.expectedOverviewCount.set(0);
      this.loadedOverviewCount.set(0);
      this.failedOverviewCount.set(0);

      if (
        !this.selectedAthleteId() &&
        athletes.length > 0
      ) {
        this.selectedAthleteId.set(
          athletes[0].athlete_id
        );
        this.ensureRoutineId();
      }

      void this.loadAthleteOverviews(
        athletes
      );

    } catch (error) {
      this.athletesError.set(
        this.errorMessage(
          error,
          'No se pudieron cargar los clientes.'
        )
      );
    } finally {
      this.loadingAthletes.set(false);
    }
  }


  private async loadAthleteOverviews(
    athletes: TrainerAthlete[]
  ): Promise<void> {
    const loadId =
      ++this.overviewLoadId;

    const activeAthletes =
      athletes.filter(
        athlete =>
          athlete.status === 'active'
      );

    if (activeAthletes.length === 0) {
      this.expectedOverviewCount.set(0);
      this.loadedOverviewCount.set(0);
      this.failedOverviewCount.set(0);
      this.loadingOverviews.set(false);
      return;
    }

    this.expectedOverviewCount.set(
      activeAthletes.length
    );
    this.loadedOverviewCount.set(0);
    this.failedOverviewCount.set(0);
    this.loadingOverviews.set(true);

    const results =
      await Promise.allSettled(
        activeAthletes.map(
          athlete =>
            this.trainerService
              .getAthleteOverview(
                athlete.athlete_id
              )
        )
      );

    if (loadId !== this.overviewLoadId) {
      return;
    }

    const overviews:
      Record<string, TrainerAthleteOverview> =
      {};

    results.forEach(
      (result, index) => {
        if (result.status === 'fulfilled') {
          overviews[
            activeAthletes[index].athlete_id
          ] = result.value;
        }
      }
    );

    this.loadedOverviewCount.set(
      Object.keys(overviews).length
    );
    this.failedOverviewCount.set(
      results.filter(
        result =>
          result.status === 'rejected'
      ).length
    );

    this.athleteOverviews.set(
      overviews
    );

    this.loadingOverviews.set(false);
  }


  async loadTemplates():
    Promise<void> {
    this.loadingTemplates.set(true);
    this.templatesError.set(null);

    try {
      const templates =
        await this.trainerService
          .listTemplates();

      this.templates.set(
        templates
      );

      if (
        !this.selectedTemplateId() &&
        templates.length > 0
      ) {
        this.selectTemplate(
          templates[0]
        );
      }

    } catch (error) {
      this.templatesError.set(
        this.errorMessage(
          error,
          'No se pudieron cargar las plantillas.'
        )
      );
    } finally {
      this.loadingTemplates.set(false);
    }
  }


  selectTemplate(
    template: TrainerRoutineTemplate
  ): void {
    this.selectedTemplateId.set(
      template.id
    );
    this.assignmentError.set(null);
    this.assignmentSuccess.set(null);
    this.generateRoutineId();
  }


  updateAthlete(
    athleteId: string
  ): void {
    this.selectedAthleteId.set(
      athleteId
    );
    this.generateRoutineId();
  }


  updateRoutineId(
    routineId: string
  ): void {
    this.routineId.set(
      routineId
    );
  }


  generateRoutineId(): void {
    const generated =
      this.generatedRoutineId();

    this.routineId.set(
      generated
    );
  }


  async assignSelectedTemplate():
    Promise<void> {
    const template =
      this.selectedTemplate();

    const athleteId =
      this.selectedAthleteId().trim();

    const routineId =
      this.routineId().trim();

    if (
      !template ||
      !athleteId ||
      !routineId ||
      this.assigningTemplateId()
    ) {
      return;
    }

    this.assigningTemplateId.set(
      template.id
    );
    this.assignmentError.set(null);
    this.assignmentSuccess.set(null);

    try {
      const assignment =
        await this.trainerService
          .assignTemplate(
            template.id,
            athleteId,
            routineId
          );

      this.assignmentSuccess.set(
        `Rutina ${assignment.routine_id} asignada.`
      );

    } catch (error) {
      this.assignmentError.set(
        this.errorMessage(
          error,
          'No se pudo asignar la plantilla.'
        )
      );
    } finally {
      this.assigningTemplateId.set(null);
    }
  }


  isAssigning(
    template: TrainerRoutineTemplate
  ): boolean {
    return (
      this.assigningTemplateId() ===
      template.id
    );
  }


  canAssign(): boolean {
    return (
      !!this.selectedTemplate() &&
      !!this.selectedAthleteId().trim() &&
      !!this.routineId().trim() &&
      !this.assigningTemplateId()
    );
  }


  disciplineLabel(
    discipline: string
  ): string {
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


  athleteTitle(
    athlete: TrainerAthlete
  ): string {
    return (
      athlete.display_name?.trim() ||
      athlete.email?.trim() ||
      'Deportista'
    );
  }


  athleteSubtitle(
    athlete: TrainerAthlete
  ): string | null {
    if (
      athlete.display_name?.trim() &&
      athlete.email?.trim()
    ) {
      return athlete.email;
    }

    return null;
  }


  athleteOverview(
    athlete: TrainerAthlete
  ): TrainerAthleteOverview | null {
    return (
      this.athleteOverviews()[
        athlete.athlete_id
      ] ?? null
    );
  }


  athleteInitials(
    athlete: TrainerAthlete
  ): string {
    const source =
      this.athleteTitle(athlete)
        .trim();

    const parts =
      source
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length >= 2) {
      return (
        parts[0][0] +
        parts[1][0]
      ).toUpperCase();
    }

    return source
      .slice(0, 2)
      .toUpperCase();
  }


  statusLabel(
    status: TrainerAthlete['status']
  ): string {
    return status === 'active'
      ? 'Activo'
      : 'Inactivo';
  }


  activeRoutineCount(
    routines:
      TrainerAthleteActiveRoutines
  ): number {
    return Object.values(
      routines
    ).filter(Boolean).length;
  }


  athleteActivityLabel(
    overview:
      TrainerAthleteOverview | null
  ): string {
    if (!overview) {
      return this.loadingOverviews()
        ? 'Cargando actividad...'
        : 'Actividad no disponible';
    }

    return overview.recent_training
      .completed_last_7_days > 0
      ? 'Actividad reciente'
      : 'Sin actividad esta semana';
  }


  recentSessionLabel(
    overview:
      TrainerAthleteOverview | null
  ): string {
    const completed =
      overview?.recent_training
        .last_completed;

    if (!overview) {
      return this.loadingOverviews()
        ? 'Cargando última sesión...'
        : 'Última sesión no disponible';
    }

    if (!completed) {
      return 'Sin sesiones completadas';
    }

    return (
      completed.session_name?.trim() ||
      completed.session_id?.trim() ||
      'Sesión completada'
    );
  }


  recentSessionDate(
    overview:
      TrainerAthleteOverview | null
  ): string | null {
    const finishedAt =
      overview?.recent_training
        .last_completed
        ?.finished_at;

    return finishedAt
      ? this.formatTrainingDate(finishedAt)
      : null;
  }


  sessionsLast7DaysLabel(
    overview:
      TrainerAthleteOverview | null
  ): string {
    if (!overview) {
      return this.loadingOverviews()
        ? 'Cargando sesiones...'
        : 'Sesiones no disponibles';
    }

    const count =
      overview.recent_training
        .completed_last_7_days;

    return count === 1
      ? '1 sesión últimos 7 días'
      : `${count} sesiones últimos 7 días`;
  }


  summarySessionsLabel(): string {
    if (this.loadingOverviews()) {
      return 'Cargando';
    }

    if (this.failedOverviewCount() > 0) {
      return (
        `${this.totalSessionsLast7Days()} · parcial`
      );
    }

    return String(
      this.totalSessionsLast7Days()
    );
  }


  summarySessionsDescription():
    string | null {
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


  formatTrainingDate(
    value: string
  ): string {
    return this.formatClientSince(
      value
    );
  }


  formatClientSince(
    value: string
  ): string {
    const date =
      new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(
      'es-ES',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }
    ).format(date);
  }


  private ensureRoutineId(): void {
    if (this.routineId().trim()) {
      return;
    }

    this.generateRoutineId();
  }


  private generatedRoutineId(): string {
    const templateId =
      this.selectedTemplate()?.id ??
      'template';

    const athleteId =
      this.selectedAthleteId() ||
      'athlete';

    const day =
      new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '');

    return this.slug(
      `${templateId}-${athleteId.slice(0, 8)}-${day}`
    );
  }


  private slug(
    value: string
  ): string {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) ||
      'rutina-asignada'
    );
  }


  private errorMessage(
    error: unknown,
    fallback: string
  ): string {
    if (
      error instanceof HttpErrorResponse
    ) {
      const detail =
        error.error?.detail;

      if (typeof detail === 'string') {
        return detail;
      }
    }

    if (
      error instanceof Error &&
      error.message
    ) {
      return error.message;
    }

    return fallback;
  }
}
