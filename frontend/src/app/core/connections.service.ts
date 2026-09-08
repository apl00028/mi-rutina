import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ConnectionInvitation, InvitationAction, InvitationBox, TrainerAthleteConnection, ConnectionDomain } from './connections.models';

@Injectable({ providedIn: 'root' })
export class ConnectionsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = environment.apiUrl;

  private async headers(): Promise<HttpHeaders> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('No hay una sesión válida.');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  async generateContactCode(): Promise<{ code: string }> {
    return firstValueFrom(this.http.post<{ code: string }>(
      `${this.url}/connections/contact-code`, null, { headers: await this.headers() },
    ));
  }

  async inviteAthlete(contactCode: string): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>(
      `${this.url}/trainer/invitations`, { contact_code: contactCode }, { headers: await this.headers() },
    ));
  }

  async inviteTrainer(contactCode: string): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>(
      `${this.url}/athlete/invitations`, { contact_code: contactCode }, { headers: await this.headers() },
    ));
  }

  async list(box: InvitationBox): Promise<ConnectionInvitation[]> {
    return firstValueFrom(this.http.get<ConnectionInvitation[]>(
      `${this.url}/connections/invitations`, { headers: await this.headers(), params: { box } },
    ));
  }

  async relationships(): Promise<TrainerAthleteConnection[]> {
    return firstValueFrom(this.http.get<TrainerAthleteConnection[]>(
      `${this.url}/connections/relationships`, { headers: await this.headers() },
    ));
  }

  async setPermissions(trainerId: string, domains: ConnectionDomain[], expectedUpdatedAt: string): Promise<{ updated_at: string }> {
    return firstValueFrom(this.http.put<{ updated_at: string }>(
      `${this.url}/connections/trainers/${encodeURIComponent(trainerId)}/permissions`,
      { domains, expected_updated_at: expectedUpdatedAt }, { headers: await this.headers() },
    ));
  }

  async unlink(otherUserId: string, expectedUpdatedAt: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(
      `${this.url}/connections/relationships/${encodeURIComponent(otherUserId)}/unlink`,
      { expected_updated_at: expectedUpdatedAt }, { headers: await this.headers() },
    ));
  }

  async act(id: string, action: InvitationAction): Promise<void> {
    return firstValueFrom(this.http.post<void>(
      `${this.url}/connections/invitations/${encodeURIComponent(id)}/${action}`, null,
      { headers: await this.headers() },
    ));
  }
}

// Only public messages verified in the connections backend may reach the UI.
const publicMessages = new Set([
  'Conexión no disponible.',
  'La conexión ha cambiado. Actualiza antes de guardar.',
  'Los permisos no son válidos.',
  'El código de contacto no es válido o no está disponible.',
  'Ya existe una invitación o relación para este contacto.',
  'La relación ya está activa.',
  'La invitación ya no está pendiente.',
  'La invitación ha caducado.',
  'Operación no autorizada.',
  'Invitación no disponible.',
  'No se pudo renovar el código de contacto. Inténtalo de nuevo.',
  'Servicio de conexiones no disponible.',
  'No se pudo completar la operación de conexiones.',
]);

export function connectionError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    if (typeof detail === 'string' && publicMessages.has(detail)) return detail;
    if (error.status === 401 || error.status === 403) return 'No tienes autorización. Comprueba tu sesión.';
  }
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}
