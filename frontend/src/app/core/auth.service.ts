import { Injectable, signal } from '@angular/core';
import {
  createClient,
  Session,
  SupabaseClient,
  User
} from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly supabaseUrl =
    'https://rvgzgueoriulirofzlmc.supabase.co';

  private readonly supabaseKey =
    'sb_publishable_rBZ-_xeoTl5Dy18DwV4-GA_dB_89ieS';

  private readonly client: SupabaseClient = createClient(
    this.supabaseUrl,
    this.supabaseKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  session = signal<Session | null>(null);
  user = signal<User | null>(null);
  loading = signal(true);

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const { data, error } =
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
          this.session.set(session);
          this.user.set(
            session?.user ?? null
          );
        }
      );
    } finally {
      this.loading.set(false);
    }
  }

  async waitForSession(): Promise<Session | null> {
    while (this.loading()) {
      await new Promise(resolve =>
        setTimeout(resolve, 25)
      );
    }

    return this.session();
  }

  async signInWithMagicLink(
    email: string
  ): Promise<void> {
    const redirectTo =
      window.location.origin;

    const { error } =
      await this.client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false
        }
      });

    if (error) {
      throw error;
    }
  }

  async signOut(): Promise<void> {
    const { error } =
      await this.client.auth.signOut();

    if (error) {
      throw error;
    }

    this.session.set(null);
    this.user.set(null);
  }

  async getAccessToken():
    Promise<string | null> {
    const { data, error } =
      await this.client.auth.getSession();

    if (error) {
      throw error;
    }

    return (
      data.session?.access_token ??
      null
    );
  }
async signInWithGoogle(): Promise<void> {
  const redirectTo =
    `${window.location.origin}/login?oauth=google`;

  const { error } =
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

}