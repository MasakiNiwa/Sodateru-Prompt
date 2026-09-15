/** 設定：表示・出力の既定値・フォルダ管理・データのバックアップ */

import * as store from '../core/store.js';
import { renderAppBar, renderFab } from '../ui/shell.js';
import {
  toast, dialog, confirmDialog, promptDialog, alertDialog,
} from '../ui/components.js';
import {
  escapeHtml, icon, download, pickFile, readFileAsText, moveItem,
} from '../core/util.js';
import { FORMATS } from '../core/format.js';
import { applyTheme } from '../core/theme.js';
import {
  exportBackupText, parseBackup, importBackup, backupFileName, wipeEverything,
} from '../core/backup.js';
import { APP } from '../core/app-info.js';

const THEMES = [
  { id: 'system', label: '端末に合わせる' },
  { id: 'light', label: 'ライト' },
  { id: 'dark', label: 'ダーク' },
];

const FONT_SIZES = [13, 14, 15, 16, 18];

const switchRow = (key, title, desc, checked) => `
  <div class="settings-row">
    <div class="settings-row__text"><b>${escapeHtml(title)}</b><span class="small muted">${escapeHtml(desc)}</span></div>
    <label class="switch">
      <input type="checkbox" data-set="${key}" ${checked ? 'checked' : ''}>
      <span class="switch__track"></span>
      <span class="sr-only">${escapeHtml(title)}</span>
    </label>
  </div>`;

