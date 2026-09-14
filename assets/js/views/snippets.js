/** 部品ライブラリ：再利用候補の一覧・編集 */

import * as store from '../core/store.js';
import { navigate } from '../core/router.js';
import { renderAppBar, renderFab } from '../ui/shell.js';
import {
  emptyState, contextMenu, toast, dialog, confirmDialog,
} from '../ui/components.js';
import {
  escapeHtml, icon, relTime, debounce, copyText, parseTags,
} from '../core/util.js';
import { kindLabel } from '../core/models.js';
import { KIND_OPTIONS } from './prompt-actions.js';

const ui = { query: '', tag: null, sort: 'used' };

const SORTS = [
  { id: 'used', label: 'よく使う順' },
  { id: 'updated', label: '更新順' },
  { id: 'title', label: '名前順' },
];

function snippetTags() {
  const counts = new Map();
  for (const s of store.state.snippets) {
    for (const t of s.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}

function filtered() {
  const q = ui.query.trim().toLowerCase();
  const collator = new Intl.Collator('ja');
  const sorters = {
    used: (a, b) => (b.useCount ?? 0) - (a.useCount ?? 0) || b.updatedAt - a.updatedAt,
    updated: (a, b) => b.updatedAt - a.updatedAt,
    title: (a, b) => collator.compare(a.title || '', b.title || ''),
  };
  return store.state.snippets
    .filter((s) => {
      if (ui.tag && !(s.tags ?? []).includes(ui.tag)) return false;
      if (!q) return true;
      return `${s.title} ${s.body} ${(s.tags ?? []).join(' ')}`.toLowerCase().includes(q);
    })
    .sort(sorters[ui.sort] ?? sorters.used);
}

const card = (s) => `
  <div class="listitem" data-edit="${escapeHtml(s.id)}" role="button" tabindex="0">
    <span class="listitem__lead">${icon('puzzle')}</span>
    <span class="listitem__body">
      <span class="listitem__title">${escapeHtml(s.title || '無題の部品')}</span>
      <span class="listitem__meta">
        <span class="chip chip--kind chip--static" style="min-height:20px;padding:0 8px;font-size:.68rem">${escapeHtml(kindLabel(s.kind))}</span>
        <span>${escapeHtml(relTime(s.updatedAt))}</span>
        ${s.useCount ? `<span>${s.useCount} 回使用</span>` : ''}
        <span>${s.body.length.toLocaleString('ja-JP')} 文字</span>
      </span>
      <span class="listitem__snippet">${escapeHtml(s.body)}</span>
      ${(s.tags ?? []).length ? `<span class="listitem__meta">${s.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join('')}</span>` : ''}
    </span>
    <span class="listitem__actions">
      <button type="button" class="iconbtn iconbtn--sm" data-copy="${escapeHtml(s.id)}" aria-label="コピー">${icon('copy')}</button>
      <button type="button" class="iconbtn iconbtn--sm" data-menu="${escapeHtml(s.id)}" aria-label="メニュー">${icon('more')}</button>
    </span>
  </div>`;

/** 部品の新規作成／編集ダイアログ */
async function editSnippetFlow(id = null) {
  const s = id ? store.getSnippet(id) : null;
  const result = await dialog({
    title: s ? '部品を編集' : '新しい部品',
    submitLabel: '保存',
    body: `
      <label class="field">
        <span class="field__label">部品名</span>
        <input class="input" data-f="title" value="${escapeHtml(s?.title ?? '')}" placeholder="例: 出力はJSONのみ" autofocus>
      </label>
      <div class="row">
        <label class="field" style="flex:1 1 140px">
          <span class="field__label">役割</span>
          <select class="select" data-f="kind">${KIND_OPTIONS(s?.kind ?? 'text')}</select>
        </label>
        <label class="field" style="flex:2 1 200px">
          <span class="field__label">タグ（カンマ区切り）</span>
          <input class="input" data-f="tags" value="${escapeHtml((s?.tags ?? []).join(', '))}">
        </label>
      </div>
      <label class="field">
        <span class="field__label">本文</span>
        <textarea class="textarea" data-f="body" style="min-height:160px">${escapeHtml(s?.body ?? '')}</textarea>
      </label>
      <p class="small" data-err style="color:var(--md-error);display:none">本文を入力してください。</p>`,
    onSubmit(root) {
      const get = (f) => root.querySelector(`[data-f="${f}"]`).value;
      const body = get('body').trim();
      if (!body) { root.querySelector('[data-err]').style.display = ''; return undefined; }
      return {
        title: get('title').trim() || '無題の部品',
        kind: get('kind'),
        tags: parseTags(get('tags')),
        body,
      };
    },
  });
  if (!result) return false;
  if (s) await store.saveSnippet({ ...s, ...result });
  else await store.addSnippet(result);
  toast(s ? '更新しました' : '部品を追加しました');
  return true;
}

export function render(main) {
  const draw = () => {
    const list = filtered();
    const tags = snippetTags();

    renderAppBar({
      title: '部品ライブラリ',
      subtitle: `再利用候補 ${store.state.snippets.length} 件`,
    });

    main.innerHTML = `
      <p class="small muted" style="margin-bottom:14px">
        よく使うセクションを部品として登録しておくと、プロンプト編集画面の「部品から挿入」でいつでも呼び出せます。
      </p>

      <div class="searchbar" style="margin-bottom:12px">
        ${icon('search', 'icon icon-sm')}
        <input type="search" data-q value="${escapeHtml(ui.query)}" placeholder="部品を検索" aria-label="検索">
      </div>

      ${tags.length ? `<div class="chips" style="margin-bottom:10px">
        ${tags.map((t) => `<button type="button" class="chip" data-tag="${escapeHtml(t.tag)}" aria-pressed="${ui.tag === t.tag}">#${escapeHtml(t.tag)} <span class="tiny muted">${t.count}</span></button>`).join('')}
      </div>` : ''}

      <div class="row" style="margin-bottom:14px">
        <select class="select select--plain" data-sort aria-label="並び順">
          ${SORTS.map((s) => `<option value="${s.id}" ${ui.sort === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
        </select>
      </div>

      ${list.length
    ? `<div class="list" data-list>${list.map(card).join('')}</div>`
    : emptyState('puzzle',
      ui.query || ui.tag ? '該当する部品がありません' : 'まだ部品がありません',
      'プロンプトのセクションにある「部品に」ボタン、または右下のボタンから登録できます。',
      '<button type="button" class="btn" data-new>部品を作る</button>')}`;

    bind(draw);
  };

  const onSearch = debounce((v) => { ui.query = v; draw(); }, 200);

  function bind(redraw) {
    main.querySelector('[data-q]')?.addEventListener('input', (e) => onSearch(e.target.value));
    main.querySelector('[data-sort]')?.addEventListener('change', (e) => { ui.sort = e.target.value; redraw(); });
    main.querySelector('[data-new]')?.addEventListener('click', async () => {
      if (await editSnippetFlow()) redraw();
    });
    main.querySelectorAll('[data-tag]').forEach((el) => el.addEventListener('click', () => {
      ui.tag = ui.tag === el.dataset.tag ? null : el.dataset.tag;
      redraw();
    }));

    const list = main.querySelector('[data-list]');
    list?.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('[data-copy]');
      if (copyBtn) {
        const s = store.getSnippet(copyBtn.dataset.copy);
        toast(await copyText(s.body) ? 'コピーしました' : 'コピーできませんでした');
        await store.bumpSnippetUse(s.id);
        return;
      }
      const menuBtn = e.target.closest('[data-menu]');
      if (menuBtn) { openMenu(menuBtn, menuBtn.dataset.menu, redraw); return; }
      const row = e.target.closest('[data-edit]');
      if (row && await editSnippetFlow(row.dataset.edit)) redraw();
    });
    list?.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const row = e.target.closest('[data-edit]');
      if (row && e.target === row && await editSnippetFlow(row.dataset.edit)) redraw();
    });
  }

  draw();
  renderFab({
    label: '新しい部品',
    icon: 'add',
    onClick: async () => { if (await editSnippetFlow()) draw(); },
  });
}

function openMenu(anchor, id, redraw) {
  const s = store.getSnippet(id);
  if (!s) return;
  contextMenu(anchor, [
    { label: '編集', icon: 'edit', onSelect: async () => { if (await editSnippetFlow(id)) redraw(); } },
    {
      label: '本文をコピー',
      icon: 'copy',
      onSelect: async () => {
        toast(await copyText(s.body) ? 'コピーしました' : 'コピーできませんでした');
        await store.bumpSnippetUse(id);
      },
    },
    ...(s.sourcePromptId && store.getPrompt(s.sourcePromptId)
      ? [{ label: '抽出元のプロンプトを開く', icon: 'notes', onSelect: () => navigate(`/prompts/${s.sourcePromptId}`) }]
      : []),
    { divider: true },
    {
      label: '削除',
      icon: 'delete',
      danger: true,
      onSelect: async () => {
        if (store.state.settings.confirmDelete) {
          const ok = await confirmDialog('部品を削除', `「${s.title || '無題の部品'}」を削除します。`, { submitLabel: '削除する', danger: true });
          if (!ok) return;
        }
        await store.deleteSnippet(id);
        toast('削除しました');
        redraw();
      },
    },
  ]);
}
