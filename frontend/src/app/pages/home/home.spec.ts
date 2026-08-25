/**
 * @vitest-environment jsdom
 */

import {
  HttpClient
} from '@angular/common/http';

import {
  Router
} from '@angular/router';

import {
  TestBed
} from '@angular/core/testing';

import {
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import {
  AuthService
} from '../../core/auth.service';

import {
  SettingsService
} from '../../core/settings.service';

import {
  Home
} from './home';


describe('Home', () => {

  beforeEach(async () => {

    localStorage.removeItem(
      'gymos-settings-v1'
    );

    document.documentElement.className = '';

    await TestBed.configureTestingModule({

      imports: [
        Home
      ],

      providers: [

        {
          provide: AuthService,
          useValue: {
            getAccessToken:
              async () => null
          }
        },

        {
          provide: HttpClient,
          useValue: {}
        },

        {
          provide: Router,
          useValue: {
            navigateByUrl:
              async () => true
          }
        }

      ]

    }).compileComponents();
  });


  it(
    'renders the mobile home dashboard',
    async () => {

      TestBed.inject(
        SettingsService
      );

      const fixture =
        TestBed.createComponent(
          Home
        );

      fixture.detectChanges();

      await fixture.whenStable();

      fixture.detectChanges();

      const text =
        (
          fixture.nativeElement
            .textContent ?? ''
        ).replace(/\s+/g, ' ');

      expect(text).toContain(
        'Tu día en Aptus'
      );

      expect(text).toContain(
        'Entrenamiento'
      );

      expect(text).toContain(
        'Nutrición'
      );

      expect(text).toContain(
        'Salud'
      );

      expect(
        document.documentElement
          .classList
          .contains(
            'aptus-theme-system'
          )
      ).toBe(true);
    }
  );
});
