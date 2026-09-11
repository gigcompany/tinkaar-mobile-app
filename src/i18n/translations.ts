export type LanguageCode = 'en' | 'hi' | 'ta' | 'te' | 'kn';

export type TranslationKey =
  | 'common.back'
  | 'common.continue'
  | 'common.install'
  | 'common.installing'
  | 'common.load'
  | 'common.loading'
  | 'common.save'
  | 'language.title'
  | 'language.copy'
  | 'language.action'
  | 'language.settingsTitle'
  | 'language.current'
  | 'onboarding.title'
  | 'onboarding.copy'
  | 'onboarding.brandLine'
  | 'onboarding.stepCounter'
  | 'onboarding.progressTitle'
  | 'onboarding.stepLanguage'
  | 'onboarding.stepCloud'
  | 'onboarding.stepAccount'
  | 'onboarding.stepOrg'
  | 'onboarding.stepApps'
  | 'onboarding.cloudTitle'
  | 'onboarding.cloudCopy'
  | 'onboarding.privateTitle'
  | 'onboarding.privateCopy'
  | 'onboarding.setupStepCreateProject'
  | 'onboarding.setupStepRunSql'
  | 'onboarding.setupStepCopyKeys'
  | 'onboarding.manualTitle'
  | 'onboarding.manualCopy'
  | 'onboarding.saveTenantProject'
  | 'onboarding.privateFootnote'
  | 'onboarding.projectUrl'
  | 'onboarding.publishableKey'
  | 'onboarding.syncTable'
  | 'onboarding.accountTitle'
  | 'onboarding.accountCopy'
  | 'onboarding.email'
  | 'onboarding.password'
  | 'onboarding.signIn'
  | 'onboarding.createAccount'
  | 'onboarding.orgTitle'
  | 'onboarding.orgCopy'
  | 'onboarding.orgName'
  | 'onboarding.orgSaving'
  | 'onboarding.createOrg'
  | 'onboarding.appsTitle'
  | 'onboarding.appsCopy'
  | 'onboarding.bundledReady'
  | 'onboarding.finishSetup'
  | 'home.openSettings'
  | 'home.installedApps'
  | 'home.appsToInstall'
  | 'home.noCuratedApps'
  | 'settings.title'
  | 'settings.close'
  | 'settings.appearance'
  | 'settings.theme'
  | 'settings.accent'
  | 'settings.currency'
  | 'settings.templateCatalog'
  | 'settings.installed'
  | 'settings.supabaseSync'
  | 'settings.connected'
  | 'settings.signOut'
  | 'runtime.apps'
  | 'runtime.backToProduct'
  | 'runtime.closeModal'
  | 'runtime.syncNow'
  | 'runtime.retrySync'
  | 'runtime.lastSyncFailed'
  | 'theme.light'
  | 'theme.dark'
  | 'theme.system'
  | 'status.checkingSupabase'
  | 'status.syncingAs'
  | 'status.connectProject'
  | 'status.signInToSync'
  | 'status.enterEmailPassword'
  | 'status.signingIn'
  | 'status.signedIn'
  | 'status.creatingAccount'
  | 'status.confirmEmail'
  | 'status.accountCreated'
  | 'status.signingOut'
  | 'status.signedOut'
  | 'status.enterTemplateUrl'
  | 'status.invalidTemplateUrl'
  | 'status.enterTemplateCatalogUrl'
  | 'status.invalidTemplateCatalogUrl'
  | 'status.loadingTemplateCatalog'
  | 'status.loadedTemplateCatalog'
  | 'status.unableLoadTemplateCatalog'
  | 'status.downloadingTemplate'
  | 'status.installedTemplate'
  | 'status.unableInstallTemplate'
  | 'status.manualProjectConnected'
  | 'status.enterOrganization'
  | 'status.signInBeforeOrg'
  | 'status.settingUpOrg'
  | 'status.orgReady'
  | 'status.finishRequired'
  | 'status.installingApps'
  | 'status.finishingSetup'
  | 'status.setupComplete';

type TranslationParams = Record<string, string | number>;
type TranslationCatalog = Record<TranslationKey, string>;

export type SupportedLanguage = {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
};

export const defaultLanguage: LanguageCode = 'en';

export const supportedLanguages: SupportedLanguage[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
];

