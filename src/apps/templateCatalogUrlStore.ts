let catalogUrl = '';

export async function loadTemplateCatalogUrl(): Promise<string> {
  return catalogUrl;
}

export async function saveTemplateCatalogUrl(url: string): Promise<void> {
  catalogUrl = url;
}
