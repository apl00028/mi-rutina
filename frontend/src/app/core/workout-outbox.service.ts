import { TelemetryService } from './telemetry.service';
import { Injectable, OnDestroy, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { App } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export interface FinishedSnapshot { workoutId: string; status: string; finishedAt?: string; sets: unknown[]; }
@Injectable({providedIn: 'root'})
export class WorkoutOutboxService implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly telemetry = inject(TelemetryService);
  private readonly confirmed = new Map<string, FinishedSnapshot[]>();
  private queuedDuringFlight = false;
  private flight?: Promise<void>;
  private blockers = new Map<string, Promise<unknown>>();
  private listener?: PluginListenerHandle;
  private started = false;
  private lifecycle = 0;
  readonly pendingCount = signal(0);
  readonly error = signal('');
  private readonly authEffect = effect(() => {
    this.auth.user();
    this.pendingCount.set(0); this.error.set('');
    if (this.started) void this.sync();
  });
  private readonly wake = () => { void this.sync(); };
  private readonly visible = () => { if (document.visibilityState === 'visible') this.wake(); };
  private key(user: string) { return `aptus:finished-workouts:v1:${user}`; }
  private read(user: string): FinishedSnapshot[] {
    const rows: unknown = JSON.parse(localStorage.getItem(this.key(user)) ?? '[]');
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.workoutId !== 'string' || row.status !== 'finished' || !Array.isArray(row.sets))) throw new Error('Invalid local queue');
    return rows;
  }
  snapshots<T extends FinishedSnapshot>(): T[] {
    const user = this.auth.user()?.id;
    if (!user) return [];
    try { return this.read(user) as T[]; }
    catch { this.error.set('No se pudo leer la cola local. No borres los datos de la aplicación.'); return []; }
  }
  reconciledSnapshots<T extends FinishedSnapshot>(): T[] {
    const owner = this.auth.user()?.id;
    return [...this.snapshots<T>(), ...((owner && this.confirmed.get(owner)) || []) as T[]];
  }
  enqueue<T extends FinishedSnapshot>(snapshot: T, blocker?: Promise<unknown>): void {
    const user = this.auth.user()?.id;
    if (!user) throw new Error('Necesitas iniciar sesión para guardar la sesión en este dispositivo.');
    const rows = this.read(user);
    if (!rows.some(row => row.workoutId === snapshot.workoutId)) {
      rows.push(JSON.parse(JSON.stringify(snapshot)));
      localStorage.setItem(this.key(user), JSON.stringify(rows));
    }
    if (blocker) this.blockers.set(snapshot.workoutId, blocker.catch(() => undefined));
    this.pendingCount.set(rows.length);
    if (this.flight) this.queuedDuringFlight = true;
  }
  start(): void {
    if (this.started) return;
    this.started = true;
    const lifecycle = ++this.lifecycle;
    window.addEventListener('online', this.wake);
    document.addEventListener('visibilitychange', this.visible);
    if (Capacitor.isNativePlatform()) void App.addListener('appStateChange', state => {
      if (lifecycle === this.lifecycle && state.isActive) this.wake();
    }).then(listener => { if (this.started && lifecycle === this.lifecycle) this.listener = listener; else void listener.remove(); }).catch(() => undefined);
    void this.sync();
  }
  stop(): void {
    this.started = false; ++this.lifecycle;
    window.removeEventListener('online', this.wake);
    document.removeEventListener('visibilitychange', this.visible);
    void this.listener?.remove(); this.listener = undefined;
  }
  ngOnDestroy(): void { this.stop(); this.authEffect.destroy(); }
  async sync(): Promise<void> {
    if (this.flight) {
      this.queuedDuringFlight = true;
      await this.flight;

      if (this.auth.user()?.id !== this.flightOwner) {
        return this.sync();
      }

      if (this.flight) {
        await this.flight;
      }

      return;
    }
    const owner = this.auth.user()?.id;
    this.flightOwner = owner;
    if (!owner) { this.pendingCount.set(0); return; }
    this.queuedDuringFlight = false;
    const flight = Promise.resolve().then(async () => {
      try {
        const rows = this.read(owner); this.pendingCount.set(rows.length);
        for (const row of rows) {
          await this.blockers.get(row.workoutId); this.blockers.delete(row.workoutId);
          if (this.auth.user()?.id !== owner) return;
          const token = await this.auth.getAccessToken();
          if (!token || this.auth.user()?.id !== owner) return;
          const saved = await firstValueFrom(this.http.put<FinishedSnapshot>(
            `${environment.apiUrl}/workouts/${encodeURIComponent(row.workoutId)}`, row,
            {headers: new HttpHeaders({Authorization: `Bearer ${token}`})},
          ).pipe(timeout(15000)));
          if (saved.workoutId !== row.workoutId || saved.status !== 'finished') throw new Error('Unconfirmed workout');
          const remaining = this.read(owner).filter(item => item.workoutId !== row.workoutId);
          localStorage.setItem(this.key(owner), JSON.stringify(remaining));
          this.confirmed.set(owner, [...(this.confirmed.get(owner) ?? []).filter(item => item.workoutId !== saved.workoutId), saved]);
          if (this.auth.user()?.id === owner) void this.telemetry.track({event_name:'workout_completed',route:'/entrenar',metadata:{}});
          if (this.auth.user()?.id === owner) { this.pendingCount.set(remaining.length); this.error.set(''); }
        }
      } catch { if (this.auth.user()?.id === owner) this.error.set('Sesión guardada en este dispositivo, pendiente de sincronizar.'); }
    }).finally(() => { this.flight = undefined; if (this.queuedDuringFlight) void this.sync(); });
    this.flight = flight; await flight;
  }
  private flightOwner?: string;
}
