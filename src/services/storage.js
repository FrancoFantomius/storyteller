// Local storage helper for Storyteller user settings
const SETTINGS_KEY = 'storyteller_user_settings';

export function getSystemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

export const DEFAULT_SETTINGS = {
  llmProvider: 'llamacpp', // 'llamacpp' | 'simulation'
  llamaCppHost: 'http://localhost:8080',
  diffusersHost: 'http://localhost:8001',
  imageProvider: 'diffusers', // 'diffusers' | 'procedural' | 'none'
  diffusersSteps: 4,
  useSimulationFallback: true,
  temperature: 0.7,
  topP: 0.9,
  contextSize: 4096,
  maxTokens: 600,
  theme: 'system', // 'system' | 'dark' | 'light'
  generateArt: true,
  autoSuggestActions: true,
  narrativeTone: 'Richly descriptive and ',
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
  const chosen = theme || getSettings().theme || 'system';
  const effectiveTheme = chosen === 'system' ? getSystemTheme() : chosen;

  if (effectiveTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

// Automatically react to system/device theme adjustments when theme is set to 'system'
if (typeof window !== 'undefined' && window.matchMedia) {
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const s = getSettings();
      if (s.theme === 'system' || !s.theme) {
        applyThemeToDocument('system');
      }
    });
  } catch (e) {}
}
