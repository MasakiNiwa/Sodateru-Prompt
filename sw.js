/**
 * 育てるプロンプト — Service Worker
 *
 * ・アプリシェルは stale-while-revalidate（すぐ表示しつつ裏で更新）
 * ・CACHE_VERSION を上げると古いキャッシュは自動で捨てられる
 * ・ユーザーデータは IndexedDB にあり、ここでは一切扱わない
 */

const CACHE_VERSION = 'v0.3.0';
const CACHE_NAME = `sodateru-prompt-${CACHE_VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/style.css',
  './assets/icons/favicon.svg',
  './assets/js/main.js',
  './assets/js/core/app-info.js',
  './assets/js/core/backup.js',
  './assets/js/core/db.js',
  './assets/js/core/diff.js',
  './assets/js/core/format.js',
  './assets/js/core/models.js',
  './assets/js/core/outline.js',
  './assets/js/core/templates.js',
  './assets/js/core/variables.js',
  './assets/js/core/router.js',
  './assets/js/core/store.js',
  './assets/js/core/theme.js',
  './assets/js/core/util.js',
  './assets/js/ui/components.js',
  './assets/js/ui/diff-view.js',
  './assets/js/ui/palette.js',
  './assets/js/ui/shell.js',
  './assets/js/views/help.js',
  './assets/js/views/home.js',
  './assets/js/views/prompt-actions.js',
  './assets/js/views/prompt-detail.js',
  './assets/js/views/prompts.js',
  './assets/js/views/settings.js',
  './assets/js/views/snippets.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // 1 つでも失敗すると install ごと失敗するため、個別に握りつぶす
    await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith('sodateru-prompt-') && k !== CACHE_NAME)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // ナビゲーションは index.html を返す（ハッシュルーター用）
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('./index.html')) ?? Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then((response) => {
      if (response && response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    }).catch(() => null);
    return cached ?? (await network) ?? Response.error();
  })());
});
