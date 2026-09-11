import {
  describe,
  expect,
  it
} from 'vitest';

import type {
  AptusMe
} from './auth.service';

import {
  aptusEntryRoute,
  protectedRouteRedirect
} from './access-routing';


const me = (
  patch: Partial<AptusMe>
): AptusMe => ({
  user_id: 'user-1',
  email: 'user@example.com',
  access_status: 'active',
  plan: 'free',
  role: 'user',
  expires_at: null,
  onboarding_completed: true,
  ...patch
});


describe('Aptus access routing', () => {
  it.each([
    ['pending user', {
      access_status: 'pending'
    }, '/access-pending'],
    ['incomplete athlete', {
      onboarding_completed: false
    }, '/onboarding'],
    ['complete athlete', {}, '/'],
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
    'routes %s to %s',
    (_label, patch, expected) => {
      expect(
        aptusEntryRoute(me(patch))
      ).toBe(expected);
    }
  );

  it('does not treat an unknown active role as an athlete', () => {
    expect(
      aptusEntryRoute(me({ role: 'unknown' }))
    ).toBe('/access-pending');
  });

  it('redirects a trainer away from root and onboarding but permits other protected routes', () => {
    const trainer = me({
      role: 'trainer',
      onboarding_completed: false
    });

    expect(
      protectedRouteRedirect(
        trainer,
        '/onboarding?source=manual'
      )
    ).toBe('/trainer');
    expect(
      protectedRouteRedirect(trainer, '/')
    ).toBe('/trainer');
    expect(
      protectedRouteRedirect(
        trainer,
        '/ajustes'
      )
    ).toBeNull();
  });
});
