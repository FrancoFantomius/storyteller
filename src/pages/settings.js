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
import { checkAllAiStatus } from '../services/api.js';

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation('settings');
  populateSettingsForm();
  setupEventListeners();
  checkAiEnginesHealth();
});

function populateSettingsForm() {
  const settings = getSettings();

  // 1. LLM Provider Segmented Set
  const currentLlmProvider = settings.llmProvider || 'llamacpp';
  const llmButtons = document.querySelectorAll('#llm-provider-segmented-set md-segmented-button');
  llmButtons.forEach(btn => {
    btn.selected = btn.value === currentLlmProvider;
  });
  toggleLlmCards(currentLlmProvider);

  const llamacppInput = document.getElementById('llamacpp-host-input');
  if (llamacppInput) llamacppInput.value = settings.llamaCppHost || 'http://localhost:8080';

  const ollamaHostInput = document.getElementById('ollama-host-input');
  if (ollamaHostInput) ollamaHostInput.value = settings.ollamaHost || 'http://localhost:11434';

  const ollamaModelInput = document.getElementById('ollama-model-input');
  if (ollamaModelInput) ollamaModelInput.value = settings.ollamaModel || 'dolphin-mistral:7b';

  // 2. Image Provider Segmented Set
  const currentImgProvider = settings.imageProvider || (settings.generateArt !== false ? 'diffusers' : 'none');
  const imgButtons = document.querySelectorAll('#image-provider-segmented-set md-segmented-button');
  imgButtons.forEach(btn => {
    btn.selected = btn.value === currentImgProvider;
  });
  toggleDiffusersCard(currentImgProvider);

  const diffusersHostInput = document.getElementById('diffusers-host-input');
  if (diffusersHostInput) diffusersHostInput.value = settings.diffusersHost || 'http://localhost:8001';

  const diffusersStepsSlider = document.getElementById('diffusers-steps-slider');
  if (diffusersStepsSlider) diffusersStepsSlider.value = settings.diffusersSteps || 4;

  // 3. UI & Layout
  const currentTheme = settings.theme || 'system';
  const themeButtons = document.querySelectorAll('#theme-segmented-set md-segmented-button');
  themeButtons.forEach(btn => {
    btn.selected = btn.value === currentTheme;
  });

  const quickSuggSwitch = document.getElementById('quick-sugg-switch');
  if (quickSuggSwitch) quickSuggSwitch.selected = settings.autoSuggestActions !== false;

  // 4. Model Parameters
  const tempSlider = document.getElementById('temp-slider');
  if (tempSlider) tempSlider.value = Math.round((settings.temperature || 0.7) * 100);

  const ctxSlider = document.getElementById('ctx-slider');
  if (ctxSlider) ctxSlider.value = settings.contextSize || 4096;

  const maxTokensSlider = document.getElementById('max-tokens-slider');
  if (maxTokensSlider) maxTokensSlider.value = settings.maxTokens || 600;

  const toneInput = document.getElementById('narrative-tone-input');
  if (toneInput) toneInput.value = settings.narrativeTone || 'Epic and richly descriptive';
}

function toggleLlmCards(provider) {
  const llamaCard = document.getElementById('llamacpp-config-card');
  const ollamaCard = document.getElementById('ollama-config-card');

  if (llamaCard) llamaCard.style.display = provider === 'llamacpp' ? 'flex' : 'none';
  if (ollamaCard) ollamaCard.style.display = provider === 'ollama' ? 'flex' : 'none';
}

function toggleDiffusersCard(provider) {
  const diffCard = document.getElementById('diffusers-config-card');
  if (diffCard) diffCard.style.display = provider === 'diffusers' ? 'flex' : 'none';
}

async function checkAiEnginesHealth() {
  const settings = getSettings();
  const llamaBadge = document.getElementById('llamacpp-status-badge');
  const diffusersBadge = document.getElementById('diffusers-status-badge');
  const ollamaBadge = document.getElementById('ollama-status-badge');

  if (llamaBadge) llamaBadge.innerHTML = `<md-chip label="Checking..." icon="sync"></md-chip>`;
  if (diffusersBadge) diffusersBadge.innerHTML = `<md-chip label="Checking..." icon="sync"></md-chip>`;
  if (ollamaBadge) ollamaBadge.innerHTML = `<md-chip label="Checking..." icon="sync"></md-chip>`;

  const status = await checkAllAiStatus({
    llamacppHost: settings.llamaCppHost || 'http://localhost:8080',
    diffusersHost: settings.diffusersHost || 'http://localhost:8001',
    ollamaHost: settings.ollamaHost || 'http://localhost:11434',
  });

  if (llamaBadge) {
    if (status.llamacpp?.online) {
      llamaBadge.innerHTML = `<md-chip label="Online (ROCm / Docker)" icon="check_circle" style="--md-sys-color-primary: #1b873f; color: #1b873f;"></md-chip>`;
    } else {
      llamaBadge.innerHTML = `<md-chip label="Offline / Unreachable" icon="error" style="color: var(--md-sys-color-error);"></md-chip>`;
    }
  }

  if (diffusersBadge) {
    if (status.diffusers?.online) {
      const gpuName = status.diffusers?.info?.gpu?.device_name || 'AMD GPU (ROCm)';
      diffusersBadge.innerHTML = `<md-chip label="Online: ${gpuName}" icon="check_circle" style="color: #1b873f;"></md-chip>`;
    } else {
      diffusersBadge.innerHTML = `<md-chip label="Offline / Unreachable" icon="error" style="color: var(--md-sys-color-error);"></md-chip>`;
    }
  }

  if (ollamaBadge) {
    if (status.ollama?.online) {
      const count = status.ollama?.info?.models?.length || 0;
      ollamaBadge.innerHTML = `<md-chip label="Online (${count} models)" icon="check_circle" style="color: #1b873f;"></md-chip>`;
    } else {
      ollamaBadge.innerHTML = `<md-chip label="Offline" icon="error" style="color: var(--md-sys-color-error);"></md-chip>`;
    }
  }
}

