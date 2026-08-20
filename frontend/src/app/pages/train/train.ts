import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';

interface Exercise {
  exerciseId: string;
  name: string;
  sets: number;
  target?: string;
  targetRir?: {
    min: number;
    max: number;
  } | null;
  restSeconds?: number | null;
}

interface RoutineSession {
  sessionId: string;
  label: string;
  name: string;
  exercises: Exercise[];
}

interface Routine {
  routineId: string;
  schemaVersion: string;
  revision: number;
  sessions: RoutineSession[];
}

interface WorkoutSetInput {
  setId: string;
  exerciseId: string;
  setIndex: number;
  weight?: number | null;
  reps?: number | null;
  rir?: number | null;
  durationSeconds?: number | null;
  completedAt?: string | null;
}

interface Workout {
  workoutId: string;
  routineId: string;
  sessionId: string;
  status: 'in_progress' | 'finished';
  startedAt?: string;
  finishedAt?: string;
  sets: WorkoutSetInput[];
}

@Component({
  selector: 'app-train',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './train.html',
  styleUrl: './train.scss'
})
type AutosaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error';


export class Train implements OnInit, OnDestroy {
  routine = signal<Routine | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  activeWorkout = signal<Workout | null>(null);
  activeSession = signal<RoutineSession | null>(null);
  workoutHistory = signal<Workout[]>([]);

  workoutLoading = signal(false);
  workoutError = signal<string | null>(null);
  autosaveStatus =
    signal<AutosaveStatus>('idle');

  email = signal('');
  loginLoading = signal(false);
  loginMessage = signal<string | null>(null);

  private readonly apiUrl = environment.apiUrl;
  private readonly autosaveDelayMs = 750;

  private autosaveTimer:
    ReturnType<typeof setTimeout> | null = null;

  private currentSave:
    Promise<void> | null = null;

  private saveQueued = false;
  private workoutEditVersion = 0;
  private persistedEditVersion = 0;
  private finishingWorkout = false;
  private destroyed = false;

  constructor(
    private http: HttpClient,
    public auth: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadRoutine();
    await this.loadWorkoutHistory();
    this.restoreActiveWorkout();
  }


  ngOnDestroy(): void {
    this.destroyed = true;

    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }

    const workout = this.activeWorkout();

