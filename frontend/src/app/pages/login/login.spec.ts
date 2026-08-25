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
      nativeLoginCompleted:
        signal(0),

      isPasskeySupported:
        vi.fn(),

      waitForSession:
        vi.fn(),

      consumeNativeAuthError:
        vi.fn(),

      signInWithPasskey:
        vi.fn(),

      signInWithPassword:
        vi.fn(),

      requestPasswordReset:
        vi.fn(),

      updatePassword:
        vi.fn(),

      signOut:
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

      authMock.nativeLoginCompleted.set(
        0
      );

      authMock.isPasskeySupported
        .mockReturnValue(
          true
        );

      authMock.waitForSession
        .mockResolvedValue(
          null
        );

      authMock.consumeNativeAuthError
        .mockReturnValue(
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

      authMock.requestPasswordReset
        .mockResolvedValue(
          undefined
        );

      authMock.updatePassword
        .mockResolvedValue(
          undefined
        );

      authMock.signOut
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
      'exposes passkey sign-in when passkeys are supported',
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
        ).not.toBeNull();
      }
    );


    it(
      'signs in with email and password and follows the Aptus access flow',
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

        expect(
          authMock.signOut
        ).not.toHaveBeenCalled();
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


    it(
      'requests a password reset for the entered email',
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

        await component.sendPasswordReset(
          new Event('click')
        );

        expect(
          authMock.requestPasswordReset
        ).toHaveBeenCalledWith(
          'test@example.com'
        );
      }
    );


    it(
      'updates the password during recovery and returns to sign-in',
      async () => {
        const fixture =
          TestBed.createComponent(
            Login
          );

        const component =
          fixture.componentInstance;

        component.recoveryMode.set(
          true
        );

        component.recoveryPassword.set(
          'new-password'
        );

        component.recoveryConfirmPassword.set(
          'new-password'
        );

        await component.completePasswordRecovery(
          new Event('submit')
        );

        expect(
          authMock.updatePassword
        ).toHaveBeenCalledWith(
          'new-password'
        );

        expect(
          authMock.signOut
        ).toHaveBeenCalledOnce();

        expect(
          authMock.resolveAccess
        ).not.toHaveBeenCalled();

        expect(
          component.recoveryMode()
        ).toBe(false);

        expect(
          component.message()
        ).toBe(
          'Contraseña actualizada. Ya puedes iniciar sesión.'
        );
      }
    );
  }
);
describe(
  'LanguageService migration',
  () => {
    beforeEach(() => {
      localStorage.removeItem(
        'aptus-language'
      );

      localStorage.removeItem(
        'gymos-language'
      );
    });

    it(
      'migrates legacy GymOS language to Aptus storage',
      () => {
        localStorage.setItem(
          'gymos-language',
          'en'
        );

        const service =
          new LanguageService();

        expect(
          service.language()
        ).toBe('en');

        expect(
          localStorage.getItem(
            'aptus-language'
          )
        ).toBe('en');
      }
    );
  }
);