function setupEventListeners() {
  // LLM Provider Selector
  const llmButtons = document.querySelectorAll('#llm-provider-segmented-set md-segmented-button');
  const llmSet = document.getElementById('llm-provider-segmented-set');
  const onLlmSelect = (choice) => {
    if (!choice) return;
    llmButtons.forEach(btn => {
      btn.selected = btn.value === choice;
    });
    toggleLlmCards(choice);
    saveCurrentSettings(false);
  };
  if (llmSet) {
    llmSet.addEventListener('change', (e) => onLlmSelect(e.detail?.value || e.target?.value));
  }
  llmButtons.forEach(btn => btn.addEventListener('click', () => onLlmSelect(btn.value)));

  // Image Provider Selector
  const imgButtons = document.querySelectorAll('#image-provider-segmented-set md-segmented-button');
  const imgSet = document.getElementById('image-provider-segmented-set');
  const onImgSelect = (choice) => {
    if (!choice) return;
    imgButtons.forEach(btn => {
      btn.selected = btn.value === choice;
    });
    toggleDiffusersCard(choice);
    saveCurrentSettings(false);
  };
  if (imgSet) {
    imgSet.addEventListener('change', (e) => onImgSelect(e.detail?.value || e.target?.value));
  }
  imgButtons.forEach(btn => btn.addEventListener('click', () => onImgSelect(btn.value)));

  // Check Status button
  document.getElementById('check-ai-status-btn')?.addEventListener('click', () => {
    checkAiEnginesHealth();
    showToast('Checking AI container health...');
  });

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

  // Auto-save on input and slider changes
  [
    'llamacpp-host-input',
    'ollama-host-input',
    'ollama-model-input',
    'diffusers-host-input',
    'diffusers-steps-slider',
    'quick-sugg-switch',
    'narrative-tone-input',
    'temp-slider',
    'ctx-slider',
    'max-tokens-slider',
  ].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      saveCurrentSettings(false);
    });
  });

  // Reset to Defaults
  document.getElementById('reset-defaults-btn')?.addEventListener('click', () => {
    if (confirm('Reset all settings to default values?')) {
      saveSettings(DEFAULT_SETTINGS);
      populateSettingsForm();
      checkAiEnginesHealth();
      showToast('Settings reset to defaults');
    }
  });
}

function saveCurrentSettings(showToastMessage = true) {
  const selectedThemeBtn = document.querySelector('#theme-segmented-set md-segmented-button[selected]');
  const chosenTheme = selectedThemeBtn?.value || (getSettings().theme || 'system');

  const selectedLlmBtn = document.querySelector('#llm-provider-segmented-set md-segmented-button[selected]');
  const chosenLlm = selectedLlmBtn?.value || 'llamacpp';

  const selectedImgBtn = document.querySelector('#image-provider-segmented-set md-segmented-button[selected]');
  const chosenImg = selectedImgBtn?.value || 'diffusers';

  const tempSlider = document.getElementById('temp-slider');
  const ctxSlider = document.getElementById('ctx-slider');
  const maxTokensSlider = document.getElementById('max-tokens-slider');
  const stepsSlider = document.getElementById('diffusers-steps-slider');

  const rawTemp = tempSlider ? (tempSlider.value ?? 70) : 70;
  const tempVal = Number(rawTemp) > 1.5 ? Number(rawTemp) / 100 : Number(rawTemp);

  const updated = {
    llmProvider: chosenLlm,
    llamaCppHost: document.getElementById('llamacpp-host-input')?.value?.trim() || 'http://localhost:8080',
    ollamaHost: document.getElementById('ollama-host-input')?.value?.trim() || 'http://localhost:11434',
    ollamaModel: document.getElementById('ollama-model-input')?.value?.trim() || 'llama3:latest',
    imageProvider: chosenImg,
    generateArt: chosenImg !== 'none',
    diffusersHost: document.getElementById('diffusers-host-input')?.value?.trim() || 'http://localhost:8001',
    diffusersSteps: parseInt(stepsSlider?.value, 10) || 4,
    temperature: parseFloat(tempVal.toFixed(2)) || 0.7,
    contextSize: parseInt(ctxSlider?.value, 10) || 4096,
    maxTokens: parseInt(maxTokensSlider?.value, 10) || 600,
    narrativeTone: document.getElementById('narrative-tone-input')?.value?.trim() || 'Epic and richly descriptive',
    autoSuggestActions: document.getElementById('quick-sugg-switch')?.selected,
    theme: chosenTheme,
  };

  saveSettings(updated);
  if (showToastMessage) {
    showToast('Settings saved successfully!');
  }
}
