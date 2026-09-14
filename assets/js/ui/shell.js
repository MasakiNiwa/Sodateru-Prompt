/** アプリのシェル：ナビゲーション・アプリバー・FAB */

import { escapeHtml, icon } from '../core/util.js';
import { parseHash } from '../core/router.js';
import { APP } from '../core/app-info.js';

export const NAV_ITEMS = [
  { path: '/', label: 'ホーム', icon: 'home' },
  { path: '/prompts', label: 'プロンプト', icon: 'notes' },
  { path: '/snippets', label: '部品', icon: 'puzzle' },
  { path: '/settings', label: '設定', icon: 'settings' },
  { path: '/help', label: 'ヘルプ', icon: 'help' },
];

const isActive = (item, path) => (item.path === '/'
  ? path === '/'
  : path === item.path || path.startsWith(`${item.path}/`));

const navItemHtml = (item, path) => `
  <a class="navitem" href="#${item.path}" ${isActive(item, path) ? 'aria-current="page"' : ''}>
    <span class="navitem__ind">${icon(item.icon)}</span>
    <span>${escapeHtml(item.label)}</span>
  </a>`;

export function renderNav() {
  const { path } = parseHash();
  const rail = document.getElementById('rail');
  const bottom = document.getElementById('bottomnav');

  rail.innerHTML = `
    <div class="rail__brand" title="${escapeHtml(APP.name)}">${icon('sprout')}</div>
    ${NAV_ITEMS.slice(0, 3).map((i) => navItemHtml(i, path)).join('')}
    <div class="rail__spacer"></div>
    ${NAV_ITEMS.slice(3).map((i) => navItemHtml(i, path)).join('')}`;

  bottom.innerHTML = NAV_ITEMS.map((i) => navItemHtml(i, path)).join('');
}

/**
 * アプリバーを描画する。
 * @param {{title:string, subtitle?:string, back?:string|null,
 *          actions?:Array<{icon:string, label:string, id:string, active?:boolean}>}} opts
 * @param {(id:string, el:HTMLElement)=>void} onAction
 */
export function renderAppBar(opts, onAction) {
  const bar = document.getElementById('appbar');
  const { title, subtitle = '', back = null, actions = [] } = opts;
  bar.innerHTML = `
    ${back !== null ? `<a class="iconbtn" href="#${escapeHtml(back)}" aria-label="戻る">${icon('back')}</a>` : ''}
    <div class="appbar__title">${escapeHtml(title)}${subtitle ? `<span class="appbar__sub">${escapeHtml(subtitle)}</span>` : ''}</div>
    <div class="appbar__actions">
      ${actions.map((a) => `<button type="button" class="iconbtn ${a.active ? 'is-active' : ''}"
          data-action="${escapeHtml(a.id)}" aria-label="${escapeHtml(a.label)}" title="${escapeHtml(a.label)}">
          ${icon(a.icon)}</button>`).join('')}
    </div>`;
  bar.onclick = (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) onAction?.(btn.dataset.action, btn);
  };
}

/**
 * 右下の FAB。null を渡すと消える。
 * @param {{label:string, icon?:string, onClick:()=>void}|null} opts
 */
export function renderFab(opts) {
  const slot = document.getElementById('fab-slot');
  if (!opts) { slot.innerHTML = ''; return; }
  slot.innerHTML = `<button type="button" class="fab">${icon(opts.icon ?? 'add')}<span>${escapeHtml(opts.label)}</span></button>`;
  slot.querySelector('.fab').addEventListener('click', opts.onClick);
}

/** デスクトップでスクロール時にアプリバーへ色を付ける */
export function watchScroll() {
  const bar = document.getElementById('appbar');
  const update = () => bar.classList.toggle('is-stuck', window.scrollY > 4);
  window.addEventListener('scroll', update, { passive: true });
  update();
}
