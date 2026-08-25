import {
  Component,
  inject,
  OnInit,
  signal
} from '@angular/core';

import {
  Router
} from '@angular/router';

import {
  AuthService,
  AptusMe
} from '../../core/auth.service';

import {
  AppLanguage,
  LanguageService
} from '../../core/language.service';


@Component({
  selector: 'app-access-pending',
  standalone: true,
  imports: [],
  templateUrl: './access-pending.html',
  styleUrl: './access-pending.scss'
})
export class AccessPending
  implements OnInit {

  private readonly languageService =
    inject(LanguageService);

  readonly language =
    this.languageService.language;

  me =
    signal<AptusMe | null>(null);

  checking =
    signal(false);

  error =
    signal<string | null>(null);

  statusMessage =
    signal<string | null>(null);


  constructor(
    public auth: AuthService,
    private router: Router
  ) {}


  async ngOnInit():
    Promise<void> {
    await this.checkStatus(false);
  }


  setLanguage(
    language: AppLanguage
  ): void {
    this.languageService.setLanguage(
      language
    );

    this.statusMessage.set(null);
  }


  async checkStatus(
    showFeedback = true
  ): Promise<void> {
    if (this.checking()) {
      return;
    }

    this.checking.set(true);
    this.error.set(null);

    if (showFeedback) {
      this.statusMessage.set(null);
    }

    try {
      const me =
        await this.auth.resolveAccess();

      this.me.set(me);

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
        showFeedback &&
        me.access_status === 'pending'
      ) {
        this.statusMessage.set(
          this.language() === 'es'
            ? 'Tu acceso sigue pendiente de validación. Estamos revisando tu solicitud. Te enviaremos un email en cuanto tu cuenta sea aprobada.'
            : 'Your access is still pending approval. We are reviewing your request. We will email you as soon as your account is approved.'
        );
      }

      if (
        showFeedback &&
        me.access_status === 'suspended'
      ) {
        this.statusMessage.set(
          this.language() === 'es'
            ? 'Tu cuenta continúa suspendida. Si crees que se trata de un error, contacta con el administrador de Aptus.'
            : 'Your account remains suspended. If you think this is a mistake, contact the Aptus administrator.'
        );
      }

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        (
          this.language() === 'es'
            ? 'No se pudo comprobar el estado de tu cuenta.'
            : 'Your account status could not be checked.'
        )
      );

    } finally {
      this.checking.set(false);
    }
  }


  async signOut():
    Promise<void> {
    await this.auth.signOut();

    await this.router.navigateByUrl(
      '/login'
    );
  }
}