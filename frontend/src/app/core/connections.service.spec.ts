import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ConnectionsService, connectionError } from './connections.service';

describe('ConnectionsService', () => {
  let service: ConnectionsService;
  let http: HttpTestingController;
  const getAccessToken = vi.fn();
  beforeEach(() => {
    getAccessToken.mockResolvedValue('user-token');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { getAccessToken } }] });
    service = TestBed.inject(ConnectionsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it.each([
    ['code', '/connections/contact-code', null, { code: 'APT-ABCD-EFGH-JKLM-NPQR' }],
    ['trainer', '/trainer/invitations', { contact_code: 'contact' }, { id: 'id' }],
    ['athlete', '/athlete/invitations', { contact_code: 'contact' }, { id: 'id' }],
    ['accept', '/connections/invitations/id/accept', null, null],
    ['reject', '/connections/invitations/id/reject', null, null],
    ['revoke', '/connections/invitations/id/revoke', null, null],
  ] as const)('%s uses the exact authenticated contract', async (operation, path, body, response) => {
    const result = operation === 'code' ? service.generateContactCode()
      : operation === 'trainer' ? service.inviteAthlete('contact')
      : operation === 'athlete' ? service.inviteTrainer('contact') : service.act('id', operation);
    await Promise.resolve();
    await Promise.resolve();
    const req = http.expectOne(environment.apiUrl + path);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer user-token');
    expect(req.request.body).toEqual(body);
    req.flush(response);
    await result;
    expect(getAccessToken).toHaveBeenCalled();
  });
  it.each(['received', 'sent'] as const)('lists %s', async box => {
    const result = service.list(box);
    await Promise.resolve();
    await Promise.resolve();
    const req = http.expectOne(`${environment.apiUrl}/connections/invitations?box=${box}`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer user-token');
    req.flush([]);
    expect(await result).toEqual([]);
  });
  it('does not request without a bearer', async () => {
    getAccessToken.mockResolvedValue(null);
    await expect(service.generateContactCode()).rejects.toThrow('No hay una sesión válida.');
    http.expectNone(() => true);
  });
  it('only displays public backend messages', () => {
    const detail = 'El código de contacto no es válido o no está disponible.';
    expect(connectionError(new HttpErrorResponse({ status: 400, error: { detail } }))).toBe(detail);
    expect(connectionError(new HttpErrorResponse({ status: 500, error: { detail: 'token_hash=secret' } }))).not.toContain('secret');
    expect(connectionError(new HttpErrorResponse({ status: 403 }))).toContain('autorización');
  });
});
