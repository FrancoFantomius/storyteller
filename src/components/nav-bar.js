// Shared Material Design 3 Navigation for Play, World Editor, and Settings pages
import '@francofantomius/material-components/top-app-bar';
import '@francofantomius/material-components/navigation-rail';
import '@francofantomius/material-components/navigation-bar';
import '@francofantomius/material-components/icon-button';
import '@francofantomius/material-components/icon';
import '@francofantomius/material-components/button';
import '@francofantomius/material-components/badge';
import '@francofantomius/material-components/snackbar';
import { getSettings, saveSettings, applyThemeToDocument } from '../services/storage.js';

export function setupNavigation(activePage = 'play') {
  const settings = getSettings();
  applyThemeToDocument(settings.theme);

  const pageIndexMap = {
    play: 0,
    'world-editor': 1,
    settings: 2,
  };

  const activeIndex = pageIndexMap[activePage] !== undefined ? pageIndexMap[activePage] : 0;

  // Defer attribute sync or check if already matched to avoid Lit change-in-update warning
  const navRail = document.querySelector('md-navigation-rail');
  const navBar = document.querySelector('md-navigation-bar');

  if (navRail) {
    if (navRail.getAttribute('active-index') !== activeIndex.toString()) {
      navRail.setAttribute('active-index', activeIndex.toString());
    }
    navRail.addEventListener('change', (e) => {
      const selected = e.detail?.item?.getAttribute('value') || e.detail?.value;
      navigateToPage(selected);
    });
  }

  if (navBar) {
    if (navBar.getAttribute('active-index') !== activeIndex.toString()) {
      navBar.setAttribute('active-index', activeIndex.toString());
    }
    navBar.addEventListener('change', (e) => {
      const selected = e.detail?.item?.getAttribute('value') || e.detail?.value;
      navigateToPage(selected);
    });
  }

  // Apply active theme (defaults to device system theme)
  applyThemeToDocument(settings.theme);
}

function navigateToPage(pageValue) {
  if (!pageValue) return;
  if (pageValue === 'play') {
    window.location.href = '/play.html';
  } else if (pageValue === 'world-editor') {
    window.location.href = '/world-editor.html';
  } else if (pageValue === 'settings') {
    window.location.href = '/settings.html';
  }
}

export function showToast(message, actionText = '') {
  let snackbar = document.getElementById('global-snackbar');
  if (!snackbar) {
    snackbar = document.createElement('md-snackbar');
    snackbar.id = 'global-snackbar';
    document.body.appendChild(snackbar);
  }
  snackbar.setAttribute('message', message);
  if (actionText) {
    snackbar.setAttribute('action-text', actionText);
  } else {
    snackbar.removeAttribute('action-text');
  }
  snackbar.setAttribute('open', '');
}
