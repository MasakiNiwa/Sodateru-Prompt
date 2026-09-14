/** ヘルプ：使い方・ショートカット・バージョン情報・リポジトリへのリンク */

import { renderAppBar, renderFab } from '../ui/shell.js';
import { escapeHtml, icon } from '../core/util.js';
import { APP, CHANGELOG } from '../core/app-info.js';
import { SECTION_KINDS } from '../core/models.js';
import { FORMATS } from '../core/format.js';

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], desc: '検索パレットを開く（Mac は ⌘ + K）' },
  { keys: ['Ctrl', 'S'], desc: '編集中の内容をすぐ保存する' },
  { keys: ['Esc'], desc: 'ダイアログ・メニューを閉じる' },
  { keys: ['Ctrl', 'Enter'], desc: 'ダイアログの内容を確定する' },
];

const FAQ = [
  {
    q: 'データはどこに保存されますか？',
    a: 'お使いのブラウザの中（IndexedDB）だけです。サーバーへ送信されることはありません。'
      + 'そのため別の端末やブラウザとは共有されません。持ち運ぶときは設定ページからバックアップを書き出してください。',
  },
  {
    q: 'ブラウザのデータを消したら、どうなりますか？',
    a: 'すべて失われます。定期的に「設定 → データ → バックアップを書き出す」で JSON ファイルを保存しておいてください。'
      + 'そのファイルは同じ画面の「バックアップを読み込む」で戻せます。',
  },
  {
    q: '「版を保存」と自動保存の違いは？',
    a: '編集内容は入力するたび自動で保存されます（作業コピー）。'
      + '「版を保存」を押すと、その時点のスナップショットが履歴に積み上がり、あとから差分で比べたり復元したりできます。',
  },
  {
    q: '版を削除すると番号は詰まりますか？',
    a: '詰まりません。同じ番号が二度使われないよう、次の版は常に新しい番号になります。',
  },
  {
    q: 'オフラインでも使えますか？',
    a: '一度読み込めば、以降はオフラインでも動作します。ホーム画面に追加すればアプリのように起動できます。',
  },
];

