import { BarChart3, Calendar, Check, Pencil, Plus, Receipt, Repeat, Trash2, WalletCards } from 'lucide-react-native';
import { Platform, useWindowDimensions } from 'react-native';
import { Button, Card, Checkbox, Input, Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui';
import { dispatchAction } from '../renderer/actions';
import { applyDatasource } from '../renderer/dataSource';
import { RecordProvider, useRuntime } from '../renderer/AppRuntime';
import { RendererNode } from '../renderer/RendererNode';
import { ComponentRegistry, ComponentRenderProps } from './types';
import { getScaledFontSize } from '../theme/theme';
import { AppDefinition, NodeDefinition, FieldType } from '../schema/appDefinition.schema';

const asText = (value: unknown) => (value === undefined || value === null ? '' : String(value));

const isLeadingControl = (node: NodeDefinition) =>
  node.kind === 'primitive' && ['checkbox', 'switch'].includes(node.type);

const isTrailingAccessory = (node: NodeDefinition) =>
  node.kind === 'primitive' && ['badge', 'button'].includes(node.type);

const isMetadataRow = (nodes: NodeDefinition[]) =>
  nodes.length <= 3 &&
  nodes.every(
    (node) =>
      (node.kind === 'primitive' && ['text', 'badge'].includes(node.type)) ||
      (node.kind === 'primitive' && node.type === 'button' && node.variant === 'icon') ||
      (node.kind === 'container' && node.type === 'stack'),
  );

const getElevatedSurfaceColor = (mode: 'light' | 'dark', surfaceColor: string) =>
  mode === 'dark' ? '#111827' : surfaceColor;

const getInsetSurfaceColor = (mode: 'light' | 'dark') => (mode === 'dark' ? '#0f172a' : '#f1f5f9');

const getNativeRadius = (radiusValue: number) => Math.max(18, radiusValue + 10);

function Screen({ node, children }: ComponentRenderProps) {
  const runtime = useRuntime();
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 430 ? 18 : 24;
  const childrenArray = Array.isArray(children) ? children : children ? [children] : [];
  const rawNodes = node.children ?? [];
  const contentChildren = childrenArray.filter((_, index) => rawNodes[index]?.variant !== 'fab');
  const fabNode = rawNodes.find((child) => child.kind === 'primitive' && child.type === 'button' && child.variant === 'fab');

  return (
    <YStack flex={1} backgroundColor={runtime.theme.backgroundColor} position="relative">
      <ScrollView
        flex={1}
        backgroundColor={runtime.theme.backgroundColor}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          alignItems: 'center',
          paddingHorizontal: horizontalPadding,
          paddingTop: 18,
          paddingBottom: fabNode ? 112 : 34,
        }}
      >
        <YStack width="100%" maxWidth={760} gap="$4">
          {contentChildren}
        </YStack>
      </ScrollView>
    </YStack>
  );
}

function Stack({ node, children }: ComponentRenderProps) {
  const { width } = useWindowDimensions();
  const horizontal = node.direction === 'horizontal';
  const childrenArray = Array.isArray(children) ? children : children ? [children] : [];
  const rawNodes = node.children ?? [];
  const hasControlAccessoryPattern =
    horizontal &&
    rawNodes.some((child) => isLeadingControl(child)) &&
    rawNodes.some((child) => isTrailingAccessory(child));
  const shouldStackOnCompactWidth = horizontal && !hasControlAccessoryPattern && !isMetadataRow(rawNodes) && width < 640;
  const renderHorizontal = horizontal && !shouldStackOnCompactWidth;
  const shouldDistribute =
    renderHorizontal &&
    childrenArray.length > 1 &&
    !hasControlAccessoryPattern &&
    rawNodes[0]?.kind === 'container' &&
    rawNodes.some((child, index) => index > 0 && isTrailingAccessory(child));

  return (
    <YStack
      flexDirection={renderHorizontal ? 'row' : 'column'}
      alignItems={renderHorizontal ? 'center' : 'stretch'}
      justifyContent={shouldDistribute ? 'space-between' : 'flex-start'}
      flexWrap={renderHorizontal ? 'wrap' : 'nowrap'}
      flexShrink={renderHorizontal ? 0 : 1}
      gap="$3.5"
      minWidth={0}
      alignSelf={renderHorizontal ? 'stretch' : undefined}
    >
      {renderHorizontal
        ? childrenArray.map((child, index) => {
            const rawChild = rawNodes[index];
            const fixed = rawChild && (isLeadingControl(rawChild) || isTrailingAccessory(rawChild));
            const flexible = shouldDistribute ? index === 0 : hasControlAccessoryPattern && !fixed;

            return (
              <YStack
                key={index}
                flex={flexible ? 1 : undefined}
                flexBasis={flexible ? 0 : undefined}
                flexShrink={fixed ? 0 : 1}
                minWidth={0}
              >
                {child}
              </YStack>
            );
          })
        : children}
    </YStack>
  );
}

