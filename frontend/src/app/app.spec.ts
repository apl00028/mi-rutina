import {
  signal,
  WritableSignal
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  Router
} from '@angular/router';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { App } from './app';
import {
  AuthService
} from './core/auth.service';

describe('App', () => {
  let authUser:
    WritableSignal<any>;

  let signOut:
    ReturnType<typeof vi.fn>;


  beforeEach(async () => {
    authUser =
      signal(null);

    signOut =
      vi.fn()
        .mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: authUser,
            waitForSession:
              vi.fn()
                .mockResolvedValue(null),
            getMe:
              vi.fn()
                .mockResolvedValue(null),
            signOut
          }
        }
      ]
    }).compileComponents();
  });


  afterEach(() => {
    vi.restoreAllMocks();
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

  it('should render the user button with readable account identity', () => {
    authUser.set({
      email:
        'adrian@example.com',
      user_metadata: {
        full_name:
          'Adrián Peláez'
      }
    });

    const fixture =
      TestBed.createComponent(App);

    fixture.detectChanges();

    const button =
      fixture.nativeElement.querySelector(
        '.user-button'
      ) as HTMLButtonElement;

    expect(button).toBeTruthy();
    expect(button.textContent).toContain('AP');
    expect(button.textContent).toContain('Adrián Peláez');
    expect(button.textContent).toContain('Mi cuenta');
  });

  it('should open the user dropdown with name and email', () => {
    authUser.set({
      email:
        'adrian@example.com',
      user_metadata: {
        full_name:
          'Adrián Peláez'
      }
    });

    const fixture =
      TestBed.createComponent(App);

    fixture.detectChanges();

    const button =
      fixture.nativeElement.querySelector(
        '.user-button'
      ) as HTMLButtonElement;

    button.click();
    fixture.detectChanges();

    const dropdown =
      fixture.nativeElement.querySelector(
        '.user-dropdown'
      ) as HTMLElement;

    expect(dropdown).toBeTruthy();
    expect(dropdown.textContent).toContain('Adrián Peláez');
    expect(dropdown.textContent).toContain('adrian@example.com');
    expect(dropdown.textContent).toContain('Mi cuenta');
    expect(dropdown.textContent).toContain('Configuración');
    expect(dropdown.textContent).toContain('Cerrar sesión');
  });

  it('should close the user dropdown from keyboard and outside click', () => {
    authUser.set({
      email:
        'adrian@example.com',
      user_metadata: {
        full_name:
          'Adrián Peláez'
      }
    });

    const fixture =
      TestBed.createComponent(App);

    fixture.detectChanges();

    const button =
      fixture.nativeElement.querySelector(
        '.user-button'
      ) as HTMLButtonElement;

    button.click();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '.user-dropdown'
      )
    ).toBeTruthy();

    document.dispatchEvent(
      new KeyboardEvent(
        'keydown',
        {
          key:
            'Escape',
          bubbles:
            true
        }
      )
    );
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '.user-dropdown'
      )
    ).toBeNull();

    button.click();
    fixture.detectChanges();

    document.body.dispatchEvent(
      new MouseEvent(
        'click',
        {
          bubbles:
            true
        }
      )
    );
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '.user-dropdown'
      )
    ).toBeNull();
  });

  it('should call the existing sign out flow from the dropdown', async () => {
    authUser.set({
      email:
        'adrian@example.com',
      user_metadata: {
        full_name:
          'Adrián Peláez'
      }
    });

    const fixture =
      TestBed.createComponent(App);

    const router =
      TestBed.inject(Router);

    vi.spyOn(
      router,
      'navigateByUrl'
    ).mockResolvedValue(true);

    fixture.detectChanges();

    const button =
      fixture.nativeElement.querySelector(
        '.user-button'
      ) as HTMLButtonElement;

    button.click();
    fixture.detectChanges();

    const signOutButton =
      fixture.nativeElement.querySelector(
        '.signout-button'
      ) as HTMLButtonElement;

    signOutButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    expect(
      fixture.nativeElement.querySelector(
        '.user-dropdown'
      )
    ).toBeNull();
  });
});
