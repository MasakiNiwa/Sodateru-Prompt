/** プロンプト一覧：フォルダ・タグ・検索での絞り込み */

import * as store from '../core/store.js';
import { navigate } from '../core/router.js';
import { renderAppBar, renderFab } from '../ui/shell.js';
import { emptyState, contextMenu, toast, promptDialog } from '../ui/components.js';
import {
  escapeHtml, icon, relTime, debounce, charCount,
} from '../core/util.js';
import { openPalette } from '../ui/palette.js';
import {
  newPromptFlow, deletePromptFlow, exportDialog, editPromptMetaFlow,
} from './prompt-actions.js';
import { statusLabel } from '../core/models.js';

/** 画面を離れても保つ一時的な絞り込み状態 */
const ui = {
  query: '',
  folderId: undefined, // undefined = すべて, null = 未分類
  tag: null,
  sort: 'updated',
  showArchived: false,
};

const SORTS = [
  { id: 'updated', label: '更新順' },
  { id: 'created', label: '作成順' },
  { id: 'title', label: '名前順' },
  { id: 'versions', label: '版の多い順' },
];

function promptCard(p) {
  const body = (p.sections ?? []).map((s) => s.body).join(' ').trim();
  const chars = (p.sections ?? []).reduce((n, s) => n + s.body.length, 0);
  return `
    <div class="listitem" data-open="${escapeHtml(p.id)}" role="button" tabindex="0">
      <span class="listitem__body">
        <span class="listitem__title">${escapeHtml(p.title || '無題のプロンプト')}</span>
        <span class="listitem__meta">
          <span>${icon('folder', 'icon icon-sm')} ${escapeHtml(store.folderName(p.folderId))}</span>
          <span>${escapeHtml(relTime(p.updatedAt))}</span>
          <span>${(p.sections ?? []).length} セクション・${charCount(chars)} 文字</span>
          ${p.revisionCount ? `<span class="badge badge--v">v${p.revisionCount}</span>` : '<span class="badge badge--draft">未確定</span>'}
          ${p.status === 'archived' ? '<span class="badge badge--archived">アーカイブ</span>' : ''}
        </span>
        ${p.summary || body ? `<span class="listitem__snippet">${escapeHtml(p.summary || body)}</span>` : ''}
        ${(p.tags ?? []).length ? `<span class="listitem__meta">${(p.tags ?? []).map((t) => `<span>#${escapeHtml(t)}</span>`).join('')}</span>` : ''}
      </span>
      <span class="listitem__actions">
        <button type="button" class="iconbtn iconbtn--sm ${p.starred ? 'is-active' : ''}"
          data-star="${escapeHtml(p.id)}" aria-label="お気に入り">${icon(p.starred ? 'star' : 'star-o')}</button>
        <button type="button" class="iconbtn iconbtn--sm" data-menu="${escapeHtml(p.id)}" aria-label="メニュー">${icon('more')}</button>
      </span>
    </div>`;
}

