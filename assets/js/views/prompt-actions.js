/** プロンプト／部品に関する共通アクション（複数の画面から呼ばれる） */

import * as store from '../core/store.js';
import { navigate } from '../core/router.js';
import { dialog, confirmDialog, toast } from '../ui/components.js';
import { escapeHtml, parseTags, copyText, download, icon } from '../core/util.js';
import { FORMATS, renderPrompt, exportFileName, getFormat } from '../core/format.js';
import { SECTION_KINDS, createSection } from '../core/models.js';
import { TEMPLATES, getTemplate } from '../core/templates.js';
import { extractVariables, pruneValues } from '../core/variables.js';

const folderOptions = (selected) => [
  `<option value="" ${!selected ? 'selected' : ''}>未分類</option>`,
  ...store.state.folders.map((f) => `<option value="${escapeHtml(f.id)}" ${f.id === selected ? 'selected' : ''}>${escapeHtml(f.name)}</option>`),
].join('');

/** 新規プロンプト作成ダイアログ。作成後は詳細画面へ */
export async function newPromptFlow(defaults = {}) {
  const result = await dialog({
    title: '新しいプロンプト',
    submitLabel: '作成',
    body: `
      <label class="field">
        <span class="field__label">タイトル</span>
        <input class="input" data-f="title" placeholder="例: 議事録を要約する" autofocus>
      </label>
      <label class="field">
        <span class="field__label">目的・概要（任意）</span>
        <input class="input" data-f="summary" placeholder="何のための取り組みか">
      </label>
      <div class="field">
        <span class="field__label">ひな形</span>
        <select class="select" data-f="template">
          ${TEMPLATES.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('')}
        </select>
        <p class="tiny muted" data-tpl-desc style="margin:6px 0 0"></p>
      </div>
      <div class="row">
        <label class="field" style="flex:1 1 160px">
          <span class="field__label">フォルダ</span>
          <select class="select" data-f="folder">${folderOptions(defaults.folderId ?? null)}</select>
        </label>
        <label class="field" style="flex:1 1 160px">
          <span class="field__label">タグ（カンマ区切り・任意）</span>
          <input class="input" data-f="tags" placeholder="要約, 業務">
        </label>
      </div>`,
    onMount(root) {
      const select = root.querySelector('[data-f="template"]');
      const desc = root.querySelector('[data-tpl-desc]');
      const sync = () => { desc.textContent = getTemplate(select.value).description; };
      select.addEventListener('change', sync);
      sync();
    },
    onSubmit(root) {
      const get = (f) => root.querySelector(`[data-f="${f}"]`).value;
      return {
        title: get('title').trim(),
        summary: get('summary').trim(),
        templateId: get('template'),
        folderId: get('folder') || null,
        tags: parseTags(get('tags')),
      };
    },
  });
  if (!result) return null;

  const { templateId, ...meta } = result;
  const prompt = await store.addPrompt({
    ...meta,
    title: meta.title || '無題のプロンプト',
    sections: getTemplate(templateId).sections.map((s) => createSection(s)),
  });
  navigate(`/prompts/${prompt.id}`);
  return prompt;
}

/**
 * 変数の値を入力するフォームの HTML。
 * 入力要素には data-var="変数名" が付く。
 */
export function variableFieldsHtml(names, values = {}) {
  if (!names.length) return '<p class="small muted">この内容に変数はありません。</p>';
  return names.map((name) => `
    <label class="field" style="margin-bottom:10px">
      <span class="field__label">${escapeHtml(`{{${name}}}`)}</span>
      <textarea class="textarea" data-var="${escapeHtml(name)}" rows="2"
        style="min-height:52px" placeholder="値を入力（空なら穴のまま）">${escapeHtml(values[name] ?? '')}</textarea>
    </label>`).join('');
}