function Grid({ children }: ComponentRenderProps) {
  const { width } = useWindowDimensions();
  const childrenArray = Array.isArray(children) ? children : children ? [children] : [];
  const columnWidth = width < 620 ? '100%' : '48%';

  return (
    <XStack width="100%" flexWrap="wrap" gap="$3">
      {childrenArray.map((child, index) => (
        <YStack key={index} width={columnWidth} flexGrow={1} minWidth={0}>
          {child}
        </YStack>
      ))}
    </XStack>
  );
}

function List({ node }: ComponentRenderProps) {
  const runtime = useRuntime();
  const tableName = node.datasource?.table ?? null;
  const canList = tableName
    ? runtime.app.data.operations.some((operation) => operation.table === tableName && operation.type === 'list')
    : false;
  const records = canList && tableName ? applyDatasource(runtime.repository.getRecords(tableName), node.datasource) : [];

  if (records.length === 0 && node.emptyState) {
    return (
      <YStack
        alignItems="center"
        justifyContent="center"
        padding="$6"
        borderRadius={getNativeRadius(runtime.theme.radiusValue)}
        backgroundColor={getElevatedSurfaceColor(runtime.theme.mode, runtime.theme.surfaceColor)}
        borderWidth={1}
        borderColor={runtime.theme.mode === 'dark' ? '#1f2937' : '#e5e7eb'}
      >
        <RendererNode node={node.emptyState} />
      </YStack>
    );
  }

  return (
    <YStack width="100%" gap="$2.5">
      {records.map((record) => (
        <RecordProvider key={record.id} record={record} tableName={tableName}>
          {node.itemTemplate ? <RendererNode node={node.itemTemplate} /> : null}
        </RecordProvider>
      ))}
    </YStack>
  );
}

function CardContainer({ node, children }: ComponentRenderProps) {
  const runtime = useRuntime();
  const nodes = children ? (Array.isArray(children) ? children : [children]) : [];
  const rawNodes = node.children ?? [];
  const shouldRenderRow =
    node.direction === 'horizontal' ||
    (node.direction !== 'vertical' &&
      rawNodes.length <= 4 &&
      rawNodes.some((child) => isLeadingControl(child)) &&
      rawNodes.some((child) => isTrailingAccessory(child)));

  return (
    <Card
      width="100%"
      borderWidth={runtime.theme.mode === 'dark' ? 1 : 0}
      borderColor={runtime.theme.mode === 'dark' ? '#1f2937' : '#e5e7eb'}
      borderRadius={getNativeRadius(runtime.theme.radiusValue)}
      backgroundColor={getElevatedSurfaceColor(runtime.theme.mode, runtime.theme.surfaceColor)}
      alignSelf="stretch"
      overflow="hidden"
      shadowColor={runtime.theme.mode === 'dark' ? '#000000' : '#64748b'}
      shadowOpacity={runtime.theme.mode === 'dark' ? 0.24 : 0.11}
      shadowRadius={18}
      shadowOffset={{ width: 0, height: 10 }}
    >
      <XStack
        flexDirection={shouldRenderRow ? 'row' : 'column'}
        alignItems={shouldRenderRow ? 'center' : 'stretch'}
        gap="$3"
        minWidth={0}
        width="100%"
        padding={shouldRenderRow ? '$3.5' : '$4.5'}
      >
        {nodes.map((child, index) => {
          const rawChild = rawNodes[index];
          const fixed = shouldRenderRow && rawChild && (isLeadingControl(rawChild) || isTrailingAccessory(rawChild));

          return (
            <YStack
              key={index}
              flex={shouldRenderRow && !fixed ? 1 : undefined}
              flexBasis={shouldRenderRow && !fixed ? 0 : undefined}
              flexShrink={fixed ? 0 : 1}
              minWidth={0}
              alignSelf={shouldRenderRow ? undefined : 'stretch'}
            >
              {child}
            </YStack>
          );
        })}
      </XStack>
    </Card>
  );
}

function ModalContainer({ children }: ComponentRenderProps) {
  return (
    <YStack gap="$4" paddingHorizontal="$4" paddingTop="$2" paddingBottom="$6">
      {children}
    </YStack>
  );
}