export function render(main) {
  renderAppBar({ title: 'ヘルプ' });
  renderFab(null);

  main.innerHTML = `
    <section class="section-block">
      <div class="card card--flat">
        <div class="row">
          <span class="listitem__lead" style="background:var(--md-primary-container);color:var(--md-on-primary-container)">${icon('sprout')}</span>
          <div style="flex:1 1 auto;min-width:0">
            <h2>${escapeHtml(APP.name)}</h2>
            <p class="small muted" style="margin:2px 0 0">${escapeHtml(APP.tagline)}</p>
          </div>
        </div>
        <p class="small muted" style="margin:14px 0 0">
          プロンプトを体系的に保管するメモ帳です。ひとつの取り組みごとにプロンプトを作り、
          セクションに分けて構造化し、版を重ねて育て、差分で変化を追い、
          効いた部分を部品として再利用します。すべての処理はブラウザの中だけで完結します。
        </p>
      </div>
    </section>

    <section class="section-block">
      <h2>${icon('sprout')} はじめかた</h2>
      <ol class="help-list">
        <li><b>プロンプトを作る</b> — 右下のボタンから、取り組みの単位でプロンプトを作ります。</li>
        <li><b>セクションに分ける</b> — 「役割」「前提」「指示」「制約」などに分けて書きます。あとから一部分だけを差し替えられます。</li>
        <li><b>版を保存する</b> — 試した区切りで「この内容で版を保存」。変更メモを添えると後から追いやすくなります。</li>
        <li><b>差分を見る</b> — 差分タブで任意の 2 つの版を比べられます。作業コピーとの比較もできます。</li>
        <li><b>部品にする</b> — よく効いたセクションは「部品に」で再利用候補へ。別のプロンプトに挿入できます。</li>
        <li><b>出力する</b> — 出力タブから Markdown などの形式でコピー／ファイル保存できます。</li>
      </ol>
    </section>

    <section class="section-block">
      <h2>${icon('notes')} セクションの役割</h2>
      <p class="small muted">役割は出力時の見出しや XML タグ名にも使われます。</p>
      <div class="chips">
        ${SECTION_KINDS.map((k) => `<span class="chip chip--kind chip--static">${escapeHtml(k.label)}<span class="tiny" style="opacity:.7">&lt;${escapeHtml(k.tag)}&gt;</span></span>`).join('')}
      </div>
    </section>

    <section class="section-block">
      <h2>${icon('output')} 出力形式</h2>
      <div class="list">
        ${FORMATS.map((f) => `<div class="listitem" style="cursor:default">
          <span class="listitem__body">
            <span class="listitem__title">${escapeHtml(f.label)}</span>
            <span class="listitem__meta"><span>.${escapeHtml(f.ext)}</span><span>${escapeHtml(formatHint(f.id))}</span></span>
          </span></div>`).join('')}
      </div>
    </section>

    <section class="section-block">
      <h2>${icon('search')} キーボードショートカット</h2>
      <div class="list">
        ${SHORTCUTS.map((s) => `<div class="listitem" style="cursor:default">
          <span class="listitem__body">
            <span>${s.keys.map((k) => `<span class="kbd">${escapeHtml(k)}</span>`).join(' + ')}</span>
            <span class="listitem__meta"><span>${escapeHtml(s.desc)}</span></span>
          </span></div>`).join('')}
      </div>
    </section>

    <section class="section-block">
      <h2>${icon('help')} よくある質問</h2>
      <div class="stack">
        ${FAQ.map((f) => `<div class="card">
          <h3>${escapeHtml(f.q)}</h3>
          <p class="small muted" style="margin:8px 0 0">${escapeHtml(f.a)}</p>
        </div>`).join('')}
      </div>
    </section>

    <section class="section-block">
      <h2>${icon('github')} バージョン情報</h2>
      <div class="card card--flat" style="margin-bottom:12px">
        <div class="row">
          <div class="settings-row__text">
            <b>${escapeHtml(APP.name)}</b>
            <span class="small muted">バージョン ${escapeHtml(APP.version)}（${escapeHtml(APP.releasedAt)}）・${escapeHtml(APP.license)} ライセンス</span>
          </div>
        </div>
      </div>
      <div class="stack">
        <a class="linkrow" href="${escapeHtml(APP.repository)}" target="_blank" rel="noopener noreferrer">
          ${icon('github')}
          <span style="flex:1 1 auto;min-width:0">
            <b>GitHub リポジトリ</b>
            <span class="small muted" style="display:block;overflow:hidden;text-overflow:ellipsis">${escapeHtml(APP.repository)}</span>
          </span>
          ${icon('output', 'icon icon-sm')}
        </a>
        <a class="linkrow" href="${escapeHtml(APP.issues)}" target="_blank" rel="noopener noreferrer">
          ${icon('help')}
          <span style="flex:1 1 auto;min-width:0">
            <b>不具合の報告・要望</b>
            <span class="small muted" style="display:block">GitHub Issues へ</span>
          </span>
          ${icon('output', 'icon icon-sm')}
        </a>
      </div>
    </section>

    <section class="section-block">
      <h2>${icon('history')} 更新履歴</h2>
      <div class="stack">
        ${CHANGELOG.map((c) => `<div class="card">
          <div class="row">
            <span class="badge badge--v">v${escapeHtml(c.version)}</span>
            <span class="small muted">${escapeHtml(c.date)}</span>
          </div>
          <ul class="help-list small" style="margin-top:10px">
            ${c.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}
          </ul>
        </div>`).join('')}
      </div>
    </section>`;
}

function formatHint(id) {
  return {
    markdown: '見出し付き。ドキュメントとして読みやすい形',
    plain: '記号で区切ったシンプルなテキスト',
    xml: 'セクションを XML タグで囲む形',
    body: '本文だけを空行で連結',
    json: '構造をそのまま JSON に',
  }[id] ?? '';
}
