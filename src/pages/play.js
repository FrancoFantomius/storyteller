// Play Page Controller - Clean story page with Home, New Story Wizard & Roll Engine
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
import '@francofantomius/material-components/side-sheet';
import '@francofantomius/material-components/tabs';
import '@francofantomius/material-components/fab';
import '@francofantomius/material-components/search-bar';
import { setupNavigation, showToast } from '../components/nav-bar.js';
import { fetchWorlds, fetchCampaigns, fetchCampaign, createCampaign, updateCampaign, deleteCampaign } from '../services/api.js';
import { generateStoryTurn } from '../services/ollama.js';
import { generateSceneSVG } from '../services/illustrations.js';
import { getSettings } from '../services/storage.js';

let worlds = [];
let campaigns = [];
let activeCampaign = null;
let activeWorld = null;
let currentTurnIndex = 0;
let isGenerating = false;

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation('play');
  await loadInitialData();
  setupEventListeners();

  window.addEventListener('popstate', () => {
    routeCurrentUrl();
  });

  routeCurrentUrl();
});

async function loadInitialData() {
  try {
    const [wList, cList] = await Promise.all([fetchWorlds(), fetchCampaigns()]);
    worlds = wList || [];
    campaigns = cList || [];
  } catch (err) {
    showToast('Failed to load initial data: ' + err.message);
  }
}

let lastScrollTop = 0;
let isFabContracted = false;

function initFabAnimation(fab) {
  if (!fab) return;
  const injectStyles = () => {
    if (!fab.shadowRoot) return;
    if (fab.shadowRoot.querySelector('#fab-morph-style')) return;
    const style = document.createElement('style');
    style.id = 'fab-morph-style';
    style.textContent = `
      :host {
        transition: transform 300ms cubic-bezier(0.2, 0, 0, 1),
                    box-shadow 300ms cubic-bezier(0.2, 0, 0, 1) !important;
      }
      button {
        transition: width 320ms cubic-bezier(0.2, 0, 0, 1),
                    min-width 320ms cubic-bezier(0.2, 0, 0, 1),
                    padding 320ms cubic-bezier(0.2, 0, 0, 1),
                    box-shadow 200ms cubic-bezier(0.2, 0, 0, 1),
                    background-color 200ms cubic-bezier(0.2, 0, 0, 1) !important;
      }
      .content {
        transition: gap 320ms cubic-bezier(0.2, 0, 0, 1) !important;
      }
      .label {
        display: inline-block;
        max-width: 140px;
        opacity: 1;
        overflow: hidden;
        white-space: nowrap;
        vertical-align: middle;
        transform-origin: left center;
        transition: max-width 320ms cubic-bezier(0.2, 0, 0, 1),
                    opacity 220ms cubic-bezier(0.2, 0, 0, 1),
                    transform 320ms cubic-bezier(0.2, 0, 0, 1),
                    margin 320ms cubic-bezier(0.2, 0, 0, 1) !important;
      }
      :host([contracted]) button {
        width: 56px !important;
        min-width: 56px !important;
        padding: 0 !important;
        gap: 0 !important;
      }
      :host([contracted]) .content {
        gap: 0 !important;
      }
      :host([contracted]) .label {
        max-width: 0 !important;
        opacity: 0 !important;
        margin: 0 !important;
        transform: scaleX(0);
      }
    `;
    fab.shadowRoot.appendChild(style);
  };

  if (fab.shadowRoot) {
    injectStyles();
  } else {
    customElements.whenDefined('md-fab').then(() => {
      setTimeout(injectStyles, 50);
    });
  }
}

function getScrollTop() {
  const main = document.querySelector('.main-content');
  const winY = window.pageYOffset || window.scrollY || 0;
  const docY = document.documentElement ? document.documentElement.scrollTop : 0;
  const bodyY = document.body ? document.body.scrollTop : 0;
  const mainY = main ? main.scrollTop : 0;
  return Math.max(winY, docY, bodyY, mainY);
}

function setupEventListeners() {
  document.getElementById('home-btn')?.addEventListener('click', () => {
    navigateToHome();
  });

  document.getElementById('home-fab')?.addEventListener('click', () => {
    navigateToNewStory();
  });

  document.getElementById('undo-btn')?.addEventListener('click', () => {
    undoLastTurn();
  });

  document.getElementById('lore-sheet-btn')?.addEventListener('click', () => {
    toggleWorldLoreSheet();
  });

  setupFabScrollListener();
}