const en: TranslationCatalog = {
  'common.back': 'Back',
  'common.continue': 'Continue',
  'common.install': 'Install',
  'common.installing': 'Installing',
  'common.load': 'Load',
  'common.loading': 'Loading',
  'common.save': 'Save',
  'language.title': 'Choose your language',
  'language.copy': 'AppFoundry will use this language for setup, settings, and app controls. You can change it later.',
  'language.action': 'Continue',
  'language.settingsTitle': 'Language',
  'language.current': 'Current language',
  'onboarding.title': 'Create your work hub',
  'onboarding.copy': 'A short local setup. Cloud Sync is optional and can be added later from Settings.',
  'onboarding.brandLine': 'Apps, records, and sync in one place',
  'onboarding.stepCounter': '{current} of {total}',
  'onboarding.progressTitle': 'Setup path',
  'onboarding.stepLanguage': 'Language',
  'onboarding.stepCloud': 'Cloud',
  'onboarding.stepAccount': 'Account',
  'onboarding.stepOrg': 'Org',
  'onboarding.stepApps': 'Apps',
  'onboarding.cloudTitle': 'Connect your cloud',
  'onboarding.cloudCopy': 'Use your own Supabase project. Only the public URL and publishable key are saved on this device.',
  'onboarding.privateTitle': 'Private BYO Supabase',
  'onboarding.privateCopy': 'Create the project in your own Supabase account and run the open-source AppFoundry SQL before connecting this app.',
  'onboarding.setupStepCreateProject': 'Create a Supabase project in your tenant account.',
  'onboarding.setupStepRunSql': 'Run supabase/schema.sql in the Supabase SQL editor or CLI.',
  'onboarding.setupStepCopyKeys': 'Copy the project URL and anon/publishable key into AppFoundry.',
  'onboarding.manualTitle': 'Project details',
  'onboarding.manualCopy': 'These values stay in local app storage. Do not paste service-role keys, database passwords, or Management API tokens.',
  'onboarding.saveTenantProject': 'Save Project',
  'onboarding.privateFootnote': 'AppFoundry is not in the runtime data path for this open-source setup.',
  'onboarding.projectUrl': 'Project URL',
  'onboarding.publishableKey': 'Publishable key',
  'onboarding.syncTable': 'Sync table',
  'onboarding.accountTitle': 'Sign in securely',
  'onboarding.accountCopy': 'Sign in with Supabase Auth so your synced records stay private.',
  'onboarding.email': 'Email',
  'onboarding.password': 'Password',
  'onboarding.signIn': 'Sign In',
  'onboarding.createAccount': 'Create Account',
  'onboarding.orgTitle': 'Name your workspace',
  'onboarding.orgCopy': "Name the workspace that will own this device's apps and synced data.",
  'onboarding.orgName': 'Organization name',
  'onboarding.orgSaving': 'Saving',
  'onboarding.createOrg': 'Create Workspace',
  'onboarding.appsTitle': 'Pick starter apps',
  'onboarding.appsCopy': 'Start with the built-in app. Your records are saved locally with SQLite on this device.',
  'onboarding.bundledReady': 'The starter app is ready. Supabase Cloud Sync is optional and lives in Settings.',
  'onboarding.finishSetup': 'Start Using AppFoundry',
  'home.openSettings': 'Open settings',
  'home.installedApps': 'Installed Apps',
  'home.appsToInstall': 'Apps To Install',
  'home.noCuratedApps': 'No curated apps are available yet.',
  'settings.title': 'Settings',
  'settings.close': 'Close settings',
  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.accent': 'Accent',
  'settings.currency': 'Currency',
  'settings.templateCatalog': 'Public catalog JSON',
  'settings.installed': 'Installed',
  'settings.supabaseSync': 'Optional Cloud Sync',
  'settings.connected': 'Connected',
  'settings.signOut': 'Sign Out',
  'runtime.apps': 'Apps',
  'runtime.backToProduct': 'Back to {product}',
  'runtime.closeModal': 'Close modal',
  'runtime.syncNow': 'Sync now',
  'runtime.retrySync': 'Retry sync. {message}',
  'runtime.lastSyncFailed': 'Last sync failed.',
  'theme.light': 'Light theme',
  'theme.dark': 'Dark theme',
  'theme.system': 'System theme',
  'status.checkingSupabase': 'Checking Supabase session...',
  'status.syncingAs': 'Syncing as {identity}.',
  'status.connectProject': 'Cloud Sync is off. Add Supabase details here only if you want sync.',
  'status.signInToSync': 'Sign in to enable database sync.',
  'status.enterEmailPassword': 'Enter email and password.',
  'status.signingIn': 'Signing in...',
  'status.signedIn': 'Signed in.',
  'status.creatingAccount': 'Creating account...',
  'status.confirmEmail': 'Check your email to confirm the account, then sign in.',
  'status.accountCreated': 'Account created.',
  'status.signingOut': 'Signing out...',
  'status.signedOut': 'Signed out. Local data stays on this device.',
  'status.enterTemplateUrl': 'Enter a template URL.',
  'status.invalidTemplateUrl': 'Template URL must start with http:// or https://.',
  'status.enterTemplateCatalogUrl': 'Enter a catalog URL.',
  'status.invalidTemplateCatalogUrl': 'Catalog URL must start with http:// or https://.',
  'status.loadingTemplateCatalog': 'Loading app catalog...',
  'status.loadedTemplateCatalog': 'Loaded {count} apps from the catalog.',
  'status.unableLoadTemplateCatalog': 'Unable to load app catalog.',
  'status.downloadingTemplate': 'Downloading template...',
  'status.installedTemplate': 'Installed {name}.',
  'status.unableInstallTemplate': 'Unable to install template.',
  'status.manualProjectConnected': 'Supabase project connected.',
  'status.enterOrganization': 'Enter your organization name.',
  'status.signInBeforeOrg': 'Sign in before setting up your organization.',
  'status.settingUpOrg': 'Setting up organization...',
  'status.orgReady': '{name} is ready.',
  'status.finishRequired': 'Finish the required setup steps first.',
  'status.installingApps': 'Installing selected apps...',
  'status.finishingSetup': 'Finishing setup...',
  'status.setupComplete': 'Local setup complete.',
};

