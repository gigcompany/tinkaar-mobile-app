import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Platform, Pressable, ScrollView, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Bot, BriefcaseBusiness, CheckCircle2, CheckSquare, ChevronLeft, Cloud, DownloadCloud, Handshake, LayoutGrid, Monitor, Moon, Package, Plus, RefreshCcw, Settings, Sparkles, Sun, Trash2, Wand2, WalletCards, X as XIcon } from 'lucide-react-native';
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
  loadSupabaseAuthState,
  refreshSessionIfNeeded,
  saveSupabaseAuthState,
  signInWithSupabasePassword,
  signOutOfSupabase,
  signUpWithSupabasePassword,
  validateSupabaseProjectConfig,
  deleteSupabaseAppData,
} from './src/auth/supabaseAuth';
import { getTemplateCatalog, InstallableTemplateSource, InstalledTemplateRecord, parseTemplateBundle, TemplateBundle, toInstalledTemplateRecord } from './src/apps/catalog';
import { deleteInstalledTemplate, loadHiddenAppIds, loadInstalledTemplates, saveHiddenAppIds, saveInstalledTemplate } from './src/apps/installedTemplateStore';
import { fetchTemplateCatalogSources } from './src/apps/templateCatalog';
import { loadTemplateCatalogUrl, saveTemplateCatalogUrl } from './src/apps/templateCatalogUrlStore';
import { getExternalAppTemplates, getExternalTemplateCatalogUrl, getExternalTemplateSources, getExternalThemeOverride } from './src/config/themeOverride';
import { deleteCloudSyncAppState, SupabaseCloudSyncConfig, withCloudSyncRepository } from './src/data/cloudSync';
import { deleteSQLiteAppData } from './src/data/sqliteRepository';
import { loadLanguagePreference, saveLanguagePreference } from './src/i18n/languageStore';
import { defaultLanguage, LanguageCode, supportedLanguages, translate, TranslationKey } from './src/i18n/translations';
import { createRepository } from './src/data/repository';
import { NodeDefinition } from './src/schema/appDefinition.schema';
import { dispatchAction } from './src/renderer/actions';
import { AppRuntimeProvider, useRuntime } from './src/renderer/AppRuntime';
import { RendererNode } from './src/renderer/RendererNode';
import { AppThemeMode, AppThemeOverride, appThemeOverrideSchema, resolveAppTheme } from './src/theme/theme';
import { todoAppDefinition } from './src/apps/todo';

const PRODUCT_NAME = 'Tinkaar';
const PRODUCT_TAGLINE = 'Your apps, your way!';
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

