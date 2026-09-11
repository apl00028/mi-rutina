import { computed, effect, EffectRef, Inject, Injectable, InjectionToken, Injector, OnDestroy, signal, untracked } from '@angular/core';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { AuthService } from './auth.service';
import { HealthConnect, HealthConnectRunningMetricSession } from './health-connect.plugin';
import { PersistedRunningSession, RunningService } from './running.service';
import { HealthConnectAccountService } from './health-connect-account.service';

type RunningNative = Pick<typeof HealthConnect, 'permissionStatus' | 'readGarminRunningMetrics'>;

export const RUNNING_HEALTH_CONNECT = new InjectionToken<RunningNative>('RUNNING_HEALTH_CONNECT', {
  providedIn: 'root', factory: () => ({
    permissionStatus: () => HealthConnect.permissionStatus(),
    readGarminRunningMetrics: () => HealthConnect.readGarminRunningMetrics(),
  }),
});

export interface RunningSyncProgress {
  local?: HealthConnectRunningMetricSession[];
  confirmed: PersistedRunningSession[];
  readError?: string;
  syncError?: string;
}

type Observer = (progress: RunningSyncProgress) => void;

@Injectable({ providedIn: 'root' })
export class RunningHealthConnectSyncService implements OnDestroy {
  private flight?: { userId: string; generation: number; promise: Promise<void>; progress: RunningSyncProgress; observers: Set<Observer> };
  private listener?: PluginListenerHandle;
  private authEffect?: EffectRef;
  private timer?: ReturnType<typeof setTimeout>;
  private lifecycle = 0;
  private generation = 0;
  private foreground = signal(false);
  private resumed = false;

  constructor(
    private auth: AuthService,
    private api: RunningService,
    private connection: HealthConnectAccountService,
    private injector: Injector,
    @Inject(RUNNING_HEALTH_CONNECT) private native: RunningNative,
  ) {}

  supported(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  start(): void {
    if (!this.supported() || this.authEffect) return;
    const lifecycle = ++this.lifecycle;
    const authenticatedUserId = computed(() => this.auth.user()?.id);
    this.authEffect = effect(() => {
      const userId = authenticatedUserId();
      const active = this.foreground();
      this.connection.revision();
      const generation = ++this.generation;
      this.cancelTimer();
      if (!userId || !active) return;
      untracked(() => { void this.automatic(generation); });
      if (this.resumed) {
        this.timer = setTimeout(() => {
          this.timer = undefined;
          // If the first read is slow, the deferred check must still be a new read.
          void this.automatic(generation, true);
        }, 30_000);
      }
    }, { injector: this.injector });
    void this.listen(lifecycle);
  }

  private async listen(lifecycle: number): Promise<void> {
    let receivedState = false;
    try {
      const listener = await NativeApp.addListener('appStateChange', ({ isActive }) => {
        if (lifecycle !== this.lifecycle) return;
        receivedState = true;
        if (this.foreground() === isActive) return;
        this.resumed = isActive;
        // Invalidate deferred work immediately, before Angular runs the effect.
        ++this.generation;
        this.cancelTimer();
        this.foreground.set(isActive);
      });
      if (lifecycle !== this.lifecycle) { await listener.remove(); return; }
      this.listener = listener;
      const state = await NativeApp.getState();
      if (lifecycle === this.lifecycle && !receivedState) this.foreground.set(state.isActive);
    } catch {
      // Lifecycle/permission errors must never prevent navigation.
    }
  }

  stop(): void {
    ++this.lifecycle;
    ++this.generation;
    this.cancelTimer();
    this.authEffect?.destroy();
    this.authEffect = undefined;
    const listener = this.listener;
    this.listener = undefined;
    if (listener) void listener.remove().catch(() => undefined);
    this.foreground.set(false);
    this.resumed = false;
  }

  ngOnDestroy(): void { this.stop(); }

  private cancelTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async automatic(generation: number, fresh = false): Promise<void> {
    try {
      if (fresh && this.flight) await this.flight.promise;
      if (generation !== this.generation || !this.foreground()) return;
      await this.sync(undefined, true);
    } catch {
      // A later startup/resume/manual refresh retries using the same identity.
    }
  }

  async sync(observer?: Observer, automatic = false): Promise<void> {
    if (!this.supported()) return;
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const generation = this.generation;
    while (this.flight && (this.flight.userId !== userId || this.flight.generation !== generation)) {
      await this.flight.promise;
    }
    if (this.auth.user()?.id !== userId || generation !== this.generation) return;
    if (!this.flight) {
      const progress: RunningSyncProgress = { confirmed: [] };
      const observers = new Set<Observer>();
      // Start on a microtask so every caller sees the same flight before native work.
      const promise = Promise.resolve().then(() => this.run(userId, generation, automatic, progress, observers))
        .finally(() => { this.flight = undefined; });
      this.flight = { userId, generation, promise, progress, observers };
    }
    const flight = this.flight;
    if (observer) { flight.observers.add(observer); observer(flight.progress); }
    try { await flight.promise; }
    finally { if (observer) flight.observers.delete(observer); }
  }

  private async run(userId: string, generation: number, automatic: boolean, progress: RunningSyncProgress, observers: Set<Observer>): Promise<void> {
    const current = () => this.auth.user()?.id === userId && generation === this.generation;
    const publish = () => { if (current()) observers.forEach(observer => observer(progress)); };
    try {
      const connected =
        await this.connection.enabled();

      if (!current() || !connected) {
        return;
      }

      if (automatic) {
        const permissions = await this.native.permissionStatus();
        if (!current()) return;
        if (!(permissions.exercise && permissions.distance && permissions.speed && permissions.heartRate)) {
          progress.readError = 'Faltan permisos de Health Connect para leer carreras.';
          publish();
          return;
        }
      }
      if (!current()) return;
      progress.local = (await this.native.readGarminRunningMetrics()).sessions;
      if (!current()) return;
      publish();
    } catch (error) {
      progress.readError = error instanceof Error ? error.message : 'No se pudieron leer las carreras de Health Connect.';
      publish();
      return;
    }
    for (let offset = 0; offset < progress.local.length; offset += 25) {
      if (!current()) return;
      const batch = progress.local.slice(offset, offset + 25);
      try {
        const response = await this.api.syncSessions(batch, userId);
        if (!current()) return;
        const confirmed = response.results.flatMap(item => item.session && !item.error ? [item.session] : []);
        progress.confirmed.push(...confirmed);
        if (confirmed.length !== batch.length || response.results.some(item => item.error)) {
          progress.syncError = 'Algunas carreras no se pudieron sincronizar. Puedes reintentar.';
        }
      } catch {
        progress.syncError = 'No se pudieron sincronizar algunas carreras. Puedes reintentar.';
      }
      publish();
    }
  }
}
