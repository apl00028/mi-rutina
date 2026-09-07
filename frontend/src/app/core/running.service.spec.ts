import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { RunningService } from './running.service';
import { HealthConnectRunningMetricSession } from './health-connect.plugin';
import { environment } from '../../environments/environment';

describe('RunningService', () => {
  let service: RunningService;
  let http: HttpTestingController;
  const getAccessToken = vi.fn();
  const user = signal<{ id: string } | null>({ id: 'athlete-a' });
  const session: HealthConnectRunningMetricSession = {
    recordId: 'hc-record', sourcePackage: 'real.writer', exerciseType: 33,
    startTime: '2026-08-30T08:00:00Z', endTime: '2026-08-30T08:25:00Z',
    durationSeconds: 1500, lapCount: 0, segmentCount: 2, hasRoute: false,
    distanceMeters: 0, heartRateSampleCount: 0, speedSampleCount: 0,
    distanceError: 'native diagnostic',
  };

  beforeEach(() => {
    user.set({ id: 'athlete-a' });
    getAccessToken.mockReset().mockResolvedValue('user-token');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { getAccessToken, user } }] });
    service = TestBed.inject(RunningService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads persisted sessions using the authenticated bearer', async () => {
    const response = service.listSessions();
    await Promise.resolve();
    await Promise.resolve();
    const request = http.expectOne(`${environment.apiUrl}/running/sessions`);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer user-token');
    request.flush([]);
    expect(await response).toEqual([]);
  });

  it('sends the exact native contract and returns individual results unchanged', async () => {
    const response = service.syncSessions([session]);
    await Promise.resolve();
    await Promise.resolve();
    const request = http.expectOne(`${environment.apiUrl}/running/sync-health-connect`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer user-token');
    expect(request.request.body).toEqual({ sessions: [session] });
    const result = { synced: 0, results: [{ index: 0, recordId: session.recordId,
      sourcePackage: session.sourcePackage, error: { status_code: 502, detail: 'Unavailable' } }] };
    request.flush(result);
    expect(await response).toEqual(result);
  });

  it('rejects a changed account after waiting for the token without sending native data', async () => {
    let resolveToken!: (token: string) => void;
    getAccessToken.mockReturnValue(new Promise(resolve => { resolveToken = resolve; }));
    const response = service.syncSessions([session], 'athlete-a');
    user.set({ id: 'athlete-b' });
    resolveToken('token-b');
    await expect(response).rejects.toThrow('usuario ha cambiado');
    http.expectNone(() => true);
  });

  it('does not issue requests without a user token or for invalid batch sizes', async () => {
    getAccessToken.mockResolvedValue(null);
    await expect(service.listSessions()).rejects.toThrow('iniciar sesión');
    await expect(service.syncSessions([session])).rejects.toThrow('iniciar sesión');
    await expect(service.syncSessions([])).rejects.toThrow('25');
    await expect(service.syncSessions(Array(26).fill(session))).rejects.toThrow('25');
    http.expectNone(() => true);
  });
});
