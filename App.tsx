import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Bot, CheckCircle2, CheckSquare, ChevronLeft, DownloadCloud, LayoutGrid, Monitor, Moon, Package, Plus, RefreshCcw, Settings, Sparkles, Sun, Wand2, WalletCards, X as XIcon } from 'lucide-react-native';
import { Button, Input, Paragraph, TamaguiProvider, Text, Theme, XStack, YStack } from 'tamagui';
import tamaguiConfig from './tamagui.config';
import {
  AiProviderConfig,
  AiProviderPresetId,
  aiProviderPresets,
  createAiProviderConfigFromPreset,
  defaultAiProviderConfig,
  validateAiProviderConfig,
} from './src/ai/providerConfig';
import { loadAiProviderConfig, saveAiProviderConfig } from './src/ai/providerConfigStore';
import { generateAppMutation } from './src/ai/appMutator';
import { AppVersionRecord, loadAppVersions, saveAppVersionRecord } from './src/ai/appVersionStore';
import { saveAppVersionToSupabase } from './src/ai/appVersionSupabase';
import {
  SupabaseAuthSession,
  SupabaseOrganization,
  SupabaseProjectConfig,
  createSupabaseCloudSyncConfig,
  getExternalSupabaseProjectConfig,
  loadSupabaseAuthState,
  refreshSessionIfNeeded,
  saveSupabaseAuthState,
  saveSupabaseOrganization,
  signInWithSupabasePassword,
  signOutOfSupabase,
  signUpWithSupabasePassword,
  validateSupabaseProjectConfig,
} from './src/auth/supabaseAuth';
import { getTemplateCatalog, InstallableTemplateSource, InstalledTemplateRecord, parseTemplateBundle, TemplateBundle, toInstalledTemplateRecord } from './src/apps/catalog';
import { loadInstalledTemplates, saveInstalledTemplate } from './src/apps/installedTemplateStore';
import { fetchTemplateCatalogSources } from './src/apps/templateCatalog';
import { loadTemplateCatalogUrl, saveTemplateCatalogUrl } from './src/apps/templateCatalogUrlStore';
import { getExternalAppTemplates, getExternalTemplateCatalogUrl, getExternalTemplateSources, getExternalThemeOverride } from './src/config/themeOverride';
import { SupabaseCloudSyncConfig, withCloudSyncRepository } from './src/data/cloudSync';
import { loadLanguagePreference, saveLanguagePreference } from './src/i18n/languageStore';
import { defaultLanguage, LanguageCode, supportedLanguages, translate, TranslationKey } from './src/i18n/translations';
import { createRepository } from './src/data/repository';
import { NodeDefinition } from './src/schema/appDefinition.schema';
import { dispatchAction } from './src/renderer/actions';
import { AppRuntimeProvider, useRuntime } from './src/renderer/AppRuntime';
import { RendererNode } from './src/renderer/RendererNode';
import { AppThemeMode, AppThemeOverride, appThemeOverrideSchema, resolveAppTheme } from './src/theme/theme';

const PRODUCT_NAME = 'AppFoundry';
type ShellThemePreset = {
  id: string;
  name: string;
  light: Pick<AppThemeOverride, 'light'>['light'];
  dark: Pick<AppThemeOverride, 'dark'>['dark'];
};

const shellThemePresets: ShellThemePreset[] = [
  {
    id: 'clarity',
    name: 'Clarity',
    light: { backgroundColor: '#f8fafc', surfaceColor: '#ffffff', textColor: '#0f172a', mutedTextColor: '#64748b', borderColor: '#dbe3ea' },
    dark: { backgroundColor: '#0b1120', surfaceColor: '#111827', textColor: '#f8fafc', mutedTextColor: '#94a3b8', borderColor: '#263244' },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    light: { backgroundColor: '#f4f4f5', surfaceColor: '#ffffff', textColor: '#18181b', mutedTextColor: '#71717a', borderColor: '#d4d4d8' },
    dark: { backgroundColor: '#09090b', surfaceColor: '#18181b', textColor: '#fafafa', mutedTextColor: '#a1a1aa', borderColor: '#3f3f46' },
  },
  {
    id: 'field',
    name: 'Field',
    light: { backgroundColor: '#f6f8f4', surfaceColor: '#ffffff', textColor: '#172014', mutedTextColor: '#64705f', borderColor: '#d7dfd1' },
    dark: { backgroundColor: '#0c130b', surfaceColor: '#162014', textColor: '#f5f8f2', mutedTextColor: '#a3ad9d', borderColor: '#2c3928' },
  },
  {
    id: 'studio',
    name: 'Studio',
    light: { backgroundColor: '#fbf7f8', surfaceColor: '#ffffff', textColor: '#211417', mutedTextColor: '#745f65', borderColor: '#ead9dd' },
    dark: { backgroundColor: '#170d10', surfaceColor: '#211417', textColor: '#fff7f8', mutedTextColor: '#c9aeb6', borderColor: '#432831' },
  },
];

const accentColors = ['#2563eb', '#0f766e', '#7c3aed', '#be123c', '#c2410c', '#4f46e5'];

const currencyOptions = [
  { code: 'USD', label: 'USD' },
  { code: 'INR', label: 'INR' },
  { code: 'EUR', label: 'EUR' },
  { code: 'GBP', label: 'GBP' },
  { code: 'SGD', label: 'SGD' },
  { code: 'AUD', label: 'AUD' },
] as const;

type CurrencyCode = (typeof currencyOptions)[number]['code'];

type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errorMessage: string };

type TemplateInstallStatus =
  | { type: 'idle'; message: string }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

type TemplateCatalogStatus =
  | { type: 'idle'; message: string }
  | { type: 'loading'; message: string }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

type SupabaseAuthStatus =
  | { type: 'loading'; message: string }
  | { type: 'signed-out'; message: string }
  | { type: 'signed-in'; message: string }
  | { type: 'error'; message: string };

type AiBuildStatus =
  | { type: 'idle'; message: string }
  | { type: 'loading'; message: string }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

type OnboardingStepId = 'language' | 'connect' | 'account' | 'organization' | 'apps';

type OnboardingStatus =
  | { type: 'idle'; message: string }
  | { type: 'loading'; message: string }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

