import {
  Component,
  effect,
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

  readonly resetLoading =
    signal(false);

  readonly recoveryMode =
    signal(false);

  readonly recoveryPassword =
    signal('');

  readonly recoveryConfirmPassword =
    signal('');

  readonly recoveryLoading =
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

    effect(() => {
      const completed =
        this.auth.nativeLoginCompleted();

      if (completed === 0) {
        return;
      }

      void this.handleLoginState();
    });

    void this.handleLoginState();
  }


  private async handleLoginState():
    Promise<void> {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const oauthReturn =
      params.get('oauth') ===
      'google';

    const recoveryReturn =
      params.get('recovery') ===
      '1';

    if (recoveryReturn) {
      this.recoveryMode.set(
        true
      );
    }

    const nativeError =
      this.auth.consumeNativeAuthError();

    if (nativeError) {
      this.error.set(
        nativeError
      );
    }

    const session =
      await this.auth.waitForSession();

    if (!session) {
      if (
        !this.error() &&
        (
          oauthReturn ||
          recoveryReturn
        )
      ) {
        this.error.set(
          this.language() === 'es'
            ? (
                recoveryReturn
                  ? 'El enlace de recuperación no es válido o ha caducado.'
                  : 'No se pudo completar el acceso.'
              )
            : (
                recoveryReturn
                  ? 'The recovery link is invalid or has expired.'
                  : 'Sign-in could not be completed.'
              )
        );
      }

      if (recoveryReturn) {
        this.recoveryMode.set(
          false
        );
      }

      if (
        oauthReturn ||
        recoveryReturn
      ) {
        window.history.replaceState(
          {},
          document.title,
          '/login'
        );
      }

      return;
    }

    if (recoveryReturn) {
      window.history.replaceState(
        {},
        document.title,
        '/login'
      );

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


  async sendPasswordReset(
    event: Event
  ): Promise<void> {
    event.preventDefault();

    if (this.resetLoading()) {
      return;
    }

    const email =
      this.email().trim();

    this.message.set(null);
    this.error.set(null);

    if (!email) {
      this.error.set(
        this.language() === 'es'
          ? 'Introduce tu email para recuperar la contraseña.'
          : 'Enter your email to reset your password.'
      );

      return;
    }

    this.resetLoading.set(
      true
    );

    try {
      await this.auth.requestPasswordReset(
        email
      );

      this.message.set(
        this.language() === 'es'
          ? 'Si existe una cuenta con ese email, recibirás un enlace para cambiar la contraseña.'
          : 'If an account exists for that email, you will receive a password reset link.'
      );
    } catch (err: unknown) {
      this.error.set(
        this.authErrorMessage(
          err,
          this.language() === 'es'
            ? 'No se pudo solicitar la recuperación de contraseña.'
            : 'Password recovery could not be requested.'
        )
      );
    } finally {
      this.resetLoading.set(
        false
      );
    }
  }


  async completePasswordRecovery(
    event: Event
  ): Promise<void> {
    event.preventDefault();

    if (this.recoveryLoading()) {
      return;
    }

    const password =
      this.recoveryPassword();

    const confirmation =
      this.recoveryConfirmPassword();

    this.message.set(null);
    this.error.set(null);

    if (password.length < 8) {
      this.error.set(
        this.language() === 'es'
          ? 'La contraseña debe tener al menos 8 caracteres.'
          : 'The password must contain at least 8 characters.'
      );

      return;
    }

    if (
      password !==
      confirmation
    ) {
      this.error.set(
        this.language() === 'es'
          ? 'Las contraseñas no coinciden.'
          : 'The passwords do not match.'
      );

      return;
    }

    this.recoveryLoading.set(
      true
    );

    try {
      await this.auth.updatePassword(
        password
      );

      await this.auth.signOut();

      this.recoveryPassword.set('');
      this.recoveryConfirmPassword.set('');
      this.recoveryMode.set(false);

      this.message.set(
        this.language() === 'es'
          ? 'Contraseña actualizada. Ya puedes iniciar sesión.'
          : 'Password updated. You can now sign in.'
      );

      window.history.replaceState(
        {},
        document.title,
        '/login'
      );
    } catch (err: unknown) {
      this.error.set(
        this.authErrorMessage(
          err,
          this.language() === 'es'
            ? 'No se pudo cambiar la contraseña.'
            : 'The password could not be changed.'
        )
      );
    } finally {
      this.recoveryLoading.set(
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