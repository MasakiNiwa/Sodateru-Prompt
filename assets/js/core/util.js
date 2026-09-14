/** 汎用ユーティリティ */

const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 時系列でソート可能な一意 ID（ULID 風） */
export function uid() {
  let ts = Date.now();
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = ID_ALPHABET[ts % 32] + time;
    ts = Math.floor(ts / 32);
  }
  const rnd = crypto.getRandomValues(new Uint8Array(10));
  let tail = '';
  for (const b of rnd) tail += ID_ALPHABET[b % 32];
  return time + tail;
}

export const now = () => Date.now();

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** タグ付きテンプレートで安全に HTML を組み立てる（配列は連結、他はエスケープ） */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out += (Array.isArray(v) ? v.join('') : escapeHtml(v)) + strings[i + 1];
  }
  return out;
}

/** エスケープせずに埋め込む印 */
export const raw = (s) => [String(s ?? '')];

export function icon(name, cls = 'icon') {
  return `<svg class="${escapeHtml(cls)}" aria-hidden="true"><use href="#i-${escapeHtml(name)}"></use></svg>`;
}

export function debounce(fn, ms = 300) {
  let t;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => clearTimeout(t);
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

const DTF_DATE = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
const DTF_FULL = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

export const formatDate = (ms) => DTF_DATE.format(new Date(ms));
export const formatDateTime = (ms) => DTF_FULL.format(new Date(ms));

/** 「3分前」のような相対表現。7日以上前は日付表示 */
export function relTime(ms) {
  const d = Date.now() - ms;
  if (d < 60000) return 'たった今';
  if (d < 3600000) return `${Math.floor(d / 60000)}分前`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}時間前`;
  if (d < 604800000) return `${Math.floor(d / 86400000)}日前`;
  return formatDate(ms);
}

/** ファイル名に使えない文字を落とす */
export function safeFileName(s, fallback = 'prompt') {
  const cleaned = String(s ?? '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\p{Cc}]/gu, '')
    .trim()
    .slice(0, 60);
  return cleaned || fallback;
}

export function download(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 非セキュアコンテキスト等。下のフォールバックへ */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

export const readFileAsText = (file) => file.text();

/** 文字数を人間向けに */
export function charCount(n) {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** 配列内で要素を移動した新しい配列を返す */
export function moveItem(arr, from, to) {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export const clone = (v) => (typeof structuredClone === 'function'
  ? structuredClone(v)
  : JSON.parse(JSON.stringify(v)));

/** 検索用の正規化（大文字小文字・全角半角を吸収） */
export function normalize(s) {
  return String(s ?? '').toLowerCase().normalize('NFKC');
}

/** タグ文字列 "a, b" を配列へ */
export function parseTags(s) {
  return [...new Set(
    String(s ?? '')
      .split(/[,、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean),
  )].slice(0, 20);
}