/** プロンプトのメタ情報（タイトル・概要・フォルダ・タグ・状態）を編集 */
export async function editPromptMetaFlow(promptId) {
  const p = store.getPrompt(promptId);
  if (!p) return null;
  const result = await dialog({
    title: 'プロンプトの情報',
    submitLabel: '保存',
    body: `
      <label class="field">
        <span class="field__label">タイトル</span>
        <input class="input" data-f="title" value="${escapeHtml(p.title)}" autofocus>
      </label>
      <label class="field">
        <span class="field__label">目的・概要</span>
        <textarea class="textarea" data-f="summary" style="min-height:80px;font-family:var(--font)">${escapeHtml(p.summary)}</textarea>
      </label>
      <label class="field">
        <span class="field__label">フォルダ</span>
        <select class="select" data-f="folder">${folderOptions(p.folderId)}</select>
      </label>
      <label class="field">
        <span class="field__label">タグ（カンマ区切り）</span>
        <input class="input" data-f="tags" value="${escapeHtml((p.tags ?? []).join(', '))}">
      </label>
      <label class="field">
        <span class="field__label">状態</span>
        <select class="select" data-f="status">
          <option value="draft" ${p.status === 'draft' ? 'selected' : ''}>下書き</option>
          <option value="active" ${p.status === 'active' ? 'selected' : ''}>運用中</option>
          <option value="archived" ${p.status === 'archived' ? 'selected' : ''}>アーカイブ</option>
        </select>
      </label>`,
    onSubmit(root) {
      const get = (f) => root.querySelector(`[data-f="${f}"]`).value;
      return {
        title: get('title').trim() || '無題のプロンプト',
        summary: get('summary').trim(),
        folderId: get('folder') || null,
        tags: parseTags(get('tags')),
        status: get('status'),
      };
    },
  });
  if (!result) return null;
  const saved = await store.savePrompt({ ...store.getPrompt(promptId), ...result });
  toast('保存しました');
  return saved;
}

export async function deletePromptFlow(promptId) {
  const p = store.getPrompt(promptId);
  if (!p) return false;
  if (store.state.settings.confirmDelete) {
    const ok = await confirmDialog(
      'プロンプトを削除',
      `「${p.title || '無題のプロンプト'}」と、保存された ${p.revisionCount ?? 0} 件の版をすべて削除します。\nこの操作は取り消せません。`,
      { submitLabel: '削除する', danger: true },
    );
    if (!ok) return false;
  }
  await store.deletePrompt(promptId);
  toast('削除しました');
  return true;
}

/* ---------------- 出力 ---------------- */

/**
 * 出力ダイアログ。プロンプト本体でも、版のスナップショットでも使える。
 * @param {object} source prompt 互換のオブジェクト
 * @param {{titleSuffix?:string}} opts
 */
export async function exportDialog(source, opts = {}) {
  const settings = store.state.settings;
  let format = settings.defaultExportFormat ?? 'markdown';
  let includeDisabled = Boolean(settings.includeDisabledSections);
  const varNames = extractVariables(source.sections ?? []);
  const varValues = pruneValues({ ...(source.variables ?? {}) }, varNames);

  await dialog({
    title: `出力${opts.titleSuffix ?? ''}`,
    submitLabel: null,
    cancelLabel: '閉じる',
    body: `
      <div class="row" style="margin-bottom:12px">
        <div class="segmented" data-fmt>
          ${FORMATS.map((f) => `<button type="button" data-v="${f.id}" aria-pressed="${f.id === format}">${escapeHtml(f.label)}</button>`).join('')}
        </div>
      </div>
      <label class="switch" style="margin-bottom:12px">
        <input type="checkbox" data-f="disabled" ${includeDisabled ? 'checked' : ''}>
        <span class="switch__track"></span>
        <span class="small">無効なセクションも含める</span>
      </label>
      ${varNames.length ? `<details style="margin-bottom:12px">
        <summary class="small" style="cursor:pointer">変数 ${varNames.length} 個に値を差し込む</summary>
        <div style="margin-top:10px" data-varfields>${variableFieldsHtml(varNames, varValues)}</div>
      </details>` : ''}
      <pre class="output-pre" data-out></pre>
      <div class="row" style="margin-top:12px">
        <button type="button" class="btn btn--tonal" data-act="copy">${icon('copy')} コピー</button>
        <button type="button" class="btn btn--outlined" data-act="download">${icon('download')} ファイル保存</button>
        <span class="spacer"></span>
        <span class="small muted" data-count></span>
      </div>`,
    onMount(root) {
      const out = root.querySelector('[data-out]');
      const countEl = root.querySelector('[data-count]');
      const draw = () => {
        const text = renderPrompt(source, format, {
          includeDisabled,
          showTitles: settings.showSectionTitlesInPlain,
          variables: varValues,
        });
        out.textContent = text;
        countEl.textContent = `${text.length.toLocaleString('ja-JP')} 文字`;
      };
      root.querySelector('[data-fmt]').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-v]');
        if (!btn) return;
        format = btn.dataset.v;
        root.querySelectorAll('[data-fmt] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === format)));
        draw();
      });
      root.querySelector('[data-f="disabled"]').addEventListener('change', (e) => {
        includeDisabled = e.target.checked;
        draw();
      });
      root.querySelector('[data-varfields]')?.addEventListener('input', (e) => {
        const field = e.target.closest('[data-var]');
        if (!field) return;
        varValues[field.dataset.var] = field.value;
        draw();
      });
      root.querySelector('[data-act="copy"]').addEventListener('click', async () => {
        toast(await copyText(out.textContent) ? 'コピーしました' : 'コピーできませんでした');
      });
      root.querySelector('[data-act="download"]').addEventListener('click', () => {
        const fmt = getFormat(format);
        download(exportFileName(source, format), out.textContent, fmt.mime);
        toast('ファイルを保存しました');
      });
      draw();
    },
  });
}