function TextPrimitive({ node, value }: ComponentRenderProps) {
  const runtime = useRuntime();
  const field = getBoundField(runtime.app, node.bind);
  const content = node.bind ? formatRecordValue(value, field?.type, runtime.currency) : asText(node.value);

  if (node.variant === 'heading') {
    return (
      <Text
        fontSize={getScaledFontSize(runtime.theme, 28)}
        lineHeight={getScaledFontSize(runtime.theme, 34)}
        fontWeight="800"
        fontFamily={runtime.theme.fontFamilyValue}
        color={runtime.theme.textColor}
        flexShrink={1}
      >
        {content}
      </Text>
    );
  }

  if (node.variant === 'caption') {
    return (
      <Paragraph fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 14)} lineHeight={getScaledFontSize(runtime.theme, 19)} color={runtime.theme.mutedTextColor}>
        {content}
      </Paragraph>
    );
  }

  return (
    <Paragraph
      fontSize={getScaledFontSize(runtime.theme, 16)}
      lineHeight={getScaledFontSize(runtime.theme, 22)}
      color={runtime.theme.textColor}
      fontFamily={runtime.theme.fontFamilyValue}
      flexShrink={1}
    >
      {content}
    </Paragraph>
  );
}

function ButtonPrimitive({ node, record, tableName }: ComponentRenderProps) {
  const runtime = useRuntime();
  const filled = node.variant === 'filled';
  const fab = node.variant === 'fab';
  const iconOnly = node.variant === 'icon';
  const danger = node.variant === 'danger';
  const Icon = getButtonIcon(node.icon, node.action?.type);
  const foregroundColor = filled || fab || danger ? runtime.theme.primaryContrastColor : runtime.theme.primaryColor;

  return (
    <Button
      accessibilityLabel={node.label}
      chromeless={!filled && !fab && !danger}
      size={fab ? '$6' : iconOnly ? '$4' : '$4'}
      width={fab || iconOnly ? (fab ? 62 : 42) : undefined}
      height={fab || iconOnly ? (fab ? 62 : 42) : undefined}
      minHeight={fab ? 62 : iconOnly ? 42 : 50}
      paddingHorizontal={fab || iconOnly ? '$0' : '$4'}
      paddingVertical={fab || iconOnly ? '$0' : '$3'}
      backgroundColor={filled || fab ? runtime.theme.primaryColor : danger ? runtime.theme.dangerColor : 'transparent'}
      borderWidth={filled || fab || danger ? 0 : 1}
      borderColor={filled || fab || danger ? 'transparent' : runtime.theme.mode === 'dark' ? '#1f2937' : '#dbe3ea'}
      borderRadius={999}
      color={foregroundColor}
      fontFamily={runtime.theme.fontFamilyValue}
      shadowColor={fab ? (runtime.theme.mode === 'dark' ? '#000000' : runtime.theme.primaryColor) : undefined}
      shadowOpacity={fab ? (runtime.theme.mode === 'dark' ? 0.42 : 0.26) : undefined}
      shadowRadius={fab ? 18 : undefined}
      shadowOffset={fab ? { width: 0, height: 10 } : undefined}
      pressStyle={{ scale: fab ? 0.96 : 0.98, opacity: 0.82 }}
      onPress={() => {
        const logicResult = runtime.runLogic({
          event: 'buttonClick',
          pageId: runtime.pageId,
          table: node.action?.table ?? tableName ?? undefined,
          nodeId: node.id,
          record,
        });
        const actionRuntime = { ...runtime, draft: logicResult.draft };

        logicResult.actions.forEach((queuedAction) => dispatchAction(queuedAction, actionRuntime, record));

        if (!logicResult.blocked) {
          dispatchAction(node.action, actionRuntime, record);
        }
      }}
    >
      {fab || iconOnly ? (
        Icon ? <Icon color={foregroundColor} size={fab ? 28 : 19} strokeWidth={2.2} /> : null
      ) : (
        <XStack alignItems="center" justifyContent="center" gap="$2">
          {Icon ? <Icon color={foregroundColor} size={18} strokeWidth={2.2} /> : null}
          <Text color={foregroundColor} fontFamily={runtime.theme.fontFamilyValue} fontWeight="800">
            {node.label}
          </Text>
        </XStack>
      )}
    </Button>
  );
}

function CheckboxPrimitive({ node, value, record }: ComponentRenderProps) {
  const runtime = useRuntime();
  const fieldName = node.bind ?? '';
  const checked = Boolean(value ?? runtime.draft[fieldName]);
  const toggle = () => {
    if (node.action) {
      dispatchAction(node.action, runtime, record);
      return;
    }

    if (fieldName) {
      runtime.setDraftValue(fieldName, !checked);
    }
  };

  return (
    <Checkbox
      checked={checked}
      size="$5"
      backgroundColor={checked ? runtime.theme.primaryColor : getInsetSurfaceColor(runtime.theme.mode)}
      borderColor={runtime.theme.primaryColor}
      borderRadius={8}
      onCheckedChange={toggle}
    >
      <Checkbox.Indicator>
        <Check color={runtime.theme.primaryContrastColor} size={16} />
      </Checkbox.Indicator>
    </Checkbox>
  );
}

