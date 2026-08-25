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

export interface AptusSettings {
  units: UnitPreference;
  showRir: boolean;
  automaticRestTimer: boolean;
  confirmBeforeFinish: boolean;
  theme: ThemePreference;
  textSize: TextSizePreference;
  reduceMotion: boolean;
}

export const DEFAULT_SETTINGS:
  AptusSettings = {
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

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  readonly settings =
    signal<AptusSettings>(
      this.readSettings()
    );

  private readonly systemThemeQuery =
    window.matchMedia?.(
      '(prefers-color-scheme: dark)'
    ) ?? null;

  private readonly handleSystemThemeChange =
    () => {
      if (this.settings().theme === 'system') {
        this.applyGlobalSettings(
          this.settings()
        );
      }
    };

  constructor() {
    this.systemThemeQuery
      ?.addEventListener?.(
        'change',
        this.handleSystemThemeChange
      );

    this.applyGlobalSettings(
      this.settings()
    );
  }

  update(
    patch: Partial<AptusSettings>
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
    AptusSettings {
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
    settings: AptusSettings
  ): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(settings)
    );
  }

  private normalize(
    value: Partial<AptusSettings>
  ): AptusSettings {
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
        value.theme === 'light' ||
        value.theme === 'dark'
          ? value.theme
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
    settings: AptusSettings
  ): void {
    const root =
      document.documentElement;

    root.classList.remove(
      'aptus-theme-system',
      'aptus-theme-light',
      'aptus-theme-dark',
      'aptus-text-small',
      'aptus-text-normal',
      'aptus-text-large',
      'aptus-reduce-motion'
    );

    root.classList.add(
      `aptus-theme-${settings.theme}`
    );

    root.classList.add(
      `aptus-text-${settings.textSize}`
    );

    if (this.effectiveReduceMotion()) {
      root.classList.add(
        'aptus-reduce-motion'
      );
    }
  }

}
