import {
  signal
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter
} from '@angular/router';

import { App } from './app';
import {
  AuthService
} from './core/auth.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: signal(null),
            waitForSession:
              async () => null,
            getMe:
              async () => null,
            signOut:
              async () => undefined
          }
        }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the GymOS shell', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('GymOS');
    expect(compiled.textContent).toContain('Inicio');
  });
});
