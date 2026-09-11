import { InstalledTemplateRecord } from './catalog';

let records: InstalledTemplateRecord[] = [];
let hiddenAppIds: string[] = [];

export async function loadInstalledTemplates(): Promise<InstalledTemplateRecord[]> {
  return records;
}

export async function saveInstalledTemplate(record: InstalledTemplateRecord): Promise<void> {
  records = [
    ...records.filter((template) => template.app.appId !== record.app.appId && template.url !== record.url),
    record,
  ];
  hiddenAppIds = hiddenAppIds.filter((appId) => appId !== record.app.appId);
}

export async function deleteInstalledTemplate(appId: string): Promise<void> {
  records = records.filter((template) => template.app.appId !== appId);
}

export async function loadHiddenAppIds(): Promise<string[]> {
  return hiddenAppIds;
}

export async function saveHiddenAppIds(appIds: string[]): Promise<void> {
  hiddenAppIds = [...new Set(appIds)];
}
