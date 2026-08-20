import {
  Injectable,
  signal
} from '@angular/core';


export type AppLanguage =
  'es' | 'en';


@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private readonly storageKey =
    'gymos-language';

  readonly language =
    signal<AppLanguage>(
      this.readInitialLanguage()
    );


  constructor() {
    this.applyDocumentLanguage(
      this.language()
    );
  }


  setLanguage(
    language: AppLanguage
  ): void {
    this.language.set(language);

    localStorage.setItem(
      this.storageKey,
      language
    );

    this.applyDocumentLanguage(
      language
    );
  }


  private readInitialLanguage():
    AppLanguage {
    const stored =
      localStorage.getItem(
        this.storageKey
      );

    if (stored === 'en') {
      return 'en';
    }

    if (stored === 'es') {
      return 'es';
    }

    const browserLanguage =
      navigator.language
        .toLowerCase();

    return browserLanguage
      .startsWith('es')
      ? 'es'
      : 'en';
  }


  private applyDocumentLanguage(
    language: AppLanguage
  ): void {
    document.documentElement.lang =
      language;
  }
}