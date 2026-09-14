/** コマンドパレット（Ctrl/⌘ + K）：プロンプト・部品・画面への横断アクセス */

import * as store from '../core/store.js';
import { navigate } from '../core/router.js';
import { escapeHtml, icon, normalize, relTime } from '../core/util.js';
import { NAV_ITEMS } from './shell.js';
import { copyText } from '../core/util.js';
import { toast } from './components.js';

let isOpen = false;

function buildEntries() {
  const entries = [];

  for (const p of store.state.prompts) {
    entries.push({
      icon: p.starred ? 'star' : 'notes',
      label: p.title || '無題のプロンプト',
      sub: `${store.folderName(p.folderId)}・${relTime(p.updatedAt)}${p.revisionCount ? `・v${p.revisionCount}` : ''}`,
      haystack: normalize(store.promptText(p)),
      weight: p.starred ? 3 : 2,
      sortKey: p.updatedAt,
      run: () => navigate(`/prompts/${p.id}`),
    });
  }

  for (const s of store.state.snippets) {
    entries.push({
      icon: 'puzzle',
      label: s.title || '無題の部品',
      sub: `部品・${s.body.slice(0, 40)}`,
      haystack: normalize(`${s.title} ${s.body} ${(s.tags ?? []).join(' ')}`),
      weight: 1,
      sortKey: s.updatedAt,
      run: async () => {
        await copyText(s.body);
        await store.bumpSnippetUse(s.id);
        toast('部品をコピーしました');
      },
    });
  }

  for (const nav of NAV_ITEMS) {
    entries.push({
      icon: nav.icon,
      label: `${nav.label} へ移動`,
      sub: '画面',
      haystack: normalize(nav.label),
      weight: 0,
      sortKey: 0,
      run: () => navigate(nav.path),
    });
  }

  entries.push({
    icon: 'add',
    label: '新しいプロンプトを作る',
    sub: 'アクション',
    haystack: normalize('新規作成 new prompt'),
    weight: 0,
    sortKey: 1,
    run: () => navigate('/prompts?new=1'),
  });

  return entries;
}

export function openPalette() {
  if (isOpen) return;
  isOpen = true;

  const entries = buildEntries();
  const scrim = document.createElement('div');
  scrim.className = 'scrim palette';
  scrim.innerHTML = `
    <div class="dialog" role="dialog" aria-modal="true" aria-label="検索">
      <div class="palette__input">
        ${icon('search')}
        <input type="search" placeholder="プロンプト・部品・画面を検索" aria-label="検索語" autocomplete="off">
      </div>
      <div class="palette__list" role="listbox"></div>
    </div>`;

  const input = scrim.querySelector('input');
  const list = scrim.querySelector('.palette__list');
  let results = [];
  let sel = 0;

  const close = () => {
    isOpen = false;
    scrim.remove();
    document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = '';
  };

  const draw = () => {
    const q = normalize(input.value.trim());
    const terms = q.split(/\s+/).filter(Boolean);
    results = entries
      .filter((e) => terms.every((t) => e.haystack.includes(t)))
      .sort((a, b) => b.weight - a.weight || b.sortKey - a.sortKey)
      .slice(0, 40);
    sel = 0;
    list.innerHTML = results.length
      ? results.map((e, i) => `
        <button type="button" class="palette__item ${i === 0 ? 'is-sel' : ''}" data-i="${i}" role="option">
          ${icon(e.icon, 'icon icon-sm')}
          <span style="flex:1 1 auto;min-width:0">
            <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.label)}</span>
            <small style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.sub)}</small>
          </span>
        </button>`).join('')
      : '<p class="muted small" style="padding:16px;text-align:center">一致するものがありません</p>';
  };

  const highlight = () => {
    list.querySelectorAll('.palette__item').forEach((el, i) => {
      el.classList.toggle('is-sel', i === sel);
      if (i === sel) el.scrollIntoView({ block: 'nearest' });
    });
  };

  const choose = (i) => {
    const entry = results[i];
    if (!entry) return;
    close();
    entry.run();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); highlight(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
  };

  input.addEventListener('input', draw);
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-i]');
    if (btn) choose(Number(btn.dataset.i));
  });
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  document.addEventListener('keydown', onKey, true);

  document.getElementById('dialog-root').appendChild(scrim);
  document.body.style.overflow = 'hidden';
  draw();
  input.focus();
}
