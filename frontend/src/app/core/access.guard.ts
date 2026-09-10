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

import {
  protectedRouteRedirect
} from './access-routing';


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

    const redirect =
      protectedRouteRedirect(
        me,
        state.url
      );

    return redirect
      ? router.createUrlTree([redirect])
      : true;

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
