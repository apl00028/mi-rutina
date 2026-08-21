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
      'shows device sign-in when passkeys are supported',
      async () => {
        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();

        await fixture.whenStable();

        fixture.detectChanges();

        const button =
          fixture.nativeElement
            .querySelector(
              '.passkey-button'
            ) as
              HTMLButtonElement | null;

        expect(
          button
        ).not.toBeNull();

        expect(
          button?.textContent
            ?.replace(
              /\s+/g,
              ' '
            )
            .trim()
        ).toBe(
          '◉ Entrar con dispositivo'
        );
      }
    );


    it(
      'signs in with a passkey and follows the normal GymOS access flow',
      async () => {
        const fixture =
          TestBed.createComponent(
            Login
          );

        const component =
          fixture.componentInstance;

        await component
          .signInWithPasskey();

        expect(
          authMock.signInWithPasskey
        ).toHaveBeenCalledOnce();

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
      'hides device sign-in when passkeys are not supported',
      async () => {
        authMock.isPasskeySupported
          .mockReturnValue(
            false
          );

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
  }
);