export function render(main) {
  const draw = () => {
    const s = store.state.settings;
    const stats = store.stats();

    renderAppBar({ title: '設定' });
    renderFab(null);

    main.innerHTML = `
      <section class="section-block">
        <h2>${icon('light')} 表示</h2>

        <div class="settings-row">
          <div class="settings-row__text"><b>テーマ</b><span class="small muted">画面の明るさ</span></div>
          <div class="segmented" data-theme>
            ${THEMES.map((t) => `<button type="button" data-v="${t.id}" aria-pressed="${s.theme === t.id}">${escapeHtml(t.label)}</button>`).join('')}
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__text"><b>表示密度</b><span class="small muted">余白の広さ</span></div>
          <div class="segmented" data-density>
            <button type="button" data-v="comfortable" aria-pressed="${s.density === 'comfortable'}">標準</button>
            <button type="button" data-v="compact" aria-pressed="${s.density === 'compact'}">コンパクト</button>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__text"><b>エディタの文字サイズ</b><span class="small muted">セクション本文の大きさ</span></div>
          <select class="select" data-set="editorFontSize" style="width:auto">
            ${FONT_SIZES.map((n) => `<option value="${n}" ${Number(s.editorFontSize) === n ? 'selected' : ''}>${n}px</option>`).join('')}
          </select>
        </div>
      </section>

      <section class="section-block">
        <h2>${icon('output')} 出力</h2>
        <div class="settings-row">
          <div class="settings-row__text"><b>既定の出力形式</b><span class="small muted">出力タブを開いたときの形式</span></div>
          <select class="select" data-set="defaultExportFormat" style="width:auto">
            ${FORMATS.map((f) => `<option value="${f.id}" ${s.defaultExportFormat === f.id ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
          </select>
        </div>
        ${switchRow('includeDisabledSections', '無効なセクションも出力する', '出力から外したセクションを既定で含めます', s.includeDisabledSections)}
        ${switchRow('showSectionTitlesInPlain', 'プレーンテキストに見出しを付ける', '「■ セクション名」を本文の前に置きます', s.showSectionTitlesInPlain)}
      </section>

      <section class="section-block">
        <h2>${icon('folder')} フォルダ</h2>
        <div class="list" data-folders>
          ${store.state.folders.length ? store.state.folders.map((f, i) => `
            <div class="listitem" style="cursor:default">
              <span class="listitem__lead">${icon('folder')}</span>
              <span class="listitem__body">
                <span class="listitem__title">${escapeHtml(f.name)}</span>
                <span class="listitem__meta"><span>${store.state.prompts.filter((p) => p.folderId === f.id).length} 件のプロンプト</span></span>
              </span>
              <span class="listitem__actions">
                <button type="button" class="iconbtn iconbtn--sm" data-fup="${escapeHtml(f.id)}" ${i === 0 ? 'disabled' : ''} aria-label="上へ">${icon('up', 'icon icon-sm')}</button>
                <button type="button" class="iconbtn iconbtn--sm" data-fdown="${escapeHtml(f.id)}" ${i === store.state.folders.length - 1 ? 'disabled' : ''} aria-label="下へ">${icon('down', 'icon icon-sm')}</button>
                <button type="button" class="iconbtn iconbtn--sm" data-frename="${escapeHtml(f.id)}" aria-label="名前を変更">${icon('edit', 'icon icon-sm')}</button>
                <button type="button" class="iconbtn iconbtn--sm iconbtn--danger" data-fdel="${escapeHtml(f.id)}" aria-label="削除">${icon('delete', 'icon icon-sm')}</button>
              </span>
            </div>`).join('')
    : '<p class="small muted">フォルダはまだありません。</p>'}
        </div>
        <div class="row" style="margin-top:12px">
          <button type="button" class="btn btn--tonal btn--sm" data-addfolder>${icon('add', 'icon icon-sm')} フォルダを追加</button>
        </div>
        <p class="small muted" style="margin-top:8px">フォルダを削除しても、中のプロンプトは「未分類」に移動するだけで消えません。</p>
      </section>

      <section class="section-block">
        <h2>${icon('save')} データ</h2>
        <div class="card card--flat" style="margin-bottom:14px">
          <div class="statgrid">
            <div><div class="stat__n">${stats.prompts}</div><div class="stat__l">プロンプト</div></div>
            <div><div class="stat__n">${stats.versions}</div><div class="stat__l">版</div></div>
            <div><div class="stat__n">${stats.snippets}</div><div class="stat__l">部品</div></div>
            <div><div class="stat__n">${stats.chars.toLocaleString('ja-JP')}</div><div class="stat__l">総文字数</div></div>
          </div>
          <p class="small muted" style="margin:14px 0 0">
            データはこの端末のブラウザ内（IndexedDB）にのみ保存されます。外部へ送信されることはありません。
            ブラウザのデータを消すと失われるため、定期的にバックアップしてください。
          </p>
        </div>

        <div class="stack">
          <button type="button" class="btn btn--block" data-export>${icon('download')} バックアップを書き出す</button>
          <button type="button" class="btn btn--outlined btn--block" data-import>${icon('upload')} バックアップを読み込む</button>
          <button type="button" class="btn btn--text btn--block" data-wipe style="color:var(--md-error)">${icon('delete')} すべてのデータを削除</button>
        </div>
      </section>

      <section class="section-block">
        <h2>${icon('settings')} 動作</h2>
        ${switchRow('confirmDelete', '削除前に確認する', 'プロンプト・セクション・部品を削除するときに確認ダイアログを出します', s.confirmDelete)}
      </section>

      <p class="small muted" style="text-align:center">
        ${escapeHtml(APP.name)} v${escapeHtml(APP.version)}　·　<a href="#/help">ヘルプ</a>
      </p>`;

    bind(draw);
  };

  draw();
}

function bind(redraw) {
  const main = document.getElementById('main');

  main.querySelector('[data-theme]')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-v]');
    if (!btn) return;
    await store.updateSettings({ theme: btn.dataset.v });
    applyTheme();
    redraw();
  });

  main.querySelector('[data-density]')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-v]');
    if (!btn) return;
    await store.updateSettings({ density: btn.dataset.v });
    applyTheme();
    redraw();
  });

  main.querySelectorAll('[data-set]').forEach((el) => {
    el.addEventListener('change', async () => {
      const key = el.dataset.set;
      const value = el.type === 'checkbox' ? el.checked
        : (key === 'editorFontSize' ? Number(el.value) : el.value);
      await store.updateSettings({ [key]: value });
      applyTheme();
      toast('設定を保存しました');
    });
  });

  /* ---- フォルダ ---- */
  main.querySelector('[data-addfolder]')?.addEventListener('click', async () => {
    const name = await promptDialog('フォルダを追加', { label: 'フォルダ名', required: true, submitLabel: '追加' });
    if (name) { await store.addFolder(name); redraw(); }
  });

  main.querySelector('[data-folders]')?.addEventListener('click', async (e) => {
    const ids = store.state.folders.map((f) => f.id);

    const up = e.target.closest('[data-fup]');
    if (up) {
      const i = ids.indexOf(up.dataset.fup);
      await store.reorderFolders(moveItem(ids, i, i - 1));
      redraw();
      return;
    }
    const down = e.target.closest('[data-fdown]');
    if (down) {
      const i = ids.indexOf(down.dataset.fdown);
      await store.reorderFolders(moveItem(ids, i, i + 1));
      redraw();
      return;
    }
    const rename = e.target.closest('[data-frename]');
    if (rename) {
      const f = store.getFolder(rename.dataset.frename);
      const name = await promptDialog('フォルダ名を変更', { label: 'フォルダ名', value: f.name, required: true });
      if (name) { await store.saveFolder({ ...f, name }); redraw(); }
      return;
    }
    const delBtn = e.target.closest('[data-fdel]');
    if (delBtn) {
      const f = store.getFolder(delBtn.dataset.fdel);
      const n = store.state.prompts.filter((p) => p.folderId === f.id).length;
      const ok = await confirmDialog('フォルダを削除',
        `「${f.name}」を削除します。${n ? `\n中の ${n} 件のプロンプトは「未分類」へ移動します。` : ''}`,
        { submitLabel: '削除する', danger: true });
      if (ok) { await store.deleteFolder(f.id); toast('削除しました'); redraw(); }
    }
  });

  /* ---- バックアップ ---- */
  main.querySelector('[data-export]')?.addEventListener('click', async () => {
    try {
      const text = await exportBackupText();
      download(backupFileName(), text, 'application/json');
      toast('バックアップを書き出しました');
    } catch (err) {
      await alertDialog('書き出しに失敗しました', String(err?.message ?? err));
    }
  });

  main.querySelector('[data-import]')?.addEventListener('click', async () => {
    const file = await pickFile();
    if (!file) return;
    let backup;
    try {
      backup = parseBackup(await readFileAsText(file));
    } catch (err) {
      await alertDialog('読み込めませんでした', String(err?.message ?? err));
      return;
    }

    // counts は parseBackup が検証済みレコードから数えた値。ファイル中の値は使わない
    const c = backup.counts;
    const n = (v) => Number(v) || 0;
    const dropped = backup.dropped ?? {};
    const mode = await dialog({
      title: 'バックアップを読み込む',
      submitLabel: '読み込む',
      body: `
        <p class="small muted">${escapeHtml(file.name)}<br>
          書き出し日時: ${escapeHtml(backup.meta.exportedAt || '不明')}（v${escapeHtml(backup.meta.appVersion || '?')}）</p>
        <div class="card card--flat" style="margin:12px 0">
          <div class="statgrid">
            <div><div class="stat__n">${n(c.prompts)}</div><div class="stat__l">プロンプト</div></div>
            <div><div class="stat__n">${n(c.revisions)}</div><div class="stat__l">版</div></div>
            <div><div class="stat__n">${n(c.snippets)}</div><div class="stat__l">部品</div></div>
            <div><div class="stat__n">${n(c.folders)}</div><div class="stat__l">フォルダ</div></div>
          </div>
        </div>
        ${n(dropped.orphanRevisions) || n(dropped.duplicateRevisions) ? `<p class="small muted">
          取り込めない版を ${n(dropped.orphanRevisions) + n(dropped.duplicateRevisions)} 件除きました
          （元のプロンプトが無い、または番号が重複）。</p>` : ''}
        <div class="field">
          <span class="field__label">取り込み方</span>
          <label class="switch" style="align-items:flex-start">
            <input type="radio" name="mode" value="merge" checked style="position:static;opacity:1;width:auto;margin-top:6px">
            <span><b>マージ</b><br><span class="small muted">今あるデータを残し、同じ ID のものだけ上書きします。</span></span>
          </label>
          <label class="switch" style="align-items:flex-start">
            <input type="radio" name="mode" value="replace" style="position:static;opacity:1;width:auto;margin-top:6px">
            <span><b>置き換え</b><br><span class="small muted">今あるデータをすべて消してから取り込みます。</span></span>
          </label>
        </div>`,
      onSubmit: (root) => root.querySelector('input[name="mode"]:checked')?.value ?? 'merge',
    });
    if (!mode) return;

    if (mode === 'replace') {
      const ok = await confirmDialog('置き換えの確認',
        '現在のデータをすべて削除してから読み込みます。この操作は取り消せません。',
        { submitLabel: '置き換える', danger: true });
      if (!ok) return;
    }

    try {
      const result = await importBackup(backup, { mode });
      applyTheme();
      redraw();
      toast(`読み込みました（プロンプト ${result.prompts} / 版 ${result.revisions} / 部品 ${result.snippets}）`
        + (result.repaired ? `・版番号を ${result.repaired} 件直しました` : ''));
    } catch (err) {
      await alertDialog('読み込みに失敗しました', String(err?.message ?? err));
    }
  });

  main.querySelector('[data-wipe]')?.addEventListener('click', async () => {
    const ok = await confirmDialog('すべてのデータを削除',
      'プロンプト・版・部品・フォルダ・設定をすべて削除します。\nこの操作は取り消せません。先にバックアップを書き出すことをおすすめします。',
      { submitLabel: '削除する', danger: true });
    if (!ok) return;
    const typed = await promptDialog('最終確認', {
      label: '削除するには「削除」と入力してください',
      placeholder: '削除',
      submitLabel: '完全に削除',
    });
    if (typed !== '削除') { toast('削除を中止しました'); return; }
    await wipeEverything();
    applyTheme();
    redraw();
    toast('すべてのデータを削除しました');
  });
}