function setupFabScrollListener() {
  const fab = document.getElementById('home-fab');
  if (fab) initFabAnimation(fab);

  let prevScroll = 0;

  const onScroll = () => {
    const fabEl = document.getElementById('home-fab');
    if (!fabEl || fabEl.style.display === 'none') return;
    initFabAnimation(fabEl);

    const currentScroll = getScrollTop();
    const delta = currentScroll - prevScroll;

    if (currentScroll > 15 && delta > 2 && !isFabContracted) {
      isFabContracted = true;
      fabEl.setAttribute('contracted', '');
    } else if ((delta < -2 || currentScroll <= 10) && isFabContracted) {
      isFabContracted = false;
      fabEl.removeAttribute('contracted');
    }

    prevScroll = Math.max(0, currentScroll);
  };

  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  document.body?.addEventListener('scroll', onScroll, { passive: true });
  document.querySelector('.main-content')?.addEventListener('scroll', onScroll, { passive: true });
}

function navigateToHome() {
  activeCampaign = null;
  activeWorld = null;
  history.pushState(null, '', '/play.html');
  renderCurrentView();
}

function navigateToNewStory(worldId = null) {
  activeCampaign = null;
  activeWorld = null;
  const newUrl = worldId ? `/play.html?new&worldId=${encodeURIComponent(worldId)}` : '/play.html?new';
  history.pushState(null, '', newUrl);
  renderCurrentView();
}

function routeCurrentUrl() {
  const params = new URLSearchParams(window.location.search);
  const campId = params.get('campaignId');
  const isNew = params.has('new') || window.location.search.startsWith('?new') || window.location.pathname.endsWith('/play?new');
  const worldId = params.get('worldId');
  const turnParam = params.get('turn');

  if (campId) {
    loadCampaign(campId, turnParam !== null ? parseInt(turnParam, 10) : undefined);
  } else if (isNew || worldId) {
    renderNewStoryView(worldId);
  } else {
    renderHomeView();
  }
}

function renderCurrentView() {
  routeCurrentUrl();
}

