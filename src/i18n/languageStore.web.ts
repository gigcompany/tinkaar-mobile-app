import { isLanguageCode, type LanguageCode } from './translations';

const storageKey = 'workfoundry.language';

export async function loadLanguagePreference(): Promise<LanguageCode | null> {
  if (typeof globalThis.localStorage === 'undefined') {
    return null;
  }

  const stored = globalThis.localStorage.getItem(storageKey);
  return isLanguageCode(stored) ? stored : null;
}

export async function saveLanguagePreference(language: LanguageCode): Promise<void> {
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.setItem(storageKey, language);
  }
}
