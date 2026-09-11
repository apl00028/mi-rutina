import {
  Injectable,
  signal
} from '@angular/core';

import {
  AuthService
} from './auth.service';

import {
  environment
} from '../../environments/environment';


export interface HealthConnectAccountState {
  provider: 'health_connect';
  enabled: boolean;
  connected_at?: string | null;
}


@Injectable({
  providedIn: 'root'
})
export class HealthConnectAccountService {

  readonly revision = signal(0);

  private cachedUserId:
    string | null = null;

  private cachedEnabled:
    boolean | null = null;


  constructor(
    private auth: AuthService
  ) {}


  private async request(
    method: 'GET' | 'PUT' | 'DELETE'
  ): Promise<HealthConnectAccountState | null> {

    const token =
      await this.auth.getAccessToken();

    const userId =
      this.auth.user()?.id;

    if (!token || !userId) {
      return null;
    }

    const response =
      await fetch(
        `${environment.apiUrl}/integrations/health-connect`,
        {
          method,
          headers: {
            Authorization:
              `Bearer ${token}`,
            'Content-Type':
              'application/json'
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        `Health Connect account state failed: ${response.status}`
      );
    }

    if (method === 'DELETE') {
      return null;
    }

    return (
          await response.json()
        ) as HealthConnectAccountState;
  }


  async enabled(
    force = false
  ): Promise<boolean> {

    const userId =
      this.auth.user()?.id;

    if (!userId) {
      this.cachedUserId = null;
      this.cachedEnabled = false;
      return false;
    }

    if (
      !force
      && this.cachedUserId === userId
      && this.cachedEnabled !== null
    ) {
      return this.cachedEnabled;
    }

    const state =
      await this.request('GET');

    if (
      this.auth.user()?.id !== userId
    ) {
      return false;
    }

    this.cachedUserId = userId;
    this.cachedEnabled =
      state?.enabled === true;

    return this.cachedEnabled;
  }


  async connect(): Promise<void> {
    const userId =
      this.auth.user()?.id;

    if (!userId) {
      throw new Error(
        'Necesitas iniciar sesión.'
      );
    }

    const state =
      await this.request('PUT');

    if (
      this.auth.user()?.id !== userId
    ) {
      return;
    }

    this.cachedUserId = userId;
    this.cachedEnabled =
      state?.enabled === true;

    this.revision.update(
      value => value + 1
    );
  }


  async disconnect(): Promise<void> {
    const userId =
      this.auth.user()?.id;

    if (!userId) {
      return;
    }

    await this.request('DELETE');

    if (
      this.auth.user()?.id !== userId
    ) {
      return;
    }

    this.cachedUserId = userId;
    this.cachedEnabled = false;

    this.revision.update(
      value => value + 1
    );
  }
}
