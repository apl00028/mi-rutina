import {
  Component,
  HostListener,
  signal
} from '@angular/core';

import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';

import {
  filter
} from 'rxjs';

import {
  AuthService,
  GymOSMe
} from './core/auth.service';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {

  sidebarExpanded = signal(
    localStorage.getItem(
      'gymos-sidebar-expanded'
    ) !== 'false'
  );

  userMenuOpen =
    signal(false);

  isStandalonePage =
    signal(false);

  gymosMe =
    signal<GymOSMe | null>(null);


  constructor(
    public auth: AuthService,
    private router: Router
  ) {
    this.syncRouteState();

    void this.loadGymOSUser();

    this.router.events
      .pipe(
        filter(
          event =>
            event instanceof
            NavigationEnd
        )
      )
      .subscribe(() => {
        this.syncRouteState();

        void this.loadGymOSUser();
      });
  }


  private syncRouteState(): void {
    const path =
      this.router.url
        .split('?')[0]
        .split('#')[0];

    this.isStandalonePage.set(
      path === '/login' ||
      path === '/access-pending' ||
      path === '/onboarding'
    );

    if (
      this.isStandalonePage()
    ) {
      this.userMenuOpen.set(false);
    }
  }


  private async loadGymOSUser():
    Promise<void> {

    const session =
      await this.auth.waitForSession();

    if (!session) {
      this.gymosMe.set(null);
      return;
    }

    try {
      const me =
        await this.auth.getMe();

      this.gymosMe.set(me);

    } catch {
      this.gymosMe.set(null);
    }
  }


  isAdmin(): boolean {
    const me =
      this.gymosMe();

    return (
      me?.access_status === 'active' &&
      me?.role === 'admin'
    );
  }


  toggleSidebar(): void {
    const next =
      !this.sidebarExpanded();

    this.sidebarExpanded.set(next);

    localStorage.setItem(
      'gymos-sidebar-expanded',
      String(next)
    );
  }


  toggleUserMenu(): void {
    this.userMenuOpen.update(
      current => !current
    );
  }


  @HostListener(
    'document:click',
    ['$event']
  )
  closeUserMenuOnOutsideClick(
    event: MouseEvent
  ): void {
    const target =
      event.target as Element | null;

    if (
      !this.userMenuOpen() ||
      (
        target instanceof Element &&
        target.closest('.user-menu-wrapper')
      )
    ) {
      return;
    }

    this.closeUserMenu();
  }


  @HostListener(
    'document:keydown.escape'
  )
  closeUserMenuOnEscape(): void {
    this.closeUserMenu();
  }


  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }


  async signOut(): Promise<void> {
    await this.auth.signOut();

    this.gymosMe.set(null);
    this.userMenuOpen.set(false);

    await this.router.navigateByUrl(
      '/login'
    );
  }


  userDisplayName(): string {
    const user =
      this.auth.user();

    if (!user) {
      return 'Usuario';
    }

    return (
      user.user_metadata?.[
        'full_name'
      ] ??
      user.user_metadata?.[
        'name'
      ] ??
      user.user_metadata?.[
        'display_name'
      ] ??
      user.email?.split('@')[0] ??
      'Usuario'
    );
  }


  userInitial(): string {
    const parts =
      this.userDisplayName()
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) {
      return 'U';
    }

    return parts
      .slice(0, 2)
      .map(part =>
        part.charAt(0)
      )
      .join('')
      .toUpperCase();
  }
}
