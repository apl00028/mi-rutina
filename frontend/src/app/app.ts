import {
  Component,
  HostListener,
  OnDestroy,
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
import {
  SettingsService
} from './core/settings.service';

type AppInitializationState =
  | 'initializing'
  | 'ready'
  | 'error';


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
export class App implements OnDestroy {

  sidebarExpanded = signal(
    localStorage.getItem(
      'gymos-sidebar-expanded'
    ) !== 'false'
  );

  userMenuOpen =
    signal(false);

  mobileNavOpen =
    signal(false);

  isStandalonePage =
    signal(false);

  isTrainingRoute =
    signal(false);

  gymosMe =
    signal<GymOSMe | null>(null);

  initializationState =
    signal<AppInitializationState>(
      'initializing'
    );

  showServerWakeMessage =
    signal(false);

  private initializationAttempt = 0;
  private wakeMessageTimer:
    ReturnType<typeof setTimeout> | null = null;
  private initializationTimeoutTimer:
    ReturnType<typeof setTimeout> | null = null;

  private readonly wakeMessageDelayMs = 3000;
  private readonly initializationTimeoutMs = 60000;


  constructor(
    public auth: AuthService,
    private router: Router,
    private settingsService:
      SettingsService
  ) {
    this.syncRouteState();

    this.startInitialization();

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

        this.startInitialization();
      });
  }


  ngOnDestroy(): void {
    this.clearInitializationTimers();
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

    this.isTrainingRoute.set(
      path === '/entrenar'
    );

    if (
      this.isStandalonePage()
    ) {
      this.userMenuOpen.set(false);
      this.mobileNavOpen.set(false);
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


  private startInitialization(): void {
    const attempt =
      ++this.initializationAttempt;

    this.clearInitializationTimers();
    this.showServerWakeMessage.set(false);

    if (this.isStandalonePage()) {
      this.initializationState.set('ready');
      return;
    }

    this.initializationState.set(
      'initializing'
    );

    this.wakeMessageTimer =
      setTimeout(() => {
        if (
          this.initializationAttempt ===
          attempt &&
          this.initializationState() ===
          'initializing'
        ) {
          this.showServerWakeMessage.set(true);
        }
      }, this.wakeMessageDelayMs);

    this.initializationTimeoutTimer =
      setTimeout(() => {
        if (
          this.initializationAttempt ===
          attempt &&
          this.initializationState() ===
          'initializing'
        ) {
          this.initializationState.set('error');
        }
      }, this.initializationTimeoutMs);

    void this.initializeProtectedShell(
      attempt
    );
  }


  private async initializeProtectedShell(
    attempt: number
  ): Promise<void> {
    try {
      await this.loadGymOSUser();

      if (
        this.initializationAttempt !==
        attempt
      ) {
        return;
      }

      this.initializationState.set('ready');
      this.showServerWakeMessage.set(false);
      this.clearInitializationTimers();
    } catch {
      if (
        this.initializationAttempt ===
        attempt &&
        this.initializationState() ===
        'initializing'
      ) {
        this.showServerWakeMessage.set(true);
      }
    }
  }


  retryInitialization(): void {
    this.startInitialization();
  }


  private clearInitializationTimers(): void {
    if (this.wakeMessageTimer) {
      clearTimeout(this.wakeMessageTimer);
      this.wakeMessageTimer = null;
    }

    if (this.initializationTimeoutTimer) {
      clearTimeout(
        this.initializationTimeoutTimer
      );
      this.initializationTimeoutTimer = null;
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


  isCurrentRoute(
    route: string
  ): boolean {
    const path =
      this.router.url
        .split('?')[0]
        .split('#')[0];

    if (route === '/') {
      return path === '/';
    }

    return (
      path === route ||
      path.startsWith(`${route}/`)
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
    this.mobileNavOpen.set(false);

    this.userMenuOpen.update(
      current => !current
    );
  }


  toggleMobileNav(): void {
    this.userMenuOpen.set(false);

    this.mobileNavOpen.update(
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

    if (this.userMenuOpen()) {
      if (
        target instanceof Element &&
        target.closest('.user-menu-wrapper')
      ) {
        return;
      }

      this.closeUserMenu();
    }

    if (this.mobileNavOpen()) {
      if (
        target instanceof Element &&
        target.closest('.mobile-nav-wrapper')
      ) {
        return;
      }

      this.closeMobileNav();
    }
  }


  @HostListener(
    'document:keydown.escape'
  )
  closeUserMenuOnEscape(): void {
    this.closeUserMenu();
    this.closeMobileNav();
  }


  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }


  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }


  async signOut(): Promise<void> {
    await this.auth.signOut();

    this.gymosMe.set(null);
    this.userMenuOpen.set(false);
    this.mobileNavOpen.set(false);

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
