/** プロンプト詳細：編集 / 履歴 / 差分 / 出力 */

import * as store from '../core/store.js';
import { navigate } from '../core/router.js';
import { renderAppBar, renderFab } from '../ui/shell.js';
import {
  toast, contextMenu, promptDialog, confirmDialog, emptyState,
} from '../ui/components.js';
import {
  escapeHtml, icon, relTime, formatDateTime, debounce, copyText, moveItem, clone,
} from '../core/util.js';
import { createSection, kindLabel, statusLabel } from '../core/models.js';
import { renderSectionsDiff } from '../ui/diff-view.js';
import { renderPrompt, renderSection, FORMATS, getFormat, exportFileName } from '../core/format.js';
import {
  exportDialog, editPromptMetaFlow, deletePromptFlow,
  saveSectionAsSnippetFlow, insertSnippetFlow, KIND_OPTIONS,
} from './prompt-actions.js';
import { download } from '../core/util.js';

const TABS = [
  { id: 'edit', label: '編集', icon: 'edit' },
  { id: 'history', label: '履歴', icon: 'history' },
  { id: 'diff', label: '差分', icon: 'compare' },
  { id: 'output', label: '出力', icon: 'output' },
];

/** 画面内で保持する状態（プロンプトを切り替えたらリセット） */
let view = null;

function resetView(promptId) {
  view = {
    promptId,
    tab: 'edit',
    draft: clone(store.getPrompt(promptId)),
    dirty: false,
    revisions: [],
    diffLeft: null,        // revision id
    diffRight: 'working',  // 'working' または revision id
    diffTouched: false,    // 利用者が比較対象を選び直したか
    outputFormat: store.state.settings.defaultExportFormat ?? 'markdown',
    showUnchanged: false,
  };
}

/* ---------------- 保存 ---------------- */

const flushSave = async () => {
  if (!view?.dirty) return;
  view.dirty = false;
  await store.savePrompt(view.draft);
  updateDirtyIndicator();
};

const scheduleSave = debounce(() => { flushSave(); }, 700);

function markDirty() {
  view.dirty = true;
  updateDirtyIndicator();
  scheduleSave();
}

function updateDirtyIndicator() {
  const el = document.querySelector('[data-dirty]');
  if (el) el.textContent = view.dirty ? '保存中…' : '保存済み';
}

/** 画面を離れる前に確実に書き込む */
export async function flushPendingSave() {
  scheduleSave.cancel();
  await flushSave();
}

/* ---------------- 描画 ---------------- */

export async function render(main, ctx) {
  const promptId = ctx.params.id;
  const prompt = store.getPrompt(promptId);

  if (!prompt) {
    renderFab(null);
    renderAppBar({ title: 'プロンプト', back: '/prompts' });
    main.innerHTML = emptyState('notes', 'プロンプトが見つかりません',
      '削除されたか、URL が正しくない可能性があります。',
      '<a class="btn" href="#/prompts">一覧へ戻る</a>');
    return;
  }

  if (!view || view.promptId !== promptId) resetView(promptId);
  else view.draft = { ...clone(store.getPrompt(promptId)), sections: view.draft.sections };

  view.revisions = await store.listRevisions(promptId);
  drawShell(main);
}

function drawShell(main) {
  const p = view.draft;
  renderFab(null);
  renderAppBar({
    title: p.title || '無題のプロンプト',
    subtitle: `${store.folderName(p.folderId)}・${p.revisionCount ? `v${p.revisionCount}` : '版なし'}・${statusLabel(p.status)}`,
    back: '/prompts',
    actions: [
      { id: 'star', icon: p.starred ? 'star' : 'star-o', label: 'お気に入り', active: p.starred },
      { id: 'more', icon: 'more', label: 'メニュー' },
    ],
  }, onAppBarAction);

  main.innerHTML = `
    <div class="tabs" role="tablist">
      ${TABS.map((t) => `<button type="button" class="tab" role="tab" data-tab="${t.id}"
        aria-selected="${view.tab === t.id}">${icon(t.icon, 'icon icon-sm')} ${escapeHtml(t.label)}
        ${t.id === 'history' && view.revisions.length ? `<span class="badge">${view.revisions.length}</span>` : ''}</button>`).join('')}
    </div>
    <div data-panel></div>`;

  main.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', async () => {
    await flushPendingSave();
    view.tab = btn.dataset.tab;
    view.revisions = await store.listRevisions(view.promptId);
    drawShell(main);
  }));

  drawPanel(main.querySelector('[data-panel]'));
}

