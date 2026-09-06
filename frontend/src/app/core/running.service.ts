import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { HealthConnectRunningMetricSession } from './health-connect.plugin';
import { environment } from '../../environments/environment';

export interface PersistedRunningSession {
  id: string;
  source: 'health_connect';
  source_package: string;
  source_record_id: string;
  started_at: string;
  ended_at: string;
  data: {
    schema_version: 1;
    exercise_type: 33 | 34;
    distance_meters?: number | null;
    heart_rate_average_bpm?: number | null;
    heart_rate_max_bpm?: number | null;
    heart_rate_sample_count?: number | null;
    speed_average_meters_per_second?: number | null;
    speed_max_meters_per_second?: number | null;
    speed_sample_count?: number | null;
    lap_count?: number | null;
    segment_count?: number | null;
    has_route?: boolean | null;
  };
}

export interface RunningSyncResult {
  synced: number;
  results: Array<{
    index: number;
    recordId: string;
    sourcePackage: string;
    session?: PersistedRunningSession | null;
    error?: { status_code: 502 | 503; detail: string } | null;
  }>;
}

@Injectable({ providedIn: 'root' })
export class RunningService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  private async headers(): Promise<HttpHeaders> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Necesitas iniciar sesión.');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  async listSessions(): Promise<PersistedRunningSession[]> {
    return firstValueFrom(this.http.get<PersistedRunningSession[]>(
      `${environment.apiUrl}/running/sessions`, { headers: await this.headers() },
    ));
  }

  async syncSessions(sessions: HealthConnectRunningMetricSession[]): Promise<RunningSyncResult> {
    if (sessions.length < 1 || sessions.length > 25) {
      throw new Error('La sincronización admite entre 1 y 25 sesiones por lote.');
    }
    return firstValueFrom(this.http.post<RunningSyncResult>(
      `${environment.apiUrl}/running/sync-health-connect`, { sessions },
      { headers: await this.headers() },
    ));
  }
}
