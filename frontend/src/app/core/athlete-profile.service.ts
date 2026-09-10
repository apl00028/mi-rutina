import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export type AthleteExperienceLevel =
  | 'beginner'
  | 'returning'
  | 'intermediate'
  | 'advanced';

export interface AthleteProfile {
  userId: string;
  experienceLevel: AthleteExperienceLevel | null;
  weeklyAvailability: number | null;
  sessionDurationMin: number | null;
  injuries: string[];
  painAreas: string[];
}

export interface AthleteProfileUpdate {
  experienceLevel?: AthleteExperienceLevel | null;
  weeklyAvailability?: number | null;
  sessionDurationMin?: number | null;
  injuries?: string[];
  painAreas?: string[];
}

function parseProfile(value: unknown): AthleteProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Respuesta de perfil no válida.');
  }
  const row = value as Record<string, unknown>;
  const experience = row['experience_level'];
  const availability = row['weekly_availability'];
  const duration = row['session_duration_min'];
  const injuries = row['injuries'];
  const painAreas = row['pain_areas'];
  if (typeof row['user_id'] !== 'string' ||
    ![null, 'beginner', 'returning', 'intermediate', 'advanced'].includes(experience as any) ||
    !(availability === null || typeof availability === 'number') ||
    !(duration === null || typeof duration === 'number') ||
    !Array.isArray(injuries) || !injuries.every(item => typeof item === 'string') ||
    !Array.isArray(painAreas) || !painAreas.every(item => typeof item === 'string')) {
    throw new Error('Respuesta de perfil no válida.');
  }
  return {
    userId: row['user_id'],
    experienceLevel: experience as AthleteExperienceLevel | null,
    weeklyAvailability: availability as number | null,
    sessionDurationMin: duration as number | null,
    injuries,
    painAreas
  };
}

@Injectable({ providedIn: 'root' })
export class AthleteProfileService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = `${environment.apiUrl}/athlete-profile`;

  private async headers(): Promise<HttpHeaders> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('No hay una sesión válida.');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  async get(): Promise<AthleteProfile | null> {
    const response = await firstValueFrom(this.http.get<unknown>(
      this.url, { headers: await this.headers() }
    ));
    return response === null ? null : parseProfile(response);
  }

  async update(input: AthleteProfileUpdate): Promise<AthleteProfile> {
    const payload: Record<string, unknown> = {};
    if (input.experienceLevel !== undefined) payload['experience_level'] = input.experienceLevel;
    if (input.weeklyAvailability !== undefined) payload['weekly_availability'] = input.weeklyAvailability;
    if (input.sessionDurationMin !== undefined) payload['session_duration_min'] = input.sessionDurationMin;
    if (input.injuries !== undefined) payload['injuries'] = input.injuries;
    if (input.painAreas !== undefined) payload['pain_areas'] = input.painAreas;
    return parseProfile(await firstValueFrom(this.http.patch<unknown>(
      this.url, payload, { headers: await this.headers() }
    )));
  }
}