const defaultSupabaseTableName = 'ministore_records';
const onboardingSteps: Array<{ id: OnboardingStepId; labelKey: TranslationKey }> = [
  { id: 'language', labelKey: 'onboarding.stepLanguage' },
  { id: 'connect', labelKey: 'onboarding.stepCloud' },
  { id: 'account', labelKey: 'onboarding.stepAccount' },
  { id: 'organization', labelKey: 'onboarding.stepOrg' },
  { id: 'apps', labelKey: 'onboarding.stepApps' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const colorScheme = useColorScheme();
  const systemMode = colorScheme === 'dark' ? 'dark' : 'light';
  const themeOverride = parseThemeOverride(getExternalThemeOverride());
  const externalTemplates = useMemo(() => getExternalAppTemplates(), []);
  const externalTemplateSources = useMemo(() => getExternalTemplateSources(), []);
  const [installedTemplates, setInstalledTemplates] = useState<InstalledTemplateRecord[]>([]);
  const [remoteTemplateSources, setRemoteTemplateSources] = useState<InstallableTemplateSource[]>([]);
  const catalog = useMemo(() => getTemplateCatalog([...externalTemplates, ...installedTemplates]), [externalTemplates, installedTemplates]);
  const bootAppId = useMemo(() => getBootAppId(catalog), [catalog]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(bootAppId);
  const [selectedThemeMode, setSelectedThemeMode] = useState<AppThemeMode | null>(null);
  const [selectedThemePresetId, setSelectedThemePresetId] = useState(shellThemePresets[0].id);
  const [selectedAccentColor, setSelectedAccentColor] = useState(accentColors[0]);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('USD');
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(defaultLanguage);
  const [languagePreferenceLoaded, setLanguagePreferenceLoaded] = useState(false);
  const [languagePreferenceSaved, setLanguagePreferenceSaved] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateCatalogUrl, setTemplateCatalogUrl] = useState(() => getExternalTemplateCatalogUrl());
  const [templateCatalogStatus, setTemplateCatalogStatus] = useState<TemplateCatalogStatus>({ type: 'idle', message: '' });
  const [loadingTemplateCatalog, setLoadingTemplateCatalog] = useState(false);
  const [templateInstallUrl, setTemplateInstallUrl] = useState('');
  const [templateInstallStatus, setTemplateInstallStatus] = useState<TemplateInstallStatus>({ type: 'idle', message: '' });
  const [installingTemplate, setInstallingTemplate] = useState(false);
  const [launchingAppId, setLaunchingAppId] = useState<string | null>(null);
  const [supabaseProject, setSupabaseProject] = useState<SupabaseProjectConfig | null>(() => getExternalSupabaseProjectConfig());
  const [supabaseSession, setSupabaseSession] = useState<SupabaseAuthSession | null>(null);
  const [supabaseUrl, setSupabaseUrl] = useState(() => supabaseProject?.supabaseUrl ?? '');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(() => supabaseProject?.supabaseAnonKey ?? '');
  const [supabaseTableName, setSupabaseTableName] = useState(() => supabaseProject?.tableName ?? defaultSupabaseTableName);
  const [supabaseEmail, setSupabaseEmail] = useState('');
  const [supabasePassword, setSupabasePassword] = useState('');
  const [supabaseAuthStatus, setSupabaseAuthStatus] = useState<SupabaseAuthStatus>({
    type: 'loading',
    message: 'Checking Supabase session...',
  });
  const [supabaseAuthBusy, setSupabaseAuthBusy] = useState(false);
  const [supabaseOrganization, setSupabaseOrganization] = useState<SupabaseOrganization | null>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStepId>('language');
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>({ type: 'idle', message: '' });
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [aiProviderConfig, setAiProviderConfig] = useState<AiProviderConfig>(defaultAiProviderConfig);
  const [aiSettingsStatus, setAiSettingsStatus] = useState<AiBuildStatus>({ type: 'idle', message: '' });
  const [aiCustomizeOpen, setAiCustomizeOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBuildStatus, setAiBuildStatus] = useState<AiBuildStatus>({ type: 'idle', message: '' });
  const [aiBuildBusy, setAiBuildBusy] = useState(false);
  const [appVersions, setAppVersions] = useState<AppVersionRecord[]>([]);
  const t = useMemo(() => createTranslator(selectedLanguage), [selectedLanguage]);
  const launchProgress = useRef(new Animated.Value(0)).current;
  const selectedTemplate = catalog.find((template) => template.app.appId === selectedAppId) ?? null;
  const selectedThemePreset = shellThemePresets.find((preset) => preset.id === selectedThemePresetId) ?? shellThemePresets[0];
  const installableTemplateSources = useMemo(
    () => mergeTemplateSources([...externalTemplateSources, ...remoteTemplateSources]),
    [externalTemplateSources, remoteTemplateSources],
  );
  const availableTemplateSources = useMemo(
    () => getAvailableTemplateSources(installableTemplateSources, catalog, installedTemplates),
    [catalog, installableTemplateSources, installedTemplates],
  );
  const globalThemeOverride = useMemo(
    () =>
      createGlobalThemeOverride({
        baseOverride: themeOverride.success ? themeOverride.data : {},
        preset: selectedThemePreset,
        accentColor: selectedAccentColor,
        mode: selectedThemeMode ?? (themeOverride.success ? themeOverride.data.mode ?? 'system' : 'system'),
      }),
    [selectedAccentColor, selectedThemeMode, selectedThemePreset, themeOverride],
  );
  const cloudSyncConfig = useMemo(
    () => createSupabaseCloudSyncConfig(supabaseProject, supabaseSession),
    [supabaseProject, supabaseSession],
  );
  const selectLanguageForOnboarding = async (language: LanguageCode) => {
    setSelectedLanguage(language);
    setLanguagePreferenceSaved(true);
    await saveLanguagePreference(language);
    setOnboardingStep(getNextOnboardingStep(supabaseProject, supabaseSession, supabaseOrganization, onboardingCompletedAt, true));
  };

  const selectLanguageFromSettings = async (language: LanguageCode) => {
    setSelectedLanguage(language);
    setLanguagePreferenceSaved(true);
    await saveLanguagePreference(language);
  };

  const loadRemoteTemplateCatalog = async (urlOverride?: string, persistUrl = true) => {
    const sourceUrl = (urlOverride ?? templateCatalogUrl).trim();
    if (!sourceUrl) {
      setTemplateCatalogStatus({ type: 'error', message: t('status.enterTemplateCatalogUrl') });
      return;
    }

    const normalizedUrl = normalizeTemplateUrl(sourceUrl);
    if (!isHttpUrl(normalizedUrl)) {
      setTemplateCatalogStatus({ type: 'error', message: t('status.invalidTemplateCatalogUrl') });
      return;
    }

    setLoadingTemplateCatalog(true);
    setTemplateCatalogStatus({ type: 'loading', message: t('status.loadingTemplateCatalog') });

    try {
      const result = await fetchTemplateCatalogSources(normalizedUrl);
      if (!result.success) {
        throw new Error(result.errorMessage);
      }

      setRemoteTemplateSources(result.sources);
      if (persistUrl) {
        await saveTemplateCatalogUrl(sourceUrl);
      }
      setTemplateCatalogStatus({
        type: 'success',
        message: t('status.loadedTemplateCatalog', { count: result.sources.length }),
      });
    } catch (error) {
      setTemplateCatalogStatus({
        type: 'error',
        message: error instanceof Error ? error.message : t('status.unableLoadTemplateCatalog'),
      });
    } finally {
      setLoadingTemplateCatalog(false);
    }
  };

  useEffect(() => {
    let active = true;

    loadInstalledTemplates()
      .then((templates) => {
        if (active) {
          setInstalledTemplates(templates);
        }
      })
      .catch((error) => {
        console.warn('Unable to load installed templates.', error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    loadTemplateCatalogUrl()
      .then((storedUrl) => {
        if (!active) {
          return;
        }

        const configuredUrl = getExternalTemplateCatalogUrl().trim();
        const catalogUrl = configuredUrl || storedUrl.trim();
        if (!catalogUrl) {
          return;
        }

        setTemplateCatalogUrl(catalogUrl);
        void loadRemoteTemplateCatalog(catalogUrl, Boolean(storedUrl && !configuredUrl));
      })
      .catch((error) => {
        console.warn('Unable to load template catalog URL.', error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    loadLanguagePreference()
      .then((language) => {
        if (!active) {
          return;
        }

        if (language) {
          setSelectedLanguage(language);
          setLanguagePreferenceSaved(true);
        }
        setLanguagePreferenceLoaded(true);
      })
      .catch((error) => {
        console.warn('Unable to load language preference.', error);
        if (active) {
          setLanguagePreferenceLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    loadAiProviderConfig()
      .then((config) => {
        if (active) {
          setAiProviderConfig(config);
        }
      })
      .catch((error) => {
        console.warn('Unable to load AI provider settings.', error);
      });

    loadAppVersions()
      .then((versions) => {
        if (active) {
          setAppVersions(versions);
        }
      })
      .catch((error) => {
        console.warn('Unable to load app version history.', error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!languagePreferenceLoaded) {
      return () => {
        active = false;
      };
    }

    loadSupabaseAuthState()
      .then(async (stored) => {
        if (!active) {
          return;
        }

        const externalProject = getExternalSupabaseProjectConfig();
        const project = externalProject ?? stored.project;
        const session = stored.session;

        setSupabaseOrganization(stored.organization);
        setOrganizationName(stored.organization?.name ?? '');
        setOnboardingCompletedAt(stored.onboardingCompletedAt);
        setOnboardingStep(
          getNextOnboardingStep(project, session, stored.organization, stored.onboardingCompletedAt, languagePreferenceSaved),
        );

        if (project) {
          setSupabaseProject(project);
          setSupabaseUrl(project.supabaseUrl);
          setSupabaseAnonKey(project.supabaseAnonKey);
          setSupabaseTableName(project.tableName ?? defaultSupabaseTableName);
        }

        if (!project) {
          setSupabaseAuthStatus({ type: 'signed-out', message: t('status.connectProject') });
          return;
        }

        if (!session) {
          setSupabaseAuthStatus({ type: 'signed-out', message: t('status.signInToSync') });
          return;
        }

        try {
          const refreshedSession = await refreshSessionIfNeeded(project, session);
          if (!active) {
            return;
          }
          setSupabaseSession(refreshedSession);
          setSupabaseEmail(refreshedSession.email ?? '');
          await saveSupabaseAuthState({
            project,
            session: refreshedSession,
            organization: stored.organization,
            onboardingCompletedAt: stored.onboardingCompletedAt,
          });
          setSupabaseAuthStatus({ type: 'signed-in', message: t('status.syncingAs', { identity: refreshedSession.email ?? refreshedSession.userId }) });
        } catch (error) {
          if (!active) {
            return;
          }
          await saveSupabaseAuthState({
            project,
            session: null,
            organization: stored.organization,
            onboardingCompletedAt: null,
          });
          setSupabaseSession(null);
          setOnboardingCompletedAt(null);
          setOnboardingStep('account');
          setSupabaseAuthStatus({ type: 'error', message: getErrorMessage(error) });
        }
      })
      .catch((error) => {
        if (active) {
          setSupabaseAuthStatus({ type: 'error', message: getErrorMessage(error) });
        }
      });

    return () => {
      active = false;
    };
  }, [languagePreferenceLoaded, languagePreferenceSaved, t]);

  const getSupabaseProjectFromForm = (): SupabaseProjectConfig => ({
    supabaseUrl: supabaseUrl.trim(),
    supabaseAnonKey: supabaseAnonKey.trim(),
    tableName: supabaseTableName.trim() || defaultSupabaseTableName,
  });

  const signInToSupabase = async () => {
    const project = getSupabaseProjectFromForm();
    const validationError = validateSupabaseProjectConfig(project);
    if (validationError) {
      setSupabaseAuthStatus({ type: 'error', message: validationError });
      return;
    }

    if (!supabaseEmail.trim() || !supabasePassword) {
      setSupabaseAuthStatus({ type: 'error', message: t('status.enterEmailPassword') });
      return;
    }

    setSupabaseAuthBusy(true);
    setSupabaseAuthStatus({ type: 'loading', message: t('status.signingIn') });
    setOnboardingStatus({ type: 'loading', message: t('status.signingIn') });

    try {
      const session = await signInWithSupabasePassword({ project, email: supabaseEmail, password: supabasePassword });
      setSupabaseProject(project);
      setSupabaseSession(session);
      setSupabasePassword('');
      await saveSupabaseAuthState({
        project,
        session,
        organization: supabaseOrganization,
        onboardingCompletedAt,
      });
      setSupabaseAuthStatus({ type: 'signed-in', message: t('status.syncingAs', { identity: session.email ?? session.userId }) });
      setOnboardingStatus({ type: 'success', message: t('status.signedIn') });
      setOnboardingStep(supabaseOrganization ? 'apps' : 'organization');
    } catch (error) {
      setSupabaseAuthStatus({ type: 'error', message: getErrorMessage(error) });
      setOnboardingStatus({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setSupabaseAuthBusy(false);
    }
  };

  const signUpToSupabase = async () => {
    const project = getSupabaseProjectFromForm();
    const validationError = validateSupabaseProjectConfig(project);
    if (validationError) {
      setSupabaseAuthStatus({ type: 'error', message: validationError });
      return;
    }

    if (!supabaseEmail.trim() || !supabasePassword) {
      setSupabaseAuthStatus({ type: 'error', message: t('status.enterEmailPassword') });
      return;
    }

    setSupabaseAuthBusy(true);
    setSupabaseAuthStatus({ type: 'loading', message: t('status.creatingAccount') });
    setOnboardingStatus({ type: 'loading', message: t('status.creatingAccount') });

    try {
      const session = await signUpWithSupabasePassword({ project, email: supabaseEmail, password: supabasePassword });
      if (!session) {
        setSupabaseProject(project);
        setSupabaseSession(null);
        setSupabasePassword('');
        await saveSupabaseAuthState({
          project,
          session: null,
          organization: supabaseOrganization,
          onboardingCompletedAt: null,
        });
        setSupabaseAuthStatus({ type: 'signed-out', message: t('status.confirmEmail') });
        setOnboardingStatus({ type: 'success', message: t('status.confirmEmail') });
        setOnboardingStep('account');
        return;
      }

      setSupabaseProject(project);
      setSupabaseSession(session);
      setSupabasePassword('');
      await saveSupabaseAuthState({
        project,
        session,
        organization: supabaseOrganization,
        onboardingCompletedAt,
      });
      setSupabaseAuthStatus({ type: 'signed-in', message: t('status.syncingAs', { identity: session.email ?? session.userId }) });
      setOnboardingStatus({ type: 'success', message: t('status.accountCreated') });
      setOnboardingStep(supabaseOrganization ? 'apps' : 'organization');
    } catch (error) {
      setSupabaseAuthStatus({ type: 'error', message: getErrorMessage(error) });
      setOnboardingStatus({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setSupabaseAuthBusy(false);
    }
  };

  const signOutFromSupabase = async () => {
    const project = supabaseProject ?? getSupabaseProjectFromForm();
    setSupabaseAuthBusy(true);
    setSupabaseAuthStatus({ type: 'loading', message: t('status.signingOut') });

    try {
      await signOutOfSupabase(project, supabaseSession);
      setSupabaseSession(null);
      setOnboardingCompletedAt(null);
      await saveSupabaseAuthState({
        project,
        session: null,
        organization: supabaseOrganization,
        onboardingCompletedAt: null,
      });
      setSupabaseAuthStatus({ type: 'signed-out', message: t('status.signedOut') });
      setOnboardingStep('account');
    } catch (error) {
      setSupabaseAuthStatus({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setSupabaseAuthBusy(false);
    }
  };

  const installTemplateFromUrl = async (urlOverride?: string) => {
    const sourceUrl = (urlOverride ?? templateInstallUrl).trim();
    if (!sourceUrl) {
      setTemplateInstallStatus({ type: 'error', message: t('status.enterTemplateUrl') });
      return null;
    }

    const normalizedUrl = normalizeTemplateUrl(sourceUrl);
    if (!isHttpUrl(normalizedUrl)) {
      setTemplateInstallStatus({ type: 'error', message: t('status.invalidTemplateUrl') });
      return null;
    }

    setInstallingTemplate(true);
    setTemplateInstallStatus({ type: 'idle', message: t('status.downloadingTemplate') });

    try {
      const response = await fetch(normalizedUrl);
      if (!response.ok) {
        throw new Error(`Download failed with HTTP ${response.status}.`);
      }

      const payload = await response.json();
      const parsed = parseTemplateBundle(payload, 'installed');
      if (!parsed.success) {
        throw new Error(parsed.errorMessage);
      }

      const installedTemplate = toInstalledTemplateRecord(parsed.data, sourceUrl);
      await saveInstalledTemplate(installedTemplate);
      setInstalledTemplates((current) => [
        ...current.filter(
          (template) => template.app.appId !== installedTemplate.app.appId && template.url !== installedTemplate.url,
        ),
        installedTemplate,
      ]);
      if (!urlOverride) {
        setTemplateInstallUrl('');
      }
      setTemplateInstallStatus({ type: 'success', message: t('status.installedTemplate', { name: installedTemplate.app.name }) });
      return installedTemplate;
    } catch (error) {
      setTemplateInstallStatus({
        type: 'error',
        message: error instanceof Error ? error.message : t('status.unableInstallTemplate'),
      });
      return null;
    } finally {
      setInstallingTemplate(false);
    }
  };

  const saveSupabaseProjectForOnboarding = async () => {
    const project = getSupabaseProjectFromForm();
    const validationError = validateSupabaseProjectConfig(project);
    if (validationError) {
      setOnboardingStatus({ type: 'error', message: validationError });
      return;
    }

    setSupabaseProject(project);
    await saveSupabaseAuthState({
      project,
      session: supabaseSession,
      organization: supabaseOrganization,
      onboardingCompletedAt,
    });
    setOnboardingStatus({ type: 'success', message: t('status.manualProjectConnected') });
    setOnboardingStep(supabaseSession ? (supabaseOrganization ? 'apps' : 'organization') : 'account');
  };

  const saveOrganizationForOnboarding = async () => {
    const name = organizationName.trim();
    if (!name) {
      setOnboardingStatus({ type: 'error', message: t('status.enterOrganization') });
      return;
    }

    if (!supabaseProject || !supabaseSession) {
      setOnboardingStatus({ type: 'error', message: t('status.signInBeforeOrg') });
      setOnboardingStep(supabaseProject ? 'account' : 'connect');
      return;
    }

    setOnboardingBusy(true);
    setOnboardingStatus({ type: 'loading', message: t('status.settingUpOrg') });

    try {
      const organization = await saveSupabaseOrganization({
        project: supabaseProject,
        session: supabaseSession,
        organizationName: name,
      });
      setSupabaseOrganization(organization);
      await saveSupabaseAuthState({
        project: supabaseProject,
        session: supabaseSession,
        organization,
        onboardingCompletedAt,
      });
      setOnboardingStatus({ type: 'success', message: t('status.orgReady', { name: organization.name }) });
      setOnboardingStep('apps');
    } catch (error) {
      setOnboardingStatus({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setOnboardingBusy(false);
    }
  };

  const completeOnboarding = async () => {
    if (!supabaseProject || !supabaseSession || !supabaseOrganization) {
      setOnboardingStep(getNextOnboardingStep(supabaseProject, supabaseSession, supabaseOrganization, null, languagePreferenceSaved));
      setOnboardingStatus({ type: 'error', message: t('status.finishRequired') });
      return;
    }

    setOnboardingBusy(true);
    setOnboardingStatus({ type: 'loading', message: t('status.finishingSetup') });

    try {
      const completedAt = new Date().toISOString();
      setOnboardingCompletedAt(completedAt);
      await saveSupabaseAuthState({
        project: supabaseProject,
        session: supabaseSession,
        organization: supabaseOrganization,
        onboardingCompletedAt: completedAt,
      });
      setOnboardingStatus({ type: 'success', message: t('status.setupComplete') });
    } catch (error) {
      setOnboardingStatus({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setOnboardingBusy(false);
    }
  };

  const selectAiProviderPreset = (presetId: AiProviderPresetId) => {
    setAiProviderConfig((current) => createAiProviderConfigFromPreset(presetId, current));
    setAiSettingsStatus({ type: 'idle', message: '' });
  };

  const updateAiProviderConfig = (patch: Partial<AiProviderConfig>) => {
    setAiProviderConfig((current) => ({ ...current, ...patch }));
    setAiSettingsStatus({ type: 'idle', message: '' });
  };

  const persistAiProviderConfig = async () => {
    const validationError = validateAiProviderConfig(aiProviderConfig);
    if (validationError) {
      setAiSettingsStatus({ type: 'error', message: validationError });
      return;
    }

    try {
      await saveAiProviderConfig(aiProviderConfig);
      setAiSettingsStatus({ type: 'success', message: 'AI provider saved on this device.' });
    } catch (error) {
      setAiSettingsStatus({ type: 'error', message: getErrorMessage(error) });
    }
  };

  const openAiCustomize = () => {
    setAiPrompt('');
    setAiBuildStatus({ type: 'idle', message: '' });
    setAiCustomizeOpen(true);
  };

  const customizeSelectedTemplate = async () => {
    if (!selectedTemplate) {
      return;
    }

    const prompt = aiPrompt.trim();
    if (!prompt) {
      setAiBuildStatus({ type: 'error', message: 'Describe the app change you want.' });
      return;
    }

    const validationError = validateAiProviderConfig(aiProviderConfig);
    if (validationError) {
      setAiBuildStatus({ type: 'error', message: validationError });
      return;
    }

    setAiBuildBusy(true);
    setAiBuildStatus({ type: 'loading', message: 'Asking AI to update the app definition...' });

    try {
      await saveAiProviderConfig(aiProviderConfig);
      const result = await generateAppMutation({
        provider: aiProviderConfig,
        currentApp: selectedTemplate.app,
        prompt,
      });
      const versionRecord = createAppVersionRecord({
        app: result.app,
        prompt,
        providerName: aiProviderConfig.displayName || aiProviderConfig.presetId,
      });
      await saveAppVersionRecord(versionRecord);

      let supabaseSaved = false;
      if (supabaseProject && supabaseSession) {
        await saveAppVersionToSupabase({
          project: supabaseProject,
          session: supabaseSession,
          record: versionRecord,
        });
        supabaseSaved = true;
      }

      const installedTemplate = toInstalledTemplateRecord(
        {
          ...selectedTemplate,
          app: result.app,
          seedData: selectedTemplate.seedData,
          source: 'installed',
        },
        `ai://${result.app.appId}/${versionRecord.id}`,
      );
      installedTemplate.installedAt = versionRecord.createdAt;
      await saveInstalledTemplate(installedTemplate);
      setInstalledTemplates((current) => [
        ...current.filter((template) => template.app.appId !== installedTemplate.app.appId && template.url !== installedTemplate.url),
        installedTemplate,
      ]);
      setAppVersions((current) => [versionRecord, ...current.filter((version) => version.id !== versionRecord.id)]);
      setAiBuildStatus({
        type: 'success',
        message: supabaseSaved
          ? `Saved ${result.app.name} ${result.app.version} locally and in Supabase. ${result.summary}`
          : `Saved ${result.app.name} ${result.app.version} locally. Sign in to Supabase to store future versions in your account. ${result.summary}`,
      });
    } catch (error) {
      setAiBuildStatus({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setAiBuildBusy(false);
    }
  };

  if (!themeOverride.success) {
    return (
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        <Theme name="light">
          <YStack flex={1} padding="$5" justifyContent="center" backgroundColor="$background">
            <Text fontSize="$7" fontWeight="700">Invalid theme override</Text>
            <Paragraph color="$red11">{themeOverride.errorMessage}</Paragraph>
          </YStack>
        </Theme>
      </TamaguiProvider>
    );
  }

  if (!selectedTemplate) {
    const homeTheme = resolveAppTheme(catalog[0].app.theme, globalThemeOverride, systemMode);

    if (!onboardingCompletedAt) {
      return (
        <TamaguiProvider config={tamaguiConfig} defaultTheme={homeTheme.mode}>
          <Theme name={homeTheme.mode}>
            <OnboardingScreen
              theme={homeTheme}
              t={t}
              selectedLanguage={selectedLanguage}
              step={onboardingStep}
              supabaseUrl={supabaseUrl}
              supabaseAnonKey={supabaseAnonKey}
              supabaseTableName={supabaseTableName}
              supabaseEmail={supabaseEmail}
              supabasePassword={supabasePassword}
              supabaseSession={supabaseSession}
              supabaseAuthStatus={supabaseAuthStatus}
              supabaseAuthBusy={supabaseAuthBusy}
              organizationName={organizationName}
              supabaseOrganization={supabaseOrganization}
              onboardingStatus={onboardingStatus}
              onboardingBusy={onboardingBusy}
              onSelectLanguage={selectLanguageForOnboarding}
              onChangeSupabaseUrl={setSupabaseUrl}
              onChangeSupabaseAnonKey={setSupabaseAnonKey}
              onChangeSupabaseTableName={setSupabaseTableName}
              onChangeSupabaseEmail={setSupabaseEmail}
              onChangeSupabasePassword={setSupabasePassword}
              onChangeOrganizationName={setOrganizationName}
              onSaveProject={saveSupabaseProjectForOnboarding}
              onSupabaseSignIn={signInToSupabase}
              onSupabaseSignUp={signUpToSupabase}
              onSaveOrganization={saveOrganizationForOnboarding}
              onComplete={completeOnboarding}
              onBack={setOnboardingStep}
            />
            <StatusBar style={homeTheme.mode === 'dark' ? 'light' : 'dark'} />
          </Theme>
        </TamaguiProvider>
      );
    }

    return (
      <TamaguiProvider config={tamaguiConfig} defaultTheme={homeTheme.mode}>
        <Theme name={homeTheme.mode}>
          <HomeScreen
            catalog={catalog}
            theme={homeTheme}
            t={t}
            selectedLanguage={selectedLanguage}
            settingsOpen={settingsOpen}
            selectedThemeMode={globalThemeOverride.mode ?? homeTheme.requestedMode}
            selectedThemePresetId={selectedThemePreset.id}
            selectedAccentColor={selectedAccentColor}
            selectedCurrency={selectedCurrency}
            installableTemplateSources={availableTemplateSources}
            launchingAppId={launchingAppId}
            launchProgress={launchProgress}
            onOpenSettings={() => setSettingsOpen(true)}
            onCloseSettings={() => setSettingsOpen(false)}
            onSelectThemeMode={setSelectedThemeMode}
            onSelectThemePreset={setSelectedThemePresetId}
            onSelectAccentColor={setSelectedAccentColor}
            onSelectCurrency={setSelectedCurrency}
            onSelectLanguage={selectLanguageFromSettings}
            onInstallTemplateSource={(source) => installTemplateFromUrl(source.url)}
            supabaseUrl={supabaseUrl}
            supabaseAnonKey={supabaseAnonKey}
            supabaseTableName={supabaseTableName}
            supabaseEmail={supabaseEmail}
            supabasePassword={supabasePassword}
            supabaseSession={supabaseSession}
            supabaseAuthStatus={supabaseAuthStatus}
            supabaseAuthBusy={supabaseAuthBusy}
            onChangeSupabaseUrl={setSupabaseUrl}
            onChangeSupabaseAnonKey={setSupabaseAnonKey}
            onChangeSupabaseTableName={setSupabaseTableName}
            onChangeSupabaseEmail={setSupabaseEmail}
            onChangeSupabasePassword={setSupabasePassword}
            onSupabaseSignIn={signInToSupabase}
            onSupabaseSignUp={signUpToSupabase}
            onSupabaseSignOut={signOutFromSupabase}
            aiProviderConfig={aiProviderConfig}
            aiSettingsStatus={aiSettingsStatus}
            onSelectAiProviderPreset={selectAiProviderPreset}
            onChangeAiProviderConfig={updateAiProviderConfig}
            onSaveAiProviderConfig={persistAiProviderConfig}
            onLaunch={(appId) => {
              setLaunchingAppId(appId);
              launchProgress.setValue(0);
              Animated.timing(launchProgress, {
                toValue: 1,
                duration: 280,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start(() => {
                setSelectedAppId(appId);
                setLaunchingAppId(null);
                launchProgress.setValue(0);
              });
            }}
          />
          <StatusBar style={homeTheme.mode === 'dark' ? 'light' : 'dark'} />
        </Theme>
      </TamaguiProvider>
    );
  }

  const runtimeTheme = resolveAppTheme(
    selectedTemplate.app.theme,
    globalThemeOverride,
    systemMode,
  );

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={runtimeTheme.mode}>
      <Theme name={runtimeTheme.mode}>
        <RuntimeErrorBoundary key={`${selectedTemplate.app.appId}:${selectedTemplate.app.version}`} theme={runtimeTheme} t={t} onBack={() => setSelectedAppId(null)}>
          <SelectedTemplateRuntime
            template={selectedTemplate}
            theme={runtimeTheme}
            currency={selectedCurrency}
            cloudSyncConfig={cloudSyncConfig}
            t={t}
            onBack={() => setSelectedAppId(null)}
            onCustomize={openAiCustomize}
          />
        </RuntimeErrorBoundary>
        <AiCustomizeModal
          visible={aiCustomizeOpen}
          theme={runtimeTheme}
          template={selectedTemplate}
          prompt={aiPrompt}
          status={aiBuildStatus}
          busy={aiBuildBusy}
          versionCount={appVersions.filter((version) => version.appId === selectedTemplate.app.appId).length}
          supabaseReady={Boolean(supabaseProject && supabaseSession)}
          onChangePrompt={setAiPrompt}
          onClose={() => setAiCustomizeOpen(false)}
          onSubmit={customizeSelectedTemplate}
        />
        <StatusBar style={runtimeTheme.mode === 'dark' ? 'light' : 'dark'} />
      </Theme>
    </TamaguiProvider>
  );
}

class RuntimeErrorBoundary extends Component<
  {
    children: ReactNode;
    theme: ReturnType<typeof resolveAppTheme>;
    t: Translator;
    onBack: () => void;
  },
  { errorMessage: string | null }
> {
  state: { errorMessage: string | null } = { errorMessage: null };

  static getDerivedStateFromError(error: unknown) {
    return { errorMessage: error instanceof Error ? error.message : 'Unable to open this app.' };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn('App runtime crashed.', error, info.componentStack);
  }

  render() {
    if (!this.state.errorMessage) {
      return this.props.children;
    }

    return (
      <YStack flex={1} backgroundColor={this.props.theme.backgroundColor}>
        <SafeAreaView style={{ flex: 1 }}>
          <YStack flex={1} justifyContent="center" padding="$5" gap="$4">
            <YStack padding="$5" gap="$3" borderRadius={18} borderWidth={1} borderColor={this.props.theme.borderColor} backgroundColor={this.props.theme.surfaceColor}>
              <Text color={this.props.theme.textColor} fontFamily={this.props.theme.fontFamilyValue} fontSize={22} lineHeight={28} fontWeight="900">
                App could not open
              </Text>
              <Paragraph color={this.props.theme.mutedTextColor} fontFamily={this.props.theme.fontFamilyValue} fontSize={14} lineHeight={20}>
                {this.state.errorMessage}
              </Paragraph>
              <PrimaryAction label={this.props.t('common.back')} theme={this.props.theme} onPress={this.props.onBack} />
            </YStack>
          </YStack>
        </SafeAreaView>
      </YStack>
    );
  }
}

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

function createTranslator(language: LanguageCode): Translator {
  return (key, params) => translate(language, key, params);
}

function parseThemeOverride(themeOverride: unknown): ParseResult<AppThemeOverride> {
  const parsed = appThemeOverrideSchema.safeParse(themeOverride);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  return { success: false, errorMessage: parsed.error.message };
}

function createGlobalThemeOverride({
  baseOverride,
  preset,
  accentColor,
  mode,
}: {
  baseOverride: AppThemeOverride;
  preset: ShellThemePreset;
  accentColor: string;
  mode: AppThemeMode;
}): AppThemeOverride {
  return {
    ...baseOverride,
    mode,
    fontFamily: 'system',
    light: {
      ...preset.light,
      ...baseOverride.light,
      primaryColor: accentColor,
      successColor: accentColor,
    },
    dark: {
      ...preset.dark,
      ...baseOverride.dark,
      primaryColor: accentColor,
      successColor: accentColor,
    },
  };
}

function OnboardingScreen({
  theme,
  t,
  selectedLanguage,
  step,
  supabaseUrl,
  supabaseAnonKey,
  supabaseTableName,
  supabaseEmail,
  supabasePassword,
  supabaseSession,
  supabaseAuthStatus,
  supabaseAuthBusy,
  organizationName,
  supabaseOrganization,
  onboardingStatus,
  onboardingBusy,
  onSelectLanguage,
  onChangeSupabaseUrl,
  onChangeSupabaseAnonKey,
  onChangeSupabaseTableName,
  onChangeSupabaseEmail,
  onChangeSupabasePassword,
  onChangeOrganizationName,
  onSaveProject,
  onSupabaseSignIn,
  onSupabaseSignUp,
  onSaveOrganization,
  onComplete,
  onBack,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  selectedLanguage: LanguageCode;
  step: OnboardingStepId;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseTableName: string;
  supabaseEmail: string;
  supabasePassword: string;
  supabaseSession: SupabaseAuthSession | null;
  supabaseAuthStatus: SupabaseAuthStatus;
  supabaseAuthBusy: boolean;
  organizationName: string;
  supabaseOrganization: SupabaseOrganization | null;
  onboardingStatus: OnboardingStatus;
  onboardingBusy: boolean;
  onSelectLanguage: (language: LanguageCode) => void;
  onChangeSupabaseUrl: (value: string) => void;
  onChangeSupabaseAnonKey: (value: string) => void;
  onChangeSupabaseTableName: (value: string) => void;
  onChangeSupabaseEmail: (value: string) => void;
  onChangeSupabasePassword: (value: string) => void;
  onChangeOrganizationName: (value: string) => void;
  onSaveProject: () => void;
  onSupabaseSignIn: () => void;
  onSupabaseSignUp: () => void;
  onSaveOrganization: () => void;
  onComplete: () => void;
  onBack: (step: OnboardingStepId) => void;
}) {
  const { width } = useWindowDimensions();
  const isCompact = width < 520;
  const stepIndex = onboardingSteps.findIndex((candidate) => candidate.id === step);
  const safeStepIndex = stepIndex >= 0 ? stepIndex : 0;
  const status =
    onboardingStatus.message && onboardingStatus.type !== 'idle'
      ? onboardingStatus
      : { type: supabaseAuthStatus.type, message: supabaseAuthStatus.message };
  const statusColor =
    status.type === 'error'
      ? theme.dangerColor
      : status.type === 'success' || status.type === 'signed-in'
        ? theme.successColor
        : theme.mutedTextColor;

  const pageBackground = theme.mode === 'dark' ? '#06111f' : '#dbeafe';
  const cardBackground = theme.mode === 'dark' ? '#0f172a' : '#ffffff';
  const mutedPanelBackground = theme.mode === 'dark' ? '#111827' : '#f8fafc';
  const cardShadow = theme.mode === 'dark' ? '#000000' : '#2563eb';
  const canGoBack = safeStepIndex > 0;
  const previousStep = onboardingSteps[Math.max(safeStepIndex - 1, 0)]?.id ?? 'language';
  const goToStep = (targetStep: OnboardingStepId) => {
    const targetIndex = onboardingSteps.findIndex((candidate) => candidate.id === targetStep);
    if (targetIndex >= 0 && targetIndex <= safeStepIndex) {
      onBack(targetStep);
    }
  };

  return (
    <YStack flex={1} backgroundColor={pageBackground}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            minHeight: '100%',
            paddingHorizontal: isCompact ? 20 : 32,
            paddingTop: isCompact ? 16 : 28,
            paddingBottom: isCompact ? 20 : 32,
            justifyContent: 'center',
          }}
        >
          <YStack
            width="100%"
            minHeight={isCompact ? 690 : 720}
            maxWidth={390}
            alignSelf="center"
            justifyContent="space-between"
            gap="$5"
            padding={isCompact ? '$4' : '$5'}
            borderRadius={30}
            borderWidth={1}
            borderColor={theme.mode === 'dark' ? '#1e293b' : '#e0e7ff'}
            backgroundColor={cardBackground}
            shadowColor={cardShadow}
            shadowOpacity={theme.mode === 'dark' ? 0.28 : 0.24}
            shadowRadius={26}
            shadowOffset={{ width: 0, height: 16 }}
          >
            <YStack gap="$5">
              <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <XStack alignItems="center" gap="$2.5" flex={1} minWidth={0}>
                  <YStack
                    width={36}
                    height={36}
                    borderRadius={10}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={theme.primaryColor}
                    shadowColor={theme.primaryColor}
                    shadowOpacity={0.26}
                    shadowRadius={10}
                    shadowOffset={{ width: 0, height: 5 }}
                  >
                    <Sparkles color={theme.primaryContrastColor} size={18} strokeWidth={2.2} />
                  </YStack>
                  <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={19} lineHeight={24} fontWeight="900" numberOfLines={1}>
                    {PRODUCT_NAME}
                  </Text>
                </XStack>
                {canGoBack ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.back')}
                    onPress={() => onBack(previousStep)}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.68 : 1,
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    })}
                  >
                    <YStack
                      width={36}
                      height={36}
                      alignItems="center"
                      justifyContent="center"
                      borderRadius={18}
                      borderWidth={1}
                      borderColor={theme.borderColor}
                      backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
                    >
                      <ChevronLeft color={theme.textColor} size={18} strokeWidth={2.3} />
                    </YStack>
                  </Pressable>
                ) : null}
              </XStack>
              <OnboardingSlideProgress
                theme={theme}
                t={t}
                step={step}
                stepIndex={safeStepIndex}
                onSelectStep={goToStep}
              />
            </YStack>

            <YStack
              flex={1}
              justifyContent="center"
              gap="$4"
            >
              <YStack minHeight={isCompact ? 460 : 490} justifyContent="center" gap="$4">
                {step === 'language' ? (
                  <OnboardingLanguageStep
                    theme={theme}
                    t={t}
                    selectedLanguage={selectedLanguage}
                    onSelectLanguage={onSelectLanguage}
                  />
                ) : null}
                {step === 'connect' ? (
                  <OnboardingConnectStep
                    theme={theme}
                    t={t}
                    supabaseUrl={supabaseUrl}
                    supabaseAnonKey={supabaseAnonKey}
                    supabaseTableName={supabaseTableName}
                    onChangeSupabaseUrl={onChangeSupabaseUrl}
                    onChangeSupabaseAnonKey={onChangeSupabaseAnonKey}
                    onChangeSupabaseTableName={onChangeSupabaseTableName}
                    onSaveProject={onSaveProject}
                  />
                ) : null}
                {step === 'account' ? (
                  <OnboardingAccountStep
                    theme={theme}
                    t={t}
                    supabaseEmail={supabaseEmail}
                    supabasePassword={supabasePassword}
                    supabaseSession={supabaseSession}
                    supabaseAuthBusy={supabaseAuthBusy}
                    onChangeSupabaseEmail={onChangeSupabaseEmail}
                    onChangeSupabasePassword={onChangeSupabasePassword}
                    onSupabaseSignIn={onSupabaseSignIn}
                    onSupabaseSignUp={onSupabaseSignUp}
                    onContinue={() => onBack(supabaseOrganization ? 'apps' : 'organization')}
                  />
                ) : null}
                {step === 'organization' ? (
                  <OnboardingOrganizationStep
                    theme={theme}
                    t={t}
                    organizationName={organizationName}
                    onboardingBusy={onboardingBusy}
                    onChangeOrganizationName={onChangeOrganizationName}
                    onSaveOrganization={onSaveOrganization}
                  />
                ) : null}
                {step === 'apps' ? (
                  <OnboardingAppsStep
                    theme={theme}
                    t={t}
                    onboardingBusy={onboardingBusy}
                    onComplete={onComplete}
                  />
                ) : null}
              </YStack>
              {status.message ? <OnboardingStatusBanner theme={theme} status={status} statusColor={statusColor} backgroundColor={mutedPanelBackground} /> : null}
            </YStack>

            <XStack justifyContent="center" paddingBottom="$1">
              <Text color={theme.mutedTextColor} textAlign="center" fontFamily={theme.fontFamilyValue} fontSize={12} lineHeight={17} fontWeight="700">
                {t('onboarding.stepCounter', { current: safeStepIndex + 1, total: onboardingSteps.length })}
              </Text>
            </XStack>
          </YStack>
        </ScrollView>
      </SafeAreaView>
    </YStack>
  );
}

function OnboardingSlideProgress({
  theme,
  t,
  step,
  stepIndex,
  onSelectStep,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  step: OnboardingStepId;
  stepIndex: number;
  onSelectStep: (step: OnboardingStepId) => void;
}) {
  const fillPercent = `${((stepIndex + 1) / onboardingSteps.length) * 100}%`;

  return (
    <YStack gap="$2.5">
      <YStack height={7} borderRadius={999} overflow="hidden" backgroundColor={theme.mode === 'dark' ? '#253044' : '#e5e7eb'}>
        <YStack width={fillPercent} height="100%" borderRadius={999} backgroundColor={theme.primaryColor} />
      </YStack>
      <XStack gap="$1.5" alignItems="center" justifyContent="space-between">
        {onboardingSteps.map((item, index) => {
          const active = item.id === step;
          const complete = index < stepIndex;
          const reachable = index <= stepIndex;

          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={t(item.labelKey)}
              disabled={!reachable}
              onPress={() => onSelectStep(item.id)}
              style={({ pressed }) => ({
                flex: 1,
                opacity: pressed ? 0.72 : reachable ? 1 : 0.5,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <Text
                color={active || complete ? theme.primaryColor : theme.mutedTextColor}
                textAlign="center"
                fontFamily={theme.fontFamilyValue}
                fontSize={10}
                lineHeight={14}
                fontWeight={active ? '900' : '700'}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {t(item.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </XStack>
    </YStack>
  );
}

function OnboardingStatusBanner({
  theme,
  status,
  statusColor,
  backgroundColor,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  status: OnboardingStatus | SupabaseAuthStatus;
  statusColor: string;
  backgroundColor?: string;
}) {
  const StatusIcon = status.type === 'error' ? XIcon : CheckCircle2;

  return (
    <XStack
      gap="$2.5"
      alignItems="center"
      paddingHorizontal="$4"
      paddingVertical="$3"
      borderRadius={18}
      borderWidth={1}
      borderColor={theme.borderColor}
      backgroundColor={backgroundColor ?? (theme.mode === 'dark' ? '#101827' : '#ffffff')}
    >
      <YStack width={30} height={30} borderRadius={8} alignItems="center" justifyContent="center" backgroundColor={theme.mode === 'dark' ? '#172033' : '#f8fafc'}>
        <StatusIcon color={statusColor} size={16} strokeWidth={2.2} />
      </YStack>
      <Paragraph flex={1} color={statusColor} fontFamily={theme.fontFamilyValue} fontSize={13} lineHeight={18}>
        {status.message}
      </Paragraph>
    </XStack>
  );
}

function OnboardingLanguageStep({
  theme,
  t,
  selectedLanguage,
  onSelectLanguage,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  selectedLanguage: LanguageCode;
  onSelectLanguage: (language: LanguageCode) => void;
}) {
  return (
    <YStack gap="$5">
      <OnboardingHeader title={t('language.title')} copy={t('language.copy')} theme={theme} />
      <LanguageSelector theme={theme} selectedLanguage={selectedLanguage} onSelectLanguage={onSelectLanguage} />
    </YStack>
  );
}

function OnboardingConnectStep({
  theme,
  t,
  supabaseUrl,
  supabaseAnonKey,
  supabaseTableName,
  onChangeSupabaseUrl,
  onChangeSupabaseAnonKey,
  onChangeSupabaseTableName,
  onSaveProject,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseTableName: string;
  onChangeSupabaseUrl: (value: string) => void;
  onChangeSupabaseAnonKey: (value: string) => void;
  onChangeSupabaseTableName: (value: string) => void;
  onSaveProject: () => void;
}) {
  return (
    <YStack gap="$4">
      <OnboardingHeader title={t('onboarding.cloudTitle')} copy={t('onboarding.cloudCopy')} theme={theme} />
      <YStack gap="$3">
        <LabeledInput label={t('onboarding.projectUrl')} value={supabaseUrl} placeholder="https://project-ref.supabase.co" theme={theme} onChangeText={onChangeSupabaseUrl} />
        <LabeledInput label={t('onboarding.publishableKey')} value={supabaseAnonKey} placeholder="sb_publishable_..." theme={theme} onChangeText={onChangeSupabaseAnonKey} />
        <LabeledInput label={t('onboarding.syncTable')} value={supabaseTableName} placeholder={defaultSupabaseTableName} theme={theme} onChangeText={onChangeSupabaseTableName} />
        <PrimaryAction label={t('onboarding.saveTenantProject')} theme={theme} onPress={onSaveProject} />
      </YStack>
      <Paragraph color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={12} lineHeight={17}>
        {t('onboarding.manualCopy')}
      </Paragraph>
    </YStack>
  );
}

function OnboardingAccountStep({
  theme,
  t,
  supabaseEmail,
  supabasePassword,
  supabaseSession,
  supabaseAuthBusy,
  onChangeSupabaseEmail,
  onChangeSupabasePassword,
  onSupabaseSignIn,
  onSupabaseSignUp,
  onContinue,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  supabaseEmail: string;
  supabasePassword: string;
  supabaseSession: SupabaseAuthSession | null;
  supabaseAuthBusy: boolean;
  onChangeSupabaseEmail: (value: string) => void;
  onChangeSupabasePassword: (value: string) => void;
  onSupabaseSignIn: () => void;
  onSupabaseSignUp: () => void;
  onContinue: () => void;
}) {
  return (
    <YStack gap="$4">
      <OnboardingHeader title={t('onboarding.accountTitle')} copy={t('onboarding.accountCopy')} theme={theme} />
      <LabeledInput label={t('onboarding.email')} value={supabaseEmail} placeholder="you@company.com" keyboardType="email-address" theme={theme} onChangeText={onChangeSupabaseEmail} />
      <LabeledInput label={t('onboarding.password')} value={supabasePassword} placeholder={t('onboarding.password')} secureTextEntry theme={theme} onChangeText={onChangeSupabasePassword} />
      {supabaseSession ? (
        <PrimaryAction label={t('common.continue')} theme={theme} onPress={onContinue} />
      ) : (
        <XStack gap="$2" rowGap="$2" flexWrap="wrap">
          <Button size="$4" minHeight={52} height="auto" paddingVertical="$3" flexGrow={1} disabled={supabaseAuthBusy} backgroundColor={theme.primaryColor} borderRadius={16} color={theme.primaryContrastColor} fontFamily={theme.fontFamilyValue} fontWeight="900" onPress={onSupabaseSignIn}>
            {t('onboarding.signIn')}
          </Button>
          <Button size="$4" minHeight={52} height="auto" paddingVertical="$3" flexGrow={1} disabled={supabaseAuthBusy} backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'} borderWidth={1} borderColor={theme.borderColor} borderRadius={16} color={theme.textColor} fontFamily={theme.fontFamilyValue} fontWeight="900" onPress={onSupabaseSignUp}>
            {t('onboarding.createAccount')}
          </Button>
        </XStack>
      )}
    </YStack>
  );
}

function OnboardingOrganizationStep({
  theme,
  t,
  organizationName,
  onboardingBusy,
  onChangeOrganizationName,
  onSaveOrganization,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  organizationName: string;
  onboardingBusy: boolean;
  onChangeOrganizationName: (value: string) => void;
  onSaveOrganization: () => void;
}) {
  return (
    <YStack gap="$4">
      <OnboardingHeader title={t('onboarding.orgTitle')} copy={t('onboarding.orgCopy')} theme={theme} />
      <LabeledInput label={t('onboarding.orgName')} value={organizationName} placeholder="Riverbend Works" theme={theme} onChangeText={onChangeOrganizationName} />
      <PrimaryAction label={onboardingBusy ? t('onboarding.orgSaving') : t('onboarding.createOrg')} theme={theme} disabled={onboardingBusy} onPress={onSaveOrganization} />
    </YStack>
  );
}

function OnboardingAppsStep({
  theme,
  t,
  onboardingBusy,
  onComplete,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  onboardingBusy: boolean;
  onComplete: () => void;
}) {
  return (
    <YStack gap="$4">
      <OnboardingHeader title={t('onboarding.appsTitle')} copy={t('onboarding.appsCopy')} theme={theme} />
      <YStack padding="$4" borderRadius={18} borderWidth={1} borderColor={theme.borderColor} backgroundColor={theme.mode === 'dark' ? '#172033' : '#f8fafc'}>
        <Paragraph color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={14} lineHeight={21}>
          {t('onboarding.bundledReady')}
        </Paragraph>
      </YStack>
      <PrimaryAction label={onboardingBusy ? t('common.installing') : t('onboarding.finishSetup')} theme={theme} disabled={onboardingBusy} onPress={onComplete} />
    </YStack>
  );
}

function OnboardingHeader({
  eyebrow,
  title,
  copy,
  theme,
  compact,
}: {
  eyebrow?: string;
  title: string;
  copy: string;
  theme: ReturnType<typeof resolveAppTheme>;
  compact?: boolean;
}) {
  return (
    <YStack gap="$2">
      {eyebrow ? (
        <Text color={theme.primaryColor} fontFamily={theme.fontFamilyValue} fontSize={12} lineHeight={15} fontWeight="900">
          {eyebrow}
        </Text>
      ) : null}
      <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={compact ? 20 : 27} lineHeight={compact ? 26 : 34} fontWeight="900">
        {title}
      </Text>
      <Paragraph color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={15} lineHeight={22}>
        {copy}
      </Paragraph>
    </YStack>
  );
}

function LabeledInput({
  label,
  value,
  placeholder,
  keyboardType,
  secureTextEntry,
  theme,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder: string;
  keyboardType?: 'default' | 'email-address';
  secureTextEntry?: boolean;
  theme: ReturnType<typeof resolveAppTheme>;
  onChangeText: (value: string) => void;
}) {
  return (
    <YStack gap="$2">
      <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={13} fontWeight="800">
        {label}
      </Text>
      <Input
        minHeight={52}
        height="auto"
        value={value}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedTextColor as never}
        backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
        borderWidth={1}
        borderColor={theme.borderColor}
        borderRadius={16}
        color={theme.textColor}
        fontFamily={theme.fontFamilyValue}
        fontSize={14}
        lineHeight={20}
        paddingVertical="$3"
        onChangeText={onChangeText}
      />
    </YStack>
  );
}

function PrimaryAction({
  label,
  theme,
  disabled,
  onPress,
}: {
  label: string;
  theme: ReturnType<typeof resolveAppTheme>;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      size="$4"
      minHeight={52}
      height="auto"
      paddingVertical="$3"
      disabled={disabled}
      backgroundColor={theme.primaryColor}
      borderRadius={16}
      color={theme.primaryContrastColor}
      fontFamily={theme.fontFamilyValue}
      fontWeight="900"
      onPress={onPress}
    >
      {label}
    </Button>
  );
}

function SelectedTemplateRuntime({
  template,
  theme,
  currency,
  cloudSyncConfig,
  t,
  onBack,
  onCustomize,
}: {
  template: TemplateBundle;
  theme: ReturnType<typeof resolveAppTheme>;
  currency: CurrencyCode;
  cloudSyncConfig: SupabaseCloudSyncConfig | null;
  t: Translator;
  onBack: () => void;
  onCustomize: () => void;
}) {
  const repository = useMemo(
    () => {
      const localRepository = createRepository({
        appId: template.app.appId,
        adapter: template.app.data.storage.adapter,
        databaseName: template.app.data.storage.databaseName,
        tables: template.app.tables,
        seed: template.seedData,
      });

      return withCloudSyncRepository({
        repository: localRepository,
        app: template.app,
        config: cloudSyncConfig,
      });
    },
    [cloudSyncConfig, template],
  );

  return (
    <AppRuntimeProvider app={template.app} repository={repository} theme={theme} currency={currency}>
      <RuntimeShell t={t} onBack={onBack} onCustomize={onCustomize} />
    </AppRuntimeProvider>
  );
}

function RuntimeShell({
  t,
  onBack,
  onCustomize,
}: {
  t: Translator;
  onBack: () => void;
  onCustomize: () => void;
}) {
  const runtime = useRuntime();
  const topChromeColor = runtime.theme.mode === 'dark' ? '#111827' : '#ffffff';
  const bottomChromeColor = runtime.theme.mode === 'dark' ? '#0f172a' : '#ffffff';
  const modalSurfaceColor = runtime.theme.mode === 'dark' ? '#0f172a' : '#f8fafc';

  return (
    <YStack flex={1} backgroundColor={runtime.theme.backgroundColor}>
      <SafeAreaView style={{ backgroundColor: topChromeColor }}>
        <XStack
          gap="$3"
          alignItems="center"
          justifyContent="space-between"
          paddingHorizontal="$4"
          paddingTop="$2"
          paddingBottom="$3"
          backgroundColor={topChromeColor}
          borderBottomWidth={1}
          borderBottomColor={runtime.theme.mode === 'dark' ? '#1f2937' : '#e5e7eb'}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('runtime.backToProduct', { product: PRODUCT_NAME })}
            onPress={onBack}
            style={({ pressed }) => ({
              opacity: pressed ? 0.68 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <XStack alignItems="center" gap="$1" minHeight={40}>
              <ChevronLeft color={runtime.theme.primaryColor} size={22} strokeWidth={2.2} />
              <Text color={runtime.theme.primaryColor} fontFamily={runtime.theme.fontFamilyValue} fontSize={17} fontWeight="700">
                {t('runtime.apps')}
              </Text>
            </XStack>
          </Pressable>
          <Text
            flex={1}
            numberOfLines={1}
            textAlign="center"
            color={runtime.theme.textColor}
            fontFamily={runtime.theme.fontFamilyValue}
            fontSize={17}
            fontWeight="800"
          >
            {runtime.app.name}
          </Text>
          <XStack width={92} justifyContent="flex-end" alignItems="center" gap="$1">
            <IconButton accessibilityLabel="Customize app with AI" theme={runtime.theme} onPress={onCustomize}>
              <Wand2 color={runtime.theme.primaryColor} size={19} strokeWidth={2.2} />
            </IconButton>
            <RuntimeSyncControl t={t} />
          </XStack>
        </XStack>
      </SafeAreaView>
      <YStack flex={1}>
        <RendererNode node={runtime.activePage.layout} />
        <RuntimeFab hasBottomNavigation={runtime.app.navigation.items.length > 1} />
      </YStack>
      {runtime.app.navigation.items.length > 1 ? (
        <SafeAreaView style={{ backgroundColor: bottomChromeColor }}>
          <RuntimeNavigation />
        </SafeAreaView>
      ) : null}
      <Modal visible={runtime.modalPage !== null} animationType="slide" presentationStyle="pageSheet">
        <Theme name={runtime.theme.mode}>
          <SafeAreaView style={{ flex: 1, backgroundColor: modalSurfaceColor }}>
            <YStack flex={1} backgroundColor={modalSurfaceColor}>
              <XStack alignItems="center" justifyContent="space-between" paddingHorizontal="$4" paddingTop="$2" paddingBottom="$3">
                <YStack width={44} />
                <Text flex={1} textAlign="center" fontFamily={runtime.theme.fontFamilyValue} fontSize={17} fontWeight="800" color={runtime.theme.textColor}>
                  {runtime.modalPage?.title}
                </Text>
                <IconButton accessibilityLabel={t('runtime.closeModal')} theme={runtime.theme} onPress={runtime.closeModal}>
                  <XIcon color={runtime.theme.primaryColor} size={21} strokeWidth={2.2} />
                </IconButton>
              </XStack>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                contentContainerStyle={{
                  paddingBottom: 28,
                }}
              >
                {runtime.modalPage ? <RendererNode node={runtime.modalPage.layout} /> : null}
              </ScrollView>
            </YStack>
          </SafeAreaView>
        </Theme>
      </Modal>
    </YStack>
  );
}

function RuntimeSyncControl({ t }: { t: Translator }) {
  const runtime = useRuntime();
  const status = runtime.syncStatus;

  if (status.phase === 'disabled') {
    return <YStack width={72} />;
  }

  const isError = status.phase === 'error';
  const isSyncing = status.phase === 'syncing';
  const color = isError ? '#dc2626' : isSyncing || status.pendingCount > 0 ? runtime.theme.primaryColor : runtime.theme.mutedTextColor;
  const label =
    status.pendingCount > 0
      ? `${status.pendingCount}`
      : isError
        ? '!'
        : 'OK';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isError
          ? t('runtime.retrySync', { message: status.lastError ?? t('runtime.lastSyncFailed') })
          : t('runtime.syncNow')
      }
      onPress={runtime.forceSync}
      style={({ pressed }) => ({
        opacity: pressed ? 0.68 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <XStack width={72} minHeight={40} alignItems="center" justifyContent="flex-end" gap="$1">
        <RefreshCcw color={color} size={16} strokeWidth={2.2} />
        <Text color={color} fontFamily={runtime.theme.fontFamilyValue} fontSize={11} fontWeight="800">
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

function RuntimeFab({ hasBottomNavigation }: { hasBottomNavigation: boolean }) {
  const runtime = useRuntime();
  const fabNode = findFabNode(runtime.activePage.layout);
  const webBottomOffset = hasBottomNavigation ? 92 : 20;

  if (!fabNode) {
    return null;
  }

  return (
    <YStack
      position="absolute"
      right={Platform.OS === 'web' ? undefined : '$5'}
      bottom={Platform.OS === 'web' ? undefined : '$5'}
      zIndex={30}
      elevation={30}
      style={Platform.OS === 'web' ? { position: 'fixed', right: 20, bottom: webBottomOffset } : undefined}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fabNode.label}
        onPress={() => dispatchAction(fabNode.action, runtime, null)}
        style={({ pressed }) => ({
          alignItems: 'center',
          justifyContent: 'center',
          width: 62,
          height: 62,
          borderRadius: 31,
          backgroundColor: runtime.theme.primaryColor,
          opacity: pressed ? 0.86 : 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
          shadowColor: runtime.theme.mode === 'dark' ? '#000000' : runtime.theme.primaryColor,
          shadowOpacity: runtime.theme.mode === 'dark' ? 0.42 : 0.26,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
        })}
      >
        <Plus color={runtime.theme.primaryContrastColor} size={28} strokeWidth={2.2} />
      </Pressable>
    </YStack>
  );
}

function findFabNode(node: NodeDefinition): NodeDefinition | null {
  if (
    node.kind === 'primitive' &&
    node.type === 'button' &&
    (node.variant === 'fab' || (node.action?.type === 'openModal' && node.action.target?.toLowerCase().includes('add')))
  ) {
    return node;
  }

  for (const child of node.children ?? []) {
    const match = findFabNode(child);
    if (match) {
      return match;
    }
  }

  return null;
}

function RuntimeNavigation() {
  const runtime = useRuntime();

  return (
    <XStack
      gap="$2"
      paddingHorizontal="$4"
      paddingTop="$2"
      paddingBottom="$2"
      backgroundColor={runtime.theme.mode === 'dark' ? '#0f172a' : '#ffffff'}
      borderTopWidth={1}
      borderTopColor={runtime.theme.mode === 'dark' ? '#1f2937' : '#e5e7eb'}
      justifyContent="center"
    >
      {runtime.app.navigation.items.map((item) => {
        const active = runtime.activePage.pageId === item.pageId;

        return (
          <Button
            key={item.pageId}
            size="$3"
            chromeless={!active}
            backgroundColor={active ? runtime.theme.primaryColor : 'transparent'}
            borderRadius={999}
            color={active ? runtime.theme.primaryContrastColor : runtime.theme.mutedTextColor}
            fontFamily={runtime.theme.fontFamilyValue}
            minHeight={38}
            height="auto"
            paddingVertical="$2"
            onPress={() => runtime.navigate(item.pageId)}
          >
            {item.label}
          </Button>
        );
      })}
    </XStack>
  );
}

function HomeScreen({
  catalog,
  theme,
  t,
  selectedLanguage,
  settingsOpen,
  selectedThemeMode,
  selectedThemePresetId,
  selectedAccentColor,
  selectedCurrency,
  installableTemplateSources,
  launchingAppId,
  launchProgress,
  onOpenSettings,
  onCloseSettings,
  onSelectThemeMode,
  onSelectThemePreset,
  onSelectAccentColor,
  onSelectCurrency,
  onSelectLanguage,
  onInstallTemplateSource,
  supabaseUrl,
  supabaseAnonKey,
  supabaseTableName,
  supabaseEmail,
  supabasePassword,
  supabaseSession,
  supabaseAuthStatus,
  supabaseAuthBusy,
  onChangeSupabaseUrl,
  onChangeSupabaseAnonKey,
  onChangeSupabaseTableName,
  onChangeSupabaseEmail,
  onChangeSupabasePassword,
  onSupabaseSignIn,
  onSupabaseSignUp,
  onSupabaseSignOut,
  aiProviderConfig,
  aiSettingsStatus,
  onSelectAiProviderPreset,
  onChangeAiProviderConfig,
  onSaveAiProviderConfig,
  onLaunch,
}: {
  catalog: TemplateBundle[];
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  selectedLanguage: LanguageCode;
  settingsOpen: boolean;
  selectedThemeMode: AppThemeMode;
  selectedThemePresetId: string;
  selectedAccentColor: string;
  selectedCurrency: CurrencyCode;
  installableTemplateSources: InstallableTemplateSource[];
  launchingAppId: string | null;
  launchProgress: Animated.Value;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onSelectThemeMode: (mode: AppThemeMode) => void;
  onSelectThemePreset: (presetId: string) => void;
  onSelectAccentColor: (accentColor: string) => void;
  onSelectCurrency: (currency: CurrencyCode) => void;
  onSelectLanguage: (language: LanguageCode) => void;
  onInstallTemplateSource: (source: InstallableTemplateSource) => void;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseTableName: string;
  supabaseEmail: string;
  supabasePassword: string;
  supabaseSession: SupabaseAuthSession | null;
  supabaseAuthStatus: SupabaseAuthStatus;
  supabaseAuthBusy: boolean;
  onChangeSupabaseUrl: (value: string) => void;
  onChangeSupabaseAnonKey: (value: string) => void;
  onChangeSupabaseTableName: (value: string) => void;
  onChangeSupabaseEmail: (value: string) => void;
  onChangeSupabasePassword: (value: string) => void;
  onSupabaseSignIn: () => void;
  onSupabaseSignUp: () => void;
  onSupabaseSignOut: () => void;
  aiProviderConfig: AiProviderConfig;
  aiSettingsStatus: AiBuildStatus;
  onSelectAiProviderPreset: (presetId: AiProviderPresetId) => void;
  onChangeAiProviderConfig: (patch: Partial<AiProviderConfig>) => void;
  onSaveAiProviderConfig: () => void;
  onLaunch: (appId: string) => void;
}) {
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 430 ? 22 : 32;
  const contentWidth = Math.min(width - horizontalPadding * 2, 900);
  const isCompact = width < 520;
  const compactColumns = 3;
  const launcherGap = isCompact ? 20 : 24;
  const tileWidth = isCompact ? Math.floor((contentWidth - launcherGap * (compactColumns - 1)) / compactColumns) : 116;
  const iconSize = isCompact ? 76 : 84;
  const launchingTemplate = catalog.find((template) => template.app.appId === launchingAppId) ?? null;

  return (
    <YStack flex={1} backgroundColor={theme.backgroundColor}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            minHeight: '100%',
            paddingHorizontal: horizontalPadding,
            paddingTop: isCompact ? 26 : 40,
            paddingBottom: 42,
          }}
        >
          <YStack width="100%" maxWidth={900} alignSelf="center" gap="$7">
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
              <Text
                flexShrink={1}
                numberOfLines={1}
                fontSize={isCompact ? 32 : 40}
                lineHeight={isCompact ? 38 : 46}
                fontWeight="800"
                fontFamily={theme.fontFamilyValue}
                color={theme.textColor}
              >
                {PRODUCT_NAME}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('home.openSettings')}
                onPress={onOpenSettings}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.72 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                })}
              >
                <YStack
                  width={42}
                  height={42}
                  borderRadius={21}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
                  borderWidth={1}
                  borderColor={theme.borderColor}
                >
                  <Settings color={theme.textColor} size={20} strokeWidth={2.1} />
                </YStack>
              </Pressable>
            </XStack>

            <YStack gap="$3">
              <Text fontSize={15} fontWeight="700" fontFamily={theme.fontFamilyValue} color={theme.mutedTextColor}>
                {t('home.installedApps')}
              </Text>
              <XStack gap={launcherGap} rowGap={28} flexWrap="wrap" alignItems="flex-start">
                {catalog.map((template) => (
                  <LauncherAppTile
                    key={template.app.appId}
                    template={template}
                    theme={theme}
                    width={tileWidth}
                    iconSize={iconSize}
                    onLaunch={onLaunch}
                  />
                ))}
              </XStack>
            </YStack>

            <YStack gap="$3">
              <Text fontSize={15} fontWeight="700" fontFamily={theme.fontFamilyValue} color={theme.mutedTextColor}>
                {t('home.appsToInstall')}
              </Text>
              {installableTemplateSources.length > 0 ? (
                <XStack gap="$3" rowGap="$3" flexWrap="wrap" alignItems="stretch">
                  {installableTemplateSources.map((source) => (
                    <InstallableTemplateTile
                      key={source.id}
                      source={source}
                      theme={theme}
                      t={t}
                      onInstall={() => onInstallTemplateSource(source)}
                    />
                  ))}
                </XStack>
              ) : (
                <YStack
                  width="100%"
                  padding="$4"
                  borderWidth={1}
                  borderColor={theme.borderColor}
                  borderRadius={16}
                  backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
                >
                  <Paragraph color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={14} lineHeight={20}>
                    {t('home.noCuratedApps')}
                  </Paragraph>
                </YStack>
              )}
            </YStack>
          </YStack>
        </ScrollView>
      </SafeAreaView>
      <LauncherSettingsModal
        visible={settingsOpen}
        theme={theme}
        t={t}
        selectedLanguage={selectedLanguage}
        selectedThemeMode={selectedThemeMode}
        selectedThemePresetId={selectedThemePresetId}
        selectedAccentColor={selectedAccentColor}
        selectedCurrency={selectedCurrency}
        onClose={onCloseSettings}
        onSelectThemeMode={onSelectThemeMode}
        onSelectThemePreset={onSelectThemePreset}
        onSelectAccentColor={onSelectAccentColor}
        onSelectCurrency={onSelectCurrency}
        onSelectLanguage={onSelectLanguage}
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnonKey}
        supabaseTableName={supabaseTableName}
        supabaseEmail={supabaseEmail}
        supabasePassword={supabasePassword}
        supabaseSession={supabaseSession}
        supabaseAuthStatus={supabaseAuthStatus}
        supabaseAuthBusy={supabaseAuthBusy}
        onChangeSupabaseUrl={onChangeSupabaseUrl}
        onChangeSupabaseAnonKey={onChangeSupabaseAnonKey}
        onChangeSupabaseTableName={onChangeSupabaseTableName}
        onChangeSupabaseEmail={onChangeSupabaseEmail}
        onChangeSupabasePassword={onChangeSupabasePassword}
        onSupabaseSignIn={onSupabaseSignIn}
        onSupabaseSignUp={onSupabaseSignUp}
        onSupabaseSignOut={onSupabaseSignOut}
        aiProviderConfig={aiProviderConfig}
        aiSettingsStatus={aiSettingsStatus}
        onSelectAiProviderPreset={onSelectAiProviderPreset}
        onChangeAiProviderConfig={onChangeAiProviderConfig}
        onSaveAiProviderConfig={onSaveAiProviderConfig}
      />
      {launchingTemplate ? (
        <LaunchOverlay template={launchingTemplate} theme={theme} progress={launchProgress} />
      ) : null}
    </YStack>
  );
}

function LauncherSettingsModal({
  visible,
  theme,
  t,
  selectedLanguage,
  selectedThemeMode,
  selectedThemePresetId,
  selectedAccentColor,
  selectedCurrency,
  onClose,
  onSelectThemeMode,
  onSelectThemePreset,
  onSelectAccentColor,
  onSelectCurrency,
  onSelectLanguage,
  supabaseUrl,
  supabaseAnonKey,
  supabaseTableName,
  supabaseEmail,
  supabasePassword,
  supabaseSession,
  supabaseAuthStatus,
  supabaseAuthBusy,
  onChangeSupabaseUrl,
  onChangeSupabaseAnonKey,
  onChangeSupabaseTableName,
  onChangeSupabaseEmail,
  onChangeSupabasePassword,
  onSupabaseSignIn,
  onSupabaseSignUp,
  onSupabaseSignOut,
  aiProviderConfig,
  aiSettingsStatus,
  onSelectAiProviderPreset,
  onChangeAiProviderConfig,
  onSaveAiProviderConfig,
}: {
  visible: boolean;
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  selectedLanguage: LanguageCode;
  selectedThemeMode: AppThemeMode;
  selectedThemePresetId: string;
  selectedAccentColor: string;
  selectedCurrency: CurrencyCode;
  onClose: () => void;
  onSelectThemeMode: (mode: AppThemeMode) => void;
  onSelectThemePreset: (presetId: string) => void;
  onSelectAccentColor: (accentColor: string) => void;
  onSelectCurrency: (currency: CurrencyCode) => void;
  onSelectLanguage: (language: LanguageCode) => void;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseTableName: string;
  supabaseEmail: string;
  supabasePassword: string;
  supabaseSession: SupabaseAuthSession | null;
  supabaseAuthStatus: SupabaseAuthStatus;
  supabaseAuthBusy: boolean;
  onChangeSupabaseUrl: (value: string) => void;
  onChangeSupabaseAnonKey: (value: string) => void;
  onChangeSupabaseTableName: (value: string) => void;
  onChangeSupabaseEmail: (value: string) => void;
  onChangeSupabasePassword: (value: string) => void;
  onSupabaseSignIn: () => void;
  onSupabaseSignUp: () => void;
  onSupabaseSignOut: () => void;
  aiProviderConfig: AiProviderConfig;
  aiSettingsStatus: AiBuildStatus;
  onSelectAiProviderPreset: (presetId: AiProviderPresetId) => void;
  onChangeAiProviderConfig: (patch: Partial<AiProviderConfig>) => void;
  onSaveAiProviderConfig: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Theme name={theme.mode}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
          <YStack flex={1} backgroundColor={theme.backgroundColor}>
            <XStack alignItems="center" justifyContent="space-between" paddingHorizontal="$4" paddingTop="$2" paddingBottom="$3">
              <YStack width={44} />
              <Text flex={1} textAlign="center" color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={17} fontWeight="900">
                {t('settings.title')}
              </Text>
              <IconButton accessibilityLabel={t('settings.close')} theme={theme} onPress={onClose}>
                <XIcon color={theme.primaryColor} size={21} strokeWidth={2.2} />
              </IconButton>
            </XStack>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 18,
                paddingTop: 12,
                paddingBottom: 32,
                alignItems: 'center',
              }}
            >
              <YStack width="100%" maxWidth={760} gap="$5">
                <YStack gap="$3">
                  <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={20} fontWeight="900">
                    {t('settings.appearance')}
                  </Text>
                  <ThemeModeControl selectedMode={selectedThemeMode} theme={theme} t={t} onSelect={onSelectThemeMode} />
                </YStack>
                <YStack gap="$3">
                  <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={16} fontWeight="900">
                    {t('language.settingsTitle')}
                  </Text>
                  <LanguageSelector theme={theme} selectedLanguage={selectedLanguage} onSelectLanguage={onSelectLanguage} compact />
                </YStack>
                <YStack gap="$3">
                  <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={16} fontWeight="900">
                    {t('settings.theme')}
                  </Text>
                  <XStack gap="$3" rowGap="$3" flexWrap="wrap">
                    {shellThemePresets.map((preset) => {
                      const active = preset.id === selectedThemePresetId;
                      return (
                        <Pressable
                          key={preset.id}
                          accessibilityRole="button"
                          accessibilityLabel={preset.name}
                          onPress={() => onSelectThemePreset(preset.id)}
                          style={({ pressed }) => ({
                            width: 148,
                            opacity: pressed ? 0.72 : 1,
                            transform: [{ scale: pressed ? 0.98 : 1 }],
                          })}
                        >
                          <YStack
                            gap="$2.5"
                            padding="$3"
                            borderRadius={18}
                            backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
                            borderWidth={active ? 2 : 1}
                            borderColor={active ? theme.primaryColor : theme.borderColor}
                          >
                            <XStack gap="$1.5">
                              <YStack width={34} height={34} borderRadius={10} backgroundColor={preset.light?.backgroundColor} borderWidth={1} borderColor={theme.borderColor} />
                              <YStack width={34} height={34} borderRadius={10} backgroundColor={preset.light?.surfaceColor} borderWidth={1} borderColor={theme.borderColor} />
                              <YStack width={34} height={34} borderRadius={10} backgroundColor={preset.dark?.surfaceColor} borderWidth={1} borderColor={theme.borderColor} />
                            </XStack>
                            <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={14} fontWeight="800">
                              {preset.name}
                            </Text>
                          </YStack>
                        </Pressable>
                      );
                    })}
                  </XStack>
                </YStack>
                <YStack gap="$3">
                  <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={16} fontWeight="900">
                    {t('settings.accent')}
                  </Text>
                  <XStack gap="$3" rowGap="$3" flexWrap="wrap">
                    {accentColors.map((accentColor) => {
                      const active = accentColor === selectedAccentColor;
                      return (
                        <Pressable
                          key={accentColor}
                          accessibilityRole="button"
                          accessibilityLabel={`Use accent color ${accentColor}`}
                          onPress={() => onSelectAccentColor(accentColor)}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.72 : 1,
                            transform: [{ scale: pressed ? 0.94 : 1 }],
                          })}
                        >
                          <YStack
                            width={44}
                            height={44}
                            borderRadius={22}
                            alignItems="center"
                            justifyContent="center"
                            borderWidth={active ? 3 : 1}
                            borderColor={active ? theme.textColor : theme.borderColor}
                          >
                            <YStack width={32} height={32} borderRadius={16} backgroundColor={accentColor} />
                          </YStack>
                        </Pressable>
                      );
                    })}
                  </XStack>
                </YStack>
                <YStack gap="$3">
                  <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={16} fontWeight="900">
                    {t('settings.currency')}
                  </Text>
                  <XStack gap="$2" rowGap="$2" flexWrap="wrap">
                    {currencyOptions.map((currency) => {
                      const active = currency.code === selectedCurrency;
                      return (
                        <Button
                          key={currency.code}
                          size="$3"
                          chromeless={!active}
                          minHeight={42}
                          height="auto"
                          paddingVertical="$2.5"
                          backgroundColor={active ? theme.primaryColor : theme.mode === 'dark' ? '#172033' : '#ffffff'}
                          borderWidth={active ? 0 : 1}
                          borderColor={theme.borderColor}
                          borderRadius={999}
                          color={active ? theme.primaryContrastColor : theme.textColor}
                          fontFamily={theme.fontFamilyValue}
                          onPress={() => onSelectCurrency(currency.code)}
                        >
                          {currency.label}
                        </Button>
                      );
                    })}
                  </XStack>
                </YStack>
                <SupabaseSettingsSection
                  theme={theme}
                  t={t}
                  supabaseUrl={supabaseUrl}
                  supabaseAnonKey={supabaseAnonKey}
                  supabaseTableName={supabaseTableName}
                  supabaseEmail={supabaseEmail}
                  supabasePassword={supabasePassword}
                  supabaseSession={supabaseSession}
                  supabaseAuthStatus={supabaseAuthStatus}
                  supabaseAuthBusy={supabaseAuthBusy}
                  onChangeSupabaseUrl={onChangeSupabaseUrl}
                  onChangeSupabaseAnonKey={onChangeSupabaseAnonKey}
                  onChangeSupabaseTableName={onChangeSupabaseTableName}
                  onChangeSupabaseEmail={onChangeSupabaseEmail}
                  onChangeSupabasePassword={onChangeSupabasePassword}
                  onSupabaseSignIn={onSupabaseSignIn}
                  onSupabaseSignUp={onSupabaseSignUp}
                  onSupabaseSignOut={onSupabaseSignOut}
                />
                <AiProviderSettingsSection
                  theme={theme}
                  config={aiProviderConfig}
                  status={aiSettingsStatus}
                  onSelectPreset={onSelectAiProviderPreset}
                  onChangeConfig={onChangeAiProviderConfig}
                  onSave={onSaveAiProviderConfig}
                />
              </YStack>
            </ScrollView>
          </YStack>
        </SafeAreaView>
      </Theme>
    </Modal>
  );
}

function SupabaseSettingsSection({
  theme,
  t,
  supabaseUrl,
  supabaseAnonKey,
  supabaseTableName,
  supabaseEmail,
  supabasePassword,
  supabaseSession,
  supabaseAuthStatus,
  supabaseAuthBusy,
  onChangeSupabaseUrl,
  onChangeSupabaseAnonKey,
  onChangeSupabaseTableName,
  onChangeSupabaseEmail,
  onChangeSupabasePassword,
  onSupabaseSignIn,
  onSupabaseSignUp,
  onSupabaseSignOut,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseTableName: string;
  supabaseEmail: string;
  supabasePassword: string;
  supabaseSession: SupabaseAuthSession | null;
  supabaseAuthStatus: SupabaseAuthStatus;
  supabaseAuthBusy: boolean;
  onChangeSupabaseUrl: (value: string) => void;
  onChangeSupabaseAnonKey: (value: string) => void;
  onChangeSupabaseTableName: (value: string) => void;
  onChangeSupabaseEmail: (value: string) => void;
  onChangeSupabasePassword: (value: string) => void;
  onSupabaseSignIn: () => void;
  onSupabaseSignUp: () => void;
  onSupabaseSignOut: () => void;
}) {
  const statusColor =
    supabaseAuthStatus.type === 'error'
      ? theme.dangerColor
      : supabaseAuthStatus.type === 'signed-in'
        ? theme.successColor
        : theme.mutedTextColor;

  return (
    <YStack gap="$3">
      <XStack alignItems="center" justifyContent="space-between" gap="$3">
        <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={16} fontWeight="900">
          {t('settings.supabaseSync')}
        </Text>
        {supabaseSession ? (
          <YStack paddingHorizontal="$2.5" paddingVertical="$1" borderRadius={999} backgroundColor={theme.primarySoftColor}>
            <Text color={theme.primaryColor} fontFamily={theme.fontFamilyValue} fontSize={11} fontWeight="900">
              {t('settings.connected')}
            </Text>
          </YStack>
        ) : null}
      </XStack>
      <YStack gap="$2">
        <Input
          minHeight={48}
          height="auto"
          value={supabaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://project-ref.supabase.co"
          placeholderTextColor={theme.mutedTextColor as never}
          backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
          borderWidth={1}
          borderColor={theme.borderColor}
          borderRadius={14}
          color={theme.textColor}
          fontFamily={theme.fontFamilyValue}
          fontSize={14}
          lineHeight={20}
          paddingVertical="$2.5"
          onChangeText={onChangeSupabaseUrl}
        />
        <Input
          minHeight={48}
          height="auto"
          value={supabaseAnonKey}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Supabase publishable key"
          placeholderTextColor={theme.mutedTextColor as never}
          backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
          borderWidth={1}
          borderColor={theme.borderColor}
          borderRadius={14}
          color={theme.textColor}
          fontFamily={theme.fontFamilyValue}
          fontSize={14}
          lineHeight={20}
          paddingVertical="$2.5"
          onChangeText={onChangeSupabaseAnonKey}
        />
        <Input
          minHeight={48}
          height="auto"
          value={supabaseTableName}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={defaultSupabaseTableName}
          placeholderTextColor={theme.mutedTextColor as never}
          backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
          borderWidth={1}
          borderColor={theme.borderColor}
          borderRadius={14}
          color={theme.textColor}
          fontFamily={theme.fontFamilyValue}
          fontSize={14}
          lineHeight={20}
          paddingVertical="$2.5"
          onChangeText={onChangeSupabaseTableName}
        />
        <XStack gap="$2" rowGap="$2" flexWrap="wrap">
          <Input
            flex={1}
            minWidth={220}
            minHeight={48}
            height="auto"
            value={supabaseEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder={t('onboarding.email')}
            placeholderTextColor={theme.mutedTextColor as never}
            backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
            borderWidth={1}
            borderColor={theme.borderColor}
            borderRadius={14}
            color={theme.textColor}
            fontFamily={theme.fontFamilyValue}
            fontSize={14}
            lineHeight={20}
            paddingVertical="$2.5"
            onChangeText={onChangeSupabaseEmail}
          />
          <Input
            flex={1}
            minWidth={220}
            minHeight={48}
            height="auto"
            value={supabasePassword}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder={t('onboarding.password')}
            placeholderTextColor={theme.mutedTextColor as never}
            backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
            borderWidth={1}
            borderColor={theme.borderColor}
            borderRadius={14}
            color={theme.textColor}
            fontFamily={theme.fontFamilyValue}
            fontSize={14}
            lineHeight={20}
            paddingVertical="$2.5"
            onChangeText={onChangeSupabasePassword}
          />
        </XStack>
        <XStack gap="$2" rowGap="$2" flexWrap="wrap">
          <Button
            size="$3"
            minHeight={44}
            height="auto"
            paddingVertical="$2.5"
            disabled={supabaseAuthBusy}
            backgroundColor={theme.primaryColor}
            borderRadius={999}
            color={theme.primaryContrastColor}
            fontFamily={theme.fontFamilyValue}
            onPress={onSupabaseSignIn}
          >
            {t('onboarding.signIn')}
          </Button>
          <Button
            size="$3"
            minHeight={44}
            height="auto"
            paddingVertical="$2.5"
            disabled={supabaseAuthBusy}
            backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
            borderWidth={1}
            borderColor={theme.borderColor}
            borderRadius={999}
            color={theme.textColor}
            fontFamily={theme.fontFamilyValue}
            onPress={onSupabaseSignUp}
          >
            {t('onboarding.createAccount')}
          </Button>
          {supabaseSession ? (
            <Button
              size="$3"
              minHeight={44}
              height="auto"
              paddingVertical="$2.5"
              disabled={supabaseAuthBusy}
              backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
              borderWidth={1}
              borderColor={theme.borderColor}
              borderRadius={999}
              color={theme.dangerColor}
              fontFamily={theme.fontFamilyValue}
              onPress={onSupabaseSignOut}
            >
              {t('settings.signOut')}
            </Button>
          ) : null}
        </XStack>
      </YStack>
      <Paragraph color={statusColor} fontFamily={theme.fontFamilyValue} fontSize={13} lineHeight={18}>
        {supabaseAuthStatus.message}
      </Paragraph>
    </YStack>
  );
}

function AiProviderSettingsSection({
  theme,
  config,
  status,
  onSelectPreset,
  onChangeConfig,
  onSave,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  config: AiProviderConfig;
  status: AiBuildStatus;
  onSelectPreset: (presetId: AiProviderPresetId) => void;
  onChangeConfig: (patch: Partial<AiProviderConfig>) => void;
  onSave: () => void;
}) {
  const statusColor = status.type === 'error' ? theme.dangerColor : status.type === 'success' ? theme.successColor : theme.mutedTextColor;

  return (
    <YStack gap="$3">
      <XStack alignItems="center" gap="$2">
        <Bot color={theme.primaryColor} size={18} strokeWidth={2.2} />
        <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={16} fontWeight="900">
          AI Provider
        </Text>
      </XStack>
      <XStack gap="$2" rowGap="$2" flexWrap="wrap">
        {aiProviderPresets.map((preset) => {
          const active = preset.id === config.presetId;
          return (
            <Button
              key={preset.id}
              size="$3"
              minHeight={42}
              height="auto"
              paddingVertical="$2.5"
              backgroundColor={active ? theme.primaryColor : theme.mode === 'dark' ? '#172033' : '#ffffff'}
              borderWidth={active ? 0 : 1}
              borderColor={theme.borderColor}
              borderRadius={999}
              color={active ? theme.primaryContrastColor : theme.textColor}
              fontFamily={theme.fontFamilyValue}
              onPress={() => onSelectPreset(preset.id)}
            >
              {preset.label}
            </Button>
          );
        })}
      </XStack>
      <YStack gap="$2">
        <Input
          minHeight={48}
          height="auto"
          value={config.baseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://provider.example.com/v1"
          placeholderTextColor={theme.mutedTextColor as never}
          backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
          borderWidth={1}
          borderColor={theme.borderColor}
          borderRadius={14}
          color={theme.textColor}
          fontFamily={theme.fontFamilyValue}
          fontSize={14}
          lineHeight={20}
          paddingVertical="$2.5"
          onChangeText={(baseUrl) => onChangeConfig({ baseUrl, presetId: config.presetId === 'custom' ? 'custom' : config.presetId })}
        />
        <Input
          minHeight={48}
          height="auto"
          value={config.model}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="model name"
          placeholderTextColor={theme.mutedTextColor as never}
          backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
          borderWidth={1}
          borderColor={theme.borderColor}
          borderRadius={14}
          color={theme.textColor}
          fontFamily={theme.fontFamilyValue}
          fontSize={14}
          lineHeight={20}
          paddingVertical="$2.5"
          onChangeText={(model) => onChangeConfig({ model })}
        />
        <Input
          minHeight={48}
          height="auto"
          value={config.apiKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Provider API key"
          placeholderTextColor={theme.mutedTextColor as never}
          backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
          borderWidth={1}
          borderColor={theme.borderColor}
          borderRadius={14}
          color={theme.textColor}
          fontFamily={theme.fontFamilyValue}
          fontSize={14}
          lineHeight={20}
          paddingVertical="$2.5"
          onChangeText={(apiKey) => onChangeConfig({ apiKey })}
        />
        <Input
          minHeight={74}
          height="auto"
          value={config.headersJson ?? ''}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          placeholder='Optional headers JSON, e.g. {"HTTP-Referer":"https://appfoundry.local"}'
          placeholderTextColor={theme.mutedTextColor as never}
          backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
          borderWidth={1}
          borderColor={theme.borderColor}
          borderRadius={14}
          color={theme.textColor}
          fontFamily={theme.fontFamilyValue}
          fontSize={14}
          lineHeight={20}
          paddingVertical="$2.5"
          onChangeText={(headersJson) => onChangeConfig({ headersJson })}
        />
      </YStack>
      <XStack alignItems="center" justifyContent="space-between" gap="$3" flexWrap="wrap">
        <Paragraph flex={1} minWidth={220} color={status.message ? statusColor : theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={13} lineHeight={18}>
          {status.message || 'Keys stay on this device. App versions are stored in Supabase when you are signed in.'}
        </Paragraph>
        <Button
          size="$3"
          minHeight={44}
          height="auto"
          paddingVertical="$2.5"
          backgroundColor={theme.primaryColor}
          borderRadius={999}
          color={theme.primaryContrastColor}
          fontFamily={theme.fontFamilyValue}
          onPress={onSave}
        >
          Save AI Provider
        </Button>
      </XStack>
    </YStack>
  );
}

function AiCustomizeModal({
  visible,
  theme,
  template,
  prompt,
  status,
  busy,
  versionCount,
  supabaseReady,
  onChangePrompt,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  theme: ReturnType<typeof resolveAppTheme>;
  template: TemplateBundle;
  prompt: string;
  status: AiBuildStatus;
  busy: boolean;
  versionCount: number;
  supabaseReady: boolean;
  onChangePrompt: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const statusColor = status.type === 'error' ? theme.dangerColor : status.type === 'success' ? theme.successColor : theme.mutedTextColor;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Theme name={theme.mode}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
          <YStack flex={1} backgroundColor={theme.backgroundColor}>
            <XStack alignItems="center" justifyContent="space-between" paddingHorizontal="$4" paddingTop="$2" paddingBottom="$3">
              <YStack width={44} />
              <Text flex={1} textAlign="center" color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={17} fontWeight="900">
                Customize App
              </Text>
              <IconButton accessibilityLabel="Close AI customizer" theme={theme} onPress={onClose}>
                <XIcon color={theme.primaryColor} size={21} strokeWidth={2.2} />
              </IconButton>
            </XStack>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 18,
                paddingTop: 12,
                paddingBottom: 32,
                alignItems: 'center',
              }}
            >
              <YStack width="100%" maxWidth={720} gap="$5">
                <YStack gap="$2">
                  <XStack alignItems="center" gap="$2">
                    <Wand2 color={theme.primaryColor} size={20} strokeWidth={2.2} />
                    <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={22} lineHeight={28} fontWeight="900">
                      Vibe code {template.app.name}
                    </Text>
                  </XStack>
                  <Paragraph color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={14} lineHeight={20}>
                    Describe a tweak to fields, forms, dashboard widgets, validations, or workflow logic. AppFoundry will validate the generated app before saving a new version.
                  </Paragraph>
                </YStack>
                <YStack gap="$2">
                  <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={13} fontWeight="800">
                    Change request
                  </Text>
                  <Input
                    minHeight={150}
                    height="auto"
                    value={prompt}
                    multiline
                    autoCorrect
                    placeholder="Example: Add GST number and lead source to CRM deals, make close date required, and show lead source in the deals list."
                    placeholderTextColor={theme.mutedTextColor as never}
                    backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
                    borderWidth={1}
                    borderColor={theme.borderColor}
                    borderRadius={16}
                    color={theme.textColor}
                    fontFamily={theme.fontFamilyValue}
                    fontSize={15}
                    lineHeight={22}
                    paddingVertical="$3"
                    onChangeText={onChangePrompt}
                  />
                </YStack>
                <YStack padding="$4" gap="$2" borderRadius={18} borderWidth={1} borderColor={theme.borderColor} backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}>
                  <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={14} fontWeight="900">
                    Versioning
                  </Text>
                  <Paragraph color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={13} lineHeight={19}>
                    {versionCount} saved versions for this app. New versions replace the installed app locally and {supabaseReady ? 'will be stored in your Supabase account.' : 'will sync to Supabase after you sign in and run the updated schema.'}
                  </Paragraph>
                </YStack>
                {status.message ? (
                  <YStack padding="$4" borderRadius={18} borderWidth={1} borderColor={theme.borderColor} backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}>
                    <Paragraph color={statusColor} fontFamily={theme.fontFamilyValue} fontSize={13} lineHeight={19}>
                      {status.message}
                    </Paragraph>
                  </YStack>
                ) : null}
                <XStack justifyContent="flex-end" gap="$2" rowGap="$2" flexWrap="wrap">
                  <Button
                    size="$4"
                    minHeight={50}
                    height="auto"
                    paddingVertical="$3"
                    disabled={busy}
                    backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
                    borderWidth={1}
                    borderColor={theme.borderColor}
                    borderRadius={999}
                    color={theme.textColor}
                    fontFamily={theme.fontFamilyValue}
                    onPress={onClose}
                  >
                    Close
                  </Button>
                  <Button
                    size="$4"
                    minHeight={50}
                    height="auto"
                    paddingVertical="$3"
                    disabled={busy}
                    backgroundColor={theme.primaryColor}
                    borderRadius={999}
                    color={theme.primaryContrastColor}
                    fontFamily={theme.fontFamilyValue}
                    onPress={onSubmit}
                  >
                    {busy ? 'Building...' : 'Generate Version'}
                  </Button>
                </XStack>
              </YStack>
            </ScrollView>
          </YStack>
        </SafeAreaView>
      </Theme>
    </Modal>
  );
}

function LaunchOverlay({
  template,
  theme,
  progress,
}: {
  template: TemplateBundle;
  theme: ReturnType<typeof resolveAppTheme>;
  progress: Animated.Value;
}) {
  const icon = getLauncherIcon(template, theme.mode);
  const Icon = icon.component;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.backgroundColor,
        opacity: progress.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 1, 1] }),
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.04] }) }],
      }}
    >
      <Animated.View
        style={{
          alignItems: 'center',
          gap: 14,
          opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.92, 1, 0] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
        }}
      >
        <YStack
          width={94}
          height={94}
          alignItems="center"
          justifyContent="center"
          borderRadius={27}
          backgroundColor={icon.backgroundColor}
          borderWidth={theme.mode === 'dark' ? 1 : 0}
          borderColor={icon.borderColor}
        >
          <Icon color={icon.color} size={44} strokeWidth={1.9} />
        </YStack>
        <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={18} fontWeight="900">
          {template.app.name}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function InstallableTemplateTile({
  source,
  theme,
  t,
  onInstall,
}: {
  source: InstallableTemplateSource;
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  onInstall: () => void;
}) {
  const icon = getInstallableTemplateIcon(source, theme.mode);
  const Icon = icon.component;

  return (
    <YStack
      width={260}
      minHeight={150}
      flexGrow={1}
      maxWidth={360}
      padding="$4"
      gap="$3"
      borderWidth={1}
      borderColor={theme.borderColor}
      borderRadius={18}
      backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
    >
      <XStack alignItems="flex-start" gap="$3">
        <YStack
          width={48}
          height={48}
          borderRadius={15}
          alignItems="center"
          justifyContent="center"
          backgroundColor={icon.backgroundColor}
          flexShrink={0}
        >
          <Icon color={icon.color} size={24} strokeWidth={2} />
        </YStack>
        <YStack flex={1} minWidth={0} gap="$1">
          <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={16} fontWeight="900" numberOfLines={1}>
            {source.name}
          </Text>
          {source.description ? (
            <Paragraph color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={13} lineHeight={18} numberOfLines={2}>
              {source.description}
            </Paragraph>
          ) : null}
        </YStack>
      </XStack>
      {source.tags && source.tags.length > 0 ? (
        <XStack gap="$1.5" rowGap="$1.5" flexWrap="wrap">
          {source.tags.slice(0, 3).map((tag) => (
            <YStack key={tag} paddingHorizontal="$2.5" paddingVertical="$1" borderRadius={999} backgroundColor={theme.primarySoftColor}>
              <Text color={theme.primaryColor} fontFamily={theme.fontFamilyValue} fontSize={11} fontWeight="800">
                {tag}
              </Text>
            </YStack>
          ))}
        </XStack>
      ) : null}
      <Button
        size="$3"
        minHeight={44}
        height="auto"
        paddingVertical="$2.5"
        alignSelf="flex-start"
        backgroundColor={theme.primaryColor}
        borderRadius={999}
        color={theme.primaryContrastColor}
        fontFamily={theme.fontFamilyValue}
        onPress={onInstall}
      >
        {t('common.install')}
      </Button>
    </YStack>
  );
}

function IconButton({
  accessibilityLabel,
  theme,
  onPress,
  children,
}: {
  accessibilityLabel: string;
  theme: ReturnType<typeof resolveAppTheme>;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.72 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      <YStack
        width={44}
        height={44}
        borderRadius={22}
        alignItems="center"
        justifyContent="center"
        backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
        borderWidth={1}
        borderColor={theme.borderColor}
      >
        {children}
      </YStack>
    </Pressable>
  );
}

function LauncherAppTile({
  template,
  theme,
  width,
  iconSize,
  onLaunch,
}: {
  template: TemplateBundle;
  theme: ReturnType<typeof resolveAppTheme>;
  width: number;
  iconSize: number;
  onLaunch: (appId: string) => void;
}) {
  const icon = getLauncherIcon(template, theme.mode);
  const Icon = icon.component;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Launch ${template.app.name}`}
      onPress={() => onLaunch(template.app.appId)}
      style={({ pressed }) => ({
        opacity: pressed ? 0.72 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <YStack width={width} minHeight={112} gap="$2" alignItems="center">
        <YStack
          width={iconSize}
          height={iconSize}
          alignItems="center"
          justifyContent="center"
          borderRadius={Math.round(iconSize * 0.28)}
          backgroundColor={icon.backgroundColor}
          borderWidth={theme.mode === 'dark' ? 1 : 0}
          borderColor={icon.borderColor}
          shadowColor={theme.mode === 'dark' ? '#000000' : '#64748b'}
          shadowOpacity={theme.mode === 'dark' ? 0.42 : 0.2}
          shadowRadius={18}
          shadowOffset={{ width: 0, height: 12 }}
        >
          <YStack
            position="absolute"
            top={1}
            left={1}
            right={1}
            height="48%"
            borderTopLeftRadius={Math.round(iconSize * 0.27)}
            borderTopRightRadius={Math.round(iconSize * 0.27)}
            backgroundColor={icon.highlightColor}
            opacity={0.56}
          />
          <Icon color={icon.color} size={Math.round(iconSize * 0.47)} strokeWidth={1.9} />
        </YStack>
        <Text
          width="100%"
          textAlign="center"
          numberOfLines={1}
          fontSize={14}
          lineHeight={18}
          fontWeight="700"
          fontFamily={theme.fontFamilyValue}
          color={theme.textColor}
        >
          {template.app.name}
        </Text>
      </YStack>
    </Pressable>
  );
}

type LauncherIcon = {
  component: ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  backgroundColor: string;
  borderColor: string;
  highlightColor: string;
  color: string;
};

function getLauncherIcon(template: TemplateBundle, mode: 'light' | 'dark'): LauncherIcon {
  const iconKey = template.app.icon ?? template.app.appId;

  if ((template.source === 'external' || template.source === 'installed') && !template.app.icon) {
    return mode === 'dark'
      ? { component: DownloadCloud, backgroundColor: '#312e81', borderColor: '#4338ca', highlightColor: '#4f46e5', color: '#c7d2fe' }
      : { component: DownloadCloud, backgroundColor: '#eef2ff', borderColor: '#c7d2fe', highlightColor: '#ffffff', color: '#4f46e5' };
  }

  if (iconKey === 'todo' || iconKey === 'check-square') {
    return mode === 'dark'
      ? { component: CheckSquare, backgroundColor: '#115e59', borderColor: '#0f766e', highlightColor: '#14b8a6', color: '#ccfbf1' }
      : { component: CheckSquare, backgroundColor: '#ccfbf1', borderColor: '#99f6e4', highlightColor: '#f0fdfa', color: '#0f766e' };
  }

  if (iconKey === 'kitchen-sink' || iconKey === 'layout-grid') {
    return mode === 'dark'
      ? { component: LayoutGrid, backgroundColor: '#1e3a8a', borderColor: '#2563eb', highlightColor: '#3b82f6', color: '#dbeafe' }
      : { component: LayoutGrid, backgroundColor: '#dbeafe', borderColor: '#bfdbfe', highlightColor: '#eff6ff', color: '#2563eb' };
  }

  if (iconKey === 'expense-tracker' || iconKey === 'wallet-cards') {
    return mode === 'dark'
      ? { component: WalletCards, backgroundColor: '#581c87', borderColor: '#7e22ce', highlightColor: '#a855f7', color: '#f3e8ff' }
      : { component: WalletCards, backgroundColor: '#f3e8ff', borderColor: '#e9d5ff', highlightColor: '#ffffff', color: '#7e22ce' };
  }

  return mode === 'dark'
    ? { component: Package, backgroundColor: '#334155', borderColor: '#475569', highlightColor: '#64748b', color: '#f8fafc' }
    : { component: Package, backgroundColor: '#f1f5f9', borderColor: '#e2e8f0', highlightColor: '#ffffff', color: template.app.theme.light.primaryColor };
}

function getInstallableTemplateIcon(source: InstallableTemplateSource, mode: 'light' | 'dark'): LauncherIcon {
  const iconKey = source.icon ?? source.appId ?? source.id;

  if (iconKey === 'todo' || iconKey === 'check-square') {
    return mode === 'dark'
      ? { component: CheckSquare, backgroundColor: '#115e59', borderColor: '#0f766e', highlightColor: '#14b8a6', color: '#ccfbf1' }
      : { component: CheckSquare, backgroundColor: '#ccfbf1', borderColor: '#99f6e4', highlightColor: '#f0fdfa', color: '#0f766e' };
  }

  if (iconKey === 'expense-tracker' || iconKey === 'wallet-cards') {
    return mode === 'dark'
      ? { component: WalletCards, backgroundColor: '#581c87', borderColor: '#7e22ce', highlightColor: '#a855f7', color: '#f3e8ff' }
      : { component: WalletCards, backgroundColor: '#f3e8ff', borderColor: '#e9d5ff', highlightColor: '#ffffff', color: '#7e22ce' };
  }

  if (iconKey === 'inventory' || iconKey === 'inventory-lite' || iconKey === 'package') {
    return mode === 'dark'
      ? { component: Package, backgroundColor: '#334155', borderColor: '#475569', highlightColor: '#64748b', color: '#f8fafc' }
      : { component: Package, backgroundColor: '#f1f5f9', borderColor: '#e2e8f0', highlightColor: '#ffffff', color: '#2563eb' };
  }

  if (iconKey === 'layout-grid' || iconKey === 'field-service') {
    return mode === 'dark'
      ? { component: LayoutGrid, backgroundColor: '#1e3a8a', borderColor: '#2563eb', highlightColor: '#3b82f6', color: '#dbeafe' }
      : { component: LayoutGrid, backgroundColor: '#dbeafe', borderColor: '#bfdbfe', highlightColor: '#eff6ff', color: '#2563eb' };
  }

  return mode === 'dark'
    ? { component: DownloadCloud, backgroundColor: '#312e81', borderColor: '#4338ca', highlightColor: '#4f46e5', color: '#c7d2fe' }
    : { component: DownloadCloud, backgroundColor: '#eef2ff', borderColor: '#c7d2fe', highlightColor: '#ffffff', color: '#4f46e5' };
}

function ThemeModeControl({
  selectedMode,
  theme,
  t,
  onSelect,
}: {
  selectedMode: AppThemeMode;
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  onSelect: (mode: AppThemeMode) => void;
}) {
  const modes: Array<{ mode: AppThemeMode; label: string; icon: ComponentType<{ color?: string; size?: number; strokeWidth?: number }> }> = [
    { mode: 'light', label: t('theme.light'), icon: Sun },
    { mode: 'dark', label: t('theme.dark'), icon: Moon },
    { mode: 'system', label: t('theme.system'), icon: Monitor },
  ];

  return (
    <XStack
      gap="$1"
      padding="$1"
      borderWidth={1}
      borderColor={theme.borderColor}
      borderRadius={18}
      backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
    >
      {modes.map(({ mode, label, icon: Icon }) => {
        const active = selectedMode === mode;

        return (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onSelect(mode)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.72 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <YStack
              width={42}
              height={36}
              borderRadius={14}
              alignItems="center"
              justifyContent="center"
              backgroundColor={active ? theme.primaryColor : 'transparent'}
            >
              <Icon color={active ? theme.primaryContrastColor : theme.textColor} size={16} strokeWidth={2} />
            </YStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

function LanguageSelector({
  theme,
  selectedLanguage,
  compact,
  onSelectLanguage,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  selectedLanguage: LanguageCode;
  compact?: boolean;
  onSelectLanguage: (language: LanguageCode) => void;
}) {
  return (
    <YStack gap="$2.5">
      {supportedLanguages.map((language) => {
        const active = language.code === selectedLanguage;

        return (
          <Pressable
            key={language.code}
            accessibilityRole="button"
            accessibilityLabel={language.label}
            onPress={() => onSelectLanguage(language.code)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.72 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
          >
            <XStack
              minHeight={compact ? 48 : 64}
              gap="$3"
              alignItems="center"
              paddingHorizontal={compact ? '$3' : '$4'}
              paddingVertical={compact ? '$2.5' : '$3'}
              borderRadius={18}
              borderWidth={active ? 2 : 1}
              borderColor={active ? theme.primaryColor : theme.borderColor}
              backgroundColor={active ? (theme.mode === 'dark' ? '#172554' : '#eef2ff') : theme.mode === 'dark' ? '#172033' : '#ffffff'}
            >
              <YStack
                width={compact ? 34 : 40}
                height={compact ? 34 : 40}
                borderRadius={compact ? 12 : 14}
                alignItems="center"
                justifyContent="center"
                backgroundColor={active ? theme.primaryColor : theme.mode === 'dark' ? '#253044' : '#f1f5f9'}
              >
                <Text color={active ? theme.primaryContrastColor : theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={13} lineHeight={17} fontWeight="900">
                  {language.code.toUpperCase()}
                </Text>
              </YStack>
              <YStack flex={1} minWidth={0}>
                <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={compact ? 14 : 16} lineHeight={compact ? 19 : 22} fontWeight="900" numberOfLines={1}>
                  {language.nativeLabel}
                </Text>
                <Text color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={12} lineHeight={16} numberOfLines={1}>
                  {language.label}
                </Text>
              </YStack>
              <YStack
                width={22}
                height={22}
                borderRadius={11}
                alignItems="center"
                justifyContent="center"
                borderWidth={active ? 0 : 1}
                borderColor={theme.borderColor}
                backgroundColor={active ? theme.primaryColor : 'transparent'}
              >
                {active ? <CheckCircle2 color={theme.primaryContrastColor} size={14} strokeWidth={2.4} /> : null}
              </YStack>
            </XStack>
          </Pressable>
        );
      })}
    </YStack>
  );
}

function getBootAppId(catalog: TemplateBundle[]) {
  const params = getWebSearchParams();
  const requestedAppId = params?.get('app');

  return requestedAppId && catalog.some((template) => template.app.appId === requestedAppId) ? requestedAppId : null;
}

function getAvailableTemplateSources(
  sources: InstallableTemplateSource[],
  catalog: TemplateBundle[],
  installedTemplates: InstalledTemplateRecord[],
) {
  const installedAppIds = new Set(catalog.map((template) => template.app.appId));
  const installedUrls = new Set(installedTemplates.map((template) => normalizeTemplateUrl(template.url)));

  return sources.filter((source) => {
    if (installedUrls.has(normalizeTemplateUrl(source.url))) {
      return false;
    }

    return source.appId ? !installedAppIds.has(source.appId) : true;
  });
}

function mergeTemplateSources(sources: InstallableTemplateSource[]) {
  const sourcesByKey = new Map<string, InstallableTemplateSource>();

  sources.forEach((source) => {
    sourcesByKey.set(source.appId ?? normalizeTemplateUrl(source.url), source);
  });

  return [...sourcesByKey.values()];
}

function getNextOnboardingStep(
  project: SupabaseProjectConfig | null,
  session: SupabaseAuthSession | null,
  organization: SupabaseOrganization | null,
  completedAt: string | null,
  languageSaved: boolean,
): OnboardingStepId {
  if (completedAt) {
    return 'apps';
  }

  if (!languageSaved) {
    return 'language';
  }

  if (!project) {
    return 'connect';
  }

  if (!session) {
    return 'account';
  }

  if (!organization) {
    return 'organization';
  }

  return 'apps';
}

function getWebSearchParams() {
  if (typeof globalThis.location === 'undefined') {
    return null;
  }

  return new URLSearchParams(globalThis.location.search);
}

function normalizeTemplateUrl(value: string) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const blobIndex = parts.indexOf('blob');

    if (url.hostname === 'github.com' && blobIndex === 2 && parts.length > 4) {
      const [owner, repo] = parts;
      const branch = parts[blobIndex + 1];
      const path = parts.slice(blobIndex + 2).join('/');
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    }
  } catch {
    return value;
  }

  return value;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function createAppVersionRecord({
  app,
  prompt,
  providerName,
}: {
  app: AppVersionRecord['app'];
  prompt: string;
  providerName: string;
}): AppVersionRecord {
  const createdAt = new Date().toISOString();
  const id = `${app.appId}:${createdAt}`;

  return {
    id,
    appId: app.appId,
    version: app.version,
    name: app.name,
    prompt,
    providerName,
    createdAt,
    app,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
