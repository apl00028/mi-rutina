import {
  Component,
  signal
} from '@angular/core';

import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';

import { filter } from 'rxjs';

import { AuthService } from './core/auth.service';

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

  userMenuOpen = signal(false);

  isLoginPage = signal(false);

  constructor(
    public auth: AuthService,
    private router: Router
  ) {
    this.syncRouteState();

    this.router.events
      .pipe(
        filter(
          event => event instanceof NavigationEnd
        )
      )
      .subscribe(() => {
        this.syncRouteState();
      });
  }

  private syncRouteState(): void {
    const url = this.router.url;

    this.isLoginPage.set(
      url === '/login' ||
      url.startsWith('/login?') ||
      url.startsWith('/login#')
    );

    if (this.isLoginPage()) {
      this.userMenuOpen.set(false);
    }
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

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();

    this.userMenuOpen.set(false);

    await this.router.navigateByUrl(
      '/login'
    );
  }

  userDisplayName(): string {
    const user = this.auth.user();

    if (!user) {
      return 'Usuario';
    }

    return (
      user.user_metadata?.['full_name'] ??
      user.user_metadata?.['name'] ??
      user.user_metadata?.['display_name'] ??
      user.email?.split('@')[0] ??
      'Usuario'
    );
  }

  userInitial(): string {
    return this.userDisplayName()
      .charAt(0)
      .toUpperCase();
  }
}