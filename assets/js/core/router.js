/**
 * ハッシュベースの最小ルーター。
 * GitHub Pages のサブパス配信でもリロードで 404 にならない。
 *
 * ルートの追加は routes への 1 行追加で済む。
 */

const routes = [];
let notFound = null;
let current = null;
let onBefore = null;

/**
 * @param {string} pattern '#/prompts/:id' 形式（先頭の # は省略可）
 * @param {(ctx:{params:object, query:URLSearchParams, path:string}) => any} handler
 */
export function route(pattern, handler, meta = {}) {
  const clean = pattern.replace(/^#/, '');
  const keys = [];
  const regex = new RegExp(`^${clean
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/:([A-Za-z0-9_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })}$`);
  routes.push({ pattern: clean, regex, keys, handler, meta });
}

export const setNotFound = (handler) => { notFound = handler; };

/** 画面遷移の直前に呼ばれる。false を返すと遷移を中止できる（未保存確認など） */
export const setBeforeNavigate = (fn) => { onBefore = fn; };

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, queryString = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(queryString) };
}

export function navigate(to, { replace = false } = {}) {
  const target = to.startsWith('#') ? to : `#${to}`;
  if (location.hash === target) { resolve(); return; }
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
}

export const currentRoute = () => current;

export async function resolve() {
  const { path, query } = parseHash();
  const match = routes
    .map((r) => ({ r, m: r.regex.exec(path) }))
    .find((x) => x.m);

  if (onBefore && current && current.path !== path) {
    const ok = await onBefore(current, path);
    if (ok === false) return;
  }

  if (!match) {
    current = { path, query, params: {}, meta: {} };
    await notFound?.({ path, query, params: {} });
    return;
  }

  const params = {};
  match.r.keys.forEach((k, i) => { params[k] = decodeURIComponent(match.m[i + 1]); });
  current = { path, query, params, meta: match.r.meta, pattern: match.r.pattern };
  await match.r.handler({ params, query, path });
}

export function start() {
  window.addEventListener('hashchange', () => { resolve(); });
  return resolve();
}
