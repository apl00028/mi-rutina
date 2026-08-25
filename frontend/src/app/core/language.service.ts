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
    'aptus-language';

  private readonly legacyStorageKey =
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
    const current =
      localStorage.getItem(
        this.storageKey
      );

    const legacy =
      localStorage.getItem(
        this.legacyStorageKey
      );

    const stored =
      current ?? legacy;

    if (
      stored === 'en' ||
      stored === 'es'
    ) {
      if (!current && legacy) {
        localStorage.setItem(
          this.storageKey,
          stored
        );
      }

      return stored;
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