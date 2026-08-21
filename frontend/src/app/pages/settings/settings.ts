import {
  Component
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
      'Identidad, email y unidades.',
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
            {{ auth.user()?.email ?? 'No disponible' }}
          </strong>
          <small>
            Informativo. GymOS todavía no tiene un flujo
            para cambiar email desde la app.
          </small>
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
              [attr.aria-checked]="units() === 'kg'"
              [class.active]="units() === 'kg'"
              (click)="setUnits('kg')"
            >
              kg
            </button>

            <button
              type="button"
              role="radio"
              [attr.aria-checked]="units() === 'lb'"
              [class.active]="units() === 'lb'"
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
    </section>
  `,
  styleUrl: './settings.scss'
})
export class SettingsAccount {
  constructor(
    public auth: AuthService,
    private settingsService:
      SettingsService
  ) {}

  units(): UnitPreference {
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

  userDisplayName(): string {
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
          [attr.aria-checked]="automaticRestTimer()"
          (click)="toggleAutomaticRestTimer()"
        >
          <span>
            <strong>Temporizador automático</strong>
            <small>
              Inicia el descanso al completar una serie
              cuando el ejercicio tiene descanso definido.
            </small>
          </span>

          <span
            class="switch"
            aria-hidden="true"
            [class.on]="automaticRestTimer()"
          ></span>
        </button>

        <button
          type="button"
          class="settings-toggle-row"
          role="switch"
          [attr.aria-checked]="confirmBeforeFinish()"
          (click)="toggleConfirmBeforeFinish()"
        >
          <span>
            <strong>Confirmar antes de finalizar</strong>
            <small>
              Pide confirmación antes de cerrar un
              entrenamiento activo.
            </small>
          </span>

          <span
            class="switch"
            aria-hidden="true"
            [class.on]="confirmBeforeFinish()"
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

  showRir(): boolean {
    return this.settingsService
      .settings()
      .showRir;
  }

  automaticRestTimer(): boolean {
    return this.settingsService
      .settings()
      .automaticRestTimer;
  }

  confirmBeforeFinish(): boolean {
    return this.settingsService
      .settings()
      .confirmBeforeFinish;
  }

  toggleShowRir(): void {
    this.settingsService.update({
      showRir: !this.showRir()
    });
  }

  toggleAutomaticRestTimer(): void {
    this.settingsService.update({
      automaticRestTimer:
        !this.automaticRestTimer()
    });
  }

  toggleConfirmBeforeFinish(): void {
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
                [attr.aria-checked]="theme() === option.value"
                [class.active]="theme() === option.value"
                (click)="setTheme(option.value)"
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
                [attr.aria-checked]="textSize() === option.value"
                [class.active]="textSize() === option.value"
                (click)="setTextSize(option.value)"
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
          [attr.aria-checked]="reduceMotion()"
          (click)="toggleReduceMotion()"
        >
          <span>
            <strong>Reducir animaciones</strong>
            <small>
              Respeta también la preferencia del sistema
              operativo.
            </small>
          </span>

          <span
            class="switch"
            aria-hidden="true"
            [class.on]="reduceMotion()"
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

  theme(): ThemePreference {
    return this.settingsService
      .settings()
      .theme;
  }

  textSize(): TextSizePreference {
    return this.settingsService
      .settings()
      .textSize;
  }

  reduceMotion(): boolean {
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

  toggleReduceMotion(): void {
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
          <span>Estado de sincronización</span>
          <strong>Automática</strong>
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
          <strong>{{ appInfo.name }}</strong>
        </div>

        <div class="settings-field">
          <span>Versión</span>
          <strong>{{ appInfo.version }}</strong>
        </div>

        <div class="settings-field">
          <span>Build</span>
          <strong>{{ appInfo.buildDate }}</strong>
        </div>

        <div class="settings-field">
          <span>Entorno</span>
          <strong>{{ appInfo.environment }}</strong>
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
