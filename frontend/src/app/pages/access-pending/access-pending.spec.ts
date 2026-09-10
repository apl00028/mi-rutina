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
  AuthService,
  AptusMe
} from '../../core/auth.service';

import {
  LanguageService
} from '../../core/language.service';

import {
  AccessPending
} from './access-pending';


describe('AccessPending', () => {
  const resolveAccess = vi.fn();
  const navigateByUrl = vi.fn();

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
    resolveAccess.mockResolvedValue(me({}));
    navigateByUrl.mockResolvedValue(true);

    TestBed.configureTestingModule({
      imports: [AccessPending],
      providers: [
        {
          provide: AuthService,
          useValue: {
            resolveAccess,
            user: signal(null),
            signOut: vi.fn()
          }
        },
        {
          provide: Router,
          useValue: { navigateByUrl }
        },
        {
          provide: LanguageService,
          useValue: {
            language: signal<'es' | 'en'>('es'),
            setLanguage: vi.fn()
          }
        }
      ]
    });
  });

  it.each([
    ['incomplete user', {
      onboarding_completed: false
    }, '/onboarding'],
    ['complete user', {}, '/'],
    ['incomplete trainer', {
      role: 'trainer',
      onboarding_completed: false
    }, '/trainer'],
    ['complete trainer', {
      role: 'trainer'
    }, '/trainer'],
    ['incomplete admin', {
      role: 'admin',
      onboarding_completed: false
    }, '/onboarding'],
    ['complete admin', {
      role: 'admin'
    }, '/']
  ] as const)(
    'routes an active %s to %s',
    async (_label, patch, expected) => {
      resolveAccess.mockResolvedValue(me(patch));

      const fixture =
        TestBed.createComponent(AccessPending);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(navigateByUrl)
        .toHaveBeenCalledWith(expected);
    }
  );

  it('keeps pending access on the page', async () => {
    resolveAccess.mockResolvedValue(me({
      access_status: 'pending'
    }));

    const fixture =
      TestBed.createComponent(AccessPending);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('keeps access errors on the page', async () => {
    resolveAccess.mockRejectedValue(
      new Error('unavailable')
    );

    const fixture =
      TestBed.createComponent(AccessPending);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error())
      .toBe('unavailable');
  });
});
