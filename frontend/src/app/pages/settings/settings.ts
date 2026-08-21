import {
  Component,
  OnInit,
  signal
} from '@angular/core';

import {
  RouterLink
} from '@angular/router';

import {
  APP_INFO
} from '../../core/app-info';

import {
  SettingsService,
  TextSizePreference,
  ThemePreference,
  UnitPreference
} from '../../core/settings.service';

import {
  AuthService
} from '../../core/auth.service';


const settingsSections = [
  {
    icon: '◉',
    title: 'Cuenta',
    description:
      'Identidad, acceso, email y unidades.',
    route: '/ajustes/cuenta'
  },
  {
    icon: '◫',
    title: 'Entrenamiento',
    description:
      'Registro, RIR y descanso.',
    route: '/ajustes/entrenamiento'
  },
  {
    icon: '◐',
    title: 'Apariencia',
    description:
      'Tema, texto y movimiento.',
    route: '/ajustes/apariencia'
  },
  {
    icon: '⇅',
    title: 'Datos',
    description:
      'Sincronización y exportación.',
    route: '/ajustes/datos'
  },
  {
    icon: 'i',
    title: 'Acerca de',
    description:
      'Versión y entorno.',
    route: '/ajustes/acerca-de'
  }
] as const;


@Component({
  selector: 'app-settings-hub',
  standalone: true,
  imports: [
    RouterLink
  ],
  template: `
    <section class="settings-page">
      <header class="settings-header">
        <h1>Ajustes</h1>
      </header>

      <nav
        class="settings-list"
        aria-label="Secciones de ajustes"
      >
        @for (
          section of sections;
          track section.route
        ) {
          <a
            class="settings-row"
            [routerLink]="section.route"
          >
            <span
              class="settings-icon"
              aria-hidden="true"
            >
              {{ section.icon }}
            </span>

            <span class="settings-copy">
              <strong>
                {{ section.title }}
              </strong>

              <span>
                {{ section.description }}
              </span>
            </span>

            <span
              class="settings-chevron"
              aria-hidden="true"
            >
              ›
            </span>
          </a>
        }
      </nav>
    </section>
  `,
  styleUrl: './settings.scss'
})
export class SettingsHub {
  readonly sections =
    settingsSections;
}


