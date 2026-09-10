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
  accessGuard
} from './access.guard';

import {
  AuthService,
  AptusMe
} from './auth.service';


describe('accessGuard', () => {
  const session = signal<unknown>({
    access_token: 'access-token'
  });

  const waitForSession = vi.fn();
  const resolveAccess = vi.fn();
  const isAuthFailure = vi.fn();

  const me = (
    patch: Partial<AptusMe>
  ): AptusMe => ({
    user_id: 'user-1',
    email: 'user@example.com',
    access_status: 'active',
    plan: 'trial',
    role: 'user',
    expires_at: null,
    onboarding_completed: true,
    ...patch
  });

  beforeEach(() => {
    vi.clearAllMocks();
    session.set({ access_token: 'access-token' });
    waitForSession.mockResolvedValue(session());
    resolveAccess.mockResolvedValue(me({}));
    isAuthFailure.mockReturnValue(false);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            waitForSession,
            resolveAccess,
            session,
            isAuthFailure
          }
        }
      ]
    });
  });

  async function run(url: string) {
    return await TestBed.runInInjectionContext(
      () => accessGuard(
        {} as never,
        { url } as never
      )
    );
  }

  function path(result: unknown): string {
    return TestBed.inject(Router).serializeUrl(
      result as ReturnType<Router['createUrlTree']>
    );
  }

  it('sends inactive access to the pending page', async () => {
    resolveAccess.mockResolvedValue(me({
      access_status: 'pending'
    }));

    expect(path(await run('/')))
      .toBe('/access-pending');
  });

  it('applies onboarding only to an incomplete user', async () => {
    resolveAccess.mockResolvedValue(me({
      onboarding_completed: false
    }));

    expect(path(await run('/')))
      .toBe('/onboarding');
    await expect(run('/onboarding'))
      .resolves.toBe(true);
  });

  it('keeps a complete user out of onboarding', async () => {
    await expect(run('/')).resolves.toBe(true);
    expect(path(await run('/onboarding')))
      .toBe('/');
  });

  it.each([false, true])(
    'redirects a trainer with onboarding=%s from onboarding to trainer',
    async onboardingCompleted => {
      resolveAccess.mockResolvedValue(me({
        role: 'trainer',
        onboarding_completed: onboardingCompleted
      }));

      expect(path(await run('/onboarding')))
        .toBe('/trainer');
    }
  );

  it('preserves admin onboarding behavior', async () => {
    resolveAccess.mockResolvedValue(me({
      role: 'admin',
      onboarding_completed: false
    }));
    expect(path(await run('/')))
      .toBe('/onboarding');

    resolveAccess.mockResolvedValue(me({
      role: 'admin',
      onboarding_completed: true
    }));
    await expect(run('/')).resolves.toBe(true);
  });

  it('keeps unauthenticated and failed access checks safe', async () => {
    waitForSession.mockResolvedValue(null);
    expect(path(await run('/'))).toBe('/login');

    waitForSession.mockResolvedValue({
      access_token: 'access-token'
    });
    resolveAccess.mockRejectedValue(
      new Error('unavailable')
    );
    expect(path(await run('/')))
      .toBe('/access-pending');

    session.set(null);
    expect(path(await run('/'))).toBe('/login');
  });
});
