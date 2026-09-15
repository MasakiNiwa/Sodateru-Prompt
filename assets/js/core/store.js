/**
 * アプリ状態とデータ操作の窓口。
 *
 * ・フォルダ／プロンプト／部品はメモリ上にキャッシュし、変更のたびに IndexedDB へ書き込む
 *   （件数が数千規模までなら十分速く、検索・集計を同期的に書ける）
 * ・版（revisions）は量が増えるためキャッシュせず、必要なときだけ読み出す
 */

import * as db from './db.js';
import {
  createFolder, createPrompt, createRevision, createSnippet,
  normalizeSettings, DEFAULT_SETTINGS,
} from './models.js';
import { now, clone, normalize } from './util.js';

const listeners = new Set();

/**
 * 同じブラウザの別タブへ変更を知らせる。
 * IndexedDB には変更通知がないので、これが無いと古いタブが新しい内容を
 * 上書きしてしまう。届かなくても savePrompt の競合検知が最後の砦になる。
 */
const channel = (() => {
  try { return new BroadcastChannel('sodateru-prompt'); } catch { return null; }
})();

const broadcast = (reason, id) => {
  try { channel?.postMessage({ reason, id, at: Date.now() }); } catch { /* 無視してよい */ }
};

if (channel) {
  channel.onmessage = async () => {
    // 何が変わったか細かく追わず、キャッシュを取り直して画面に知らせる
    await reloadCache();
    emit('external');
  };
}

