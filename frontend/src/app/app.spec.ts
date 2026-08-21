import {
  Component,
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

@Component({
  standalone: true,
  template: 'Pantalla de login'
})
class LoginStub {}

describe('App', () => {
  let authUser:
    WritableSignal<any>;

  let signOut:
    ReturnType<typeof vi.fn>;
  let waitForSession:
    ReturnType<typeof vi.fn>;
  let getMe:
    ReturnType<typeof vi.fn>;


  beforeEach(async () => {
    authUser =
      signal(null);

    signOut =
      vi.fn()
        .mockResolvedValue(undefined);
    waitForSession =
      vi.fn()
        .mockResolvedValue(null);
    getMe =
      vi.fn()
        .mockResolvedValue(null);

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          {
            path:
              'login',
            component:
              LoginStub
          }
        ]),
        {
          provide: AuthService,
          useValue: {
            user: authUser,
            waitForSession:
              waitForSession,
            getMe,
            signOut
          }
        }
      ]
    }).compileComponents();
  });


  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });


  function deferred<T>() {
    let resolve:
      (value: T) => void =
        () => {};
    let reject:
      (reason?: unknown) => void =
        () => {};
    const promise =
      new Promise<T>(
        (promiseResolve, promiseReject) => {
          resolve = promiseResolve;
          reject = promiseReject;
        }
      );

    return {
      promise,
      resolve,
      reject
    };
  }


  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
  }


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

  it('shows global initialization while protected shell waits', () => {
    const pending =
      deferred<null>();

    waitForSession.mockReturnValue(
      pending.promise
    );

    const fixture =
      TestBed.createComponent(App);

    fixture.detectChanges();

    const text =
      fixture.nativeElement.textContent;

    expect(text).toContain(
      'Conectando con GymOS…'
    );
    expect(text).not.toContain(
      'El servidor puede tardar'
    );
  });

  it('shows protected content once initialization is ready', async () => {
    const fixture =
      TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();
    await flushPromises();
    fixture.detectChanges();

    const text =
      fixture.nativeElement.textContent;

    expect(text).toContain('GymOS');
    expect(text).toContain('Inicio');
    expect(text).not.toContain(
      'Conectando con GymOS…'
    );
  });

  it('shows retry after initialization timeout', () => {
    vi.useFakeTimers();

    const pending =
      deferred<null>();

    waitForSession.mockReturnValue(
      pending.promise
    );

    const fixture =
      TestBed.createComponent(App);

    fixture.detectChanges();

    vi.advanceTimersByTime(60000);
    fixture.detectChanges();

    const text =
      fixture.nativeElement.textContent;

    expect(text).toContain(
      'No se pudo conectar con GymOS'
    );
    expect(text).toContain('Reintentar');
  });

  it('retry starts initialization again', () => {
    vi.useFakeTimers();

    const first =
      deferred<null>();
    const second =
      deferred<null>();

    waitForSession
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const fixture =
      TestBed.createComponent(App);

    fixture.detectChanges();

    vi.advanceTimersByTime(60000);
    fixture.detectChanges();

    const retry =
      fixture.nativeElement.querySelector(
        '.global-init-retry'
      ) as HTMLButtonElement;

    retry.click();
    fixture.detectChanges();

    expect(waitForSession)
      .toHaveBeenCalledTimes(2);
    expect(
      fixture.nativeElement.textContent
    ).toContain('Conectando con GymOS…');
    expect(
      fixture.nativeElement.textContent
    ).not.toContain(
      'No se pudo conectar con GymOS'
    );
  });

  it('shows server wake message only after delay', () => {
    vi.useFakeTimers();

    const pending =
      deferred<null>();

    waitForSession.mockReturnValue(
      pending.promise
    );

    const fixture =
      TestBed.createComponent(App);

    fixture.detectChanges();

    vi.advanceTimersByTime(2999);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.textContent
    ).not.toContain(
      'El servidor puede tardar unos segundos en arrancar.'
    );

    vi.advanceTimersByTime(1);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.textContent
    ).toContain(
      'El servidor puede tardar unos segundos en arrancar.'
    );
  });

  it('does not block login with global initialization', async () => {
    const pending =
      deferred<null>();

    waitForSession.mockReturnValue(
      pending.promise
    );

    const router =
      TestBed.inject(Router);

    await router.navigateByUrl('/login');

    const fixture =
      TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text =
      fixture.nativeElement.textContent;

    expect(text).toContain(
      'Pantalla de login'
    );
    expect(text).not.toContain(
      'Conectando con GymOS…'
    );
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
