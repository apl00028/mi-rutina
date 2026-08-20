import {
  Component,
  inject,
  signal
} from '@angular/core';

import {
  Router
} from '@angular/router';

import {
  AuthService
} from '../../core/auth.service';

import {
  AppLanguage,
  LanguageService
} from '../../core/language.service';


@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  private readonly languageService =
    inject(LanguageService);

  readonly language =
    this.languageService.language;

  email = signal('');

  loading = signal(false);
  googleLoading = signal(false);

  message =
    signal<string | null>(null);

  error =
    signal<string | null>(null);


  constructor(
    public auth: AuthService,
    private router: Router
  ) {
    this.handleLoginState();
  }


  private async handleLoginState():
    Promise<void> {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const oauthReturn =
      params.get('oauth') === 'google';

    const session =
      await this.auth.waitForSession();

    if (!session) {
      if (oauthReturn) {
        this.error.set(
          this.language() === 'es'
            ? 'No se pudo completar el acceso.'
            : 'Sign-in could not be completed.'
        );

        window.history.replaceState(
          {},
          document.title,
          '/login'
        );
      }

      return;
    }

    try {
      const me =
        await this.auth.resolveAccess();

        if (
          me.access_status === 'active'
        ) {
          await this.router.navigateByUrl(
            me.onboarding_completed
              ? '/'
              : '/onboarding'
          );

          return;
        }

      if (
        me.access_status === 'pending' ||
        me.access_status === 'suspended'
      ) {
        await this.router.navigateByUrl(
          '/access-pending'
        );

        return;
      }

      this.error.set(
        this.language() === 'es'
          ? 'No se pudo determinar el estado de tu acceso.'
          : 'Your access status could not be determined.'
      );

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        (
          this.language() === 'es'
            ? 'No se pudo comprobar tu acceso a GymOS.'
            : 'Your GymOS access could not be verified.'
        )
      );

    } finally {
      if (oauthReturn) {
        window.history.replaceState(
          {},
          document.title,
          '/login'
        );
      }
    }
  }


  async sendMagicLink(
    event: Event
  ): Promise<void> {
    event.preventDefault();

    const email =
      this.email().trim();

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
        this.language() === 'es'
          ? 'Te hemos enviado un enlace de acceso. Revisa tu correo.'
          : 'We sent you a sign-in link. Check your email.'
      );

    } catch (err: any) {
      this.error.set(
        err?.message ??
        (
          this.language() === 'es'
            ? 'No se pudo enviar el enlace de acceso.'
            : 'The sign-in link could not be sent.'
        )
      );

    } finally {
      this.loading.set(false);
    }
  }


  async signInWithGoogle():
    Promise<void> {
    this.googleLoading.set(true);
    this.message.set(null);
    this.error.set(null);

    try {
      await this.auth.signInWithGoogle();

    } catch (err: any) {
      this.error.set(
        err?.message ??
        (
          this.language() === 'es'
            ? 'No se pudo iniciar sesión con Google.'
            : 'Google sign-in could not be started.'
        )
      );

      this.googleLoading.set(false);
    }
  }


  setLanguage(
    language: AppLanguage
  ): void {
    this.languageService.setLanguage(
      language
    );
  }
}