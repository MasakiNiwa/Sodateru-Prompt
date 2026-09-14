/** エントリポイント：初期化・ルーティング・グローバルキー操作 */

import * as store from './core/store.js';
import { route, setNotFound, setBeforeNavigate, start } from './core/router.js';
import { applyTheme, watchSystemTheme } from './core/theme.js';
import { renderNav, renderAppBar, renderFab, watchScroll } from './ui/shell.js';
import { openPalette } from './ui/palette.js';
import { toast, emptyState } from './ui/components.js';
import { APP } from './core/app-info.js';

import * as homeView from './views/home.js';
import * as promptsView from './views/prompts.js';
import * as promptDetailView from './views/prompt-detail.js';
import * as snippetsView from './views/snippets.js';
import * as settingsView from './views/settings.js';
import * as helpView from './views/help.js';

const main = () => document.getElementById('main');

/** 各画面の描画をラップし、共通処理（ナビ更新・スクロール位置）をまとめる */
function page(view) {
  return async (ctx) => {
    renderNav();
    renderFab(null);
    const el = main();
    el.innerHTML = '';
    await view.render(el, ctx);
    window.scrollTo({ top: 0 });
  };
}

route('/', page(homeView));
route('/prompts', page(promptsView));
route('/prompts/:id', page(promptDetailView));
route('/snippets', page(snippetsView));
route('/settings', page(settingsView));
route('/help', page(helpView));

setNotFound(() => {
  renderNav();
  renderFab(null);
  renderAppBar({ title: 'ページが見つかりません' });
  main().innerHTML = emptyState('help', 'ページが見つかりません',
    'URL が正しくないようです。',
    '<a class="btn" href="#/">ホームへ</a>');
});

// 画面を離れる前に、編集中の内容を確実に書き込む
setBeforeNavigate(async () => {
  await promptDetailView.flushPendingSave();
  document.querySelector('.menu')?.remove();
  return true;
});

/* ---------------- グローバルキー操作 ---------------- */

function bindShortcuts() {
  document.addEventListener('keydown', async (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
      return;
    }
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      await promptDetailView.flushPendingSave();
      toast('保存しました');
    }
  });
}

/** タブを閉じる・バックグラウンドへ回るときも取りこぼさない */
function bindLifecycle() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') promptDetailView.flushPendingSave();
  });
  window.addEventListener('pagehide', () => { promptDetailView.flushPendingSave(); });
}

/* ---------------- 起動 ---------------- */

function fatal(message, detail = '') {
  document.getElementById('main').innerHTML = `
    <div class="empty">
      <b>起動できませんでした</b>
      <p class="small">${message}</p>
      ${detail ? `<pre class="output-pre small" style="text-align:left">${detail}</pre>` : ''}
    </div>`;
}

async function boot() {
  try {
    await store.init();
  } catch (err) {
    console.error(err);
    fatal(
      'データベースを開けませんでした。プライベートブラウジングを使っている場合は、通常のウィンドウでお試しください。',
      String(err?.message ?? err),
    );
    return;
  }

  applyTheme();
  watchSystemTheme();
  renderNav();
  watchScroll();
  bindShortcuts();
  bindLifecycle();

  // 設定変更などでナビの見た目が変わることがあるので追従させる
  store.subscribe((reason) => { if (reason === 'settings') applyTheme(); });

  await start();
  registerServiceWorker();
  console.info(`${APP.name} v${APP.version}`);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url), { scope: './' })
    .catch((err) => console.warn('Service Worker の登録に失敗しました', err));
}

boot();
