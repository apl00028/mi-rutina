import { CommonModule } from '@angular/common';

import {
  Component,
  OnInit,
  signal
} from '@angular/core';

import {
  FormsModule
} from '@angular/forms';
import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideX
} from '@lucide/angular';

import {
  HttpClient,
  HttpHeaders
} from '@angular/common/http';

import {
  Router
} from '@angular/router';

import {
  environment
} from '../../../environments/environment';

import {
  AuthService
} from '../../core/auth.service';


interface GeneratedExercise {
  exercise_id: string;
  name: string;
  movement_pattern: string;
  role: string;
  record_type: string;
  sets: number;
  target: string;
  target_rir?: string | null;
  rest_seconds: number;
}


interface GeneratedSession {
  session_id: string;
  name: string;
  focus: string;
  exercises: GeneratedExercise[];
}


interface RoutineGenerationResult {
  structure_id: string;
  structure_label: string;
  sessions: GeneratedSession[];
  warnings: string[];
  rationale: string[];
}


interface MotivationOption {
  value: string;
  label: string;
}


interface PainAreaOption {
  value: string;
  label: string;
}


interface ExerciseOption {
  id: string;
  name: string;
  muscle?: string;
  equipment?: string;
  category?: string;
}


interface CompleteOnboardingResponse {
  onboarding_completed: boolean;
  routine: unknown;
}


@Component({
  selector: 'app-onboarding',
  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    LucideArrowLeft,
    LucideArrowRight,
    LucideX
  ],

  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss'
})
export class Onboarding implements OnInit {

  private readonly apiUrl =
    environment.apiUrl;


  /* =======================================================
     BASIC PROFILE
     ======================================================= */

  displayName = signal('');

  age = signal<number | null>(
    null
  );

  sex = signal('');

  heightCm = signal<number | null>(
    null
  );

  weightKg = signal<number | null>(
    null
  );


  /* =======================================================
     MOTIVATION
     ======================================================= */

  readonly motivationOptions:
    MotivationOption[] = [
      {
        value: 'physique',
        label: 'Mejorar mi físico'
      },
      {
        value: 'muscle',
        label: 'Ganar músculo'
      },
      {
        value: 'strength',
        label: 'Ser más fuerte'
      },
      {
        value: 'fat_loss',
        label: 'Perder grasa'
      },
      {
        value: 'health',
        label: 'Mejorar mi salud'
      },
      {
        value: 'energy',
        label: 'Tener más energía'
      },
      {
        value: 'sports_performance',
        label: 'Mejorar mi rendimiento'
      },
      {
        value: 'consistency',
        label: 'Ser constante'
      },
      {
        value: 'stress_relief',
        label: 'Reducir estrés'
      },
      {
        value: 'other',
        label: 'Otro'
      }
    ];


  motivations =
    signal<string[]>([]);


  /* =======================================================
     TRAINING PROFILE
     ======================================================= */

  primaryGoal = signal(
    'muscle_gain'
  );

  experienceLevel = signal(
    'beginner'
  );

  weeklyAvailability = signal(
    3
  );

  sessionDurationMin = signal(
    60
  );

  trainingLocation = signal(
    'commercial_gym'
  );

  availableEquipment =
    signal<string[]>([]);


  /* =======================================================
     LIMITATIONS
     ======================================================= */

  hasLimitations =
    signal(false);


  readonly painAreaOptions:
    PainAreaOption[] = [
      {
        value: 'shoulder',
        label: 'Hombro'
      },
      {
        value: 'elbow',
        label: 'Codo'
      },
      {
        value: 'wrist',
        label: 'Muñeca'
      },
      {
        value: 'back',
        label: 'Espalda'
      },
      {
        value: 'hip',
        label: 'Cadera'
      },
      {
        value: 'knee',
        label: 'Rodilla'
      },
      {
        value: 'ankle',
        label: 'Tobillo'
      },
      {
        value: 'other',
        label: 'Otra zona'
      }
    ];


  painAreas =
    signal<string[]>([]);

