import { ComponentType, ReactNode } from 'react';
import { AppRecord, RecordValue } from '../data/repository';
import { NodeDefinition } from '../schema/appDefinition.schema';

export type ComponentRenderProps = {
  node: NodeDefinition;
  children: ReactNode;
  value: RecordValue | undefined;
  record: AppRecord | null;
  tableName: string | null;
};

export type ComponentImpl = ComponentType<ComponentRenderProps>;
export type ComponentRegistry = Record<string, ComponentImpl>;
