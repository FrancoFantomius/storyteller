// World Editor Controller
import '@francofantomius/material-components/button';
import '@francofantomius/material-components/icon-button';
import '@francofantomius/material-components/icon';
import '@francofantomius/material-components/text-field';
import '@francofantomius/material-components/card';
import '@francofantomius/material-components/dialog';
import '@francofantomius/material-components/divider';
import '@francofantomius/material-components/chip';
import '@francofantomius/material-components/loading-indicator';
import '@francofantomius/material-components/badge';
import '@francofantomius/material-components/tabs';
import { setupNavigation, showToast } from '../components/nav-bar.js';
import { fetchWorlds, createWorld, updateWorld, deleteWorld, generateWorldIcon } from '../services/api.js';
import { generateWorldFromPrompt } from '../services/llm.js';

let worlds = [];
let currentEditingWorld = null;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation('world-editor');
  await loadWorldsList();
  setupEventListeners();
});

async function loadWorldsList() {
  const container = document.getElementById('worlds-list-container');
  const emptyState = document.getElementById('worlds-empty-state');
  container.innerHTML = '<div style="display:flex; justify-content:center; padding: 40px;"><md-loading-indicator size="medium"></md-loading-indicator></div>';

  try {
    worlds = await fetchWorlds();
    container.innerHTML = '';

    if (!worlds || worlds.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    worlds.forEach(w => {
      const card = document.createElement('div');
      card.className = 'surface-card';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.justifyContent = 'space-between';
      card.style.padding = '8px 14px';
      card.style.borderRadius = 'var(--md-sys-shape-corner-large)';
      card.style.border = '1px solid var(--md-sys-color-outline-variant)';
      card.style.backgroundColor = 'var(--md-sys-color-surface-container-low)';

      const rawDesc = (w.description || w.setting || '').trim();
      const words = rawDesc.split(/\s+/).filter(Boolean);
      const desc = words.length > 15 ? words.slice(0, 15).join(' ') + '...' : rawDesc;

      card.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px; padding-top: 2px;">
          <h3 style="font-size: 16px; font-weight: 700; margin: 0; line-height: 1.3;">${escapeHtml(w.name)}</h3>
          <p style="font-size: 13px; color: var(--md-sys-color-on-surface); line-height: 1.4; margin: 0;">
            ${escapeHtml(desc)}
          </p>
        </div>

        <div style="display: flex; flex-direction: column; margin-top: 10px;">
          <md-divider style="margin-bottom: 8px;"></md-divider>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: nowrap; gap: 4px;">
            <md-button variant="filled" icon="edit" class="edit-world-btn" data-id="${w.id}">Edit</md-button>
            <div style="display: flex; gap: 2px; align-items: center;">
              <md-icon-button icon="drive_file_rename_outline" class="rename-world-btn" data-id="${w.id}" aria-label="Rename World"></md-icon-button>
              <md-icon-button icon="content_copy" class="duplicate-world-btn" data-id="${w.id}" aria-label="Duplicate World"></md-icon-button>
              <md-icon-button icon="delete" class="delete-world-btn" data-id="${w.id}" aria-label="Delete World"></md-icon-button>
            </div>
          </div>
        </div>
      `;

      container.appendChild(card);
    });

    container.querySelectorAll('.edit-world-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openWorldEditor(id);
      });
    });

    container.querySelectorAll('.rename-world-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        promptRenameWorld(id);
      });
    });

    container.querySelectorAll('.duplicate-world-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        duplicateWorld(id);
      });
    });

    container.querySelectorAll('.delete-world-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        promptDeleteWorld(id);
      });
    });
  } catch (err) {
    container.innerHTML = `<div style="color: var(--md-sys-color-error); padding: 20px;">Failed to load worlds: ${escapeHtml(err.message)}</div>`;
  }
}

function setupEventListeners() {
  // AI World Generator
  const aiGenBtn = document.getElementById('ai-generate-world-btn');
  const aiPromptInput = document.getElementById('ai-world-prompt-input');

  aiGenBtn.addEventListener('click', async () => {
    const prompt = aiPromptInput.value.trim();
    if (!prompt) {
      showToast('Please enter a brief concept for the AI world generator.');
      return;
    }

    aiGenBtn.setAttribute('loading', '');
    aiGenBtn.disabled = true;

    try {
      showToast('Generating rich world with lore, rules & characters...');
      const generated = await generateWorldFromPrompt(prompt);
      currentEditingWorld = {
        ...generated,
        id: 'world_' + Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      populateEditorForm(currentEditingWorld);
      document.getElementById('world-editor-dialog').open = true;
      showToast('World synthesized successfully! Review and save.');
    } catch (err) {
      showToast('Generation error: ' + err.message);
    } finally {
      aiGenBtn.removeAttribute('loading');
      aiGenBtn.disabled = false;
    }
  });

  // Create New World from Scratch
  document.getElementById('create-scratch-btn').addEventListener('click', () => {
    currentEditingWorld = {
      id: 'world_' + Date.now(),
      name: '',
      genre: '',
      tone: '',
      description: '',
      coverColor: '',
      coverIcon: '',
      setting: '',
      logic: [],
      characters: [],
      scenarios: [],
    };
    populateEditorForm(currentEditingWorld);
    document.getElementById('world-editor-dialog').open = true;
  });

  // Create from Existing World
  document.getElementById('clone-existing-btn').addEventListener('click', () => {
    if (worlds.length === 0) {
      showToast('No existing worlds to clone.');
      return;
    }
    openClonePicker();
  });

  // Save World in Dialog
  document.getElementById('save-world-btn').addEventListener('click', async () => {
    await saveCurrentWorldForm();
  });

  // Cancel World Dialog
  document.getElementById('cancel-world-btn').addEventListener('click', () => {
    document.getElementById('world-editor-dialog').open = false;
  });

  // Add Logic Rule
  document.getElementById('add-logic-rule-btn').addEventListener('click', () => {
    const input = document.getElementById('new-logic-rule-input');
    const val = input.value.trim();
    if (!val) return;
    addLogicRuleChip(val);
    input.value = '';
  });

  // Add Playable Character
  document.getElementById('add-playable-char-btn').addEventListener('click', () => {
    openCharacterSubDialog('playable');
  });

  // Add NPC
  document.getElementById('add-npc-char-btn').addEventListener('click', () => {
    openCharacterSubDialog('npc');
  });

  // Generate Icon from Lore
  const generateIconBtn = document.getElementById('generate-icon-btn');
  generateIconBtn?.addEventListener('click', async () => {
    const lore = document.getElementById('world-setting-input').value.trim();
    const name = document.getElementById('world-name-input').value.trim();
    const genre = document.getElementById('world-genre-input').value.trim();
    const description = document.getElementById('world-desc-input').value.trim();
    const tone = document.getElementById('world-tone-input').value.trim();

    if (!lore && !name && !description) {
      showToast('Please enter some setting lore or description first');
      return;
    }

    generateIconBtn.setAttribute('loading', '');
    generateIconBtn.disabled = true;

    try {
      showToast('Generating icon from lore...');
      const res = await generateWorldIcon({ name, genre, lore, description, tone });
      if (res && res.icon) {
        currentEditingWorld.coverIcon = res.icon;
        currentEditingWorld.coverColor = res.color || '#6750A4';
        updateIconPreview(res.icon, res.color);
        showToast(`Icon generated: ${res.icon}`);
      }
    } catch (err) {
      showToast('Icon generation error: ' + err.message);
    } finally {
      generateIconBtn.removeAttribute('loading');
      generateIconBtn.disabled = false;
    }
  });
}

function openWorldEditor(worldId) {
  const world = worlds.find(w => w.id === worldId);
  if (!world) return;
  currentEditingWorld = JSON.parse(JSON.stringify(world));
  populateEditorForm(currentEditingWorld);
  document.getElementById('world-editor-dialog').open = true;
}

function updateIconPreview(iconName, colorHex) {
  const container = document.getElementById('world-icon-preview-container');
  const iconEl = document.getElementById('world-icon-preview-icon');
  const boxEl = document.getElementById('world-icon-preview-box');

  if (!iconName) {
    if (container) container.style.display = 'none';
    return;
  }

  const icon = iconName;
  const color = colorHex || '#6750A4';

  if (iconEl) iconEl.setAttribute('name', icon);
  if (boxEl) boxEl.style.backgroundColor = color;
  if (container) container.style.display = 'flex';
}

function populateEditorForm(world) {
  document.getElementById('editor-dialog-headline').textContent = world.name ? `Editing: ${world.name}` : 'World Studio';
  document.getElementById('world-name-input').value = world.name || '';
  document.getElementById('world-genre-input').value = world.genre || '';
  document.getElementById('world-tone-input').value = world.tone || '';
  document.getElementById('world-desc-input').value = world.description || '';
  document.getElementById('world-setting-input').value = world.setting || '';

  // Update Icon preview
  updateIconPreview(world.coverIcon, world.coverColor);

  // Populate Logic Rules
  const logicContainer = document.getElementById('logic-rules-list');
  logicContainer.innerHTML = '';
  (world.logic || []).forEach(rule => {
    addLogicRuleChip(rule);
  });

  // Populate Characters
  renderCharactersList(world.characters || []);
}

function addLogicRuleChip(ruleText) {
  const container = document.getElementById('logic-rules-list');
  const chip = document.createElement('md-chip');
  chip.setAttribute('variant', 'input');
  chip.setAttribute('removable', '');
  chip.setAttribute('label', ruleText);
  chip.setAttribute('icon', 'gavel');
  chip.addEventListener('remove', () => chip.remove());
  container.appendChild(chip);
}

function renderCharactersList(chars) {
  const playableContainer = document.getElementById('playable-chars-list');
  const npcContainer = document.getElementById('npc-chars-list');
  playableContainer.innerHTML = '';
  npcContainer.innerHTML = '';

  chars.forEach((c, idx) => {
    const card = document.createElement('div');
    card.className = 'surface-card-high';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '8px';
    card.style.marginBottom = '10px';

    if (c.type === 'playable') {
      const skillEntries = c.skills ? Object.entries(c.skills).slice(0, 5) : [];
      const skillDisplay = skillEntries.length > 0
        ? skillEntries.map(([k, v]) => `${k} (Lvl ${v})`).join(' • ')
        : 'Default Skills';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 700; font-size: 15px;">⚔️ ${escapeHtml(c.name)} <span style="font-size: 13px; color: var(--md-sys-color-secondary);">(${escapeHtml(c.role || 'Adventurer')})</span></div>
          <md-icon-button icon="delete" class="remove-char-btn" data-idx="${idx}"></md-icon-button>
        </div>
        <div style="font-size: 13px; color: var(--md-sys-color-on-surface);">${escapeHtml(c.bio || '')}</div>
        <div style="font-size: 12px; color: var(--md-sys-color-primary); font-weight: 500;">⚡ Skills: ${escapeHtml(skillDisplay)}</div>
      `;
      playableContainer.appendChild(card);
    } else {
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 700; font-size: 15px;">👥 ${escapeHtml(c.name)} <span style="font-size: 13px; color: var(--md-sys-color-secondary);">(${escapeHtml(c.role || 'NPC')})</span></div>
          <md-icon-button icon="delete" class="remove-char-btn" data-idx="${idx}"></md-icon-button>
        </div>
        <div style="font-size: 13px; color: var(--md-sys-color-on-surface);">${escapeHtml(c.bio || '')}</div>
        ${c.faction ? `<div style="font-size: 12px; color: var(--md-sys-color-primary);">🏰 Faction: ${escapeHtml(c.faction)}</div>` : ''}
        ${c.secret ? `<div style="font-size: 12px; color: var(--md-sys-color-tertiary);">🗝️ Secret: ${escapeHtml(c.secret)}</div>` : ''}
      `;
      npcContainer.appendChild(card);
    }
  });

  // Attach remove listeners
  document.querySelectorAll('.remove-char-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      currentEditingWorld.characters.splice(idx, 1);
      renderCharactersList(currentEditingWorld.characters);
    });
  });
}

function openCharacterSubDialog(type = 'playable') {
  const dialog = document.getElementById('char-editor-dialog');
  dialog.setAttribute('headline', type === 'playable' ? 'Add Playable Character' : 'Add NPC');
  document.getElementById('char-type-input').value = type;
  document.getElementById('char-name-input').value = '';
  document.getElementById('char-role-input').value = '';
  document.getElementById('char-bio-input').value = '';
  if (document.getElementById('char-skills-input')) document.getElementById('char-skills-input').value = '';
  document.getElementById('char-faction-input').value = '';
  document.getElementById('char-secret-input').value = '';

  const skillsGroup = document.getElementById('char-skills-group');
  const npcGroup = document.getElementById('char-npc-group');
  if (type === 'playable') {
    if (skillsGroup) skillsGroup.style.display = 'block';
    if (npcGroup) npcGroup.style.display = 'none';
  } else {
    if (skillsGroup) skillsGroup.style.display = 'none';
    if (npcGroup) npcGroup.style.display = 'block';
  }

  dialog.open = true;
}

// Character dialog save
document.getElementById('save-char-sub-btn')?.addEventListener('click', () => {
  const type = document.getElementById('char-type-input').value;
  const name = document.getElementById('char-name-input').value.trim();
  const role = document.getElementById('char-role-input').value.trim();
  const bio = document.getElementById('char-bio-input').value.trim();

  if (!name) {
    showToast('Character name is required');
    return;
  }

  if (!currentEditingWorld.characters) currentEditingWorld.characters = [];

  const charObj = {
    id: 'char_' + Date.now(),
    name,
    type,
    role: role || (type === 'playable' ? 'Adventurer' : 'NPC'),
    bio,
  };

  if (type === 'playable') {
    const skillsInput = document.getElementById('char-skills-input')?.value || '';
    const rawSkills = skillsInput.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
    const skillsObj = {};
    if (rawSkills.length > 0) {
      rawSkills.forEach(s => {
        const parts = s.split(':');
        const skillName = parts[0].trim();
        const skillLvl = parts[1] !== undefined ? Math.max(0, Math.min(5, parseInt(parts[1].trim(), 10) || 2)) : 2;
        if (skillName) skillsObj[skillName] = skillLvl;
      });
    } else {
      skillsObj['Combat'] = 3;
      skillsObj['Agility'] = 2;
      skillsObj['Arcana / Tech'] = 2;
      skillsObj['Persuasion'] = 2;
      skillsObj['Survival'] = 1;
    }
    charObj.skills = skillsObj;
  } else {
    charObj.faction = document.getElementById('char-faction-input').value.trim();
    charObj.secret = document.getElementById('char-secret-input').value.trim();
  }

  currentEditingWorld.characters.push(charObj);
  renderCharactersList(currentEditingWorld.characters);
  document.getElementById('char-editor-dialog').open = false;
  showToast(`Character "${name}" added`);
});

async function saveCurrentWorldForm() {
  const name = document.getElementById('world-name-input').value.trim();
  if (!name) {
    showToast('World name cannot be empty');
    return;
  }

  // Extract logic rules from chips
  const logicChips = document.querySelectorAll('#logic-rules-list md-chip');
  const logic = Array.from(logicChips).map(c => c.getAttribute('label')).filter(Boolean);

  const worldData = {
    ...currentEditingWorld,
    name,
    genre: document.getElementById('world-genre-input').value.trim(),
    tone: document.getElementById('world-tone-input').value.trim(),
    description: document.getElementById('world-desc-input').value.trim(),
    setting: document.getElementById('world-setting-input').value.trim(),
    coverColor: currentEditingWorld.coverColor || '#6750A4',
    coverIcon: currentEditingWorld.coverIcon || 'public',
    logic,
  };

  try {
    const isExisting = worlds.some(w => w.id === worldData.id);
    if (isExisting) {
      await updateWorld(worldData.id, worldData);
      showToast(`World "${name}" updated successfully!`);
    } else {
      await createWorld(worldData);
      showToast(`World "${name}" created and saved to /server/worlds!`);
    }
    document.getElementById('world-editor-dialog').open = false;
    await loadWorldsList();
  } catch (err) {
    showToast('Error saving world: ' + err.message);
  }
}

function promptRenameWorld(worldId) {
  const world = worlds.find(w => w.id === worldId);
  if (!world) return;

  const dialog = document.getElementById('rename-dialog');
  const input = document.getElementById('rename-world-input');
  input.value = world.name;
  dialog.open = true;

  const confirmBtn = document.getElementById('confirm-rename-btn');
  const handleRename = async () => {
    confirmBtn.removeEventListener('click', handleRename);
    const newName = input.value.trim();
    if (!newName) return;
    try {
      world.name = newName;
      await updateWorld(world.id, world);
      dialog.open = false;
      showToast(`World renamed to "${newName}"`);
      await loadWorldsList();
    } catch (err) {
      showToast('Failed to rename: ' + err.message);
    }
  };
  confirmBtn.addEventListener('click', handleRename);
}

async function duplicateWorld(worldId) {
  const world = worlds.find(w => w.id === worldId);
  if (!world) return;

  const copy = JSON.parse(JSON.stringify(world));
  copy.id = 'world_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
  copy.name = `${world.name} (Copy)`;
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = copy.createdAt;

  try {
    await createWorld(copy);
    showToast(`Duplicated world into "${copy.name}"`);
    await loadWorldsList();
  } catch (err) {
    showToast('Failed to duplicate: ' + err.message);
  }
}

function promptDeleteWorld(worldId) {
  const world = worlds.find(w => w.id === worldId);
  if (!world) return;

  const dialog = document.getElementById('delete-dialog');
  document.getElementById('delete-dialog-text').textContent = `Are you sure you want to permanently delete "${world.name}"? This will remove the file from /server/worlds.`;
  dialog.open = true;

  const confirmBtn = document.getElementById('confirm-delete-btn');
  const handleDelete = async () => {
    confirmBtn.removeEventListener('click', handleDelete);
    try {
      await deleteWorld(worldId);
      dialog.open = false;
      showToast(`Deleted world "${world.name}"`);
      await loadWorldsList();
    } catch (err) {
      showToast('Failed to delete: ' + err.message);
    }
  };
  confirmBtn.addEventListener('click', handleDelete);
}

function openClonePicker() {
  const dialog = document.getElementById('clone-picker-dialog');
  const container = document.getElementById('clone-picker-list');
  container.innerHTML = '';

  worlds.forEach(w => {
    const item = document.createElement('div');
    item.className = 'surface-card-high';
    item.style.cursor = 'pointer';
    item.style.marginBottom = '8px';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.innerHTML = `
      <div>
        <div style="font-weight: 700;">${escapeHtml(w.name)}</div>
        <div style="font-size: 12px; color: var(--md-sys-color-secondary);">${escapeHtml(w.genre || '')}</div>
      </div>
      <md-button variant="tonal" icon="content_copy">Clone</md-button>
    `;
    item.addEventListener('click', () => {
      dialog.open = false;
      const copy = JSON.parse(JSON.stringify(w));
      copy.id = 'world_' + Date.now();
      copy.name = `Fork of ${w.name}`;
      currentEditingWorld = copy;
      populateEditorForm(currentEditingWorld);
      document.getElementById('world-editor-dialog').open = true;
    });
    container.appendChild(item);
  });

  dialog.open = true;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
