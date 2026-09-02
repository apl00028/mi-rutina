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
  vi
} from 'vitest';

import {
  AuthService
} from './auth.service';

import {
  trainerGuard
} from './trainer.guard';


describe(
  'trainerGuard',
  () => {
    let waitForSession:
      ReturnType<typeof vi.fn>;
    let getMe:
      ReturnType<typeof vi.fn>;
    let session:
      ReturnType<typeof signal>;


    beforeEach(() => {
      waitForSession =
        vi.fn()
          .mockResolvedValue({
            access_token:
              'access-token'
          });

      getMe =
        vi.fn()
          .mockResolvedValue({
            access_status:
              'active',
            role:
              'trainer'
          });

      session =
        signal({
          access_token:
            'access-token'
        });

      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          {
            provide: AuthService,
            useValue: {
              waitForSession,
              getMe,
              session,
              isAuthFailure:
                vi.fn()
                  .mockReturnValue(false)
            }
          }
        ]
      });
    });


    async function runGuard() {
      return await TestBed
        .runInInjectionContext(
          () => trainerGuard(
            {} as never,
            {} as never
          )
        );
    }


    function guardPath(
      result: unknown
    ): string {
      const router =
        TestBed.inject(Router);

      return router.serializeUrl(
        result as ReturnType<
          Router['createUrlTree']
        >
      );
    }


    it(
      'allows active trainers',
      async () => {
        await expect(
          runGuard()
        ).resolves.toBe(true);
      }
    );


    it(
      'blocks normal users',
      async () => {
        getMe.mockResolvedValue({
          access_status:
            'active',
          role:
            'user'
        });

        const result =
          await runGuard();

        expect(
          guardPath(result)
        ).toBe('/');
      }
    );


    it(
      'blocks admins',
      async () => {
        getMe.mockResolvedValue({
          access_status:
            'active',
          role:
            'admin'
        });

        const result =
          await runGuard();

        expect(
          guardPath(result)
        ).toBe('/');
      }
    );


    it(
      'sends unauthenticated users to login',
      async () => {
        waitForSession
          .mockResolvedValue(null);

        const result =
          await runGuard();

        expect(
          guardPath(result)
        ).toBe('/login');
      }
    );


    it(
      'keeps inactive accounts on access pending',
      async () => {
        getMe.mockResolvedValue({
          access_status:
            'pending',
          role:
            'trainer'
        });

        const result =
          await runGuard();

        expect(
          guardPath(result)
        ).toBe('/access-pending');
      }
    );
  }
);