const hi: Partial<TranslationCatalog> = {
  'common.back': 'वापस',
  'common.continue': 'आगे बढ़ें',
  'common.install': 'इंस्टॉल करें',
  'common.installing': 'इंस्टॉल हो रहा है',
  'language.title': 'अपनी भाषा चुनें',
  'language.copy': 'AppFoundry सेटअप, सेटिंग्स और ऐप नियंत्रणों के लिए इस भाषा का उपयोग करेगा। आप इसे बाद में बदल सकते हैं।',
  'language.action': 'आगे बढ़ें',
  'language.settingsTitle': 'भाषा',
  'language.current': 'चुनी गई भाषा',
  'onboarding.title': '{product} सेट करें',
  'onboarding.copy': 'Choose your language and start with local storage. Cloud Sync is optional in Settings.',
  'onboarding.stepLanguage': 'भाषा',
  'onboarding.stepCloud': 'क्लाउड',
  'onboarding.stepAccount': 'खाता',
  'onboarding.stepOrg': 'संगठन',
  'onboarding.stepApps': 'ऐप्स',
  'onboarding.cloudTitle': 'Connect Your Supabase Project',
  'onboarding.accountTitle': 'प्रमाणित करें',
  'onboarding.email': 'ईमेल',
  'onboarding.password': 'पासवर्ड',
  'onboarding.signIn': 'साइन इन',
  'onboarding.createAccount': 'खाता बनाएं',
  'onboarding.orgTitle': 'संगठन बनाएं',
  'onboarding.orgName': 'संगठन का नाम',
  'onboarding.orgSaving': 'सेव हो रहा है',
  'onboarding.createOrg': 'संगठन बनाएं',
  'onboarding.appsTitle': 'ऐप्स चुनें',
  'onboarding.finishSetup': 'सेटअप पूरा करें',
  'home.openSettings': 'सेटिंग्स खोलें',
  'home.installedApps': 'इंस्टॉल किए गए ऐप्स',
  'home.appsToInstall': 'इंस्टॉल करने के लिए ऐप्स',
  'settings.title': 'सेटिंग्स',
  'settings.close': 'सेटिंग्स बंद करें',
  'settings.appearance': 'दिखावट',
  'settings.connected': 'जुड़ा हुआ',
  'settings.signOut': 'साइन आउट',
  'runtime.apps': 'ऐप्स',
  'status.checkingSupabase': 'Supabase सत्र जांचा जा रहा है...',
  'status.syncingAs': '{identity} के रूप में सिंक हो रहा है।',
  'status.setupComplete': 'सेटअप पूरा हुआ।',
};

