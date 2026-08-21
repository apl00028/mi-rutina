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
  it
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
  beforeEach(async () => {
    localStorage.removeItem(
      'gymos-settings-v1'
    );
    document.documentElement.className = '';

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
            })
          }
        }
      ]
    }).compileComponents();
  });

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
      '◉ Cuenta Identidad, email y unidades. ›',
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

  it('applies appearance settings globally and keeps them after reload', () => {
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

    expect(
      document.documentElement.classList
        .contains('gymos-theme-dark')
    ).toBe(true);
    expect(
      document.documentElement.classList
        .contains('gymos-text-large')
    ).toBe(true);
    expect(
      document.documentElement.classList
        .contains('gymos-reduce-motion')
    ).toBe(true);

    const fresh =
      new SettingsService();

    expect(fresh.settings())
      .toMatchObject({
        theme: 'dark',
        textSize: 'large',
        reduceMotion: true
      });
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

  it('subscreens provide a back link to settings', () => {
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