/* ---------------- 部品（再利用候補） ---------------- */

/** セクションを再利用候補として登録 */
export async function saveSectionAsSnippetFlow(section, promptId) {
  const result = await dialog({
    title: '再利用候補に登録',
    submitLabel: '登録',
    body: `
      <label class="field">
        <span class="field__label">部品名</span>
        <input class="input" data-f="title" value="${escapeHtml(section.title || '')}" placeholder="例: 出力はJSONのみ" autofocus>
      </label>
      <label class="field">
        <span class="field__label">タグ（カンマ区切り・任意）</span>
        <input class="input" data-f="tags" placeholder="制約, 共通">
      </label>
      <label class="field">
        <span class="field__label">本文</span>
        <textarea class="textarea" data-f="body">${escapeHtml(section.body)}</textarea>
      </label>`,
    onSubmit(root) {
      const get = (f) => root.querySelector(`[data-f="${f}"]`).value;
      const body = get('body').trim();
      if (!body) return undefined;
      return { title: get('title').trim() || '無題の部品', tags: parseTags(get('tags')), body };
    },
  });
  if (!result) return null;
  await store.addSnippet({ ...result, kind: section.kind, sourcePromptId: promptId ?? null });
  toast('部品として登録しました', { action: '部品一覧', onAction: () => navigate('/snippets') });
  return true;
}

/**
 * 部品を選んでセクションとして挿入する。
 * @returns {Promise<object|null>} 追加されたセクション
 */
export async function insertSnippetFlow() {
  const snippets = [...store.state.snippets]
    .sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0) || b.updatedAt - a.updatedAt);

  if (!snippets.length) {
    await dialog({
      title: '部品がありません',
      body: '<p class="small muted">セクションのメニューから「再利用候補に登録」すると、ここから呼び出せるようになります。</p>',
      submitLabel: null,
      cancelLabel: '閉じる',
    });
    return null;
  }

  const chosenId = await dialog({
    title: '部品を挿入',
    submitLabel: null,
    cancelLabel: '閉じる',
    body: `
      <div class="searchbar" style="margin-bottom:12px">
        ${icon('search', 'icon icon-sm')}<input type="search" data-f="q" placeholder="部品を絞り込む" autofocus>
      </div>
      <div class="list" data-list style="max-height:46vh;overflow:auto"></div>`,
    onMount(root, api) {
      const list = root.querySelector('[data-list]');
      const draw = (q = '') => {
        const nq = q.trim().toLowerCase();
        const hits = snippets.filter((s) => !nq
          || `${s.title} ${s.body} ${(s.tags ?? []).join(' ')}`.toLowerCase().includes(nq));
        list.innerHTML = hits.length ? hits.map((s) => `
          <button type="button" class="listitem" data-id="${escapeHtml(s.id)}">
            <span class="listitem__body">
              <span class="listitem__title">${escapeHtml(s.title || '無題の部品')}</span>
              <span class="listitem__snippet">${escapeHtml(s.body)}</span>
              <span class="listitem__meta">
                ${(s.tags ?? []).map((t) => `<span>#${escapeHtml(t)}</span>`).join('')}
                ${s.useCount ? `<span>${s.useCount} 回使用</span>` : ''}
              </span>
            </span>
          </button>`).join('')
          : '<p class="muted small" style="text-align:center;padding:20px">一致する部品がありません</p>';
      };
      root.querySelector('[data-f="q"]').addEventListener('input', (e) => draw(e.target.value));
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-id]');
        if (btn) api.close(btn.dataset.id);
      });
      draw();
    },
  });

  if (!chosenId) return null;
  const snippet = store.getSnippet(chosenId);
  if (!snippet) return null;
  await store.bumpSnippetUse(snippet.id);
  return createSection({ title: snippet.title, body: snippet.body, kind: snippet.kind });
}

export const KIND_OPTIONS = (selected) => SECTION_KINDS
  .map((k) => `<option value="${k.id}" ${k.id === selected ? 'selected' : ''}>${escapeHtml(k.label)}</option>`)
  .join('');
