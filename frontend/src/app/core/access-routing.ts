import type {
  AptusMe
} from './auth.service';


export type AptusEntryRoute =
  | '/'
  | '/access-pending'
  | '/onboarding'
  | '/trainer';


export function aptusEntryRoute(
  me: AptusMe
): AptusEntryRoute {
  if (me.access_status !== 'active') {
    return '/access-pending';
  }

  switch (me.role) {
    case 'trainer':
      return '/trainer';

    case 'user':
    case 'admin':
      return me.onboarding_completed
        ? '/'
        : '/onboarding';

    default:
      return '/access-pending';
  }
}


export function protectedRouteRedirect(
  me: AptusMe,
  requestedUrl: string
): AptusEntryRoute | null {
  const entryRoute = aptusEntryRoute(me);

  if (entryRoute === '/access-pending') {
    return entryRoute;
  }

  const path =
    requestedUrl
      .split('?')[0]
      .split('#')[0] || '/';

  if (me.role === 'trainer') {
    return path === '/' ||
      path.startsWith('/onboarding')
        ? '/trainer'
        : null;
  }

  if (entryRoute === '/onboarding') {
    return path.startsWith('/onboarding')
      ? null
      : '/onboarding';
  }

  return path.startsWith('/onboarding')
    ? '/'
    : null;
}


export function hasActiveRole(
  me: AptusMe,
  role: 'admin' | 'trainer'
): boolean {
  return (
    me.access_status === 'active' &&
    me.role === role
  );
}
