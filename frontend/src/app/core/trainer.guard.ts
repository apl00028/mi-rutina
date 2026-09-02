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


export const trainerGuard:
  CanActivateFn = async () => {

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
      await auth.getMe();

    if (
      me.access_status === 'active' &&
      me.role === 'trainer'
    ) {
      return true;
    }

    if (
      me.access_status !== 'active'
    ) {
      return router.createUrlTree(
        ['/access-pending']
      );
    }

    return router.createUrlTree(['/']);

  } catch (error) {
    if (
      auth.isAuthFailure(error) ||
      !auth.session()
    ) {
      return router.createUrlTree(
        ['/login']
      );
    }

    return router.createUrlTree(['/']);
  }
};
