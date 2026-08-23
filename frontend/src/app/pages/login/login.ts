import {
  Component,
  inject,
  signal
} from '@angular/core';

import {
  Router
} from '@angular/router';

import {
  AuthService,
  GymOSMe
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

  email =
    signal('');

  password =
    signal('');

  passwordLoading =
    signal(false);

  loading =
    signal(false);

  googleLoading =
    signal(false);

  passkeyLoading =
    signal(false);

  readonly passkeySupported =
    signal(false);

  message =
    signal<string | null>(null);

  error =
    signal<string | null>(null);


  constructor(
    public auth: AuthService,
    private router: Router
  ) {
    this.passkeySupported.set(
      this.auth.isPasskeySupported()
    );

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

      await this.navigateAfterLogin(
        me
      );

    } catch (err: unknown) {
      this.error.set(
        this.authErrorMessage(
          err,
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


  private async navigateAfterLogin(
    me: GymOSMe
  ): Promise<void> {
    if (
      me.access_status ===
      'active'
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

    throw new Error(
      this.language() === 'es'
        ? 'No se pudo determinar el estado de tu acceso.'
        : 'Your access status could not be determined.'
    );
  }


  async signInWithPasskey():
    Promise<void> {
    if (
      this.passkeyLoading()
    ) {
      return;
    }

    this.passkeyLoading.set(
      true
    );

    this.message.set(null);
    this.error.set(null);

    try {
      await this.auth.signInWithPasskey();

      const me =
        await this.auth.resolveAccess();

      await this.navigateAfterLogin(
        me
      );

    } catch (err: unknown) {
      this.error.set(
        this.passkeyErrorMessage(
          err
        )
      );

    } finally {
      this.passkeyLoading.set(
        false
      );
    }
  }


  async signInWithPassword(
    event: Event
  ): Promise<void> {
    event.preventDefault();

    const email =
      this.email().trim();

    const password =
      this.password();

    if (!email || !password) {
      return;
    }

    this.passwordLoading.set(true);
    this.message.set(null);
    this.error.set(null);

    try {
      await this.auth.signInWithPassword(
        email,
        password
      );

      const me =
        await this.auth.resolveAccess();

      await this.navigateAfterLogin(
        me
      );
    } catch (err: unknown) {
      this.error.set(
        this.authErrorMessage(
          err,
          this.language() === 'es'
            ? 'Email o contraseña incorrectos.'
            : 'Incorrect email or password.'
        )
      );
    } finally {
      this.passwordLoading.set(false);
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

    } catch (err: unknown) {
      this.error.set(
        this.authErrorMessage(
          err,
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

    } catch (err: unknown) {
      this.error.set(
        this.authErrorMessage(
          err,
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


  requestAccess():
    void {
    this.message.set(
      this.language() === 'es'
        ? 'El acceso a GymOS está actualmente disponible mediante invitación.'
        : 'GymOS access is currently invitation-only.'
    );

    this.error.set(null);
  }


  private passkeyErrorMessage(
    error: unknown
  ): string {
    const candidate =
      error as {
        name?: string;
        code?: string;
        message?: string;
      };

    if (
      candidate.name ===
      'NotAllowedError'
    ) {
      return (
        this.language() === 'es'
          ? 'El acceso se canceló o no fue autorizado por el dispositivo.'
          : 'Device sign-in was cancelled or not authorized.'
      );
    }

    switch (
      candidate.code
    ) {
      case 'webauthn_credential_not_found':
        return (
          this.language() === 'es'
            ? 'No se encontró una passkey de GymOS en este dispositivo.'
            : 'No GymOS passkey was found on this device.'
        );

      case 'webauthn_challenge_expired':
        return (
          this.language() === 'es'
            ? 'La solicitud ha caducado. Inténtalo de nuevo.'
            : 'The request expired. Please try again.'
        );

      case 'webauthn_verification_failed':
        return (
          this.language() === 'es'
            ? 'No se pudo verificar el acceso con este dispositivo.'
            : 'Device sign-in could not be verified.'
        );

      case 'passkey_disabled':
        return (
          this.language() === 'es'
            ? 'El acceso con dispositivo no está disponible temporalmente.'
            : 'Device sign-in is temporarily unavailable.'
        );

      default:
        return this.authErrorMessage(
          error,
          this.language() === 'es'
            ? 'No se pudo iniciar sesión con el dispositivo.'
            : 'Device sign-in could not be completed.'
        );
    }
  }


  private authErrorMessage(
    error: unknown,
    fallback: string
  ): string {
    const candidate =
      error as {
        error?: {
          detail?: string;
        };
        message?: string;
      };

    return (
      candidate?.error?.detail ??
      candidate?.message ??
      fallback
    );
  }
}