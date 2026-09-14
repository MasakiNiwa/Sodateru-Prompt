/** テーマ・表示密度などの見た目設定を DOM へ反映する */

import { state } from './store.js';

export function applyTheme() {
  const root = document.documentElement;
  const { theme, density, editorFontSize } = state.settings;

  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;

  root.dataset.density = density === 'compact' ? 'compact' : 'comfortable';
  root.style.setProperty('--editor-font-size', `${Number(editorFontSize) || 15}px`);
}

/** OS のテーマ変更に追従する（theme = system のときのみ意味を持つ） */
export function watchSystemTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => { if (state.settings.theme === 'system') applyTheme(); };
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else mq.addListener(handler);
}
