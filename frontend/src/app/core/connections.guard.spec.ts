import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { connectionsGuard } from './connections.guard';
import { routes } from '../app.routes';
import { accessGuard } from './access.guard';

describe('Athlete connections navigation', () => {
  it.each(['user', 'trainer', 'admin', 'unknown'])('guards role %s after resolving access', async role => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService,
      useValue: { resolveAccess: vi.fn().mockResolvedValue({ role, access_status: 'active' }) } }] });
    const result = await TestBed.runInInjectionContext(() => connectionsGuard({} as never, {} as never));
    if (role === 'user' || role === 'admin' || role === 'trainer') expect(result).toBe(true);
    else expect(TestBed.inject(Router).serializeUrl(result as any)).toBe('/');
  });
  it('registers the athlete page with both access and role guards', async () => {
    const route = routes.find(route => route.path === 'ajustes/conexiones')!;
    expect(routes.find(route => route.path === 'entrenadores')?.redirectTo).toBe('ajustes/conexiones');
    expect(route.canActivate).toEqual([accessGuard, connectionsGuard]);
    expect(await (route.loadComponent as () => Promise<unknown>)()).toBeTruthy();
  });
});
