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
  Capacitor
} from '@capacitor/core';

import {
  LucideApple,
  LucideChevronDown,
  LucideDumbbell,
  LucideHeartPulse,
  LucideHouse,
  LucidePanelLeftClose,
  LucidePanelLeftOpen,
  LucideSettings,
  LucideShieldCheck
} from '@lucide/angular';

import {
  AuthService,
  AptusMe
} from './core/auth.service';
import {
  SettingsService
} from './core/settings.service';
import {
  WorkoutSessionStateService
} from './core/workout-session-state.service';
import {
  TelemetryService
} from './core/telemetry.service';

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
    RouterLinkActive,
    LucideApple,
    LucideChevronDown,
    LucideDumbbell,
    LucideHeartPulse,
    LucideHouse,
    LucidePanelLeftClose,
    LucidePanelLeftOpen,
    LucideSettings,
    LucideShieldCheck
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnDestroy {

  sidebarExpanded = signal(
    (() => {
      const current =
        localStorage.getItem(
          'aptus-sidebar-expanded'
        );

      const legacy =
        localStorage.getItem(
          'gymos-sidebar-expanded'
        );

      const stored =
        current ?? legacy;

      if (
        current === null &&
        legacy !== null
      ) {
        localStorage.setItem(
          'aptus-sidebar-expanded',
          legacy
        );
      }

      return stored !== 'false';
    })()
  );

  userMenuOpen =
    signal(false);

  mobileNavOpen =
    signal(false);

  isStandalonePage =
    signal(false);

  aptusMe =
    signal<AptusMe | null>(null);

  initializationState =
    signal<AppInitializationState>(
      'initializing'
    );

  showServerWakeMessage =
    signal(false);

  private initializationAttempt = 0;
  private protectedShellInitializationStarted =
    false;
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
      SettingsService,
    public workoutSessionState:
      WorkoutSessionStateService,
    private telemetry:
      TelemetryService
  ) {
    this.syncRouteState();

    if (this.isStandalonePage()) {
      this.initializationState.set(
        'ready'
      );
    } else {
      this.startInitialization();
    }

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

        void this.telemetry.pageView(
          this.router.url
        );

        if (
          !this.isStandalonePage() &&
          !this.protectedShellInitializationStarted
        ) {
          this.startInitialization();
        }
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

    if (
      this.isStandalonePage()
    ) {
      this.userMenuOpen.set(false);
      this.mobileNavOpen.set(false);
    }
  }


  private async loadAptusUser():
    Promise<void> {

    const sessionStartedAt =
      performance.now();

    const session =
      await this.auth.waitForSession();

    this.logStartup(
      'Supabase session',
      sessionStartedAt
    );

    if (!session) {
      this.aptusMe.set(null);
      return;
    }

    const meStartedAt =
      performance.now();

    try {
      const me =
        await this.auth.getMe();

      this.aptusMe.set(me);

      this.logStartup(
        '/api/v1/me',
        meStartedAt
      );

    } catch {
      this.aptusMe.set(null);

      this.logStartup(
        '/api/v1/me FAILED',
        meStartedAt
      );
    }
  }


  private logStartup(
    phase: string,
    startedAt?: number
  ): void {

    if (
      !Capacitor.isNativePlatform()
    ) {
      return;
    }

    const now =
      performance.now();

    if (
      startedAt === undefined
    ) {
      console.info(
        `[Aptus startup] ${phase}: ` +
        `${Math.round(now)} ms total`
      );

      return;
    }

    console.info(
      `[Aptus startup] ${phase}: ` +
      `${Math.round(now - startedAt)} ms ` +
      `(${Math.round(now)} ms total)`
    );
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

    this.protectedShellInitializationStarted =
      true;

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
      await this.loadAptusUser();

      if (
        this.initializationAttempt !==
        attempt
      ) {
        return;
      }

      this.initializationState.set('ready');
      this.showServerWakeMessage.set(false);
      this.clearInitializationTimers();

      this.logStartup(
        'Protected shell ready'
      );
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
      this.aptusMe();

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
      'aptus-sidebar-expanded',
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

    this.aptusMe.set(null);
    this.protectedShellInitializationStarted =
      false;
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