function SwitchPrimitive(props: ComponentRenderProps) {
  return <CheckboxPrimitive {...props} />;
}

function RadioGroupPrimitive({ node, value }: ComponentRenderProps) {
  const runtime = useRuntime();
  const fieldName = node.bind ?? '';
  const field = getBoundField(runtime.app, node.bind);
  const values = field?.values ?? [];
  const selected = asText(value ?? runtime.draft[fieldName] ?? field?.default ?? values[0]);

  return (
    <YStack gap="$2">
      <Text fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 13)} fontWeight="700" color={runtime.theme.mutedTextColor}>
        {node.label}
      </Text>
      <YStack gap="$2">
        {values.map((option) => {
          const active = selected === option;
          return (
            <PressableLikeButton
              key={option}
              active={active}
              label={option}
              theme={runtime.theme}
              onPress={() => runtime.setDraftValue(fieldName, option)}
            />
          );
        })}
      </YStack>
    </YStack>
  );
}

function CheckboxGroupPrimitive({ node, value }: ComponentRenderProps) {
  const runtime = useRuntime();
  const fieldName = node.bind ?? '';
  const field = getBoundField(runtime.app, node.bind);
  const values = field?.values ?? [];
  const selectedValues = Array.isArray(value ?? runtime.draft[fieldName]) ? ((value ?? runtime.draft[fieldName]) as string[]) : [];

  return (
    <YStack gap="$2">
      <Text fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 13)} fontWeight="700" color={runtime.theme.mutedTextColor}>
        {node.label}
      </Text>
      <XStack gap="$2" rowGap="$2" flexWrap="wrap">
        {values.map((option) => {
          const active = selectedValues.includes(option);
          return (
            <PressableLikeButton
              key={option}
              active={active}
              label={option}
              theme={runtime.theme}
              onPress={() => {
                const next = active ? selectedValues.filter((item) => item !== option) : [...selectedValues, option];
                runtime.setDraftValue(fieldName, next);
              }}
            />
          );
        })}
      </XStack>
    </YStack>
  );
}

function InputPrimitive({ node, value }: ComponentRenderProps) {
  const runtime = useRuntime();
  const currentValue = asText(value ?? runtime.draft[node.bind ?? '']);
  const field = getBoundField(runtime.app, node.bind);

  return (
    <YStack gap="$2">
      <Text fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 13)} fontWeight="700" color={runtime.theme.mutedTextColor}>
        {node.label}
        {node.required ? ' *' : ''}
      </Text>
      <Input
        {...getNativeInputProps(field?.type)}
        value={currentValue}
        multiline={node.multiline}
        minHeight={node.multiline ? 116 : 50}
        height="auto"
        backgroundColor={getInsetSurfaceColor(runtime.theme.mode)}
        borderWidth={1}
        borderColor={runtime.theme.mode === 'dark' ? '#1f2937' : '#e2e8f0'}
        borderRadius={14}
        color={runtime.theme.textColor}
        fontFamily={runtime.theme.fontFamilyValue}
        fontSize={getScaledFontSize(runtime.theme, 15)}
        lineHeight={getScaledFontSize(runtime.theme, 21)}
        paddingHorizontal="$3.5"
        paddingVertical={node.multiline ? '$3' : '$2.5'}
        onChangeText={(next) => {
          if (node.bind) {
            runtime.setDraftValue(node.bind, next);
          }
        }}
      />
    </YStack>
  );
}

function DatePickerPrimitive({ node, value }: ComponentRenderProps) {
  const runtime = useRuntime();
  const currentValue = asText(value ?? runtime.draft[node.bind ?? '']);

  return (
    <YStack gap="$2">
      <Text fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 13)} fontWeight="700" color={runtime.theme.mutedTextColor}>
        {node.label}
      </Text>
      <XStack
        alignItems="center"
        gap="$2.5"
        backgroundColor={getInsetSurfaceColor(runtime.theme.mode)}
        borderWidth={1}
        borderColor={runtime.theme.mode === 'dark' ? '#1f2937' : '#e2e8f0'}
        borderRadius={14}
        paddingLeft="$3.5"
      >
        <Calendar color={runtime.theme.primaryColor} size={18} strokeWidth={2} />
        <Input
          {...getNativeInputProps('date')}
          flex={1}
          value={currentValue}
          minHeight={50}
          height="auto"
          backgroundColor="transparent"
          borderWidth={0}
          color={runtime.theme.textColor}
          fontFamily={runtime.theme.fontFamilyValue}
          fontSize={getScaledFontSize(runtime.theme, 15)}
          lineHeight={getScaledFontSize(runtime.theme, 21)}
          paddingVertical="$2.5"
          placeholder="Select date"
          placeholderTextColor={runtime.theme.mutedTextColor as never}
          onChangeText={(next) => {
            if (node.bind) {
              runtime.setDraftValue(node.bind, next);
            }
          }}
        />
      </XStack>
    </YStack>
  );
}

