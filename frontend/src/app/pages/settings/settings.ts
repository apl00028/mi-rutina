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

import {
  HealthConnect
} from '../../core/health-connect.plugin';

import type {
  HealthConnectPermissionStatus,
  HealthConnectSnapshot,
  HealthConnectExerciseSessions
} from '../../core/health-connect.plugin';

import {
  Capacitor
} from '@capacitor/core';


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
            Informativo. Aptus todavía no tiene un flujo
            para cambiar email desde la app.
          </small>
        </div>

        <div class="settings-field">
          <span>Contraseña</span>

          <small>
            Crea o cambia tu contraseña para poder entrar
            también con tu email, aunque normalmente uses Google.
          </small>

          <div class="settings-password-form">
            <input
              type="password"
              autocomplete="new-password"
              placeholder="Nueva contraseña"
              [value]="newPassword()"
              (input)="
                newPassword.set(
                  $any($event.target).value
                )
              "
            />

            <input
              type="password"
              autocomplete="new-password"
              placeholder="Repetir contraseña"
              [value]="confirmPassword()"
              (input)="
                confirmPassword.set(
                  $any($event.target).value
                )
              "
            />

            <button
              type="button"
              class="settings-action"
              [disabled]="savingPassword()"
              (click)="savePassword()"
            >
              @if (savingPassword()) {
                Guardando…
              } @else {
                Crear / cambiar contraseña
              }
            </button>
          </div>

          @if (passwordMessage()) {
            <p
              class="settings-status settings-status-success"
              role="status"
            >
              {{ passwordMessage() }}
            </p>
          }

          @if (passwordError()) {
            <p
              class="settings-status settings-status-error"
              role="alert"
            >
              {{ passwordError() }}
            </p>
          }
        </div>

        <div class="settings-field">
          <span>Acceso con dispositivo</span>

          <strong>
            Passkey
          </strong>

          <small>
            Permite entrar en Aptus usando la seguridad
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
        Google o con tu email y contraseña.
      </p>
    </section>
  `,
  styleUrl: './settings.scss'
})
export class SettingsAccount
  implements OnInit {

  readonly newPassword =
    signal('');

  readonly confirmPassword =
    signal('');

  readonly savingPassword =
    signal(false);

  readonly passwordMessage =
    signal<string | null>(null);

  readonly passwordError =
    signal<string | null>(null);


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


  async savePassword():
    Promise<void> {
    if (this.savingPassword()) {
      return;
    }

    const password =
      this.newPassword();

    const confirmation =
      this.confirmPassword();

    this.passwordMessage.set(null);
    this.passwordError.set(null);

    if (password.length < 8) {
      this.passwordError.set(
        'La contraseña debe tener al menos 8 caracteres.'
      );
      return;
    }

    if (password !== confirmation) {
      this.passwordError.set(
        'Las contraseñas no coinciden.'
      );
      return;
    }

    this.savingPassword.set(true);

    try {
      await this.auth.updatePassword(
        password
      );

      this.newPassword.set('');
      this.confirmPassword.set('');

      this.passwordMessage.set(
        'Contraseña guardada correctamente.'
      );
    } catch (error: unknown) {
      const candidate =
        error as {
          message?: string;
        };

      this.passwordError.set(
        candidate.message?.trim() ||
        'No se pudo guardar la contraseña.'
      );
    } finally {
      this.savingPassword.set(false);
    }
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
        'Ya no podrás usar esta passkey para entrar en Aptus.'
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
          'habilitado en Aptus.'
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


      <section class="settings-panel">
        <div class="settings-field">
          <span>
            Datos de salud
          </span>

          <strong>
            Health Connect
          </strong>

          <small>
            Aptus puede leer los datos que Garmin Connect
            comparte con Health Connect.
            Esta prueba es solo de lectura y todavía
            no guarda estos datos en Aptus.
          </small>

          @if (
            healthConnectAvailable() === null
          ) {
            <small>
              Comprobando disponibilidad…
            </small>
          } @else if (
            healthConnectAvailable() === false
          ) {
            <p
              class="
                settings-status
                settings-status-muted
              "
            >
              Health Connect no está disponible
              en este dispositivo.
            </p>
          } @else {
            <p
              class="
                settings-status
                settings-status-success
              "
            >
              {{
                healthConnectPermissions()
                  ?.allGranted
                    ? 'Conectado'
                    : 'Permisos pendientes'
              }}
            </p>

            <div
              class="settings-password-form"
            >
              <button
                type="button"
                class="settings-action"
                [disabled]="
                  healthConnectLoading()
                "
                (click)="
                  openHealthConnectPermissions()
                "
              >
                Conectar / revisar permisos
              </button>

              <button
                type="button"
                class="settings-action"
                [disabled]="
                  healthConnectLoading()
                "
                (click)="
                  refreshHealthConnect()
                "
              >
                @if (
                  healthConnectLoading()
                ) {
                  Comprobando…
                } @else {
                  Comprobar permisos
                }
              </button>

              @if (
                healthConnectPermissions()
                  ?.allGranted
              ) {
                <button
                  type="button"
                  class="settings-action"
                  [disabled]="
                    healthConnectLoading()
                  "
                  (click)="
                    readHealthConnectData()
                  "
                >
                  Leer datos ahora
                </button>

                <button
                  type="button"
                  class="settings-action"
                  [disabled]="
                    healthConnectLoading()
                  "
                  (click)="
                    readGarminExerciseSessions()
                  "
                >
                  Leer actividades Garmin
                </button>
              }
            </div>

            @if (
              healthConnectPermissions()
            ) {
              <small>
                Pasos:
                {{
                  permissionLabel(
                    healthConnectPermissions()
                      ?.steps
                  )
                }}
                · Actividades:
                {{
                  permissionLabel(
                    healthConnectPermissions()
                      ?.exercise
                  )
                }}
                · FC reposo:
                {{
                  permissionLabel(
                    healthConnectPermissions()
                      ?.restingHeartRate
                  )
                }}
                · Sueño:
                {{
                  permissionLabel(
                    healthConnectPermissions()
                      ?.sleep
                  )
                }}
                · Peso:
                {{
                  permissionLabel(
                    healthConnectPermissions()
                      ?.weight
                  )
                }}
                · Grasa:
                {{
                  permissionLabel(
                    healthConnectPermissions()
                      ?.bodyFat
                  )
                }}
              </small>
            }
          }

          @if (healthConnectMessage()) {
            <p
              class="
                settings-status
                settings-status-success
              "
              role="status"
            >
              {{ healthConnectMessage() }}
            </p>
          }

          @if (healthConnectError()) {
            <p
              class="
                settings-status
                settings-status-error
              "
              role="alert"
            >
              {{ healthConnectError() }}
            </p>
          }
        </div>


        @if (healthConnectSnapshot()) {
          <div class="settings-field">
            <span>
              Última lectura
            </span>

            <strong>
              Datos disponibles
            </strong>

            <small>
              Los valores siguientes proceden
              directamente de Health Connect.
            </small>
          </div>


          <div class="settings-field">
            <span>Pasos hoy</span>

            <strong>
              {{
                healthConnectSnapshot()
                  ?.stepsToday ?? '—'
              }}
            </strong>

            <small>
              Origen:
              {{
                sourceListLabel(
                  healthConnectSnapshot()
                    ?.stepsSources
                )
              }}
            </small>
          </div>


          <div class="settings-field">
            <span>
              Frecuencia cardiaca en reposo
            </span>

            <strong>
              @if (
                healthConnectSnapshot()
                  ?.restingHeartRate !==
                  undefined
              ) {
                {{
                  healthConnectSnapshot()
                    ?.restingHeartRate
                }}
                ppm
              } @else {
                —
              }
            </strong>

            <small>
              Origen:
              {{
                sourceLabel(
                  healthConnectSnapshot()
                    ?.restingHeartRateSource
                )
              }}
            </small>
          </div>


          <div class="settings-field">
            <span>
              Último sueño
            </span>

            <strong>
              {{
                sleepLabel(
                  healthConnectSnapshot()
                    ?.sleepMinutes
                )
              }}
            </strong>

            <small>
              Origen:
              {{
                sourceLabel(
                  healthConnectSnapshot()
                    ?.sleepSource
                )
              }}
            </small>
          </div>


          <div class="settings-field">
            <span>
              Último peso
            </span>

            <strong>
              @if (
                healthConnectSnapshot()
                  ?.weightKg !==
                  undefined
              ) {
                {{
                  numberLabel(
                    healthConnectSnapshot()
                      ?.weightKg
                  )
                }}
                kg
              } @else {
                —
              }
            </strong>

            <small>
              Origen:
              {{
                sourceLabel(
                  healthConnectSnapshot()
                    ?.weightSource
                )
              }}
            </small>
          </div>


          <div class="settings-field">
            <span>
              Grasa corporal
            </span>

            <strong>
              @if (
                healthConnectSnapshot()
                  ?.bodyFatPercentage !==
                  undefined
              ) {
                {{
                  numberLabel(
                    healthConnectSnapshot()
                      ?.bodyFatPercentage
                  )
                }}
                %
              } @else {
                —
              }
            </strong>

            <small>
              Origen:
              {{
                sourceLabel(
                  healthConnectSnapshot()
                    ?.bodyFatSource
                )
              }}
            </small>
          </div>
        }

        @if (healthConnectExerciseSessions()) {
          <div class="settings-field">
            <span>
              Actividades Garmin
            </span>

            <strong>
              {{
                healthConnectExerciseSessions()
                  ?.count ?? 0
              }}
              sesiones encontradas
            </strong>

            <small>
              Últimos
              {{
                healthConnectExerciseSessions()
                  ?.lookbackDays
              }}
              días · datos de diagnóstico,
              todavía no guardados.
            </small>
          </div>

          @for (
            session of
              healthConnectExerciseSessions()
                ?.sessions ?? [];
            track $index
          ) {
            <div class="settings-field">
              <span>
                Exercise type:
                {{ session.exerciseType }}
              </span>

              <strong>
                {{
                  session.title ||
                  'Sesión Garmin'
                }}
              </strong>

              <small>
                {{ session.startTime }}
                →
                {{ session.endTime }}
              </small>

              <small>
                Duración:
                {{ session.durationMinutes }}
                min
                · laps:
                {{ session.lapCount }}
                · segments:
                {{ session.segmentCount }}
                · route:
                {{
                  session.hasRoute
                    ? 'sí'
                    : 'no'
                }}
              </small>

              <small>
                Origen:
                {{
                  sourceLabel(
                    session.sourcePackage
                  )
                }}
              </small>

              @if (session.notes) {
                <small>
                  Notas:
                  {{ session.notes }}
                </small>
              }
            </div>
          }
        }
      </section>


      <p class="settings-note">
        Aptus no modifica ningún dato de Garmin
        ni de Health Connect.
      </p>
    </section>
  `,
  styleUrl: './settings.scss'
})
export class SettingsData
  implements OnInit {

  readonly healthConnectAvailable =
    signal<boolean | null>(
      null
    );


  readonly healthConnectPermissions =
    signal<
      HealthConnectPermissionStatus
      | null
    >(
      null
    );


  readonly healthConnectSnapshot =
    signal<
      HealthConnectSnapshot
      | null
    >(
      null
    );


  readonly healthConnectExerciseSessions =
    signal<
      HealthConnectExerciseSessions
      | null
    >(
      null
    );


  readonly healthConnectLoading =
    signal(false);


  readonly healthConnectMessage =
    signal<string | null>(
      null
    );


  readonly healthConnectError =
    signal<string | null>(
      null
    );


  async ngOnInit():
    Promise<void> {
    await this.refreshHealthConnect();
  }


  private isNativeAndroid():
    boolean {
    return (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() ===
        'android'
    );
  }


  async refreshHealthConnect():
    Promise<void> {
    this.healthConnectError.set(
      null
    );

    this.healthConnectMessage.set(
      null
    );


    if (!this.isNativeAndroid()) {
      this.healthConnectAvailable.set(
        false
      );

      return;
    }


    this.healthConnectLoading.set(
      true
    );


    try {
      const availability =
        await HealthConnect
          .isAvailable();

      this.healthConnectAvailable.set(
        availability.supported
      );


      if (!availability.supported) {
        this.healthConnectPermissions.set(
          null
        );

        return;
      }


      const permissions =
        await HealthConnect
          .permissionStatus();

      this.healthConnectPermissions.set(
        permissions
      );

    } catch (error: unknown) {
      this.healthConnectAvailable.set(
        false
      );

      this.healthConnectError.set(
        this.healthConnectErrorMessage(
          error,
          'No se pudo comprobar Health Connect.'
        )
      );

    } finally {
      this.healthConnectLoading.set(
        false
      );
    }
  }


  async openHealthConnectPermissions():
    Promise<void> {
    this.healthConnectError.set(
      null
    );

    this.healthConnectMessage.set(
      null
    );


    try {
      await HealthConnect
        .openPermissions();

      this.healthConnectMessage.set(
        'Revisa los permisos de Aptus y, al volver, pulsa "Comprobar permisos".'
      );

    } catch (error: unknown) {
      this.healthConnectError.set(
        this.healthConnectErrorMessage(
          error,
          'No se pudo abrir Health Connect.'
        )
      );
    }
  }


  async readHealthConnectData():
    Promise<void> {
    if (
      this.healthConnectLoading()
    ) {
      return;
    }


    this.healthConnectLoading.set(
      true
    );

    this.healthConnectMessage.set(
      null
    );

    this.healthConnectError.set(
      null
    );


    try {
      const snapshot =
        await HealthConnect
          .readSnapshot();

      this.healthConnectSnapshot.set(
        snapshot
      );

      this.healthConnectMessage.set(
        'Lectura completada. Estos datos todavía no se han guardado en Aptus.'
      );

    } catch (error: unknown) {
      this.healthConnectError.set(
        this.healthConnectErrorMessage(
          error,
          'No se pudieron leer los datos de Health Connect.'
        )
      );

    } finally {
      this.healthConnectLoading.set(
        false
      );
    }
  }


  async readGarminExerciseSessions():
    Promise<void> {
    if (
      this.healthConnectLoading()
    ) {
      return;
    }

    this.healthConnectLoading.set(
      true
    );

    this.healthConnectMessage.set(
      null
    );

    this.healthConnectError.set(
      null
    );

    try {
      const result =
        await HealthConnect
          .readGarminExerciseSessions();

      this.healthConnectExerciseSessions.set(
        result
      );

      this.healthConnectMessage.set(
        `${result.count} actividades Garmin encontradas. ` +
        'Todavía no se han guardado en Aptus.'
      );

    } catch (error: unknown) {
      this.healthConnectError.set(
        this.healthConnectErrorMessage(
          error,
          'No se pudieron leer las actividades Garmin.'
        )
      );

    } finally {
      this.healthConnectLoading.set(
        false
      );
    }
  }


  permissionLabel(
    granted:
      | boolean
      | undefined
  ): string {
    return granted
      ? 'OK'
      : 'pendiente';
  }


  sleepLabel(
    minutes:
      | number
      | undefined
  ): string {
    if (
      minutes === undefined
    ) {
      return '—';
    }

    const hours =
      Math.floor(
        minutes / 60
      );

    const remainingMinutes =
      Math.round(
        minutes % 60
      );

    return (
      `${hours} h ` +
      `${remainingMinutes} min`
    );
  }


  numberLabel(
    value:
      | number
      | undefined
  ): string {
    if (
      value === undefined ||
      !Number.isFinite(value)
    ) {
      return '—';
    }

    return new Intl.NumberFormat(
      'es-ES',
      {
        maximumFractionDigits: 1
      }
    ).format(value);
  }


  sourceListLabel(
    sources:
      | string[]
      | undefined
  ): string {
    if (
      !sources ||
      sources.length === 0
    ) {
      return 'Health Connect';
    }

    return [
      ...new Set(
        sources.map(
          source =>
            this.sourceLabel(
              source
            )
        )
      )
    ].join(', ');
  }


  sourceLabel(
    source:
      | string
      | undefined
  ): string {
    if (!source) {
      return 'Health Connect';
    }

    const normalized =
      source.toLowerCase();

    if (
      normalized.includes(
        'garmin'
      )
    ) {
      return 'Garmin Connect';
    }

    if (
      normalized.includes(
        'samsung'
      )
    ) {
      return 'Samsung Health';
    }

    return source;
  }


  private healthConnectErrorMessage(
    error: unknown,
    fallback: string
  ): string {
    const candidate =
      error as {
        message?: string;
      };

    return (
      candidate.message?.trim() ||
      fallback
    );
  }
}


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