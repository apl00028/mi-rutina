import {
  Component,
  OnInit,
  signal
} from '@angular/core';

import {
  HttpClient,
  HttpHeaders
} from '@angular/common/http';

import {
  Router
} from '@angular/router';

import {
  AuthService
} from '../../core/auth.service';

import {
  environment
} from '../../../environments/environment';


interface AccessRequest {
  user_id: string;
  email: string | null;
  status: string;
  plan: string;
  role: string;
  created_at: string;
  updated_at: string;
}


@Component({
  selector: 'app-admin-access',
  standalone: true,
  imports: [],
  templateUrl: './admin-access.html',
  styleUrl: './admin-access.scss'
})
export class AdminAccess
  implements OnInit {

  requests =
    signal<AccessRequest[]>([]);

  loading =
    signal(true);

  error =
    signal<string | null>(null);

  processingUserId =
    signal<string | null>(null);

  feedback =
    signal<string | null>(null);


  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router
  ) {}


  async ngOnInit():
    Promise<void> {
    await this.loadRequests();
  }


  private async headers():
    Promise<HttpHeaders> {

    const token =
      await this.auth.getAccessToken();

    if (!token) {
      throw new Error(
        'No hay una sesión válida.'
      );
    }

    return new HttpHeaders({
      Authorization:
        `Bearer ${token}`
    });
  }


  async loadRequests():
    Promise<void> {

    this.loading.set(true);
    this.error.set(null);

    try {
      const headers =
        await this.headers();

      const requests =
        await this.http.get<
          AccessRequest[]
        >(
          `${environment.apiUrl}/admin/access-requests`,
          {
            headers
          }
        ).toPromise();

      this.requests.set(
        requests ?? []
      );

    } catch (err: any) {

      if (err?.status === 403) {
        await this.router.navigateByUrl(
          '/'
        );

        return;
      }

      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudieron cargar las solicitudes.'
      );

    } finally {
      this.loading.set(false);
    }
  }


  async approve(
    request: AccessRequest
  ): Promise<void> {

    await this.updateRequest(
      request,
      'active'
    );
  }


  async reject(
    request: AccessRequest
  ): Promise<void> {

    await this.updateRequest(
      request,
      'rejected'
    );
  }


  private async updateRequest(
    request: AccessRequest,
    newStatus:
      'active' | 'rejected'
  ): Promise<void> {

    if (this.processingUserId()) {
      return;
    }

    this.processingUserId.set(
      request.user_id
    );

    this.error.set(null);
    this.feedback.set(null);

    try {
      const headers =
        await this.headers();

      await this.http.patch(
        `${environment.apiUrl}/admin/access-requests/${request.user_id}`,
        {
          status: newStatus
        },
        {
          headers
        }
      ).toPromise();

      this.requests.update(
        current =>
          current.filter(
            item =>
              item.user_id !==
              request.user_id
          )
      );

      const email =
        request.email ??
        'El usuario';

      this.feedback.set(
        newStatus === 'active'
          ? `${email} tiene ahora acceso a GymOS.`
          : `La solicitud de ${email} ha sido rechazada.`
      );

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo actualizar la solicitud.'
      );

    } finally {
      this.processingUserId.set(
        null
      );
    }
  }


  formatDate(
    value: string
  ): string {

    if (!value) {
      return '';
    }

    return new Intl.DateTimeFormat(
      'es-ES',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }
    ).format(
      new Date(value)
    );
  }
}