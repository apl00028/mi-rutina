import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { RunningService } from './running.service';
import { HealthConnectAccountService } from './health-connect-account.service';
import { RunningHealthConnectSyncService, RUNNING_HEALTH_CONNECT } from './running-health-connect-sync.service';

const lifecycle = vi.hoisted(() => ({ addListener: vi.fn(), getState: vi.fn() }));
vi.mock('@capacitor/app', () => ({ App: lifecycle }));

const session = {
  recordId: 'hc-06-09', sourcePackage: 'com.garmin.android.apps.connectmobile', exerciseType: 33,
  startTime: '2026-09-06T08:00:00Z', endTime: '2026-09-06T08:30:00Z', distanceMeters: 5000,
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};

describe('Running Health Connect synchronization', () => {
  const user = signal<{ id: string } | null>(null);
  const native = { permissionStatus: vi.fn(), readGarminRunningMetrics: vi.fn(), openPermissions: vi.fn() };
  const api = { syncSessions: vi.fn() };
  const connection = {
    revision: signal(0),
    enabled: vi.fn()
  };
  const remove = vi.fn();
  let state: (state: { isActive: boolean }) => void;
  let service: RunningHealthConnectSyncService;

  async function settle() {
    TestBed.tick();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    TestBed.tick();
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }
  async function resume() {
    state({ isActive: false }); await settle();
    state({ isActive: true }); await settle();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    user.set({ id: 'athlete-a' });
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    remove.mockResolvedValue(undefined);
    lifecycle.addListener.mockImplementation(async (_name, callback) => {
      state = callback; return { remove };
    });
    lifecycle.getState.mockResolvedValue({ isActive: true });
    connection.enabled.mockResolvedValue(true);
    native.permissionStatus.mockResolvedValue({ exercise: true, distance: true, speed: true, heartRate: true });
    native.readGarminRunningMetrics.mockResolvedValue({ sessions: [session] });
    api.syncSessions.mockImplementation(async (sessions) => ({ synced: sessions.length,
      results: sessions.map((s: typeof session) => ({ session: { source_record_id: s.recordId } })) }));
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { user } },
      { provide: RunningService, useValue: api },
      { provide: HealthConnectAccountService, useValue: connection },
      { provide: RUNNING_HEALTH_CONNECT, useValue: native },
    ] });
    service = TestBed.inject(RunningHealthConnectSyncService);
  });
  afterEach(() => { service.stop(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('syncs restored authentication once without opening Correr and registers one listener', async () => {
    user.set(null);
    service.start(); service.start(); await settle();
    expect(native.readGarminRunningMetrics).not.toHaveBeenCalled();
    user.set({ id: 'athlete-a' }); await settle();
    expect(api.syncSessions).toHaveBeenCalledExactlyOnceWith([session], 'athlete-a');
    expect(lifecycle.addListener).toHaveBeenCalledTimes(1);
  });

  it('does not resync on token refresh or duplicate active notifications', async () => {
    service.start(); await settle();
    user.set({ id: 'athlete-a' }); await settle();
    state({ isActive: true }); await settle();
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(1);
  });

  it('serializes startup behind a manual read invalidated by lifecycle initialization', async () => {
    const read = deferred<any>();
    native.readGarminRunningMetrics.mockReturnValueOnce(read.promise);
    const manual = service.sync();
    await settle();
    service.start(); await settle();
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(1);
    read.resolve({ sessions: [session] });
    await manual; await settle();
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(2);
    expect(api.syncSessions).toHaveBeenCalledExactlyOnceWith([session], 'athlete-a');
  });

  it('reads and uploads exactly twice after resume, sending corrected metrics at 30 seconds', async () => {
    service.start(); await settle();
    expect(api.syncSessions).toHaveBeenCalledTimes(1);
    native.readGarminRunningMetrics.mockClear();
    api.syncSessions.mockClear();

    await resume();
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(1);
    expect(api.syncSessions).toHaveBeenCalledExactlyOnceWith([session], 'athlete-a');
    const corrected = { ...session, distanceMeters: 5100 };
    native.readGarminRunningMetrics.mockResolvedValue({ sessions: [corrected] });

    await vi.advanceTimersByTimeAsync(29_999); await settle();
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(1);
    expect(api.syncSessions).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); await settle();
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(2);
    expect(api.syncSessions).toHaveBeenCalledTimes(2);
    expect(api.syncSessions).toHaveBeenNthCalledWith(2, [corrected], 'athlete-a');
    expect(api.syncSessions.mock.calls[1][0][0].recordId).toBe(session.recordId);
    await vi.advanceTimersByTimeAsync(300_000); await settle();
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(2);
    expect(api.syncSessions).toHaveBeenCalledTimes(2);
  });

  it('cancels the deferred upload when backgrounded before 30 seconds', async () => {
    service.start(); await settle();
    native.readGarminRunningMetrics.mockClear();
    api.syncSessions.mockClear();
    await resume();
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(1);
    expect(api.syncSessions).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29_999); await settle();
    state({ isActive: false }); await settle();
    await vi.advanceTimersByTimeAsync(300_000); await settle();
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(1);
    expect(api.syncSessions).toHaveBeenCalledTimes(1);
  });

  it('replaces the deferred check on another resume and cancels it on background/logout', async () => {
    service.start(); await settle(); await resume();
    await vi.advanceTimersByTimeAsync(20_000);
    await resume();
    const count = native.readGarminRunningMetrics.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(count);
    state({ isActive: false }); await settle();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(count);
    state({ isActive: true }); await settle();
    user.set(null); await settle();
    const afterLogout = native.readGarminRunningMetrics.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(afterLogout);
  });

  it('shares native read and upload with manual refresh and replays local progress while upload is pending', async () => {
    const upload = deferred<any>();
    api.syncSessions.mockReturnValue(upload.promise);
    service.start(); await settle();
    const observer = vi.fn();
    const manual = service.sync(observer);
    expect(observer.mock.lastCall?.[0].local).toEqual([session]);
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(1);
    expect(api.syncSessions).toHaveBeenCalledTimes(1);
    upload.resolve({ results: [{ session: { id: 'saved' } }] });
    await manual;
    expect(observer.mock.lastCall?.[0].confirmed).toEqual([{ id: 'saved' }]);
  });

  it('fires at 30 seconds, waits for a slow flight, then reads and uploads again', async () => {
    service.start(); await settle();
    native.readGarminRunningMetrics.mockClear();
    api.syncSessions.mockClear();
    const upload = deferred<any>();
    api.syncSessions.mockReturnValueOnce(upload.promise);
    await resume();
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(1);
    expect(api.syncSessions).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000); await settle();
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(1);
    expect(api.syncSessions).toHaveBeenCalledTimes(1);

    const corrected = { ...session, distanceMeters: 5100 };
    native.readGarminRunningMetrics.mockResolvedValue({ sessions: [corrected] });
    upload.resolve({ results: [{ session: { source_record_id: session.recordId } }] });
    await settle();
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(2);
    expect(api.syncSessions).toHaveBeenCalledTimes(2);
    expect(api.syncSessions).toHaveBeenNthCalledWith(2, [corrected], 'athlete-a');
  });

  it('discards the previous account read and replaces pending deferred work on account change', async () => {
    service.start(); await settle();
    const read = deferred<any>();
    native.readGarminRunningMetrics.mockReturnValueOnce(read.promise);
    await resume();
    user.set({ id: 'athlete-b' }); await settle();
    read.resolve({ sessions: [{ ...session, recordId: 'old-account-read' }] }); await settle();
    expect(api.syncSessions.mock.calls.some(([rows]) => rows[0]?.recordId === 'old-account-read')).toBe(false);
    expect(api.syncSessions).toHaveBeenLastCalledWith([session], 'athlete-b');
    service.stop();
    const count = native.readGarminRunningMetrics.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(native.readGarminRunningMetrics).toHaveBeenCalledTimes(count);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('skips missing permissions and tolerates permission/read/upload errors without requesting permissions', async () => {
    native.permissionStatus.mockResolvedValue({ exercise: true });
    service.start(); await settle();
    expect(native.readGarminRunningMetrics).not.toHaveBeenCalled();
    native.permissionStatus.mockRejectedValueOnce(new Error('unavailable'));
    await resume();
    native.permissionStatus.mockResolvedValue({ exercise: true, distance: true, speed: true, heartRate: true });
    native.readGarminRunningMetrics.mockRejectedValueOnce(new Error('read failed'));
    await resume();
    api.syncSessions.mockRejectedValueOnce(new Error('offline'));
    await resume();
    await resume();
    expect(api.syncSessions).toHaveBeenCalledTimes(2);
    expect(native.openPermissions).not.toHaveBeenCalled();
  });


  it('does not read Health Connect when the current Aptus account is disconnected', async () => {
    connection.enabled.mockResolvedValue(false);

    service.start();
    await settle();

    expect(
      connection.enabled
    ).toHaveBeenCalled();

    expect(
      native.permissionStatus
    ).not.toHaveBeenCalled();

    expect(
      native.readGarminRunningMetrics
    ).not.toHaveBeenCalled();

    expect(
      api.syncSessions
    ).not.toHaveBeenCalled();
  });


  it('does not inherit account A Health Connect connection after switching to account B', async () => {
    connection.enabled.mockImplementation(
      async () =>
        user()?.id === 'athlete-a'
    );

    service.start();
    await settle();

    expect(
      api.syncSessions
    ).toHaveBeenCalledWith(
      [session],
      'athlete-a'
    );

    native.permissionStatus.mockClear();
    native.readGarminRunningMetrics.mockClear();
    api.syncSessions.mockClear();

    user.set({
      id: 'athlete-b'
    });

    await settle();

    expect(
      connection.enabled
    ).toHaveBeenCalled();

    expect(
      native.permissionStatus
    ).not.toHaveBeenCalled();

    expect(
      native.readGarminRunningMetrics
    ).not.toHaveBeenCalled();

    expect(
      api.syncSessions
    ).not.toHaveBeenCalled();

    connection.enabled.mockResolvedValue(
      true
    );

    connection.revision.set(
      connection.revision() + 1
    );

    await settle();

    expect(
      native.readGarminRunningMetrics
    ).toHaveBeenCalledTimes(1);

    expect(
      api.syncSessions
    ).toHaveBeenCalledWith(
      [session],
      'athlete-b'
    );
  });


  it('never uses native APIs on web', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    service.start(); await service.sync(); await settle();
    expect(lifecycle.addListener).not.toHaveBeenCalled();
    expect(native.permissionStatus).not.toHaveBeenCalled();
    expect(native.readGarminRunningMetrics).not.toHaveBeenCalled();
  });

  it('removes a listener whose registration finishes after stop', async () => {
    const registration = deferred<any>();
    lifecycle.addListener.mockReturnValue(registration.promise);
    service.start(); service.stop();
    registration.resolve({ remove }); await settle();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(native.readGarminRunningMetrics).not.toHaveBeenCalled();
  });
});