function SelectPrimitive({ node, value }: ComponentRenderProps) {
  const runtime = useRuntime();
  const fieldName = node.bind ?? '';
  const table = runtime.app.tables.find((candidate) => candidate.fields.some((field) => field.name === fieldName));
  const field = table?.fields.find((candidate) => candidate.name === fieldName);
  const values = field?.values ?? [];
  const selected = asText(value ?? runtime.draft[fieldName] ?? field?.default ?? values[0]);

  return (
    <YStack gap="$2">
      <Text fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 13)} fontWeight="700" color={runtime.theme.mutedTextColor}>
        {node.label}
      </Text>
      <XStack gap="$2" rowGap="$2" flexWrap="wrap">
        {values.map((option) => (
          <Button
            key={option}
            size="$3"
            chromeless={selected !== option}
            minHeight={42}
            height="auto"
            paddingVertical="$2.5"
            backgroundColor={selected === option ? runtime.theme.primaryColor : getInsetSurfaceColor(runtime.theme.mode)}
            borderWidth={selected === option ? 0 : 1}
            borderColor={runtime.theme.mode === 'dark' ? '#1f2937' : '#e2e8f0'}
            borderRadius={999}
            color={selected === option ? runtime.theme.primaryContrastColor : runtime.theme.textColor}
            fontFamily={runtime.theme.fontFamilyValue}
            pressStyle={{ scale: 0.98, opacity: 0.82 }}
            onPress={() => runtime.setDraftValue(fieldName, option)}
          >
            {option}
          </Button>
        ))}
      </XStack>
    </YStack>
  );
}

function DividerPrimitive() {
  const runtime = useRuntime();
  return <YStack height={1} width="100%" backgroundColor={runtime.theme.borderColor} />;
}

function ProgressBarPrimitive({ node, value }: ComponentRenderProps) {
  const runtime = useRuntime();
  const progress = Math.max(0, Math.min(toNumber(value ?? node.value), 100));

  return (
    <YStack gap="$2">
      {node.label ? (
        <XStack alignItems="center" justifyContent="space-between" gap="$3">
          <Text color={runtime.theme.textColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 13)} fontWeight="800">
            {node.label}
          </Text>
          <Text color={runtime.theme.mutedTextColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 12)} fontWeight="800">
            {formatNumber(progress)}%
          </Text>
        </XStack>
      ) : null}
      <YStack height={10} borderRadius={999} backgroundColor={getInsetSurfaceColor(runtime.theme.mode)} overflow="hidden">
        <YStack width={`${progress}%`} height="100%" borderRadius={999} backgroundColor={runtime.theme.primaryColor} />
      </YStack>
    </YStack>
  );
}

function BadgePrimitive({ node, value }: ComponentRenderProps) {
  const runtime = useRuntime();
  const content = node.bind ? asText(value) : asText(node.value);

  return (
    <YStack
      borderRadius={999}
      paddingHorizontal="$3"
      paddingVertical="$1.5"
      backgroundColor={runtime.theme.primarySoftColor}
      borderWidth={1}
      borderColor={runtime.theme.mode === 'dark' ? runtime.theme.primaryColor : 'transparent'}
    >
      <Text color={runtime.theme.primaryColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 12)} fontWeight="800">
        {content}
      </Text>
    </YStack>
  );
}

