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
import { setupNavigation, showToast } from '../components/nav-bar.js';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../services/storage.js';
import { checkOllamaStatus, fetchWorlds, fetchCampaigns } from '../services/api.js';

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation('settings');
  populateSettingsForm();
  setupEventListeners();
  await testOllamaConnection();
});

function populateSettingsForm() {
  const settings = getSettings();

  // Ollama section
  document.getElementById('ollama-host-input').value = settings.ollamaHost || 'http://localhost:11434';
  document.getElementById('ollama-model-input').value = settings.ollamaModel || 'llama3:latest';
  document.getElementById('sim-fallback-switch').selected = settings.useSimulationFallback !== false;

  // Context & Parameters
  document.getElementById('temp-slider').value = Math.round((settings.temperature || 0.7) * 100);
  document.getElementById('temp-value-display').textContent = (settings.temperature || 0.7).toString();

  document.getElementById('ctx-slider').value = settings.contextSize || 4096;
  document.getElementById('ctx-value-display').textContent = (settings.contextSize || 4096).toString();

  document.getElementById('max-tokens-slider').value = settings.maxTokens || 600;
  document.getElementById('tokens-value-display').textContent = (settings.maxTokens || 600).toString();

  document.getElementById('narrative-tone-input').value = settings.narrativeTone || 'Epic and richly descriptive';

  document.getElementById('gen-art-switch').selected = settings.generateArt !== false;
  document.getElementById('quick-sugg-switch').selected = settings.autoSuggestActions !== false;

  const currentTheme = settings.theme || 'system';
  document.querySelectorAll('.theme-select-chip').forEach(chip => {
    chip.selected = chip.getAttribute('data-theme') === currentTheme;
  });
}

function setupEventListeners() {
  // Save Settings
  document.getElementById('save-settings-btn')?.addEventListener('click', () => {
    saveCurrentSettings();
  });

  // Test Ollama Connection
  document.getElementById('test-ollama-btn')?.addEventListener('click', async () => {
    await testOllamaConnection();
  });

  // Sliders display listeners
  const tempSlider = document.getElementById('temp-slider');
  tempSlider.addEventListener('input', (e) => {
    const val = (e.detail?.value || tempSlider.value || 70) / 100;
    document.getElementById('temp-value-display').textContent = val.toFixed(2);
  });

  const ctxSlider = document.getElementById('ctx-slider');
  ctxSlider.addEventListener('input', (e) => {
    const val = e.detail?.value || ctxSlider.value || 4096;
    document.getElementById('ctx-value-display').textContent = val.toString();
  });

  const maxTokensSlider = document.getElementById('max-tokens-slider');
  maxTokensSlider.addEventListener('input', (e) => {
    const val = e.detail?.value || maxTokensSlider.value || 600;
    document.getElementById('tokens-value-display').textContent = val.toString();
  });

  // Model suggestion chips
  document.querySelectorAll('.model-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const modelName = chip.getAttribute('data-model');
      document.getElementById('ollama-model-input').value = modelName;
    });
  });

  // Theme chips selector (Device theme / Dark / Light)
  document.querySelectorAll('.theme-select-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const themeChoice = chip.getAttribute('data-theme') || 'system';
      document.querySelectorAll('.theme-select-chip').forEach(c => {
        c.selected = c.getAttribute('data-theme') === themeChoice;
      });
      saveSettings({ theme: themeChoice });
      const label = themeChoice === 'system' ? 'Device Theme' : (themeChoice === 'dark' ? 'Dark Theme' : 'Light Theme');
      showToast(`Theme changed to ${label}`);
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

  // Export Data JSON
  document.getElementById('export-data-btn')?.addEventListener('click', async () => {
    try {
      const [w, c] = await Promise.all([fetchWorlds(), fetchCampaigns()]);
      const backup = {
        exportedAt: new Date().toISOString(),
        settings: getSettings(),
        worlds: w,
        campaigns: c,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `storyteller_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Backup JSON downloaded successfully');
    } catch (e) {
      showToast('Failed to export: ' + e.message);
    }
  });
}

async function testOllamaConnection() {
  const host = document.getElementById('ollama-host-input').value.trim() || 'http://localhost:11434';
  const statusBadge = document.getElementById('ollama-status-badge');
  const modelsContainer = document.getElementById('detected-models-container');

  statusBadge.className = 'badge-pill secondary';
  statusBadge.textContent = 'Checking...';

  try {
    const result = await checkOllamaStatus(host);
    if (result.online) {
      statusBadge.className = 'badge-pill primary';
      statusBadge.textContent = 'Ollama Online';

      if (result.models && result.models.length > 0) {
        modelsContainer.innerHTML = `
          <div style="font-size: 13px; font-weight: 500; margin-top: 8px; margin-bottom: 4px;">Detected Installed Models:</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${result.models.map(m => `
              <md-chip variant="assist" class="detected-model-chip" data-model="${m.name}" label="${m.name}"></md-chip>
            `).join('')}
          </div>
        `;
        modelsContainer.querySelectorAll('.detected-model-chip').forEach(c => {
          c.addEventListener('click', () => {
            document.getElementById('ollama-model-input').value = c.getAttribute('data-model');
            showToast(`Selected model: ${c.getAttribute('data-model')}`);
          });
        });
      } else {
        modelsContainer.innerHTML = '<div style="font-size: 12px; color: var(--md-sys-color-secondary); margin-top: 6px;">Ollama is running, but no models found. Run <code>ollama pull llama3</code> in your terminal.</div>';
      }
    } else {
      statusBadge.className = 'badge-pill tertiary';
      statusBadge.textContent = 'Offline (Fallback Active)';
      modelsContainer.innerHTML = '<div style="font-size: 12px; color: var(--md-sys-color-secondary); margin-top: 6px;">Ollama not detected at this host. Storyteller fallback simulation engine will handle gameplay seamlessly.</div>';
    }
  } catch (err) {
    statusBadge.className = 'badge-pill tertiary';
    statusBadge.textContent = 'Offline';
  }
}

function saveCurrentSettings() {
  const updated = {
    ollamaHost: document.getElementById('ollama-host-input').value.trim(),
    ollamaModel: document.getElementById('ollama-model-input').value.trim(),
    useSimulationFallback: document.getElementById('sim-fallback-switch').selected,
    temperature: parseFloat(document.getElementById('temp-value-display').textContent) || 0.7,
    contextSize: parseInt(document.getElementById('ctx-value-display').textContent, 10) || 4096,
    maxTokens: parseInt(document.getElementById('tokens-value-display').textContent, 10) || 600,
    narrativeTone: document.getElementById('narrative-tone-input').value.trim(),
    generateArt: document.getElementById('gen-art-switch').selected,
    autoSuggestActions: document.getElementById('quick-sugg-switch').selected,
    theme: document.querySelector('.theme-select-chip[selected]')?.getAttribute('data-theme') || (getSettings().theme || 'system'),
  };

  saveSettings(updated);
  showToast('Settings saved successfully!');
}
