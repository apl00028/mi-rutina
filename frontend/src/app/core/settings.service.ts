import {
  Injectable,
  signal
} from '@angular/core';

export type UnitPreference =
  | 'kg'
  | 'lb';

export type ThemePreference =
  | 'system'
  | 'light'
  | 'dark';

export type TextSizePreference =
  | 'small'
  | 'normal'
  | 'large';

export interface GymOSSettings {
  units: UnitPreference;
  showRir: boolean;
  automaticRestTimer: boolean;
  confirmBeforeFinish: boolean;
  theme: ThemePreference;
  textSize: TextSizePreference;
  reduceMotion: boolean;
}

export const DEFAULT_SETTINGS:
  GymOSSettings = {
  units: 'kg',
  showRir: true,
  automaticRestTimer: true,
  confirmBeforeFinish: true,
  theme: 'system',
  textSize: 'normal',
  reduceMotion: false
};

const STORAGE_KEY =
  'gymos-settings-v1';

const DARK_THEME_ENABLED =
  false;

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  readonly settings =
    signal<GymOSSettings>(
      this.readSettings()
    );

  constructor() {
    this.applyGlobalSettings(
      this.settings()
    );
  }

  update(
    patch: Partial<GymOSSettings>
  ): void {
    const next = this.normalize({
      ...this.settings(),
      ...patch
    });

    this.settings.set(next);
    this.writeSettings(next);
    this.applyGlobalSettings(next);
  }

  reset(): void {
    this.settings.set(
      DEFAULT_SETTINGS
    );
    this.writeSettings(
      DEFAULT_SETTINGS
    );
    this.applyGlobalSettings(
      DEFAULT_SETTINGS
    );
  }

  effectiveReduceMotion():
    boolean {
    return (
      this.settings().reduceMotion ||
      window.matchMedia?.(
        '(prefers-reduced-motion: reduce)'
      ).matches === true
    );
  }

  private readSettings():
    GymOSSettings {
    try {
      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );

      if (!raw) {
        return DEFAULT_SETTINGS;
      }

      return this.normalize(
        JSON.parse(raw)
      );

    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  private writeSettings(
    settings: GymOSSettings
  ): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(settings)
    );
  }

  private normalize(
    value: Partial<GymOSSettings>
  ): GymOSSettings {
    return {
      units:
        value.units === 'lb'
          ? 'lb'
          : 'kg',
      showRir:
        value.showRir === undefined
          ? DEFAULT_SETTINGS.showRir
          : Boolean(value.showRir),
      automaticRestTimer:
        value.automaticRestTimer === undefined
          ? DEFAULT_SETTINGS.automaticRestTimer
          : Boolean(
              value.automaticRestTimer
            ),
      confirmBeforeFinish:
        value.confirmBeforeFinish === undefined
          ? DEFAULT_SETTINGS.confirmBeforeFinish
          : Boolean(
              value.confirmBeforeFinish
            ),
      theme:
        value.theme === 'dark' &&
        DARK_THEME_ENABLED
          ? 'dark'
          : value.theme === 'light'
            ? 'light'
            : 'system',
      textSize:
        value.textSize === 'small' ||
        value.textSize === 'large'
          ? value.textSize
          : 'normal',
      reduceMotion:
        Boolean(value.reduceMotion)
    };
  }

  private applyGlobalSettings(
    settings: GymOSSettings
  ): void {
    const root =
      document.documentElement;

    root.classList.remove(
      'gymos-theme-light',
      'gymos-theme-dark',
      'gymos-text-small',
      'gymos-text-normal',
      'gymos-text-large',
      'gymos-reduce-motion'
    );

    root.classList.add(
      `gymos-theme-${this.effectiveTheme(settings)}`
    );

    root.classList.add(
      `gymos-text-${settings.textSize}`
    );

    if (this.effectiveReduceMotion()) {
      root.classList.add(
        'gymos-reduce-motion'
      );
    }
  }

  private effectiveTheme(
    settings: GymOSSettings
  ): 'light' | 'dark' {
    if (
      settings.theme === 'dark' &&
      DARK_THEME_ENABLED
    ) {
      return 'dark';
    }

    return 'light';
  }
}
