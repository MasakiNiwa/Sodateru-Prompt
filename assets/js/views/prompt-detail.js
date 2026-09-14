/** プロンプト詳細：編集 / 履歴 / 差分 / 出力 */

import * as store from '../core/store.js';
import { navigate } from '../core/router.js';
import { renderAppBar, renderFab } from '../ui/shell.js';
import {
  toast, contextMenu, promptDialog, confirmDialog, emptyState, dialog,
} from '../ui/components.js';
import {
  escapeHtml, icon, relTime, formatDateTime, debounce, copyText, clone, download,
} from '../core/util.js';
import { createSection, kindLabel, statusLabel } from '../core/models.js';
import {
  LEVEL_LABELS, MAX_LEVEL, levelOf, normalizeLevels,
  moveUp, moveDown, moveSubtree, shiftLevel, subtreeRange, canIndent, canOutdent,
} from '../core/outline.js';
import { extractVariables, pruneValues } from '../core/variables.js';
import { renderSectionsDiff } from '../ui/diff-view.js';
import { renderPrompt, renderSection, FORMATS, getFormat, exportFileName } from '../core/format.js';
import {
  exportDialog, editPromptMetaFlow, deletePromptFlow,
  saveSectionAsSnippetFlow, insertSnippetFlow, KIND_OPTIONS, variableFieldsHtml,
} from './prompt-actions.js';

const TABS = [
  { id: 'edit', label: '編集', icon: 'edit' },
  { id: 'history', label: '履歴', icon: 'history' },
  { id: 'diff', label: '差分', icon: 'compare' },
  { id: 'output', label: '出力', icon: 'output' },
];

/**
 * 折りたたみとプレビューは「その端末での見え方」であって作品の中身ではないので、
 * プロンプトのデータには混ぜず localStorage に置く（版や差分を汚さないため）。
 */
const FOLD_KEY = (id) => `sodateru-prompt.folded.${id}`;
const PANE_KEY = 'sodateru-prompt.pane';

