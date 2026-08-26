import {
  TestBed
} from '@angular/core/testing';

import {
  provideHttpClient
} from '@angular/common/http';

import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';

import {
  AuthService
} from './auth.service';

import {
  environment
} from '../../environments/environment';


const supabaseMock =
  vi.hoisted(() => {
    const session = {
      access_token: 'access-token',

      user: {
        id: 'user-123',
        email: 'test@example.com'
      }
    };

    return {
      session,

      auth: {
        getSession:
          vi.fn(),

        onAuthStateChange:
          vi.fn(),

        signInWithOtp:
          vi.fn(),

        signInWithOAuth:
          vi.fn(),

        registerPasskey:
          vi.fn(),

        signInWithPasskey:
          vi.fn(),

        passkey: {
          list:
            vi.fn(),

          update:
            vi.fn(),

          delete:
            vi.fn()
        },

        signOut:
          vi.fn()
      },

      createClient:
        vi.fn()
    };
  });


vi.mock(
  '@supabase/supabase-js',
  () => ({
    createClient:
      supabaseMock.createClient
  })
);


describe(
  'AuthService',
  () => {
    let service:
      AuthService;

    let http:
      HttpTestingController;


    const meUrl =
      `${environment.apiUrl}/me`;


    async function expectMeRequest() {
      let lastError:
        unknown;

      for (
        let attempt = 0;
        attempt < 10;
        attempt += 1
      ) {
        await new Promise(resolve =>
          setTimeout(
            resolve,
            0
          )
        );

        try {
          return http.expectOne(
            meUrl
          );
        } catch (error) {
          lastError =
            error;
        }
      }

      throw lastError;
    }


    beforeEach(() => {
      supabaseMock.auth.getSession
        .mockResolvedValue({
          data: {
            session:
              supabaseMock.session
          },

          error:
            null
        });

      supabaseMock.auth.signOut
        .mockResolvedValue({
          error:
            null
        });

      supabaseMock.auth.onAuthStateChange
        .mockReturnValue({
          data: {
            subscription: {
              unsubscribe:
                vi.fn()
            }
          }
        });

      supabaseMock.createClient
        .mockReturnValue({
          auth:
            supabaseMock.auth
        });

      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          AuthService
        ]
      });

      service =
        TestBed.inject(
          AuthService
        );

      http =
        TestBed.inject(
          HttpTestingController
        );
    });


    afterEach(() => {
      http.verify();

      vi.clearAllMocks();
    });


    it(
      'restores the persisted Supabase session and verifies /me',
      async () => {
        const session =
          await service.waitForSession();

        expect(
          session?.access_token
        ).toBe(
          'access-token'
        );

        expect(
          service.user()?.id
        ).toBe(
          'user-123'
        );

        const mePromise =
          service.getMe();

        const request =
          await expectMeRequest();

        expect(
          request.request.headers.get(
            'Authorization'
          )
        ).toBe(
          'Bearer access-token'
        );

        request.flush({
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

        await expect(
          mePromise
        )
          .resolves
          .toMatchObject({
            user_id:
              'user-123',

            access_status:
              'active'
          });

        expect(
          service.me()?.user_id
        ).toBe(
          'user-123'
        );
      }
    );


    it(
      'clears local auth state when /me rejects an invalid session',
      async () => {
        await service.waitForSession();

        const mePromise =
          service.getMe();

        const request =
          await expectMeRequest();

        request.flush(
          {
            detail:
              'Invalid or expired access token'
          },
          {
            status:
              401,

            statusText:
              'Unauthorized'
          }
        );

        await expect(
          mePromise
        )
          .rejects
          .toBeTruthy();

        expect(
          supabaseMock.auth.signOut
        ).toHaveBeenCalledWith({
          scope:
            'local'
        });

        expect(
          service.session()
        ).toBeNull();

        expect(
          service.user()
        ).toBeNull();

        expect(
          service.me()
        ).toBeNull();
      }
    );


    it(
      'shares an in-flight /me request with resolveAccess',
      async () => {
        await service.waitForSession();

        const getMePromise =
          service.getMe();

        const resolveAccessPromise =
          service.resolveAccess();

        const request =
          await expectMeRequest();

        expect(
          request.request.method
        ).toBe(
          'GET'
        );

        request.flush({
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

        const [
          me,
          resolved
        ] = await Promise.all([
          getMePromise,
          resolveAccessPromise
        ]);

        expect(
          me.user_id
        ).toBe(
          'user-123'
        );

        expect(
          resolved.user_id
        ).toBe(
          'user-123'
        );

        http.expectNone(
          meUrl
        );
      }
    );


    it(
      'registers a passkey for the authenticated user',
      async () => {
        vi.spyOn(
          service,
          'isPasskeySupported'
        ).mockReturnValue(
          true
        );

        supabaseMock.auth.registerPasskey
          .mockResolvedValue({
            data: {
              id:
                'passkey-1',

              friendly_name:
                'Google Password Manager',

              created_at:
                '2026-08-21T12:00:00Z'
            },

            error:
              null
          });

        const result =
          await service.registerPasskey();

        expect(
          supabaseMock.auth.registerPasskey
        ).toHaveBeenCalledOnce();

        expect(
          result
        ).toMatchObject({
          id:
            'passkey-1',

          friendly_name:
            'Google Password Manager'
        });
      }
    );


    it(
      'signs in with a passkey and updates the local auth state',
      async () => {
        vi.spyOn(
          service,
          'isPasskeySupported'
        ).mockReturnValue(
          true
        );

        const passkeySession = {
          access_token:
            'passkey-access-token',

          user: {
            id:
              'user-passkey',

            email:
              'passkey@example.com'
          }
        };

        supabaseMock.auth.signInWithPasskey
          .mockResolvedValue({
            data: {
              session:
                passkeySession,

              user:
                passkeySession.user
            },

            error:
              null
          });

        await service.signInWithPasskey();

        expect(
          supabaseMock.auth.signInWithPasskey
        ).toHaveBeenCalledOnce();

        expect(
          service.session()
            ?.access_token
        ).toBe(
          'passkey-access-token'
        );

        expect(
          service.user()
            ?.id
        ).toBe(
          'user-passkey'
        );
      }
    );


    it(
      'deletes the current account and clears local auth state',
      async () => {
        service.session.set(
          supabaseMock.session as any
        );

        service.user.set(
          supabaseMock.session.user as any
        );

        service.me.set({
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

        supabaseMock.auth.signOut
          .mockResolvedValue({
            error:
              null
          });

        const deletion =
          service.deleteAccount();

        const request =
          await expectMeRequest();

        expect(
          request.request.method
        ).toBe(
          'DELETE'
        );

        expect(
          request.request.headers.get(
            'Authorization'
          )
        ).toBe(
          'Bearer access-token'
        );

        request.flush(
          null,
          {
            status:
              204,
            statusText:
              'No Content'
          }
        );

        await deletion;

        expect(
          supabaseMock.auth.signOut
        ).toHaveBeenCalledWith({
          scope:
            'local'
        });

        expect(
          service.session()
        ).toBeNull();

        expect(
          service.user()
        ).toBeNull();

        expect(
          service.me()
        ).toBeNull();
      }
    );



    it(
      'lists and deletes passkeys for the current user',
      async () => {
        supabaseMock.auth.passkey.list
          .mockResolvedValue({
            data: [
              {
                id:
                  'passkey-1',

                friendly_name:
                  'Google Password Manager',

                created_at:
                  '2026-08-21T12:00:00Z',

                last_used_at:
                  null
              }
            ],

            error:
              null
          });

        supabaseMock.auth.passkey.delete
          .mockResolvedValue({
            data:
              null,

            error:
              null
          });

        const passkeys =
          await service.listPasskeys();

        expect(
          passkeys
        ).toHaveLength(
          1
        );

        expect(
          passkeys[0]
        ).toMatchObject({
          id:
            'passkey-1',

          friendly_name:
            'Google Password Manager'
        });

        await service.deletePasskey(
          'passkey-1'
        );

        expect(
          supabaseMock.auth.passkey.delete
        ).toHaveBeenCalledWith({
          passkeyId:
            'passkey-1'
        });
      }
    );
  }
);