function StatCardWidget({ node }: ComponentRenderProps) {
  const runtime = useRuntime();
  const records = getNodeRecords(runtime, node);
  const value = aggregateRecords(records, node.aggregate);
  const Icon = getWidgetIcon(node.icon);

  return (
    <Card
      width="100%"
      minHeight={132}
      borderWidth={runtime.theme.mode === 'dark' ? 1 : 0}
      borderColor={runtime.theme.mode === 'dark' ? '#1f2937' : '#e5e7eb'}
      borderRadius={getNativeRadius(runtime.theme.radiusValue)}
      backgroundColor={getElevatedSurfaceColor(runtime.theme.mode, runtime.theme.surfaceColor)}
      padding="$4"
      shadowColor={runtime.theme.mode === 'dark' ? '#000000' : '#64748b'}
      shadowOpacity={runtime.theme.mode === 'dark' ? 0.24 : 0.1}
      shadowRadius={18}
      shadowOffset={{ width: 0, height: 10 }}
    >
      <YStack gap="$3">
        <XStack alignItems="center" justifyContent="space-between" gap="$3">
          <YStack
            width={42}
            height={42}
            borderRadius={14}
            alignItems="center"
            justifyContent="center"
            backgroundColor={runtime.theme.primarySoftColor}
          >
            <Icon color={runtime.theme.primaryColor} size={22} strokeWidth={2} />
          </YStack>
          <Text color={runtime.theme.mutedTextColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 13)} fontWeight="700">
            {records.length} records
          </Text>
        </XStack>
        <YStack gap="$1">
          <Text color={runtime.theme.textColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 28)} lineHeight={getScaledFontSize(runtime.theme, 34)} fontWeight="900">
            {formatAggregateValue(value, node.aggregate, runtime.currency)}
          </Text>
          <Text color={runtime.theme.textColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 15)} fontWeight="800">
            {node.title}
          </Text>
          {node.subtitle ? (
            <Paragraph color={runtime.theme.mutedTextColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 13)} lineHeight={getScaledFontSize(runtime.theme, 18)}>
              {node.subtitle}
            </Paragraph>
          ) : null}
        </YStack>
      </YStack>
    </Card>
  );
}

function CategoryBreakdownWidget({ node }: ComponentRenderProps) {
  const runtime = useRuntime();
  const rows = getCategoryRows(getNodeRecords(runtime, node), node.categoryField, node.amountField);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <Card
      width="100%"
      borderWidth={runtime.theme.mode === 'dark' ? 1 : 0}
      borderColor={runtime.theme.mode === 'dark' ? '#1f2937' : '#e5e7eb'}
      borderRadius={getNativeRadius(runtime.theme.radiusValue)}
      backgroundColor={getElevatedSurfaceColor(runtime.theme.mode, runtime.theme.surfaceColor)}
      padding="$4"
      shadowColor={runtime.theme.mode === 'dark' ? '#000000' : '#64748b'}
      shadowOpacity={runtime.theme.mode === 'dark' ? 0.22 : 0.1}
      shadowRadius={18}
      shadowOffset={{ width: 0, height: 10 }}
    >
      <YStack gap="$4">
        <XStack alignItems="center" justifyContent="space-between" gap="$3">
          <YStack gap="$1">
            <Text color={runtime.theme.textColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 18)} fontWeight="900">
              {node.title}
            </Text>
            <Text color={runtime.theme.mutedTextColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 13)} fontWeight="700">
              {formatCurrency(total, runtime.currency)} total
            </Text>
          </YStack>
          <BarChart3 color={runtime.theme.primaryColor} size={24} strokeWidth={2} />
        </XStack>
        <YStack gap="$3">
          {rows.map((row) => {
            const percentage = total > 0 ? row.amount / total : 0;
            return (
              <YStack key={row.category} gap="$1.5">
                <XStack alignItems="center" justifyContent="space-between" gap="$3">
                  <Text flex={1} numberOfLines={1} color={runtime.theme.textColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 14)} fontWeight="800">
                    {row.category}
                  </Text>
                  <Text color={runtime.theme.mutedTextColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 13)} fontWeight="800">
                    {formatCurrency(row.amount, runtime.currency)}
                  </Text>
                </XStack>
                <YStack height={8} borderRadius={999} backgroundColor={getInsetSurfaceColor(runtime.theme.mode)} overflow="hidden">
                  <YStack width={`${Math.max(percentage * 100, 3)}%`} height="100%" borderRadius={999} backgroundColor={runtime.theme.primaryColor} />
                </YStack>
              </YStack>
            );
          })}
        </YStack>
      </YStack>
    </Card>
  );
}

