import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// accessGuard handles session, access and onboarding; guards may run concurrently.
export const athleteConnectionsGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    const me = await auth.resolveAccess();
    return me.access_status === 'active' && me.role === 'user' ? true : router.createUrlTree(['/']);
  } catch { return router.createUrlTree(['/']); }
};
