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
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  Router
} from '@angular/router';

import {
  AuthService
} from '../../core/auth.service';

import {
  LanguageService
} from '../../core/language.service';

import {
  Login
} from './login';


describe(
  'Login',
  () => {
    const authMock = {
      isPasskeySupported:
        vi.fn(),

      waitForSession:
        vi.fn(),

      signInWithPasskey:
        vi.fn(),

      signInWithPassword:
        vi.fn(),

      resolveAccess:
        vi.fn(),

      signInWithMagicLink:
        vi.fn(),

      signInWithGoogle:
        vi.fn()
    };

    const routerMock = {
      navigateByUrl:
        vi.fn()
    };

    const languageMock = {
      language:
        signal<'es' | 'en'>('es'),

      setLanguage:
        vi.fn()
    };


    beforeEach(() => {
      vi.clearAllMocks();

      languageMock.language.set(
        'es'
      );

      authMock.isPasskeySupported
        .mockReturnValue(
          true
        );

      authMock.waitForSession
        .mockResolvedValue(
          null
        );

      authMock.signInWithPasskey
        .mockResolvedValue(
          undefined
        );

      authMock.signInWithPassword
        .mockResolvedValue(
          undefined
        );

      authMock.resolveAccess
        .mockResolvedValue({
          user_id:
            'user-123',

          email:
            'test@example.com',

          access_status:
            'active',

          plan:
            'trial',

          role:
            'user',

          expires_at:
            null,

          onboarding_completed:
            true
        });

      routerMock.navigateByUrl
        .mockResolvedValue(
          true
        );

      TestBed.configureTestingModule({
        imports: [
          Login
        ],

        providers: [
          {
            provide:
              AuthService,

            useValue:
              authMock
          },
          {
            provide:
              Router,

            useValue:
              routerMock
          },
          {
            provide:
              LanguageService,

            useValue:
              languageMock
          }
        ]
      });
    });


    it(
      'does not expose passkey sign-in on the primary login screen',
      async () => {
        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();

        await fixture.whenStable();

        fixture.detectChanges();

        expect(
          fixture.nativeElement
            .querySelector(
              '.passkey-button'
            )
        ).toBeNull();
      }
    );


    it(
      'signs in with email and password and follows the GymOS access flow',
      async () => {
        const fixture =
          TestBed.createComponent(
            Login
          );

        const component =
          fixture.componentInstance;

        component.email.set(
          'test@example.com'
        );

        component.password.set(
          'secret-password'
        );

        await component.signInWithPassword(
          new Event('submit')
        );

        expect(
          authMock.signInWithPassword
        ).toHaveBeenCalledWith(
          'test@example.com',
          'secret-password'
        );

        expect(
          authMock.resolveAccess
        ).toHaveBeenCalledOnce();

        expect(
          routerMock.navigateByUrl
        ).toHaveBeenCalledWith(
          '/'
        );
      }
    );


    it(
      'renders email and password fields',
      async () => {
        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();

        await fixture.whenStable();

        fixture.detectChanges();

        expect(
          fixture.nativeElement
            .querySelector(
              'input[type="email"]'
            )
        ).not.toBeNull();

        expect(
          fixture.nativeElement
            .querySelector(
              'input[type="password"]'
            )
        ).not.toBeNull();
      }
    );
  }
);