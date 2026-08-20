import {
  inject
} from '@angular/core';

import {
  CanActivateFn,
  Router
} from '@angular/router';

import {
  AuthService
} from './auth.service';


export const accessGuard:
  CanActivateFn = async (
    _route,
    state
  ) => {

  const auth =
    inject(AuthService);

  const router =
    inject(Router);

  const session =
    await auth.waitForSession();

  if (!session) {
    return router.createUrlTree(
      ['/login']
    );
  }

  try {
    const me =
      await auth.resolveAccess();

    if (
      me.access_status !== 'active'
    ) {
      return router.createUrlTree(
        ['/access-pending']
      );
    }

    const goingToOnboarding =
      state.url.startsWith(
        '/onboarding'
      );

    if (
      !me.onboarding_completed
    ) {
      if (goingToOnboarding) {
        return true;
      }

      return router.createUrlTree(
        ['/onboarding']
      );
    }

    if (goingToOnboarding) {
      return router.createUrlTree(
        ['/']
      );
    }

    return true;

  } catch (error) {
    if (
      auth.isAuthFailure(error) ||
      !auth.session()
    ) {
      return router.createUrlTree(
        ['/login']
      );
    }

    return router.createUrlTree(
      ['/access-pending']
    );
  }
};