function loadFolded(promptId) {
  try {
    const raw = JSON.parse(localStorage.getItem(FOLD_KEY(promptId)) ?? '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function persistView() {
  try {
    localStorage.setItem(FOLD_KEY(view.promptId), JSON.stringify([...view.folded]));
    localStorage.setItem(`${PANE_KEY}.preview`, view.showPreview ? '1' : '0');
    localStorage.setItem(`${PANE_KEY}.outline`, view.showOutline ? '1' : '0');
  } catch { /* 保存できなくても表示は続けられる */ }
}

const loadPref = (name, fallback) => {
  try {
    const v = localStorage.getItem(`${PANE_KEY}.${name}`);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
};

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
    applyVars: true,
    folded: loadFolded(promptId),
    showPreview: loadPref('preview', false),
    showOutline: loadPref('outline', true),
    mode: 'write',          // 'write' か 'structure'。作業の区切りなので覚えない
    selectedId: null,
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

/** セクション配列を差し替えて保存予約する。レベルの飛びはここでならす */
function setSections(sections) {
  view.draft.sections = normalizeLevels(sections);
  markDirty();
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

/*
 * 編集画面の考え方（v0.4）
 *
 * ・普段は「書く」ことだけに集中できるよう、カードに常時出す操作を
 *   〈折りたたみ・見出し・メニュー〉の 3 つに絞る。
 * ・階層・役割・移動は、選んでいるセクションにだけ現れる。
 * ・並べ替えや階層の作り直しは「構造整理」モードへ分ける。
 * ・全体の把握はアウトライン（目次）に任せ、カードの横幅は階層によらず一定にする。
 */

const BODY_MIN_H = 48;    // 空でもこの高さは確保する
const BODY_MAX_H = 320;   // 本文の自動伸長の上限。これを超えたら中でスクロールさせる

const MODES = [
  { id: 'write', label: '書く', icon: 'edit' },
  { id: 'structure', label: '構造整理', icon: 'fold' },
];

const LEVEL_OPTIONS = (level) => LEVEL_LABELS
  .map((label, i) => `<option value="${i + 1}" ${i + 1 === level ? 'selected' : ''}>${escapeHtml(label)}</option>`)
  .join('');

/** 階層を示す細いガイド線。字下げの代わりにこれで深さを表す */
const levelRail = (level) => `<span class="secard__rail" aria-hidden="true">${'<i></i>'.repeat(level - 1)}</span>`;

const sectionLabel = (s) => s.title.trim() || kindLabel(s.kind);

/** 折りたたまれた見出しの配下を隠した、描画するセクションの添字一覧 */
function visibleIndexes(sections) {
  const out = [];
  let hideDeeperThan = null;
  sections.forEach((s, i) => {
    const lv = levelOf(s);
    if (hideDeeperThan !== null) {
      if (lv > hideDeeperThan) return;
      hideDeeperThan = null;
    }
    out.push(i);
    if (view.folded.has(s.id)) hideDeeperThan = lv;
  });
  return out;
}

/** すべて折りたためる状態か（1 つでも開いていれば「たたむ」） */
const anyExpanded = (sections) => sections.some((s) => !view.folded.has(s.id));

function previewText() {
  const settings = store.state.settings;
  return renderPrompt(view.draft, view.outputFormat, {
    includeDisabled: settings.includeDisabledSections,
    showTitles: settings.showSectionTitlesInPlain,
    variables: view.applyVars ? (view.draft.variables ?? {}) : {},
  });
}

const refreshPreview = debounce(() => {
  const el = document.querySelector('[data-preview]');
  if (el) el.textContent = previewText();
}, 200);

/* ---------------- セクションカード ---------------- */

/**
 * 選んだときだけ出る操作列。
 * 位置に応じた可否はここで確定するので、構造が変わったら再描画する。
 */
function sectionTools(s, i, sections) {
  const level = levelOf(s);
  return `
    <div class="secard__tools">
      <select class="secard__level" data-f="level" aria-label="見出しの階層" title="見出しの階層">${LEVEL_OPTIONS(level)}</select>
      <select class="secard__kind" data-f="kind" aria-label="役割" title="役割">${KIND_OPTIONS(s.kind)}</select>
      <span class="secard__tools-sep"></span>
      <button type="button" class="iconbtn iconbtn--sm" data-act="outdent"
        ${canOutdent(sections, i) ? '' : 'disabled'} aria-label="階層を上げる" title="階層を上げる (Ctrl+[)">${icon('outdent', 'icon icon-sm')}</button>
      <button type="button" class="iconbtn iconbtn--sm" data-act="indent"
        ${canIndent(sections, i) ? '' : 'disabled'} aria-label="階層を下げる" title="階層を下げる (Ctrl+])">${icon('indent', 'icon icon-sm')}</button>
      <button type="button" class="iconbtn iconbtn--sm" data-act="up" aria-label="上へ移動" title="上へ移動">${icon('up', 'icon icon-sm')}</button>
      <button type="button" class="iconbtn iconbtn--sm" data-act="down" aria-label="下へ移動" title="下へ移動">${icon('down', 'icon icon-sm')}</button>
      <span class="spacer"></span>
      <span class="tiny muted" data-chars>${s.body.length.toLocaleString('ja-JP')} 文字</span>
      <button type="button" class="btn btn--text btn--sm" data-act="focus">${icon('expand', 'icon icon-sm')} 全文を編集</button>
    </div>`;
}

function sectionCard(s, i, sections) {
  const level = levelOf(s);
  const childCount = subtreeRange(sections, i)[1] - i - 1;
  const folded = view.folded.has(s.id);
  const structure = view.mode === 'structure';
  const selected = view.selectedId === s.id;

  const head = `
    <header class="secard__head">
      ${structure ? `<button type="button" class="secard__drag" data-act="drag" draggable="true"
        aria-label="ドラッグして並び替え" title="ドラッグして並び替え">${icon('drag', 'icon icon-sm')}</button>` : ''}
      <button type="button" class="secard__fold" data-act="fold" aria-expanded="${!folded}"
        aria-label="${folded ? '広げる' : '折りたたむ'}" title="${folded ? '広げる' : '折りたたむ'}"
        >${icon(folded ? 'chev-right' : 'chev-down', 'icon icon-sm')}</button>
      ${levelRail(level)}
      <input class="secard__title" data-f="title" value="${escapeHtml(s.title)}"
        placeholder="${escapeHtml(kindLabel(s.kind))}" aria-label="見出し">
      ${childCount ? `<span class="tiny muted secard__count">${childCount}</span>` : ''}
      <button type="button" class="iconbtn iconbtn--sm" data-act="menu"
        aria-label="セクションのメニュー">${icon('more', 'icon icon-sm')}</button>
    </header>`;

  const classes = [
    'secard',
    s.enabled === false ? 'is-disabled' : '',
    folded ? 'is-folded' : '',
    selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  // たたんでいる／構造整理中は本文を出さず、1 行の抜粋だけ見せる
  if (folded || structure) {
    const peek = s.body.trim().replace(/\s+/g, ' ').slice(0, 120);
    return `
    <article class="${classes}" data-sec="${escapeHtml(s.id)}" data-level="${level}">
      ${head}
      <div class="secard__peek">
        <span>${peek ? escapeHtml(peek) : '（空）'}</span>
        <span class="spacer"></span>
        <span class="tiny">${s.body.length.toLocaleString('ja-JP')} 文字</span>
      </div>
      ${structure ? sectionTools(s, i, sections) : ''}
    </article>`;
  }

  return `
    <article class="${classes}" data-sec="${escapeHtml(s.id)}" data-level="${level}">
      ${head}
      <textarea class="secard__body" data-f="body" rows="2"
        placeholder="ここに書きます" aria-label="本文">${escapeHtml(s.body)}</textarea>
      ${sectionTools(s, i, sections)}
    </article>`;
}

/* ---------------- アウトライン（目次） ---------------- */

function outlineItems(sections) {
  if (!sections.length) return '<p class="tiny muted" style="padding:8px 12px">まだセクションがありません</p>';
  return `<ul class="outline__list">${sections.map((s) => `
    <li><button type="button" class="outline__item ${view.selectedId === s.id ? 'is-current' : ''}"
      data-goto="${escapeHtml(s.id)}" style="--d:${levelOf(s) - 1}" data-level="${levelOf(s)}">
      <span>${escapeHtml(sectionLabel(s))}</span>
      ${s.enabled === false ? `<span class="tiny muted">除外</span>` : ''}
    </button></li>`).join('')}</ul>`;
}

function outlinePanel(sections) {
  return `
    <nav class="outline" aria-label="アウトライン">
      <div class="outline__head">${icon('notes', 'icon icon-sm')} アウトライン</div>
      ${outlineItems(sections)}
      <button type="button" class="outline__add" data-act="add">${icon('add', 'icon icon-sm')} セクション</button>
    </nav>`;
}

/** 狭い画面ではアウトラインをダイアログで開く */
async function openOutlineDialog() {
  const chosen = await dialog({
    title: 'アウトライン',
    submitLabel: null,
    cancelLabel: '閉じる',
    body: `<div class="outline outline--dialog">${outlineItems(view.draft.sections)}</div>`,
    onMount(root, api) {
      root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-goto]');
        if (btn) api.close(btn.dataset.goto);
      });
    },
  });
  if (chosen) jumpToSection(chosen);
}

/** アウトラインから本文へ飛ぶ */
function jumpToSection(sectionId) {
  // 折りたたまれた親の中にいるなら、見えるところまで開く
  const sections = view.draft.sections;
  const idx = sections.findIndex((s) => s.id === sectionId);
  if (idx < 0) return;
  let changed = false;
  for (let i = idx - 1; i >= 0; i--) {
    if (levelOf(sections[i]) < levelOf(sections[idx]) && view.folded.has(sections[i].id)) {
      view.folded.delete(sections[i].id);
      changed = true;
    }
  }
  view.folded.delete(sectionId);
  view.selectedId = sectionId;
  persistView();
  if (changed) redrawPanel();
  else selectSection(sectionId);

  const card = document.querySelector(`[data-sec="${CSS.escape(sectionId)}"]`);
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card?.querySelector('[data-f="body"], [data-f="title"]')?.focus({ preventScroll: true });
}

/** 選択中のセクションを切り替える。再描画しないのでフォーカスを失わない */
function selectSection(sectionId) {
  if (view.selectedId === sectionId) return;
  view.selectedId = sectionId;
  document.querySelectorAll('.secard.is-selected').forEach((el) => el.classList.remove('is-selected'));
  document.querySelector(`[data-sec="${CSS.escape(sectionId)}"]`)?.classList.add('is-selected');
  document.querySelectorAll('.outline__item.is-current').forEach((el) => el.classList.remove('is-current'));
  document.querySelector(`.outline__item[data-goto="${CSS.escape(sectionId)}"]`)?.classList.add('is-current');
}

/* ---------------- 編集タブ全体 ---------------- */

function drawEditor(panel) {
  const p = view.draft;
  const shown = visibleIndexes(p.sections);
  const totalChars = p.sections.reduce((n, s) => n + s.body.length, 0);
  const foldAll = anyExpanded(p.sections);
  const structure = view.mode === 'structure';

  panel.innerHTML = `
    <div class="card card--flat editor-meta">
      <div class="row">
        <div style="flex:1 1 220px;min-width:0">
          <h2 style="font-size:1.1rem">${escapeHtml(p.title || '無題のプロンプト')}</h2>
          ${p.summary ? `<p class="small muted" style="margin:6px 0 0;white-space:pre-wrap">${escapeHtml(p.summary)}</p>` : ''}
        </div>
        <span class="small muted" data-dirty>保存済み</span>
        <button type="button" class="iconbtn" data-act="meta" aria-label="情報を編集">${icon('edit')}</button>
      </div>
    </div>

    ${variableBanner()}

    <div class="row editor-toolbar">
      <div class="segmented" data-mode>
        ${MODES.map((m) => `<button type="button" data-v="${m.id}" aria-pressed="${view.mode === m.id}"
          >${icon(m.icon, 'icon icon-sm')} ${escapeHtml(m.label)}</button>`).join('')}
      </div>
      <button type="button" class="chip editor-toolbar__outline" data-act="outline" aria-pressed="${view.showOutline}"
        >${icon('notes', 'icon icon-sm')} 目次</button>
      <button type="button" class="chip" data-act="preview" aria-pressed="${view.showPreview}"
        >${icon('eye', 'icon icon-sm')} プレビュー</button>
      ${structure ? `<button type="button" class="chip" data-act="foldall"
        >${icon(foldAll ? 'fold' : 'unfold', 'icon icon-sm')} ${foldAll ? 'すべてたたむ' : 'すべて広げる'}</button>` : ''}
      <span class="spacer"></span>
      <span class="tiny muted">${p.sections.length} セクション・${totalChars.toLocaleString('ja-JP')} 文字</span>
    </div>

    ${structure ? '<p class="tiny muted editor-hint">構造整理モードです。並べ替えと階層の変更に集中できます。本文を書くときは「書く」に戻してください。</p>' : ''}

    <div class="edit-layout ${view.showOutline ? 'has-outline' : ''} ${view.showPreview ? 'is-preview' : ''}">
      ${outlinePanel(p.sections)}

      <aside class="edit-preview">
        <div class="edit-preview__head">
          ${icon('eye', 'icon icon-sm')}
          <span>プレビュー</span>
          <span class="spacer"></span>
          <select class="select" data-previewfmt aria-label="プレビューの形式">
            ${FORMATS.map((f) => `<option value="${f.id}" ${f.id === view.outputFormat ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
          </select>
        </div>
        <pre class="edit-preview__body" data-preview></pre>
      </aside>

      <div class="edit-main">
        <div class="seceditor ${structure ? 'is-structure' : ''}" data-sections>
          ${shown.map((i) => sectionCard(p.sections[i], i, p.sections)).join('')}
        </div>

        ${p.sections.length ? '' : emptyState('notes', 'セクションがありません', '見出しを立てて、好きなだけ重ねていけます。')}

        <div class="row" style="margin-top:16px">
          <button type="button" class="btn btn--tonal" data-act="add">${icon('add')} セクション</button>
          <button type="button" class="btn btn--text" data-act="insert">${icon('insert')} 部品から挿入</button>
        </div>

        <hr class="divider">

        <div class="row">
          <button type="button" class="btn" data-act="commit">${icon('save')} この内容で版を保存</button>
          <span class="small muted">${view.revisions.length ? `直近: v${view.revisions[0].version}（${escapeHtml(relTime(view.revisions[0].createdAt))}）` : 'まだ版がありません'}</span>
        </div>
      </div>
    </div>`;

  bindEditor(panel);
}

function variableBanner() {
  const names = extractVariables(view.draft.sections);
  if (!names.length) return '';
  const values = view.draft.variables ?? {};
  const filled = names.filter((n) => values[n]).length;
  return `
    <div class="row editor-vars">
      <span class="tiny muted">${icon('tag', 'icon icon-sm')} 変数 ${filled} / ${names.length}</span>
      ${names.slice(0, 6).map((n) => `<span class="chip chip--static tiny" style="min-height:24px">${escapeHtml(`{{${n}}}`)}</span>`).join('')}
      <span class="spacer"></span>
      <button type="button" class="btn btn--text btn--sm" data-act="vars">値を入力</button>
    </div>`;
}

/** 本文の高さを中身に合わせる。長くなりすぎたら固定して中でスクロールさせる */
function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  const content = el.scrollHeight;
  el.style.height = `${Math.min(Math.max(content, BODY_MIN_H), BODY_MAX_H)}px`;
  el.style.overflowY = content > BODY_MAX_H ? 'auto' : 'hidden';
}

/** 末尾にセクションを足す。階層は直前のセクションを基準にする */
function appendSection(asChild = false) {
  const p = view.draft;
  const last = p.sections[p.sections.length - 1];
  const level = last ? Math.min(MAX_LEVEL, levelOf(last) + (asChild ? 1 : 0)) : 1;
  const section = createSection({ level });
  setSections([...p.sections, section]);
  view.selectedId = section.id;
  redrawPanel();
  document.querySelector(`[data-sec="${CSS.escape(section.id)}"] [data-f="title"]`)?.focus();
}

/** 長い本文を画面いっぱいで書くための集中エディタ */
async function focusEditFlow(sectionId) {
  const p = view.draft;
  const s = p.sections.find((x) => x.id === sectionId);
  if (!s) return;
  const result = await dialog({
    title: `全文を編集 — ${sectionLabel(s)}`,
    extraClass: 'focus',
    submitLabel: '反映',
    body: `
      <input class="input focus-title" data-f="title" value="${escapeHtml(s.title)}"
        placeholder="${escapeHtml(kindLabel(s.kind))}" aria-label="見出し">
      <textarea class="textarea focus-body" data-f="body" aria-label="本文">${escapeHtml(s.body)}</textarea>`,
    onMount(root) {
      const ta = root.querySelector('[data-f="body"]');
      setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 40);
    },
    onSubmit(root) {
      return {
        title: root.querySelector('[data-f="title"]').value,
        body: root.querySelector('[data-f="body"]').value,
      };
    },
  });
  if (!result) return;
  const i = p.sections.findIndex((x) => x.id === sectionId);
  p.sections[i] = { ...p.sections[i], ...result };
  markDirty();
  await flushPendingSave();
  redrawPanel();
}

function bindEditor(panel) {
  const p = view.draft;
  const indexOf = (id) => p.sections.findIndex((s) => s.id === id);

  panel.querySelectorAll('.secard__body').forEach(autoGrow);
  const previewEl = panel.querySelector('[data-preview]');
  if (previewEl) previewEl.textContent = previewText();

  panel.querySelector('[data-act="meta"]')?.addEventListener('click', async () => {
    await flushPendingSave();
    const saved = await editPromptMetaFlow(view.promptId);
    if (saved) { view.draft = clone(saved); drawShell(document.getElementById('main')); }
  });

  panel.querySelector('[data-act="vars"]')?.addEventListener('click', () => editVariablesFlow());

  panel.querySelector('[data-mode]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-v]');
    if (!btn || btn.dataset.v === view.mode) return;
    view.mode = btn.dataset.v;
    redrawPanel();
  });

  panel.querySelector('[data-act="outline"]')?.addEventListener('click', () => {
    // 狭い画面では貼り付ける場所がないので、ダイアログで開く
    if (window.matchMedia('(max-width: 1000px)').matches) { openOutlineDialog(); return; }
    view.showOutline = !view.showOutline;
    persistView();
    redrawPanel();
  });

  panel.querySelector('[data-act="preview"]')?.addEventListener('click', () => {
    view.showPreview = !view.showPreview;
    persistView();
    redrawPanel();
  });

  panel.querySelector('[data-act="foldall"]')?.addEventListener('click', () => {
    if (anyExpanded(p.sections)) p.sections.forEach((sec) => view.folded.add(sec.id));
    else view.folded.clear();
    persistView();
    redrawPanel();
  });

  panel.querySelector('[data-previewfmt]')?.addEventListener('change', (e) => {
    view.outputFormat = e.target.value;
    panel.querySelector('[data-preview]').textContent = previewText();
  });

  panel.querySelectorAll('[data-act="add"]').forEach((el) => el.addEventListener('click', () => appendSection()));

  panel.querySelector('[data-act="insert"]')?.addEventListener('click', async () => {
    const section = await insertSnippetFlow();
    if (!section) return;
    const last = p.sections[p.sections.length - 1];
    setSections([...p.sections, { ...section, level: last ? levelOf(last) : 1 }]);
    await flushPendingSave();
    redrawPanel();
    toast('部品を挿入しました');
  });

  panel.querySelector('[data-act="commit"]')?.addEventListener('click', () => commitFlow());

  panel.querySelector('.outline')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-goto]');
    if (btn) jumpToSection(btn.dataset.goto);
  });

  const list = panel.querySelector('[data-sections]');
  if (!list) return;

  // 触れたセクションを「選択中」にする。再描画しないのでフォーカスは保たれる
  list.addEventListener('focusin', (e) => {
    const card = e.target.closest('[data-sec]');
    if (card) selectSection(card.dataset.sec);
  });
  list.addEventListener('click', (e) => {
    const card = e.target.closest('[data-sec]');
    if (card) selectSection(card.dataset.sec);
  });

  // 入力: 再描画せずモデルだけ更新（フォーカスを保つ）
  list.addEventListener('input', (e) => {
    const card = e.target.closest('[data-sec]');
    const field = e.target.dataset.f;
    if (!card || !field || field === 'level' || field === 'kind') return;
    const s = p.sections[indexOf(card.dataset.sec)];
    if (!s) return;
    s[field] = e.target.value;
    if (field === 'body') {
      const chars = card.querySelector('[data-chars]');
      if (chars) chars.textContent = `${e.target.value.length.toLocaleString('ja-JP')} 文字`;
      autoGrow(e.target);
    }
    if (field === 'title') {
      const item = document.querySelector(`.outline__item[data-goto="${CSS.escape(s.id)}"] span`);
      if (item) item.textContent = sectionLabel(s);
    }
    markDirty();
    refreshPreview();
  });

  list.addEventListener('change', (e) => {
    const field = e.target.dataset.f;
    if (field !== 'kind' && field !== 'level') return;
    const card = e.target.closest('[data-sec]');
    const i = indexOf(card.dataset.sec);
    if (i < 0) return;
    if (field === 'kind') {
      p.sections[i] = { ...p.sections[i], kind: e.target.value };
      markDirty();
      redrawPanel();
      return;
    }
    // 階層は「今の値との差」をサブツリーごとに 1 段ずつ適用する
    const delta = Number(e.target.value) - levelOf(p.sections[i]);
    let next = p.sections;
    for (let n = 0; n < Math.abs(delta); n++) next = shiftLevel(next, i, Math.sign(delta));
    setSections(next);
    redrawPanel();
  });

  // 階層の増減はショートカットでも行える
  list.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || (e.key !== ']' && e.key !== '[')) return;
    const card = e.target.closest('[data-sec]');
    if (!card) return;
    e.preventDefault();
    const id = card.dataset.sec;
    const field = e.target.dataset.f ?? 'title';
    setSections(shiftLevel(p.sections, indexOf(id), e.key === ']' ? 1 : -1));
    redrawPanel();
    document.querySelector(`[data-sec="${CSS.escape(id)}"] [data-f="${field}"]`)?.focus();
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('[data-sec]');
    const id = card.dataset.sec;
    const idx = indexOf(id);
    const s = p.sections[idx];
    if (!s) return;

    switch (btn.dataset.act) {
      case 'fold':
        if (view.folded.has(id)) view.folded.delete(id);
        else view.folded.add(id);
        persistView();
        redrawPanel();
        break;
      case 'up': setSections(moveUp(p.sections, idx)); redrawPanel(); break;
      case 'down': setSections(moveDown(p.sections, idx)); redrawPanel(); break;
      case 'indent': setSections(shiftLevel(p.sections, idx, 1)); redrawPanel(); break;
      case 'outdent': setSections(shiftLevel(p.sections, idx, -1)); redrawPanel(); break;
      case 'focus': focusEditFlow(id); break;
      case 'menu': openSectionMenu(btn, id); break;
      default: break;
    }
  });

  bindDragAndDrop(list);
}

/**
 * ドラッグ＆ドロップ並び替え（配下ごと動く）。構造整理モードでのみ使える。
 * タッチ端末では発火しないため、↑↓ ボタンを常に併置してある。
 */
function bindDragAndDrop(list) {
  let dragId = null;

  const clearMarks = () => list.querySelectorAll('.is-dropbefore, .is-dropafter')
    .forEach((el) => el.classList.remove('is-dropbefore', 'is-dropafter'));

  // ドラッグできるのは「つまみ」だけ。カード自体は draggable にしないので、
  // 本文のテキスト選択を邪魔しない
  list.addEventListener('dragstart', (e) => {
    const handle = e.target.closest('[data-act="drag"]');
    const card = e.target.closest('[data-sec]');
    if (!handle || !card) { e.preventDefault(); return; }
    dragId = card.dataset.sec;
    card.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    e.dataTransfer.setDragImage?.(card, 20, 20);
  });

  list.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const over = e.target.closest('[data-sec]');
    clearMarks();
    if (!over || over.dataset.sec === dragId) return;
    const rect = over.getBoundingClientRect();
    over.classList.add(e.clientY < rect.top + rect.height / 2 ? 'is-dropbefore' : 'is-dropafter');
  });

  list.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const over = e.target.closest('[data-sec]');
    const sections = view.draft.sections;
    const from = sections.findIndex((s) => s.id === dragId);
    const droppedOn = dragId;
    clearMarks();
    dragId = null;
    if (!over || over.dataset.sec === droppedOn || from < 0) return;

    const overIndex = sections.findIndex((s) => s.id === over.dataset.sec);
    const rect = over.getBoundingClientRect();
    const after = e.clientY >= rect.top + rect.height / 2;
    // 後ろへ落とすときは、落とし先の配下をまたいだ位置に入れる
    const to = after ? subtreeRange(sections, overIndex)[1] : overIndex;

    setSections(moveSubtree(sections, from, to));
    redrawPanel();
  });

  list.addEventListener('dragend', () => {
    clearMarks();
    list.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
    dragId = null;
  });
}

function openSectionMenu(anchor, sectionId) {
  const p = view.draft;
  const idx = p.sections.findIndex((s) => s.id === sectionId);
  const s = p.sections[idx];
  if (!s) return;
  const [, end] = subtreeRange(p.sections, idx);
  const childCount = end - idx - 1;

  contextMenu(anchor, [
    { label: '全文を編集', icon: 'expand', onSelect: () => focusEditFlow(sectionId) },
    {
      label: 'この下に子セクションを追加',
      icon: 'indent',
      onSelect: () => {
        const child = createSection({ level: Math.min(MAX_LEVEL, levelOf(s) + 1) });
        view.folded.delete(sectionId);
        view.selectedId = child.id;
        persistView();
        setSections([...p.sections.slice(0, idx + 1), child, ...p.sections.slice(idx + 1)]);
        redrawPanel();
        document.querySelector(`[data-sec="${CSS.escape(child.id)}"] [data-f="title"]`)?.focus();
      },
    },
    { divider: true },
    {
      label: 'このセクションをコピー',
      icon: 'copy',
      onSelect: async () => {
        toast(await copyText(renderSection(s, view.outputFormat)) ? 'セクションをコピーしました' : 'コピーできませんでした');
      },
    },
    { label: '再利用候補に登録', icon: 'puzzle', onSelect: () => saveSectionAsSnippetFlow(s, view.promptId) },
    {
      label: childCount ? `複製（配下 ${childCount} 件ごと）` : '複製',
      icon: 'copy',
      onSelect: () => {
        const copies = p.sections.slice(idx, end)
          .map((x) => createSection({ title: x.title, body: x.body, kind: x.kind, level: x.level, enabled: x.enabled }));
        setSections([...p.sections.slice(0, end), ...copies, ...p.sections.slice(end)]);
        redrawPanel();
      },
    },
    {
      label: s.enabled === false ? '出力に含める' : '出力から外す',
      icon: s.enabled === false ? 'check' : 'close',
      onSelect: () => {
        p.sections[idx] = { ...s, enabled: s.enabled === false };
        markDirty();
        redrawPanel();
      },
    },
    { divider: true },
    {
      label: childCount ? `削除（配下 ${childCount} 件ごと）` : '削除',
      icon: 'delete',
      danger: true,
      onSelect: async () => {
        if (store.state.settings.confirmDelete) {
          const ok = await confirmDialog('セクションを削除',
            `「${sectionLabel(s)}」を削除します。${childCount ? `\n配下の ${childCount} 件もいっしょに削除されます。` : ''}`,
            { submitLabel: '削除する', danger: true });
          if (!ok) return;
        }
        p.sections.slice(idx, end).forEach((x) => view.folded.delete(x.id));
        persistView();
        setSections([...p.sections.slice(0, idx), ...p.sections.slice(end)]);
        redrawPanel();
      },
    },
  ]);
}

/* ---------------- 変数 ---------------- */

async function editVariablesFlow() {
  const names = extractVariables(view.draft.sections);
  if (!names.length) return;
  const values = await dialog({
    title: '変数の値',
    submitLabel: '保存',
    body: `<p class="small muted">出力するときに <code>{{変数名}}</code> の場所へ差し込まれます。
      空のままにすると、その変数は穴のまま残ります。</p>
      ${variableFieldsHtml(names, view.draft.variables ?? {})}`,
    onSubmit(root) {
      const out = {};
      root.querySelectorAll('[data-var]').forEach((el) => { out[el.dataset.var] = el.value; });
      return out;
    },
  });
  if (!values) return;
  view.draft.variables = pruneValues(values, names);
  markDirty();
  await flushPendingSave();
  redrawPanel();
  toast('変数の値を保存しました');
}

/* ---------------- 版の確定 ---------------- */

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
  view.diffTouched = false;
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
  const hasUnsaved = !store.sameSnapshot(latest, working);

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
      label: '作業コピーと比べる',
      icon: 'compare',
      onSelect: () => {
        view.diffLeft = revId;
        view.diffRight = 'working';
        view.diffTouched = true;
        view.tab = 'diff';
        drawShell(document.getElementById('main'));
      },
    },
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
        view.diffTouched = false;
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
  const unsaved = !store.sameSnapshot(latest, view.draft);
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

  // 比較先が作業コピーのときだけ、セクション単位で取り込める
  const restorable = view.diffRight === 'working';

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
      ${restorable ? '<p class="tiny muted" style="margin:10px 0 0">各ブロックの「戻す」で、そのセクションだけを比較元の状態に戻せます。</p>' : ''}
    </div>
    <div class="stack" data-diffout></div>`;

  const out = panel.querySelector('[data-diffout]');
  out.innerHTML = `
    <p class="small muted">${escapeHtml(sideLabel(view.diffLeft))} → ${escapeHtml(sideLabel(view.diffRight))}</p>
    ${renderSectionsDiff(sideSections(view.diffLeft), sideSections(view.diffRight), {
    showUnchanged: view.showUnchanged,
    restorable,
  })}`;

  panel.querySelector('[data-left]').addEventListener('change', (e) => {
    view.diffLeft = e.target.value; view.diffTouched = true; drawDiff(panel);
  });
  panel.querySelector('[data-right]').addEventListener('change', (e) => {
    view.diffRight = e.target.value; view.diffTouched = true; drawDiff(panel);
  });
  panel.querySelector('[data-unchanged]').addEventListener('click', () => {
    view.showUnchanged = !view.showUnchanged; drawDiff(panel);
  });
  panel.querySelector('[data-swap]').addEventListener('click', () => {
    if (view.diffRight === 'working') { toast('作業コピーは比較元にできません'); return; }
    [view.diffLeft, view.diffRight] = [view.diffRight, view.diffLeft];
    view.diffTouched = true;
    drawDiff(panel);
  });

  out.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-restore-sec]');
    if (btn) restoreSection(btn.dataset.restoreSec, panel);
  });
}