// -------------------------------------------------------------
// 1. HOME VIEW: List of Played Sets & Plus FAB
// -------------------------------------------------------------
function renderHomeView() {
  const homeView = document.getElementById('home-view');
  const newStoryView = document.getElementById('new-story-view');
  const turnArea = document.getElementById('turn-display-area');
  const campHeaderStrip = document.getElementById('campaign-header-strip');
  const campActions = document.getElementById('campaign-actions');
  const fab = document.getElementById('home-fab');

  if (homeView) homeView.style.display = 'flex';
  if (newStoryView) newStoryView.style.display = 'none';
  if (turnArea) turnArea.style.display = 'none';
  if (campHeaderStrip) campHeaderStrip.style.display = 'none';
  if (campActions) campActions.style.display = 'none';
  if (fab) {
    fab.style.display = 'flex';
    fab.label = 'New Story';
    fab.setAttribute('label', 'New Story');
    fab.extended = true;
    fab.setAttribute('extended', '');
    fab.classList.remove('contracting', 'expanding');
    isFabContracted = false;
    if (typeof fab.requestUpdate === 'function') fab.requestUpdate();
  }

  homeView.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
      <div>
        <h1 class="title-large" style="color: var(--md-sys-color-on-surface);">Played Sets</h1>
        <p style="font-size: 14px; color: var(--md-sys-color-secondary); margin-top: 4px;">Continue your adventures or start a new story</p>
      </div>
    </div>
    <div id="played-sets-container" style="display: flex; flex-direction: column; gap: 14px;"></div>
  `;

  const container = homeView.querySelector('#played-sets-container');

  if (!campaigns || campaigns.length === 0) {
    container.innerHTML = `
      <div class="surface-card" style="text-align: center; padding: 48px 24px;">
        <md-icon name="auto_stories" size="48" style="color: var(--md-sys-color-primary); margin-bottom: 16px;"></md-icon>
        <h3 class="title-small" style="margin-bottom: 8px;">No Played Stories Yet</h3>
        <p style="font-size: 14px; color: var(--md-sys-color-secondary); max-width: 440px; margin: 0 auto 20px;">
          You don't have any ongoing campaigns. Tap the plus button below to choose a world, select your character, and begin roll 1!
        </p>
        <md-button id="empty-start-btn" variant="filled" icon="add">Start a New Story</md-button>
      </div>
    `;
    container.querySelector('#empty-start-btn')?.addEventListener('click', () => {
      navigateToNewStory();
    });
    return;
  }

  campaigns.forEach(c => {
    const turns = getTurnGroups(c.history || []);
    const rollCount = turns.length > 0 ? turns.length : (c.turnCount || 1);
    const lastUpdated = c.updatedAt ? new Date(c.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const lastNarrative = (c.history && c.history.length > 0)
      ? (c.history.filter(h => h.type === 'narrative').slice(-1)[0]?.text || '')
      : '';
    const snippet = lastNarrative ? (lastNarrative.length > 130 ? lastNarrative.substring(0, 130) + '...' : lastNarrative) : '';

    const card = document.createElement('md-card');
    card.setAttribute('variant', 'outlined');
    card.className = 'played-set-card';
    card.style.padding = '18px 20px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '10px';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 240px;">
          <h3 style="font-size: 18px; font-weight: 700; color: var(--md-sys-color-on-surface); line-height: 1.3; margin: 0 0 3px 0;">
            ${escapeHtml(c.title || 'Untitled Campaign')}
          </h3>
          <div style="font-size: 14px; font-weight: 500; color: var(--md-sys-color-primary); display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <md-icon name="public" size="18"></md-icon>
            <span>${escapeHtml(c.worldName || 'Custom World')}</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
            <md-chip variant="assist" icon="person" label="${escapeHtml(c.character?.name || 'Character')}"></md-chip>
            <span class="badge-pill primary">Roll ${rollCount}</span>
            ${lastUpdated ? `<span style="font-size: 12px; color: var(--md-sys-color-secondary); margin-left: 2px;">${lastUpdated}</span>` : ''}
          </div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;" onclick="event.stopPropagation()">
          <md-button variant="filled" class="resume-story-btn" data-id="${c.id}" icon="play_arrow">Resume</md-button>
          <md-icon-button icon="delete" class="delete-story-btn" data-id="${c.id}" aria-label="Delete Campaign"></md-icon-button>
        </div>
      </div>

      ${snippet ? `<p style="font-size: 13px; line-height: 1.5; color: var(--md-sys-color-secondary); margin: 0; padding-top: 4px;">${escapeHtml(snippet)}</p>` : ''}
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.delete-story-btn') || e.target.closest('.resume-story-btn')) return;
      loadCampaign(c.id);
    });

    card.querySelector('.resume-story-btn').addEventListener('click', () => {
      loadCampaign(c.id);
    });

    card.querySelector('.delete-story-btn').addEventListener('click', async () => {
      if (confirm(`Delete the story set "${c.title}"?`)) {
        try {
          await deleteCampaign(c.id);
          campaigns = campaigns.filter(item => item.id !== c.id);
          showToast('Campaign deleted');
          renderHomeView();
        } catch (err) {
          showToast('Error deleting campaign: ' + err.message);
        }
      }
    });

    container.appendChild(card);
  });
}

// -------------------------------------------------------------
// 2. NEW STORY WIZARD: Step 1 (Worlds) -> Step 2 (Characters with Skills) -> Roll 1
// -------------------------------------------------------------
function renderNewStoryView(selectedWorldId = null) {
  const homeView = document.getElementById('home-view');
  const newStoryView = document.getElementById('new-story-view');
  const turnArea = document.getElementById('turn-display-area');
  const campHeaderStrip = document.getElementById('campaign-header-strip');
  const campActions = document.getElementById('campaign-actions');
  const fab = document.getElementById('home-fab');

  if (homeView) homeView.style.display = 'none';
  if (newStoryView) newStoryView.style.display = 'flex';
  if (turnArea) turnArea.style.display = 'none';
  if (campHeaderStrip) campHeaderStrip.style.display = 'none';
  if (campActions) campActions.style.display = 'none';
  if (fab) fab.style.display = 'none';

  if (!selectedWorldId) {
    renderWorldSelectionStep(newStoryView);
  } else {
    const world = worlds.find(w => w.id === selectedWorldId);
    if (!world) {
      renderWorldSelectionStep(newStoryView);
    } else {
      renderCharacterSelectionStep(newStoryView, world);
    }
  }
}

function extractWorldTags(w) {
  const tags = new Set();
  if (Array.isArray(w.tags)) {
    w.tags.forEach(t => t && tags.add(t.trim()));
  }
  if (w.genre) {
    w.genre.split(/[,/&|•]/).forEach(g => {
      const clean = g.trim();
      if (clean && clean.length > 1) tags.add(clean);
    });
  }
  if (Array.isArray(w.loreEntries)) {
    w.loreEntries.forEach(entry => {
      if (entry.keyword) tags.add(entry.keyword.trim());
    });
  }
  return Array.from(tags).slice(0, 5);
}

// Step 1: List of all possible worlds
function renderWorldSelectionStep(container) {
  let selectedTagFilter = 'All';
  let searchQuery = '';

  const allTags = new Set(['All']);
  worlds.forEach(w => {
    extractWorldTags(w).forEach(t => allTags.add(t));
  });
  const tagList = Array.from(allTags);
  const row1Tags = [];
  const row2Tags = [];
  tagList.forEach((tag, idx) => {
    if (idx % 2 === 0) row1Tags.push(tag);
    else row2Tags.push(tag);
  });

  container.innerHTML = `
    <div style="margin-bottom: 12px;">
      <h1 class="title-large" style="color: var(--md-sys-color-on-surface);">Choose a World</h1>
      <p style="font-size: 14px; color: var(--md-sys-color-secondary); margin-top: 4px;">
        Select the realm where your new story will unfold
      </p>
    </div>

    <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 18px;">
      <md-search-bar
        id="world-search-bar"
        placeholder="Search by title, genre, or lore"
      ></md-search-bar>
      <div id="world-tag-filters" class="tags-scroll-2rows">
        <div class="tags-scroll-row">
          ${row1Tags.map(tag => `
            <md-chip
              class="tag-filter-chip"
              variant="filter"
              data-tag="${escapeHtml(tag)}"
              ${tag === 'All' ? 'selected' : ''}
              label="${escapeHtml(tag)}"
            ></md-chip>
          `).join('')}
        </div>
        ${row2Tags.length > 0 ? `
          <div class="tags-scroll-row">
            ${row2Tags.map(tag => `
              <md-chip
                class="tag-filter-chip"
                variant="filter"
                data-tag="${escapeHtml(tag)}"
                label="${escapeHtml(tag)}"
              ></md-chip>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>

    <div id="worlds-grid-container" class="grid-2"></div>
  `;

  const searchBar = container.querySelector('#world-search-bar');
  if (searchBar) {
    searchBar.collapseOnMobile = false;
    searchBar.responsive = false;
    searchBar.removeAttribute('collapse-on-mobile');
    searchBar.removeAttribute('responsive');
    if (typeof searchBar.requestUpdate === 'function') {
      searchBar.requestUpdate();
    }
  }
  const tagChips = container.querySelectorAll('.tag-filter-chip');
  const grid = container.querySelector('#worlds-grid-container');

  const updateGrid = () => {
    grid.innerHTML = '';
    const query = searchQuery.trim().toLowerCase();

    const filtered = worlds.filter(w => {
      const tags = extractWorldTags(w);
      const matchesTag = selectedTagFilter === 'All' ||
                         tags.some(t => t.toLowerCase() === selectedTagFilter.toLowerCase()) ||
                         (w.genre && w.genre.toLowerCase().includes(selectedTagFilter.toLowerCase()));
      if (!matchesTag) return false;

      if (!query) return true;
      const name = (w.name || '').toLowerCase();
      const genre = (w.genre || '').toLowerCase();
      const desc = (w.description || w.setting || '').toLowerCase();
      const tagMatch = tags.some(t => t.toLowerCase().includes(query));
      return name.includes(query) || genre.includes(query) || desc.includes(query) || tagMatch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="surface-card" style="text-align: center; padding: 36px 20px; grid-column: 1 / -1;">
          <md-icon name="search_off" size="44" style="color: var(--md-sys-color-secondary); margin-bottom: 10px;"></md-icon>
          <h3 class="title-small">No Worlds Found</h3>
          <p style="color: var(--md-sys-color-secondary); margin-top: 4px; font-size: 13px;">No worlds match your current search query or tag filter.</p>
          <md-button id="clear-filters-btn" variant="tonal" icon="filter_alt_off" style="margin-top: 14px;">Clear Filters</md-button>
        </div>
      `;
      grid.querySelector('#clear-filters-btn')?.addEventListener('click', () => {
        searchQuery = '';
        if (searchBar) searchBar.value = '';
        selectedTagFilter = 'All';
        tagChips.forEach(c => {
          c.selected = c.getAttribute('data-tag') === 'All';
        });
        updateGrid();
      });
      return;
    }

    filtered.forEach(w => {
      const card = document.createElement('md-card');
      card.setAttribute('variant', 'outlined');
      card.className = 'world-select-card';
      card.style.padding = '20px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.justifyContent = 'space-between';
      card.style.borderLeft = `5px solid ${w.coverColor || 'var(--md-sys-color-primary)'}`;

      const tags = extractWorldTags(w);
      const desc = w.description || w.setting || 'An uncharted realm full of mysteries.';

      card.innerHTML = `
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <div style="width: 40px; height: 40px; border-radius: 10px; background: var(--md-sys-color-surface-container-high); display: flex; align-items: center; justify-content: center;">
              <md-icon name="${w.coverIcon || 'public'}" style="color: ${w.coverColor || 'var(--md-sys-color-primary)'}; font-size: 24px;"></md-icon>
            </div>
            <div>
              <h3 style="font-size: 17px; font-weight: 700; color: var(--md-sys-color-on-surface); line-height: 1.2;">
                ${escapeHtml(w.name)}
              </h3>
              <span style="font-size: 12px; font-weight: 500; color: var(--md-sys-color-primary);">
                ${escapeHtml(w.genre || 'Adventure')}
              </span>
            </div>
          </div>

          <p style="font-size: 13px; line-height: 1.5; color: var(--md-sys-color-secondary); margin-bottom: 14px;">
            ${escapeHtml(desc)}
          </p>

          ${tags.length > 0 ? `
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px;">
              ${tags.map(t => `<span class="badge-pill secondary" style="font-size: 11px;">${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}
        </div>

        <md-button variant="filled" icon="arrow_forward" style="width: 100%;">
          Select World
        </md-button>
      `;

      card.addEventListener('click', () => {
        navigateToNewStory(w.id);
      });

      grid.appendChild(card);
    });
  };

  // Search input listeners
  searchBar?.addEventListener('input', (e) => {
    searchQuery = e.detail?.value !== undefined ? e.detail.value : (e.target.value || '');
    updateGrid();
  });
  searchBar?.addEventListener('change', (e) => {
    searchQuery = e.detail?.value !== undefined ? e.detail.value : (e.target.value || '');
    updateGrid();
  });
  searchBar?.addEventListener('clear', () => {
    searchQuery = '';
    updateGrid();
  });

  // Tag filter listeners
  tagChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.getAttribute('data-tag');
      selectedTagFilter = tag;
      tagChips.forEach(c => {
        c.selected = c.getAttribute('data-tag') === tag;
      });
      updateGrid();
    });
  });

  updateGrid();
}

