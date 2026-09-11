import { z } from 'zod';

export const radiusSchema = z.enum(['sm', 'md', 'lg']);
export const themeModeSchema = z.enum(['light', 'dark', 'system']);
export const themeFontFamilySchema = z.enum(['system', 'serif', 'mono', 'rounded']);

export type AppThemeMode = z.infer<typeof themeModeSchema>;
export type AppThemeFontFamily = z.infer<typeof themeFontFamilySchema>;

export type AppThemeDefinition = {
  mode: AppThemeMode;
  light: AppThemePalette;
  dark: AppThemePalette;
  radius: 'sm' | 'md' | 'lg';
  fontScale: number;
  fontFamily: AppThemeFontFamily;
};

export type AppThemePalette = {
  primaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  successColor: string;
  dangerColor: string;
};

export type AppThemeOverride = Partial<Omit<AppThemeDefinition, 'light' | 'dark'>> & {
  light?: Partial<AppThemePalette>;
  dark?: Partial<AppThemePalette>;
};

const colorSchema = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
const lightPaletteDefaults: AppThemePalette = {
  primaryColor: '#0f766e',
  backgroundColor: '#f8fafc',
  surfaceColor: '#ffffff',
  textColor: '#0f172a',
  mutedTextColor: '#64748b',
  borderColor: '#dbe3ea',
  successColor: '#0f766e',
  dangerColor: '#dc2626',
};

const darkPaletteDefaults: AppThemePalette = {
  primaryColor: '#2dd4bf',
  backgroundColor: '#0b1120',
  surfaceColor: '#111827',
  textColor: '#f8fafc',
  mutedTextColor: '#94a3b8',
  borderColor: '#263244',
  successColor: '#34d399',
  dangerColor: '#f87171',
};

const themeDefaults: AppThemeDefinition = {
  mode: 'light',
  light: lightPaletteDefaults,
  dark: darkPaletteDefaults,
  radius: 'md',
  fontScale: 1,
  fontFamily: 'system',
};

const createPaletteSchema = (defaults: AppThemePalette) =>
  z.object({
    primaryColor: colorSchema.default(defaults.primaryColor),
    backgroundColor: colorSchema.default(defaults.backgroundColor),
    surfaceColor: colorSchema.default(defaults.surfaceColor),
    textColor: colorSchema.default(defaults.textColor),
    mutedTextColor: colorSchema.default(defaults.mutedTextColor),
    borderColor: colorSchema.default(defaults.borderColor),
    successColor: colorSchema.default(defaults.successColor),
    dangerColor: colorSchema.default(defaults.dangerColor),
  });

const lightPaletteSchema = createPaletteSchema(lightPaletteDefaults);
const darkPaletteSchema = createPaletteSchema(darkPaletteDefaults);

const themeShape = {
  mode: themeModeSchema.default(themeDefaults.mode),
  light: lightPaletteSchema.default(lightPaletteDefaults),
  dark: darkPaletteSchema.default(darkPaletteDefaults),
  radius: radiusSchema.default(themeDefaults.radius),
  fontScale: z.number().positive().min(0.75).max(1.5).default(themeDefaults.fontScale),
  fontFamily: themeFontFamilySchema.default(themeDefaults.fontFamily),
};

export const appThemeSchema: z.ZodType<AppThemeDefinition> = z.object(themeShape).default(themeDefaults);

export const appThemeOverrideSchema: z.ZodType<AppThemeOverride> = z.object({
  mode: themeModeSchema.optional(),
  light: lightPaletteSchema.partial().optional(),
  dark: darkPaletteSchema.partial().optional(),
  radius: radiusSchema.optional(),
  fontScale: z.number().positive().min(0.75).max(1.5).optional(),
  fontFamily: themeFontFamilySchema.optional(),
});

export type ResolvedThemeMode = 'light' | 'dark';

export type ResolvedAppTheme = AppThemePalette & {
  requestedMode: AppThemeMode;
  mode: ResolvedThemeMode;
  primaryContrastColor: string;
  primarySoftColor: string;
  radiusValue: number;
  fontScale: number;
  fontFamily: AppThemeFontFamily;
  fontFamilyValue: string | undefined;
};

const radiusValues: Record<AppThemeDefinition['radius'], number> = {
  sm: 6,
  md: 10,
  lg: 16,
};

const fontFamilyValues: Record<AppThemeFontFamily, string | undefined> = {
  system: '$body',
  serif: '$body',
  mono: '$body',
  rounded: '$body',
};

export function resolveAppTheme(
  appTheme: AppThemeDefinition,
  externalOverride?: AppThemeOverride,
  systemMode: ResolvedThemeMode = 'light',
): ResolvedAppTheme {
  const merged = appThemeSchema.parse({
    ...appTheme,
    ...externalOverride,
    light: {
      ...appTheme.light,
      ...externalOverride?.light,
    },
    dark: {
      ...appTheme.dark,
      ...externalOverride?.dark,
    },
  });
  const mode = merged.mode === 'system' ? systemMode : merged.mode;
  const palette = mode === 'dark' ? merged.dark : merged.light;
  const primaryRgb = hexToRgb(palette.primaryColor);

  return {
    ...palette,
    requestedMode: merged.mode,
    mode,
    primaryContrastColor: getReadableTextColor(primaryRgb),
    primarySoftColor: mode === 'dark' ? mixWithBlack(primaryRgb, 0.58) : mixWithWhite(primaryRgb, 0.9),
    radiusValue: radiusValues[merged.radius],
    fontScale: merged.fontScale,
    fontFamily: 'system',
    fontFamilyValue: fontFamilyValues.system,
  };
}

export function getScaledFontSize(theme: ResolvedAppTheme, baseSize: number) {
  return Math.round(baseSize * theme.fontScale);
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((character) => `${character}${character}`)
          .join('')
      : normalized;

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function getReadableTextColor({ r, g, b }: { r: number; g: number; b: number }) {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? '#111827' : '#ffffff';
}

function mixWithWhite({ r, g, b }: { r: number; g: number; b: number }, whiteRatio: number) {
  const mix = (channel: number) => Math.round(channel + (255 - channel) * whiteRatio);
  const toHex = (channel: number) => channel.toString(16).padStart(2, '0');

  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function mixWithBlack({ r, g, b }: { r: number; g: number; b: number }, blackRatio: number) {
  const mix = (channel: number) => Math.round(channel * (1 - blackRatio));
  const toHex = (channel: number) => channel.toString(16).padStart(2, '0');

  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}