@Component({
  selector: 'app-settings-account',
  standalone: true,
  imports: [
    RouterLink
  ],
  template: `
    <section class="settings-page">
      <a
        class="settings-back"
        routerLink="/ajustes"
        aria-label="Volver a Ajustes"
      >
        <span
          class="settings-back-icon"
          aria-hidden="true"
        >
          ‹
        </span>

        <span>Ajustes</span>
      </a>

      <header class="settings-header">
        <h1>Cuenta</h1>
      </header>

      <section class="settings-panel">
        <div class="settings-field">
          <span>Nombre visible</span>

          <strong>
            {{ userDisplayName() }}
          </strong>
        </div>

        <div class="settings-field">
          <span>Email</span>

          <strong>
            {{
              auth.user()?.email ??
              'No disponible'
            }}
          </strong>

          <small>
            Informativo. GymOS todavía no tiene un flujo
            para cambiar email desde la app.
          </small>
        </div>

        <div class="settings-field">
          <span>Acceso con dispositivo</span>

          <strong>
            Passkey
          </strong>

          <small>
            Permite entrar en GymOS usando la seguridad
            de tu dispositivo: huella, reconocimiento
            facial, PIN o llave de seguridad.
          </small>

          @if (!passkeySupported()) {
            <p
              class="settings-status settings-status-muted"
              role="status"
            >
              Este navegador o dispositivo no permite
              configurar passkeys desde esta página.
            </p>
          } @else {
            <button
              type="button"
              class="settings-action"
              [disabled]="
                registeringPasskey() ||
                loadingPasskeys()
              "
              (click)="registerPasskey()"
            >
              @if (registeringPasskey()) {
                Configurando…
              } @else {
                Configurar acceso rápido
              }
            </button>
          }

          @if (passkeyMessage()) {
            <p
              class="settings-status settings-status-success"
              role="status"
            >
              {{ passkeyMessage() }}
            </p>
          }

          @if (passkeyError()) {
            <p
              class="settings-status settings-status-error"
              role="alert"
            >
              {{ passkeyError() }}
            </p>
          }
        </div>

        <div class="settings-field">
          <span>Dispositivos configurados</span>

          @if (!passkeySupported()) {
            <small>
              No disponible en este navegador.
            </small>
          } @else if (loadingPasskeys()) {
            <small>
              Cargando accesos configurados…
            </small>
          } @else if (passkeys().length === 0) {
            <small>
              Todavía no has configurado ningún acceso
              rápido.
            </small>
          } @else {
            <div class="passkey-list">
              @for (
                passkey of passkeys();
                track passkey.id
              ) {
                <div class="passkey-item">
                  <div class="passkey-copy">
                    <strong>
                      {{
                        passkey.friendly_name ||
                        'Dispositivo'
                      }}
                    </strong>

                    <small>
                      Añadido
                      {{
                        formatPasskeyDate(
                          passkey.created_at
                        )
                      }}
                    </small>

                    @if (passkey.last_used_at) {
                      <small>
                        Último uso
                        {{
                          formatPasskeyDate(
                            passkey.last_used_at
                          )
                        }}
                      </small>
                    }
                  </div>

                  <button
                    type="button"
                    class="settings-danger-action"
                    [disabled]="
                      deletingPasskeyId() ===
                      passkey.id
                    "
                    (click)="
                      deletePasskey(
                        passkey.id,
                        passkey.friendly_name
                      )
                    "
                  >
                    @if (
                      deletingPasskeyId() ===
                      passkey.id
                    ) {
                      Eliminando…
                    } @else {
                      Eliminar
                    }
                  </button>
                </div>
              }
            </div>
          }
        </div>

        <div class="settings-field">
          <span>Unidades</span>

          <div
            class="segmented-control"
            role="radiogroup"
            aria-label="Unidades"
          >
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="
                units() === 'kg'
              "
              [class.active]="
                units() === 'kg'
              "
              (click)="setUnits('kg')"
            >
              kg
            </button>

            <button
              type="button"
              role="radio"
              [attr.aria-checked]="
                units() === 'lb'
              "
              [class.active]="
                units() === 'lb'
              "
              (click)="setUnits('lb')"
            >
              lb
            </button>
          </div>

          <small>
            Esta preferencia se guarda localmente. La app
            aún no convierte todos los registros a lb.
          </small>
        </div>
      </section>

      <p class="settings-note">
        El acceso con dispositivo no sustituye tus otros
        métodos de acceso. Podrás seguir entrando con
        Google o mediante enlace de correo.
      </p>
    </section>
  `,
  styleUrl: './settings.scss'
})
export class SettingsAccount
  implements OnInit {

  readonly passkeySupported =
    signal(false);

  readonly loadingPasskeys =
    signal(false);

  readonly registeringPasskey =
    signal(false);

  readonly deletingPasskeyId =
    signal<string | null>(null);

  readonly passkeys =
    signal<
      Awaited<
        ReturnType<
          AuthService['listPasskeys']
        >
      >
    >([]);

  readonly passkeyMessage =
    signal<string | null>(null);

  readonly passkeyError =
    signal<string | null>(null);


  constructor(
    public auth: AuthService,
    private settingsService:
      SettingsService
  ) {}


  async ngOnInit():
    Promise<void> {
    const supported =
      this.auth.isPasskeySupported();

    this.passkeySupported.set(
      supported
    );

    if (supported) {
      await this.loadPasskeys();
    }
  }


  units():
    UnitPreference {
    return this.settingsService
      .settings()
      .units;
  }


  setUnits(
    units: UnitPreference
  ): void {
    this.settingsService.update({
      units
    });
  }


  userDisplayName():
    string {
    const user =
      this.auth.user();

    return (
      user?.user_metadata?.['full_name'] ??
      user?.user_metadata?.['name'] ??
      user?.user_metadata?.['display_name'] ??
      user?.email?.split('@')[0] ??
      'Usuario'
    );
  }


  async loadPasskeys():
    Promise<void> {
    if (
      !this.passkeySupported()
    ) {
      return;
    }

    this.loadingPasskeys.set(true);
    this.passkeyError.set(null);

    try {
      const passkeys =
        await this.auth.listPasskeys();

      this.passkeys.set(
        passkeys
      );
    } catch (error: unknown) {
      this.passkeyError.set(
        this.passkeyErrorMessage(
          error,
          'No se pudieron cargar los accesos configurados.'
        )
      );
    } finally {
      this.loadingPasskeys.set(false);
    }
  }


  async registerPasskey():
    Promise<void> {
    if (
      this.registeringPasskey()
    ) {
      return;
    }

    this.registeringPasskey.set(
      true
    );

    this.passkeyMessage.set(null);
    this.passkeyError.set(null);

    try {
      const passkey =
        await this.auth.registerPasskey();

      const friendlyName =
        passkey.friendly_name?.trim();

      this.passkeyMessage.set(
        friendlyName
          ? `Acceso configurado: ${friendlyName}.`
          : 'Acceso con dispositivo configurado correctamente.'
      );

      await this.loadPasskeys();
    } catch (error: unknown) {
      this.passkeyError.set(
        this.passkeyErrorMessage(
          error,
          'No se pudo configurar el acceso con dispositivo.'
        )
      );
    } finally {
      this.registeringPasskey.set(
        false
      );
    }
  }


  async deletePasskey(
    passkeyId: string,
    friendlyName?: string | null
  ): Promise<void> {
    if (
      this.deletingPasskeyId()
    ) {
      return;
    }

    const displayName =
      friendlyName?.trim() ||
      'este dispositivo';

    const confirmed =
      window.confirm(
        `¿Eliminar el acceso de ${displayName}? ` +
        'Ya no podrás usar esta passkey para entrar en GymOS.'
      );

    if (!confirmed) {
      return;
    }

    this.deletingPasskeyId.set(
      passkeyId
    );

    this.passkeyMessage.set(null);
    this.passkeyError.set(null);

    try {
      await this.auth.deletePasskey(
        passkeyId
      );

      this.passkeyMessage.set(
        'Acceso con dispositivo eliminado.'
      );

      await this.loadPasskeys();
    } catch (error: unknown) {
      this.passkeyError.set(
        this.passkeyErrorMessage(
          error,
          'No se pudo eliminar el acceso con dispositivo.'
        )
      );
    } finally {
      this.deletingPasskeyId.set(
        null
      );
    }
  }


  formatPasskeyDate(
    value:
      | string
      | null
      | undefined
  ): string {
    if (!value) {
      return '—';
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return '—';
    }

    return new Intl.DateTimeFormat(
      'es-ES',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }
    ).format(date);
  }


  private passkeyErrorMessage(
    error: unknown,
    fallback: string
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
        'La operación se canceló o no fue autorizada ' +
        'por el dispositivo.'
      );
    }

    switch (candidate.code) {
      case 'passkey_disabled':
        return (
          'El acceso con passkey todavía no está ' +
          'habilitado en GymOS.'
        );

      case 'too_many_passkeys':
        return (
          'Ya has alcanzado el número máximo de ' +
          'passkeys permitidas.'
        );

      case 'webauthn_credential_exists':
        return (
          'Este acceso ya está registrado para tu cuenta.'
        );

      case 'webauthn_verification_failed':
        return (
          'El dispositivo no pudo verificar la passkey. ' +
          'Inténtalo de nuevo.'
        );

      case 'webauthn_challenge_expired':
        return (
          'La solicitud ha caducado. Inténtalo de nuevo.'
        );

      default:
        return (
          candidate.message?.trim() ||
          fallback
        );
    }
  }
}


