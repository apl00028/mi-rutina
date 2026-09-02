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
  HttpErrorResponse
} from '@angular/common/http';

import {
  TrainerAthlete,
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
    FormsModule
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

  selectedTemplate =
    computed(() =>
      this.templates().find(
        template =>
          template.id ===
          this.selectedTemplateId()
      ) ?? null
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

      if (
        !this.selectedAthleteId() &&
        athletes.length > 0
      ) {
        this.selectedAthleteId.set(
          athletes[0].athlete_id
        );
        this.ensureRoutineId();
      }

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
      athlete.athlete_id
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
