import { Injectable, signal } from '@angular/core';

import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders
} from '@angular/common/http';

import {
  firstValueFrom
} from 'rxjs';

import {
  createClient,
  Session,
  SupabaseClient,
  User
} from '@supabase/supabase-js';

import {
  environment
} from '../../environments/environment';

import {
  Capacitor
} from '@capacitor/core';

import {
  App
} from '@capacitor/app';

import {
  Browser
} from '@capacitor/browser';


export interface GymOSMe {
  user_id: string;
  email: string | null;

  access_status:
    | 'unregistered'
    | 'pending'
    | 'active'
    | 'suspended';

  plan: string | null;
  role: string | null;
  expires_at: string | null;

  onboarding_completed: boolean;
}


@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly supabaseUrl =
    'https://rvgzgueoriulirofzlmc.supabase.co';

  private readonly supabaseKey =
    'sb_publishable_rBZ-_xeoTl5Dy18DwV4-GA_dB_89ieS';

  private readonly apiUrl =
    environment.apiUrl;

  private readonly client: SupabaseClient =
    createClient(
      this.supabaseUrl,
      this.supabaseKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',

          experimental: {
            passkey: true
          }
        }
      }
    );


  session =
    signal<Session | null>(null);

  user =
    signal<User | null>(null);

  me =
    signal<GymOSMe | null>(null);

  loading =
    signal(true);


  nativeLoginCompleted =
    signal(0);


  private meRequest:
    Promise<GymOSMe> | null = null;


  private authReadyPromise!:
    Promise<Session | null>;

  private resolveAuthReady:
    (session: Session | null) => void =
      () => {};

  private authReadyResolved =
    false;


  constructor(
    private http: HttpClient
  ) {
    this.authReadyPromise =
      new Promise<Session | null>(
        resolve => {
          this.resolveAuthReady =
            resolve;
        }
      );

    this.initialize();

    void this.initializeNativeAuth();
  }


  private initialize():
    void {

    /*
     * Important:
     * subscribe before any native OAuth/deep-link work.
     *
     * INITIAL_SESSION is Supabase's authoritative
     * signal that persisted auth has been restored.
     */
    this.client.auth.onAuthStateChange(
      (event, session) => {

        this.applySession(
          session
        );

        if (
          event === 'INITIAL_SESSION' ||
          (
            event === 'SIGNED_IN' &&
            !!session
          )
        ) {
          this.finishAuthInitialization(
            session
          );
        }

        if (
          Capacitor.isNativePlatform()
        ) {
          console.info(
            `[GymOS auth] ${event}: ` +
            (
              session
                ? 'session'
                : 'no-session'
            )
          );
        }
      }
    );

    /*
     * Fast path when a persisted session is
     * already immediately available.
     *
     * A null result does NOT mark auth ready:
     * INITIAL_SESSION will confirm that state.
     */
    void this.client.auth
      .getSession()
      .then(
        ({
          data,
          error
        }) => {

          if (error) {
            return;
          }

          if (data.session) {
            this.applySession(
              data.session
            );

            this.finishAuthInitialization(
              data.session
            );
          }
        }
      );
  }


  private applySession(
    session: Session | null
  ): void {

    this.session.set(
      session
    );

    this.user.set(
      session?.user ?? null
    );

    if (!session) {
      this.me.set(null);
      this.meRequest = null;
    }
  }


  private finishAuthInitialization(
    session: Session | null
  ): void {

    if (
      this.authReadyResolved
    ) {
      return;
    }

    this.authReadyResolved =
      true;

    this.loading.set(false);

    this.resolveAuthReady(
      session
    );
  }


  async waitForSession():
    Promise<Session | null> {

    if (
      !this.loading()
    ) {
      return this.session();
    }

    await this.authReadyPromise;

    return this.session();
  }


  private isNativeApp():
    boolean {
    return Capacitor.isNativePlatform();
  }


  private loginRedirect(
    method: 'google' | 'email'
  ): string {
    if (this.isNativeApp()) {
      return (
        'com.adrianpelaez.gymos://login' +
        `?method=${method}`
      );
    }

    return (
      `${window.location.origin}/login` +
      (
        method === 'google'
          ? '?oauth=google'
          : ''
      )
    );
  }


  private async initializeNativeAuth():
    Promise<void> {
    if (!this.isNativeApp()) {
      return;
    }

    await App.addListener(
      'appUrlOpen',
      event => {
        void this.handleNativeAuthUrl(
          event.url
        );
      }
    );

    const launchUrl =
      await App.getLaunchUrl();

    if (launchUrl?.url) {
      await this.handleNativeAuthUrl(
        launchUrl.url
      );
    }
  }


  private async handleNativeAuthUrl(
    url: string
  ): Promise<void> {
    const loginUrl =
      'com.adrianpelaez.gymos://login';

    const recoveryUrl =
      'com.adrianpelaez.gymos://reset-password';

    const isLogin =
      url.startsWith(loginUrl);

    const isRecovery =
      url.startsWith(recoveryUrl);

    if (
      !isLogin &&
      !isRecovery
    ) {
      return;
    }

    try {
      const parsed =
        new URL(url);

      const authError =
        parsed.searchParams.get(
          'error_description'
        ) ??
        parsed.searchParams.get(
          'error'
        );

      if (authError) {
        throw new Error(
          authError
        );
      }

      const code =
        parsed.searchParams.get(
          'code'
        );

      if (code) {
        const {
          error
        } =
          await this.client.auth
            .exchangeCodeForSession(
              code
            );

        if (error) {
          throw error;
        }
      } else {
        const hash =
          new URLSearchParams(
            parsed.hash.replace(
              /^#/,
              ''
            )
          );

        const accessToken =
          hash.get(
            'access_token'
          );

        const refreshToken =
          hash.get(
            'refresh_token'
          );

        if (
          !accessToken ||
          !refreshToken
        ) {
          throw new Error(
            'No se recibieron credenciales de autenticación.'
          );
        }

        const {
          error
        } =
          await this.client.auth.setSession({
            access_token:
              accessToken,
            refresh_token:
              refreshToken
          });

        if (error) {
          throw error;
        }
      }

      if (isRecovery) {
        window.location.replace(
          '/login?recovery=1'
        );

        return;
      }

      /*
       * OAuth nativo ya ha creado la sesión.
       * No recargamos la WebView: avisamos
       * al Login actual para que continúe.
       */
      this.nativeLoginCompleted.update(
        value => value + 1
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo completar la autenticación.';

      sessionStorage.setItem(
        'gymos-native-auth-error',
        message
      );

      window.location.replace(
        isRecovery
          ? '/login?recovery=1'
          : '/login?native=1'
      );
    }
  }


  consumeNativeAuthError():
    string | null {
    const value =
      sessionStorage.getItem(
        'gymos-native-auth-error'
      );

    sessionStorage.removeItem(
      'gymos-native-auth-error'
    );

    return value;
  }


  async signInWithPassword(
    email: string,
    password: string
  ): Promise<void> {
    const {
      error
    } =
      await this.client.auth
        .signInWithPassword({
          email,
          password
        });

    if (error) {
      throw error;
    }
  }


  async requestPasswordReset(
    email: string
  ): Promise<void> {
    const redirectTo =
      this.isNativeApp()
        ? 'com.adrianpelaez.gymos://reset-password'
        : `${window.location.origin}/login?recovery=1`;

    const {
      error
    } =
      await this.client.auth.resetPasswordForEmail(
        email,
        {
          redirectTo
        }
      );

    if (error) {
      throw error;
    }
  }


  async updatePassword(
    password: string
  ): Promise<void> {
    const {
      error
    } =
      await this.client.auth.updateUser({
        password
      });

    if (error) {
      throw error;
    }
  }


  async signInWithMagicLink(
    email: string
  ): Promise<void> {
    const redirectTo =
      this.loginRedirect('email');

    const {
      error
    } =
      await this.client.auth.signInWithOtp({
        email,

        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true
        }
      });

    if (error) {
      throw error;
    }
  }


  async signInWithGoogle():
    Promise<void> {
    const redirectTo =
      this.loginRedirect('google');

    const native =
      this.isNativeApp();

    const {
      data,
      error
    } =
      await this.client.auth.signInWithOAuth({
        provider: 'google',

        options: {
          redirectTo,
          skipBrowserRedirect: native
        }
      });

    if (error) {
      throw error;
    }

    if (
      native &&
      data.url
    ) {
      await Browser.open({
        url: data.url
      });
    }
  }


  /*
   * Passkeys / WebAuthn
   */

  isPasskeySupported():
    boolean {
    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined'
    ) {
      return false;
    }

    return (
      window.isSecureContext &&
      'PublicKeyCredential' in window &&
      !!navigator.credentials
    );
  }


  async registerPasskey() {
    const session =
      await this.waitForSession();

    if (!session) {
      throw new Error(
        'Necesitas iniciar sesión antes de configurar el acceso con dispositivo.'
      );
    }

    if (!this.isPasskeySupported()) {
      throw new Error(
        'Este dispositivo o navegador no admite acceso mediante passkey.'
      );
    }

    const {
      data,
      error
    } =
      await this.client.auth.registerPasskey();

    if (error) {
      throw error;
    }

    return data;
  }


  async signInWithPasskey():
    Promise<void> {
    if (!this.isPasskeySupported()) {
      throw new Error(
        'Este dispositivo o navegador no admite acceso mediante passkey.'
      );
    }

    const {
      data,
      error
    } =
      await this.client.auth.signInWithPasskey();

    if (error) {
      throw error;
    }

    this.session.set(
      data.session ?? null
    );

    this.user.set(
      data.user ?? null
    );

    this.me.set(null);
    this.meRequest = null;
  }


  async listPasskeys() {
    const session =
      await this.waitForSession();

    if (!session) {
      throw new Error(
        'Necesitas iniciar sesión.'
      );
    }

    const {
      data,
      error
    } =
      await this.client.auth.passkey.list();

    if (error) {
      throw error;
    }

    return data ?? [];
  }


  async renamePasskey(
    passkeyId: string,
    friendlyName: string
  ): Promise<void> {
    const id =
      passkeyId.trim();

    const name =
      friendlyName.trim();

    if (!id) {
      throw new Error(
        'La passkey no es válida.'
      );
    }

    if (!name) {
      throw new Error(
        'El nombre no puede estar vacío.'
      );
    }

    if (name.length > 120) {
      throw new Error(
        'El nombre no puede superar 120 caracteres.'
      );
    }

    const {
      error
    } =
      await this.client.auth.passkey.update({
        passkeyId: id,
        friendlyName: name
      });

    if (error) {
      throw error;
    }
  }


  async deletePasskey(
    passkeyId: string
  ): Promise<void> {
    const id =
      passkeyId.trim();

    if (!id) {
      throw new Error(
        'La passkey no es válida.'
      );
    }

    const {
      error
    } =
      await this.client.auth.passkey.delete({
        passkeyId: id
      });

    if (error) {
      throw error;
    }
  }


  async signOut():
    Promise<void> {
    const {
      error
    } =
      await this.client.auth.signOut();

    if (error) {
      throw error;
    }

    this.session.set(null);
    this.user.set(null);
    this.me.set(null);
    this.meRequest = null;
  }


  async getAccessToken():
    Promise<string | null> {
    const {
      data,
      error
    } =
      await this.client.auth.getSession();

    if (error) {
      throw error;
    }

    return (
      data.session?.access_token ??
      null
    );
  }


  private async getAuthHeaders():
    Promise<HttpHeaders> {
    const token =
      await this.getAccessToken();

    if (!token) {
      throw new Error(
        'Necesitas iniciar sesión.'
      );
    }

    return new HttpHeaders({
      Authorization:
        `Bearer ${token}`
    });
  }


  isAuthFailure(
    error: unknown
  ): boolean {
    return (
      error instanceof HttpErrorResponse &&
      (
        error.status === 401 ||
        error.status === 403
      )
    );
  }


  private async clearInvalidSession():
    Promise<void> {
    try {
      await this.client.auth.signOut({
        scope: 'local'
      });
    } catch {
      // Local auth state is still cleared below.
    }

    this.session.set(null);
    this.user.set(null);
    this.me.set(null);
    this.meRequest = null;
  }


  private async requestWithAuth<T>(
    request: (
      headers: HttpHeaders
    ) => Promise<T>
  ): Promise<T> {
    const headers =
      await this.getAuthHeaders();

    try {
      return await request(
        headers
      );
    } catch (error) {
      if (
        this.isAuthFailure(
          error
        )
      ) {
        await this.clearInvalidSession();
      }

      throw error;
    }
  }


  async getMe(
    forceRefresh = false
  ): Promise<GymOSMe> {
    if (
      !forceRefresh &&
      this.me()
    ) {
      return this.me() as GymOSMe;
    }

    if (
      !forceRefresh &&
      this.meRequest
    ) {
      return this.meRequest;
    }

    this.meRequest =
      this.requestWithAuth(
        async headers =>
          await firstValueFrom(
            this.http.get<GymOSMe>(
              `${this.apiUrl}/me`,
              {
                headers
              }
            )
          )
      );

    try {
      const me =
        await this.meRequest;

      this.me.set(
        me
      );

      return me;
    } finally {
      this.meRequest = null;
    }
  }


  async bootstrapMe():
    Promise<GymOSMe> {
    const me =
      await this.requestWithAuth(
        async headers =>
          await firstValueFrom(
            this.http.post<GymOSMe>(
              `${this.apiUrl}/me/bootstrap`,
              {},
              {
                headers
              }
            )
          )
      );

    this.me.set(
      me
    );

    return me;
  }


  async resolveAccess():
    Promise<GymOSMe> {
    const me =
      await this.getMe(
        true
      );

    if (
      me.access_status ===
      'unregistered'
    ) {
      return await this.bootstrapMe();
    }

    return me;
  }
}