@Component({
  selector: 'app-settings-training',
  standalone: true,
  imports: [
    RouterLink
  ],
  template: `
    <section class="settings-page">
      <a
        class="settings-back"
        routerLink="/ajustes"
        aria-label="Volver a Ajustes"
      >
        <span
          class="settings-back-icon"
          aria-hidden="true"
        >
          ‹
        </span>

        <span>Ajustes</span>
      </a>

      <header class="settings-header">
        <h1>Entrenamiento</h1>
      </header>

      <section class="settings-panel">
        <button
          type="button"
          class="settings-toggle-row"
          role="switch"
          [attr.aria-checked]="showRir()"
          (click)="toggleShowRir()"
        >
          <span>
            <strong>Mostrar RIR</strong>

            <small>
              Muestra el input y los resúmenes RIR en
              /entrenar sin borrar historial.
            </small>
          </span>

          <span
            class="switch"
            aria-hidden="true"
            [class.on]="showRir()"
          ></span>
        </button>

        <button
          type="button"
          class="settings-toggle-row"
          role="switch"
          [attr.aria-checked]="
            automaticRestTimer()
          "
          (click)="
            toggleAutomaticRestTimer()
          "
        >
          <span>
            <strong>
              Temporizador automático
            </strong>

            <small>
              Inicia el descanso al completar una serie
              cuando el ejercicio tiene descanso definido.
            </small>
          </span>

          <span
            class="switch"
            aria-hidden="true"
            [class.on]="
              automaticRestTimer()
            "
          ></span>
        </button>

        <button
          type="button"
          class="settings-toggle-row"
          role="switch"
          [attr.aria-checked]="
            confirmBeforeFinish()
          "
          (click)="
            toggleConfirmBeforeFinish()
          "
        >
          <span>
            <strong>
              Confirmar antes de finalizar
            </strong>

            <small>
              Pide confirmación antes de cerrar un
              entrenamiento activo.
            </small>
          </span>

          <span
            class="switch"
            aria-hidden="true"
            [class.on]="
              confirmBeforeFinish()
            "
          ></span>
        </button>
      </section>

      <p class="settings-note">
        Sonido y vibración al terminar descanso quedan
        pendientes hasta integrar una UX fiable con permisos
        del navegador.
      </p>
    </section>
  `,
  styleUrl: './settings.scss'
})
export class SettingsTraining {

