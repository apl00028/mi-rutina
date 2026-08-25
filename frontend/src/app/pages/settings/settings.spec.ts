/**
 * @vitest-environment jsdom
 */

import {
  signal
} from '@angular/core';
import {
  TestBed
} from '@angular/core/testing';
import {
  provideRouter,
  Router
} from '@angular/router';
import {
  beforeEach,
  describe,
  expect,
  it,
  afterEach,
  vi
} from 'vitest';

import {
  APP_INFO
} from '../../core/app-info';
import {
  AuthService
} from '../../core/auth.service';
import {
  SettingsService
} from '../../core/settings.service';
import {
  SettingsAbout,
  SettingsAccount,
  SettingsAppearance,
  SettingsData,
  SettingsHub,
  SettingsTraining
} from './settings';

describe('Settings pages', () => {
  let systemThemeMatches = false;
  let systemThemeListener:
    ((event: MediaQueryListEvent) => void) | null =
      null;

  beforeEach(async () => {
    localStorage.removeItem(
      'gymos-settings-v1'
    );
    document.documentElement.className = '';
    systemThemeMatches = false;
    systemThemeListener = null;

    vi.stubGlobal(
      'matchMedia',
      vi.fn(
        (query: string) => ({
          matches:
            query.includes(
              'prefers-color-scheme'
            )
              ? systemThemeMatches
              : false,
          media: query,
          onchange: null,
          addEventListener:
            vi.fn(
              (
                _event: string,
                listener:
                  (event: MediaQueryListEvent) => void
              ) => {
                systemThemeListener =
                  listener;
              }
            ),
          removeEventListener:
            vi.fn(),
          addListener:
            vi.fn(),
          removeListener:
            vi.fn(),
          dispatchEvent:
            vi.fn()
        } as MediaQueryList)
      )
    );

    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'ajustes',
            component: SettingsHub
          },
          {
            path: 'ajustes/cuenta',
            component: SettingsAccount
          },
          {
            path: 'ajustes/entrenamiento',
            component: SettingsTraining
          },
          {
            path: 'ajustes/apariencia',
            component: SettingsAppearance
          },
          {
            path: 'ajustes/datos',
            component: SettingsData
          },
          {
            path: 'ajustes/acerca-de',
            component: SettingsAbout
          }
        ]),
        {
          provide: AuthService,
          useValue: {
            user: signal({
              email:
                'adrian@example.com',
              user_metadata: {
                full_name:
                  'Adrián Peláez'
              }
            }),

            isPasskeySupported:
              vi.fn(() => false),

            listPasskeys:
              vi.fn(async () => []),

            registerPasskey:
              vi.fn(),

            deletePasskey:
              vi.fn()
          }
        }
      ]
    }).compileComponents();
  });


  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });


  function dispatchSystemTheme(
    dark: boolean
  ): void {
    systemThemeMatches = dark;
    systemThemeListener?.({
      matches: dark,
      media:
        '(prefers-color-scheme: dark)'
    } as MediaQueryListEvent);
  }

  function text(
    element: HTMLElement
  ): string {
    return (
      element.textContent ?? ''
    ).replace(/\s+/g, ' ');
  }

  it('shows the settings hub sections with their routes', () => {
    const fixture =
      TestBed.createComponent(
        SettingsHub
      );

    fixture.detectChanges();

    const links =
      Array.from(
        fixture.nativeElement.querySelectorAll(
          '.settings-row'
        )
      ) as HTMLAnchorElement[];

    expect(text(fixture.nativeElement))
      .toContain('Ajustes');
    expect(
      links.map(link =>
        link.textContent
          ?.replace(/\s+/g, ' ')
          .trim()
      )
    ).toEqual([
      '◉ Cuenta Identidad, acceso, email y unidades. ›',
      '◫ Entrenamiento Registro, RIR y descanso. ›',
      '◐ Apariencia Tema, texto y movimiento. ›',
      '⇅ Datos Sincronización y exportación. ›',
      'i Acerca de Versión y entorno. ›'
    ]);
    expect(
      links.map(link =>
        link.getAttribute('href')
      )
    ).toEqual([
      '/ajustes/cuenta',
      '/ajustes/entrenamiento',
      '/ajustes/apariencia',
      '/ajustes/datos',
      '/ajustes/acerca-de'
    ]);
  });

  it('shows account identity and default units', () => {
    const fixture =
      TestBed.createComponent(
        SettingsAccount
      );

    fixture.detectChanges();

    expect(text(fixture.nativeElement))
      .toContain('Adrián Peláez');
    expect(text(fixture.nativeElement))
      .toContain('adrian@example.com');

    const active =
      fixture.nativeElement.querySelector(
        '.segmented-control button.active'
      ) as HTMLButtonElement;

    expect(active.textContent?.trim())
      .toBe('kg');
  });

  it('shows connected training defaults and persists changes', () => {
    const fixture =
      TestBed.createComponent(
        SettingsTraining
      );

    fixture.detectChanges();

    const service =
      TestBed.inject(
        SettingsService
      );
    const switches =
      Array.from(
        fixture.nativeElement.querySelectorAll(
          '[role="switch"]'
        )
      ) as HTMLButtonElement[];

    expect(service.settings())
      .toMatchObject({
        showRir: true,
        automaticRestTimer: true,
        confirmBeforeFinish: true
      });
    expect(
      switches.map(button =>
        button.getAttribute('aria-checked')
      )
    ).toEqual([
      'true',
      'true',
      'true'
    ]);

    switches[0].click();
    fixture.detectChanges();

    expect(service.settings().showRir)
      .toBe(false);
    expect(
      JSON.parse(
        localStorage.getItem(
          'gymos-settings-v1'
        ) ?? '{}'
      ).showRir
    ).toBe(false);
  });

  it('applies appearance settings globally and keeps dark after reload', () => {
    const fixture =
      TestBed.createComponent(
        SettingsAppearance
      );

    fixture.detectChanges();

    const service =
      TestBed.inject(
        SettingsService
      );

    service.update({
      theme: 'dark',
      textSize: 'large',
      reduceMotion: true
    });

    expect(service.settings().theme)
      .toBe('dark');
    expect(
      document.documentElement.classList
        .contains('aptus-theme-dark')
    ).toBe(true);
    expect(
      document.documentElement.classList
        .contains('aptus-theme-light')
    ).toBe(false);
    expect(
      document.documentElement.classList
        .contains('aptus-text-large')
    ).toBe(true);
    expect(
      document.documentElement.classList
        .contains('aptus-reduce-motion')
    ).toBe(true);

    const fresh =
      new SettingsService();

    expect(fresh.settings())
      .toMatchObject({
        theme: 'dark',
        textSize: 'large',
        reduceMotion: true
      });
    expect(
      document.documentElement.classList
        .contains('aptus-theme-dark')
    ).toBe(true);
  });


  it('uses system theme by default and follows a light system preference', () => {
    const service =
      TestBed.inject(
        SettingsService
      );

    expect(service.settings().theme)
      .toBe('system');
    expect(
      document.documentElement.classList
        .contains('aptus-theme-system')
    ).toBe(true);
    expect(
      document.documentElement.classList
        .contains('aptus-theme-dark')
    ).toBe(false);
  });


  it('keeps system selected while responding to dark system preference changes', () => {
    const service =
      TestBed.inject(
        SettingsService
      );

    expect(service.settings().theme)
      .toBe('system');

    dispatchSystemTheme(true);

    expect(
      document.documentElement.classList
        .contains('aptus-theme-system')
    ).toBe(true);
    expect(
      document.documentElement.classList
        .contains('aptus-theme-dark')
    ).toBe(false);
  });


  it('ignores system preference changes when dark is explicit', () => {
    const service =
      TestBed.inject(
        SettingsService
      );

    service.update({
      theme: 'dark'
    });

    dispatchSystemTheme(false);

    expect(service.settings().theme)
      .toBe('dark');
    expect(
      document.documentElement.classList
        .contains('aptus-theme-dark')
    ).toBe(true);
    expect(
      document.documentElement.classList
        .contains('aptus-theme-system')
    ).toBe(false);
  });


  it('shows the dark theme option as selectable', () => {
    const fixture =
      TestBed.createComponent(
        SettingsAppearance
      );

    fixture.detectChanges();

    const buttons =
      Array.from(
        fixture.nativeElement.querySelectorAll(
          '[aria-label="Tema"] button'
        )
      ) as HTMLButtonElement[];
    const darkButton =
      buttons.find(
        button =>
          button.textContent
            ?.trim() === 'Oscuro'
      );

    expect(darkButton).toBeTruthy();
    expect(darkButton?.disabled)
      .toBe(false);
    expect(
      text(fixture.nativeElement)
    ).not.toContain(
      'El tema oscuro queda pendiente'
    );
  });


  it('keeps explicit light theme applied after reload', () => {
    const service =
      TestBed.inject(
        SettingsService
      );

    service.update({
      theme: 'light'
    });

    expect(
      document.documentElement.classList
        .contains('aptus-theme-light')
    ).toBe(true);
    expect(
      JSON.parse(
        localStorage.getItem(
          'gymos-settings-v1'
        ) ?? '{}'
      ).theme
    ).toBe('light');

    const fresh =
      new SettingsService();

    expect(fresh.settings().theme)
      .toBe('light');
    expect(
      document.documentElement.classList
        .contains('aptus-theme-light')
    ).toBe(true);
  });

  it('does not render fake data actions', () => {
    const fixture =
      TestBed.createComponent(
        SettingsData
      );

    fixture.detectChanges();

    const page =
      text(fixture.nativeElement);

    expect(page).toContain(
      'Estado de sincronización'
    );
    expect(page).not.toContain(
      'Exportar mis datos'
    );
    expect(page).not.toContain(
      'Eliminar cuenta'
    );
  });

  it('shows app version and build from the central source', () => {
    const fixture =
      TestBed.createComponent(
        SettingsAbout
      );

    fixture.detectChanges();

    const page =
      text(fixture.nativeElement);

    expect(page).toContain(
      APP_INFO.name
    );
    expect(page).toContain(
      APP_INFO.version
    );
    expect(page).toContain(
      APP_INFO.buildDate
    );
    expect(page).toContain(
      APP_INFO.environment
    );
  });

  it('subscreens provide an accessible back button to settings', () => {
    const fixture =
      TestBed.createComponent(
        SettingsTraining
      );

    fixture.detectChanges();

    const back =
      fixture.nativeElement.querySelector(
        '.settings-back'
      ) as HTMLAnchorElement;

    expect(back.textContent).toContain('Ajustes');
    expect(back.getAttribute('href'))
      .toBe('/ajustes');
    expect(
      back.getAttribute('aria-label')
    ).toBe('Volver a Ajustes');
    expect(
      back.querySelector(
        '.settings-back-icon'
      )?.textContent?.trim()
    ).toBe('‹');

    back.focus();

    expect(document.activeElement)
      .toBe(back);
  });


  it('back button navigates to the settings hub', async () => {
    const router =
      TestBed.inject(Router);

    await router.navigateByUrl(
      '/ajustes/entrenamiento'
    );

    const fixture =
      TestBed.createComponent(
        SettingsTraining
      );

    fixture.detectChanges();

    const back =
      fixture.nativeElement.querySelector(
        '.settings-back'
      ) as HTMLAnchorElement;

    back.click();
    await fixture.whenStable();

    expect(router.url)
      .toBe('/ajustes');
  });

  it('navigates to a settings subsection route', async () => {
    const router =
      TestBed.inject(Router);

    await router.navigateByUrl(
      '/ajustes/apariencia'
    );

    expect(router.url)
      .toBe('/ajustes/apariencia');
  });
});
