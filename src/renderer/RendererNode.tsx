import { memo, useMemo } from 'react';
import { Paragraph, YStack } from 'tamagui';
import { registry } from '../registry';
import { NodeDefinition } from '../schema/appDefinition.schema';
import { useRecordContext } from './AppRuntime';
import { matchesFilter } from './dataSource';

function RendererNodeComponent({ node }: { node: NodeDefinition }) {
  const { record, tableName } = useRecordContext();
  const children = useMemo(
    () => node.children?.map((child, index) => <RendererNode key={child.id ?? `${child.type}-${index}`} node={child} />),
    [node.children],
  );

  if (node.visibility && record && !matchesFilter(record, node.visibility)) {
    return null;
  }

  const Component = registry[`${node.kind}.${node.type}`];

  if (!Component) {
    return (
      <YStack padding="$3" borderWidth={1} borderColor="$red7" borderRadius="$3">
        <Paragraph color="$red11">
          Missing component: {node.kind}.{node.type}
        </Paragraph>
      </YStack>
    );
  }

  const value = node.bind && record ? record[node.bind] : undefined;

  return <Component node={node} children={children} value={value} record={record} tableName={tableName} />;
}

export const RendererNode = memo(RendererNodeComponent);
