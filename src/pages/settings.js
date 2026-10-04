// Settings Page Controller
import '@francofantomius/material-components/button';
import '@francofantomius/material-components/icon-button';
import '@francofantomius/material-components/icon';
import '@francofantomius/material-components/text-field';
import '@francofantomius/material-components/card';
import '@francofantomius/material-components/dialog';
import '@francofantomius/material-components/divider';
import '@francofantomius/material-components/chip';
import '@francofantomius/material-components/switch';
import '@francofantomius/material-components/slider';
import '@francofantomius/material-components/loading-indicator';
import '@francofantomius/material-components/badge';
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

  // Model Settings & Parameters
  const tempSlider = document.getElementById('temp-slider');
  if (tempSlider) tempSlider.value = Math.round((settings.temperature || 0.7) * 100);

  const ctxSlider = document.getElementById('ctx-slider');
  if (ctxSlider) ctxSlider.value = settings.contextSize || 4096;

  const maxTokensSlider = document.getElementById('max-tokens-slider');
  if (maxTokensSlider) maxTokensSlider.value = settings.maxTokens || 600;

  const toneInput = document.getElementById('narrative-tone-input');
  if (toneInput) toneInput.value = settings.narrativeTone || 'Epic and richly descriptive';

  // UI & Layout Switches
  const genArtSwitch = document.getElementById('gen-art-switch');
  if (genArtSwitch) genArtSwitch.selected = settings.generateArt !== false;

  const quickSuggSwitch = document.getElementById('quick-sugg-switch');
  if (quickSuggSwitch) quickSuggSwitch.selected = settings.autoSuggestActions !== false;

  const currentTheme = settings.theme || 'system';
  const themeButtons = document.querySelectorAll('#theme-segmented-set md-segmented-button');
  themeButtons.forEach(btn => {
    btn.selected = btn.value === currentTheme;
  });
}

function setupEventListeners() {
  // Theme Segmented Button Set selector (Light / System / Dark)
  const themeButtons = document.querySelectorAll('#theme-segmented-set md-segmented-button');
  const themeSet = document.getElementById('theme-segmented-set');

  const onThemeSelect = (themeChoice) => {
    if (!themeChoice) return;
    themeButtons.forEach(btn => {
      btn.selected = (btn.value === themeChoice);
    });
    saveSettings({ theme: themeChoice });
    const label = themeChoice === 'system' ? 'System Theme' : (themeChoice === 'dark' ? 'Dark Theme' : 'Light Theme');
    showToast(`Theme changed to ${label}`);
  };

  if (themeSet) {
    themeSet.addEventListener('change', (e) => {
      const themeChoice = e.detail?.value || e.target?.value;
      onThemeSelect(themeChoice);
    });
  }

  themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      onThemeSelect(btn.value);
    });
  });

  // Auto-save on switches, inputs, and sliders change
  ['gen-art-switch', 'quick-sugg-switch'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      saveCurrentSettings(false);
    });
  });

  ['narrative-tone-input'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      saveCurrentSettings(false);
    });
  });

  ['temp-slider', 'ctx-slider', 'max-tokens-slider'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      saveCurrentSettings(false);
    });
  });

  // Reset to Defaults
  document.getElementById('reset-defaults-btn')?.addEventListener('click', () => {
    if (confirm('Reset all settings to default values?')) {
      saveSettings(DEFAULT_SETTINGS);
      populateSettingsForm();
      showToast('Settings reset to defaults');
    }
  });
}

function saveCurrentSettings(showToastMessage = true) {
  const selectedThemeBtn = document.querySelector('#theme-segmented-set md-segmented-button[selected]');
  const chosenTheme = selectedThemeBtn?.value || (getSettings().theme || 'system');

  const tempSlider = document.getElementById('temp-slider');
  const ctxSlider = document.getElementById('ctx-slider');
  const maxTokensSlider = document.getElementById('max-tokens-slider');

  const rawTemp = tempSlider ? (tempSlider.value ?? 70) : 70;
  const tempVal = Number(rawTemp) > 1.5 ? Number(rawTemp) / 100 : Number(rawTemp);

  const updated = {
    temperature: parseFloat(tempVal.toFixed(2)) || 0.7,
    contextSize: parseInt(ctxSlider?.value, 10) || 4096,
    maxTokens: parseInt(maxTokensSlider?.value, 10) || 600,
    narrativeTone: document.getElementById('narrative-tone-input')?.value?.trim() || 'Epic and richly descriptive',
    generateArt: document.getElementById('gen-art-switch')?.selected,
    autoSuggestActions: document.getElementById('quick-sugg-switch')?.selected,
    theme: chosenTheme,
  };

  saveSettings(updated);
  if (showToastMessage) {
    showToast('Settings saved successfully!');
  }
}