  constructor(
    private settingsService:
      SettingsService
  ) {}


  showRir():
    boolean {
    return this.settingsService
      .settings()
      .showRir;
  }


  automaticRestTimer():
    boolean {
    return this.settingsService
      .settings()
      .automaticRestTimer;
  }


  confirmBeforeFinish():
    boolean {
    return this.settingsService
      .settings()
      .confirmBeforeFinish;
  }


  toggleShowRir():
    void {
    this.settingsService.update({
      showRir:
        !this.showRir()
    });
  }


  toggleAutomaticRestTimer():
    void {
    this.settingsService.update({
      automaticRestTimer:
        !this.automaticRestTimer()
    });
  }


  toggleConfirmBeforeFinish():
    void {
    this.settingsService.update({
      confirmBeforeFinish:
        !this.confirmBeforeFinish()
    });
  }
}


@Component({
  selector: 'app-settings-appearance',
  standalone: true,
  imports: [
    RouterLink
  ],
  template: `
    <section class="settings-page">
      <a
        class="settings-back"
        routerLink="/ajustes"
        aria-label="Volver a Ajustes"
      >
        <span
          class="settings-back-icon"
          aria-hidden="true"
        >
          ‹
        </span>

        <span>Ajustes</span>
      </a>

      <header class="settings-header">
        <h1>Apariencia</h1>
      </header>

      <section class="settings-panel">
        <div class="settings-field">
          <span>Tema</span>

          <div
            class="segmented-control"
            role="radiogroup"
            aria-label="Tema"
          >
            @for (
              option of themeOptions;
              track option.value
            ) {
              <button
                type="button"
                role="radio"
                [attr.aria-checked]="
                  theme() === option.value
                "
                [class.active]="
                  theme() === option.value
                "
                (click)="
                  setTheme(
                    option.value
                  )
                "
              >
                {{ option.label }}
              </button>
            }
          </div>
        </div>

        <div class="settings-field">
          <span>Tamaño de texto</span>

          <div
            class="segmented-control"
            role="radiogroup"
            aria-label="Tamaño de texto"
          >
            @for (
              option of textSizeOptions;
              track option.value
            ) {
              <button
                type="button"
                role="radio"
                [attr.aria-checked]="
                  textSize() === option.value
                "
                [class.active]="
                  textSize() === option.value
                "
                (click)="
                  setTextSize(
                    option.value
                  )
                "
              >
                {{ option.label }}
              </button>
            }
          </div>
        </div>

        <button
          type="button"
          class="settings-toggle-row"
          role="switch"
          [attr.aria-checked]="
            reduceMotion()
          "
          (click)="
            toggleReduceMotion()
          "
        >
          <span>
            <strong>
              Reducir animaciones
            </strong>

            <small>
              Respeta también la preferencia del sistema
              operativo.
            </small>
          </span>

          <span
            class="switch"
            aria-hidden="true"
            [class.on]="
              reduceMotion()
            "
          ></span>
        </button>
      </section>
    </section>
  `,
  styleUrl: './settings.scss'
})
export class SettingsAppearance {

