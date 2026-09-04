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
  Passkey
} from './passkey.plugin';

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


export interface AptusMe {
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
    signal<AptusMe | null>(null);

  passwordRecoverySession =
    signal<Session | null>(null);

  loading =
    signal(true);


  nativeLoginCompleted =
    signal(0);


  private meRequest:
    Promise<AptusMe> | null = null;


  private authReadyPromise!:
    Promise<Session | null>;

  private resolveAuthReady:
    (session: Session | null) => void =
      () => {};

  private authReadyResolved =
    false;

  private passwordRecoveryResolvers:
    Array<(session: Session | null) => void> =
    [];


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
          event === 'PASSWORD_RECOVERY' &&
          session
        ) {
          this.markPasswordRecoverySession(
            session
          );

          this.finishAuthInitialization(
            session
          );
        }

        if (
          session &&
          event === 'SIGNED_IN' &&
          this.isWebPasswordRecoveryCallback()
        ) {
          this.markPasswordRecoverySession(
            session
          );
        }

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
            `[Aptus auth] ${event}: ` +
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
      this.passwordRecoverySession.set(
        null
      );
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


  async waitForPasswordRecoverySession():
    Promise<Session | null> {
    const recoverySession =
      this.passwordRecoverySession();

    if (recoverySession) {
      return recoverySession;
    }

    return await new Promise<Session | null>(
      resolve => {
        this.passwordRecoveryResolvers.push(
          resolve
        );
      }
    );
  }


  async exchangePasswordRecoveryCode(
    code: string
  ): Promise<Session> {
    const authCode =
      code.trim();

    if (!authCode) {
      throw new Error(
        'El enlace de recuperación no es válido.'
      );
    }

    const {
      data,
      error
    } =
      await this.client.auth
        .exchangeCodeForSession(
          authCode
        );

    if (error) {
      throw error;
    }

    if (!data.session) {
      throw new Error(
        'No se recibió una sesión de recuperación.'
      );
    }

    this.applySession(
      data.session
    );

    this.markPasswordRecoverySession(
      data.session
    );

    this.finishAuthInitialization(
      data.session
    );

    return data.session;
  }


  private resolvePasswordRecovery(
    session: Session | null
  ): void {
    const resolvers =
      this.passwordRecoveryResolvers;

    this.passwordRecoveryResolvers =
      [];

    for (
      const resolve of resolvers
    ) {
      resolve(session);
    }
  }


  private markPasswordRecoverySession(
    session: Session
  ): void {
    this.passwordRecoverySession.set(
      session
    );

    this.resolvePasswordRecovery(
      session
    );
  }


  private isNativeApp():
    boolean {
    return Capacitor.isNativePlatform();
  }


  private isWebPasswordRecoveryCallback():
    boolean {
    if (
      this.isNativeApp() ||
      typeof window === 'undefined'
    ) {
      return false;
    }

    const search =
      new URLSearchParams(
        window.location.search
      );

    const hash =
      new URLSearchParams(
        window.location.hash.replace(
          /^#/,
          ''
        )
      );

    const recoveryMarker =
      search.get('recovery') === '1' ||
      search.get('type') === 'recovery' ||
      hash.get('type') === 'recovery';

    const callbackCredential =
      Boolean(
        search.get('code') ||
        search.get('token_hash') ||
        hash.get('code') ||
        hash.get('access_token') ||
        hash.get('refresh_token')
      );

    return (
      recoveryMarker &&
      callbackCredential
    );
  }


  private loginRedirect(
    method: 'google' | 'email'
  ): string {
    if (this.isNativeApp()) {
      return 'com.adrianpelaez.aptus://login';
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
      'com.adrianpelaez.aptus://login';

    const recoveryUrl =
      'com.adrianpelaez.aptus://reset-password';

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

      let recoverySession:
        Session | null = null;

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
          data,
          error
        } =
          await this.client.auth
            .exchangeCodeForSession(
              code
            );

        if (error) {
          throw error;
        }

        recoverySession =
          data.session ?? null;
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
          data,
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

        recoverySession =
          data.session ?? null;
      }

      if (isRecovery) {
        if (!recoverySession) {
          throw new Error(
            'No se recibió una sesión de recuperación.'
          );
        }

        this.markPasswordRecoverySession(
          recoverySession
        );

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
        'aptus-native-auth-error',
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
        'aptus-native-auth-error'
      );

    sessionStorage.removeItem(
      'aptus-native-auth-error'
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
        ? 'com.adrianpelaez.aptus://reset-password'
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

  private isNativeAndroid():
    boolean {
    return (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() ===
        'android'
    );
  }


  isPasskeySupported():
    boolean {
    if (
      this.isNativeAndroid()
    ) {
      return true;
    }

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


  private async assertNativePasskeySupported():
    Promise<void> {
    const support =
      await Passkey.isSupported();

    if (!support.supported) {
      throw new Error(
        `Las passkeys requieren Android ${support.minimumSdkInt} ` +
        `o superior. Este dispositivo usa SDK ${support.sdkInt}.`
      );
    }
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


    /*
     * Android nativo:
     *
     * Supabase genera el challenge y las opciones WebAuthn.
     * Android Credential Manager ejecuta la ceremonia.
     * Supabase verifica la credencial resultante.
     */
    if (
      this.isNativeAndroid()
    ) {
      await this.assertNativePasskeySupported();

      const {
        data: startData,
        error: startError
      } =
        await this.client.auth.passkey
          .startRegistration();

      if (startError) {
        throw startError;
      }

      if (!startData) {
        throw new Error(
          'Supabase no devolvió opciones para registrar la passkey.'
        );
      }

      const nativeResult =
        await Passkey.createCredential({
          requestJson:
            JSON.stringify(
              startData.options
            )
        });

      let credential;

      try {
        credential =
          JSON.parse(
            nativeResult.credentialJson
          );
      } catch {
        throw new Error(
          'Android devolvió una respuesta de passkey no válida.'
        );
      }

      const {
        data,
        error
      } =
        await this.client.auth.passkey
          .verifyRegistration({
            challengeId:
              startData.challenge_id,

            credential
          });

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          'Supabase no pudo completar el registro de la passkey.'
        );
      }

      return data;
    }


    /*
     * Navegador:
     * mantenemos el flujo WebAuthn de supabase-js.
     */
    const {
      data,
      error
    } =
      await this.client.auth
        .registerPasskey();

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


    /*
     * Android nativo
     */
    if (
      this.isNativeAndroid()
    ) {
      await this.assertNativePasskeySupported();

      const {
        data: startData,
        error: startError
      } =
        await this.client.auth.passkey
          .startAuthentication();

      if (startError) {
        throw startError;
      }

      if (!startData) {
        throw new Error(
          'Supabase no devolvió opciones para autenticar la passkey.'
        );
      }

      const nativeResult =
        await Passkey.getCredential({
          requestJson:
            JSON.stringify(
              startData.options
            )
        });

      let credential;

      try {
        credential =
          JSON.parse(
            nativeResult.credentialJson
          );
      } catch {
        throw new Error(
          'Android devolvió una respuesta de autenticación no válida.'
        );
      }

      const {
        data,
        error
      } =
        await this.client.auth.passkey
          .verifyAuthentication({
            challengeId:
              startData.challenge_id,

            credential
          });

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          'Supabase no pudo completar la autenticación con passkey.'
        );
      }

      this.session.set(
        data.session ?? null
      );

      this.user.set(
        data.user ?? null
      );

      this.me.set(null);
      this.meRequest = null;

      return;
    }


    /*
     * Navegador
     */
    const {
      data,
      error
    } =
      await this.client.auth
        .signInWithPasskey();

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
    this.passwordRecoverySession.set(null);
    this.meRequest = null;
    this.resolvePasswordRecovery(null);
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
    this.passwordRecoverySession.set(null);
    this.meRequest = null;
    this.resolvePasswordRecovery(null);
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
  ): Promise<AptusMe> {
    if (
      !forceRefresh &&
      this.me()
    ) {
      return this.me() as AptusMe;
    }

    if (
      this.meRequest
    ) {
      return this.meRequest;
    }

    this.meRequest =
      this.requestWithAuth(
        async headers =>
          await firstValueFrom(
            this.http.get<AptusMe>(
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
    Promise<AptusMe> {
    const me =
      await this.requestWithAuth(
        async headers =>
          await firstValueFrom(
            this.http.post<AptusMe>(
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


  async deleteAccount():
    Promise<void> {
    await this.requestWithAuth(
      async headers =>
        await firstValueFrom(
          this.http.delete<void>(
            `${this.apiUrl}/me`,
            {
              headers
            }
          )
        )
    );

    try {
      await this.client.auth.signOut({
        scope: 'local'
      });
    } catch {
      // La cuenta ya ha sido eliminada en Supabase Auth.
    }

    this.session.set(null);
    this.user.set(null);
    this.me.set(null);
    this.passwordRecoverySession.set(null);
    this.meRequest = null;
    this.resolvePasswordRecovery(null);
  }



  async resolveAccess():
    Promise<AptusMe> {
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