// Step 2: List of characters (name, brief descriptions, skills)
function renderCharacterSelectionStep(container, world) {
  const playables = (world.characters || []).filter(c => c.type === 'playable');

  // Fallback if no playable characters are created in this world
  const characterList = playables.length > 0 ? playables : [
    {
      id: 'char_default_adventurer',
      name: 'The Lone Traveler',
      role: 'Wandering Adventurer',
      bio: `A capable and observant traveler who has ventured into the lands of ${world.name} seeking mystery and fortune.`,
      stats: { Strength: 14, Agility: 14, Intelligence: 14, Charisma: 12, Willpower: 14 },
      equipment: ['Sturdy Travel Cloak', 'Sidearm & Dagger', 'Exploration Journal', 'Survival Rations']
    }
  ];

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 8px;">
      <div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <md-button id="back-worlds-btn" variant="text" icon="arrow_back">Change World</md-button>
          <h1 class="title-large" style="color: var(--md-sys-color-on-surface);">Choose Character</h1>
        </div>
        <p style="font-size: 14px; color: var(--md-sys-color-secondary); margin-top: 4px; margin-left: 8px;">
          Select your protagonist for <strong>${escapeHtml(world.name)}</strong>
        </p>
      </div>
    </div>
    <div id="characters-grid-container" class="grid-2"></div>
  `;

  container.querySelector('#back-worlds-btn')?.addEventListener('click', () => {
    navigateToNewStory();
  });

  const grid = container.querySelector('#characters-grid-container');

  characterList.forEach(char => {
    const card = document.createElement('md-card');
    card.setAttribute('variant', 'outlined');
    card.className = 'character-select-card';
    card.style.padding = '20px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.justifyContent = 'space-between';

    // Format skills / stats
    const statsHtml = char.stats ? Object.entries(char.stats).map(([k, v]) => `
      <div class="stat-badge">
        <span class="stat-name">${escapeHtml(k.substring(0, 3).toUpperCase())}</span>
        <span class="stat-val">${escapeHtml(v)}</span>
      </div>
    `).join('') : '';

    // Format equipment
    const gearHtml = (char.equipment && char.equipment.length > 0) ? `
      <div style="margin-top: 10px;">
        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--md-sys-color-secondary);">Equipment</span>
        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
          ${char.equipment.map(eq => `<span class="badge-pill secondary" style="font-size: 11px;">${escapeHtml(eq)}</span>`).join('')}
        </div>
      </div>
    ` : '';

    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
          <div>
            <h3 style="font-size: 18px; font-weight: 700; color: var(--md-sys-color-primary);">
              ${escapeHtml(char.name)}
            </h3>
            <span style="font-size: 13px; font-weight: 600; color: var(--md-sys-color-secondary);">
              ${escapeHtml(char.role || 'Adventurer')}
            </span>
          </div>
          <md-icon name="person" style="color: var(--md-sys-color-primary);"></md-icon>
        </div>

        <p style="font-size: 13px; line-height: 1.5; color: var(--md-sys-color-on-surface); margin: 10px 0;">
          ${escapeHtml(char.bio || 'No background description provided.')}
        </p>

        ${statsHtml ? `
          <div style="margin-top: 8px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--md-sys-color-secondary);">Skills & Attributes</span>
            <div class="character-stats-grid">${statsHtml}</div>
          </div>
        ` : ''}

        ${gearHtml}
      </div>

      <div style="margin-top: 20px;">
        <md-button variant="filled" icon="play_arrow" class="start-char-story-btn" style="width: 100%;">
          Begin Roll 1 as ${escapeHtml(char.name.split(' ')[0])}
        </md-button>
      </div>
    `;

    card.addEventListener('click', async (e) => {
      await startNewCampaignWithCharacter(world, char);
    });

    grid.appendChild(card);
  });
}

