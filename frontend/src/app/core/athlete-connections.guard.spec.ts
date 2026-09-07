import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { athleteConnectionsGuard } from './athlete-connections.guard';
import { routes } from '../app.routes';
import { accessGuard } from './access.guard';

describe('Athlete connections navigation', () => {
  it.each(['user', 'trainer', 'admin'])('guards role %s after resolving access', async role => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService,
      useValue: { resolveAccess: vi.fn().mockResolvedValue({ role, access_status: 'active' }) } }] });
    const result = await TestBed.runInInjectionContext(() => athleteConnectionsGuard({} as never, {} as never));
    if (role === 'user') expect(result).toBe(true);
    else expect(TestBed.inject(Router).serializeUrl(result as any)).toBe('/');
  });
  it('registers the athlete page with both access and role guards', async () => {
    const route = routes.find(route => route.path === 'entrenadores')!;
    expect(route.canActivate).toEqual([accessGuard, athleteConnectionsGuard]);
    expect(await (route.loadComponent as () => Promise<unknown>)()).toBeTruthy();
  });
});
