/** ヘルプ：使い方・ショートカット・バージョン情報・リポジトリへのリンク */

import { renderAppBar, renderFab } from '../ui/shell.js';
import { escapeHtml, icon } from '../core/util.js';
import { APP, CHANGELOG } from '../core/app-info.js';
import { SECTION_KINDS } from '../core/models.js';
import { LEVEL_LABELS, LEVEL_MARKERS } from '../core/outline.js';
import { FORMATS } from '../core/format.js';

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], desc: '検索パレットを開く（Mac は ⌘ + K）' },
  { keys: ['Ctrl', ']'], desc: 'セクションの階層を 1 段下げる（編集中のセクション）' },
  { keys: ['Ctrl', 'Enter'], desc: '集中エディタの内容を反映する' },
  { keys: ['Ctrl', '['], desc: 'セクションの階層を 1 段上げる（編集中のセクション）' },
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
    q: '「自動保存済み」と「版を保存」は何が違いますか？',
    a: '書いた内容はこの端末のブラウザへ自動で保存されます（＝自動保存済み）。'
      + 'これは履歴には残りません。「この内容で版を保存」を押したときだけ、その時点が履歴に積まれ、'
      + 'あとから差分で比べたり戻したりできます。'
      + '最後の版から変わっている間は「未確定の変更あり」と表示されます。',
  },
  {
    q: '「保存できませんでした」と出たら',
    a: 'その変更はまだ端末に書き込めていません。画面を閉じずに、もう一度どこかを編集すると再び保存を試みます。'
      + 'ほかのタブで同じプロンプトを開いていると、上書きを避けるために保存を止めることがあります。'
      + 'その場合は知らせに従って読み込み直してください。',
  },
  {
    q: '版の「最新 v3（2 件）」とは？',
    a: 'v3 は最後に付けた番号、2 件はいま残っている版の数です。'
      + '版を削除しても番号は使い回さないので、この 2 つはずれることがあります。',
  },
  {
    q: 'ブラウザのデータを消したら、どうなりますか？',
    a: 'すべて失われます。定期的に「設定 → データ → バックアップを書き出す」で JSON ファイルを保存しておいてください。'
      + 'そのファイルは同じ画面の「バックアップを読み込む」で戻せます。',
  },
  {
    q: 'セクションはいくつでも足せますか？',
    a: '上限はありません。「セクションを追加」で同じ階層に、「下の階層に追加」で 1 段深い位置に足せます。'
      + '見出しの文言も自由に付けられるので、役割の分類にとらわれず、好きな見出しを好きなだけ重ねられます。',
  },
  {
    q: 'セクションの操作ボタンが見当たりません',
    a: '編集タブは普段「読む画面」です。全セクションが出来上がりに近い姿で並び、操作の部品は出ていません。'
      + '書きたいセクションをクリックすると、そこだけが編集カードに変わり、階層・役割・移動・全文編集が現れます。'
      + 'コピーや部品化、複製、削除は ⋮ メニューにあります。',
  },
  {
    q: '全文をそのまま読みたい',
    a: 'どのセクションも選んでいない状態が、そのまま全文プレビューです。'
      + '編集中に Esc を押すか、セクションの外側をクリックすると、その状態に戻ります。',
  },
  {
    q: '並べ替えや階層づくりをまとめてやりたい',
    a: '編集タブの「構造整理」に切り替えてください。本文が引っ込んで 1 行ずつの表示になり、'
      + 'ドラッグのつまみと階層の操作が常に出ます。書くときは「書く」に戻します。',
  },
  {
    q: '長いセクションが書きにくい',
    a: '本文は一定の高さで止まり、それ以上は中でスクロールします。'
      + 'じっくり書くときは「全文を編集」を押すと、画面いっぱいの集中エディタが開きます。',
  },
  {
    q: '目的のセクションへすぐ移りたい',
    a: '「目次」を使ってください。広い画面では左側に固定表示され、狭い画面ではボタンから開きます。'
      + '項目を押すとその見出しへ飛び、折りたたまれていれば自動で開きます。',
  },
  {
    q: '書きながら全体を確認できますか？',
    a: '編集タブの「プレビュー」を押すと、出来上がりのテキストが表示されます。'
      + '広い画面では編集欄の右側に貼り付いて、書くそばから更新されます。狭い画面では編集欄の上に出ます。',
  },
  {
    q: 'セクションを折りたためますか？',
    a: '見出しの左の ▾ で折りたためます。配下のセクションもいっしょにたたまれます。'
      + '「構造整理」モードなら「すべてたたむ」でいっぺんにたためます。'
      + 'たたんだ状態はこの端末に覚えられるだけで、版や差分には影響しません。',
  },
  {
    q: '階層は出力にどう反映されますか？',
    a: 'Markdown では見出しの深さ（##, ###, ####…）に、XML タグではタグの入れ子に、'
      + 'プレーンテキストでは行頭記号に反映されます。「本文のみ」では見出しは出ません。',
  },
  {
    q: '変数プレースホルダとは？',
    a: '本文に {{変数名}} と書いておくと、出力するときにその場所へ値を差し込めます。'
      + '値はプロンプトごとに保存されるので、毎回入れ直す必要はありません。空のままなら穴の形のまま出力されます。',
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
        <li><b>セクションに分ける</b> — 見出しを立てて書きます。自由に名前を付けられ、見出しの下に見出しを重ねることもできます。</li>
        <li><b>構成を整える</b> — 「構造整理」に切り替えると、並べ替えと階層づくりに集中できます。</li>
        <li><b>版を保存する</b> — 試した区切りで「この内容で版を保存」。変更メモを添えると後から追いやすくなります。</li>
        <li><b>差分を見る</b> — 差分タブで任意の 2 つの版を比べられます。作業コピーとの比較もできます。</li>
        <li><b>部品にする</b> — よく効いたセクションは「部品に」で再利用候補へ。別のプロンプトに挿入できます。</li>
        <li><b>全体を確かめる</b> — 「プレビュー」で出来上がりを見ながら書けます。見出しは ▾ で折りたためます。</li>
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
      <h2>${icon('indent')} セクションの階層</h2>
      <p class="small muted">
        セクションは見出しのように重ねられます。階層を変えると、配下のセクションもいっしょに動きます。
        深くできるのは「直前のセクションの 1 段下」までです。
      </p>
      <div class="list">
        ${LEVEL_LABELS.map((label, i) => `<div class="listitem"
          style="cursor:default;margin-left:${i * 18}px;width:auto">
          <span class="listitem__body">
            <span class="listitem__title">${escapeHtml(label)}</span>
            <span class="listitem__meta">
              <span>Markdown: ${escapeHtml('#'.repeat(i + 2))}</span>
              <span>プレーンテキスト: ${escapeHtml(LEVEL_MARKERS[i])}</span>
            </span>
          </span></div>`).join('')}
      </div>
      <div class="list" style="margin-top:12px">
        <div class="listitem" style="cursor:default"><span class="listitem__body">
          <span class="listitem__title">左端の線で深さが分かります</span>
          <span class="listitem__meta">
            <span>大見出し: 太い実線</span><span>中見出し: 細い実線</span>
            <span>小見出し: 二重線</span><span>細目: 点線</span>
          </span></span></div>
      </div>
      <p class="small muted" style="margin-top:12px">
        階層は字下げではなく、左端の線と見出しの前のガイド線（本数＝深さ−1）と文字の大きさで表しています。
        どれだけ深くしても本文の幅は変わりません。全体の形は「目次」で確かめられます。
      </p>
      <p class="small muted">
        並べ替えは「構造整理」モードで行います。つまみ（${escapeHtml('⠿')}）をドラッグするか、
        スマートフォンでは ↑ ↓ ボタンをお使いください。配下のセクションもいっしょに動きます。
      </p>
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