/** 1 つのセクションだけを比較元の状態へ戻す */
async function restoreSection(sectionId, panel) {
  const source = sideSections(view.diffLeft).find((s) => s.id === sectionId);
  const sections = view.draft.sections;
  const at = sections.findIndex((s) => s.id === sectionId);

  if (!source) {
    // 比較元に無い＝この版より後に足したセクション。取り除くのが「戻す」になる
    if (at < 0) return;
    const [start, end] = subtreeRange(sections, at);
    setSections([...sections.slice(0, start), ...sections.slice(end)]);
    toast('このセクションを取り除きました');
  } else if (at >= 0) {
    const next = sections.slice();
    next[at] = { ...clone(source), level: levelOf(sections[at]) };
    setSections(next);
    toast(`「${source.title || '無題'}」を ${sideLabel(view.diffLeft)} の内容に戻しました`);
  } else {
    // 比較元にあって作業コピーに無い＝削除済み。末尾に戻す
    setSections([...sections, clone(source)]);
    toast(`「${source.title || '無題'}」を戻しました`);
  }
  await flushPendingSave();
  drawDiff(panel);
}

/* ---------------- タブ: 出力 ---------------- */

function drawOutput(panel) {
  const settings = store.state.settings;
  const source = view.draft;
  const varNames = extractVariables(source.sections);

  const text = () => renderPrompt(source, view.outputFormat, {
    includeDisabled: settings.includeDisabledSections,
    showTitles: settings.showSectionTitlesInPlain,
    variables: view.applyVars ? (source.variables ?? {}) : {},
  });

  panel.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <div class="segmented" data-fmt>
        ${FORMATS.map((f) => `<button type="button" data-v="${f.id}" aria-pressed="${f.id === view.outputFormat}">${escapeHtml(f.label)}</button>`).join('')}
      </div>
    </div>

    ${varNames.length ? `
      <div class="card card--flat" style="margin-bottom:12px">
        <div class="row">
          <b class="small">${icon('tag', 'icon icon-sm')} 変数</b>
          <span class="spacer"></span>
          <label class="switch" style="padding:0">
            <input type="checkbox" data-applyvars ${view.applyVars ? 'checked' : ''}>
            <span class="switch__track"></span>
            <span class="small">値を差し込む</span>
          </label>
        </div>
        <div style="margin-top:12px" data-varfields>
          ${variableFieldsHtml(varNames, source.variables ?? {})}
        </div>
      </div>` : ''}

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

  panel.querySelector('[data-applyvars]')?.addEventListener('change', (e) => {
    view.applyVars = e.target.checked;
    draw();
  });

  panel.querySelector('[data-varfields]')?.addEventListener('input', (e) => {
    const field = e.target.closest('[data-var]');
    if (!field) return;
    source.variables = pruneValues(
      { ...(source.variables ?? {}), [field.dataset.var]: field.value },
      varNames,
    );
    markDirty();
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

  const hasVars = extractVariables(view.draft.sections).length > 0;
  contextMenu(el, [
    { label: '情報を編集', icon: 'edit', onSelect: async () => {
      await flushPendingSave();
      const saved = await editPromptMetaFlow(view.promptId);
      if (saved) { view.draft = clone(saved); drawShell(document.getElementById('main')); }
    } },
    ...(hasVars ? [{ label: '変数の値を入力', icon: 'tag', onSelect: () => editVariablesFlow() }] : []),
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
