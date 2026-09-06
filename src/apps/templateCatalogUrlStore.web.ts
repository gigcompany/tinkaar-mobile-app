const storageKey = 'workfoundry.templateCatalogUrl';

export async function loadTemplateCatalogUrl(): Promise<string> {
  if (typeof globalThis.localStorage === 'undefined') {
    return '';
  }

  return globalThis.localStorage.getItem(storageKey) ?? '';
}

export async function saveTemplateCatalogUrl(url: string): Promise<void> {
  if (typeof globalThis.localStorage === 'undefined') {
    return;
  }

  if (url.trim()) {
    globalThis.localStorage.setItem(storageKey, url.trim());
    return;
  }

  globalThis.localStorage.removeItem(storageKey);
}
