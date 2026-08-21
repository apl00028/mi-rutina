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


  private meRequest:
    Promise<GymOSMe> | null = null;


  constructor(
    private http: HttpClient
  ) {
    this.initialize();
  }


  private async initialize():
    Promise<void> {
    try {
      const {
        data,
        error
      } =
        await this.client.auth.getSession();

      if (error) {
        throw error;
      }

      this.session.set(
        data.session ?? null
      );

      this.user.set(
        data.session?.user ?? null
      );

      this.client.auth.onAuthStateChange(
        (_event, session) => {
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
      );
    } finally {
      this.loading.set(false);
    }
  }


  async waitForSession():
    Promise<Session | null> {
    while (this.loading()) {
      await new Promise(resolve =>
        setTimeout(
          resolve,
          25
        )
      );
    }

    return this.session();
  }


  async signInWithMagicLink(
    email: string
  ): Promise<void> {
    const redirectTo =
      `${window.location.origin}/login`;

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
      `${window.location.origin}/login?oauth=google`;

    const {
      error
    } =
      await this.client.auth.signInWithOAuth({
        provider: 'google',

        options: {
          redirectTo
        }
      });

    if (error) {
      throw error;
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