const ta: Partial<TranslationCatalog> = {
  'common.back': 'பின் செல்ல',
  'common.continue': 'தொடரவும்',
  'common.install': 'நிறுவவும்',
  'common.installing': 'நிறுவப்படுகிறது',
  'language.title': 'உங்கள் மொழியை தேர்ந்தெடுக்கவும்',
  'language.copy': 'AppFoundry அமைப்பு, அமைப்புகள், ஆப் கட்டுப்பாடுகளுக்கு இந்த மொழியை பயன்படுத்தும். பின்னர் மாற்றலாம்.',
  'language.action': 'தொடரவும்',
  'language.settingsTitle': 'மொழி',
  'language.current': 'தற்போதைய மொழி',
  'onboarding.title': '{product} அமைக்கவும்',
  'onboarding.copy': 'Choose your language and start with local storage. Cloud Sync is optional in Settings.',
  'onboarding.stepLanguage': 'மொழி',
  'onboarding.stepCloud': 'கிளவுட்',
  'onboarding.stepAccount': 'கணக்கு',
  'onboarding.stepOrg': 'நிறுவனம்',
  'onboarding.stepApps': 'ஆப்கள்',
  'onboarding.cloudTitle': 'Connect Your Supabase Project',
  'onboarding.accountTitle': 'உள்நுழைவு',
  'onboarding.email': 'மின்னஞ்சல்',
  'onboarding.password': 'கடவுச்சொல்',
  'onboarding.signIn': 'உள்நுழைய',
  'onboarding.createAccount': 'கணக்கு உருவாக்க',
  'onboarding.orgTitle': 'நிறுவனம் உருவாக்க',
  'onboarding.orgName': 'நிறுவனப் பெயர்',
  'onboarding.orgSaving': 'சேமிக்கப்படுகிறது',
  'onboarding.createOrg': 'நிறுவனம் உருவாக்க',
  'onboarding.appsTitle': 'ஆப்களை தேர்ந்தெடுக்கவும்',
  'onboarding.finishSetup': 'அமைப்பை முடிக்கவும்',
  'home.openSettings': 'அமைப்புகளைத் திறக்கவும்',
  'home.installedApps': 'நிறுவப்பட்ட ஆப்கள்',
  'home.appsToInstall': 'நிறுவ வேண்டிய ஆப்கள்',
  'settings.title': 'அமைப்புகள்',
  'settings.close': 'அமைப்புகளை மூடவும்',
  'settings.appearance': 'தோற்றம்',
  'settings.connected': 'இணைக்கப்பட்டது',
  'runtime.apps': 'ஆப்கள்',
  'status.syncingAs': '{identity} ஆக ஒத்திசைக்கிறது.',
  'status.setupComplete': 'அமைப்பு முடிந்தது.',
};

const te: Partial<TranslationCatalog> = {
  'common.back': 'వెనుకకు',
  'common.continue': 'కొనసాగించండి',
  'common.install': 'ఇన్‌స్టాల్ చేయండి',
  'common.installing': 'ఇన్‌స్టాల్ అవుతోంది',
  'language.title': 'మీ భాషను ఎంచుకోండి',
  'language.copy': 'AppFoundry సెటప్, సెట్టింగులు, యాప్ నియంత్రణలకు ఈ భాషను ఉపయోగిస్తుంది. తర్వాత మార్చవచ్చు.',
  'language.action': 'కొనసాగించండి',
  'language.settingsTitle': 'భాష',
  'language.current': 'ప్రస్తుత భాష',
  'onboarding.title': '{product} సెటప్ చేయండి',
  'onboarding.copy': 'Choose your language and start with local storage. Cloud Sync is optional in Settings.',
  'onboarding.stepLanguage': 'భాష',
  'onboarding.stepCloud': 'క్లౌడ్',
  'onboarding.stepAccount': 'ఖాతా',
  'onboarding.stepOrg': 'సంస్థ',
  'onboarding.stepApps': 'యాప్‌లు',
  'onboarding.cloudTitle': 'Connect Your Supabase Project',
  'onboarding.email': 'ఇమెయిల్',
  'onboarding.password': 'పాస్‌వర్డ్',
  'onboarding.signIn': 'సైన్ ఇన్',
  'onboarding.createAccount': 'ఖాతా సృష్టించండి',
  'onboarding.orgTitle': 'సంస్థను సృష్టించండి',
  'onboarding.orgName': 'సంస్థ పేరు',
  'onboarding.appsTitle': 'యాప్‌లను ఎంచుకోండి',
  'onboarding.finishSetup': 'సెటప్ పూర్తి చేయండి',
  'home.installedApps': 'ఇన్‌స్టాల్ చేసిన యాప్‌లు',
  'home.appsToInstall': 'ఇన్‌స్టాల్ చేయాల్సిన యాప్‌లు',
  'settings.title': 'సెట్టింగులు',
  'runtime.apps': 'యాప్‌లు',
  'status.syncingAs': '{identity} గా సింక్ అవుతోంది.',
  'status.setupComplete': 'సెటప్ పూర్తైంది.',
};