function TimelineWidget({ node }: ComponentRenderProps) {
  const runtime = useRuntime();
  const records = getNodeRecords(runtime, node)
    .sort((left, right) => asText(right[node.dateField ?? '']).localeCompare(asText(left[node.dateField ?? ''])))
    .slice(0, node.limit ?? 8);

  return (
    <Card
      width="100%"
      borderWidth={runtime.theme.mode === 'dark' ? 1 : 0}
      borderColor={runtime.theme.mode === 'dark' ? '#1f2937' : '#e5e7eb'}
      borderRadius={getNativeRadius(runtime.theme.radiusValue)}
      backgroundColor={getElevatedSurfaceColor(runtime.theme.mode, runtime.theme.surfaceColor)}
      padding="$4"
      shadowColor={runtime.theme.mode === 'dark' ? '#000000' : '#64748b'}
      shadowOpacity={runtime.theme.mode === 'dark' ? 0.22 : 0.1}
      shadowRadius={18}
      shadowOffset={{ width: 0, height: 10 }}
    >
      <YStack gap="$4">
        <Text color={runtime.theme.textColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 18)} fontWeight="900">
          {node.title}
        </Text>
        <YStack gap="$3">
          {records.map((record) => (
            <XStack key={record.id} gap="$3" alignItems="flex-start">
              <YStack
                width={36}
                height={36}
                borderRadius={18}
                alignItems="center"
                justifyContent="center"
                backgroundColor={runtime.theme.primarySoftColor}
                flexShrink={0}
              >
                <Receipt color={runtime.theme.primaryColor} size={18} strokeWidth={2} />
              </YStack>
              <YStack flex={1} minWidth={0} gap="$1">
                <XStack alignItems="center" justifyContent="space-between" gap="$3">
                  <Text flex={1} numberOfLines={1} color={runtime.theme.textColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 15)} fontWeight="800">
                    {asText(record[node.titleField ?? 'title'])}
                  </Text>
                  <Text color={runtime.theme.textColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 14)} fontWeight="900">
                    {formatCurrency(toNumber(record[node.amountField ?? 'amount']), runtime.currency)}
                  </Text>
                </XStack>
                <Text numberOfLines={1} color={runtime.theme.mutedTextColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={getScaledFontSize(runtime.theme, 13)}>
                  {[formatDate(asText(record[node.dateField ?? ''])), asText(record[node.categoryField ?? '']), asText(record[node.subtitleField ?? ''])]
                    .filter(Boolean)
                    .join('  ')}
                </Text>
              </YStack>
            </XStack>
          ))}
        </YStack>
      </YStack>
    </Card>
  );
}