function filterBar() {
  const tags = store.allTags().slice(0, 18);
  return `
    <div class="searchbar" style="margin-bottom:12px">
      ${icon('search', 'icon icon-sm')}
      <input type="search" data-q value="${escapeHtml(ui.query)}" placeholder="タイトル・本文・タグを検索" aria-label="検索">
      ${ui.query ? `<button type="button" class="iconbtn iconbtn--sm" data-clear aria-label="クリア">${icon('close', 'icon icon-sm')}</button>` : ''}
    </div>

    <div class="chips" style="margin-bottom:10px">
      <button type="button" class="chip" data-folder="" aria-pressed="${ui.folderId === undefined}">すべて</button>
      ${store.state.folders.map((f) => `
        <button type="button" class="chip" data-folder="${escapeHtml(f.id)}" aria-pressed="${ui.folderId === f.id}">
          ${icon('folder', 'icon icon-sm')} ${escapeHtml(f.name)}
        </button>`).join('')}
      <button type="button" class="chip" data-folder="__none" aria-pressed="${ui.folderId === null}">未分類</button>
      <button type="button" class="chip" data-addfolder aria-label="フォルダを追加">${icon('add', 'icon icon-sm')}</button>
    </div>

    ${tags.length ? `<div class="chips" style="margin-bottom:10px">
      ${tags.map((t) => `<button type="button" class="chip" data-tag="${escapeHtml(t.tag)}" aria-pressed="${ui.tag === t.tag}">#${escapeHtml(t.tag)} <span class="tiny muted">${t.count}</span></button>`).join('')}
    </div>` : ''}

    <div class="row" style="margin-bottom:14px">
      <select class="select" data-sort style="width:auto;min-width:130px">
        ${SORTS.map((s) => `<option value="${s.id}" ${ui.sort === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
      </select>
      <button type="button" class="chip" data-archived aria-pressed="${ui.showArchived}">${icon('archive', 'icon icon-sm')} アーカイブも表示</button>
    </div>`;
}

export function render(main, ctx = {}) {
  // #/prompts?new=1 で新規作成ダイアログを開く
  if (ctx.query?.get('new')) {
    navigate('/prompts', { replace: true });
    newPromptFlow();
  }

  const draw = () => {
    const list = store.queryPrompts({
      query: ui.query,
      folderId: ui.folderId,
      tag: ui.tag,
      includeArchived: ui.showArchived,
      sort: ui.sort,
    });

    renderAppBar({
      title: 'プロンプト',
      subtitle: `${list.length} 件`,
      actions: [{ id: 'search', icon: 'search', label: '横断検索' }],
    }, (id) => { if (id === 'search') openPalette(); });

    main.innerHTML = `
      ${filterBar()}
      ${list.length
    ? `<div class="list" data-list>${list.map(promptCard).join('')}</div>`
    : emptyState('notes',
      ui.query || ui.tag || ui.folderId !== undefined ? '該当するプロンプトがありません' : 'まだプロンプトがありません',
      ui.query || ui.tag || ui.folderId !== undefined ? '条件を変えて探してみてください。' : 'ひとつの取り組みごとにプロンプトを作ります。',
      '<button type="button" class="btn" data-new>新しいプロンプト</button>')}`;

    bind();
  };

  const onSearch = debounce((v) => { ui.query = v; draw(); }, 220);

  function bind() {
    const q = main.querySelector('[data-q]');
    if (q) {
      q.addEventListener('input', (e) => onSearch(e.target.value));
      q.addEventListener('search', (e) => { onSearch.cancel(); ui.query = e.target.value; draw(); });
    }
    main.querySelector('[data-clear]')?.addEventListener('click', () => { ui.query = ''; draw(); });
    main.querySelector('[data-new]')?.addEventListener('click', () => newPromptFlow());
    main.querySelector('[data-sort]')?.addEventListener('change', (e) => { ui.sort = e.target.value; draw(); });
    main.querySelector('[data-archived]')?.addEventListener('click', () => { ui.showArchived = !ui.showArchived; draw(); });

    main.querySelectorAll('[data-folder]').forEach((el) => el.addEventListener('click', () => {
      const v = el.dataset.folder;
      ui.folderId = v === '' ? undefined : (v === '__none' ? null : v);
      draw();
    }));
    main.querySelector('[data-addfolder]')?.addEventListener('click', async () => {
      const name = await promptDialog('フォルダを追加', { label: 'フォルダ名', required: true, submitLabel: '追加' });
      if (name) { await store.addFolder(name); draw(); }
    });
    main.querySelectorAll('[data-tag]').forEach((el) => el.addEventListener('click', () => {
      ui.tag = ui.tag === el.dataset.tag ? null : el.dataset.tag;
      draw();
    }));

    const list = main.querySelector('[data-list]');
    if (!list) return;

    list.addEventListener('click', async (e) => {
      const starBtn = e.target.closest('[data-star]');
      if (starBtn) {
        const p = store.getPrompt(starBtn.dataset.star);
        await store.savePrompt({ ...p, starred: !p.starred }, { touch: false });
        draw();
        return;
      }
      const menuBtn = e.target.closest('[data-menu]');
      if (menuBtn) { openRowMenu(menuBtn, menuBtn.dataset.menu, draw); return; }
      const row = e.target.closest('[data-open]');
      if (row) navigate(`/prompts/${row.dataset.open}`);
    });

    list.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('[data-open]');
      if (row && e.target === row) { e.preventDefault(); navigate(`/prompts/${row.dataset.open}`); }
    });
  }

  draw();
  renderFab({ label: '新規プロンプト', onClick: () => newPromptFlow() });
}

function openRowMenu(anchor, promptId, redraw) {
  const p = store.getPrompt(promptId);
  if (!p) return;
  contextMenu(anchor, [
    { label: '開く', icon: 'edit', onSelect: () => navigate(`/prompts/${promptId}`) },
    { label: '情報を編集', icon: 'settings', onSelect: async () => { await editPromptMetaFlow(promptId); redraw(); } },
    { label: '出力・コピー', icon: 'output', onSelect: () => exportDialog(store.getPrompt(promptId)) },
    { divider: true },
    {
      label: '複製',
      icon: 'copy',
      onSelect: async () => {
        const copy = await store.duplicatePrompt(promptId);
        toast('複製しました', { action: '開く', onAction: () => navigate(`/prompts/${copy.id}`) });
        redraw();
      },
    },
    {
      label: p.status === 'archived' ? 'アーカイブを解除' : 'アーカイブ',
      icon: 'archive',
      onSelect: async () => {
        await store.savePrompt({ ...store.getPrompt(promptId), status: p.status === 'archived' ? 'active' : 'archived' });
        toast(p.status === 'archived' ? `${statusLabel('active')}に戻しました` : 'アーカイブしました');
        redraw();
      },
    },
    { divider: true },
    {
      label: '削除',
      icon: 'delete',
      danger: true,
      onSelect: async () => { if (await deletePromptFlow(promptId)) redraw(); },
    },
  ]);
}
