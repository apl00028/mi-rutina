import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { RunningService } from './running.service';
import { WorkoutOutboxService } from './workout-outbox.service';
import { environment } from '../../environments/environment';
import { ActivityDetail, ActivityRoutine, ActivityWorkout, runningActivities, swimmingActivities, workoutActivities } from '../features/training/domain/activity-history';
import type { SwimmingFitImportResponse } from '../features/swimming/domain/swimming-fit-session';

// Scoped to Home: the available history covers every month and is reused until refresh or leaving the page.
@Injectable()
export class ActivityHistoryService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly running = inject(RunningService);
  private readonly outbox = inject(WorkoutOutboxService);
  readonly loading = signal(false);
  readonly errors = signal<string[]>([]);
  readonly activities = signal<ActivityDetail[]>([]);
  readonly workouts = signal<ActivityWorkout[]>([]);
  private loaded = false;
  private flight?: Promise<void>;

  load(refresh = false): Promise<void> {
    if (this.flight) return this.flight;
    if (this.loaded && !refresh) return Promise.resolve();
    this.flight = this.fetch().finally(() => { this.flight = undefined; });
    return this.flight;
  }
  private async fetch(): Promise<void> {
    this.loading.set(true);
    this.errors.set([]);
    try {
      const token = await this.auth.getAccessToken();
      if (!token) throw new Error('Necesitas iniciar sesión para cargar las actividades.');
      const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
      const results = await Promise.allSettled([
        firstValueFrom(this.http.get<ActivityWorkout[]>(`${environment.apiUrl}/workouts`, { headers })),
        firstValueFrom(this.http.get<ActivityRoutine[]>(`${environment.apiUrl}/routines`, { headers })),
        this.running.listSessions(),
        firstValueFrom(this.http.get<SwimmingFitImportResponse[]>(`${environment.apiUrl}/swimming/sessions`, { headers })),
      ]);
      const [workouts, routines, running, swimming] = results;
      const merged = new Map<string, ActivityWorkout>(
        (workouts.status === 'fulfilled' ? workouts.value : []).map(row => [row.workoutId, row]),
      );
      // Local finalization wins over a stale in_progress response, just as in Train.
      for (const snapshot of this.outbox.reconciledSnapshots<ActivityWorkout>()) merged.set(snapshot.workoutId, snapshot);
      this.workouts.set([...merged.values()]);
      const sources = ['entrenamientos', 'nombres y disciplinas de las rutinas', 'carrera', 'natación'];
      this.errors.set(results.flatMap((result, index) => result.status === 'rejected' ? [`No se pudo cargar ${sources[index]}.`] : []));
      this.activities.set([
        ...workoutActivities(this.workouts(), routines.status === 'fulfilled' ? routines.value : []),
        ...(running.status === 'fulfilled' ? runningActivities(running.value) : []),
        ...(swimming.status === 'fulfilled' ? swimmingActivities(swimming.value) : []),
      ].sort((a, b) => Date.parse(b.event_at ?? '') - Date.parse(a.event_at ?? '')));
      this.loaded = true;
    } catch (error) {
      this.errors.set([error instanceof Error ? error.message : 'No se pudieron cargar las actividades.']);
    } finally {
      this.loading.set(false);
    }
  }
}