export const state = {
  ready: false,
  folders: [],
  prompts: [],
  snippets: [],
  settings: { ...DEFAULT_SETTINGS },
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(reason = 'change') {
  for (const fn of [...listeners]) {
    try { fn(reason); } catch (err) { console.error('[store] listener error', err); }
  }
}

/* ---------------- 初期化 ---------------- */

export async function init() {
  const [folders, prompts, snippets, settingsRec] = await Promise.all([
    db.getAll(db.STORES.folders),
    db.getAll(db.STORES.prompts),
    db.getAll(db.STORES.snippets),
    db.get(db.STORES.meta, 'settings'),
  ]);
  state.folders = folders.sort((a, b) => a.order - b.order);
  state.prompts = prompts;
  state.snippets = snippets;
  state.settings = normalizeSettings(settingsRec?.value);
  state.ready = true;
  emit('init');
}

/** 画面の状態を保ったまま、メモリ上のキャッシュだけ取り直す */
async function reloadCache() {
  const [folders, prompts, snippets] = await Promise.all([
    db.getAll(db.STORES.folders),
    db.getAll(db.STORES.prompts),
    db.getAll(db.STORES.snippets),
  ]);
  state.folders = folders.sort((a, b) => a.order - b.order);
  state.prompts = prompts;
  state.snippets = snippets;
}

/** バックアップ復元後などにキャッシュを取り直す */
export async function reload() {
  state.ready = false;
  await init();
}

/* ---------------- 設定 ---------------- */

export async function updateSettings(patch) {
  state.settings = normalizeSettings({ ...state.settings, ...patch });
  await db.put(db.STORES.meta, { key: 'settings', value: state.settings });
  emit('settings');
  return state.settings;
}

/* ---------------- フォルダ ---------------- */

export const getFolder = (id) => state.folders.find((f) => f.id === id) ?? null;
export const folderName = (id) => getFolder(id)?.name ?? '未分類';

export async function addFolder(name) {
  const folder = createFolder({ name: String(name ?? '').trim() || '新しいフォルダ' });
  await db.put(db.STORES.folders, folder);
  state.folders = [...state.folders, folder].sort((a, b) => a.order - b.order);
  emit('folders');
  return folder;
}

export async function saveFolder(folder) {
  const next = { ...folder, updatedAt: now() };
  await db.put(db.STORES.folders, next);
  state.folders = state.folders.map((f) => (f.id === next.id ? next : f)).sort((a, b) => a.order - b.order);
  emit('folders');
  return next;
}

/** フォルダを削除。中のプロンプトは未分類へ移す（データは失わせない） */
export async function deleteFolder(id) {
  await db.del(db.STORES.folders, id);
  state.folders = state.folders.filter((f) => f.id !== id);
  const affected = state.prompts.filter((p) => p.folderId === id);
  if (affected.length) {
    const moved = affected.map((p) => ({ ...p, folderId: null, updatedAt: now() }));
    await db.putMany(db.STORES.prompts, moved);
    const byId = new Map(moved.map((p) => [p.id, p]));
    state.prompts = state.prompts.map((p) => byId.get(p.id) ?? p);
  }
  emit('folders');
}

export async function reorderFolders(orderedIds) {
  const t = now();
  const updated = orderedIds
    .map((id, i) => {
      const f = getFolder(id);
      return f ? { ...f, order: t + i, updatedAt: t } : null;
    })
    .filter(Boolean);
  await db.putMany(db.STORES.folders, updated);
  const byId = new Map(updated.map((f) => [f.id, f]));
  state.folders = state.folders.map((f) => byId.get(f.id) ?? f).sort((a, b) => a.order - b.order);
  emit('folders');
}

/* ---------------- プロンプト ---------------- */

/**
 * 版に含まれる「その時点のプロンプトの中身」。
 * 復元と未確定判定で同じ定義を使い、取りこぼしが出ないようにする。
 */
export const snapshotOf = (source) => ({
  title: source.title ?? '',
  summary: source.summary ?? '',
  tags: clone(source.tags ?? []),
  sections: clone(source.sections ?? []),
  variables: clone(source.variables ?? {}),
});

/** 2 つのスナップショットが同じ内容か */
export const sameSnapshot = (a, b) => JSON.stringify(snapshotOf(a)) === JSON.stringify(snapshotOf(b));

export const getPrompt = (id) => state.prompts.find((p) => p.id === id) ?? null;

export async function addPrompt(patch = {}) {
  const prompt = createPrompt(patch);
  await db.put(db.STORES.prompts, prompt);
  state.prompts = [...state.prompts, prompt];
  emit('prompts');
  return prompt;
}

/**
 * @param {{touch?:boolean, expectUnchanged?:boolean}} opts
 *   expectUnchanged: 他のタブが先に書き込んでいたら上書きせず例外にする。
 *   自動保存のように「古い内容で上書きしてしまう」ことが致命的な場面で使う。
 */
export async function savePrompt(prompt, { touch = true, expectUnchanged = false } = {}) {
  if (expectUnchanged) {
    const current = await db.get(db.STORES.prompts, prompt.id);
    if (current && Number.isFinite(prompt.updatedAt) && current.updatedAt > prompt.updatedAt) {
      const err = new Error('ほかのタブでこのプロンプトが更新されています。');
      err.code = 'conflict';
      err.current = current;
      throw err;
    }
  }
  const next = { ...prompt, updatedAt: touch ? now() : prompt.updatedAt };
  await db.put(db.STORES.prompts, next);
  state.prompts = state.prompts.map((p) => (p.id === next.id ? next : p));
  emit('prompts');
  broadcast('prompts', next.id);
  return next;
}

/** プロンプト本体とその全ての版を削除 */
export async function deletePrompt(id) {
  await db.deleteByIndex(db.STORES.revisions, 'promptId', IDBKeyRange.only(id));
  await db.del(db.STORES.prompts, id);
  state.prompts = state.prompts.filter((p) => p.id !== id);
  emit('prompts');
}

/**
 * プロンプトを丸ごと複製する（変数の値も引き継ぐ）。
 * @param {{keepVariables?:boolean}} opts 変数の値を空にしたいときは false
 */
export async function duplicatePrompt(id, { keepVariables = true } = {}) {
  const src = getPrompt(id);
  if (!src) return null;
  return addPrompt({
    ...snapshotOf(src),
    title: `${src.title || '無題'} のコピー`,
    variables: keepVariables ? clone(src.variables ?? {}) : {},
    folderId: src.folderId,
    status: 'draft',
    revisionCount: 0,
  });
}

/* ---------------- 版（リビジョン） ---------------- */

export async function listRevisions(promptId) {
  const revs = await db.getAllByIndex(db.STORES.revisions, 'promptId', IDBKeyRange.only(promptId));
  return revs.sort((a, b) => b.version - a.version);
}

export const getRevision = (id) => db.get(db.STORES.revisions, id);

/** そのプロンプトが次に使うべき版番号。既存の履歴より必ず大きくする */
async function nextVersionFor(prompt) {
  const revs = await db.getAllByIndex(db.STORES.revisions, 'promptId', IDBKeyRange.only(prompt.id));
  const highest = revs.reduce((m, r) => Math.max(m, r.version ?? 0), 0);
  return Math.max(prompt.lastVersion ?? 0, prompt.revisionCount ?? 0, highest) + 1;
}

/** 現在の作業コピーを版として確定する */
export async function commitRevision(promptId, message) {
  const prompt = getPrompt(promptId);
  if (!prompt) throw new Error('プロンプトが見つかりません');
  const version = await nextVersionFor(prompt);
  const rev = createRevision(prompt, message, version);
  const nextPrompt = {
    ...prompt,
    lastVersion: version,
    revisionCount: (prompt.revisionCount ?? 0) + 1,
    status: prompt.status === 'draft' ? 'active' : prompt.status,
    updatedAt: now(),
  };
  // 履歴の追加とプロンプト側の更新は、まとめて成功／失敗させる
  await db.commitRevisionTx(rev, nextPrompt);
  state.prompts = state.prompts.map((p) => (p.id === nextPrompt.id ? nextPrompt : p));
  emit('revisions');
  broadcast('revisions', promptId);
  return rev;
}

/** 版の変更メモだけを書き換える（スナップショット本体は不変に保つ） */
export async function saveRevisionMessage(revId, message) {
  const rev = await getRevision(revId);
  if (!rev) return null;
  const next = { ...rev, message: String(message ?? '') };
  await db.put(db.STORES.revisions, next);
  emit('revisions');
  return next;
}

export async function deleteRevision(revId, promptId) {
  const prompt = getPrompt(promptId);
  if (!prompt) {
    await db.del(db.STORES.revisions, revId);
    emit('revisions');
    return promptId;
  }
  // 残数は減らすが lastVersion は減らさない（同じ番号を二度使わないため）
  const next = {
    ...prompt,
    revisionCount: Math.max(0, (prompt.revisionCount ?? 0) - 1),
    updatedAt: now(),
  };
  await db.deleteRevisionTx(revId, next);
  state.prompts = state.prompts.map((p) => (p.id === next.id ? next : p));
  emit('revisions');
  broadcast('revisions', promptId);
  return promptId;
}

/**
 * 履歴の実態に合わせて、残数と採番カウンタを直す。
 * 古いバックアップをマージしたあとなど、両者がずれうる場面で呼ぶ。
 * @returns {number} 直したプロンプトの数
 */
export async function reconcileRevisionCounters(promptIds = null) {
  const targets = promptIds
    ? state.prompts.filter((p) => promptIds.includes(p.id))
    : state.prompts;
  const fixed = [];
  for (const prompt of targets) {
    // eslint-disable-next-line no-await-in-loop
    const revs = await db.getAllByIndex(db.STORES.revisions, 'promptId', IDBKeyRange.only(prompt.id));
    const highest = revs.reduce((m, r) => Math.max(m, r.version ?? 0), 0);
    const lastVersion = Math.max(prompt.lastVersion ?? 0, prompt.revisionCount ?? 0, highest);
    if (revs.length !== prompt.revisionCount || lastVersion !== prompt.lastVersion) {
      fixed.push({ ...prompt, revisionCount: revs.length, lastVersion });
    }
  }
  if (fixed.length) {
    await db.putMany(db.STORES.prompts, fixed);
    const byId = new Map(fixed.map((p) => [p.id, p]));
    state.prompts = state.prompts.map((p) => byId.get(p.id) ?? p);
    emit('prompts');
  }
  return fixed.length;
}

/** 過去の版の内容を作業コピーへ復元する */
export async function restoreRevision(promptId, revId) {
  const [prompt, rev] = [getPrompt(promptId), await getRevision(revId)];
  if (!prompt || !rev) throw new Error('復元元が見つかりません');
  return savePrompt({ ...prompt, ...snapshotOf(rev) });
}

/* ---------------- 部品（再利用候補） ---------------- */

export const getSnippet = (id) => state.snippets.find((s) => s.id === id) ?? null;

export async function addSnippet(patch = {}) {
  const snippet = createSnippet(patch);
  await db.put(db.STORES.snippets, snippet);
  state.snippets = [...state.snippets, snippet];
  emit('snippets');
  return snippet;
}

export async function saveSnippet(snippet) {
  const next = { ...snippet, updatedAt: now() };
  await db.put(db.STORES.snippets, next);
  state.snippets = state.snippets.map((s) => (s.id === next.id ? next : s));
  emit('snippets');
  return next;
}

export async function deleteSnippet(id) {
  await db.del(db.STORES.snippets, id);
  state.snippets = state.snippets.filter((s) => s.id !== id);
  emit('snippets');
}

export async function bumpSnippetUse(id) {
  const s = getSnippet(id);
  if (!s) return null;
  return saveSnippet({ ...s, useCount: (s.useCount ?? 0) + 1 });
}

/* ---------------- 検索・集計 ---------------- */

export const promptText = (p) => [
  p.title, p.summary, (p.tags ?? []).join(' '),
  ...(p.sections ?? []).map((s) => `${s.title} ${s.body}`),
].join('\n');

/**
 * プロンプトを絞り込む。
 * folderId は undefined ですべて、null で未分類のみ。
 * アーカイブは既定で隠れるが、検索語があるときは対象に含める。
 * @param {{query?:string, folderId?:string|null, tag?:string|null, status?:string|null,
 *          includeArchived?:boolean, starredOnly?:boolean, sort?:string}} opts
 */
export function queryPrompts(opts = {}) {
  const {
    query = '', folderId = undefined, tag = null, status = null,
    includeArchived = false, starredOnly = false, sort = 'updated',
  } = opts;
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const hideArchived = !includeArchived && !status && !terms.length;

  let list = state.prompts.filter((p) => {
    if (folderId !== undefined && p.folderId !== folderId) return false;
    if (tag && !(p.tags ?? []).includes(tag)) return false;
    if (status && p.status !== status) return false;
    if (hideArchived && p.status === 'archived') return false;
    if (starredOnly && !p.starred) return false;
    if (terms.length) {
      const hay = normalize(promptText(p));
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });

  const collator = new Intl.Collator('ja');
  const sorters = {
    updated: (a, b) => b.updatedAt - a.updatedAt,
    created: (a, b) => b.createdAt - a.createdAt,
    title: (a, b) => collator.compare(a.title || '', b.title || ''),
    versions: (a, b) => (b.revisionCount ?? 0) - (a.revisionCount ?? 0),
  };
  list = list.sort(sorters[sort] ?? sorters.updated);
  // お気に入りは常に先頭へ
  return [...list.filter((p) => p.starred), ...list.filter((p) => !p.starred)];
}

export function allTags() {
  const counts = new Map();
  for (const p of state.prompts) {
    for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .map(([tag, count]) => ({ tag, count }));
}

export function stats() {
  const sections = state.prompts.reduce((n, p) => n + (p.sections?.length ?? 0), 0);
  const versions = state.prompts.reduce((n, p) => n + (p.revisionCount ?? 0), 0);
  const chars = state.prompts.reduce(
    (n, p) => n + (p.sections ?? []).reduce((m, s) => m + s.body.length, 0), 0,
  );
  return {
    prompts: state.prompts.length,
    folders: state.folders.length,
    snippets: state.snippets.length,
    sections,
    versions,
    chars,
  };
}