  limitationNotes =
    signal('');

  injuries =
    signal<string[]>([]);


  /* =======================================================
     EXERCISE PREFERENCES
     ======================================================= */

  exerciseCatalog =
    signal<ExerciseOption[]>([]);

  exerciseCatalogLoading =
    signal(false);

  exerciseCatalogError =
    signal<string | null>(null);

  avoidExerciseSearch =
    signal('');

  preferredExerciseSearch =
    signal('');

  avoidedExerciseIds =
    signal<string[]>([]);

  preferredExerciseIds =
    signal<string[]>([]);


  /* =======================================================
     UI
     ======================================================= */

  currentStep =
    signal(1);

  readonly totalSteps = 4;

  loading =
    signal(false);

  error =
    signal<string | null>(null);

  completing =
    signal(false);

  completeError =
    signal<string | null>(null);

  proposal =
    signal<RoutineGenerationResult | null>(
      null
    );


  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router
  ) {}


  async ngOnInit():
    Promise<void> {

    await this.loadExerciseCatalog();
  }


  /* =======================================================
     MOTIVATION
     ======================================================= */

  toggleMotivation(
    value: string
  ): void {

    const current =
      this.motivations();

    if (
      current.includes(value)
    ) {
      this.motivations.set(
        current.filter(
          item => item !== value
        )
      );

      return;
    }

    if (
      current.length >= 2
    ) {
      return;
    }

    this.motivations.set([
      ...current,
      value
    ]);
  }


  motivationSelected(
    value: string
  ): boolean {

    return this
      .motivations()
      .includes(value);
  }


  /* =======================================================
     WIZARD NAVIGATION
     ======================================================= */

  nextStep(): void {

    const step =
      this.currentStep();

    if (step === 1) {
      if (
        !this.displayName().trim()
      ) {
        this.error.set(
          'Indica tu nombre.'
        );
        return;
      }

      if (
        this.age() === null ||
        this.age()! < 14 ||
        this.age()! > 100
      ) {
        this.error.set(
          'Introduce una edad válida.'
        );
        return;
      }

      if (
        !this.sex()
      ) {
        this.error.set(
          'Selecciona tu sexo.'
        );
        return;
      }

      if (
        this.heightCm() === null ||
        this.heightCm()! < 120 ||
        this.heightCm()! > 230
      ) {
        this.error.set(
          'Introduce una altura válida.'
        );
        return;
      }

      if (
        this.weightKg() === null ||
        this.weightKg()! < 30 ||
        this.weightKg()! > 300
      ) {
        this.error.set(
          'Introduce un peso válido.'
        );
        return;
      }
    }

    if (step === 2) {
      if (
        this.motivations().length === 0
      ) {
        this.error.set(
          'Selecciona al menos una motivación.'
        );
        return;
      }
    }

    this.error.set(null);

    if (step < this.totalSteps) {
      this.currentStep.set(
        step + 1
      );

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }


  previousStep(): void {

    const step =
      this.currentStep();

    if (step > 1) {
      this.error.set(null);

      this.currentStep.set(
        step - 1
      );

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }


  goToStep(
    step: number
  ): void {

    if (
      step < 1 ||
      step > this.totalSteps
    ) {
      return;
    }

    if (
      step < this.currentStep()
    ) {
      this.currentStep.set(step);

      this.error.set(null);

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }


  /* =======================================================
     LIMITATIONS
     ======================================================= */

  setHasLimitations(
    value: boolean
  ): void {

    this.hasLimitations.set(
      value
    );

    if (!value) {
      this.painAreas.set([]);
      this.injuries.set([]);
      this.limitationNotes.set('');
    }
  }


  togglePainArea(
    value: string
  ): void {

    const current =
      this.painAreas();

    if (
      current.includes(value)
    ) {
      this.painAreas.set(
        current.filter(
          item => item !== value
        )
      );

      return;
    }

    this.painAreas.set([
      ...current,
      value
    ]);
  }


  painAreaSelected(
    value: string
  ): boolean {

    return this
      .painAreas()
      .includes(value);
  }


  /* =======================================================
     EXERCISE CATALOG
     ======================================================= */

  private async loadExerciseCatalog():
    Promise<void> {

    this.exerciseCatalogLoading.set(
      true
    );

    this.exerciseCatalogError.set(
      null
    );

    try {

      const headers =
        await this.getAuthHeaders();

      const response =
        await new Promise<any>(
          (
            resolve,
            reject
          ) => {

            this.http
              .get<any>(
                (
                  `${this.apiUrl}` +
                  '/exercises'
                ),
                {
                  headers
                }
              )
              .subscribe({
                next: resolve,
                error: reject
              });
          }
        );


      let exercises: any[] = [];

      if (
        Array.isArray(response)
      ) {
        exercises = response;

      } else if (
        Array.isArray(
          response?.items
        )
      ) {
        exercises =
          response.items;

      } else if (
        Array.isArray(
          response?.exercises
        )
      ) {
        exercises =
          response.exercises;
      }


      const normalized =
        exercises
          .filter(
            exercise =>
              exercise?.id &&
              exercise?.name
          )
          .map(
            exercise => ({
              id:
                String(
                  exercise.id
                ),

              name:
                String(
                  exercise.name
                ),

              muscle:
                exercise.muscle
                  ? String(
                      exercise.muscle
                    )
                  : undefined,

              equipment:
                exercise.equipment
                  ? String(
                      exercise.equipment
                    )
                  : undefined,

              category:
                exercise.category
                  ? String(
                      exercise.category
                    )
                  : undefined
            })
          );


      this.exerciseCatalog.set(
        normalized
      );


      if (
        normalized.length === 0
      ) {
        this.exerciseCatalogError.set(
          'No se pudo cargar el catálogo de ejercicios.'
        );
      }

    } catch {

      this.exerciseCatalogError.set(
        'No se pudo cargar el catálogo de ejercicios.'
      );

    } finally {

      this.exerciseCatalogLoading.set(
        false
      );
    }
  }


  avoidSearchResults():
    ExerciseOption[] {

    const query =
      this.avoidExerciseSearch()
        .trim()
        .toLocaleLowerCase(
          'es'
        );

    if (
      query.length < 2
    ) {
      return [];
    }


    return this
      .exerciseCatalog()
      .filter(
        exercise => {

          if (
            this
              .avoidedExerciseIds()
              .includes(
                exercise.id
              )
          ) {
            return false;
          }

          const searchable = [
            exercise.name,
            exercise.muscle ?? '',
            exercise.category ?? '',
            exercise.equipment ?? ''
          ]
            .join(' ')
            .toLocaleLowerCase(
              'es'
            );

          return searchable.includes(
            query
          );
        }
      )
      .slice(
        0,
        8
      );
  }


  preferredSearchResults():
    ExerciseOption[] {

    const query =
      this.preferredExerciseSearch()
        .trim()
        .toLocaleLowerCase(
          'es'
        );

    if (
      query.length < 2
    ) {
      return [];
    }


    return this
      .exerciseCatalog()
      .filter(
        exercise => {

          if (
            this
              .preferredExerciseIds()
              .includes(
                exercise.id
              )
          ) {
            return false;
          }

          const searchable = [
            exercise.name,
            exercise.muscle ?? '',
            exercise.category ?? '',
            exercise.equipment ?? ''
          ]
            .join(' ')
            .toLocaleLowerCase(
              'es'
            );

          return searchable.includes(
            query
          );
        }
      )
      .slice(
        0,
        8
      );
  }


  addAvoidedExercise(
    exercise: ExerciseOption
  ): void {

    if (
      this
        .avoidedExerciseIds()
        .includes(
          exercise.id
        )
    ) {
      return;
    }

    this.avoidedExerciseIds.set([
      ...this.avoidedExerciseIds(),
      exercise.id
    ]);


    this.preferredExerciseIds.set(
      this
        .preferredExerciseIds()
        .filter(
          id =>
            id !== exercise.id
        )
    );

    this.avoidExerciseSearch.set('');
  }


  removeAvoidedExercise(
    id: string
  ): void {

    this.avoidedExerciseIds.set(
      this
        .avoidedExerciseIds()
        .filter(
          value =>
            value !== id
        )
    );
  }


  addPreferredExercise(
    exercise: ExerciseOption
  ): void {

    if (
      this
        .preferredExerciseIds()
        .includes(
          exercise.id
        )
    ) {
      return;
    }

    if (
      this
        .preferredExerciseIds()
        .length >= 5
    ) {
      return;
    }

    this.preferredExerciseIds.set([
      ...this.preferredExerciseIds(),
      exercise.id
    ]);


    this.avoidedExerciseIds.set(
      this
        .avoidedExerciseIds()
        .filter(
          id =>
            id !== exercise.id
        )
    );

    this.preferredExerciseSearch.set('');
  }


  removePreferredExercise(
    id: string
  ): void {

    this.preferredExerciseIds.set(
      this
        .preferredExerciseIds()
        .filter(
          value =>
            value !== id
        )
    );
  }


  exerciseName(
    id: string
  ): string {

    return (
      this
        .exerciseCatalog()
        .find(
          exercise =>
            exercise.id === id
        )
        ?.name ??
      id
    );
  }


  focusLabel(
    focus:
      string |
      null |
      undefined
  ): string {

    const labels:
      Record<string, string> = {

        full_body:
          'Cuerpo completo',

        upper:
          'Torso',

        lower:
          'Pierna'
      };

    if (
      typeof focus !== 'string'
    ) {
      return 'Enfoque general';
    }

    const normalized =
      focus.trim();

    if (!normalized) {
      return 'Enfoque general';
    }

    return (
      labels[normalized] ??
      normalized
        .replaceAll('_', ' ')
    );
  }


  /* =======================================================
     VALIDATION
     ======================================================= */

  private validateProfile():
    string | null {

    if (
      !this.displayName().trim()
    ) {
      return 'Indica tu nombre.';
    }

    if (
      this.age() === null
    ) {
      return 'Indica tu edad.';
    }

    if (
      this.age()! < 14 ||
      this.age()! > 100
    ) {
      return (
        'Introduce una edad válida.'
      );
    }

    if (
      !this.sex()
    ) {
      return 'Selecciona tu sexo.';
    }

    if (
      this.heightCm() === null
    ) {
      return 'Indica tu altura.';
    }

    if (
      this.heightCm()! < 120 ||
      this.heightCm()! > 230
    ) {
      return (
        'Introduce una altura válida.'
      );
    }

    if (
      this.weightKg() === null
    ) {
      return 'Indica tu peso actual.';
    }

    if (
      this.weightKg()! < 30 ||
      this.weightKg()! > 300
    ) {
      return (
        'Introduce un peso válido.'
      );
    }

    if (
      this.motivations().length === 0
    ) {
      return (
        'Selecciona al menos una motivación.'
      );
    }

    return null;
  }


  /* =======================================================
     AUTH
     ======================================================= */

  private async getAuthHeaders():
    Promise<HttpHeaders> {

    const token =
      await this.auth.getAccessToken();

    if (!token) {
      throw new Error(
        'Necesitas iniciar sesión.'
      );
    }

    return new HttpHeaders({
      Authorization:
        `Bearer ${token}`
    });
  }


  /* =======================================================
     EQUIPMENT
     ======================================================= */

  private commercialGymEquipment():
    string[] {

    return [
      'barbell',
      'plates',
      'bench',
      'squat_rack',
      'dumbbells',
      'cable_machine',
      'lat_pulldown',
      'seated_row',
      'chest_press_machine',
      'shoulder_press_machine',
      'leg_press',
      'leg_extension',
      'seated_leg_curl',
      'lying_leg_curl',
      'calf_raise_machine',
      'mat',
      'bodyweight'
    ];
  }


  private resolvedEquipment():
    string[] {

    if (
      this.trainingLocation()
      === 'commercial_gym'
    ) {
      return (
        this.commercialGymEquipment()
      );
    }

    return this.availableEquipment();
  }


  /* =======================================================
     PROFILE PAYLOAD
     ======================================================= */

  private profilePayload() {

    const injuryNotes =
      this.hasLimitations() &&
      this.limitationNotes().trim()
        ? [
            this
              .limitationNotes()
              .trim()
          ]
        : [];


    return {

      display_name:
        this.displayName()
          .trim(),

      age:
        this.age(),

      sex:
        this.sex(),

      height_cm:
        this.heightCm(),

      weight_kg:
        this.weightKg(),

      motivations:
        this.motivations(),

      primary_goal:
        this.primaryGoal(),

      experience_level:
        this.experienceLevel(),

      weekly_availability:
        this.weeklyAvailability(),

      session_duration_min:
        this.sessionDurationMin(),

      training_location:
        this.trainingLocation(),

      available_equipment:
        this.resolvedEquipment(),

      injuries:
        injuryNotes,

      pain_areas:
        this.hasLimitations()
          ? this.painAreas()
          : [],

      avoided_exercise_ids:
        this.avoidedExerciseIds(),

      preferred_exercise_ids:
        this.preferredExerciseIds()
    };
  }


  /* =======================================================
     GENERATE
     ======================================================= */

  async generate():
    Promise<void> {

    const validationError =
      this.validateProfile();

    if (validationError) {
      this.error.set(
        validationError
      );

      return;
    }


    this.loading.set(true);

    this.error.set(null);

    this.completeError.set(null);

    this.proposal.set(null);


    try {

      const headers =
        await this.getAuthHeaders();


      const body = {
        profile:
          this.profilePayload()
      };


      const result =
        await new Promise<
          RoutineGenerationResult
        >(
          (
            resolve,
            reject
          ) => {

            this.http
              .post<
                RoutineGenerationResult
              >(
                (
                  `${this.apiUrl}` +
                  '/routines/generate'
                ),
                body,
                {
                  headers
                }
              )
              .subscribe({
                next: resolve,
                error: reject
              });
          }
        );


      this.proposal.set(
        result
      );

    } catch (
      err: any
    ) {

      this.error.set(
        err?.error?.detail ??
        err?.message ??
        (
          'No se pudo generar la rutina.'
        )
      );

    } finally {

      this.loading.set(
        false
      );
    }
  }


  /* =======================================================
     COMPLETE ONBOARDING
     ======================================================= */

  async completeOnboarding():
    Promise<void> {

    if (
      !this.proposal()
    ) {
      this.completeError.set(
        'Primero debes generar tu rutina.'
      );

      return;
    }


    if (
      this.completing()
    ) {
      return;
    }


    const validationError =
      this.validateProfile();

    if (validationError) {
      this.completeError.set(
        validationError
      );

      return;
    }


    this.completing.set(
      true
    );

    this.completeError.set(
      null
    );


    try {

      const headers =
        await this.getAuthHeaders();


      const response =
        await new Promise<
          CompleteOnboardingResponse
        >(
          (
            resolve,
            reject
          ) => {

            this.http
              .post<
                CompleteOnboardingResponse
              >(
                (
                  `${this.apiUrl}` +
                  '/onboarding/complete'
                ),
                {
                  profile:
                    this.profilePayload()
                },
                {
                  headers
                }
              )
              .subscribe({
                next: resolve,
                error: reject
              });
          }
        );


      if (
        !response
          .onboarding_completed
      ) {
        throw new Error(
          'No se pudo completar el onboarding.'
        );
      }


      await this.router.navigateByUrl(
        '/entrenar'
      );

    } catch (
      err: any
    ) {

      this.completeError.set(
        err?.error?.detail ??
        err?.message ??
        (
          'No se pudo guardar tu rutina. ' +
          'Inténtalo de nuevo.'
        )
      );

    } finally {

      this.completing.set(
        false
      );
    }
  }
}