    if (
      workout?.status === 'in_progress' &&
      this.workoutEditVersion >
      this.persistedEditVersion &&
      !this.currentSave
    ) {
      void this.saveLatestWorkout({
        showLoading: false
      });
    }
  }

  async loadRoutine(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const token = await this.auth.getAccessToken();

      if (!token) {
        this.error.set('Necesitas iniciar sesión.');
        return;
      }

      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`
      });

      const routine = await new Promise<Routine>((resolve, reject) => {
        this.http
          .get<Routine>(
            `${this.apiUrl}/routines/active`,
            { headers }
          )
          .subscribe({
            next: resolve,
            error: reject
          });
      });

      const normalized =
        this.normalizeRoutine(routine);

      if (!normalized) {
        this.error.set(
          'La rutina activa no tiene sesiones disponibles.'
        );
        this.routine.set(null);
        return;
      }

      this.routine.set(normalized);

    } catch (err: any) {
      if (err?.status === 404) {
        this.error.set(
          'Todavía no tienes una rutina activa. Completa el onboarding o activa una rutina antes de entrenar.'
        );
        return;
      }

      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo cargar la rutina.'
      );
    } finally {
      this.loading.set(false);
    }
  }


  private normalizeRoutine(
    value: Routine | null
  ): Routine | null {
    if (
      !value ||
      !Array.isArray(value.sessions)
    ) {
      return null;
    }

    const sessions =
      value.sessions
        .filter(
          session =>
            typeof session?.sessionId === 'string' &&
            session.sessionId.trim() &&
            Array.isArray(session.exercises)
        )
        .map(
          session => ({
            ...session,
            exercises:
              session.exercises.filter(
                exercise =>
                  typeof exercise?.exerciseId === 'string' &&
                  exercise.exerciseId.trim() &&
                  typeof exercise?.name === 'string' &&
                  exercise.name.trim() &&
                  Number.isInteger(exercise.sets) &&
                  exercise.sets > 0
              )
          })
        )
        .filter(
          session =>
            session.exercises.length > 0
        );

    if (!sessions.length) {
      return null;
    }

    return {
      ...value,
      sessions
    };
  }

  async loadWorkoutHistory(): Promise<void> {
    try {
      const token = await this.auth.getAccessToken();

      if (!token) {
        return;
      }

      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`
      });

      const workouts = await new Promise<Workout[]>((resolve, reject) => {
        this.http
          .get<Workout[]>(
            `${this.apiUrl}/workouts`,
            { headers }
          )
          .subscribe({
            next: resolve,
            error: reject
          });
      });

      this.workoutHistory.set(workouts);

    } catch (err) {
      console.error(
        'No se pudo cargar el historial de entrenamientos',
        err
      );
    }
  }

  restoreActiveWorkout(): void {
    const routine = this.routine();

    if (!routine) {
      return;
    }

    const active = this.workoutHistory().find(
      workout => workout.status === 'in_progress'
    );

    if (!active) {
      return;
    }

    const session = routine.sessions.find(
      session => session.sessionId === active.sessionId
    );

    if (!session) {
      return;
    }

    this.activeWorkout.set(active);
    this.activeSession.set(session);
  }

  getPreviousSet(
    exerciseId: string,
    setIndex: number
  ): WorkoutSetInput | null {
    const currentWorkoutId = this.activeWorkout()?.workoutId;

    for (const workout of this.workoutHistory()) {
      if (workout.workoutId === currentWorkoutId) {
        continue;
      }

      if (workout.status !== 'finished') {
        continue;
      }

      const previousSet = workout.sets.find(
        set =>
          set.exerciseId === exerciseId &&
          set.setIndex === setIndex &&
          Boolean(set.completedAt)
      );

      if (previousSet) {
        return previousSet;
      }
    }

    return null;
  }

  getCurrentSet(
    exerciseId: string,
    setIndex: number
  ): WorkoutSetInput | null {
    const workout = this.activeWorkout();

    if (!workout) {
      return null;
    }

    return workout.sets.find(
      set =>
        set.exerciseId === exerciseId &&
        set.setIndex === setIndex
    ) ?? null;
  }

  async sendMagicLink(event: Event): Promise<void> {
    event.preventDefault();

    if (!this.email().trim()) {
      return;
    }

    this.loginLoading.set(true);
    this.loginMessage.set(null);

    try {
      await this.auth.signInWithMagicLink(
        this.email().trim()
      );

      this.loginMessage.set(
        'Te hemos enviado un enlace de acceso por email.'
      );

    } catch (err: any) {
      this.loginMessage.set(
        err?.message ??
        'No se pudo enviar el enlace de acceso.'
      );
    } finally {
      this.loginLoading.set(false);
    }
  }

  async startWorkout(
    session: RoutineSession
  ): Promise<void> {
    const routine = this.routine();

    if (!routine) {
      return;
    }

    if (this.workoutLoading()) {
      return;
    }

    if (this.activeWorkout()) {
      this.workoutError.set(
        'Ya tienes un entrenamiento en curso.'
      );
      return;
    }

    this.workoutLoading.set(true);
    this.workoutError.set(null);

    try {
      const token = await this.auth.getAccessToken();

      if (!token) {
        throw new Error('Necesitas iniciar sesión.');
      }

      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`
      });

      const workout: Workout = {
        workoutId: crypto.randomUUID(),
        routineId: routine.routineId,
        sessionId: session.sessionId,
        status: 'in_progress',
        sets: []
      };

      const created = await new Promise<Workout>((resolve, reject) => {
        this.http
          .post<Workout>(
            `${this.apiUrl}/workouts`,
            workout,
            { headers }
          )
          .subscribe({
            next: resolve,
            error: reject
          });
      });

      this.activeWorkout.set(created);
      this.activeSession.set(session);
      this.workoutEditVersion = 0;
      this.persistedEditVersion = 0;
      this.autosaveStatus.set('saved');

      this.workoutHistory.set([
        created,
        ...this.workoutHistory()
      ]);

    } catch (err: any) {
      this.workoutError.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo iniciar el entrenamiento.'
      );
    } finally {
      this.workoutLoading.set(false);
    }
  }

  updateSet(
    exerciseId: string,
    setIndex: number,
    field: 'weight' | 'reps' | 'rir',
    value: string
  ): void {
    const workout = this.activeWorkout();

    if (!workout) {
      return;
    }

    const numericValue =
      value === ''
        ? null
        : Number(value);

    if (
      numericValue !== null &&
      (
        Number.isNaN(numericValue) ||
        numericValue < 0
      )
    ) {
      return;
    }

    const existing = workout.sets.find(
      set =>
        set.exerciseId === exerciseId &&
        set.setIndex === setIndex
    );

    let sets: WorkoutSetInput[];

    if (existing) {
      sets = workout.sets.map(set =>
        set.exerciseId === exerciseId &&
        set.setIndex === setIndex
          ? {
              ...set,
              [field]: numericValue
            }
          : set
      );

    } else {
      sets = [
        ...workout.sets,
        {
          setId: crypto.randomUUID(),
          exerciseId,
          setIndex,
          weight:
            field === 'weight'
              ? numericValue
              : null,
          reps:
            field === 'reps'
              ? numericValue
              : null,
          rir:
            field === 'rir'
              ? numericValue
              : null
        }
      ];
    }

    this.activeWorkout.set({
      ...workout,
      sets
    });

    this.workoutEditVersion += 1;
    this.scheduleAutosave();
  }

  async completeSet(
    exerciseId: string,
    setIndex: number
  ): Promise<void> {
    const workout = this.activeWorkout();

    if (!workout) {
      return;
    }

    if (this.workoutLoading()) {
      return;
    }

    const existing = workout.sets.find(
      set =>
        set.exerciseId === exerciseId &&
        set.setIndex === setIndex
    );

    let sets: WorkoutSetInput[];

    if (existing) {
      sets = workout.sets.map(set =>
        set.exerciseId === exerciseId &&
        set.setIndex === setIndex
          ? {
              ...set,
              completedAt: set.completedAt
                ? null
                : new Date().toISOString()
            }
          : set
      );

    } else {
      sets = [
        ...workout.sets,
        {
          setId: crypto.randomUUID(),
          exerciseId,
          setIndex,
          completedAt: new Date().toISOString()
        }
      ];
    }

    this.activeWorkout.set({
      ...workout,
      sets
    });
    this.workoutEditVersion += 1;

    await this.saveWorkout();
  }

  isSetCompleted(
    exerciseId: string,
    setIndex: number
  ): boolean {
    const workout = this.activeWorkout();

    if (!workout) {
      return false;
    }

    return workout.sets.some(
      set =>
        set.exerciseId === exerciseId &&
        set.setIndex === setIndex &&
        Boolean(set.completedAt)
    );
  }

  async saveWorkout(): Promise<void> {
    const workout = this.activeWorkout();

    if (!workout) {
      return;
    }

    this.cancelAutosaveTimer();

    try {
      await this.saveLatestWorkout({
        showLoading: true
      });

    } catch (err: any) {
      this.workoutError.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo guardar el entrenamiento.'
      );
    }
  }


  private async persistWorkout(
    workout: Workout,
    options: {
      showLoading: boolean;
    } = {
      showLoading: true
    }
  ): Promise<Workout> {
    if (options.showLoading) {
      this.workoutLoading.set(true);
    }

    this.workoutError.set(null);

    try {
      const token = await this.auth.getAccessToken();

      if (!token) {
        throw new Error('Necesitas iniciar sesión.');
      }

      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`
      });

      return await new Promise<Workout>((resolve, reject) => {
        this.http
          .put<Workout>(
            `${this.apiUrl}/workouts/${workout.workoutId}`,
            workout,
            { headers }
          )
          .subscribe({
            next: resolve,
            error: reject
          });
      });

    } finally {
      if (options.showLoading) {
        this.workoutLoading.set(false);
      }
    }
  }


  private cloneWorkout(
    workout: Workout
  ): Workout {
    return JSON.parse(
      JSON.stringify(workout)
    ) as Workout;
  }


  private updateWorkoutHistory(
    workout: Workout
  ): void {
    const current =
      this.workoutHistory();

    if (
      current.some(
        item =>
          item.workoutId === workout.workoutId
      )
    ) {
      this.workoutHistory.set(
        current.map(item =>
          item.workoutId === workout.workoutId
            ? workout
            : item
        )
      );
      return;
    }

    this.workoutHistory.set([
      workout,
      ...current
    ]);
  }


  private scheduleAutosave(): void {
    if (this.destroyed) {
      return;
    }

    const workout =
      this.activeWorkout();

    if (
      !workout ||
      workout.status !== 'in_progress' ||
      this.finishingWorkout
    ) {
      return;
    }

    this.autosaveStatus.set('idle');

    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
    }

    this.autosaveTimer =
      setTimeout(
        () => {
          this.autosaveTimer = null;
          void this.runAutosave();
        },
        this.autosaveDelayMs
      );
  }


  private cancelAutosaveTimer(): void {
    if (!this.autosaveTimer) {
      return;
    }

    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
  }


  private async runAutosave():
    Promise<void> {

    if (
      this.destroyed ||
      this.finishingWorkout
    ) {
      return;
    }

    if (this.currentSave) {
      this.saveQueued = true;
      return;
    }

    try {
      await this.saveLatestWorkout({
        showLoading: false
      });

    } catch {
      // Autosave errors are surfaced through autosaveStatus/workoutError.
    }
  }


  private async saveLatestWorkout(
    options: {
      showLoading: boolean;
    }
  ): Promise<void> {

    while (this.currentSave) {
      this.saveQueued = true;

      try {
        await this.currentSave;
      } catch {
        // The latest state is still attempted below.
      }
    }

    const workout =
      this.activeWorkout();

    if (!workout) {
      return;
    }

    const snapshot =
      this.cloneWorkout(workout);

    const snapshotVersion =
      this.workoutEditVersion;

    this.saveQueued = false;
    this.autosaveStatus.set('saving');

    const save =
      this.persistWorkout(
        snapshot,
        options
      )
        .then(saved => {
          const current =
            this.activeWorkout();

          if (
            current &&
            current.workoutId === saved.workoutId &&
            !this.finishingWorkout &&
            this.workoutEditVersion === snapshotVersion
          ) {
            this.activeWorkout.set(saved);
            this.persistedEditVersion =
              snapshotVersion;
          }

          this.updateWorkoutHistory(saved);

          if (
            this.workoutEditVersion === snapshotVersion
          ) {
            this.autosaveStatus.set('saved');
          }
        })
        .catch(error => {
          if (
            this.workoutEditVersion === snapshotVersion
          ) {
            this.autosaveStatus.set('error');
          }

          throw error;
        })
        .finally(() => {
          this.currentSave = null;

          if (
            this.saveQueued &&
            !this.destroyed &&
            !this.finishingWorkout
          ) {
            this.saveQueued = false;
            void this.runAutosave();
          }
        });

    this.currentSave = save;

    await save;
  }

  async finishWorkout(): Promise<void> {
    const workout = this.activeWorkout();

    if (!workout) {
      return;
    }

    if (this.workoutLoading()) {
      return;
    }

    this.cancelAutosaveTimer();
    this.finishingWorkout = true;

    if (this.currentSave) {
      try {
        await this.currentSave;
      } catch {
        // Finalization below persists the current in-memory workout.
      }
    }

    const currentWorkout =
      this.activeWorkout();

    if (!currentWorkout) {
      this.finishingWorkout = false;
      return;
    }

    const finishedWorkout: Workout = {
      ...currentWorkout,
      status: 'finished',
      finishedAt: new Date().toISOString()
    };

    try {
      const saved =
        await this.persistWorkout(
          finishedWorkout,
          {
            showLoading: true
          }
        );

      this.updateWorkoutHistory(saved);
      this.persistedEditVersion =
        this.workoutEditVersion;
      this.autosaveStatus.set('saved');

      this.activeWorkout.set(null);
      this.activeSession.set(null);

    } catch (err: any) {
      this.workoutError.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo finalizar el entrenamiento.'
      );
    } finally {
      this.finishingWorkout = false;
    }
  }
}
