import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
@Injectable({providedIn:'root'})
export class WorkoutInactivityService {
  private readonly auth = inject(AuthService);
  readonly thresholdMs = 30 * 60 * 1000;
  private key(id: string) { return `aptus:workout-activity:${this.auth.user()?.id}:${id}`; }
  private memory = new Map<string, number>();
  touch(id: string): void {
    const key = this.key(id); this.memory.set(key, Date.now());
    try { localStorage.setItem(key, String(Date.now())); } catch { /* Reminder remains available in memory. */ }
  }
  idle(workout: {workoutId: string; startedAt?: string; sets: {completedAt?: string | null}[]}): boolean {
    const key = this.key(workout.workoutId);
    let stored = 0; try { stored = Number(localStorage.getItem(key)) || 0; } catch { /* Use recorded activity. */ }
    const latest = Math.max(stored, this.memory.get(key) ?? 0, Date.parse(workout.startedAt ?? '') || 0,
      ...workout.sets.map(set => Date.parse(set.completedAt ?? '') || 0));
    if (!latest) { this.touch(workout.workoutId); return false; }
    return Date.now() - latest >= this.thresholdMs;
  }
}
