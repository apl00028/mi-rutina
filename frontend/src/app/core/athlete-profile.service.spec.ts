/** @vitest-environment jsdom */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { AthleteProfileService } from './athlete-profile.service';

describe('AthleteProfileService', () => {
  let service: AthleteProfileService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/athlete-profile`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { getAccessToken: async () => 'token' } }
    ] });
    service = TestBed.inject(AthleteProfileService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

  it('reads and maps the persisted profile', async () => {
    const result = service.get(); await tick();
    const request = http.expectOne(url);
    expect(request.request.headers.get('Authorization')).toBe('Bearer token');
    request.flush({ user_id: 'user-1', experience_level: 'intermediate', weekly_availability: 4,
      session_duration_min: 60, injuries: ['rodilla'], pain_areas: [] });
    expect(await result).toMatchObject({ userId: 'user-1', weeklyAvailability: 4, sessionDurationMin: 60 });
  });

  it('accepts an absent profile', async () => {
    const result = service.get(); await tick(); http.expectOne(url).flush(null);
    await expect(result).resolves.toBeNull();
  });

  it('updates only the athlete fields and maps the response', async () => {
    const result = service.update({ weeklyAvailability: 3, sessionDurationMin: 45, injuries: [], painAreas: ['hombro'] });
    await tick(); const request = http.expectOne(url);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ weekly_availability: 3, session_duration_min: 45, injuries: [], pain_areas: ['hombro'] });
    expect(JSON.stringify(request.request.body)).not.toContain('routine');
    request.flush({ user_id: 'user-1', experience_level: null, weekly_availability: 3,
      session_duration_min: 45, injuries: [], pain_areas: ['hombro'] });
    expect((await result).weeklyAvailability).toBe(3);
  });
});
