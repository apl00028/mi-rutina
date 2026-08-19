import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  email = signal('');

  loading = signal(false);
  googleLoading = signal(false);

  message = signal<string | null>(null);
  error = signal<string | null>(null);

  constructor(
    public auth: AuthService,
    private router: Router
  ) {
    this.handleLoginState();
  }

  private async handleLoginState(): Promise<void> {
    const params = new URLSearchParams(
      window.location.search
    );

    const oauthReturn =
      params.get('oauth') === 'google';

    const session =
      await this.auth.waitForSession();

    if (session) {
      await this.router.navigateByUrl('/');
      return;
    }

    if (oauthReturn) {
      this.error.set(
        'No tienes acceso a GymOS. Esta cuenta no está autorizada.'
      );

      window.history.replaceState(
        {},
        document.title,
        '/login'
      );
    }
  }

  async sendMagicLink(
    event: Event
  ): Promise<void> {
    event.preventDefault();

    const email = this.email().trim();

    if (!email) {
      return;
    }

    this.loading.set(true);
    this.message.set(null);
    this.error.set(null);

    try {
      await this.auth.signInWithMagicLink(
        email
      );

      this.message.set(
        'Te hemos enviado un enlace de acceso. Revisa tu correo.'
      );
    } catch (err: any) {
      this.error.set(
        err?.message ??
        'No se pudo enviar el enlace de acceso.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async signInWithGoogle(): Promise<void> {
    this.googleLoading.set(true);
    this.message.set(null);
    this.error.set(null);

    try {
      await this.auth.signInWithGoogle();
    } catch (err: any) {
      this.error.set(
        err?.message ??
        'No se pudo iniciar sesión con Google.'
      );

      this.googleLoading.set(false);
    }
  }

  requestAccess(): void {
    this.message.set(
      'El acceso a GymOS está actualmente disponible mediante invitación.'
    );

    this.error.set(null);
  }
}