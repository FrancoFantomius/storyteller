// Local storage helper for Storyteller user settings
const SETTINGS_KEY = 'storyteller_user_settings';

export const DEFAULT_SETTINGS = {
  ollamaHost: 'http://localhost:11434',
  ollamaModel: 'llama3:latest',
  useSimulationFallback: true,
  temperature: 0.7,
  topP: 0.9,
  contextSize: 4096,
  maxTokens: 600,
  theme: 'dark', // 'dark' | 'light'
  generateArt: true,
  autoSuggestActions: true,
  narrativeTone: 'Epic and richly descriptive',
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Failed to load settings from localStorage', e);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    const current = getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    applyThemeToDocument(updated.theme);
    return updated;
  } catch (e) {
    console.error('Failed to save settings to localStorage', e);
    return settings;
  }
}

export function applyThemeToDocument(theme) {
  const currentTheme = theme || getSettings().theme || 'dark';
  if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