function drawPanel(panel) {
  switch (view.tab) {
    case 'history': drawHistory(panel); break;
    case 'diff': drawDiff(panel); break;
    case 'output': drawOutput(panel); break;
    default: drawEditor(panel);
  }
}

const redrawPanel = () => {
  const panel = document.querySelector('[data-panel]');
  if (panel) drawPanel(panel);
};

/* ---------------- タブ: 編集 ---------------- */

function sectionCard(s, i, total) {
  return `
    <article class="secard ${s.enabled === false ? 'is-disabled' : ''}" data-sec="${escapeHtml(s.id)}">
      <header class="secard__head">
        <input class="secard__title" data-f="title" value="${escapeHtml(s.title)}"
          placeholder="セクション名" aria-label="セクション名">
        <select class="secard__kind" data-f="kind" aria-label="役割">${KIND_OPTIONS(s.kind)}</select>
        <button type="button" class="iconbtn iconbtn--sm" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="上へ">${icon('up', 'icon icon-sm')}</button>
        <button type="button" class="iconbtn iconbtn--sm" data-act="down" ${i === total - 1 ? 'disabled' : ''} aria-label="下へ">${icon('down', 'icon icon-sm')}</button>
        <button type="button" class="iconbtn iconbtn--sm" data-act="menu" aria-label="セクションのメニュー">${icon('more', 'icon icon-sm')}</button>
      </header>
      <textarea class="secard__body" data-f="body" rows="5"
        placeholder="ここに書きます" aria-label="本文">${escapeHtml(s.body)}</textarea>
      <footer class="secard__foot">
        <span data-chars>${s.body.length.toLocaleString('ja-JP')} 文字</span>
        <span class="spacer"></span>
        <button type="button" class="btn btn--text btn--sm" data-act="copy">${icon('copy', 'icon icon-sm')} コピー</button>
        <button type="button" class="btn btn--text btn--sm" data-act="snippet">${icon('puzzle', 'icon icon-sm')} 部品に</button>
      </footer>
    </article>`;
}