const defaultSupabaseTableName = 'ministore_records';

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
  const [hiddenAppIds, setHiddenAppIds] = useState<string[]>([]);
  const [remoteTemplateSources, setRemoteTemplateSources] = useState<InstallableTemplateSource[]>([]);
  const catalog = useMemo(() => getTemplateCatalog([...externalTemplates, ...installedTemplates], hiddenAppIds), [externalTemplates, hiddenAppIds, installedTemplates]);
  const bootAppId = useMemo(() => getBootAppId(catalog), [catalog]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(bootAppId);
  const [selectedThemeMode, setSelectedThemeMode] = useState<AppThemeMode | null>(null);
  const [selectedThemePresetId, setSelectedThemePresetId] = useState(shellThemePresets[0].id);
  const [selectedAccentColor, setSelectedAccentColor] = useState(accentColors[0]);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('USD');
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(defaultLanguage);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateCatalogUrl, setTemplateCatalogUrl] = useState(() => getExternalTemplateCatalogUrl());
  const [templateCatalogStatus, setTemplateCatalogStatus] = useState<TemplateCatalogStatus>({ type: 'idle', message: '' });
  const [loadingTemplateCatalog, setLoadingTemplateCatalog] = useState(false);
  const [templateInstallUrl, setTemplateInstallUrl] = useState('');
  const [templateInstallStatus, setTemplateInstallStatus] = useState<TemplateInstallStatus>({ type: 'idle', message: '' });
  const [installingTemplate, setInstallingTemplate] = useState(false);
  const [launchingAppId, setLaunchingAppId] = useState<string | null>(null);
  const [uninstallingAppId, setUninstallingAppId] = useState<string | null>(null);
  const [supabaseProject, setSupabaseProject] = useState<SupabaseProjectConfig | null>(null);
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
  const [welcomeSeenAt, setWelcomeSeenAt] = useState<string | null>(null);
  const [welcomeStateLoaded, setWelcomeStateLoaded] = useState(false);
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

  useEffect(() => {
    const webDocument = (globalThis as { document?: { title: string } }).document;
    if (webDocument) {
      webDocument.title = PRODUCT_NAME;
    }
  }, []);

  const selectLanguageFromSettings = async (language: LanguageCode) => {
    setSelectedLanguage(language);
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

    Promise.all([loadInstalledTemplates(), loadHiddenAppIds()])
      .then(([templates, hiddenIds]) => {
        if (active) {
          setInstalledTemplates(templates);
          setHiddenAppIds(hiddenIds);
        }
      })
      .catch((error) => {
        console.warn('Unable to load installed app state.', error);
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
        }
      })
      .catch((error) => {
        console.warn('Unable to load language preference.', error);
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

    loadSupabaseAuthState()
      .then(async (stored) => {
        if (!active) {
          return;
        }

        const project = stored.project;
        const session = stored.session;

        setSupabaseOrganization(stored.organization);
        setWelcomeSeenAt(stored.welcomeSeenAt);
        setWelcomeStateLoaded(true);

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
            welcomeSeenAt: stored.welcomeSeenAt,
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
            welcomeSeenAt: stored.welcomeSeenAt,
          });
          setSupabaseSession(null);
          setSupabaseAuthStatus({ type: 'error', message: getErrorMessage(error) });
        }
      })
      .catch((error) => {
        if (active) {
          setWelcomeStateLoaded(true);
          setSupabaseAuthStatus({ type: 'error', message: getErrorMessage(error) });
        }
      });

    return () => {
      active = false;
    };
  }, [t]);

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

    try {
      const session = await signInWithSupabasePassword({ project, email: supabaseEmail, password: supabasePassword });
      setSupabaseProject(project);
      setSupabaseSession(session);
      setSupabasePassword('');
      await saveSupabaseAuthState({
        project,
        session,
        organization: supabaseOrganization,
        welcomeSeenAt,
      });
      setSupabaseAuthStatus({ type: 'signed-in', message: t('status.syncingAs', { identity: session.email ?? session.userId }) });
    } catch (error) {
      setSupabaseAuthStatus({ type: 'error', message: getErrorMessage(error) });
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
          welcomeSeenAt,
        });
        setSupabaseAuthStatus({ type: 'signed-out', message: t('status.confirmEmail') });
        return;
      }

      setSupabaseProject(project);
      setSupabaseSession(session);
      setSupabasePassword('');
      await saveSupabaseAuthState({
        project,
        session,
        organization: supabaseOrganization,
        welcomeSeenAt,
      });
      setSupabaseAuthStatus({ type: 'signed-in', message: t('status.syncingAs', { identity: session.email ?? session.userId }) });
    } catch (error) {
      setSupabaseAuthStatus({ type: 'error', message: getErrorMessage(error) });
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
      await saveSupabaseAuthState({
        project,
        session: null,
        organization: supabaseOrganization,
        welcomeSeenAt,
      });
      setSupabaseAuthStatus({ type: 'signed-out', message: t('status.signedOut') });
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
      setHiddenAppIds((current) => current.filter((appId) => appId !== installedTemplate.app.appId));
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

  const confirmUninstallTemplate = (template: TemplateBundle) => {
    const cloudSyncEnabled = Boolean(supabaseProject && supabaseSession);
    Alert.alert(
      `Uninstall ${template.app.name}?`,
      cloudSyncEnabled
        ? 'This will delete the app and all of its local data. Because Cloud Sync is enabled, synced data for this app will also be deleted from Supabase.'
        : 'This will delete the app and all of its local data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Uninstall',
          style: 'destructive',
          onPress: () => {
            void uninstallTemplate(template);
          },
        },
      ],
    );
  };

  const uninstallTemplate = async (template: TemplateBundle) => {
    const appId = template.app.appId;
    setUninstallingAppId(appId);

    try {
      if (supabaseProject && supabaseSession) {
        await deleteSupabaseAppData({ project: supabaseProject, session: supabaseSession, appId });
        deleteCloudSyncAppState(supabaseSession.userId, appId);
      }

      await deleteSQLiteAppData(appId, template.app.tables, template.app.data.storage.databaseName);
      await deleteInstalledTemplate(appId);

      const nextHiddenAppIds = [...new Set([...hiddenAppIds, appId])];
      await saveHiddenAppIds(nextHiddenAppIds);
      setHiddenAppIds(nextHiddenAppIds);
      setInstalledTemplates((current) => current.filter((record) => record.app.appId !== appId));
      setSelectedAppId((current) => (current === appId ? null : current));
      setTemplateInstallStatus({ type: 'success', message: `${template.app.name} was uninstalled.` });
    } catch (error) {
      const message = getErrorMessage(error);
      setTemplateInstallStatus({ type: 'error', message });
      Alert.alert('Unable to uninstall app', message);
    } finally {
      setUninstallingAppId(null);
    }
  };

  const completeWelcome = async () => {
    const seenAt = new Date().toISOString();
    setWelcomeSeenAt(seenAt);
    try {
      await saveSupabaseAuthState({
        project: supabaseProject,
        session: supabaseSession,
        organization: supabaseOrganization,
        welcomeSeenAt: seenAt,
      });
    } catch (error) {
      console.warn('Unable to save welcome state.', error);
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
          : `Saved ${result.app.name} ${result.app.version} locally. Enable Cloud Sync in Settings to store future versions in Supabase. ${result.summary}`,
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
    const homeTheme = resolveAppTheme(catalog[0]?.app.theme ?? todoAppDefinition.theme, globalThemeOverride, systemMode);

    if (!welcomeStateLoaded) {
      return (
        <TamaguiProvider config={tamaguiConfig} defaultTheme={homeTheme.mode}>
          <Theme name={homeTheme.mode}>
            <YStack flex={1} backgroundColor={homeTheme.backgroundColor} />
            <StatusBar style={homeTheme.mode === 'dark' ? 'light' : 'dark'} />
          </Theme>
        </TamaguiProvider>
      );
    }

    if (!welcomeSeenAt) {
      return (
        <TamaguiProvider config={tamaguiConfig} defaultTheme={homeTheme.mode}>
          <Theme name={homeTheme.mode}>
            <WelcomeScreen theme={homeTheme} onComplete={completeWelcome} />
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
            uninstallingAppId={uninstallingAppId}
            launchProgress={launchProgress}
            onOpenSettings={() => setSettingsOpen(true)}
            onCloseSettings={() => setSettingsOpen(false)}
            onSelectThemeMode={setSelectedThemeMode}
            onSelectThemePreset={setSelectedThemePresetId}
            onSelectAccentColor={setSelectedAccentColor}
            onSelectCurrency={setSelectedCurrency}
            onSelectLanguage={selectLanguageFromSettings}
            onInstallTemplateSource={(source) => installTemplateFromUrl(source.url)}
            onUninstall={confirmUninstallTemplate}
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

function WelcomeScreen({
  theme,
  onComplete,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  onComplete: () => void;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const isCompact = width < 520;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entrance, {
        toValue: 1,
        duration: 760,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1300,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 1300,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(float, {
            toValue: 1,
            duration: 1800,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(float, {
            toValue: 0,
            duration: 1800,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ),
    ]).start();
  }, [entrance, float, pulse]);

  const shellOpacity = entrance;
  const shellTranslateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const logoScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.05] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const sparkleTranslateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  const sparkleOpacity = float.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.54, 1, 0.54] });

  return (
    <YStack flex={1} backgroundColor={theme.backgroundColor}>
      <SafeAreaView style={{ flex: 1 }}>
        <YStack
          flex={1}
          justifyContent="center"
          alignItems="center"
          paddingHorizontal={isCompact ? '$5' : '$7'}
          paddingVertical="$7"
          overflow="hidden"
        >
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: isCompact ? 220 : 300,
              height: isCompact ? 220 : 300,
              borderRadius: isCompact ? 110 : 150,
              backgroundColor: theme.primarySoftColor,
              opacity: theme.mode === 'dark' ? 0.24 : 0.42,
              transform: [{ scale: glowScale }],
            }}
          />
          <Animated.View
            style={{
              opacity: shellOpacity,
              transform: [{ translateY: shellTranslateY }],
              width: '100%',
              maxWidth: 430,
            }}
          >
            <YStack alignItems="center" gap="$6">
              <YStack width={188} height={188} alignItems="center" justifyContent="center">
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 12,
                    opacity: sparkleOpacity,
                    transform: [{ translateY: sparkleTranslateY }],
                  }}
                >
                  <Sparkles color={theme.primaryColor} size={30} strokeWidth={2.1} />
                </Animated.View>
                <Animated.View style={{ transform: [{ scale: logoScale }] }}>
                  <YStack
                    width={136}
                    height={136}
                    borderRadius={40}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={theme.primaryColor}
                    shadowColor={theme.primaryColor}
                    shadowOpacity={theme.mode === 'dark' ? 0.36 : 0.24}
                    shadowRadius={28}
                    shadowOffset={{ width: 0, height: 16 }}
                  >
                    <Wand2 color={theme.primaryContrastColor} size={58} strokeWidth={2.1} />
                  </YStack>
                </Animated.View>
              </YStack>

              <YStack alignItems="center" gap="$3">
                <Text
                  color={theme.textColor}
                  textAlign="center"
                  fontFamily={theme.fontFamilyValue}
                  fontSize={isCompact ? 38 : 46}
                  lineHeight={isCompact ? 44 : 52}
                  fontWeight="900"
                >
                  Your apps your way.
                </Text>
                <Text
                  color={theme.primaryColor}
                  textAlign="center"
                  fontFamily={theme.fontFamilyValue}
                  fontSize={isCompact ? 36 : 44}
                  lineHeight={isCompact ? 42 : 50}
                  fontWeight="900"
                >
                  Tinkaar away!
                </Text>
              </YStack>

              <YStack width="100%" maxWidth={320} paddingTop="$4">
                <PrimaryAction label="Start" theme={theme} onPress={onComplete} />
              </YStack>
            </YStack>
          </Animated.View>
        </YStack>
      </SafeAreaView>
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
      minHeight={56}
      height="auto"
      paddingVertical="$3.5"
      disabled={disabled}
      backgroundColor={theme.primaryColor}
      borderRadius={18}
      color={theme.primaryContrastColor}
      fontFamily={theme.fontFamilyValue}
      fontWeight="900"
      shadowColor={theme.primaryColor}
      shadowOpacity={disabled ? 0 : 0.2}
      shadowRadius={16}
      shadowOffset={{ width: 0, height: 8 }}
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
        adapter: 'sqlite',
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
  uninstallingAppId,
  launchProgress,
  onOpenSettings,
  onCloseSettings,
  onSelectThemeMode,
  onSelectThemePreset,
  onSelectAccentColor,
  onSelectCurrency,
  onSelectLanguage,
  onInstallTemplateSource,
  onUninstall,
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
  uninstallingAppId: string | null;
  launchProgress: Animated.Value;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onSelectThemeMode: (mode: AppThemeMode) => void;
  onSelectThemePreset: (presetId: string) => void;
  onSelectAccentColor: (accentColor: string) => void;
  onSelectCurrency: (currency: CurrencyCode) => void;
  onSelectLanguage: (language: LanguageCode) => void;
  onInstallTemplateSource: (source: InstallableTemplateSource) => void;
  onUninstall: (template: TemplateBundle) => void;
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
  const [launcherDeleteAppId, setLauncherDeleteAppId] = useState<string | null>(null);
  const horizontalPadding = width < 430 ? 22 : 32;
  const contentWidth = Math.min(width - horizontalPadding * 2, 900);
  const isCompact = width < 520;
  const compactColumns = 3;
  const launcherGap = isCompact ? 20 : 24;
  const tileWidth = isCompact ? Math.floor((contentWidth - launcherGap * (compactColumns - 1)) / compactColumns) : 116;
  const installableGap = 12;
  const installableColumns = contentWidth >= 760 ? 3 : contentWidth >= 560 ? 2 : 1;
  const installableTileWidth = Math.floor((contentWidth - installableGap * (installableColumns - 1)) / installableColumns);
  const iconSize = isCompact ? 76 : 84;
  const launchingTemplate = catalog.find((template) => template.app.appId === launchingAppId) ?? null;
  const aiReady = Boolean(aiProviderConfig.apiKey.trim() && aiProviderConfig.model.trim());

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
          <YStack width="100%" maxWidth={900} alignSelf="center" gap="$6">
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
              <XStack alignItems="center" gap="$3" flex={1} minWidth={0}>
                <YStack
                  width={48}
                  height={48}
                  borderRadius={17}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={theme.primaryColor}
                  shadowColor={theme.primaryColor}
                  shadowOpacity={theme.mode === 'dark' ? 0.34 : 0.2}
                  shadowRadius={18}
                  shadowOffset={{ width: 0, height: 10 }}
                >
                  <Sparkles color={theme.primaryContrastColor} size={23} strokeWidth={2.1} />
                </YStack>
                <YStack flex={1} minWidth={0}>
                  <Text
                    flexShrink={1}
                    numberOfLines={1}
                    fontSize={isCompact ? 29 : 36}
                    lineHeight={isCompact ? 35 : 42}
                    fontWeight="900"
                    fontFamily={theme.fontFamilyValue}
                    color={theme.textColor}
                  >
                    {PRODUCT_NAME}
                  </Text>
                  <Text color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={13} lineHeight={18} fontWeight="700" numberOfLines={1}>
                    {PRODUCT_TAGLINE}
                  </Text>
                </YStack>
              </XStack>
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

            <HomeHeroCard
              theme={theme}
              installedCount={catalog.length}
              installableCount={installableTemplateSources.length}
              cloudConnected={Boolean(supabaseSession)}
              aiReady={aiReady}
            />

            <YStack gap="$4">
              <SectionHeading theme={theme} title={t('home.installedApps')} detail={`${catalog.length} ready`} />
              {catalog.length > 0 ? (
                <XStack gap={launcherGap} rowGap={28} flexWrap="wrap" alignItems="flex-start">
                  {catalog.map((template) => (
                    <LauncherAppTile
                      key={template.app.appId}
                      template={template}
                      theme={theme}
                      width={tileWidth}
                      iconSize={iconSize}
                      deleteVisible={launcherDeleteAppId === template.app.appId || uninstallingAppId === template.app.appId}
                      uninstalling={uninstallingAppId === template.app.appId}
                      onLaunch={(appId) => {
                        setLauncherDeleteAppId(null);
                        onLaunch(appId);
                      }}
                      onRevealDelete={() => setLauncherDeleteAppId(template.app.appId)}
                      onUninstall={(nextTemplate) => {
                        setLauncherDeleteAppId(null);
                        onUninstall(nextTemplate);
                      }}
                    />
                  ))}
                </XStack>
              ) : (
                <YStack
                  width="100%"
                  padding="$4"
                  borderWidth={1}
                  borderColor={theme.borderColor}
                  borderRadius={22}
                  backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
                >
                  <XStack gap="$3" alignItems="center">
                    <YStack width={48} height={48} borderRadius={16} alignItems="center" justifyContent="center" backgroundColor={theme.primarySoftColor}>
                      <Package color={theme.primaryColor} size={23} strokeWidth={2.2} />
                    </YStack>
                    <YStack flex={1} minWidth={0} gap="$1">
                      <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={15} lineHeight={20} fontWeight="900">
                        No apps installed
                      </Text>
                      <Paragraph color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={13} lineHeight={19}>
                        Install an app from the catalog below to start again.
                      </Paragraph>
                    </YStack>
                  </XStack>
                </YStack>
              )}
            </YStack>

            <YStack gap="$4">
              <SectionHeading theme={theme} title={t('home.appsToInstall')} detail={installableTemplateSources.length > 0 ? `${installableTemplateSources.length} available` : 'Catalog clear'} />
              {installableTemplateSources.length > 0 ? (
                <XStack gap={installableGap} rowGap={installableGap} flexWrap="wrap" alignItems="stretch">
                  {installableTemplateSources.map((source) => (
                    <InstallableTemplateTile
                      key={source.id}
                      source={source}
                      theme={theme}
                      t={t}
                      width={installableTileWidth}
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
                  borderRadius={22}
                  backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
                  shadowColor={theme.mode === 'dark' ? '#000000' : '#64748b'}
                  shadowOpacity={theme.mode === 'dark' ? 0.22 : 0.08}
                  shadowRadius={18}
                  shadowOffset={{ width: 0, height: 10 }}
                >
                  <XStack gap="$3" alignItems="center">
                    <YStack width={48} height={48} borderRadius={16} alignItems="center" justifyContent="center" backgroundColor={theme.primarySoftColor}>
                      <DownloadCloud color={theme.primaryColor} size={23} strokeWidth={2.2} />
                    </YStack>
                    <YStack flex={1} minWidth={0} gap="$1">
                      <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={15} lineHeight={20} fontWeight="900">
                        Templates are up to date
                      </Text>
                      <Paragraph color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={13} lineHeight={19}>
                        {t('home.noCuratedApps')}
                      </Paragraph>
                    </YStack>
                  </XStack>
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

function HomeHeroCard({
  theme,
  installedCount,
  installableCount,
  cloudConnected,
  aiReady,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  installedCount: number;
  installableCount: number;
  cloudConnected: boolean;
  aiReady: boolean;
}) {
  return (
    <YStack
      width="100%"
      gap="$4"
      padding="$5"
      borderRadius={28}
      borderWidth={1}
      borderColor={theme.mode === 'dark' ? '#1e293b' : '#dbeafe'}
      backgroundColor={theme.mode === 'dark' ? '#101827' : '#f8fbff'}
      shadowColor={theme.mode === 'dark' ? '#000000' : '#2563eb'}
      shadowOpacity={theme.mode === 'dark' ? 0.26 : 0.1}
      shadowRadius={24}
      shadowOffset={{ width: 0, height: 14 }}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$4">
        <YStack flex={1} minWidth={0} gap="$2">
          <Text color={theme.primaryColor} fontFamily={theme.fontFamilyValue} fontSize={12} lineHeight={16} fontWeight="900">
            TODAY'S WORKSPACE
          </Text>
          <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={24} lineHeight={30} fontWeight="900">
            Launch apps, then shape them your way.
          </Text>
          <Paragraph color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={14} lineHeight={21}>
            Install what you need, run it locally, and customize when the workflow changes.
          </Paragraph>
        </YStack>
        <YStack width={64} height={64} borderRadius={22} alignItems="center" justifyContent="center" backgroundColor={theme.primaryColor} flexShrink={0}>
          <Wand2 color={theme.primaryContrastColor} size={30} strokeWidth={2.2} />
        </YStack>
      </XStack>
      <XStack gap="$2" rowGap="$2" flexWrap="wrap">
        <HomeMetricChip theme={theme} value={installedCount} label="Installed" icon={LayoutGrid} />
        <HomeMetricChip theme={theme} value={installableCount} label="To install" icon={DownloadCloud} />
        <HomeStateChip theme={theme} active={cloudConnected} activeLabel="Cloud sync on" inactiveLabel="Cloud setup" icon={Cloud} />
        <HomeStateChip theme={theme} active={aiReady} activeLabel="AI ready" inactiveLabel="Add AI key" icon={Bot} />
      </XStack>
    </YStack>
  );
}

function HomeMetricChip({
  theme,
  value,
  label,
  icon: Icon,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  value: number;
  label: string;
  icon: ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
}) {
  return (
    <XStack minHeight={40} alignItems="center" gap="$2" paddingHorizontal="$3" borderRadius={999} backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}>
      <Icon color={theme.primaryColor} size={16} strokeWidth={2.2} />
      <Text color={theme.textColor} fontFamily={theme.fontFamilyValue} fontSize={13} lineHeight={17} fontWeight="900">
        {value}
      </Text>
      <Text color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={12} lineHeight={16} fontWeight="700">
        {label}
      </Text>
    </XStack>
  );
}

function HomeStateChip({
  theme,
  active,
  activeLabel,
  inactiveLabel,
  icon: Icon,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  icon: ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
}) {
  const color = active ? theme.successColor : theme.mutedTextColor;

  return (
    <XStack
      minHeight={40}
      alignItems="center"
      gap="$2"
      paddingHorizontal="$3"
      borderRadius={999}
      backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
      borderWidth={1}
      borderColor={active ? theme.primarySoftColor : theme.borderColor}
    >
      <Icon color={color} size={16} strokeWidth={2.2} />
      <Text color={color} fontFamily={theme.fontFamilyValue} fontSize={12} lineHeight={16} fontWeight="800">
        {active ? activeLabel : inactiveLabel}
      </Text>
    </XStack>
  );
}

function SectionHeading({
  theme,
  title,
  detail,
}: {
  theme: ReturnType<typeof resolveAppTheme>;
  title: string;
  detail: string;
}) {
  return (
    <XStack alignItems="center" justifyContent="space-between" gap="$3">
      <Text fontSize={16} lineHeight={22} fontWeight="900" fontFamily={theme.fontFamilyValue} color={theme.textColor}>
        {title}
      </Text>
      <YStack paddingHorizontal="$2.5" paddingVertical="$1" borderRadius={999} backgroundColor={theme.mode === 'dark' ? '#172033' : '#f1f5f9'}>
        <Text fontSize={11} lineHeight={14} fontWeight="800" fontFamily={theme.fontFamilyValue} color={theme.mutedTextColor}>
          {detail}
        </Text>
      </YStack>
    </XStack>
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
          placeholder='Optional headers JSON, e.g. {"HTTP-Referer":"https://tinkaar.local"}'
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
          {status.message || 'Keys stay on this device. Supabase is only used after you enable Cloud Sync here.'}
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
                    Describe a tweak to fields, forms, dashboard widgets, validations, or workflow logic. Tinkaar will validate the generated app before saving a new version.
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
                    {versionCount} saved versions for this app. New versions replace the installed app locally and {supabaseReady ? 'will be stored in your Supabase account.' : 'can sync to Supabase after Cloud Sync is enabled in Settings.'}
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
  width,
  onInstall,
}: {
  source: InstallableTemplateSource;
  theme: ReturnType<typeof resolveAppTheme>;
  t: Translator;
  width: number;
  onInstall: () => void;
}) {
  const icon = getInstallableTemplateIcon(source, theme.mode);
  const Icon = icon.component;
  const description = getVisibleTemplateDescription(source.description);
  const visibleTags = getVisibleTemplateTags(source.tags);

  return (
    <YStack
      width={width}
      height={196}
      padding="$4"
      gap="$3"
      justifyContent="space-between"
      borderWidth={1}
      borderColor={theme.borderColor}
      borderRadius={24}
      backgroundColor={theme.mode === 'dark' ? '#172033' : '#ffffff'}
      shadowColor={theme.mode === 'dark' ? '#000000' : '#64748b'}
      shadowOpacity={theme.mode === 'dark' ? 0.22 : 0.08}
      shadowRadius={18}
      shadowOffset={{ width: 0, height: 10 }}
    >
      <XStack alignItems="flex-start" gap="$3">
        <YStack
          width={52}
          height={52}
          borderRadius={18}
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
          {description ? (
            <Paragraph color={theme.mutedTextColor} fontFamily={theme.fontFamilyValue} fontSize={13} lineHeight={18} numberOfLines={2}>
              {description}
            </Paragraph>
          ) : null}
        </YStack>
      </XStack>
      {visibleTags.length > 0 ? (
        <XStack gap="$1.5" rowGap="$1.5" flexWrap="wrap">
          {visibleTags.slice(0, 3).map((tag) => (
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
        minHeight={46}
        height="auto"
        paddingVertical="$2.5"
        width="100%"
        backgroundColor={theme.primaryColor}
        borderRadius={999}
        color={theme.primaryContrastColor}
        fontFamily={theme.fontFamilyValue}
        fontWeight="900"
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
  deleteVisible,
  uninstalling,
  onLaunch,
  onRevealDelete,
  onUninstall,
}: {
  template: TemplateBundle;
  theme: ReturnType<typeof resolveAppTheme>;
  width: number;
  iconSize: number;
  deleteVisible: boolean;
  uninstalling: boolean;
  onLaunch: (appId: string) => void;
  onRevealDelete: () => void;
  onUninstall: (template: TemplateBundle) => void;
}) {
  const icon = getLauncherIcon(template, theme.mode);
  const Icon = icon.component;
  const longPressTriggered = useRef(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Launch ${template.app.name}`}
      onPress={() => {
        if (longPressTriggered.current) {
          longPressTriggered.current = false;
          return;
        }
        onLaunch(template.app.appId);
      }}
      onLongPress={() => {
        longPressTriggered.current = true;
        onRevealDelete();
      }}
      delayLongPress={360}
      style={({ pressed }) => ({
        opacity: pressed ? 0.72 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <YStack width={width} minHeight={128} gap="$2" alignItems="center">
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
          {template.source === 'installed' ? (
            <YStack
              position="absolute"
              right={-3}
              bottom={-3}
              width={24}
              height={24}
              borderRadius={12}
              alignItems="center"
              justifyContent="center"
              backgroundColor={theme.primaryColor}
              borderWidth={2}
              borderColor={theme.backgroundColor}
            >
              <Wand2 color={theme.primaryContrastColor} size={12} strokeWidth={2.5} />
            </YStack>
          ) : null}
          {deleteVisible ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Uninstall ${template.app.name}`}
              disabled={uninstalling}
              onPress={(event) => {
                event.stopPropagation();
                onUninstall(template);
              }}
              style={({ pressed }) => ({
                position: 'absolute',
                top: -8,
                right: -8,
                opacity: uninstalling ? 0.5 : pressed ? 0.76 : 1,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              })}
            >
              <YStack
                width={32}
                height={32}
                borderRadius={16}
                alignItems="center"
                justifyContent="center"
                backgroundColor={theme.mode === 'dark' ? '#451a1a' : '#fff1f2'}
                borderWidth={2}
                borderColor={theme.backgroundColor}
              >
                <Trash2 color={theme.dangerColor} size={15} strokeWidth={2.3} />
              </YStack>
            </Pressable>
          ) : null}
        </YStack>
        <Text
          width="100%"
          textAlign="center"
          numberOfLines={1}
          fontSize={14}
          lineHeight={18}
          fontWeight="800"
          fontFamily={theme.fontFamilyValue}
          color={theme.textColor}
        >
          {template.app.name}
        </Text>
        <Text width="100%" textAlign="center" numberOfLines={1} fontSize={11} lineHeight={14} fontWeight="700" fontFamily={theme.fontFamilyValue} color={theme.mutedTextColor}>
          {template.source === 'installed' ? 'Custom' : 'Built in'}
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
  const iconKey = inferIconKey([template.app.icon, template.app.appId, template.app.name]);

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

  if (iconKey === 'crm' || iconKey === 'sales' || iconKey === 'deals') {
    return mode === 'dark'
      ? { component: BriefcaseBusiness, backgroundColor: '#581c87', borderColor: '#7e22ce', highlightColor: '#a855f7', color: '#f3e8ff' }
      : { component: BriefcaseBusiness, backgroundColor: '#f3e8ff', borderColor: '#e9d5ff', highlightColor: '#ffffff', color: '#7c3aed' };
  }

  if (iconKey === 'vendor' || iconKey === 'vendor-management' || iconKey === 'supplier' || iconKey === 'operations') {
    return mode === 'dark'
      ? { component: Handshake, backgroundColor: '#164e63', borderColor: '#0891b2', highlightColor: '#06b6d4', color: '#cffafe' }
      : { component: Handshake, backgroundColor: '#cffafe', borderColor: '#a5f3fc', highlightColor: '#ecfeff', color: '#0891b2' };
  }

  return mode === 'dark'
    ? { component: Package, backgroundColor: '#334155', borderColor: '#475569', highlightColor: '#64748b', color: '#f8fafc' }
    : { component: Package, backgroundColor: '#f1f5f9', borderColor: '#e2e8f0', highlightColor: '#ffffff', color: template.app.theme.light.primaryColor };
}

function getInstallableTemplateIcon(source: InstallableTemplateSource, mode: 'light' | 'dark'): LauncherIcon {
  const iconKey = inferIconKey([source.icon, source.appId, source.id, source.name, ...(source.tags ?? [])]);

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

  if (iconKey === 'crm' || iconKey === 'sales' || iconKey === 'deals') {
    return mode === 'dark'
      ? { component: BriefcaseBusiness, backgroundColor: '#581c87', borderColor: '#7e22ce', highlightColor: '#a855f7', color: '#f3e8ff' }
      : { component: BriefcaseBusiness, backgroundColor: '#f3e8ff', borderColor: '#e9d5ff', highlightColor: '#ffffff', color: '#7c3aed' };
  }

  if (iconKey === 'vendor' || iconKey === 'vendor-management' || iconKey === 'supplier' || iconKey === 'operations') {
    return mode === 'dark'
      ? { component: Handshake, backgroundColor: '#164e63', borderColor: '#0891b2', highlightColor: '#06b6d4', color: '#cffafe' }
      : { component: Handshake, backgroundColor: '#cffafe', borderColor: '#a5f3fc', highlightColor: '#ecfeff', color: '#0891b2' };
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
    ? { component: LayoutGrid, backgroundColor: '#312e81', borderColor: '#4338ca', highlightColor: '#4f46e5', color: '#c7d2fe' }
    : { component: LayoutGrid, backgroundColor: '#eef2ff', borderColor: '#c7d2fe', highlightColor: '#ffffff', color: '#4f46e5' };
}

function getVisibleTemplateTags(tags: string[] | undefined) {
  return (tags ?? []).filter((tag) => tag.trim().toLowerCase() !== 'ministore');
}

function getVisibleTemplateDescription(description: string | undefined) {
  const legacyProductNamePattern = new RegExp(`\\b${['App', 'Foundry'].join('')}\\b`, 'g');
  return description?.replace(/\bMiniStore\b/g, PRODUCT_NAME).replace(legacyProductNamePattern, PRODUCT_NAME);
}

function inferIconKey(values: Array<string | undefined>) {
  const tokens = values
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase());

  const joined = tokens.join(' ');
  if (joined.includes('todo') || joined.includes('task') || joined.includes('check')) {
    return 'todo';
  }
  if (joined.includes('crm') || joined.includes('sales') || joined.includes('deal')) {
    return 'crm';
  }
  if (joined.includes('vendor') || joined.includes('supplier') || joined.includes('operation')) {
    return 'vendor';
  }
  if (joined.includes('expense') || joined.includes('wallet') || joined.includes('finance')) {
    return 'expense-tracker';
  }
  if (joined.includes('inventory') || joined.includes('package') || joined.includes('stock')) {
    return 'inventory';
  }
  if (joined.includes('kitchen') || joined.includes('layout') || joined.includes('field-service') || joined.includes('service')) {
    return 'layout-grid';
  }

  return tokens[0] ?? '';
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
