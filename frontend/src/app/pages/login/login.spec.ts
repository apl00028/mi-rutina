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

      passwordRecoverySession:
        signal<{
          access_token: string;
        } | null>(null),

      isPasskeySupported:
        vi.fn(),

      waitForSession:
        vi.fn(),

      waitForPasswordRecoverySession:
        vi.fn(),

      exchangePasswordRecoveryCode:
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


    function deferred<T>() {
      let resolve:
        (value: T) => void =
          () => {};

      const promise =
        new Promise<T>(
          promiseResolve => {
            resolve =
              promiseResolve;
          }
        );

      return {
        promise,
        resolve
      };
    }


    async function flushPromises():
      Promise<void> {
      await Promise.resolve();
      await Promise.resolve();
    }


    function setLoginSearch(
      search: string
    ): void {
      window.history.pushState(
        {},
        '',
        `/login${search}`
      );
    }


    beforeEach(() => {
      vi.clearAllMocks();

      setLoginSearch('');

      languageMock.language.set(
        'es'
      );

      authMock.nativeLoginCompleted.set(
        0
      );

      authMock.passwordRecoverySession.set(
        null
      );

      authMock.isPasskeySupported
        .mockReturnValue(
          true
        );

      authMock.waitForSession
        .mockResolvedValue(
          null
        );

      authMock.waitForPasswordRecoverySession
        .mockResolvedValue(
          null
        );

      authMock.exchangePasswordRecoveryCode
        .mockImplementation(
          async code => {
            const session = {
              access_token:
                `recovery-${code}`
            };

            authMock.passwordRecoverySession.set(
              session
            );

            return session;
          }
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
      'exchanges web recovery auth codes explicitly',
      async () => {
        setLoginSearch(
          '?recovery=1&code=abc'
        );

        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();
        await fixture.whenStable();
        await flushPromises();
        fixture.detectChanges();

        expect(
          authMock.exchangePasswordRecoveryCode
        ).toHaveBeenCalledWith(
          'abc'
        );
      }
    );


    it(
      'shows recovery form after a successful web recovery code exchange',
      async () => {
        setLoginSearch(
          '?recovery=1&code=abc'
        );

        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();
        await fixture.whenStable();
        await flushPromises();
        fixture.detectChanges();

        expect(
          fixture.componentInstance
            .recoveryMode()
        ).toBe(true);
        expect(
          fixture.nativeElement
            .querySelector(
              '.recovery-form'
            )
        ).not.toBeNull();
      }
    );


    it(
      'does not navigate after a successful web recovery code exchange',
      async () => {
        setLoginSearch(
          '?recovery=1&code=abc'
        );

        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();
        await fixture.whenStable();
        await flushPromises();
        fixture.detectChanges();

        expect(
          authMock.resolveAccess
        ).not.toHaveBeenCalled();
        expect(
          routerMock.navigateByUrl
        ).not.toHaveBeenCalled();
      }
    );


    it(
      'returns to normal login when web recovery code exchange fails',
      async () => {
        authMock.exchangePasswordRecoveryCode
          .mockRejectedValue(
            new Error(
              'expired'
            )
          );

        setLoginSearch(
          '?recovery=1&code=abc'
        );

        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();
        await fixture.whenStable();
        await flushPromises();
        fixture.detectChanges();

        expect(
          fixture.componentInstance
            .recoveryMode()
        ).toBe(false);
        expect(
          fixture.nativeElement
            .querySelector(
              '.recovery-form'
            )
        ).toBeNull();
        expect(
          fixture.componentInstance.error()
        ).toBe(
          'El enlace de recuperación no es válido o ha caducado.'
        );
        expect(
          window.location.search
        ).toBe('');
      }
    );


    it(
      'shows recovery form when PASSWORD_RECOVERY arrives after an initial null session',
      async () => {
        const recovery =
          deferred<{
            access_token: string;
          }>();

        authMock.waitForSession
          .mockResolvedValue(null);
        authMock.waitForPasswordRecoverySession
          .mockReturnValue(
            recovery.promise
          );

        setLoginSearch(
          '?recovery=1'
        );

        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();
        await flushPromises();
        fixture.detectChanges();

        expect(
          fixture.componentInstance
            .recoveryMode()
        ).toBe(false);
        expect(
          fixture.nativeElement
            .querySelector(
              '.recovery-form'
            )
        ).toBeNull();

        recovery.resolve({
          access_token:
            'recovery-token'
        });

        await fixture.whenStable();
        await flushPromises();
        fixture.detectChanges();

        expect(
          fixture.componentInstance
            .recoveryMode()
        ).toBe(true);
        expect(
          fixture.nativeElement
            .querySelector(
              '.recovery-form'
            )
        ).not.toBeNull();
        expect(
          fixture.componentInstance.error()
        ).toBeNull();
      }
    );


    it(
      'does not allow a normal session to enter recovery from the query param alone',
      async () => {
        authMock.waitForSession
          .mockResolvedValue({
            access_token:
              'normal-token'
          });

        setLoginSearch(
          '?recovery=1'
        );

        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(
          authMock.waitForPasswordRecoverySession
        ).not.toHaveBeenCalled();
        expect(
          authMock.updatePassword
        ).not.toHaveBeenCalled();
        expect(
          fixture.componentInstance
            .recoveryMode()
        ).toBe(false);
        expect(
          fixture.nativeElement
            .querySelector(
              '.recovery-form'
            )
        ).toBeNull();
      }
    );


    it(
      'does not navigate to home during password recovery',
      async () => {
        const recoverySession = {
          access_token:
            'recovery-token'
        };

        authMock.passwordRecoverySession.set(
          recoverySession
        );
        authMock.waitForSession
          .mockResolvedValue(null);
        authMock.waitForPasswordRecoverySession
          .mockResolvedValue(
            recoverySession
          );

        setLoginSearch(
          '?recovery=1'
        );

        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(
          authMock.resolveAccess
        ).not.toHaveBeenCalled();
        expect(
          routerMock.navigateByUrl
        ).not.toHaveBeenCalled();
        expect(
          fixture.componentInstance
            .recoveryMode()
        ).toBe(true);
      }
    );


    it(
      'shows an error for invalid recovery callbacks',
      async () => {
        authMock.waitForSession
          .mockResolvedValue(null);

        setLoginSearch(
          '?recovery=1&error_description=Expired'
        );

        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(
          authMock.waitForPasswordRecoverySession
        ).not.toHaveBeenCalled();
        expect(
          fixture.componentInstance
            .recoveryMode()
        ).toBe(false);
        expect(
          fixture.componentInstance.error()
        ).toBe('Expired');
      }
    );


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
      'switches between athlete and trainer access modes',
      async () => {
        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const component =
          fixture.componentInstance;

        expect(
          component.requestedAccessRole()
        ).toBe('athlete');

        expect(
          fixture.nativeElement
            .querySelectorAll(
              '.access-role-toggle button'
            ).length
        ).toBe(2);

        component.selectAccessRole(
          'trainer'
        );

        fixture.detectChanges();

        expect(
          component.requestedAccessRole()
        ).toBe('trainer');

        expect(
          fixture.nativeElement
            .textContent
        ).toContain(
          'Accede a tus deportistas'
        );

        component.requestAccess();

        expect(
          component.message()
        ).toContain(
          'entrenador'
        );
      }
    );


    it(
      'updates the password during recovery and returns to sign-in',
      async () => {
        const recoverySession = {
          access_token:
            'recovery-token'
        };

        authMock.passwordRecoverySession.set(
          recoverySession
        );
        authMock.waitForSession
          .mockResolvedValue(null);
        authMock.waitForPasswordRecoverySession
          .mockResolvedValue(
            recoverySession
          );

        setLoginSearch(
          '?recovery=1'
        );

        const fixture =
          TestBed.createComponent(
            Login
          );

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const component =
          fixture.componentInstance;

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