  readonly themeOptions: {
    value: ThemePreference;
    label: string;
  }[] = [
    {
      value: 'system',
      label: 'Sistema'
    },
    {
      value: 'light',
      label: 'Claro'
    },
    {
      value: 'dark',
      label: 'Oscuro'
    }
  ];


  readonly textSizeOptions: {
    value: TextSizePreference;
    label: string;
  }[] = [
    {
      value: 'small',
      label: 'Pequeño'
    },
    {
      value: 'normal',
      label: 'Normal'
    },
    {
      value: 'large',
      label: 'Grande'
    }
  ];


  constructor(
    private settingsService:
      SettingsService
  ) {}


  theme():
    ThemePreference {
    return this.settingsService
      .settings()
      .theme;
  }


  textSize():
    TextSizePreference {
    return this.settingsService
      .settings()
      .textSize;
  }


  reduceMotion():
    boolean {
    return this.settingsService
      .settings()
      .reduceMotion;
  }


  setTheme(
    theme: ThemePreference
  ): void {
    this.settingsService.update({
      theme
    });
  }


  setTextSize(
    textSize: TextSizePreference
  ): void {
    this.settingsService.update({
      textSize
    });
  }


  toggleReduceMotion():
    void {
    this.settingsService.update({
      reduceMotion:
        !this.reduceMotion()
    });
  }
}


@Component({
  selector: 'app-settings-data',
  standalone: true,
  imports: [
    RouterLink
  ],
  template: `
    <section class="settings-page">
      <a
        class="settings-back"
        routerLink="/ajustes"
        aria-label="Volver a Ajustes"
      >
        <span
          class="settings-back-icon"
          aria-hidden="true"
        >
          ‹
        </span>

        <span>Ajustes</span>
      </a>

      <header class="settings-header">
        <h1>Datos</h1>
      </header>

      <section class="settings-panel">
        <div class="settings-field">
          <span>
            Estado de sincronización
          </span>

          <strong>
            Automática
          </strong>

          <small>
            Tus entrenamientos se guardan con el autosave
            existente cuando hay sesión activa.
          </small>
        </div>
      </section>

      <p class="settings-note">
        Exportar datos, borrar cuenta e importaciones
        avanzadas no se muestran todavía porque no existe
        un flujo real conectado para esas acciones.
      </p>
    </section>
  `,
  styleUrl: './settings.scss'
})
export class SettingsData {}


@Component({
  selector: 'app-settings-about',
  standalone: true,
  imports: [
    RouterLink
  ],
  template: `
    <section class="settings-page">
      <a
        class="settings-back"
        routerLink="/ajustes"
        aria-label="Volver a Ajustes"
      >
        <span
          class="settings-back-icon"
          aria-hidden="true"
        >
          ‹
        </span>

        <span>Ajustes</span>
      </a>

      <header class="settings-header">
        <h1>Acerca de</h1>
      </header>

      <section class="settings-panel">
        <div class="settings-field">
          <span>Producto</span>

          <strong>
            {{ appInfo.name }}
          </strong>
        </div>

        <div class="settings-field">
          <span>Versión</span>

          <strong>
            {{ appInfo.version }}
          </strong>
        </div>

        <div class="settings-field">
          <span>Build</span>

          <strong>
            {{ appInfo.buildDate }}
          </strong>
        </div>

        <div class="settings-field">
          <span>Entorno</span>

          <strong>
            {{ appInfo.environment }}
          </strong>
        </div>
      </section>
    </section>
  `,
  styleUrl: './settings.scss'
})
export class SettingsAbout {

  readonly appInfo =
    APP_INFO;
}