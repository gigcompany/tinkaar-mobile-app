import type { LanguageCode } from './translations';

let storedLanguage: LanguageCode | null = null;

export async function loadLanguagePreference(): Promise<LanguageCode | null> {
  return storedLanguage;
}

export async function saveLanguagePreference(language: LanguageCode): Promise<void> {
  storedLanguage = language;
}
