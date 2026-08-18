import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { AuthService } from './core/auth.service';

interface Exercise {
  exerciseId: string;
  name: string;
  sets: number;
  target?: string;
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
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  routine = signal<Routine | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  activeWorkout = signal<Workout | null>(null);
  activeSession = signal<RoutineSession | null>(null);
  workoutHistory = signal<Workout[]>([]);

  workoutLoading = signal(false);
  workoutError = signal<string | null>(null);

  email = signal('');
  loginLoading = signal(false);
  loginMessage = signal<string | null>(null);

  private readonly apiUrl = 'http://127.0.0.1:8080/api/v1';

  constructor(
    private http: HttpClient,
    public auth: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadRoutine();
    await this.loadWorkoutHistory();
    this.restoreActiveWorkout();
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

      this.routine.set(routine);

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo cargar la rutina.'
      );
    } finally {
      this.loading.set(false);
    }
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
      value === '' ? null : Number(value);

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
  }

  async completeSet(
    exerciseId: string,
    setIndex: number
  ): Promise<void> {
    const workout = this.activeWorkout();

    if (!workout) {
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
              completedAt: new Date().toISOString()
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

      const saved = await new Promise<Workout>((resolve, reject) => {
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

      this.activeWorkout.set(saved);

      this.workoutHistory.set(
        this.workoutHistory().map(item =>
          item.workoutId === saved.workoutId
            ? saved
            : item
        )
      );

    } catch (err: any) {
      this.workoutError.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo guardar el entrenamiento.'
      );
    } finally {
      this.workoutLoading.set(false);
    }
  }

  async finishWorkout(): Promise<void> {
    const workout = this.activeWorkout();

    if (!workout) {
      return;
    }

    const finishedWorkout: Workout = {
      ...workout,
      status: 'finished',
      finishedAt: new Date().toISOString()
    };

    this.activeWorkout.set(finishedWorkout);

    await this.saveWorkout();

    this.workoutHistory.set(
      this.workoutHistory().map(item =>
        item.workoutId === finishedWorkout.workoutId
          ? finishedWorkout
          : item
      )
    );

    this.activeWorkout.set(null);
    this.activeSession.set(null);
  }
}