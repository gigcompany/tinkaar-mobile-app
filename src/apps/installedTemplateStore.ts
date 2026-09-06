import { InstalledTemplateRecord } from './catalog';

let records: InstalledTemplateRecord[] = [];

export async function loadInstalledTemplates(): Promise<InstalledTemplateRecord[]> {
  return records;
}

export async function saveInstalledTemplate(record: InstalledTemplateRecord): Promise<void> {
  records = [
    ...records.filter((template) => template.app.appId !== record.app.appId && template.url !== record.url),
    record,
  ];
}