function TableContainer({ node }: ComponentRenderProps) {
  const runtime = useRuntime();
  const records = getNodeRecords(runtime, node).slice(0, node.limit ?? 50);
  const table = runtime.app.tables.find((candidate) => candidate.tableName === node.datasource?.table);
  const columns = node.columns ?? table?.fields.slice(0, 4).map((field) => ({ field: field.name, label: toTitle(field.name) })) ?? [];

  if (columns.length === 0) {
    return null;
  }

  return (
    <YStack
      width="100%"
      borderWidth={1}
      borderColor={runtime.theme.mode === 'dark' ? '#1f2937' : '#e5e7eb'}
      borderRadius={getNativeRadius(runtime.theme.radiusValue)}
      backgroundColor={getElevatedSurfaceColor(runtime.theme.mode, runtime.theme.surfaceColor)}
      overflow="hidden"
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <YStack minWidth={Math.max(columns.length * 132, 480)}>
          <XStack backgroundColor={getInsetSurfaceColor(runtime.theme.mode)} borderBottomWidth={1} borderBottomColor={runtime.theme.borderColor}>
            {columns.map((column) => (
              <Text key={column.field} width={132} padding="$3" color={runtime.theme.mutedTextColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={12} fontWeight="900">
                {column.label ?? toTitle(column.field)}
              </Text>
            ))}
          </XStack>
          {records.map((record) => (
            <XStack key={record.id} borderBottomWidth={1} borderBottomColor={runtime.theme.borderColor}>
              {columns.map((column) => {
                const field = table?.fields.find((candidate) => candidate.name === column.field);
                return (
                  <Text key={column.field} width={132} padding="$3" color={runtime.theme.textColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={13} numberOfLines={1}>
                    {formatRecordValue(record[column.field], field?.type, runtime.currency)}
                  </Text>
                );
              })}
            </XStack>
          ))}
        </YStack>
      </ScrollView>
    </YStack>
  );
}

export const registry: ComponentRegistry = {
  'container.screen': Screen,
  'container.stack': Stack,
  'container.grid': Grid,
  'container.list': List,
  'container.card': CardContainer,
  'container.table': TableContainer,
  'complex.modal': ModalContainer,
  'primitive.text': TextPrimitive,
  'primitive.button': ButtonPrimitive,
  'primitive.checkbox': CheckboxPrimitive,
  'primitive.switch': SwitchPrimitive,
  'primitive.radiogroup': RadioGroupPrimitive,
  'primitive.checkboxgroup': CheckboxGroupPrimitive,
  'primitive.input': InputPrimitive,
  'primitive.datepicker': DatePickerPrimitive,
  'primitive.select': SelectPrimitive,
  'primitive.badge': BadgePrimitive,
  'primitive.divider': DividerPrimitive,
  'primitive.progressbar': ProgressBarPrimitive,
  'widget.statcard': StatCardWidget,
  'widget.category-breakdown': CategoryBreakdownWidget,
  'widget.timeline': TimelineWidget,
};

function getButtonIcon(icon: string | undefined, actionType: string | undefined) {
  if (icon === 'edit') {
    return Pencil;
  }

  if (icon === 'trash') {
    return Trash2;
  }

  if (icon === 'calendar') {
    return Calendar;
  }

  if (icon === 'plus' || actionType === 'openModal') {
    return Plus;
  }

  return undefined;
}

function getBoundField(app: AppDefinition, bind: string | undefined) {
  if (!bind) {
    return undefined;
  }

  for (const table of app.tables) {
    const field = table.fields.find((candidate) => candidate.name === bind);
    if (field) {
      return field;
    }
  }

  return undefined;
}

function getNativeInputProps(type: FieldType | undefined) {
  if (!type) {
    return {};
  }

  if (Platform.OS === 'web') {
    if (type === 'date' || type === 'datetime') {
      return { type: type === 'datetime' ? 'datetime-local' : 'date' };
    }

    if (['number', 'decimal', 'percentage', 'currency'].includes(type)) {
      return { type: 'number', inputMode: 'decimal' as const };
    }
  }

  if (['number', 'decimal', 'percentage', 'currency'].includes(type)) {
    return {
      inputMode: 'decimal' as const,
    };
  }

  if (type !== 'date' && type !== 'datetime') {
    return {};
  }

  return {
    inputMode: 'numeric' as const,
    placeholder: type === 'datetime' ? 'YYYY-MM-DD HH:MM' : 'YYYY-MM-DD',
  };
}

function getNodeRecords(runtime: ReturnType<typeof useRuntime>, node: NodeDefinition) {
  const tableName = node.datasource?.table;
  if (!tableName) {
    return [];
  }

  const canList = runtime.app.data.operations.some((operation) => operation.table === tableName && operation.type === 'list');
  return canList ? applyDatasource(runtime.repository.getRecords(tableName), node.datasource) : [];
}

function aggregateRecords(records: ReturnType<typeof getNodeRecords>, aggregate: NodeDefinition['aggregate']) {
  if (!aggregate || aggregate.fn === 'count') {
    return records.length;
  }

  const values = records.map((record) => toNumber(record[aggregate.field ?? ''])).filter((value) => Number.isFinite(value));
  const sum = values.reduce((total, value) => total + value, 0);

  return aggregate.fn === 'avg' && values.length > 0 ? sum / values.length : sum;
}

function getCategoryRows(records: ReturnType<typeof getNodeRecords>, categoryField = 'category', amountField = 'amount') {
  const totals = new Map<string, number>();

  records.forEach((record) => {
    const category = asText(record[categoryField]) || 'Other';
    totals.set(category, (totals.get(category) ?? 0) + toNumber(record[amountField]));
  });

  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((left, right) => right.amount - left.amount);
}

function toNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number.parseFloat(asText(value));
  return Number.isFinite(number) ? number : 0;
}

function formatAggregateValue(value: number, aggregate: NodeDefinition['aggregate'], currency: string) {
  return aggregate?.format === 'currency' ? formatCurrency(value, currency) : formatNumber(value);
}

function formatRecordValue(value: unknown, fieldType: FieldType | undefined, currency: string) {
  if (fieldType === 'currency') {
    return formatCurrency(toNumber(value), currency);
  }

  if (fieldType === 'date') {
    return formatDate(asText(value));
  }

  return asText(value);
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: value % 1 === 0 ? 0 : 1 }).format(value);
}

function formatDate(value: string) {
  if (!value) {
    return '';
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function PressableLikeButton({
  active,
  label,
  theme,
  onPress,
}: {
  active: boolean;
  label: string;
  theme: ReturnType<typeof useRuntime>['theme'];
  onPress: () => void;
}) {
  return (
    <Button
      size="$3"
      chromeless={!active}
      minHeight={42}
      height="auto"
      paddingVertical="$2.5"
      backgroundColor={active ? theme.primaryColor : getInsetSurfaceColor(theme.mode)}
      borderWidth={active ? 0 : 1}
      borderColor={theme.mode === 'dark' ? '#1f2937' : '#e2e8f0'}
      borderRadius={999}
      color={active ? theme.primaryContrastColor : theme.textColor}
      fontFamily={theme.fontFamilyValue}
      pressStyle={{ scale: 0.98, opacity: 0.82 }}
      onPress={onPress}
    >
      {label}
    </Button>
  );
}

function toTitle(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getWidgetIcon(icon: string | undefined) {
  if (icon === 'repeat') {
    return Repeat;
  }

  if (icon === 'receipt') {
    return Receipt;
  }

  return WalletCards;
}
