import { Component, signal } from '@angular/core';
import {
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';

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
    localStorage.getItem('gymos-sidebar-expanded') !== 'false'
  );

  toggleSidebar(): void {
    const next = !this.sidebarExpanded();

    this.sidebarExpanded.set(next);

    localStorage.setItem(
      'gymos-sidebar-expanded',
      String(next)
    );
  }
}