function drawEditor(panel) {
  const p = view.draft;
  panel.innerHTML = `
    <div class="card card--flat" style="margin-bottom:16px">
      <div class="row">
        <div style="flex:1 1 220px;min-width:0">
          <h2 style="font-size:1.15rem">${escapeHtml(p.title || '無題のプロンプト')}</h2>
          ${p.summary ? `<p class="small muted" style="margin:6px 0 0;white-space:pre-wrap">${escapeHtml(p.summary)}</p>` : ''}
          ${(p.tags ?? []).length ? `<div class="chips" style="margin-top:10px">${p.tags.map((t) => `<span class="chip chip--static">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>
        <button type="button" class="iconbtn" data-act="meta" aria-label="情報を編集">${icon('edit')}</button>
      </div>
      <div class="row small muted" style="margin-top:12px">
        <span>${icon('folder', 'icon icon-sm')} ${escapeHtml(store.folderName(p.folderId))}</span>
        <span>最終更新 ${escapeHtml(relTime(p.updatedAt))}</span>
        <span class="spacer"></span>
        <span data-dirty>保存済み</span>
      </div>
    </div>

    <div class="seceditor" data-sections>
      ${p.sections.map((s, i) => sectionCard(s, i, p.sections.length)).join('')}
    </div>

    ${p.sections.length ? '' : emptyState('notes', 'セクションがありません', '役割・前提・指示などに分けて書くと、あとから部分的に育てられます。')}

    <div class="row" style="margin-top:16px">
      <button type="button" class="btn btn--tonal" data-act="add">${icon('add')} セクションを追加</button>
      <button type="button" class="btn btn--outlined" data-act="insert">${icon('insert')} 部品から挿入</button>
    </div>

    <hr class="divider">

    <div class="row">
      <button type="button" class="btn" data-act="commit">${icon('save')} この内容で版を保存</button>
      <span class="small muted">${view.revisions.length ? `直近: v${view.revisions[0].version}（${escapeHtml(relTime(view.revisions[0].createdAt))}）` : 'まだ版がありません'}</span>
    </div>`;

  bindEditor(panel);
}

function bindEditor(panel) {
  const p = view.draft;
  const findSection = (id) => p.sections.find((s) => s.id === id);

  panel.querySelector('[data-act="meta"]')?.addEventListener('click', async () => {
    await flushPendingSave();
    const saved = await editPromptMetaFlow(view.promptId);
    if (saved) { view.draft = clone(saved); drawShell(document.getElementById('main')); }
  });

  panel.querySelector('[data-act="add"]')?.addEventListener('click', () => {
    p.sections = [...p.sections, createSection()];
    markDirty();
    redrawPanel();
    const cards = document.querySelectorAll('.secard');
    cards[cards.length - 1]?.querySelector('[data-f="title"]')?.focus();
  });

  panel.querySelector('[data-act="insert"]')?.addEventListener('click', async () => {
    const section = await insertSnippetFlow();
    if (!section) return;
    p.sections = [...p.sections, section];
    markDirty();
    await flushPendingSave();
    redrawPanel();
    toast('部品を挿入しました');
  });

  panel.querySelector('[data-act="commit"]')?.addEventListener('click', () => commitFlow());

  const list = panel.querySelector('[data-sections]');
  if (!list) return;

  // 入力: 再描画せずモデルだけ更新（フォーカスを保つ）
  list.addEventListener('input', (e) => {
    const card = e.target.closest('[data-sec]');
    const field = e.target.dataset.f;
    if (!card || !field) return;
    const s = findSection(card.dataset.sec);
    if (!s) return;
    s[field] = e.target.value;
    if (field === 'body') {
      card.querySelector('[data-chars]').textContent = `${e.target.value.length.toLocaleString('ja-JP')} 文字`;
    }
    markDirty();
  });

  list.addEventListener('change', (e) => {
    if (e.target.dataset.f !== 'kind') return;
    const card = e.target.closest('[data-sec]');
    const s = findSection(card.dataset.sec);
    if (s) { s.kind = e.target.value; markDirty(); }
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('[data-sec]');
    const id = card.dataset.sec;
    const idx = p.sections.findIndex((s) => s.id === id);
    const s = p.sections[idx];
    if (!s) return;

    switch (btn.dataset.act) {
      case 'up':
        p.sections = moveItem(p.sections, idx, idx - 1);
        markDirty(); redrawPanel();
        break;
      case 'down':
        p.sections = moveItem(p.sections, idx, idx + 1);
        markDirty(); redrawPanel();
        break;
      case 'copy':
        toast(await copyText(renderSection(s, view.outputFormat)) ? 'セクションをコピーしました' : 'コピーできませんでした');
        break;
      case 'snippet':
        await saveSectionAsSnippetFlow(s, view.promptId);
        break;
      case 'menu':
        openSectionMenu(btn, id);
        break;
      default:
        break;
    }
  });
}

function openSectionMenu(anchor, sectionId) {
  const p = view.draft;
  const idx = p.sections.findIndex((s) => s.id === sectionId);
  const s = p.sections[idx];
  if (!s) return;

  contextMenu(anchor, [
    {
      label: s.enabled === false ? '出力に含める' : '出力から外す',
      icon: s.enabled === false ? 'check' : 'close',
      onSelect: () => { s.enabled = s.enabled === false; markDirty(); redrawPanel(); },
    },
    {
      label: '複製',
      icon: 'copy',
      onSelect: () => {
        const copy = createSection({ title: s.title, body: s.body, kind: s.kind, enabled: s.enabled });
        p.sections = [...p.sections.slice(0, idx + 1), copy, ...p.sections.slice(idx + 1)];
        markDirty(); redrawPanel();
      },
    },
    { label: '再利用候補に登録', icon: 'puzzle', onSelect: () => saveSectionAsSnippetFlow(s, view.promptId) },
    { divider: true },
    {
      label: '削除',
      icon: 'delete',
      danger: true,
      onSelect: async () => {
        if (store.state.settings.confirmDelete) {
          const ok = await confirmDialog('セクションを削除',
            `「${s.title || kindLabel(s.kind)}」を削除します。`, { submitLabel: '削除する', danger: true });
          if (!ok) return;
        }
        p.sections = p.sections.filter((x) => x.id !== sectionId);
        markDirty(); redrawPanel();
      },
    },
  ]);
}

/** 現在の作業コピーを版として確定 */
async function commitFlow() {
  await flushPendingSave();
  const message = await promptDialog('版を保存', {
    label: '変更メモ',
    placeholder: '例: 制約を追加し、出力形式をJSONに変更',
    hint: '何をどう変えたのかを残しておくと、あとから差分を追いやすくなります。',
    submitLabel: '保存',
  });
  if (message === null) return;
  const rev = await store.commitRevision(view.promptId, message);
  view.draft = clone(store.getPrompt(view.promptId));
  view.revisions = await store.listRevisions(view.promptId);
  toast(`v${rev.version} として保存しました`);
  drawShell(document.getElementById('main'));
}

/* ---------------- タブ: 履歴 ---------------- */

function drawHistory(panel) {
  if (!view.revisions.length) {
    panel.innerHTML = emptyState('history', 'まだ版がありません',
      '編集タブの「この内容で版を保存」で、その時点の内容を時系列に積み上げられます。',
      '<button type="button" class="btn" data-act="commit">版を保存</button>');
    panel.querySelector('[data-act="commit"]')?.addEventListener('click', () => commitFlow());
    return;
  }

  const working = view.draft;
  const latest = view.revisions[0];
  const hasUnsaved = JSON.stringify(latest.sections) !== JSON.stringify(working.sections);

  panel.innerHTML = `
    <div class="timeline">
      ${hasUnsaved ? `
        <div class="tl-item tl-item--current">
          <div class="card">
            <div class="row">
              <b>作業コピー（未確定）</b>
              <span class="spacer"></span>
              <button type="button" class="btn btn--sm" data-act="commit">${icon('save', 'icon icon-sm')} 版を保存</button>
            </div>
            <p class="small muted" style="margin:8px 0 0">最新版 v${latest.version} から変更があります。</p>
          </div>
        </div>` : ''}
      ${view.revisions.map((r) => `
        <div class="tl-item">
          <div class="card">
            <div class="row">
              <span class="badge badge--v">v${r.version}</span>
              <span class="small muted">${escapeHtml(formatDateTime(r.createdAt))}・${escapeHtml(relTime(r.createdAt))}</span>
              <span class="spacer"></span>
              <button type="button" class="iconbtn iconbtn--sm" data-rev-menu="${escapeHtml(r.id)}" aria-label="この版のメニュー">${icon('more', 'icon icon-sm')}</button>
            </div>
            ${r.message ? `<p style="margin:10px 0 0;white-space:pre-wrap">${escapeHtml(r.message)}</p>` : '<p class="small muted" style="margin:10px 0 0">（メモなし）</p>'}
            <div class="row small muted" style="margin-top:10px">
              <span>${r.sections.length} セクション</span>
              <span>${r.sections.reduce((n, s) => n + s.body.length, 0).toLocaleString('ja-JP')} 文字</span>
            </div>
            <div class="row" style="margin-top:10px">
              <button type="button" class="btn btn--text btn--sm" data-diff="${escapeHtml(r.id)}">${icon('compare', 'icon icon-sm')} 差分</button>
              <button type="button" class="btn btn--text btn--sm" data-restore="${escapeHtml(r.id)}">${icon('restore', 'icon icon-sm')} 復元</button>
              <button type="button" class="btn btn--text btn--sm" data-export="${escapeHtml(r.id)}">${icon('output', 'icon icon-sm')} 出力</button>
            </div>
          </div>
        </div>`).join('')}
    </div>`;

  panel.querySelector('[data-act="commit"]')?.addEventListener('click', () => commitFlow());

  panel.addEventListener('click', async (e) => {
    const diffBtn = e.target.closest('[data-diff]');
    if (diffBtn) {
      const rev = view.revisions.find((r) => r.id === diffBtn.dataset.diff);
      const older = view.revisions.find((r) => r.version === rev.version - 1);
      view.diffLeft = older ? older.id : rev.id;
      view.diffRight = older ? rev.id : 'working';
      view.diffTouched = true;
      view.tab = 'diff';
      drawShell(document.getElementById('main'));
      return;
    }
    const restoreBtn = e.target.closest('[data-restore]');
    if (restoreBtn) { await restoreFlow(restoreBtn.dataset.restore); return; }

    const exportBtn = e.target.closest('[data-export]');
    if (exportBtn) {
      const rev = view.revisions.find((r) => r.id === exportBtn.dataset.export);
      await exportDialog({ ...rev, revisionCount: rev.version }, { titleSuffix: `（v${rev.version}）` });
      return;
    }
    const menuBtn = e.target.closest('[data-rev-menu]');
    if (menuBtn) openRevisionMenu(menuBtn, menuBtn.dataset.revMenu);
  });
}

async function restoreFlow(revId) {
  const rev = view.revisions.find((r) => r.id === revId);
  if (!rev) return;
  const ok = await confirmDialog('この版を復元',
    `v${rev.version} の内容を作業コピーに書き戻します。\n現在の作業コピーは上書きされます（版として保存済みの内容は消えません）。`,
    { submitLabel: '復元する' });
  if (!ok) return;
  await flushPendingSave();
  const updated = await store.restoreRevision(view.promptId, revId);
  view.draft = clone(updated);
  view.tab = 'edit';
  toast(`v${rev.version} を復元しました`);
  drawShell(document.getElementById('main'));
}

function openRevisionMenu(anchor, revId) {
  const rev = view.revisions.find((r) => r.id === revId);
  if (!rev) return;
  contextMenu(anchor, [
    {
      label: 'メモを編集',
      icon: 'edit',
      onSelect: async () => {
        const message = await promptDialog(`v${rev.version} のメモ`, {
          label: '変更メモ', value: rev.message, multiline: true, submitLabel: '保存',
        });
        if (message === null) return;
        await store.saveRevisionMessage(revId, message);
        view.revisions = await store.listRevisions(view.promptId);
        redrawPanel();
        toast('メモを更新しました');
      },
    },
    { label: '作業コピーに復元', icon: 'restore', onSelect: () => restoreFlow(revId) },
    {
      label: 'テキストで保存',
      icon: 'download',
      onSelect: () => {
        const source = { ...rev, revisionCount: rev.version };
        const fmt = getFormat(view.outputFormat);
        download(exportFileName(source, view.outputFormat),
          renderPrompt(source, view.outputFormat), fmt.mime);
        toast('ファイルを保存しました');
      },
    },
    { divider: true },
    {
      label: 'この版を削除',
      icon: 'delete',
      danger: true,
      onSelect: async () => {
        const ok = await confirmDialog('版を削除',
          `v${rev.version} を削除します。この操作は取り消せません。`,
          { submitLabel: '削除する', danger: true });
        if (!ok) return;
        await store.deleteRevision(revId, view.promptId);
        view.revisions = await store.listRevisions(view.promptId);
        redrawPanel();
        toast('版を削除しました');
      },
    },
  ]);
}

/* ---------------- タブ: 差分 ---------------- */

const revOptions = (selected, { includeWorking = true } = {}) => [
  includeWorking ? `<option value="working" ${selected === 'working' ? 'selected' : ''}>作業コピー（現在）</option>` : '',
  ...view.revisions.map((r) => `<option value="${escapeHtml(r.id)}" ${selected === r.id ? 'selected' : ''}>v${r.version}　${escapeHtml(r.message || formatDateTime(r.createdAt))}</option>`),
].join('');

const sideSections = (key) => (key === 'working'
  ? view.draft.sections
  : (view.revisions.find((r) => r.id === key)?.sections ?? []));

const sideLabel = (key) => (key === 'working'
  ? '作業コピー'
  : `v${view.revisions.find((r) => r.id === key)?.version ?? '?'}`);

/**
 * 比較対象の既定値を決める。
 * 作業コピーに未確定の変更があればそれを、無ければ直近 2 つの版を比べる。
 */
function applyDefaultDiffPair() {
  const [latest, previous] = view.revisions;
  if (!latest) return;
  const unsaved = JSON.stringify(latest.sections) !== JSON.stringify(view.draft.sections);
  if (unsaved || !previous) {
    view.diffLeft = latest.id;
    view.diffRight = 'working';
  } else {
    view.diffLeft = previous.id;
    view.diffRight = latest.id;
  }
}

function drawDiff(panel) {
  if (!view.revisions.length) {
    panel.innerHTML = emptyState('compare', '比較できる版がありません',
      '版を 1 つ以上保存すると、作業コピーとの差分を見られます。');
    return;
  }
  if (!view.diffTouched) applyDefaultDiffPair();
  if (!view.diffLeft || !view.revisions.some((r) => r.id === view.diffLeft)) {
    view.diffLeft = view.revisions[view.revisions.length > 1 ? 1 : 0].id;
  }

  panel.innerHTML = `
    <div class="card card--flat" style="margin-bottom:16px">
      <div class="row">
        <label class="field" style="flex:1 1 200px;margin:0">
          <span class="field__label">比較元</span>
          <select class="select" data-left>${revOptions(view.diffLeft, { includeWorking: false })}</select>
        </label>
        <label class="field" style="flex:1 1 200px;margin:0">
          <span class="field__label">比較先</span>
          <select class="select" data-right>${revOptions(view.diffRight)}</select>
        </label>
      </div>
      <div class="row" style="margin-top:12px">
        <button type="button" class="chip" data-unchanged aria-pressed="${view.showUnchanged}">変更のないセクションも表示</button>
        <button type="button" class="btn btn--text btn--sm" data-swap>入れ替え</button>
      </div>
    </div>
    <div class="stack" data-diffout></div>`;

  const out = panel.querySelector('[data-diffout]');
  out.innerHTML = `
    <p class="small muted">${escapeHtml(sideLabel(view.diffLeft))} → ${escapeHtml(sideLabel(view.diffRight))}</p>
    ${renderSectionsDiff(sideSections(view.diffLeft), sideSections(view.diffRight), {
    showUnchanged: view.showUnchanged,
  })}`;

  panel.querySelector('[data-left]').addEventListener('change', (e) => {
    view.diffLeft = e.target.value; view.diffTouched = true; drawDiff(panel);
  });
  panel.querySelector('[data-right]').addEventListener('change', (e) => {
    view.diffRight = e.target.value; view.diffTouched = true; drawDiff(panel);
  });
  panel.querySelector('[data-unchanged]').addEventListener('click', () => { view.showUnchanged = !view.showUnchanged; drawDiff(panel); });
  panel.querySelector('[data-swap]').addEventListener('click', () => {
    if (view.diffRight === 'working') { toast('作業コピーは比較元にできません'); return; }
    [view.diffLeft, view.diffRight] = [view.diffRight, view.diffLeft];
    view.diffTouched = true;
    drawDiff(panel);
  });
}

/* ---------------- タブ: 出力 ---------------- */

function drawOutput(panel) {
  const settings = store.state.settings;
  const source = view.draft;

  const text = () => renderPrompt(source, view.outputFormat, {
    includeDisabled: settings.includeDisabledSections,
    showTitles: settings.showSectionTitlesInPlain,
  });

  panel.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <div class="segmented" data-fmt>
        ${FORMATS.map((f) => `<button type="button" data-v="${f.id}" aria-pressed="${f.id === view.outputFormat}">${escapeHtml(f.label)}</button>`).join('')}
      </div>
    </div>
    <pre class="output-pre" data-out></pre>
    <div class="row" style="margin-top:12px">
      <button type="button" class="btn btn--tonal" data-act="copy">${icon('copy')} コピー</button>
      <button type="button" class="btn btn--outlined" data-act="download">${icon('download')} ファイル保存</button>
      <span class="spacer"></span>
      <span class="small muted" data-count></span>
    </div>
    <p class="small muted" style="margin-top:16px">
      無効にしたセクションの扱いや既定の形式は、設定ページで変更できます。
    </p>`;

  const outEl = panel.querySelector('[data-out]');
  const countEl = panel.querySelector('[data-count]');
  const draw = () => {
    const t = text();
    outEl.textContent = t;
    countEl.textContent = `${t.length.toLocaleString('ja-JP')} 文字`;
  };

  panel.querySelector('[data-fmt]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-v]');
    if (!btn) return;
    view.outputFormat = btn.dataset.v;
    panel.querySelectorAll('[data-fmt] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === view.outputFormat)));
    draw();
  });
  panel.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    toast(await copyText(outEl.textContent) ? 'コピーしました' : 'コピーできませんでした');
  });
  panel.querySelector('[data-act="download"]').addEventListener('click', () => {
    const fmt = getFormat(view.outputFormat);
    download(exportFileName(source, view.outputFormat), outEl.textContent, fmt.mime);
    toast('ファイルを保存しました');
  });
  draw();
}

/* ---------------- アプリバーのアクション ---------------- */

async function onAppBarAction(id, el) {
  if (id === 'star') {
    view.draft.starred = !view.draft.starred;
    await store.savePrompt({ ...store.getPrompt(view.promptId), starred: view.draft.starred }, { touch: false });
    drawShell(document.getElementById('main'));
    return;
  }
  if (id !== 'more') return;

  contextMenu(el, [
    { label: '情報を編集', icon: 'edit', onSelect: async () => {
      await flushPendingSave();
      const saved = await editPromptMetaFlow(view.promptId);
      if (saved) { view.draft = clone(saved); drawShell(document.getElementById('main')); }
    } },
    { label: 'この内容で版を保存', icon: 'save', onSelect: () => commitFlow() },
    { label: '出力・コピー', icon: 'output', onSelect: async () => { await flushPendingSave(); exportDialog(view.draft); } },
    { divider: true },
    { label: '複製', icon: 'copy', onSelect: async () => {
      await flushPendingSave();
      const copy = await store.duplicatePrompt(view.promptId);
      toast('複製しました', { action: '開く', onAction: () => navigate(`/prompts/${copy.id}`) });
    } },
    { divider: true },
    { label: '削除', icon: 'delete', danger: true, onSelect: async () => {
      await flushPendingSave();
      if (await deletePromptFlow(view.promptId)) { view = null; navigate('/prompts'); }
    } },
  ]);
}