// Step 3: "only after having selected the character the roll 1 begins"
async function startNewCampaignWithCharacter(world, char) {
  let openingNarrative = `You stand on the verge of adventure in ${world.name}. ${world.setting || world.description || ''}\n\nWhat would you like to do?`;
  let starterSuggestions = [
    'Inspect your surroundings and evaluate the situation',
    'Converse with any nearby individuals',
    'Venture down the primary path',
    'Prepare your gear and weapons',
  ];

  if (world.scenarios && world.scenarios.length > 0) {
    const scen = world.scenarios[0];
    openingNarrative = `${scen.description}\n\n${world.name} awaits your decision.`;
    if (scen.starterAction) {
      starterSuggestions[0] = scen.starterAction;
    }
  }

  const title = `The Tale of ${char.name} in ${world.name}`;

  const newCampData = {
    id: 'camp_' + Date.now(),
    title,
    worldId: world.id,
    worldName: world.name,
    character: char,
    turnCount: 1,
    history: [
      {
        id: 'turn_0',
        type: 'narrative',
        author: 'Narrator',
        timestamp: new Date().toISOString(),
        text: openingNarrative,
        sceneMood: 'adventure',
        suggestedActions: starterSuggestions,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const created = await createCampaign(newCampData);
    campaigns.unshift(created);
    showToast(`Roll 1 begins for ${char.name}!`);
    await loadCampaign(created.id, 0);
  } catch (err) {
    showToast('Failed to begin campaign: ' + err.message);
  }
}

// -------------------------------------------------------------
// 3. CAMPAIGN TURN & ROLL RENDERING ENGINE
// -------------------------------------------------------------
function getTurnGroups(history) {
  const turns = [];
  let pendingAction = null;

  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    if (item.type === 'action') {
      pendingAction = item;
    } else if (item.type === 'narrative') {
      turns.push({
        action: pendingAction,
        narrative: item,
      });
      pendingAction = null;
    }
  }

  if (pendingAction) {
    turns.push({
      action: pendingAction,
      narrative: null,
    });
  }

  return turns;
}

async function loadCampaign(campId, targetTurnIndex) {
  try {
    activeCampaign = await fetchCampaign(campId);
    activeWorld = worlds.find(w => w.id === activeCampaign.worldId) || null;

    if (!activeWorld && activeCampaign.worldId) {
      try {
        const res = await fetch(`/api/worlds/${activeCampaign.worldId}`);
        if (res.ok) activeWorld = await res.json();
      } catch (e) {}
    }

    const turns = getTurnGroups(activeCampaign.history || []);
    if (targetTurnIndex !== undefined && targetTurnIndex >= 0 && targetTurnIndex < turns.length) {
      currentTurnIndex = targetTurnIndex;
    } else {
      currentTurnIndex = Math.max(0, turns.length - 1);
    }

    updateUrlForTurn(activeCampaign.id, currentTurnIndex);
    updateCampaignHeader();
    populateLoreSheet();
    renderCampaignTurnView();
  } catch (err) {
    showToast('Failed to load campaign: ' + err.message);
    navigateToHome();
  }
}

function updateUrlForTurn(campId, turnIdx) {
  const newUrl = `/play.html?campaignId=${encodeURIComponent(campId)}&turn=${turnIdx}`;
  if (window.location.search !== `?campaignId=${campId}&turn=${turnIdx}`) {
    history.pushState({ campId, turnIdx }, '', newUrl);
  }
}

function updateCampaignHeader() {
  const campHeaderStrip = document.getElementById('campaign-header-strip');
  const campActions = document.getElementById('campaign-actions');
  const fab = document.getElementById('home-fab');

  if (fab) fab.style.display = 'none';

  if (!activeCampaign) {
    if (campHeaderStrip) campHeaderStrip.style.display = 'none';
    if (campActions) campActions.style.display = 'none';
    return;
  }

  if (campHeaderStrip) campHeaderStrip.style.display = 'block';
  if (campActions) campActions.style.display = 'flex';

  const worldName = activeCampaign.worldName || 'World';
  const charName = activeCampaign.character?.name || 'Character';
  const titleEl = document.getElementById('header-camp-title');
  if (titleEl) {
    titleEl.textContent = `${worldName} - ${charName}`;
  }
}

function renderCampaignTurnView() {
  const homeView = document.getElementById('home-view');
  const newStoryView = document.getElementById('new-story-view');
  const container = document.getElementById('turn-display-area');

  if (homeView) homeView.style.display = 'none';
  if (newStoryView) newStoryView.style.display = 'none';
  if (container) container.style.display = 'flex';

  container.innerHTML = '';

  const history = activeCampaign.history || [];
  const turns = getTurnGroups(history);

  if (turns.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--md-sys-color-secondary);">Your adventure is ready to begin.</div>';
    return;
  }

  if (currentTurnIndex < 0) currentTurnIndex = 0;
  if (currentTurnIndex >= turns.length) currentTurnIndex = turns.length - 1;

  const currentTurn = turns[currentTurnIndex];
  const isLatestTurn = currentTurnIndex === turns.length - 1;

  updateCampaignHeader();

  // 1. Turn/Roll Navigation Bar
  const navBar = document.createElement('div');
  navBar.className = 'turn-nav-bar';
  navBar.innerHTML = `
    <md-button id="prev-turn-btn" variant="text" icon="arrow_back" ${currentTurnIndex === 0 ? 'disabled' : ''}>
      Previous Roll
    </md-button>
    <span class="turn-nav-indicator">Roll ${currentTurnIndex + 1} of ${turns.length}</span>
    <md-button id="next-turn-btn" variant="text" trailing-icon="arrow_forward" ${currentTurnIndex === turns.length - 1 ? 'disabled' : ''}>
      Next Roll
    </md-button>
  `;
  container.appendChild(navBar);

  navBar.querySelector('#prev-turn-btn').addEventListener('click', () => {
    if (currentTurnIndex > 0) {
      currentTurnIndex--;
      updateUrlForTurn(activeCampaign.id, currentTurnIndex);
      renderCampaignTurnView();
    }
  });

  navBar.querySelector('#next-turn-btn').addEventListener('click', () => {
    if (currentTurnIndex < turns.length - 1) {
      currentTurnIndex++;
      updateUrlForTurn(activeCampaign.id, currentTurnIndex);
      renderCampaignTurnView();
    }
  });

  // 2. Previous Action
  if (currentTurn.action) {
    const actionEl = document.createElement('div');
    actionEl.className = 'previous-action-text';
    actionEl.innerHTML = `<strong>Action:</strong> ${escapeHtml(currentTurn.action.text)}`;
    container.appendChild(actionEl);
  }

  // 3. Narrative Content
  if (currentTurn.narrative) {
    const narrativeTextEl = document.createElement('div');
    narrativeTextEl.className = 'turn-narrative-text';
    narrativeTextEl.textContent = currentTurn.narrative.text;
    container.appendChild(narrativeTextEl);

    // 4. Suggestions
    if (isLatestTurn && currentTurn.narrative.suggestedActions && currentTurn.narrative.suggestedActions.length > 0) {
      const suggestionsSection = document.createElement('div');
      suggestionsSection.className = 'suggestions-section';
      suggestionsSection.innerHTML = `
        <div class="suggestions-title">Suggestions:</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${currentTurn.narrative.suggestedActions.map((s, idx) => `
            <div class="suggestion-item" data-action="${escapeHtml(s)}">
              <span class="suggestion-bullet">${idx + 1}.</span>
              <span style="flex: 1;">${escapeHtml(s)}</span>
            </div>
          `).join('')}
        </div>
      `;

      suggestionsSection.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const actionText = item.getAttribute('data-action');
          submitStoryAction(actionText);
        });
      });

      container.appendChild(suggestionsSection);
    }

    // 5. Scene Illustration
    const settings = getSettings();
    if (settings.generateArt) {
      const artContainer = document.createElement('div');
      artContainer.className = 'scene-art-container';
      artContainer.innerHTML = generateSceneSVG(activeWorld?.genre || 'fantasy', currentTurn.narrative.sceneMood || 'mysterious', currentTurn.narrative.text);
      container.appendChild(artContainer);
    }
  }

  // 6. Custom Action Chatbox
  if (isLatestTurn) {
    const inputSection = document.createElement('div');
    inputSection.className = 'turn-input-section';
    inputSection.innerHTML = `
      <div style="font-size: 14px; font-weight: 600; color: var(--md-sys-color-on-surface);">Or write your own action / narrative event:</div>
      <div class="turn-input-row">
        <div style="flex: 1; min-width: 240px;">
          <md-text-field
            id="current-action-input"
            variant="outlined"
            label="What happens next?"
            style="width: 100%;"
          ></md-text-field>
        </div>
        <md-button id="current-send-btn" variant="filled" icon="send">
          Send
        </md-button>
      </div>
    `;

    const inputField = inputSection.querySelector('#current-action-input');
    const sendButton = inputSection.querySelector('#current-send-btn');

    const handleSend = () => {
      const text = inputField.value.trim();
      if (!text || isGenerating) return;
      inputField.value = '';
      submitStoryAction(text);
    };

    sendButton.addEventListener('click', handleSend);
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    container.appendChild(inputSection);
  } else {
    const jumpCard = document.createElement('div');
    jumpCard.className = 'surface-card-high';
    jumpCard.style.textAlign = 'center';
    jumpCard.innerHTML = `
      <p style="font-size: 14px; color: var(--md-sys-color-secondary); margin-bottom: 12px;">You are viewing a past roll.</p>
      <md-button id="jump-latest-btn" variant="filled" icon="fast_forward">
        Jump to Latest Roll (${turns.length})
      </md-button>
    `;
    jumpCard.querySelector('#jump-latest-btn').addEventListener('click', () => {
      currentTurnIndex = turns.length - 1;
      updateUrlForTurn(activeCampaign.id, currentTurnIndex);
      renderCampaignTurnView();
    });
    container.appendChild(jumpCard);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function submitStoryAction(text) {
  if (!activeCampaign || isGenerating) return;

  isGenerating = true;
  const loader = document.getElementById('story-generating-indicator');
  if (loader) loader.style.display = 'flex';

  const userTurn = {
    id: 'turn_' + Date.now(),
    type: 'action',
    author: activeCampaign.character?.name || 'Player',
    timestamp: new Date().toISOString(),
    text,
  };

  if (!activeCampaign.history) activeCampaign.history = [];
  activeCampaign.history.push(userTurn);
  activeCampaign.turnCount = (activeCampaign.turnCount || 0) + 1;
  activeCampaign.updatedAt = new Date().toISOString();

  // Temporary streaming placeholder
  const container = document.getElementById('turn-display-area');
  const tempTextEl = document.createElement('div');
  tempTextEl.className = 'turn-narrative-text';
  tempTextEl.id = 'temp-streaming-card';
  tempTextEl.style.opacity = '0.8';
  tempTextEl.textContent = 'Continuing the story...';
  container.appendChild(tempTextEl);

  try {
    const result = await generateStoryTurn({
      world: activeWorld || { name: activeCampaign.worldName, logic: [] },
      campaign: activeCampaign,
      userInput: text,
      activeCharacter: activeCampaign.character || { name: 'Player', role: 'Adventurer' },
      onToken: (chunk, fullText) => {
        tempTextEl.textContent = fullText;
      },
    });

    tempTextEl.remove();

    const aiTurn = {
      id: 'turn_' + Date.now(),
      type: 'narrative',
      author: 'Narrator',
      timestamp: new Date().toISOString(),
      text: result.narrativeText,
      suggestedActions: result.suggestedActions,
      sceneMood: result.mood,
    };

    activeCampaign.history.push(aiTurn);
    activeCampaign.turnCount = (activeCampaign.turnCount || 0) + 1;
    activeCampaign.updatedAt = new Date().toISOString();

    await updateCampaign(activeCampaign.id, activeCampaign);

    const turns = getTurnGroups(activeCampaign.history);
    currentTurnIndex = turns.length - 1;
    updateUrlForTurn(activeCampaign.id, currentTurnIndex);
    renderCampaignTurnView();
  } catch (err) {
    tempTextEl.remove();
    showToast('Generation error: ' + err.message);
  } finally {
    isGenerating = false;
    if (loader) loader.style.display = 'none';
  }
}

async function undoLastTurn() {
  if (!activeCampaign || !activeCampaign.history || activeCampaign.history.length <= 1) {
    showToast('No turns to undo');
    return;
  }

  activeCampaign.history.pop();
  if (activeCampaign.history.length > 0 && activeCampaign.history[activeCampaign.history.length - 1].type === 'action') {
    activeCampaign.history.pop();
  }
  activeCampaign.turnCount = Math.max(0, (activeCampaign.turnCount || 2) - 2);
  activeCampaign.updatedAt = new Date().toISOString();

  await updateCampaign(activeCampaign.id, activeCampaign);
  const turns = getTurnGroups(activeCampaign.history);
  currentTurnIndex = Math.max(0, turns.length - 1);
  updateUrlForTurn(activeCampaign.id, currentTurnIndex);
  renderCampaignTurnView();
  showToast('Undid previous story turn');
}

function toggleWorldLoreSheet() {
  const sheet = document.getElementById('world-lore-side-sheet');
  if (sheet) sheet.open = !sheet.open;
}

function populateLoreSheet() {
  if (!activeWorld) return;
  document.getElementById('lore-world-name').textContent = activeWorld.name;
  document.getElementById('lore-world-genre').textContent = activeWorld.genre || 'Adventure';
  document.getElementById('lore-setting-text').textContent = activeWorld.setting || activeWorld.description || '';

  const rulesList = document.getElementById('lore-rules-list');
  rulesList.innerHTML = '';
  (activeWorld.logic || []).forEach(r => {
    const li = document.createElement('li');
    li.style.marginBottom = '6px';
    li.textContent = r;
    rulesList.appendChild(li);
  });

  const npcsList = document.getElementById('lore-npcs-list');
  npcsList.innerHTML = '';
  const npcs = (activeWorld.characters || []).filter(c => c.type === 'npc');
  npcs.forEach(n => {
    const div = document.createElement('div');
    div.style.marginBottom = '8px';
    div.innerHTML = `<strong>${escapeHtml(n.name)}</strong> (${escapeHtml(n.role)}): ${escapeHtml(n.bio || '')}`;
    npcsList.appendChild(div);
  });
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
