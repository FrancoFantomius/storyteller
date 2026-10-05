// Settings Page Controller
import '@francofantomius/material-components/button';
import '@francofantomius/material-components/icon';
import '@francofantomius/material-components/divider';
import '@francofantomius/material-components/switch';
import '@francofantomius/material-components/segmented-button';
import { setupNavigation, showToast } from '../components/nav-bar.js';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../services/storage.js';

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation('settings');
  populateSettingsForm();
  setupEventListeners();
});

function populateSettingsForm() {
  const settings = getSettings();

  // 1. UI & Layout
  const currentTheme = settings.theme || 'system';
  const themeButtons = document.querySelectorAll('#theme-segmented-set md-segmented-button');
  themeButtons.forEach(btn => {
    btn.selected = btn.value === currentTheme;
  });

  // 2. Story Settings
  const quickSuggSwitch = document.getElementById('quick-sugg-switch');
  if (quickSuggSwitch) quickSuggSwitch.selected = settings.autoSuggestActions !== false;

  const generateImagesSwitch = document.getElementById('generate-images-switch');
  if (generateImagesSwitch) generateImagesSwitch.selected = settings.generateArt !== false;
}

function setupEventListeners() {
  // Theme Segmented Button Set selector
  const themeButtons = document.querySelectorAll('#theme-segmented-set md-segmented-button');
  const themeSet = document.getElementById('theme-segmented-set');
  const onThemeSelect = (themeChoice) => {
    if (!themeChoice) return;
    themeButtons.forEach(btn => {
      btn.selected = btn.value === themeChoice;
    });
    saveSettings({ theme: themeChoice });
    const label = themeChoice === 'system' ? 'System Theme' : (themeChoice === 'dark' ? 'Dark Theme' : 'Light Theme');
    showToast(`Theme changed to ${label}`);
  };
  if (themeSet) {
    themeSet.addEventListener('change', (e) => onThemeSelect(e.detail?.value || e.target?.value));
  }
  themeButtons.forEach(btn => btn.addEventListener('click', () => onThemeSelect(btn.value)));

  // Auto-save on switch changes
  ['quick-sugg-switch', 'generate-images-switch'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      saveCurrentSettings(false);
    });
  });

  // Reset to Defaults
  document.getElementById('reset-defaults-btn')?.addEventListener('click', () => {
    if (confirm('Reset settings to default values?')) {
      saveSettings(DEFAULT_SETTINGS);
      populateSettingsForm();
      showToast('Settings reset to defaults');
    }
  });
}

function saveCurrentSettings(showToastMessage = true) {
  const selectedThemeBtn = document.querySelector('#theme-segmented-set md-segmented-button[selected]');
  const chosenTheme = selectedThemeBtn?.value || (getSettings().theme || 'system');
  const generateArt = document.getElementById('generate-images-switch')?.selected !== false;

  const updated = {
    theme: chosenTheme,
    autoSuggestActions: document.getElementById('quick-sugg-switch')?.selected !== false,
    generateArt: generateArt,
    imageProvider: generateArt ? 'diffusers' : 'none',
  };

  saveSettings(updated);
  if (showToastMessage) {
    showToast('Settings saved successfully!');
  }
}