const kn: Partial<TranslationCatalog> = {
  'common.back': 'ಹಿಂದೆ',
  'common.continue': 'ಮುಂದುವರಿಸಿ',
  'common.install': 'ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ',
  'common.installing': 'ಇನ್‌ಸ್ಟಾಲ್ ಆಗುತ್ತಿದೆ',
  'language.title': 'ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ',
  'language.copy': 'AppFoundry ಸೆಟಪ್, ಸೆಟ್ಟಿಂಗ್‌ಗಳು ಮತ್ತು ಆಪ್ ನಿಯಂತ್ರಣಗಳಿಗೆ ಈ ಭಾಷೆಯನ್ನು ಬಳಸುತ್ತದೆ. ನಂತರ ಬದಲಾಯಿಸಬಹುದು.',
  'language.action': 'ಮುಂದುವರಿಸಿ',
  'language.settingsTitle': 'ಭಾಷೆ',
  'language.current': 'ಪ್ರಸ್ತುತ ಭಾಷೆ',
  'onboarding.title': '{product} ಸೆಟಪ್ ಮಾಡಿ',
  'onboarding.copy': 'Choose your language and start with local storage. Cloud Sync is optional in Settings.',
  'onboarding.stepLanguage': 'ಭಾಷೆ',
  'onboarding.stepCloud': 'ಕ್ಲೌಡ್',
  'onboarding.stepAccount': 'ಖಾತೆ',
  'onboarding.stepOrg': 'ಸಂಸ್ಥೆ',
  'onboarding.stepApps': 'ಆಪ್‌ಗಳು',
  'onboarding.cloudTitle': 'Connect Your Supabase Project',
  'onboarding.email': 'ಇಮೇಲ್',
  'onboarding.password': 'ಪಾಸ್‌ವರ್ಡ್',
  'onboarding.signIn': 'ಸೈನ್ ಇನ್',
  'onboarding.createAccount': 'ಖಾತೆ ರಚಿಸಿ',
  'onboarding.orgTitle': 'ಸಂಸ್ಥೆ ರಚಿಸಿ',
  'onboarding.orgName': 'ಸಂಸ್ಥೆಯ ಹೆಸರು',
  'onboarding.appsTitle': 'ಆಪ್‌ಗಳನ್ನು ಆಯ್ಕೆಮಾಡಿ',
  'onboarding.finishSetup': 'ಸೆಟಪ್ ಮುಗಿಸಿ',
  'home.installedApps': 'ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿದ ಆಪ್‌ಗಳು',
  'home.appsToInstall': 'ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಬೇಕಾದ ಆಪ್‌ಗಳು',
  'settings.title': 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
  'runtime.apps': 'ಆಪ್‌ಗಳು',
  'status.syncingAs': '{identity} ಆಗಿ ಸಿಂಕ್ ಆಗುತ್ತಿದೆ.',
  'status.setupComplete': 'ಸೆಟಪ್ ಮುಗಿದಿದೆ.',
};

const dictionaries: Record<LanguageCode, TranslationCatalog | Partial<TranslationCatalog>> = {
  en,
  hi,
  ta,
  te,
  kn,
};

export function isLanguageCode(value: unknown): value is LanguageCode {
  return supportedLanguages.some((language) => language.code === value);
}

export function translate(language: LanguageCode, key: TranslationKey, params: TranslationParams = {}) {
  const template = dictionaries[language][key] ?? en[key];

  return template.replace(/\{(\w+)\}/g, (_, paramKey: string) => {
    const value = params[paramKey];
    return value === undefined ? `{${paramKey}}` : String(value);
  });
}
