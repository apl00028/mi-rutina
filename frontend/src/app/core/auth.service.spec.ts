import {
  TestBed
} from '@angular/core/testing';
import {
  provideHttpClient
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';

import {
  AuthService
} from './auth.service';
import {
  environment
} from '../../environments/environment';


const supabaseMock = vi.hoisted(() => {
  const session = {
    access_token: 'access-token',
    user: {
      id: 'user-123',
      email: 'test@example.com'
    }
  };

  return {
    session,
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithOtp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn()
    },
    createClient: vi.fn()
  };
});


vi.mock(
  '@supabase/supabase-js',
  () => ({
    createClient:
      supabaseMock.createClient
  })
);


describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  const meUrl =
    `${environment.apiUrl}/me`;

  async function expectMeRequest() {
    let lastError: unknown;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise(resolve =>
        setTimeout(resolve, 0)
      );

      try {
        return http.expectOne(meUrl);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  beforeEach(() => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: {
        session:
          supabaseMock.session
      },
      error: null
    });

    supabaseMock.auth.signOut.mockResolvedValue({
      error: null
    });

    supabaseMock.auth.onAuthStateChange
      .mockReturnValue({
        data: {
          subscription: {
            unsubscribe: vi.fn()
          }
        }
      });

    supabaseMock.createClient.mockReturnValue({
      auth: supabaseMock.auth
    });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AuthService
      ]
    });

    service =
      TestBed.inject(AuthService);

    http =
      TestBed.inject(HttpTestingController);
  });


  afterEach(() => {
    http.verify();
    vi.clearAllMocks();
  });


  it('restores the persisted Supabase session and verifies /me', async () => {
    const session =
      await service.waitForSession();

    expect(session?.access_token)
      .toBe('access-token');
    expect(service.user()?.id)
      .toBe('user-123');

    const mePromise =
      service.getMe();

    const request =
      await expectMeRequest();

    expect(
      request.request.headers.get(
        'Authorization'
      )
    ).toBe('Bearer access-token');

    request.flush({
      user_id: 'user-123',
      email: 'test@example.com',
      access_status: 'active',
      plan: 'trial',
      role: 'user',
      expires_at: null,
      onboarding_completed: true
    });

    await expect(mePromise)
      .resolves
      .toMatchObject({
        user_id: 'user-123',
        access_status: 'active'
      });

    expect(service.me()?.user_id)
      .toBe('user-123');
  });


  it('clears local auth state when /me rejects an invalid session', async () => {
    await service.waitForSession();

    const mePromise =
      service.getMe();

    const request =
      await expectMeRequest();

    request.flush(
      {
        detail:
          'Invalid or expired access token'
      },
      {
        status: 401,
        statusText: 'Unauthorized'
      }
    );

    await expect(mePromise)
      .rejects
      .toBeTruthy();

    expect(
      supabaseMock.auth.signOut
    ).toHaveBeenCalledWith({
      scope: 'local'
    });
    expect(service.session()).toBeNull();
    expect(service.user()).toBeNull();
    expect(service.me()).toBeNull();
  });
});
